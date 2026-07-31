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

// Ballast — Audit Export trigger (DECISIONS.md #032). Lives inside the
// Audit depth; produces a downloaded JSON document in place — no route
// change, no dialog yet (preview UI is Phase 2 design work).

"use client";

import { useRemediation } from "@/hooks/use-remediation";
import type { FetchedVerificationEvent } from "@/hooks/use-observability";
import type {
  ChainObservationInput,
  Inference,
} from "@/lib/ballast/infer-state-v1";
import {
  buildAuditExport,
  type AuditExportRemediation,
} from "@/lib/ballast/audit-export";
import { button } from "@/lib/ballast/design-tokens";

export function AuditExportButton({
  event,
  inference,
  observations,
  replayAsOf,
}: {
  event: FetchedVerificationEvent;
  /** The displayed inference — a replayed view exports exactly what is on
   * screen, declaring its as_of. */
  inference: Inference;
  observations: ChainObservationInput[];
  replayAsOf: string | null;
}) {
  // Own fetch of the remediation history. Deliberately duplicates the
  // RemediationSection's query rather than lifting shared state through
  // LedgerRow: this component mounts only while the Audit depth is open,
  // so the cost is one extra indexed read per audit session — cheaper than
  // coupling two components' data flow (see #032).
  const remediation = useRemediation(event.id);

  function handleExport() {
    const remediationBlock: AuditExportRemediation = remediation.unavailable
      ? {
          status: "unavailable",
          detail:
            "remediation_events table not present at export time " +
            "(migration 20260729000000 not applied).",
        }
      : remediation.error
        ? { status: "error", detail: remediation.error }
        : { status: "included", records: remediation.records };

    const doc = buildAuditExport({
      event,
      inference,
      observations,
      asOf: replayAsOf,
      remediation: remediationBlock,
      generatedAt: new Date().toISOString(),
    });

    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
    const idPart = (event.payment_id ?? event.id).slice(0, 18);
    const filename = `ballast-audit_${idPart}_${stamp}.json`;

    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // §7 Ghost button, from the shared tokens — no local font/hex literals.
  return (
    <button
      className="blst-ghost"
      onClick={handleExport}
      disabled={remediation.loading}
      style={button.ghost}
    >
      Export audit record (JSON)
    </button>
  );
}
