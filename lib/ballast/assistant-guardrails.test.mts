/**
 * Ballast — Evidence Assistant guardrail tests.
 *
 * Adversarial fabricated model output in, rejection out. Runs with no
 * database, no network, and no LLM: `npm run test:assistant`.
 *
 * These prove the "LLM never determines payment truth" rule is enforced by
 * code, not by asking a model nicely: every case below is a plausible model
 * response that must be refused.
 */

import assert from "node:assert/strict";
import { validateAnswer, type GuardrailContext } from "./assistant-guardrails.ts";
import {
  classifyQuestion,
  composeDeterministicAnswer,
  REFUSAL,
  type AssistantFacts,
} from "./assistant.ts";
import type { Inference } from "./infer-state-v1.ts";

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

// Realistic context modelled on the tracked payment from DECISIONS.md #012.
const EVIDENCE = JSON.stringify({
  event: {
    id: "9e40d517-0000-4000-8000-000000000001",
    amount: 0.01,
    endpoint: "/api/premium/dataset",
    authorization_ref: "37472060-eaf3-4041-9e5b-b1090932ab1e",
  },
  observations: [{ id: "obs-1", pending_batch: 0.6399, onchain_tx: null }],
});

const ctx: GuardrailContext = {
  state: "FLOATING",
  confidence: 0.95,
  signalKinds: [
    "verification_event",
    "pending_batch_covers_amount",
    "pending_batch_sum_attributed",
  ],
  evidenceCorpus: EVIDENCE,
};

const OK_CITES = [0, 1];

console.log("\nEvidence Assistant guardrails — adversarial model output\n");

// --- Must REJECT ------------------------------------------------------------

