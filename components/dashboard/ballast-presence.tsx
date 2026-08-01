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

// Ballast presence — BALLAST_VISUAL_IDENTITY_REBUILD.md §5.
//
// What was KEPT from the reference image: the feeling of persistent, ambient
// presence — available everywhere, moving with the operator through the
// product, rather than buried in a menu.
//
// What was DISCARDED, deliberately: gradient tiles, bubble avatars,
// floating-orb chat-widget language, and any "AI assistant" iconography. This
// is the weighted-circle mark itself, anchored in a fixed position. It does
// not drift, bounce, chase the cursor, or animate in with delight-driven
// motion. It does not perform enthusiasm. It is simply, calmly, always there.
//
// It is ANCHORED, not floating: pinned to the bottom-left corner with a
// hairline top and right edge, so it reads as part of the page's structure
// rather than a card hovering above it. There is no shadow.
//
// Scope note: this is presentation only. It wraps the existing evidence-scoped,
// guardrail-verified Ask Ballast pipeline (DECISIONS.md #033/#035) — every
// answer still comes from the same server route, the same scoped retrieval and
// the same deterministic guardrails.

"use client";

import { useEffect, useRef, useState } from "react";
import { BallastMark } from "@/components/brand/ballast-mark";
import {
  color,
  space,
  text,
  evidenceLine,
  button,
} from "@/lib/ballast/design-tokens";
import type { InferenceSignal } from "@/lib/ballast/infer-state-v1";

interface Exchange {
  question: string;
  answer: string;
  state: string;
  confidence: number;
  engineVersion: string;
  evidenceUsed: InferenceSignal[];
}

export function BallastPresence() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  /**
   * The presence answers about whichever payment the operator has open. The
   * ledger rows publish their id via `#payment-{id}` anchors; the most
   * recently expanded row registers itself on this custom event. Without a
   * payment in context there is nothing evidence-scoped to ask about, and the
   * panel says so rather than inventing a broader scope.
   */
  const [contextId, setContextId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onContext(e: Event) {
      const detail = (e as CustomEvent<{ verificationEventId: string | null }>)
        .detail;
      setContextId(detail?.verificationEventId ?? null);
    }
    window.addEventListener("ballast:payment-context", onContext);
    return () =>
      window.removeEventListener("ballast:payment-context", onContext);
  }, []);

  // Escape closes. No other global key handling — this must never feel like
  // it is competing for the operator's attention.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length === 0 || pending || !contextId) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ballast/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verification_event_id: contextId,
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
          state: payload.state,
          confidence: payload.confidence,
          engineVersion: payload.engine_version,
          evidenceUsed: Array.isArray(payload.evidence_used)
            ? payload.evidence_used
            : [],
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
    ...text.caption,
    color: color.textTertiary,
  };
  const prose: React.CSSProperties = {
    ...text.body,
    color: color.textSecondary,
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        zIndex: 40,
        // Anchored to the corner, not floating in space.
        background: color.surface,
        borderTop: `1px solid ${color.line}`,
        borderRight: `1px solid ${color.line}`,
        maxWidth: open ? 460 : undefined,
        width: open ? "min(460px, 100vw)" : undefined,
      }}
    >
      {open && (
        <div
          ref={panelRef}
          className="blst-unfold"
          style={{
            padding: space.lg,
            maxHeight: "60vh",
            overflowY: "auto",
            borderBottom: `1px solid ${color.line}`,
          }}
        >
          <div style={caption}>
            Ask Ballast — answers drawn from a payment&apos;s recorded evidence
          </div>

          {!contextId && (
            <div style={{ ...prose, marginTop: space.sm }}>
              Open a payment in the ledger to ask about it. Answers are scoped
              to one payment&apos;s evidence, so there is nothing to draw on
              until one is in context.
            </div>
          )}

          {exchanges.map((x, i) => (
            <div key={i} style={{ marginTop: space.md }}>
              <div style={{ ...prose, color: color.textPrimary, fontWeight: 600 }}>
                {x.question}
              </div>
              <div style={{ ...prose, marginTop: space.xxs }}>{x.answer}</div>
              <div
                style={{
                  ...text.data,
                  fontSize: 13,
                  color: color.textTertiary,
                  marginTop: space.xs,
                }}
              >
                engine {x.engineVersion} · {x.state} @ {x.confidence}
              </div>
              {x.evidenceUsed.length > 0 && (
                <div style={{ marginTop: space.xs }}>
                  <div style={caption}>Evidence used</div>
                  {x.evidenceUsed.map((s, j) => (
                    <div key={j} style={{ marginTop: space.xxs }}>
                      <span style={evidenceLine.tag}>[{s.kind}]</span>{" "}
                      <span style={evidenceLine.detail}>{s.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Calm static text. No typing indicator — that would imply
              liveliness and personality, which contradicts the analyst tone. */}
          {pending && (
            <div
              style={{
                ...text.data,
                fontSize: 13,
                color: color.textTertiary,
                marginTop: space.md,
              }}
            >
              Consulting the evidence…
            </div>
          )}
          {error && (
            <div style={{ ...caption, marginTop: space.md }}>
              Request failed: {error}
            </div>
          )}

          {contextId && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
              style={{ marginTop: space.md }}
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about this payment"
                aria-label="Ask about this payment"
                disabled={pending}
                style={{
                  ...text.ui,
                  fontWeight: 400,
                  color: color.textPrimary,
                  background: color.canvas,
                  border: `1px solid ${color.line}`,
                  borderRadius: 2,
                  padding: "6px 8px",
                  width: "100%",
                  display: "block",
                }}
              />
            </form>
          )}
        </div>
      )}

      {/* The presence itself: the mark, anchored. Not an avatar, not an orb,
          not an "AI" glyph — the same weighted circle as the wordmark. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close Ask Ballast" : "Open Ask Ballast"}
        style={{
          ...button.ghost,
          display: "flex",
          alignItems: "center",
          gap: space.sm,
          padding: `${space.sm}px ${space.md}px`,
          width: "100%",
          background: "none",
        }}
      >
        <BallastMark size={18} style={{ color: color.accent }} />
        <span style={{ ...text.ui, color: color.textSecondary }}>
          Ask Ballast
        </span>
      </button>
    </div>
  );
}
