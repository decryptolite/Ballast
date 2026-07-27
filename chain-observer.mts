/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Ballast — Task 2: Chain Observer.
//
// Standalone, read-only process. Runs independently of the payment flow
// (does not import lib/x402.ts and never touches verification_events).
// Each cycle captures two raw signals for the seller and appends one row
// to chain_observations:
//   1. Circle Gateway's offchain "available" balance (POST /v1/balances).
//   2. Any onchain USDC Transfer to the seller's address on Arc Testnet
//      (the seller's own eventual withdrawal mint — see DECISIONS.md #008).
// This script computes no state and reaches no conclusion — see
// DECISIONS.md #003/#011. Task 3 (inference engine) reads this table; it
// does not write to it.

import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbiItem } from "viem";
import { arcTestnet } from "viem/chains";

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const GATEWAY_API = "https://gateway-api-testnet.circle.com";
// Circle's Gateway domain id for Arc Testnet — see GATEWAY_DOMAINS.arcTestnet
// in @circle-fin/x402-batching. Not a chain ID; Circle's own balances API
// namespace for cross-chain balance lookups.
const ARC_GATEWAY_DOMAIN = 26;

const sellerAddress = process.env.SELLER_ADDRESS as `0x${string}` | undefined;
if (!sellerAddress) {
  console.error(
    "Missing SELLER_ADDRESS. Run `npm run generate-wallets` first.",
  );
  process.exit(1);
}

// No private key of any kind is read by this script — it only ever reads
// public balance/log data for a known public address.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC, { timeout: 30_000 }),
});

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

// How far back to look for onchain transfers on the very first cycle only.
// After that, each cycle picks up exactly where the previous one left off
// (lastCheckedBlock + 1), so no block is ever scanned twice or skipped
// while this process keeps running. A restart re-arms this initial lookback
// — acceptable for a Task 2 evidence feed; Task 3's inference engine is what
// would need gap-detection, not this poller.
const LOOKBACK_BLOCKS = BigInt(
  process.env.CHAIN_OBSERVER_LOOKBACK_BLOCKS ?? 200,
);
const POLL_INTERVAL_MS = Number(
  process.env.CHAIN_OBSERVER_INTERVAL_MS ?? 20_000,
);

let lastCheckedBlock: bigint | null = null;

// Transitional guard: `pending_batch` is added by migration
// 20260725000000_add_pending_batch.sql. Probe for it once at startup so this
// observer keeps recording evidence against a database where that migration
// has not been applied yet, rather than failing every insert with "column
// does not exist". The value is written into `raw` either way, so no
// observation is lost while the column is missing. This probe can be deleted
// once the migration is applied everywhere the observer runs.
let pendingBatchColumnAvailable = false;

async function probePendingBatchColumn() {
  const { error } = await supabase
    .from("chain_observations")
    .select("pending_batch")
    .limit(1);
  pendingBatchColumnAvailable = !error;
  if (!pendingBatchColumnAvailable) {
    console.warn(
      "[chain-observer] pending_batch column not found — recording it in `raw` only. " +
        "Apply supabase/migrations/20260725000000_add_pending_batch.sql to populate the column.",
    );
  }
}

async function fetchGatewayBalance() {
  const response = await fetch(`${GATEWAY_API}/v1/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "USDC",
      sources: [{ depositor: sellerAddress, domain: ARC_GATEWAY_DOMAIN }],
    }),
  });
  const data = await response.json();
  return { status: response.status, data };
}

async function checkOnchainTransfers() {
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock =
    lastCheckedBlock === null
      ? currentBlock > LOOKBACK_BLOCKS
        ? currentBlock - LOOKBACK_BLOCKS
        : 0n
      : lastCheckedBlock + 1n;

  if (fromBlock > currentBlock) {
    return {
      logs: [] as Array<Record<string, string>>,
      scannedRange: { from: fromBlock.toString(), to: currentBlock.toString() },
    };
  }

  const logs = await publicClient.getLogs({
    address: ARC_TESTNET_USDC,
    event: transferEvent,
    args: { to: sellerAddress },
    fromBlock,
    toBlock: currentBlock,
  });

  lastCheckedBlock = currentBlock;

  return {
    logs: logs.map((log) => ({
      txHash: log.transactionHash,
      block: log.blockNumber.toString(),
      from: log.args.from ?? "",
      value: log.args.value?.toString() ?? "",
    })),
    scannedRange: { from: fromBlock.toString(), to: currentBlock.toString() },
  };
}

async function pollOnce() {
  const observedAt = new Date().toISOString();

  const [balanceResult, onchainResult] = await Promise.all([
    fetchGatewayBalance().catch((err) => ({ error: (err as Error).message })),
    checkOnchainTransfers().catch((err) => ({
      error: (err as Error).message,
    })),
  ]);

  // Only trust fields Circle's response actually contains this cycle — do
  // not invent a value for a field that isn't present (per CLAUDE.md working
  // rule). Observed shape as of this writing is {balance, pendingBatch} with
  // no "withdrawable" key; if that ever changes, this picks it up honestly.
  let gatewayAvailable: number | null = null;
  let gatewayWithdrawable: number | null = null;
  let pendingBatch: number | null = null;
  if ("data" in balanceResult) {
    const entry = balanceResult.data?.balances?.[0];
    if (entry) {
      gatewayAvailable =
        entry.balance !== undefined ? Number(entry.balance) : null;
      gatewayWithdrawable =
        entry.withdrawable !== undefined ? Number(entry.withdrawable) : null;
      pendingBatch =
        entry.pendingBatch !== undefined ? Number(entry.pendingBatch) : null;
    }
  }

  const transfers = "logs" in onchainResult ? onchainResult.logs : [];
  const latestTransfer =
    transfers.length > 0 ? transfers[transfers.length - 1] : null;

  const row = {
    gateway_available: gatewayAvailable,
    gateway_withdrawable: gatewayWithdrawable,
    ...(pendingBatchColumnAvailable ? { pending_batch: pendingBatch } : {}),
    onchain_tx: latestTransfer?.txHash ?? null,
    block: latestTransfer ? Number(latestTransfer.block) : null,
    raw: {
      observedAt,
      sellerAddress,
      gatewayBalanceResponse: balanceResult,
      onchainScan: onchainResult,
    },
  };

  const { error } = await supabase.from("chain_observations").insert(row);
  if (error) {
    console.error(`[chain-observer] insert failed:`, error.message);
    return;
  }

  console.log(
    `[chain-observer] ${observedAt} available=${gatewayAvailable ?? "null"} ` +
      `pendingBatch=${pendingBatch ?? "null"} ` +
      `withdrawable=${gatewayWithdrawable ?? "null"} ` +
      `onchain_tx=${row.onchain_tx ?? "none"}`,
  );
}

const once = process.argv.includes("--once");

await probePendingBatchColumn();

if (once) {
  await pollOnce();
  process.exit(0);
} else {
  console.log(
    `[chain-observer] polling every ${POLL_INTERVAL_MS}ms for seller ${sellerAddress}`,
  );
  await pollOnce();
  setInterval(() => {
    pollOnce().catch((err) =>
      console.error("[chain-observer] cycle threw:", (err as Error).message),
    );
  }, POLL_INTERVAL_MS);
}
