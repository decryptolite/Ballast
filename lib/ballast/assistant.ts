/**
 * Ballast — Evidence Assistant core (DECISIONS.md #033).
 *
 * Pure logic: question gating, deterministic explanation composed from real
 * engine output, and the prompt/interface for an optional LLM explanation
 * layer. No I/O here — the route performs retrieval and inference.
 *
 * The pipeline is fixed (DESIGN_PHILOSOPHY.md):
 *   scoped retrieval -> inferStateV1 -> explanation layer -> cited evidence
 * The explanation layer may only rephrase facts it is handed. It never
 * decides state, confidence, or which evidence is real.
 */

// Type-only import: this module stays free of any runtime dependency on the
// engine, so it can be exercised by the guardrail test under Node's raw ESM
// loader as well as bundled by Next.
import type { Inference } from "./infer-state-v1";

/** The exact sentence required when evidence cannot answer a question. */
export const REFUSAL = "The available evidence does not show that.";

/** Scope note appended only when a question is out of scope by design (not
 * merely unanswerable) — a factual statement, never an apology. */
export const SCOPE_NOTE =
  "This assistant is scoped to the recorded evidence for this one payment.";

export type Intent =
  | "state"
  | "confidence"
  | "changed"
  | "evidence"
  | "settlement"
  | "out_of_scope"
  | "unknown";

export interface AssistantFacts {
  endpoint: string;
  amount: string;
  verifiedAt: string;
  paymentId: string | null;
  authorizationRef: string | null;
  inference: Inference;
  observationCount: number;
  lastObservationAt: string | null;
}

/**
 * Questions this v1 cannot answer from one payment's evidence, refused
 * WITHOUT reaching any model: cross-payment aggregation (Phase 4), prediction
 * (forbidden outright — Ballast observes, it does not forecast), operational
 * advice, and comparison against historical norms (PARKING_LOT: "prediction
 * wearing a disguise").
 */
const OUT_OF_SCOPE = [
  /\bother payments?\b/i,
  /\ball payments?\b/i,
  /\bhow many\b/i,
  /\bacross payments?\b/i,
  /\bcompare\b/i,
  /\blist (?:the |all )?payments?\b/i,
  /\bwill (?:it|this|they)\b/i,
  /\bwhen will\b/i,
  /\bhow long will\b/i,
  /\bpredict\b/i,
  /\bforecast\b/i,
  /\bexpect(?:ed)? to\b/i,
  /\bgoing to\b/i,
  /\bshould I\b/i,
  /\bwhat do I do\b/i,
  /\brecommend\b/i,
  /\busual(?:ly)?\b/i,
  /\btypical(?:ly)?\b/i,
  /\bnormal(?:ly)?\b/i,
  /\baverage\b/i,
  /\bslower\b/i,
  /\bfaster\b/i,
  /\blonger than\b/i,
];

const INTENT_PATTERNS: Array<[Intent, RegExp[]]> = [
  [
    "settlement",
    [/\bsettled?\b/i, /\bon-?chain\b/i, /\bproof\b/i, /\bhash\b/i],
  ],
  [
    "confidence",
    [/\bconfidence\b/i, /\bhow sure\b/i, /\bhow certain\b/i, /\bwhy \d?\.\d+/i],
  ],
  [
    "changed",
    [/\bchanged?\b/i, /\bsince verification\b/i, /\bhappened\b/i, /\bprogress\b/i],
  ],
  [
    "evidence",
    [/\bevidence\b/i, /\bsignals?\b/i, /\bhow do you know\b/i, /\bbasis\b/i],
  ],
  [
    "state",
    [
      /\bwhy\b/i,
      /\bstate\b/i,
      /\bstatus\b/i,
      /\bfloating\b/i,
      /\breconciled\b/i,
      /\bverified\b/i,
      /\bbreak\b/i,
    ],
  ],
];

export function classifyQuestion(question: string): Intent {
  const q = question.trim();
  if (q.length === 0) return "unknown";
  for (const p of OUT_OF_SCOPE) if (p.test(q)) return "out_of_scope";
  for (const [intent, patterns] of INTENT_PATTERNS) {
    for (const p of patterns) if (p.test(q)) return intent;
  }
  return "unknown";
}

