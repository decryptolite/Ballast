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

// Ballast — ledger row with four-depth expansion-in-place.
// BALLAST_DESIGN_SYSTEM.md §3/§4/§5/§7/§8/§10/§13. First styled surface;
// tokens are scoped to this component only (nothing else is restyled in
// this pass, per explicit task constraint).

"use client";

import { useMemo, useState } from "react";
import {
  inferStateV1,
  BREAK_WINDOW_MS,
  type ChainObservationInput,
  type Inference,
} from "@/lib/ballast/infer-state-v1";
import type { FetchedVerificationEvent } from "@/hooks/use-observability";
import { RemediationSection } from "@/components/dashboard/remediation-section";
import { AuditExportButton } from "@/components/dashboard/audit-export-button";

// --- Design tokens (BALLAST_DESIGN_SYSTEM.md §3/§4/§14), scoped here. ---
// IBM Plex is referenced by CSS family name with fallbacks; the font files
// are not bundled (no network font fetch at build time in this sandbox, no
// vendored assets yet) — see DECISIONS.md. Falls back gracefully.
const T = {
  paper: "#F7F5F0",
  paperRaised: "#FCFBF8",
  ink: "#1A1A17",
  inkSecondary: "#55534C",
  inkTertiary: "#8C8A80",
  border: "#E4E1D8",
  break: "#A3352B",
  breakSurface: "#F5E8E5",
  floating: "#A8874A",
  reconciled: "#6B7A6C",
  serif: `"IBM Plex Serif", Georgia, "Times New Roman", serif`,
  sans: `"IBM Plex Sans", system-ui, "Segoe UI", sans-serif`,
  mono: `"IBM Plex Mono", ui-monospace, Consolas, monospace`,
} as const;

// §10 row anatomy: four fixed-position columns. Positions never shift
// between rows — fixed template, shared with the header.
const GRID_TEMPLATE = "1fr 140px 170px 110px";

// VERIFIED has no color token in the design system (§3 defines only
// BREAK/FLOATING/RECONCILED). Rendered in --ink-secondary: VERIFIED is the
// neutral baseline fact, and the philosophy reserves color for states that
// communicate something beyond baseline. Recorded as a flagged gap decision
// in DECISIONS.md, not silently invented as a new color.
function stateColor(state: Inference["state"]): string {
  switch (state) {
    case "BREAK":
      return T.break;
    case "FLOATING":
      return T.floating;
    case "RECONCILED":
      return T.reconciled;
    case "VERIFIED":
      return T.inkSecondary;
  }
}

// Depth model (§10): Collapsed -> Priority -> Understanding -> Audit.
// Priority is the default resting state and is currently visually identical
// to Collapsed per the spec's own note ("adds nothing visually beyond
// collapsed in the current build") — so the interaction below moves between
// priority / understanding / audit, three effective visual positions until
// the Priority-vs-Collapsed distinction is finalized (spec Open Question).
type Depth = "priority" | "understanding" | "audit";

function formatTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", " UTC");
}

/** Mount once above the ledger — hover/focus/motion rules that inline
 * styles cannot express (§8 motion, §13 focus/reduced-motion). */
export function LedgerRowStyles() {
  return (
    <style>{`
      .blst-row-header {
        transition: background-color 100ms linear;
      }
      .blst-row-header:hover {
        background-color: rgba(26, 26, 23, 0.04);
      }
      .blst-row-header:focus-visible,
      .blst-audit-toggle:focus-visible {
        outline: 2px solid ${T.ink};
        outline-offset: 2px;
        transition: none;
      }
      .blst-unfold {
        animation: blst-unfold-in 200ms ease-out;
      }
      @keyframes blst-unfold-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .blst-audit-toggle:hover {
        text-decoration: underline;
      }
      @media (prefers-reduced-motion: reduce) {
        .blst-row-header { transition: none; }
        .blst-unfold { animation: none; }
      }
    `}</style>
  );
}

/** Column labels aligned to the same fixed grid as every row. */
export function LedgerHeader() {
  const label: React.CSSProperties = {
    fontFamily: T.sans,
    fontSize: 13,
    lineHeight: 1.4,
    color: T.inkTertiary,
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_TEMPLATE,
        padding: "8px 24px",
        borderBottom: `1px solid ${T.border}`,
        columnGap: 8,
      }}
    >
      <span style={label}>Endpoint</span>
      <span style={{ ...label, textAlign: "right" }}>Amount (USDC)</span>
      <span style={{ ...label, paddingLeft: 10 }}>State</span>
      <span style={{ ...label, textAlign: "right" }}>Confidence</span>
    </div>
  );
}

