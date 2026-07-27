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

// Ballast — Task 4: the first real observability screen.
//
// Functional, not designed (per task scope — no design system yet). Every
// number on this page comes from a real query against verification_events
// and chain_observations, and a real call to inferStateV1. Nothing here is
// mocked, simulated, or hardcoded as a placeholder.

"use client";

import { useObservability } from "@/hooks/use-observability";

function formatUsdc(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(6);
}

function formatTime(iso: string | null): string {
  if (!iso) return "no observations yet";
  return new Date(iso).toISOString().replace("T", " ").replace("Z", " UTC");
}

export default function ObservePage() {
  const {
    payments,
    currentFloating,
    currentFloatingAsOf,
    loading,
    error,
    lastRefreshedAt,
  } = useObservability();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>
        Ballast — Observability
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
        Every value below is a real query against verification_events /
        chain_observations, run through inferStateV1 (v1). No mocked data.
      </p>

      <div
        style={{
          border: "1px solid #ccc",
          padding: 12,
          marginBottom: 20,
          fontSize: 14,
        }}
      >
        <strong>Currently floating (pending_batch):</strong>{" "}
        {loading ? "loading..." : `${formatUsdc(currentFloating)} USDC`}
        <div style={{ fontSize: 12, color: "#666" }}>
          as of {formatTime(currentFloatingAsOf)} — offchain, Circle-asserted,
          aggregate across all sellers' payments (see DECISIONS.md #008).
          Not per-payment settlement proof.
        </div>
      </div>

      {error && (
        <div style={{ color: "crimson", marginBottom: 16 }}>
          Error loading evidence: {error}
        </div>
      )}

      {loading && payments.length === 0 ? (
        <p>Loading real evidence...</p>
      ) : payments.length === 0 ? (
        <p>No verification_events found.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #000", textAlign: "left" }}>
              <th style={{ padding: "4px 8px" }}>Verified at</th>
              <th style={{ padding: "4px 8px" }}>Endpoint</th>
              <th style={{ padding: "4px 8px" }}>Amount</th>
              <th style={{ padding: "4px 8px" }}>State</th>
              <th style={{ padding: "4px 8px" }}>Confidence</th>
              <th style={{ padding: "4px 8px" }}>Signals</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(({ event, inference }) => (
              <tr key={event.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                  {formatTime(event.observed_at)}
                </td>
                <td style={{ padding: "4px 8px" }}>{event.endpoint}</td>
                <td style={{ padding: "4px 8px" }}>{event.amount} USDC</td>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>
                  {inference.state}
                </td>
                <td style={{ padding: "4px 8px" }}>{inference.confidence}</td>
                <td style={{ padding: "4px 8px" }}>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {inference.signals.map((s, i) => (
                      <li key={i} style={{ marginBottom: 2 }}>
                        <code>[{s.kind}]</code> {s.detail}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 11, color: "#999", marginTop: 20 }}>
        {payments.length} payment(s) shown (most recent {payments.length},
        newest first) · engine v1 · last refreshed{" "}
        {lastRefreshedAt ? lastRefreshedAt.toISOString() : "never"} · polls
        every 15s.
      </p>
    </div>
  );
}
