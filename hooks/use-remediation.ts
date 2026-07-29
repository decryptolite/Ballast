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

// Ballast — remediation records for one payment (DECISIONS.md #030).
// Reads via the public anon key (read-only on this table); writes go
// through the session-gated server route. These are HUMAN-ACTION records —
// nothing here ever feeds inferStateV1.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RemediationRecord {
  id: string;
  verification_event_id: string;
  payment_id: string | null;
  action: "acknowledge" | "resolve";
  note: string | null;
  actor: string;
  state_at_action: string | null;
  confidence_at_action: number | null;
  engine_version_at_action: string | null;
  created_at: string;
}

export interface RemediationContext {
  payment_id: string | null;
  state_at_action: string;
  confidence_at_action: number;
  engine_version_at_action: string;
}

export function useRemediation(verificationEventId: string) {
  const [records, setRecords] = useState<RemediationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  /** True when the remediation_events table does not exist yet (migration
   * 20260729000000 not applied) — surfaced honestly, never swallowed. */
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error: qError } = await supabase
      .from("remediation_events")
      .select("*")
      .eq("verification_event_id", verificationEventId)
      .order("created_at", { ascending: true });

    if (qError) {
      if (/does not exist|schema cache/i.test(qError.message)) {
        setUnavailable(true);
      } else {
        setError(qError.message);
      }
      setLoading(false);
      return;
    }
    setRecords(data as RemediationRecord[]);
    setUnavailable(false);
    setError(null);
    setLoading(false);
  }, [verificationEventId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = useCallback(
    async (
      action: "acknowledge" | "resolve",
      note: string,
      context: RemediationContext,
    ): Promise<string | null> => {
      setSubmitting(true);
      try {
        const res = await fetch("/api/ballast/remediation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verification_event_id: verificationEventId,
            action,
            note,
            ...context,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          return typeof payload.error === "string"
            ? payload.error
            : `Request failed (${res.status})`;
        }
        await refresh();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      } finally {
        setSubmitting(false);
      }
    },
    [verificationEventId, refresh],
  );

  return { records, loading, unavailable, error, submitting, submit };
}
