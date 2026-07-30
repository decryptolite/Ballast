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

// Ballast — "Ask Ballast" (DECISIONS.md #033), per BALLAST_DESIGN_SYSTEM.md
// §12: inline beneath the evidence signal lines, never a floating widget.
// Question and answer both render as analyst prose (serif body), explicitly
// NOT a chat-bubble UI — no bubbles, no avatars, no typing indicator.
//
// A refusal renders in the SAME typographic treatment as any other answer:
// "the evidence does not show that" is a first-class answer, not an error
// state.

"use client";

import { useState } from "react";
import type { FetchedVerificationEvent } from "@/hooks/use-observability";
import type { InferenceSignal } from "@/lib/ballast/infer-state-v1";

const T = {
  paper: "#F7F5F0",
  ink: "#1A1A17",
  inkSecondary: "#55534C",
  inkTertiary: "#8C8A80",
  border: "#E4E1D8",
  serif: `"IBM Plex Serif", Georgia, "Times New Roman", serif`,
  sans: `"IBM Plex Sans", system-ui, "Segoe UI", sans-serif`,
  mono: `"IBM Plex Mono", ui-monospace, Consolas, monospace`,
} as const;

const SUGGESTED = [
  "Why is this payment in this state?",
  "What does this confidence value mean?",
  "What changed since verification?",
];

interface Exchange {
  question: string;
  answer: string;
  source: string;
  state: string;
  confidence: number;
  engineVersion: string;
  evidenceUsed: InferenceSignal[];
  explanationLayerNote?: string;
}

export function AskBallast({
  event,
  replaying,
}: {
  event: FetchedVerificationEvent;
  /** Timeline Replay active. The route answers about the LIVE conclusion, so
   * asking while viewing a historical state would mismatch what is on
   * screen — same precedent as remediation actions (#030). */
  replaying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ephemeral by design: conversations are NOT logged as evidence — Open
  // Question #2 in BALLAST_MASTER_SPEC.md is unresolved, so nothing is
  // persisted. History lives only for this row, this session.
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ballast/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_event_id: event.id,
          question: q,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : `Request failed (${res.status})`,
        );
        return;
      }
      setExchanges((prev) => [
        ...prev,
        {
          question: q,
          answer: payload.answer,
          source: payload.source,
          state: payload.state,
          confidence: payload.confidence,
          engineVersion: payload.engine_version,
          evidenceUsed: Array.isArray(payload.evidence_used)
            ? payload.evidence_used
            : [],
          explanationLayerNote: payload.explanation_layer?.reason,
        },
      ]);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  const caption: React.CSSProperties = {
    fontFamily: T.sans,
    fontSize: 13,
    lineHeight: 1.4,
    color: T.inkTertiary,
  };
  const prose: React.CSSProperties = {
    fontFamily: T.serif,
    fontSize: 16,
    lineHeight: 1.6,
    color: T.inkSecondary,
  };

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        <button
          className="blst-audit-toggle"
          onClick={() => setOpen(true)}
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
          Ask Ballast about this payment
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${T.border}`,
        marginTop: 12,
        paddingTop: 12,
      }}
    >
      <div style={caption}>Ask Ballast — answers drawn from this payment&apos;s evidence</div>

      {replaying && (
        <div style={{ ...caption, marginTop: 6 }}>
          Answers describe the live conclusion. Return to live to ask about
          this payment.
        </div>
      )}

      {exchanges.map((x, i) => (
        <div key={i} style={{ marginTop: 16 }}>
          {/* Question: analyst's note register, not a chat bubble. */}
          <div style={{ ...prose, color: T.ink, fontWeight: 600 }}>
            {x.question}
          </div>

          {/* Answer: identical treatment whether it answers or declines. */}
          <div style={{ ...prose, marginTop: 4 }}>{x.answer}</div>

          <div style={{ ...caption, fontFamily: T.mono, marginTop: 6 }}>
            engine {x.engineVersion} · {x.state} @ {x.confidence}
          </div>

          {x.evidenceUsed.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={caption}>Evidence used</div>
              {x.evidenceUsed.map((s, j) => (
                <div key={j} style={{ marginTop: 4 }}>
                  <span
                    style={{
                      fontFamily: T.mono,
                      fontSize: 13,
                      color: T.inkTertiary,
                    }}
                  >
                    [{s.kind}]
                  </span>{" "}
                  <span style={prose}>{s.detail}</span>
                </div>
              ))}
            </div>
          )}

          {x.explanationLayerNote && (
            <div style={{ ...caption, marginTop: 6 }}>
              {x.explanationLayerNote}
            </div>
          )}
        </div>
      ))}

      {/* Calm static loading text — no spinner, no typing indicator (§7/§8). */}
      {pending && (
        <div style={{ ...caption, fontFamily: T.mono, marginTop: 12 }}>
          Consulting the evidence…
        </div>
      )}

      {error && (
        <div style={{ ...caption, marginTop: 12 }}>Request failed: {error}</div>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {SUGGESTED.map((s) => (
            <button
              key={s}
              className="blst-audit-toggle"
              onClick={() => ask(s)}
              disabled={pending || replaying}
              style={{
                fontFamily: T.sans,
                fontSize: 13,
                lineHeight: 1.4,
                color: T.ink,
                background: "none",
                border: "none",
                padding: 0,
                cursor: pending || replaying ? "default" : "pointer",
                opacity: pending || replaying ? 0.5 : 1,
                textAlign: "left",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          style={{ marginTop: 12 }}
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this payment"
            aria-label="Ask about this payment"
            disabled={pending || replaying}
            style={{
              fontFamily: T.sans,
              fontSize: 14,
              lineHeight: 1.5,
              color: T.ink,
              background: T.paper,
              border: `1px solid ${T.border}`,
              borderRadius: 2,
              padding: "6px 8px",
              width: "100%",
              maxWidth: 480,
              display: "block",
            }}
          />
        </form>
      </div>
    </div>
  );
}
