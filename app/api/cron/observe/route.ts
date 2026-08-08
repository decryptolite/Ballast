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

// Ballast — chain observer, one cycle, triggered over HTTP.
//
// This exists so the observer can run in production without a laptop being
// on. Vercel Hobby's cron is once-per-day, which is far too coarse for a
// signal (`pendingBatch`) that rises and clears within minutes, so an
// external scheduler calls this route instead.
//
// It performs EXACTLY the cycle `chain-observer.mts --once` performs. That
// script is deliberately untouched and remains the local-development path.
//
// On statelessness: `--once` runs a single cycle in a fresh process, where
// the script's `lastCheckedBlock` is null and it therefore scans back
// LOOKBACK_BLOCKS. A stateless HTTP invocation is exactly that same
// situation, so using the lookback window here mirrors the script's real
// behaviour rather than reinterpreting it.
//
// NOTE ON DUPLICATION: the observation logic below is a copy of the
// script's, not a shared import. Genuine reuse would mean extracting a
// module that both call, which would require editing chain-observer.mts —
// explicitly out of scope for this change. The duplication is therefore
// deliberate and constrained, but it is real: a future change to the
// observation cycle must be made in BOTH places. Recorded in DECISIONS.md.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbiItem } from "viem";
import { arcTestnet } from "viem/chains";
import { timingSafeEqual } from "node:crypto";

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";
const GATEWAY_API = "https://gateway-api-testnet.circle.com";
/** Circle's Gateway domain id for Arc Testnet — not a chain id. */
const ARC_GATEWAY_DOMAIN = 26;

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

/** Constant-time comparison, so a caller cannot discover the secret by
 *  measuring how long a rejection takes. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function runOneObservation() {
  // Clients are constructed here, inside the handler's call path and after
  // the request has been read — never at module scope. A top-level
  // createClient() breaks the Vercel build, and constructing one before
  // request data is read breaks prerendering (DECISIONS.md #044/#045).
  const sellerAddress = process.env.SELLER_ADDRESS as `0x${string}` | undefined;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sellerAddress) throw new Error("SELLER_ADDRESS not configured");
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC_TESTNET_RPC, { timeout: 30_000 }),
  });

  const lookbackBlocks = BigInt(
    process.env.CHAIN_OBSERVER_LOOKBACK_BLOCKS ?? 200,
  );

  // Same transitional probe as the script: record pending_batch in its own
  // column when the column exists, and in `raw` regardless, so no
  // observation is lost against a database missing the migration.
  const { error: probeError } = await supabase
    .from("chain_observations")
    .select("pending_batch")
    .limit(1);
  const pendingBatchColumnAvailable = !probeError;

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
    // BigInt(0) rather than the `0n` literal: tsconfig targets ES2017, where
    // BigInt literals are not available. (chain-observer.mts uses `0n`
    // freely because .mts files are outside tsconfig's include and are never
    // typechecked.)
    const fromBlock =
      currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : BigInt(0);

    const logs = await publicClient.getLogs({
      address: ARC_TESTNET_USDC,
      event: transferEvent,
      args: { to: sellerAddress },
      fromBlock,
      toBlock: currentBlock,
    });

    return {
      logs: logs.map((log) => ({
        txHash: log.transactionHash,
        block: log.blockNumber.toString(),
        from: log.args.from ?? "",
        value: log.args.value?.toString() ?? "",
      })),
      scannedRange: {
        from: fromBlock.toString(),
        to: currentBlock.toString(),
      },
    };
  }

  const observedAt = new Date().toISOString();

  const [balanceResult, onchainResult] = await Promise.all([
    fetchGatewayBalance().catch((err) => ({ error: (err as Error).message })),
    checkOnchainTransfers().catch((err) => ({ error: (err as Error).message })),
  ]);

  // Only trust fields Circle's response actually contains — never invent a
  // value for a field that is not present.
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
      // Distinguishes rows written by the scheduled route from rows written
      // by the local script, without changing the row's shape.
      source: "api/cron/observe",
    },
  };

  const { data, error } = await supabase
    .from("chain_observations")
    .insert(row)
    .select("id, observed_at")
    .single();

  if (error) throw new Error(`insert failed: ${error.message}`);

  return {
    observation_id: data?.id ?? null,
    observed_at: data?.observed_at ?? observedAt,
    gateway_available: gatewayAvailable,
    pending_batch: pendingBatch,
    gateway_withdrawable: gatewayWithdrawable,
    onchain_tx: row.onchain_tx,
    pending_batch_column_written: pendingBatchColumnAvailable,
  };
}

async function handle(req: NextRequest) {
  // Reading the request header first is both the auth check and what marks
  // this route dynamic — `export const dynamic` cannot be used here, as it
  // is rejected outright by `cacheComponents` (DECISIONS.md #045).
  const provided = req.headers.get("authorization") ?? "";
  const expected = process.env.OBSERVER_CRON_SECRET;

  // Fail CLOSED when the secret is not configured. Without this an
  // unconfigured deployment would compare against undefined and could be
  // triggered by anyone.
  if (!expected) {
    console.error("[cron/observe] OBSERVER_CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Observer cron secret not configured" },
      { status: 500 },
    );
  }

  const token = provided.startsWith("Bearer ") ? provided.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runOneObservation();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/observe] observation failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST is the semantically correct verb for something that writes a row.
// GET is also accepted because several free schedulers only issue GETs; it
// is gated by the identical secret check, so it grants nothing extra.
export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
