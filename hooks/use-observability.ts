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

// Ballast — Task 4: data hook for the observability screen.
//
// Reads directly from the evidence tables (both allow public SELECT via RLS
// — verified empirically, see supabase/migrations/20260724000000) and runs
// inferStateV1 client-side. This file does not write anything, and it does
// not modify lib/ballast/infer-state-v1.ts — it only calls it.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  inferStateV1,
  type ChainObservationInput,
  type VerificationEventInput,
  type Inference,
} from "@/lib/ballast/infer-state-v1";

// How many of the most recent payments to render. Chosen so the whole set is
// readable on one scroll without pagination (out of scope for a functional,
// unpolished first screen) while still being large enough to show every
// state the live run has actually produced (see DECISIONS.md #012/#014).
const DISPLAY_LIMIT = 40;

// Poll interval for refreshing the screen. DECISIONS.md #012 found payment
// states here evolve on a tens-of-minutes timescale (pendingBatch clears,
// gateway_available moves), not seconds — a websocket/realtime subscription
// would be solving a latency problem that does not exist yet. A plain
// interval poll is simpler to reason about and sufficient; the tradeoff is
// up to POLL_INTERVAL_MS of staleness and a repeated full-table read, which
// is cheap at the current row counts (low hundreds).
const POLL_INTERVAL_MS = 15_000;

export interface ObservedPayment {
  event: VerificationEventInput & { id: string };
  inference: Inference;
}

export interface ObservabilityData {
  payments: ObservedPayment[];
  /** All verification_events rows exactly as already fetched and used as
   * siblingEvents for the inference calls above (ascending observed_at).
   * Exposed for the ledger row's Timeline Replay, which must re-run
   * inferStateV1 with the sibling set truncated to the replay moment.
   * Return-shape addition only — queries byte-identical (see DECISIONS.md
   * #023/#025). */
  events: (VerificationEventInput & { id: string })[];
  /** All chain_observations rows exactly as already fetched for the
   * inference calls above (ascending observed_at). Exposed for the ledger
   * row's Audit depth — this is a return-shape addition only; the Supabase
   * queries themselves are byte-identical to before. */
  observations: ChainObservationInput[];
  /** Current floating value: the most recent chain_observations reading of
   * pendingBatch, or null if no observation has ever carried one. */
  currentFloating: number | null;
  currentFloatingAsOf: string | null;
  loading: boolean;
  error: string | null;
  lastRefreshedAt: Date | null;
}

/** Same fallback the engine uses (column first, then raw) — duplicated here
 * deliberately rather than imported, because this task's constraints forbid
 * modifying lib/ballast/infer-state-v1.ts to export it. */
function readPendingBatchValue(obs: ChainObservationInput): number | null {
  if (obs.pending_batch !== null && obs.pending_batch !== undefined) {
    const n = Number(obs.pending_batch);
    return Number.isFinite(n) ? n : null;
  }
  const raw = obs.raw as
    | {
        gatewayBalanceResponse?: {
          data?: { balances?: Array<{ pendingBatch?: number | string }> };
        };
      }
    | undefined;
  const fromRaw = raw?.gatewayBalanceResponse?.data?.balances?.[0]?.pendingBatch;
  if (fromRaw === undefined) return null;
  const n = Number(fromRaw);
  return Number.isFinite(n) ? n : null;
}

export function useObservability(): ObservabilityData {
  const [payments, setPayments] = useState<ObservedPayment[]>([]);
  const [events, setEvents] = useState<(VerificationEventInput & { id: string })[]>(
    [],
  );
  const [observations, setObservations] = useState<ChainObservationInput[]>(
    [],
  );
  const [currentFloating, setCurrentFloating] = useState<number | null>(null);
  const [currentFloatingAsOf, setCurrentFloatingAsOf] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError(`verification_events: ${eventsResult.error.message}`);
      setLoading(false);
      return;
    }
    if (observationsResult.error) {
      setError(`chain_observations: ${observationsResult.error.message}`);
      setLoading(false);
      return;
    }

    const allEvents = eventsResult.data as (VerificationEventInput & {
      id: string;
    })[];
    const allObservations = observationsResult.data as ChainObservationInput[];

    const displayed = allEvents.slice(-DISPLAY_LIMIT).reverse();
    const computed = displayed.map((event) => ({
      event,
      inference: inferStateV1(event, allObservations, {
        siblingEvents: allEvents,
      }),
    }));

    const latestObservation =
      allObservations.length > 0
        ? allObservations[allObservations.length - 1]
        : null;

    setPayments(computed);
    setEvents(allEvents);
    setObservations(allObservations);
    setCurrentFloating(
      latestObservation ? readPendingBatchValue(latestObservation) : null,
    );
    setCurrentFloatingAsOf(latestObservation?.observed_at ?? null);
    setError(null);
    setLoading(false);
    setLastRefreshedAt(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    payments,
    events,
    observations,
    currentFloating,
    currentFloatingAsOf,
    loading,
    error,
    lastRefreshedAt,
  };
}