export function LedgerRow({
  event,
  inference,
  observations,
  events,
}: {
  event: FetchedVerificationEvent;
  inference: Inference;
  observations: ChainObservationInput[];
  events: FetchedVerificationEvent[];
}) {
  const [depth, setDepth] = useState<Depth>("priority");

  // Timeline Replay (§7): null = live. When set, it is always the exact
  // observed_at of a real recorded evidence point — never an interpolated
  // time between them.
  const [replayAsOf, setReplayAsOf] = useState<string | null>(null);

  // Discrete ticks: one per real recorded evidence point for this payment —
  // its verification event, then chain observations at/after it. Never a
  // continuous scrubber (§7: ticks must correspond to actual evidence,
  // never implying evidence between observations).
  //
  // Scale bound (DECISIONS.md #025): the observer keeps appending global
  // observations long after a payment's lifecycle has concluded — real data
  // showed 527 post-verification observations for one payment, 525 of them
  // yielding an identical terminal state. Ticks therefore run from the
  // verification event through the LAST observation the live conclusion's
  // signals actually reference (the evidence that produced the outcome);
  // observations beyond it add no information about this payment. Bounded
  // by the live inference, never the replayed one, so the tick set stays
  // stable while scrubbing. Payments whose conclusion references no
  // observation keep every post-verification tick.
  const ticks = useMemo(() => {
    const verifiedMs = Date.parse(event.observed_at);
    const relevant = observations.filter(
      (o) => Date.parse(o.observed_at) >= verifiedMs,
    );
    const refIds = new Set(
      inference.signals
        .map((s) => s.observation_id)
        .filter((id): id is string => Boolean(id) && id !== event.id),
    );
    let boundMs = -Infinity;
    for (const o of relevant) {
      if (o.id && refIds.has(o.id)) {
        boundMs = Math.max(boundMs, Date.parse(o.observed_at));
      }
    }
    const bounded =
      boundMs > -Infinity
        ? relevant.filter((o) => Date.parse(o.observed_at) <= boundMs)
        : relevant;
    return [event.observed_at, ...bounded.map((o) => o.observed_at)];
  }, [event, observations, inference]);

  // Replaying = re-running the same engine over the evidence as it existed
  // at the tick: observations and sibling events truncated to <= asOf, with
  // asOf passed through — the identical method used for every historical
  // verification recorded in DECISIONS.md #017/#021. The engine is
  // imported, never modified.
  const replayedInference = useMemo(() => {
    if (!replayAsOf) return null;
    const asOfMs = Date.parse(replayAsOf);
    return inferStateV1(
      event,
      observations.filter((o) => Date.parse(o.observed_at) <= asOfMs),
      {
        asOf: replayAsOf,
        siblingEvents: events.filter(
          (e) => Date.parse(e.observed_at) <= asOfMs,
        ),
      },
    );
  }, [replayAsOf, event, observations, events]);

  // Single display path — every render below (badge, confidence, signals,
  // audit JSON) reads from this one variable, so replay reuses the exact
  // same render logic as live rather than duplicating it.
  const displayInference = replayedInference ?? inference;

  // Does this payment currently require human attention? Same criteria and
  // the same imported BREAK_WINDOW_MS as the Operational State (#021 —
  // shared constant, thresholds structurally cannot drift). Computed from
  // the LIVE inference, never a replayed one: remediation actions attach to
  // the present. The clock read is the same bounded exception as #021's —
  // "does this need attention now" is inherently a live question.
  const requiresAttention = useMemo(() => {
    if (inference.state === "BREAK") return true;
    if (
      inference.state === "VERIFIED" &&
      inference.signals.some(
        (s) => s.kind === "insufficient_observation_coverage",
      ) &&
      Date.now() - Date.parse(event.observed_at) >= BREAK_WINDOW_MS
    ) {
      return true;
    }
    return false;
  }, [inference, event]);

  const color = stateColor(displayInference.state);
  const isBreak = displayInference.state === "BREAK";

  // Audit depth: the raw evidence behind this row's conclusion — the
  // chain_observations rows (full raw jsonb included, already fetched by
  // the page's existing query) that this inference's signals actually
  // reference. Never broader than what produced the conclusion.
  const referencedIds = new Set(
    displayInference.signals
      .map((s) => s.observation_id)
      .filter((id): id is string => Boolean(id) && id !== event.id),
  );
  const referencedObservations = observations.filter(
    (o) => o.id && referencedIds.has(o.id),
  );

  const dataCell: React.CSSProperties = {
    fontFamily: T.mono,
    fontSize: 14,
    lineHeight: 1.5,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    color: T.ink,
  };

  const preStyle: React.CSSProperties = {
    fontFamily: T.mono,
    fontSize: 12,
    lineHeight: 1.5,
    color: T.inkTertiary,
    maxHeight: 240,
    overflow: "auto",
    margin: "4px 0 0",
    whiteSpace: "pre",
  };

  return (
    <div
      id={`payment-${event.id}`}
      style={{
        background: isBreak ? T.breakSurface : T.paperRaised,
        borderBottom: `1px solid ${T.border}`,
        // §10 BREAK appearance: 4px left accent, abrupt, no transition.
        borderLeft: isBreak ? `4px solid ${T.break}` : "4px solid transparent",
      }}
    >
      {/* Collapsed/Priority: the four fixed-position columns, nothing else.
          A real <button> so Tab/Enter/Space work without extra wiring (§13). */}
      <button
        className="blst-row-header"
        aria-expanded={depth !== "priority"}
        onClick={() => {
          setDepth((d) => (d === "priority" ? "understanding" : "priority"));
          // Collapsing the row ends any replay: historical state must never
          // linger where the audit context that explains it is not visible.
          setReplayAsOf(null);
        }}
        style={{
          display: "grid",
          gridTemplateColumns: GRID_TEMPLATE,
          columnGap: 8,
          alignItems: "baseline",
          width: "100%",
          padding: "16px 24px",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        <span
          style={{
            fontFamily: T.sans,
            fontSize: 14,
            lineHeight: 1.5,
            fontWeight: 500,
            color: T.ink,
          }}
        >
          {event.endpoint}
        </span>
        <span style={dataCell}>{event.amount}</span>
        {/* State badge (§7): uppercase, +0.02em tracking, state color,
            2px left border as the only "container" — no pill fill. */}
        <span
          aria-label={`State: ${displayInference.state}`}
          style={{
            fontFamily: T.sans,
            fontSize: 13,
            lineHeight: 1.4,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color,
            borderLeft: `2px solid ${color}`,
            paddingLeft: 8,
            justifySelf: "start",
          }}
        >
          {displayInference.state}
        </span>
        <span style={dataCell}>{displayInference.confidence}</span>
      </button>

      {/* Understanding: evidence signal lines, nested +24px (§5/§10). */}
      {depth !== "priority" && (
        <div
          className="blst-unfold"
          style={{ padding: "0 24px 16px 48px" }}
        >
          {/* Unambiguous replay indicator: whenever the row is showing a
              reconstructed historical state instead of the live one, say so
              in plain text right where the changed state is explained. Ink
              tones only — color stays reserved for payment states (§3). */}
          {replayAsOf && (
            <div
              style={{
                fontFamily: T.sans,
                fontSize: 13,
                lineHeight: 1.4,
                fontWeight: 600,
                color: T.ink,
                borderTop: `2px solid ${T.ink}`,
                padding: "8px 0",
                marginBottom: 8,
              }}
            >
              Historical replay — state shown as of{" "}
              <span style={{ fontFamily: T.mono, fontWeight: 400 }}>
                {formatTime(replayAsOf)}
              </span>
              , not live.{" "}
              <button
                className="blst-audit-toggle"
                onClick={() => setReplayAsOf(null)}
                style={{
                  fontFamily: T.sans,
                  fontSize: 13,
                  fontWeight: 500,
                  color: T.ink,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Return to live
              </button>
            </div>
          )}

          <div
            style={{
              fontFamily: T.sans,
              fontSize: 13,
              lineHeight: 1.4,
              color: T.inkTertiary,
              marginBottom: 8,
            }}
          >
            verified {formatTime(event.observed_at)}
          </div>

          {/* Evidence Signal Line (§7): mono bracketed tag in ink-tertiary
              + serif explanatory sentence in ink-secondary. */}
          {displayInference.signals.map((s, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <code
                style={{
                  fontFamily: T.mono,
                  fontSize: 13,
                  color: T.inkTertiary,
                }}
              >
                [{s.kind}]
              </code>{" "}
              <span
                style={{
                  fontFamily: T.serif,
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: T.inkSecondary,
                }}
              >
                {s.detail}
              </span>
            </div>
          ))}

          {/* Remediation (#030): human actions on a payment requiring
              attention, plus the permanent history of past actions. Fed by
              the LIVE inference and hidden behind no extra depth — an
              operator acting on a BREAK should not have to dig. Actions are
              disabled while replaying (historical view is not the place to
              act on the present). */}
          <RemediationSection
            event={event}
            liveInference={inference}
            actionsEnabled={requiresAttention && !replayAsOf}
          />

          {/* Text/ghost button (§7): no background, ink text, underline on
              hover. */}
          <button
            className="blst-audit-toggle"
            aria-expanded={depth === "audit"}
            onClick={() =>
              setDepth((d) => {
                if (d === "audit") {
                  // Leaving Audit ends any replay — the control that
                  // explains and exits the historical view lives here.
                  setReplayAsOf(null);
                  return "understanding";
                }
                return "audit";
              })
            }
            style={{
              fontFamily: T.sans,
              fontSize: 14,
              lineHeight: 1.5,
              fontWeight: 500,
              color: T.ink,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            {depth === "audit" ? "Hide audit" : "Audit"}
          </button>

          {/* Audit: raw evidence + engine version, nested a further +24px. */}
          {depth === "audit" && (
            <div className="blst-unfold" style={{ paddingLeft: 24, marginTop: 12 }}>
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize: 13,
                  color: T.inkSecondary,
                  marginBottom: 8,
                }}
              >
                engine {displayInference.engine_version}
              </div>

              <div
                style={{
                  fontFamily: T.sans,
                  fontSize: 13,
                  color: T.inkTertiary,
                }}
              >
                verification_event (as fetched)
              </div>
              <pre style={preStyle}>
                {JSON.stringify(
                  // Row fields only — the full raw capture gets its own
                  // labeled block below rather than being duplicated here.
                  (({ raw: _raw, ...row }) => row)(event),
                  null,
                  2,
                )}
              </pre>

              <div
                style={{
                  fontFamily: T.sans,
                  fontSize: 13,
                  color: T.inkTertiary,
                  marginTop: 12,
                }}
              >
                verification_event raw payload (as captured at verification)
              </div>
              {event.raw !== undefined && event.raw !== null ? (
                <pre style={preStyle}>
                  {JSON.stringify(event.raw, null, 2)}
                </pre>
              ) : (
                <div
                  style={{
                    fontFamily: T.serif,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: T.inkTertiary,
                    marginTop: 4,
                  }}
                >
                  No raw payload present on this row.
                </div>
              )}

              <div
                style={{
                  fontFamily: T.sans,
                  fontSize: 13,
                  color: T.inkTertiary,
                  marginTop: 12,
                }}
              >
                referenced chain_observations (raw)
              </div>
              {referencedObservations.length > 0 ? (
                <pre style={preStyle}>
                  {JSON.stringify(referencedObservations, null, 2)}
                </pre>
              ) : (
                <div
                  style={{
                    fontFamily: T.serif,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: T.inkTertiary,
                    marginTop: 4,
                  }}
                >
                  No chain observations are referenced by this conclusion's
                  signals.
                </div>
              )}

              {/* Timeline Replay (§7): horizontal scrubber of DISCRETE tick
                  marks, one per real recorded evidence point — never a
                  continuous/interpolated scrubber. Selecting a tick swaps
                  the row's displayed state instantly (§8: no interpolation
                  between ticks). */}
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontFamily: T.sans,
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: T.inkTertiary,
                  }}
                >
                  Timeline replay — one tick per recorded evidence point
                </div>
                <div
                  role="group"
                  aria-label="Timeline replay: select a recorded evidence point"
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 4,
                    overflowX: "auto",
                    padding: "8px 0 4px",
                  }}
                >
                  {ticks.map((t) => {
                    const selected = replayAsOf === t;
                    return (
                      <button
                        key={t}
                        aria-label={`Replay as of ${formatTime(t)}`}
                        aria-pressed={selected}
                        onClick={() => setReplayAsOf(selected ? null : t)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "2px 4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "flex-end",
                          height: 22,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 2,
                            height: selected ? 16 : 10,
                            background: selected ? T.ink : T.inkTertiary,
                          }}
                        />
                      </button>
                    );
                  })}
                  <button
                    className="blst-audit-toggle"
                    aria-pressed={replayAsOf === null}
                    onClick={() => setReplayAsOf(null)}
                    style={{
                      fontFamily: T.sans,
                      fontSize: 13,
                      fontWeight: replayAsOf === null ? 600 : 500,
                      color: T.ink,
                      background: "none",
                      border: "none",
                      padding: "0 4px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Live
                  </button>
                </div>
                {/* Monospace readout of the moment being viewed (§7). */}
                <div
                  style={{
                    fontFamily: T.mono,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: replayAsOf ? T.ink : T.inkTertiary,
                  }}
                >
                  {replayAsOf
                    ? `Viewing: ${formatTime(replayAsOf)}`
                    : "Live — current evidence"}
                </div>
              </div>

              {/* Audit Export (#032): downloads the displayed conclusion
                  with its complete evidentiary basis — a replayed view
                  exports exactly what is on screen, as_of declared. */}
              <div style={{ marginTop: 16 }}>
                <AuditExportButton
                  event={event}
                  inference={displayInference}
                  observations={observations}
                  replayAsOf={replayAsOf}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
