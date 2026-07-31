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

// Ballast — Operational State, styled per BALLAST_DESIGN_SYSTEM.md §7/§11.
//
// Full-width band at the top of the content. Background is --paper, the same
// as the page: it is not a card and does not float above the content — it IS
// the top of the content, always present (§7). In attention state it takes a
// 4px --break left border; in calm state it carries no accent at all, and
// that absence is itself part of the signal.
//
// Styling only — no logic, query, or threshold was changed in this pass.

"use client";

import { useState } from "react";
import { useOperationalState } from "@/hooks/use-operational-state";
import {
  color,
  space,
  text,
  borderWidth,
  evidenceLine,
} from "@/lib/ballast/design-tokens";

/** §7 loading/error voice: calm, static, monospace. No spinner. State what is
 * known and what is not — never apologise theatrically. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...text.dataLg, color: color.inkTertiary, marginBottom: space.lg }}>
      {children}
    </div>
  );
}

export function OperationalState() {
  const { level, message, flaggedPayments, loading, error } =
    useOperationalState();
  const [expanded, setExpanded] = useState(false);

  if (loading) return <Band>Reading evidence…</Band>;
  if (error) return <Band>Operational state unavailable — {error}</Band>;

  const attention = level === "attention";

  // §7: accent ONLY in the attention state. --break here is the
  // directly-associated accent for payments the engine flagged, which is
  // exactly the permitted use under §16.
  const band: React.CSSProperties = {
    background: color.paper,
    padding: attention
      ? `${space.md}px ${space.lg}px`
      : `${space.md}px 0`,
    marginBottom: space.lg,
    ...(attention
      ? { borderLeft: `${borderWidth.accent}px solid ${color.break}` }
      : {}),
  };

  const headline: React.CSSProperties = {
    ...text.dataLg,
    color: attention ? color.break : color.ink,
  };

  return (
    <section style={band} aria-label="Current operational state">
      {attention ? (
        <button
          className="blst-ghost"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          style={{
            ...headline,
            background: "none",
            border: "none",
            borderRadius: 0,
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {message}
        </button>
      ) : (
        <div style={headline}>{message}</div>
      )}

      {/*
        Inline list rather than a pure scroll-to: this component must stay
        correct even when the ledger below has not rendered the row in
        question (it shows only the most recent 40 — see
        hooks/use-observability.ts DISPLAY_LIMIT). Depending solely on
        scrolling to a DOM node that might not exist would violate the same
        independence requirement this component exists to satisfy. The anchor
        remains a best-effort convenience when the row IS on screen.
      */}
      {attention && expanded && (
        <ul
          className="blst-unfold"
          style={{
            listStyle: "none",
            margin: 0,
            marginTop: space.sm,
            padding: 0,
            paddingLeft: space.lg,
          }}
        >
          {flaggedPayments.map(({ event, inference, reason, elapsedMs }) => (
            <li key={event.id} style={{ marginBottom: space.sm }}>
              <a
                className="blst-ghost"
                href={`#payment-${event.id}`}
                style={{ ...text.ui, color: color.ink }}
              >
                {event.endpoint}
              </a>
              <span style={{ ...text.data, color: color.inkSecondary }}>
                {" "}
                {event.amount} USDC
              </span>
              <div style={{ marginTop: space.xxs }}>
                <span style={evidenceLine.tag}>
                  [{reason === "break" ? "break" : "insufficient_observation_coverage"}]
                </span>{" "}
                <span style={evidenceLine.detail}>
                  {Math.floor(elapsedMs / 60_000)} minutes since verification;
                  engine reports {inference.state} at confidence{" "}
                  {inference.confidence}.
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
