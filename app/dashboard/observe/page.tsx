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

// Ballast — the observability screen, styled per BALLAST_DESIGN_SYSTEM.md
// §4/§5/§6/§7. Every number on this page comes from a real query against
// verification_events and chain_observations, and a real call to
// inferStateV1. Nothing here is mocked, simulated, or hardcoded.

"use client";

import { useObservability } from "@/hooks/use-observability";
import { OperationalState } from "@/components/dashboard/operational-state";
import { LedgerHeader, LedgerRow } from "@/components/dashboard/ledger-row";
import { color, layout, space, text } from "@/lib/ballast/design-tokens";

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
    events,
    observations,
    currentFloating,
    currentFloatingAsOf,
    loading,
    error,
    lastRefreshedAt,
  } = useObservability();

  return (
    <div style={{ maxWidth: layout.content, margin: "0 auto" }}>
      <h1 style={{ ...text.h1, color: color.ink, margin: 0 }}>
        Ballast
      </h1>
      {/* Narrative sits at the reading measure (§5), not the full ledger width. */}
      <p
        style={{
          ...text.body,
          color: color.inkSecondary,
          maxWidth: layout.narrative,
          margin: `${space.xs}px 0 ${space.xl}px`,
        }}
      >
        Every value below is a real query against verification_events and
        chain_observations, run through inferStateV1 (v1).
      </p>

      <OperationalState />

      {/* Float total: a panel, so --paper-raised and a hairline border (§3/§5),
          never a shadow. */}
      <section
        style={{
          background: color.paperRaised,
          border: `1px solid ${color.border}`,
          padding: space.lg,
          marginBottom: space.xl,
        }}
        aria-label="Currently floating"
      >
        <div style={{ ...text.caption, color: color.inkTertiary }}>
          Currently floating (pending_batch)
        </div>
        <div
          style={{
            ...text.dataLg,
            color: color.ink,
            marginTop: space.xxs,
          }}
        >
          {loading ? "Reading evidence…" : `${formatUsdc(currentFloating)} USDC`}
        </div>
        <div
          style={{
            ...text.caption,
            color: color.inkTertiary,
            maxWidth: layout.narrative,
            marginTop: space.xs,
          }}
        >
          as of {formatTime(currentFloatingAsOf)} — offchain, Circle-asserted,
          aggregate across all of this seller&apos;s payments. Not per-payment
          settlement proof.
        </div>
      </section>

      {/* §3: a data-loading failure is generic UI chrome — it uses the SYSTEM
          error tone, never --break, which belongs to payment state alone. */}
      {error && (
        <div
          style={{
            ...text.ui,
            color: color.systemError,
            marginBottom: space.md,
          }}
        >
          Evidence could not be loaded — {error}
        </div>
      )}

      {loading && payments.length === 0 ? (
        <p style={{ ...text.data, color: color.inkTertiary }}>
          Reading evidence…
        </p>
      ) : payments.length === 0 ? (
        <p style={{ ...text.body, color: color.inkSecondary }}>
          No payments observed yet.
        </p>
      ) : (
        <div>
          <LedgerHeader />
          {payments.map(({ event, inference }) => (
            <LedgerRow
              key={event.id}
              event={event}
              inference={inference}
              observations={observations}
              events={events}
            />
          ))}
        </div>
      )}

      <p
        style={{
          ...text.caption,
          color: color.inkTertiary,
          marginTop: space.lg,
        }}
      >
        {payments.length} payment(s) shown, newest first · engine v1 · last
        refreshed{" "}
        {lastRefreshedAt ? lastRefreshedAt.toISOString() : "never"} · polls
        every 15s
      </p>
    </div>
  );
}