function signalList(inference: Inference): string {
  return inference.signals.map((s) => s.detail).join(" ");
}

function allIndexes(inference: Inference): number[] {
  return inference.signals.map((_, i) => i);
}

/**
 * What this payment's confidence value means, keyed off the SIGNALS actually
 * present rather than off hardcoded tier numbers. Deliberate: the signals are
 * the evidence the engine used, so this explanation cannot drift out of sync
 * with the engine's scoring the way a duplicated table of magic numbers
 * would. The figure itself is always quoted from the inference.
 */
function confidenceMeaning(inference: Inference): string {
  const c = inference.confidence;
  const kinds = new Set(inference.signals.map((s) => s.kind));

  if (inference.state === "VERIFIED") {
    return (
      `${c} is the confidence for VERIFIED, which is a recorded fact rather ` +
      "than an inference: Circle's facilitator accepted the payment " +
      "authorization."
    );
  }
  if (kinds.has("onchain_withdrawal_observed")) {
    return (
      `${c} reflects corroboration by an onchain transfer to the seller — an ` +
      "independent source, though an aggregate withdrawal that does not name " +
      "this payment."
    );
  }
  if (kinds.has("pending_batch_sum_attributed")) {
    return (
      `${c} reflects exact-sum attribution: the pending batch total equals ` +
      "the exact sum of a known set of verified payments including this one. " +
      "It stays below 1 because that figure is an aggregate reported by a " +
      "single source."
    );
  }
  if (kinds.has("pending_batch_cleared_after_rise")) {
    return (
      `${c} reflects a witnessed rise and clearance in the pending batch. ` +
      "Both readings come from Circle's balances API — one source, not " +
      "independent corroboration."
    );
  }
  if (kinds.has("pending_batch_zero_after_grace")) {
    return (
      `${c} reflects a pending batch reading of zero after the ingestion ` +
      "grace period, without the rise itself having been observed."
    );
  }
  if (kinds.has("pending_batch_covers_amount")) {
    return (
      `${c} reflects amount coverage alone: the pending batch held at least ` +
      "this payment's value, without an exact-sum match."
    );
  }
  if (kinds.has("unaccounted_after_break_window")) {
    return (
      `${c} reflects a BREAK concluded from positive evidence across an ` +
      "observed window."
    );
  }
  return `${c} is the confidence inferStateV1 assigned from the signals below.`;
}

/**
 * Compose an answer strictly from engine output. Used when no explanation
 * provider is configured, and as the fallback whenever a model answer fails
 * validation. Cannot hallucinate: every clause is assembled from real values.
 */
export function composeDeterministicAnswer(
  intent: Intent,
  facts: AssistantFacts,
): { answer: string; citedIndexes: number[] } {
  const inf = facts.inference;
  const conclusion = `${inf.state} at confidence ${inf.confidence}, derived by inferStateV1 (${inf.engine_version}).`;

  switch (intent) {
    case "state":
      return {
        answer:
          `This payment of ${facts.amount} USDC to ${facts.endpoint} is ` +
          `${conclusion} ${signalList(inf)}`,
        citedIndexes: allIndexes(inf),
      };

    case "confidence":
      return {
        answer: `${confidenceMeaning(inf)} ${
          inf.state === "RECONCILED"
            ? "RECONCILED is structurally capped below 1 and never reaches certainty, because no per-payment onchain settlement proof exists in the observed system."
            : ""
        } The current conclusion is ${conclusion}`.replace(/\s+/g, " ").trim(),
        citedIndexes: allIndexes(inf),
      };

    case "changed":
      return {
        answer:
          `This payment was verified at ${facts.verifiedAt}. ` +
          `${facts.observationCount} chain observation(s) in scope followed it` +
          (facts.lastObservationAt
            ? `, the most recent at ${facts.lastObservationAt}. `
            : ". ") +
          `The recorded change since verification is what the signals state: ${signalList(
            inf,
          )} The conclusion now stands at ${conclusion}`,
        citedIndexes: allIndexes(inf),
      };

    case "evidence":
      return {
        answer:
          `The conclusion rests on ${inf.signals.length} signal(s) over ` +
          `${facts.observationCount} chain observation(s) in scope, plus this ` +
          `payment's verification record` +
          (facts.authorizationRef
            ? ` (settlement reference ${facts.authorizationRef})` +
              ". "
            : ". ") +
          signalList(inf),
        citedIndexes: allIndexes(inf),
      };

    case "settlement":
      return {
        answer:
          "Per-payment onchain settlement proof does not exist in this " +
          "system: Circle's settle response returns an internal UUID, not an " +
          "onchain transaction hash, and no onchain event corresponds to a " +
          `specific payment being batch-settled. The engine's conclusion is ` +
          `${conclusion} ` +
          (inf.state === "RECONCILED"
            ? "RECONCILED is a confidence-scored inference, not proof of onchain settlement."
            : `That is not a claim of settlement.`) +
          ` ${signalList(inf)}`,
        citedIndexes: allIndexes(inf),
      };

    case "out_of_scope":
      return { answer: `${REFUSAL} ${SCOPE_NOTE}`, citedIndexes: [] };

    case "unknown":
    default:
      return { answer: REFUSAL, citedIndexes: [] };
  }
}

