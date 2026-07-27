/**
 * Ballast — Task 3: deterministic inference engine, v1.
 *
 * A PURE function over the evidence log. Given one verification event and the
 * chain observations around it, it derives a payment's state, a confidence,
 * and the specific signals that produced that conclusion.
 *
 * Contract (CLAUDE.md principles 2-4, DECISIONS.md #003/#004):
 *   - No I/O. No database reads or writes. No network. No clock access.
 *   - Deterministic: the same inputs always produce the same output, in any
 *     input ordering, forever. This is what makes a conclusion replayable
 *     and auditable six months later.
 *   - Version-stamped. v1's behaviour is frozen; a future v2 lives beside it
 *     rather than replacing it, so past conclusions stay reproducible.
 *
 * On honesty of conclusions (DECISIONS.md #008): per-payment onchain
 * settlement is NOT observable. RECONCILED is therefore always a
 * probabilistic inference and its confidence is structurally clamped below
 * certainty — see MAX_RECONCILED_CONFIDENCE. Nothing in this module can
 * return RECONCILED at confidence 1.0.
 */

export const ENGINE_VERSION = "v1";

export type PaymentState = "VERIFIED" | "FLOATING" | "RECONCILED" | "BREAK";

/** A row from the verification_events evidence stream. */
export interface VerificationEventInput {
  id?: string | null;
  payment_id?: string | null;
  amount: number | string;
  endpoint?: string | null;
  authorization_ref?: string | null;
  observed_at: string;
}

/** A row from the chain_observations evidence stream. */
export interface ChainObservationInput {
  id?: string | null;
  observed_at: string;
  gateway_available?: number | string | null;
  gateway_withdrawable?: number | string | null;
  /** Populated by migration 20260725000000; falls back to `raw` when absent. */
  pending_batch?: number | string | null;
  onchain_tx?: string | null;
  block?: number | string | null;
  raw?: unknown;
}

/** One piece of evidence that contributed to the conclusion. */
export interface InferenceSignal {
  kind:
    | "verification_event"
    | "insufficient_observation_coverage"
    | "pending_batch_covers_amount"
    | "pending_batch_sum_attributed"
    | "pending_batch_cleared_after_rise"
    | "pending_batch_zero_after_grace"
    | "onchain_withdrawal_observed"
    | "unaccounted_after_break_window";
  /** Human-readable statement of what was observed. Never a conclusion. */
  detail: string;
  observation_id?: string | null;
  observed_at?: string | null;
}

export interface Inference {
  state: PaymentState;
  confidence: number;
  signals: InferenceSignal[];
  engine_version: typeof ENGINE_VERSION;
}

export interface InferOptions {
  /**
   * The moment the conclusion is drawn "as of". Defaults to the latest
   * observation's timestamp (or the verification timestamp when there are no
   * observations) — a value derived entirely from the inputs, so the function
   * stays deterministic. Deliberately NOT Date.now(): reading the clock would
   * make the same evidence produce different answers on different days and
   * break replay.
   */
  asOf?: string;
  /**
   * Other verification events from the same seller, used only to attempt
   * exact-sum attribution of an aggregate pendingBatch reading to this
   * specific payment. Optional: omitting it simply forgoes the strongest
   * FLOATING signal, it never changes correctness.
   */
  siblingEvents?: VerificationEventInput[];
}

// --- Tuning constants (exported so a conclusion can be audited against the
// --- exact thresholds that produced it).

/**
 * How long after verification we wait before an unexplained payment is called
 * a BREAK. Chosen conservatively at the top of the considered range: a false
 * BREAK tells someone their money vanished when it did not, which is far more
 * damaging than a late one, and the observed batch lifecycle sample is still
 * small (DECISIONS.md #011/#012).
 */
export const BREAK_WINDOW_MS = 30 * 60 * 1000;

/**
 * Grace period after verification during which a pendingBatch reading of zero
 * is treated as "not yet ingested" rather than "already cleared". Real data
 * shows Circle takes seconds to tens of seconds to reflect a settled payment
 * in pendingBatch; without this guard, an observation landing in that gap
 * would be misread as proof of clearing. 2 minutes is well beyond the
 * observed lag.
 */
