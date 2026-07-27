/**
 * Ballast — inference engine v1 unit tests.
 *
 * Fixed fake evidence in, known conclusions out. Runs with no database, no
 * network, and no live system: `npm run test:engine`.
 *
 * The evidence here is synthetic BY DESIGN and never touches the evidence log
 * — CLAUDE.md's "never fake or mock data in the evidence path" governs what
 * may be written to Supabase as an observation, not what a pure function may
 * be exercised with in a test. Shapes and magnitudes mirror the real run.
 */

import assert from "node:assert/strict";
import {
  inferStateV1,
  ENGINE_VERSION,
  CONFIDENCE,
  MAX_RECONCILED_CONFIDENCE,
  BREAK_WINDOW_MS,
  type ChainObservationInput,
  type VerificationEventInput,
} from "./infer-state-v1.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${(err as Error).message.split("\n")[0]}`);
  }
}

const VERIFIED_AT = "2026-07-25T21:19:28.000Z";

function obs(
  id: string,
  observedAt: string,
  pendingBatch: number | null,
  extra: Partial<ChainObservationInput> = {},
): ChainObservationInput {
  return {
    id,
    observed_at: observedAt,
    gateway_available: 0.9999,
    pending_batch: pendingBatch,
    onchain_tx: null,
    ...extra,
  };
}

const payment: VerificationEventInput = {
  id: "ve-1",
  payment_id: "0xnonce-aaa",
  amount: 0.03,
  endpoint: "/api/premium/agent-task",
  authorization_ref: "auth-ref-1",
  observed_at: VERIFIED_AT,
};

console.log("\ninferStateV1 — fixed evidence tests\n");

// --- CASE 1: the full lifecycle on one payment ------------------------------
// Same payment, same engine, three points in time: the conclusion advances
// only as new evidence arrives.

test("CASE 1a: no observations yet -> VERIFIED (hard fact, nothing more)", () => {
  const result = inferStateV1(payment, []);
  assert.equal(result.state, "VERIFIED");
  assert.equal(result.confidence, CONFIDENCE.VERIFIED);
  assert.equal(result.engine_version, ENGINE_VERSION);
  assert.ok(
    result.signals.some((s) => s.kind === "insufficient_observation_coverage"),
    "must disclose that no corroboration was available",
  );
});

test("CASE 1b: value visible in an open batch -> FLOATING", () => {
  const result = inferStateV1(payment, [
    obs("o1", "2026-07-25T21:19:20.000Z", 0), // batch empty, pre-payment
    obs("o2", "2026-07-25T21:19:32.000Z", 0.2985), // covers this 0.03
  ]);
  assert.equal(result.state, "FLOATING");
  assert.equal(result.confidence, CONFIDENCE.FLOATING_AMOUNT_COVERED);
  assert.ok(
    result.signals.some((s) => s.kind === "pending_batch_covers_amount"),
  );
});

test("CASE 1c: batch then clears -> RECONCILED, and never certain", () => {
  const result = inferStateV1(payment, [
    obs("o1", "2026-07-25T21:19:20.000Z", 0),
    obs("o2", "2026-07-25T21:19:32.000Z", 0.2985),
    obs("o3", "2026-07-25T21:25:00.000Z", 0), // batch submitted
  ]);
  assert.equal(result.state, "RECONCILED");
  assert.equal(result.confidence, CONFIDENCE.RECONCILED_OFFCHAIN_RISE_AND_FALL);
  assert.ok(result.confidence < 1.0, "RECONCILED must never be certain");
  assert.ok(
    result.signals.some((s) => s.kind === "pending_batch_cleared_after_rise"),
  );
});

// --- CASE 2: a genuine break ------------------------------------------------

test("CASE 2: watched from the start, never appeared, window elapsed -> BREAK", () => {
  const result = inferStateV1(
    { ...payment, amount: 0.05 },
    [
      obs("o1", "2026-07-25T21:19:30.000Z", 0), // prompt: we were watching
      obs("o2", "2026-07-25T21:25:00.000Z", 0),
      obs("o3", "2026-07-25T21:55:00.000Z", 0), // >30min, still nothing
    ],
  );
  assert.equal(result.state, "BREAK");
  assert.equal(result.confidence, CONFIDENCE.BREAK);
  assert.ok(
    result.signals.some((s) => s.kind === "unaccounted_after_break_window"),
  );
});