// ---------------------------------------------------------------------------
// Optional LLM explanation layer.
//
// NOTE: the prompt below is NOT the enforcement mechanism. Every constraint
// it states is independently enforced in code — structurally (the route
// never parses truth out of model text) and by validateAnswer(). The prompt
// exists to make compliant output likely; the code makes non-compliant
// output harmless.
// ---------------------------------------------------------------------------

export interface ExplanationRequest {
  question: string;
  intent: Intent;
  facts: AssistantFacts;
}

export interface ExplanationResult {
  answerable: boolean;
  answer: string;
  citedIndexes: number[];
}

export interface ExplanationProvider {
  readonly name: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  explain(req: ExplanationRequest): Promise<ExplanationResult | null>;
}

export const SYSTEM_PROMPT = [
  "You are the explanation layer of Ballast, an evidence-based payment",
  "reconciliation instrument. You explain a conclusion that has ALREADY been",
  "computed by a deterministic engine. You never determine payment truth.",
  "",
  "Absolute rules:",
  "- Use ONLY the facts provided. Never introduce an identifier, amount,",
  "  timestamp, or event that is not in them.",
  "- Never state a confidence value other than the one given.",
  "- Never claim onchain settlement or proof. No per-payment onchain",
  "  settlement signal exists in this system.",
  "- Never speculate about causes that the signals do not state.",
  "- Never hedge. Banned: probably, likely, most likely, it appears, seems,",
  "  presumably, perhaps, maybe, might be, could be, suggests that.",
  "- If the provided facts do not answer the question, set answerable=false.",
  "- Tone: calm, measured, analyst-register. The same voice regardless of",
  "  whether the news is good or bad. No enthusiasm, no reassurance.",
  "",
  'Respond ONLY as JSON: {"answerable": boolean, "answer": string,',
  '"cited_signal_indexes": number[]}. Cite by index into the signals array.',
  "Every answer must cite at least one signal.",
].join("\n");

export function buildUserPrompt(req: ExplanationRequest): string {
  const f = req.facts;
  return JSON.stringify(
    {
      question: req.question,
      payment: {
        endpoint: f.endpoint,
        amount_usdc: f.amount,
        verified_at: f.verifiedAt,
        payment_id: f.paymentId,
        settlement_reference: f.authorizationRef,
      },
      engine_conclusion: {
        state: f.inference.state,
        confidence: f.inference.confidence,
        engine_version: f.inference.engine_version,
      },
      signals: f.inference.signals.map((s, i) => ({
        index: i,
        kind: s.kind,
        detail: s.detail,
        observed_at: s.observed_at ?? null,
      })),
      evidence_scope: {
        chain_observations_in_scope: f.observationCount,
        last_observation_at: f.lastObservationAt,
      },
    },
    null,
    2,
  );
}