export const INGESTION_GRACE_MS = 2 * 60 * 1000;

/** Tolerance for amount comparisons, in micro-USDC (USDC has 6 decimals). */
export const AMOUNT_TOLERANCE_MICROS = 1;

export const CONFIDENCE = {
  /** VERIFIED is a hard fact: Circle's facilitator accepted the payment. */
  VERIFIED: 1.0,
  /** pendingBatch is aggregate, so FLOATING is strong but never certain. */
  FLOATING_SUM_ATTRIBUTED: 0.95,
  FLOATING_AMOUNT_COVERED: 0.85,
  /** Offchain, single-source (Circle's balances API) — see #008. */
  RECONCILED_OFFCHAIN_RISE_AND_FALL: 0.75,
  RECONCILED_ZERO_AFTER_GRACE: 0.6,
  /** Corroborated by a genuinely independent source (the chain itself). */
  RECONCILED_WITH_ONCHAIN: 0.9,
  BREAK: 0.7,
} as const;

/**
 * Hard ceiling on RECONCILED confidence. Per DECISIONS.md #008 there is no
 * per-payment onchain settlement proof, so RECONCILED must never be
 * presentable as hash-proven fact. Enforced structurally below, not by
 * convention, so no future edit to CONFIDENCE can accidentally reach 1.0.
 */
export const MAX_RECONCILED_CONFIDENCE = 0.9;

// --- Internal helpers.

/**
 * Convert a decimal USDC value to integer micro-USDC. Working in integers
 * removes floating-point drift from every comparison and sum, which matters
 * because determinism is a hard requirement here, not a nicety.
 */
function toMicros(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000);
}

/**
 * Read pendingBatch for an observation: the dedicated column when populated
 * (migration 20260725000000), otherwise the same value from the `raw`
 * capture. `raw` is the permanent evidence; the column is a denormalised
 * convenience, so rows written before the migration remain fully usable.
 */
function readPendingBatchMicros(obs: ChainObservationInput): number | null {
  const fromColumn = toMicros(obs.pending_batch);
  if (fromColumn !== null) return fromColumn;

  const raw = obs.raw as
    | {
        gatewayBalanceResponse?: {
          data?: { balances?: Array<{ pendingBatch?: number | string }> };
        };
      }
    | undefined;
  return toMicros(
    raw?.gatewayBalanceResponse?.data?.balances?.[0]?.pendingBatch,
  );
}

function timestamp(iso: string): number {
  return Date.parse(iso);
}

/**
 * Deterministic ordering. Sorting by timestamp alone is not enough: two
 * observations can share a millisecond, and an unstable tiebreak would let
 * the same evidence produce different output depending on input order.
 */