// --- CASE 3: THE edge case that matters -------------------------------------
// A monitoring gap must never be reported as a payment failure. This is the
// difference between an evidence-first system and one that invents bad news.

test("CASE 3: no coverage + long elapsed -> VERIFIED, never BREAK", () => {
  const result = inferStateV1(payment, [], {
    asOf: "2026-07-25T23:19:28.000Z", // 2 hours later, far past the window
  });
  assert.equal(
    result.state,
    "VERIFIED",
    "a gap in OUR observation must not become an accusation about THEIR payment",
  );
  assert.notEqual(result.state, "BREAK");
  assert.ok(
    result.signals.some((s) => s.kind === "insufficient_observation_coverage"),
  );
});

test("CASE 3b: observations exist but none carry pendingBatch -> VERIFIED", () => {
  const result = inferStateV1(
    payment,
    [
      obs("o1", "2026-07-25T21:30:00.000Z", null, { raw: {} }),
      obs("o2", "2026-07-25T22:30:00.000Z", null, { raw: {} }),
    ],
    { asOf: "2026-07-25T23:19:28.000Z" },
  );
  assert.equal(result.state, "VERIFIED");
  assert.notEqual(result.state, "BREAK");
});

// --- CASE 4: ingestion lag must not be misread as clearing ------------------

test("CASE 4: zero reading inside the ingestion grace -> not RECONCILED", () => {
  const result = inferStateV1(payment, [
    obs("o1", "2026-07-25T21:19:33.000Z", 0), // 5s after: just not ingested yet
  ]);
  assert.notEqual(
    result.state,
    "RECONCILED",
    "a zero reading seconds after verification means 'not yet seen', not 'settled'",
  );
  assert.equal(result.state, "VERIFIED");
});

// --- CASE 5: independent onchain corroboration, still clamped ---------------

test("CASE 5: onchain withdrawal raises confidence but never to 1.0", () => {
  const result = inferStateV1(payment, [
    obs("o1", "2026-07-25T21:19:20.000Z", 0),
    obs("o2", "2026-07-25T21:19:32.000Z", 0.2985),
    obs("o3", "2026-07-25T21:25:00.000Z", 0, {
      onchain_tx: "0xdeadbeef",
      block: 1234567,
    }),
  ]);
  assert.equal(result.state, "RECONCILED");
  assert.equal(result.confidence, CONFIDENCE.RECONCILED_WITH_ONCHAIN);
  assert.ok(result.confidence <= MAX_RECONCILED_CONFIDENCE);
  assert.ok(result.confidence < 1.0, "clamped below hash-proof certainty");
  assert.ok(
    result.signals.some((s) => s.kind === "onchain_withdrawal_observed"),
  );
});

// --- CASE 6: determinism ----------------------------------------------------

test("CASE 6: input order does not change the conclusion", () => {
  const observations = [
    obs("o1", "2026-07-25T21:19:20.000Z", 0),
    obs("o2", "2026-07-25T21:19:32.000Z", 0.2985),
    obs("o3", "2026-07-25T21:25:00.000Z", 0),
  ];
  const forward = inferStateV1(payment, observations);
  const reversed = inferStateV1(payment, [...observations].reverse());
  const shuffled = inferStateV1(payment, [
    observations[1],
    observations[2],
    observations[0],
  ]);
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward, shuffled);
});

test("CASE 6b: repeated calls are byte-identical (replayable)", () => {
  const observations = [obs("o2", "2026-07-25T21:19:32.000Z", 0.2985)];
  const a = JSON.stringify(inferStateV1(payment, observations));
  const b = JSON.stringify(inferStateV1(payment, observations));
  assert.equal(a, b);
});

// --- CASE 7: exact-sum attribution upgrades FLOATING confidence -------------

