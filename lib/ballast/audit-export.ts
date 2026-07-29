/**
 * Ballast — Audit Export builder (DECISIONS.md #032).
 *
 * Assembles a single, self-describing JSON document for one payment: the
 * recorded facts, the derived conclusion with its complete evidentiary
 * basis, the human remediation history, and an explicit statement of what
 * is fact versus inference. Layer 4's promise ("can this survive scrutiny
 * months later") made portable.
 *
 * PURE builder — no I/O, no clock (generated_at is an input), no engine
 * changes. Version-stamped independently of the engine so the document
 * format can evolve without touching inference.
 */

import type {
  ChainObservationInput,
  Inference,
  VerificationEventInput,
} from "./infer-state-v1";

export const AUDIT_EXPORT_VERSION = "1";

export interface AuditExportRemediation {
  /** "included" when the remediation log was readable; otherwise an honest
   * status — never silently absent. */
  status: "included" | "unavailable" | "error";
  detail?: string;
  records?: unknown[];
}

export interface AuditExportInput {
  event: VerificationEventInput & { id: string; raw?: unknown };
  /** The conclusion being exported — the DISPLAYED one, so a historical
   * replay exports exactly what was on screen, with its basis declared. */
  inference: Inference;
  observations: ChainObservationInput[];
  /** Replay moment, or null when exporting the live view. */
  asOf: string | null;
  remediation: AuditExportRemediation;
  /** ISO timestamp supplied by the caller — the builder never reads the
   * clock, keeping it deterministic for identical inputs. */
  generatedAt: string;
}

export function buildAuditExport(input: AuditExportInput) {
  const { event, inference, observations, asOf, remediation, generatedAt } =
    input;

  // Evidence scope: the same relevant-evidence bound as Timeline Replay
  // (#025) — observations from verification through the last one this
  // conclusion's signals reference; every post-verification observation
  // when none is referenced; truncated to asOf for a replayed view.
  const verifiedMs = Date.parse(event.observed_at);
  const asOfMs = asOf ? Date.parse(asOf) : null;
  const referencedIds = new Set(
    inference.signals
      .map((s) => s.observation_id)
      .filter((id): id is string => Boolean(id) && id !== event.id),
  );
  let boundMs = -Infinity;
  for (const o of observations) {
    if (o.id && referencedIds.has(o.id)) {
      boundMs = Math.max(boundMs, Date.parse(o.observed_at));
    }
  }
  const includedObservations = observations.filter((o) => {
    const t = Date.parse(o.observed_at);
    if (t < verifiedMs) return false;
    if (asOfMs !== null && t > asOfMs) return false;
    if (boundMs > -Infinity && t > boundMs) return false;
    return true;
  });

  const hasSumAttribution = inference.signals.some(
    (s) => s.kind === "pending_batch_sum_attributed",
  );

  return {
    ballast_audit_export: {
      export_version: AUDIT_EXPORT_VERSION,
      generated_at: generatedAt,
      view:
        asOf === null
          ? { mode: "live" as const }
          : { mode: "historical_replay" as const, as_of: asOf },

      payment: {
        // The verification_events row as recorded, full raw capture
        // included — the primary fact this document rests on.
        ...event,
      },

      conclusion: {
        state: inference.state,
        confidence: inference.confidence,
        engine_version: inference.engine_version,
        signals: inference.signals,
      },

      evidence: {
        chain_observations: includedObservations,
        scope:
          "Chain observations from this payment's verification through the " +
          "last observation referenced by the conclusion's signals" +
          (asOf ? ", truncated to the replay moment" : "") +
          ". Full raw captures included. Rows are drawn verbatim from the " +
          "append-only evidence log.",
      },

      remediation,

      reproducibility: {
        statement:
          `This conclusion is re-derivable by inferStateV1 ` +
          `(${inference.engine_version}) over the included verification ` +
          `event and chain observations. Same evidence + same engine ` +
          `version = same output, always (DECISIONS.md #004).`,
        ...(hasSumAttribution
          ? {
              limitation:
                "Independent recomputation of the " +
                "pending_batch_sum_attributed signal additionally requires " +
                "the sibling verification_events of the same open batch, " +
                "which are not embedded here (they are other payments' " +
                "records) but remain available in the append-only " +
                "verification_events log referenced by this document.",
            }
          : {}),
      },

      epistemic_statement: {
        verified:
          "VERIFIED is a recorded fact: Circle's Gateway facilitator " +
          "accepted the payment authorization (the settlement reference in " +
          "the payment record is Circle's internal UUID, not an onchain " +
          "transaction hash).",
        floating:
          "FLOATING is a derived conclusion from Circle's pendingBatch " +
          "accumulator — offchain, Circle-asserted, aggregate.",
        reconciled:
          "RECONCILED is a probabilistic, confidence-scored inference. " +
          "Per-payment onchain settlement proof does not exist in the " +
          "observed system (DECISIONS.md #008); RECONCILED is therefore " +
          "structurally capped below certainty and must never be read as " +
          "hash-proven fact.",
        remediation:
          "Remediation records are human operational actions, " +
          "architecturally separate from system evidence. They never " +
          "influence the engine's conclusion (DECISIONS.md #030).",
      },
    },
  };
}
