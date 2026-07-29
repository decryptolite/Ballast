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

// Ballast — Operational State: an independent evidence query, deliberately
// NOT sourced from useObservability's state. The whole point of this hook
// is that it must be correct even if the ledger hasn't rendered yet or is
// showing stale data — so it does its own fetch, on its own timer, against
// the same tables, and never reads anything the ledger computed.
//
// Does not modify lib/ballast/infer-state-v1.ts, chain-observer.mts, or
// hooks/use-observability.ts — imports inferStateV1 and BREAK_WINDOW_MS
// read-only, and duplicates the ~15-line query rather than sharing it with
// useObservability, on purpose (see DECISIONS.md — sharing a query would
// reintroduce exactly the coupling this component exists to avoid).

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  inferStateV1,
  BREAK_WINDOW_MS,
  type ChainObservationInput,
  type VerificationEventInput,
  type Inference,
} from "@/lib/ballast/infer-state-v1";

// Deliberately fresher than the ledger's 15s poll (hooks/use-observability.ts)
// — per the requirement that this component must be at least as fresh as the
// ledger, ideally fresher. Tradeoff: more frequent reads of two tables that
// are cheap at current row counts (low hundreds); revisit if row counts grow
// enough to make a second independent poller meaningfully expensive.
const POLL_INTERVAL_MS = 10_000;

export type OperationalLevel = "attention" | "floating" | "calm";

export interface FlaggedPayment {
  event: VerificationEventInput & { id: string };
  inference: Inference;
  reason: "break" | "stale_coverage";
  elapsedMs: number;
}

export interface OperationalStateData {
  level: OperationalLevel;
  message: string;
  flaggedPayments: FlaggedPayment[];
  floatingCount: number;
  totalEvaluated: number;
  loading: boolean;
  error: string | null;
  lastRefreshedAt: Date | null;
}

function minutesSince(ms: number): number {
  return Math.floor(ms / 60_000);
}

export function useOperationalState(): OperationalStateData {
  const [state, setState] = useState<
    Omit<OperationalStateData, "loading" | "lastRefreshedAt">
  >({
    level: "calm",
    message: "Loading operational state...",
    flaggedPayments: [],
    floatingCount: 0,
    totalEvaluated: 0,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();

    const [eventsResult, observationsResult] = await Promise.all([
      supabase
        .from("verification_events")
        .select(
          "id, payment_id, amount, endpoint, authorization_ref, observed_at",
        )
        .order("observed_at", { ascending: true }),
      supabase
        .from("chain_observations")
        .select(
          "id, observed_at, gateway_available, gateway_withdrawable, pending_batch, onchain_tx, block, raw",
        )
        .order("observed_at", { ascending: true }),
    ]);

    if (eventsResult.error) {
      setState((s) => ({
        ...s,
        error: `verification_events: ${eventsResult.error!.message}`,
      }));
      setLoading(false);
      return;
    }
    if (observationsResult.error) {
      setState((s) => ({
        ...s,
        error: `chain_observations: ${observationsResult.error!.message}`,
      }));
      setLoading(false);
      return;
    }

    const allEvents = eventsResult.data as (VerificationEventInput & {
      id: string;
    })[];
    const allObservations = observationsResult.data as ChainObservationInput[];
    const now = Date.now();

    const flagged: FlaggedPayment[] = [];
    let floatingCount = 0;

    for (const event of allEvents) {
      const inference = inferStateV1(event, allObservations, {
        siblingEvents: allEvents,
      });
      const verifiedAtMs = Date.parse(event.observed_at);
      const elapsedMs = now - verifiedAtMs;

      if (inference.state === "BREAK") {
        flagged.push({ event, inference, reason: "break", elapsedMs });
        continue;
      }

      if (inference.state === "FLOATING") {
        floatingCount++;
        continue;
      }

      // A fresh payment carries an `insufficient_observation_coverage`
      // signal for the first few seconds of its life as a matter of course
      // — that is not something anyone needs to look at. Only surface it
      // once real wall-clock time since verification exceeds the same
      // window the engine itself uses to decide BREAK (BREAK_WINDOW_MS):
      // by that point, the absence of coverage is itself the problem
      // (the observer likely isn't running), which is exactly as
      // actionable as a BREAK, not merely "still early."
      const hasCoverageGapSignal = inference.signals.some(
        (s) => s.kind === "insufficient_observation_coverage",
      );
      if (
        inference.state === "VERIFIED" &&
        hasCoverageGapSignal &&
        elapsedMs >= BREAK_WINDOW_MS
      ) {
        flagged.push({ event, inference, reason: "stale_coverage", elapsedMs });
      }
    }

    let level: OperationalLevel;
    let message: string;

    if (flagged.length > 0) {
      level = "attention";
      if (flagged.length === 1 && flagged[0].reason === "break") {
        message = `1 unresolved BREAK (${minutesSince(flagged[0].elapsedMs)}m)`;
      } else {
        message = `${flagged.length} payment(s) require attention`;
      }
    } else if (floatingCount > 0) {
      level = "floating";
      message = `${floatingCount} payment${floatingCount === 1 ? "" : "s"} currently floating`;
    } else {
      level = "calm";
      message = "All observations reconciled";
    }

    setState({
      level,
      message,
      flaggedPayments: flagged,
      floatingCount,
      totalEvaluated: allEvents.length,
      error: null,
    });
    setLoading(false);
    setLastRefreshedAt(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { ...state, loading, lastRefreshedAt };
}