function sortObservations(
  observations: ChainObservationInput[],
): ChainObservationInput[] {
  return [...observations].sort((a, b) => {
    const ta = timestamp(a.observed_at);
    const tb = timestamp(b.observed_at);
    if (ta !== tb) return ta - tb;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

/**
 * Derive a payment's state from the evidence.
 *
 * @param event        The verification event for the payment in question.
 * @param observations Chain observations around it. May be unordered, may be
 *                     empty, may include observations from before the payment.
 * @param options      See InferOptions.
 */
export function inferStateV1(
  event: VerificationEventInput,
  observations: ChainObservationInput[],
  options: InferOptions = {},
): Inference {
  const signals: InferenceSignal[] = [];

  const verifiedAt = timestamp(event.observed_at);
  const amountMicros = toMicros(event.amount) ?? 0;

  // VERIFIED is the baseline hard fact. A verification_events row exists only
  // because Circle's facilitator returned success (lib/x402.ts writes it at
  // exactly that point), so this is observed, not inferred.
  signals.push({
    kind: "verification_event",
    detail:
      `Circle Gateway accepted this payment: ${event.amount} USDC to ` +
      `${event.endpoint ?? "unknown endpoint"}` +
      (event.authorization_ref
        ? ` (settlement ref ${event.authorization_ref})`
        : ""),
    observation_id: event.id ?? null,
    observed_at: event.observed_at,
  });

  const ordered = sortObservations(observations);
  const post = ordered.filter((o) => timestamp(o.observed_at) >= verifiedAt);
  const readable = post.filter((o) => readPendingBatchMicros(o) !== null);

  const asOf = options.asOf
    ? timestamp(options.asOf)
    : ordered.length > 0
      ? timestamp(ordered[ordered.length - 1].observed_at)
      : verifiedAt;

  // An onchain transfer to the seller is the only genuinely independent
  // corroborating source available (DECISIONS.md #008): it comes from the
  // chain via RPC rather than from Circle's own ledger. It proves aggregate
  // value moved, never that this specific payment was included.
  const withdrawal = post.find((o) => o.onchain_tx);

  // Walk the observations in order, tracking whether this payment's value was
  // ever visibly sitting in an open batch, and whether that batch later
  // cleared.
  let enteredBatchAt: ChainObservationInput | null = null;
  let enteredBatchMicros: number | null = null;
  let clearedAt: ChainObservationInput | null = null;
  let zeroAfterGraceAt: ChainObservationInput | null = null;

  // Did we actually look promptly after verification — soon enough that a
  // payment entering the batch could not have come and gone unseen?
  //
  // This resolves a genuine ambiguity: a pendingBatch reading of zero long
  // after verification is consistent with BOTH "the batch cleared before we
  // looked" and "this payment never entered a batch at all". The two are
  // distinguishable only by whether we were watching at the time. With prompt
  // coverage, a payment that never appears really is unaccounted for (BREAK
  // territory); without it, a later zero is better explained by a batch we
  // simply missed (weak RECONCILED).
  const promptCoverage = readable.some(
    (o) => timestamp(o.observed_at) - verifiedAt <= INGESTION_GRACE_MS,
  );

  for (const obs of readable) {
    const pb = readPendingBatchMicros(obs)!;
    const elapsed = timestamp(obs.observed_at) - verifiedAt;

    if (enteredBatchAt === null) {
      if (pb > 0 && pb + AMOUNT_TOLERANCE_MICROS >= amountMicros) {
        enteredBatchAt = obs;
        enteredBatchMicros = pb;
        continue;
      }
      // A zero reading before the payment could plausibly have been ingested
      // is ambiguous — it may simply predate ingestion. Only treat zero as
      // evidence of clearing once the grace period has passed AND we were not
      // watching promptly (see promptCoverage above): if we were watching from
      // the start and never saw this value enter a batch, zero means missing,
      // not settled.
      if (
        pb === 0 &&
        elapsed >= INGESTION_GRACE_MS &&
        !promptCoverage &&
        zeroAfterGraceAt === null
      ) {
        zeroAfterGraceAt = obs;
        // This payment's story ends here. An empty accumulator means nothing
        // of this seller's is outstanding, so this payment has already left
        // the batch — and every rise after this point belongs to a LATER
        // batch containing OTHER payments. Continuing to scan would credit
        // this payment with a rise and fall that were never its own, and
        // report a higher confidence than the evidence supports.
        break;
      }
      continue;
    }

    // Already seen it floating: look for the batch closing. Either the
    // accumulator returns to zero, or it drops by at least this payment's
    // value (the batch that contained it was submitted).
    if (
      clearedAt === null &&
      (pb === 0 ||
        pb + AMOUNT_TOLERANCE_MICROS <= enteredBatchMicros! - amountMicros)
    ) {
      clearedAt = obs;
    }
  }

  // --- No usable post-verification coverage: we know nothing further.
  //
  // This is the single most important guardrail in the engine. Absence of
  // evidence is not evidence of absence: if the observer was not running, we
  // must not manufacture a BREAK out of our own monitoring gap. The payment
  // stays at its last hard fact — VERIFIED — and the gap is stated openly.
  if (readable.length === 0) {
    signals.push({
      kind: "insufficient_observation_coverage",
      detail:
        post.length === 0
          ? "No chain observations exist after this payment was verified; " +
            "no corroborating signal could be evaluated."
          : `${post.length} observation(s) exist after verification but none ` +
            "carried a readable pendingBatch value.",
    });
    return {
      state: "VERIFIED",
      confidence: CONFIDENCE.VERIFIED,
      signals,
      engine_version: ENGINE_VERSION,
    };
  }

  // --- RECONCILED: the batch holding this payment appears to have closed.
  if (clearedAt || withdrawal || zeroAfterGraceAt) {
    let confidence: number;

    if (enteredBatchAt && clearedAt) {
      signals.push({
        kind: "pending_batch_covers_amount",
        detail:
          `Pending batch held ${(enteredBatchMicros! / 1e6).toFixed(6)} USDC, ` +
          `at least this payment's ${(amountMicros / 1e6).toFixed(6)} USDC.`,
        observation_id: enteredBatchAt.id ?? null,
        observed_at: enteredBatchAt.observed_at,
      });
      signals.push({
        kind: "pending_batch_cleared_after_rise",
        detail:
          `Pending batch fell to ${(
            readPendingBatchMicros(clearedAt)! / 1e6
          ).toFixed(6)} USDC, consistent with the batch containing this ` +
          "payment being submitted. Offchain, Circle-asserted, and aggregate " +
          "— not proof this specific payment settled onchain.",
        observation_id: clearedAt.id ?? null,
        observed_at: clearedAt.observed_at,
      });
      confidence = CONFIDENCE.RECONCILED_OFFCHAIN_RISE_AND_FALL;
    } else if (zeroAfterGraceAt) {
      signals.push({
        kind: "pending_batch_zero_after_grace",
        detail:
          "Pending batch read 0 USDC more than " +
          `${INGESTION_GRACE_MS / 60000} minutes after verification, implying ` +
          "nothing remains unsettled for this seller. The rise itself was " +
          "never observed, so attribution rests on the accumulator's " +
          "semantics rather than a witnessed transition.",
        observation_id: zeroAfterGraceAt.id ?? null,
        observed_at: zeroAfterGraceAt.observed_at,
      });
      confidence = CONFIDENCE.RECONCILED_ZERO_AFTER_GRACE;
    } else {
      confidence = CONFIDENCE.RECONCILED_ZERO_AFTER_GRACE;
    }

    if (withdrawal) {
      signals.push({
        kind: "onchain_withdrawal_observed",
        detail:
          `Onchain USDC transfer to the seller observed (tx ${withdrawal.onchain_tx}` +
          (withdrawal.block ? `, block ${withdrawal.block}` : "") +
          "). Independent of Circle's ledger, but an aggregate withdrawal — " +
          "it does not name this payment.",
        observation_id: withdrawal.id ?? null,
        observed_at: withdrawal.observed_at,
      });
      confidence = Math.max(confidence, CONFIDENCE.RECONCILED_WITH_ONCHAIN);
    }

    return {
      state: "RECONCILED",
      // Structural clamp: RECONCILED can never be presented as certain.
      confidence: Math.min(confidence, MAX_RECONCILED_CONFIDENCE),
      signals,
      engine_version: ENGINE_VERSION,
    };
  }

  // --- FLOATING: value is visibly sitting in an open batch.
  if (enteredBatchAt) {
    signals.push({
      kind: "pending_batch_covers_amount",
      detail:
        `Pending batch held ${(enteredBatchMicros! / 1e6).toFixed(6)} USDC, ` +
        `at least this payment's ${(amountMicros / 1e6).toFixed(6)} USDC, ` +
        "and has not since cleared.",
      observation_id: enteredBatchAt.id ?? null,
      observed_at: enteredBatchAt.observed_at,
    });

    let confidence: number = CONFIDENCE.FLOATING_AMOUNT_COVERED;

    // Strongest available FLOATING evidence: the aggregate reading equals the
    // exact sum of verified payments in the open batch, and this payment is
    // one of the summands. Because every amount is positive, an exact match
    // means this payment's value is necessarily part of that total — which
    // upgrades an aggregate correlation into arithmetic attribution.
    const siblings = options.siblingEvents;
    if (siblings && siblings.length > 0) {
      // Search ALL observations, not just post-verification ones: the batch
      // holding this payment generally opened before this payment was
      // verified, so its opening zero-reading lies in the earlier evidence.
      // Scoping this to post-verification observations would silently fold
      // every previous batch's payments into the sum and never match.
      const batchOpenedAfter = lastZeroBefore(ordered, enteredBatchAt);
      const inBatch = siblings.filter((s) => {
        const t = timestamp(s.observed_at);
        return (
          t <= timestamp(enteredBatchAt!.observed_at) &&
          (batchOpenedAfter === null || t > batchOpenedAfter)
        );
      });
      const sumMicros = inBatch.reduce(
        (acc, s) => acc + (toMicros(s.amount) ?? 0),
        0,
      );
      const includesThis = inBatch.some(
        (s) =>
          s.payment_id === event.payment_id &&
          s.observed_at === event.observed_at,
      );
      if (
        includesThis &&
        Math.abs(sumMicros - enteredBatchMicros!) <= AMOUNT_TOLERANCE_MICROS
      ) {
        signals.push({
          kind: "pending_batch_sum_attributed",
          detail:
            `Pending batch of ${(enteredBatchMicros! / 1e6).toFixed(6)} USDC ` +
            `equals the exact sum of ${inBatch.length} verified payment(s) in ` +
            "the open batch, this one among them.",
          observation_id: enteredBatchAt.id ?? null,
          observed_at: enteredBatchAt.observed_at,
        });
        confidence = CONFIDENCE.FLOATING_SUM_ATTRIBUTED;
      }
    }

    return {
      state: "FLOATING",
      confidence,
      signals,
      engine_version: ENGINE_VERSION,
    };
  }

  // --- BREAK: positively unaccounted for.
  //
  // Requires all of: the window has elapsed, we HAVE readable coverage across
  // it, and that coverage shows the payment's value never appeared in a batch
  // and never settled. Any one of those missing means we say VERIFIED and
  // admit we cannot say more.
  if (asOf - verifiedAt >= BREAK_WINDOW_MS) {
    const last = readable[readable.length - 1];
    signals.push({
      kind: "unaccounted_after_break_window",
      detail:
        `${BREAK_WINDOW_MS / 60000} minutes elapsed with ${readable.length} ` +
        "observation(s) covering the window, and this payment's value never " +
        `appeared in a pending batch (last reading ${(
          readPendingBatchMicros(last)! / 1e6
        ).toFixed(6)} USDC) nor in an onchain transfer to the seller.`,
      observation_id: last.id ?? null,
      observed_at: last.observed_at,
    });
    return {
      state: "BREAK",
      confidence: CONFIDENCE.BREAK,
      signals,
      engine_version: ENGINE_VERSION,
    };
  }

  // --- Verified, observed, but too early to say more.
  signals.push({
    kind: "insufficient_observation_coverage",
    detail:
      `Only ${Math.round((asOf - verifiedAt) / 1000)}s of observation elapsed ` +
      `since verification (break window is ${BREAK_WINDOW_MS / 60000} ` +
      "minutes); no batch or settlement signal yet.",
  });
  return {
    state: "VERIFIED",
    confidence: CONFIDENCE.VERIFIED,
    signals,
    engine_version: ENGINE_VERSION,
  };
}

/**
 * Timestamp of the most recent zero pendingBatch reading strictly before the
 * given observation — i.e. when the currently-open batch started accumulating.
 * Returns null when no such reading exists in the supplied evidence.
 */
function lastZeroBefore(
  readable: ChainObservationInput[],
  before: ChainObservationInput,
): number | null {
  const cutoff = timestamp(before.observed_at);
  let result: number | null = null;
  for (const obs of readable) {
    const t = timestamp(obs.observed_at);
    if (t >= cutoff) break;
    if (readPendingBatchMicros(obs) === 0) result = t;
  }
  return result;
}