test("CASE 7: exact sibling-sum match attributes the aggregate reading", () => {
  const siblings: VerificationEventInput[] = [
    { payment_id: "0xnonce-bbb", amount: 0.01, observed_at: "2026-07-25T21:19:29.000Z" },
    { payment_id: "0xnonce-ccc", amount: 0.2585, observed_at: "2026-07-25T21:19:30.000Z" },
    payment, // 0.03 — sums with the above to exactly 0.2985
  ];
  const observations = [
    obs("o1", "2026-07-25T21:19:20.000Z", 0),
    obs("o2", "2026-07-25T21:19:32.000Z", 0.2985),
  ];
  const withSiblings = inferStateV1(payment, observations, {
    siblingEvents: siblings,
  });
  assert.equal(withSiblings.state, "FLOATING");
  assert.equal(withSiblings.confidence, CONFIDENCE.FLOATING_SUM_ATTRIBUTED);
  assert.ok(
    withSiblings.signals.some((s) => s.kind === "pending_batch_sum_attributed"),
  );

  // Omitting siblings is never wrong — it just forgoes the stronger signal.
  const without = inferStateV1(payment, observations);
  assert.equal(without.state, "FLOATING");
  assert.ok(without.confidence < withSiblings.confidence);
});

test("CASE 7b: payments from an EARLIER batch are excluded from the sum", () => {
  // Shape taken from the real run: an earlier batch's payments had already
  // cleared before this batch opened. Scoping the sum to the current batch is
  // what makes exact attribution possible at all — without it the total is
  // polluted by history and never matches.
  const siblings: VerificationEventInput[] = [
    // Earlier batch — cleared long before, must NOT be summed.
    { payment_id: "0xold-1", amount: 0.9583, observed_at: "2026-07-25T20:59:00.000Z" },
    // Current batch.
    { payment_id: "0xnonce-bbb", amount: 0.01, observed_at: "2026-07-25T21:19:29.000Z" },
    { payment_id: "0xnonce-ccc", amount: 0.2585, observed_at: "2026-07-25T21:19:30.000Z" },
    payment,
  ];
  const result = inferStateV1(
    payment,
    [
      obs("o0", "2026-07-25T21:13:14.000Z", 0), // earlier batch already cleared
      obs("o1", "2026-07-25T21:19:23.000Z", 0), // this batch opens (pre-verification)
      obs("o2", "2026-07-25T21:19:32.000Z", 0.2985),
    ],
    { siblingEvents: siblings },
  );
  assert.equal(result.state, "FLOATING");
  assert.equal(
    result.confidence,
    CONFIDENCE.FLOATING_SUM_ATTRIBUTED,
    "batch-scoped sum must still match exactly despite earlier history",
  );
  assert.ok(
    result.signals.some((s) => s.kind === "pending_batch_sum_attributed"),
  );
});

test("CASE 7c: a LATER batch's rise is not credited to an already-cleared payment", () => {
  // Real-data shape: this payment had already cleared (accumulator empty)
  // before an unrelated later batch opened and closed. It must be scored on
  // its own weak evidence, not on a rise and fall that belonged to others.
  const result = inferStateV1(payment, [
    obs("o1", "2026-07-25T21:35:00.000Z", 0), // >grace, empty: already cleared
    obs("o2", "2026-07-25T21:40:00.000Z", 0.2985), // a DIFFERENT batch
    obs("o3", "2026-07-25T21:50:00.000Z", 0), // that batch clears
  ]);
  assert.equal(result.state, "RECONCILED");
  assert.equal(
    result.confidence,
    CONFIDENCE.RECONCILED_ZERO_AFTER_GRACE,
    "must stay at the weak score, not be upgraded by another batch's evidence",
  );
  assert.ok(
    result.signals.some((s) => s.kind === "pending_batch_zero_after_grace"),
  );
  assert.ok(
    !result.signals.some((s) => s.kind === "pending_batch_cleared_after_rise"),
    "must not claim to have witnessed this payment rise and fall",
  );
});

// --- CASE 8: the engine performs no I/O and mutates nothing -----------------

test("CASE 8: inputs are not mutated (pure function)", () => {
  const observations = [
    obs("o2", "2026-07-25T21:19:32.000Z", 0.2985),
    obs("o1", "2026-07-25T21:19:20.000Z", 0),
  ];
  const snapshot = JSON.stringify({ payment, observations });
  inferStateV1(payment, observations);
  assert.equal(
    JSON.stringify({ payment, observations }),
    snapshot,
    "engine must not reorder or modify the evidence it is given",
  );
});

console.log(
  `\n${passed} passed, ${failed} failed  (BREAK window ${BREAK_WINDOW_MS / 60000}min)\n`,
);
process.exit(failed === 0 ? 0 : 1);
