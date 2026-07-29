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

// Plain by design (Phase 2 does the styling pass) — no color, no icons.
// Just correct, live, prominent text, per this task's explicit scope.

"use client";

import { useState } from "react";
import { useOperationalState } from "@/hooks/use-operational-state";

export function OperationalState() {
  const { level, message, flaggedPayments, loading, error } =
    useOperationalState();
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 16 }}>
        Loading operational state...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 16 }}>
        Operational state unavailable: {error}
      </div>
    );
  }

  const clickable = level === "attention";

  return (
    <div style={{ marginBottom: 16 }}>
      {clickable ? (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            fontSize: 18,
            fontWeight: "bold",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
            font: "inherit",
          }}
        >
          {message}
        </button>
      ) : (
        <div style={{ fontSize: 18, fontWeight: "bold" }}>{message}</div>
      )}

      {/*
        Inline list rather than a pure scroll-to: this component is required
        to be correct even when the ledger below hasn't rendered the row in
        question (it only shows the most recent 40 payments — see
        hooks/use-observability.ts DISPLAY_LIMIT). Depending solely on
        scrolling to a DOM node that might not exist would violate the same
        independence requirement this component exists to satisfy. The
        anchor link is still attempted as a best-effort convenience when the
        row *is* on screen.
      */}
      {clickable && expanded && (
        <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 14 }}>
          {flaggedPayments.map(({ event, inference, reason, elapsedMs }) => (
            <li key={event.id} style={{ marginBottom: 6 }}>
              <a href={`#payment-${event.id}`}>
                {event.endpoint} — {event.amount} USDC
              </a>{" "}
              — {reason === "break" ? "BREAK" : "no observation coverage"},{" "}
              {Math.floor(elapsedMs / 60_000)}m since verification, state=
              {inference.state} confidence={inference.confidence}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
