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

// Ballast — remediation section inside an expanded ledger row
// (DECISIONS.md #030). Human actions on a payment requiring attention:
// acknowledge, resolve-with-note. Displayed BESIDE the engine's conclusion,
// never in place of it — a resolved BREAK is still a BREAK in engine terms.

"use client";

import { useState } from "react";
import { useRemediation } from "@/hooks/use-remediation";
import type { FetchedVerificationEvent } from "@/hooks/use-observability";
import type { Inference } from "@/lib/ballast/infer-state-v1";
import { button, color, font, radius } from "@/lib/ballast/design-tokens";

// Same scoped tokens as ledger-row (BALLAST_DESIGN_SYSTEM.md §3/§4).
// Remediation is UI action, not payment state — ink treatment only, no
// state colors (§3 usage rules).
// Shared tokens (globals.css custom properties) — not a local hex table.
const T = {
  paper: color.paper,
  ink: color.ink,
  inkSecondary: color.inkSecondary,
  inkTertiary: color.inkTertiary,
  border: color.border,
  serif: font.serif,
  sans: font.sans,
  mono: font.mono,
} as const;

function formatTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace("Z", " UTC");
}

export function RemediationSection({
  event,
  liveInference,
  actionsEnabled,
}: {
  event: FetchedVerificationEvent;
  /** Always the LIVE inference — actions attach to the present, never to a
   * replayed historical view. */
  liveInference: Inference;
  /** True when this payment currently requires attention (parent decides,
   * from live state + the shared BREAK_WINDOW_MS threshold). */
  actionsEnabled: boolean;
}) {
  const { records, loading, unavailable, error, submitting, submit } =
    useRemediation(event.id);
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Quiet unless there is something to say: a history to show, actions to
  // offer, or a real problem to disclose.
  if (loading) return null;
  if (!unavailable && !error && records.length === 0 && !actionsEnabled) {
    return null;
  }

  const caption: React.CSSProperties = {
    fontFamily: T.sans,
    fontSize: 13,
    lineHeight: 1.4,
    color: T.inkTertiary,
  };

  async function act(action: "acknowledge" | "resolve") {
    setSubmitError(null);
    if (action === "resolve" && note.trim().length === 0) {
      setSubmitError("A resolution requires a note — the record must be able to defend the outcome later.");
      return;
    }
    const err = await submit(action, note.trim(), {
      payment_id: event.payment_id ?? null,
      state_at_action: liveInference.state,
      confidence_at_action: liveInference.confidence,
      engine_version_at_action: liveInference.engine_version,
    });
    if (err) {
      setSubmitError(err);
    } else {
      setNote("");
    }
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${T.border}`,
        marginTop: 12,
        paddingTop: 12,
        marginBottom: 12,
      }}
    >
      <div style={caption}>
        Remediation record — human actions, never engine input
      </div>

      {unavailable && (
        <div style={{ ...caption, marginTop: 4 }}>
          Remediation log unavailable — migration
          20260729000000_create_remediation_log.sql has not been applied to
          the database.
        </div>
      )}
      {error && (
        <div style={{ ...caption, marginTop: 4 }}>
          Failed to load remediation records: {error}
        </div>
      )}

      {records.map((r) => (
        <div key={r.id} style={{ marginTop: 8 }}>
          <div style={{ fontFamily: T.mono, fontSize: 13, color: T.inkSecondary }}>
            {formatTime(r.created_at)}{" "}
            <span style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>
              {r.action}
            </span>{" "}
            · {r.actor}
            {r.state_at_action && (
              <span style={{ color: T.inkTertiary }}>
                {" "}
                (acted on {r.state_at_action}
                {r.confidence_at_action !== null
                  ? ` @ ${r.confidence_at_action}`
                  : ""}
                {r.engine_version_at_action
                  ? `, engine ${r.engine_version_at_action}`
                  : ""}
                )
              </span>
            )}
          </div>
          {r.note && (
            <div
              style={{
                fontFamily: T.serif,
                fontSize: 14,
                lineHeight: 1.6,
                color: T.inkSecondary,
                marginTop: 2,
              }}
            >
              {r.note}
            </div>
          )}
        </div>
      ))}

      {actionsEnabled && !unavailable && (
        <div style={{ marginTop: 12 }}>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (required to resolve)"
            aria-label="Remediation note"
            style={{
              fontFamily: T.sans,
              fontSize: 14,
              lineHeight: 1.5,
              color: T.ink,
              background: T.paper,
              border: `1px solid ${T.border}`,
              borderRadius: radius,
              padding: "6px 8px",
              width: "100%",
              maxWidth: 480,
              display: "block",
            }}
          />
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {/* §7 two-variant button system, from the shared tokens:
                Primary = ink fill / paper text / 2px radius, never a pill.
                Ghost = no background, ink text, underline on hover.
                Disabled styling comes from the shared classes. */}
            <button
              className="blst-primary"
              onClick={() => act("resolve")}
              disabled={submitting}
              style={button.primary}
            >
              Resolve
            </button>
            <button
              className="blst-ghost"
              onClick={() => act("acknowledge")}
              disabled={submitting}
              style={button.ghost}
            >
              Acknowledge
            </button>
          </div>
          {submitError && (
            <div
              style={{
                fontFamily: T.sans,
                fontSize: 13,
                lineHeight: 1.4,
                // System-error token (§3) — UI feedback, deliberately NOT
                // the payment-state break color.
                color: color.systemError,
                marginTop: 8,
              }}
            >
              {submitError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
