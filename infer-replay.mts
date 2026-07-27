/**
 * Ballast — replay the inference engine over real evidence.
 *
 * Reads the immutable evidence log and runs inferStateV1 over it. Strictly
 * read-only: it derives conclusions and prints them, and writes nothing back
 * (CLAUDE.md principle 2 — conclusions are derived, never stored as truth).
 *
 * Usage: npm run infer:replay [-- --limit N] [--payment <payment_id>]
 */

import { createClient } from "@supabase/supabase-js";
import {
  inferStateV1,
  type ChainObservationInput,
  type VerificationEventInput,
} from "./lib/ballast/infer-state-v1.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 5;
const paymentArg = args.indexOf("--payment");
const paymentFilter = paymentArg >= 0 ? args[paymentArg + 1] : null;

const { data: events, error: eventsError } = await supabase
  .from("verification_events")
  .select("id, payment_id, amount, endpoint, authorization_ref, observed_at")
  .order("observed_at", { ascending: true });
if (eventsError) {
  console.error("Failed to read verification_events:", eventsError.message);
  process.exit(1);
}

const { data: observations, error: obsError } = await supabase
  .from("chain_observations")
  .select(
    "id, observed_at, gateway_available, gateway_withdrawable, onchain_tx, block, raw",
  )
  .order("observed_at", { ascending: true });
if (obsError) {
  console.error("Failed to read chain_observations:", obsError.message);
  process.exit(1);
}

const allEvents = events as VerificationEventInput[];
const allObservations = observations as ChainObservationInput[];

console.log(
  `Evidence: ${allEvents.length} verification_events, ` +
    `${allObservations.length} chain_observations`,
);
console.log(
  `Observation coverage: ${allObservations[0]?.observed_at ?? "none"} .. ` +
    `${allObservations[allObservations.length - 1]?.observed_at ?? "none"}\n`,
);

const selected = paymentFilter
  ? allEvents.filter((e) => e.payment_id === paymentFilter)
  : pickRepresentative(allEvents, allObservations, limit);

for (const event of selected) {
  const result = inferStateV1(event, allObservations, {
    siblingEvents: allEvents,
  });

  console.log("─".repeat(76));
  console.log(`payment_id     ${event.payment_id}`);
  console.log(`verified_at    ${event.observed_at}`);
  console.log(`amount         ${event.amount} USDC   ${event.endpoint}`);
  console.log(
    `\n  STATE        ${result.state}` +
      `   confidence ${result.confidence}   engine ${result.engine_version}`,
  );
  console.log(`  signals (${result.signals.length}):`);
  for (const s of result.signals) {
    console.log(`    • [${s.kind}]${s.observed_at ? ` @ ${s.observed_at}` : ""}`);
    console.log(`      ${wrap(s.detail, 68)}`);
  }
  console.log();
}

/**
 * Choose payments that exercise different evidence situations, so the replay
 * shows the engine discriminating rather than repeating one verdict.
 */
function pickRepresentative(
  events: VerificationEventInput[],
  observations: ChainObservationInput[],
  n: number,
): VerificationEventInput[] {
  if (observations.length === 0) return events.slice(0, n);
  const covStart = Date.parse(observations[0].observed_at);
  const covEnd = Date.parse(observations[observations.length - 1].observed_at);

  const before = events.filter((e) => Date.parse(e.observed_at) < covStart);
  const during = events.filter((e) => {
    const t = Date.parse(e.observed_at);
    return t >= covStart && t <= covEnd;
  });
  const after = events.filter((e) => Date.parse(e.observed_at) > covEnd);

  const picked: VerificationEventInput[] = [];
  if (before.length) picked.push(before[0], before[before.length - 1]);
  if (during.length) {
    picked.push(during[0]);
    if (during.length > 2) picked.push(during[Math.floor(during.length / 2)]);
    picked.push(during[during.length - 1]);
  }
  if (after.length) picked.push(after[after.length - 1]);
  return picked.slice(0, Math.max(n, 3));
}

function wrap(text: string, width: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > width) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += w + " ";
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n      ");
}