test("rejects hedging language", () => {
  const v = validateAnswer(
    "This payment is probably part of the current batch.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("hedging_language")));
});

test("rejects softer hedging ('it appears', 'seems to')", () => {
  assert.equal(
    validateAnswer("It appears the batch is still open.", OK_CITES, ctx).ok,
    false,
  );
  assert.equal(
    validateAnswer("The value seems to be floating.", OK_CITES, ctx).ok,
    false,
  );
});

test("rejects certainty overclaim", () => {
  const v = validateAnswer(
    "This payment has definitely been included in the batch.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("certainty_overclaim")));
});

test("rejects onchain settlement claims (no such signal exists)", () => {
  const v = validateAnswer(
    "The payment was confirmed onchain in the settlement batch.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("onchain_settlement_claim")));
});

test("rejects invented transaction hash", () => {
  const v = validateAnswer(
    "Settlement is recorded under 0xdeadbeefcafe1234567890.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("fabricated_identifier")));
});

test("rejects a REAL identifier misattributed as a transaction hash", () => {
  // Observed with a live model (DECISIONS.md #035): given an adversarial
  // prompt, Gemini did not invent a hash — it took the real payment_id (an
  // EIP-3009 nonce, legitimately in its prompt) and presented it as a
  // blockchain transaction hash. `fabricated_identifier` cannot catch that,
  // because the value IS in the evidence; the onchain-claim rule is what
  // covers it, since no per-payment transaction hash exists in this system
  // at all.
  const realNonce =
    "0x3453b035014de80212a57c6fb0f910e32e9e64a8fd2678e0391f329bc583a290";
  const ctxWithNonce: GuardrailContext = {
    ...ctx,
    evidenceCorpus: JSON.stringify({ event: { payment_id: realNonce } }),
  };
  const v = validateAnswer(
    `The transaction hash is ${realNonce}.`,
    OK_CITES,
    ctxWithNonce,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("onchain_settlement_claim")));

  // Naming the same real value correctly must still pass — the rule targets
  // the false claim, not the identifier.
  assert.equal(
    validateAnswer(
      `The payment's authorization nonce is ${realNonce}.`,
      OK_CITES,
      ctxWithNonce,
    ).ok,
    true,
  );
});

test("rejects settlement assertion when state is not RECONCILED", () => {
  const v = validateAnswer(
    "This payment has been settled and requires no further attention.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(
    v.violations.some((x) =>
      x.startsWith("settlement_claim_without_reconciled_state"),
    ),
  );
});

test("rejects upgraded confidence", () => {
  const v = validateAnswer(
    "The engine reports a confidence of 0.99 for this conclusion.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("confidence_mismatch")));
});

test("rejects fabricated USDC amount", () => {
  const v = validateAnswer(
    "The pending batch held 5.25 USDC at that moment.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((x) => x.startsWith("fabricated_amount")));
});

test("rejects citation of a signal that does not exist", () => {
  const v = validateAnswer("The batch remains open.", [0, 99], ctx);
  assert.equal(v.ok, false);
  assert.ok(
    v.violations.some((x) => x.startsWith("fabricated_citation_index")),
  );
});

test("rejects an answer that cites no evidence at all", () => {
  const v = validateAnswer("The batch remains open.", [], ctx);
  assert.equal(v.ok, false);
  assert.ok(v.violations.includes("no_evidence_cited"));
});

test("rejects an empty answer", () => {
  assert.equal(validateAnswer("   ", OK_CITES, ctx).ok, false);
});

test("reports EVERY violation, not just the first", () => {
  const v = validateAnswer(
    "This probably settled onchain with confidence 0.99.",
    [],
    ctx,
  );
  assert.equal(v.ok, false);
  assert.ok(
    v.violations.length >= 4,
    `expected multiple violations, got ${v.violations.length}`,
  );
});

// --- Must ACCEPT (no over-rejection) ---------------------------------------

test("accepts a compliant answer", () => {
  const v = validateAnswer(
    "The pending batch total matched the exact sum of verified payments " +
      "including this one, so the value is recorded as floating.",
    OK_CITES,
    ctx,
  );
  assert.deepEqual(v.violations, []);
  assert.equal(v.ok, true);
});

test("accepts correctly-stated confidence", () => {
  const v = validateAnswer(
    "The engine assigned a confidence of 0.95 to this conclusion.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, true);
});

test("accepts 'not yet settled' phrasing (negation is not a claim)", () => {
  const v = validateAnswer(
    "This value is not yet settled; it remains in the open batch.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, true);
});

test("a USDC amount present in evidence does not trip confidence checks", () => {
  const v = validateAnswer(
    "The batch held 0.6399 USDC, covering this payment's 0.01 USDC.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, true);
});

test("accepts a real settlement reference quoted from the evidence", () => {
  const v = validateAnswer(
    "The settlement reference recorded is 37472060-eaf3-4041-9e5b-b1090932ab1e.",
    OK_CITES,
    ctx,
  );
  assert.equal(v.ok, true);
});

test("RECONCILED state permits a settlement statement", () => {
  const reconciledCtx: GuardrailContext = { ...ctx, state: "RECONCILED", confidence: 0.75 };
  const v = validateAnswer(
    "The batch containing this payment has been settled per Circle's ledger.",
    OK_CITES,
    reconciledCtx,
  );
  assert.equal(v.ok, true);
});

// --- Question gating (refusal is a real code path) --------------------------

console.log("\nQuestion gating\n");

test("cross-payment questions are out of scope (never reach a model)", () => {
  assert.equal(classifyQuestion("How many other payments are floating?"), "out_of_scope");
  assert.equal(classifyQuestion("Compare this to all payments"), "out_of_scope");
});

test("predictive questions are out of scope", () => {
  assert.equal(classifyQuestion("When will this reconcile?"), "out_of_scope");
  assert.equal(classifyQuestion("Will it settle today?"), "out_of_scope");
});

test("advice and norm-comparison questions are out of scope", () => {
  assert.equal(classifyQuestion("What should I do about this?"), "out_of_scope");
  assert.equal(classifyQuestion("Is this slower than usual?"), "out_of_scope");
});

test("in-scope questions classify to a real intent", () => {
  assert.equal(classifyQuestion("Why is this floating?"), "state");
  assert.equal(classifyQuestion("What does this confidence mean?"), "confidence");
  assert.equal(classifyQuestion("What changed since verification?"), "changed");
  assert.equal(classifyQuestion("Is this settled onchain?"), "settlement");
  assert.equal(classifyQuestion("What evidence supports this?"), "evidence");
});

test("an unrecognized question yields the exact refusal sentence", () => {
  const facts = makeFacts();
  const out = composeDeterministicAnswer("unknown", facts);
  assert.equal(out.answer, REFUSAL);
  assert.deepEqual(out.citedIndexes, []);
});

test("out-of-scope answer leads with the exact refusal sentence", () => {
  const out = composeDeterministicAnswer("out_of_scope", makeFacts());
  assert.ok(out.answer.startsWith(REFUSAL));
  assert.deepEqual(out.citedIndexes, []);
});

test("deterministic answers cite real signals and never fabricate", () => {
  const facts = makeFacts();
  for (const intent of ["state", "confidence", "changed", "evidence"] as const) {
    const out = composeDeterministicAnswer(intent, facts);
    assert.ok(out.answer.length > 0, `${intent} produced no answer`);
    assert.ok(out.citedIndexes.length > 0, `${intent} cited nothing`);
    for (const i of out.citedIndexes) {
      assert.ok(
        i >= 0 && i < facts.inference.signals.length,
        `${intent} cited out-of-range signal ${i}`,
      );
    }
  }
});

function makeFacts(): AssistantFacts {
  const inference: Inference = {
    state: "FLOATING",
    confidence: 0.95,
    engine_version: "v1",
    signals: [
      {
        kind: "verification_event",
        detail: "Circle Gateway accepted this payment: 0.01 USDC to /api/premium/dataset.",
      },
      {
        kind: "pending_batch_sum_attributed",
        detail: "Pending batch of 0.639900 USDC equals the exact sum of 61 verified payment(s).",
      },
    ],
  };
  return {
    endpoint: "/api/premium/dataset",
    amount: "0.01",
    verifiedAt: "2026-07-25T21:22:02.768044+00:00",
    paymentId: "0x9e40d5171feaabc0",
    authorizationRef: "37472060-eaf3-4041-9e5b-b1090932ab1e",
    inference,
    observationCount: 2,
    lastObservationAt: "2026-07-25T21:46:09.410337+00:00",
  };
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
