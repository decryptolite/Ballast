/**
 * Ballast — Evidence Assistant guardrails (DECISIONS.md #033).
 *
 * PURE validation over a candidate explanation. No I/O, no clock, no LLM.
 *
 * These are the enforcement mechanism for DESIGN_PHILOSOPHY.md's hard rule:
 * the LLM never determines payment truth. Two layers exist, and this file is
 * the second:
 *
 *   1. STRUCTURAL (in the route, not here): state, confidence, engine
 *      version and the cited signal objects are produced by inferStateV1
 *      server-side over the scoped evidence, and are NEVER parsed out of
 *      model text. A fully-hallucinating model cannot alter them — it can
 *      only select WHICH real signals to cite, by index.
 *   2. VALIDATION (this file): a candidate answer is rejected outright if it
 *      hedges, overclaims certainty or settlement, contradicts the engine's
 *      confidence, invents identifiers or amounts, or cites a signal that
 *      does not exist.
 *
 * Rejection is safe by construction: the caller falls back to the
 * deterministic explanation composed directly from engine output. So a false
 * positive costs a plainer answer, never a wrong one — deliberately biased
 * toward strictness.
 */

import type { PaymentState } from "./infer-state-v1";

export const GUARDRAIL_VERSION = "1";

export interface GuardrailContext {
  state: PaymentState;
  /** The engine's confidence. Any confidence figure asserted in the answer
   * must equal this exactly. */
  confidence: number;
  /** Signal kinds actually present on the inference, in order. Citations are
   * indexes into this array. */
  signalKinds: string[];
  /** Serialized scoped evidence. Any identifier or USDC amount appearing in
   * the answer must be found here, or it was invented. */
  evidenceCorpus: string;
}

export interface GuardrailVerdict {
  ok: boolean;
  violations: string[];
}

/** Hedging and speculation. The engine states what evidence shows; an
 * explanation layer that softens or speculates is misrepresenting it. */
const HEDGING = [
  /\bprobably\b/i,
  /\bmost likely\b/i,
  /\blikely\b/i,
  /\bit appears\b/i,
  /\bappears to\b/i,
  /\bseems? (?:to|like)\b/i,
  /\bpresumably\b/i,
  /\bpossibly\b/i,
  /\bperhaps\b/i,
  /\bmaybe\b/i,
  /\bmight (?:be|have)\b/i,
  /\bcould (?:be|have)\b/i,
  /\bI (?:think|believe|suspect)\b/i,
  /\bsuggests? that\b/i,
  /\bwe can assume\b/i,
  /\bpresumed\b/i,
];

/** Certainty language. RECONCILED is capped below certainty by design
 * (DECISIONS.md #008); nothing here may be described as proven. */
const CERTAINTY = [
  /\bcertainly\b/i,
  /\bdefinitely\b/i,
  /\bguaranteed?\b/i,
  /\bproven\b/i,
  /\bproof that\b/i,
  /\bhash-proven\b/i,
  /\bwith certainty\b/i,
  /\bbeyond doubt\b/i,
  /\b100% (?:certain|sure|confident)\b/i,
];

/** Onchain settlement claims. Per #008 no per-payment onchain settlement
 * signal exists at all, so any such assertion is false regardless of state. */
const ONCHAIN_CLAIM = [
  /\bsettled on-?chain\b/i,
  /\bon-?chain settlement\b/i,
  /\bconfirmed on-?chain\b/i,
  /\bon-?chain proof\b/i,
  /\btransaction hash\b/i,
  /\btx hash\b/i,
];

/** Affirmative settlement claims, forbidden unless the engine actually
 * concluded RECONCILED. Phrasings like "not yet settled" are unaffected. */
const SETTLED_ASSERTION = [
  /\b(?:is|has been|was) settled\b/i,
  /\b(?:is|has been|was) reconciled\b/i,
  /\bhas settled\b/i,
  /\bfully settled\b/i,
];

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

/**
 * Validate a candidate answer against the engine's actual conclusion.
 *
 * @param answer         Candidate explanation prose.
 * @param citedIndexes   Indexes into ctx.signalKinds the answer claims to use.
 * @param ctx            Authoritative engine output + evidence corpus.
 */
export function validateAnswer(
  answer: string,
  citedIndexes: number[],
  ctx: GuardrailContext,
): GuardrailVerdict {
  const violations: string[] = [];

  if (typeof answer !== "string" || answer.trim().length === 0) {
    return { ok: false, violations: ["empty_answer"] };
  }

  const hedge = firstMatch(answer, HEDGING);
  if (hedge) violations.push(`hedging_language:"${hedge}"`);

  const certainty = firstMatch(answer, CERTAINTY);
  if (certainty) violations.push(`certainty_overclaim:"${certainty}"`);

  const onchain = firstMatch(answer, ONCHAIN_CLAIM);
  if (onchain) violations.push(`onchain_settlement_claim:"${onchain}"`);

  if (ctx.state !== "RECONCILED") {
    const settled = firstMatch(answer, SETTLED_ASSERTION);
    if (settled) {
      violations.push(
        `settlement_claim_without_reconciled_state:"${settled}"`,
      );
    }
  }

  // Confidence figures, checked only in confidence context so USDC amounts
  // (which are also decimals in [0,1]) cannot trigger a false positive.
  const confidenceClaims = [
    ...answer.matchAll(/confidence[^.]{0,40}?(\d*\.\d+)/gi),
    ...answer.matchAll(/(\d*\.\d+)[^.]{0,25}?confidence/gi),
  ];
  for (const m of confidenceClaims) {
    const claimed = Number(m[1]);
    if (Number.isFinite(claimed) && claimed !== ctx.confidence) {
      violations.push(
        `confidence_mismatch:claimed_${claimed}_actual_${ctx.confidence}`,
      );
    }
  }

  // Invented identifiers: any hex id or UUID must exist in the evidence.
  const identifiers = [
    ...answer.matchAll(/0x[0-9a-fA-F]{6,}/g),
    ...answer.matchAll(
      /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    ),
  ].map((m) => m[0]);
  for (const id of identifiers) {
    if (!ctx.evidenceCorpus.toLowerCase().includes(id.toLowerCase())) {
      violations.push(`fabricated_identifier:"${id}"`);
    }
  }

  // Invented amounts: any "<number> USDC" must exist in the evidence.
  for (const m of answer.matchAll(/(\d+(?:\.\d+)?)\s*USDC/gi)) {
    const amount = m[1];
    const normalized = String(Number(amount));
    if (
      !ctx.evidenceCorpus.includes(amount) &&
      !ctx.evidenceCorpus.includes(normalized)
    ) {
      violations.push(`fabricated_amount:"${amount} USDC"`);
    }
  }

  // Citations must be real, and every answer must terminate in evidence.
  if (!Array.isArray(citedIndexes) || citedIndexes.length === 0) {
    violations.push("no_evidence_cited");
  } else {
    for (const i of citedIndexes) {
      if (
        !Number.isInteger(i) ||
        i < 0 ||
        i >= ctx.signalKinds.length
      ) {
        violations.push(`fabricated_citation_index:${i}`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
