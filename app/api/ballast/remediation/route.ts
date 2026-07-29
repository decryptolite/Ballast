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

// Ballast — remediation write path (DECISIONS.md #030).
//
// The ONLY way a remediation record is created. The browser's anon key is
// read-only on remediation_events; inserts require the service role, which
// lives server-side here behind the app's session gate. Append-only:
// there is no update or delete endpoint, deliberately, and the database
// REVOKEs both even from the service role.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VALID_ACTIONS = ["acknowledge", "resolve"] as const;
type RemediationAction = (typeof VALID_ACTIONS)[number];

const MAX_NOTE_LENGTH = 2000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // Same session gate as the rest of the dashboard (proxy.ts). A demo-grade
  // gate, but the write path must be no weaker than the pages it serves.
  if (req.cookies.get("session")?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    verification_event_id,
    payment_id,
    action,
    note,
    state_at_action,
    confidence_at_action,
    engine_version_at_action,
  } = body as Record<string, unknown>;

  if (
    typeof verification_event_id !== "string" ||
    !UUID_RE.test(verification_event_id)
  ) {
    return NextResponse.json(
      { error: "verification_event_id must be a UUID" },
      { status: 400 },
    );
  }
  if (
    typeof action !== "string" ||
    !VALID_ACTIONS.includes(action as RemediationAction)
  ) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    );
  }
  const noteText =
    typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : "";
  // A resolution without an explanation is worthless for audit — the whole
  // point of the record is defending the outcome later.
  if (action === "resolve" && noteText.length === 0) {
    return NextResponse.json(
      { error: "resolve requires a non-empty note" },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("remediation_events")
    .insert({
      verification_event_id,
      payment_id: typeof payment_id === "string" ? payment_id : null,
      action,
      note: noteText.length > 0 ? noteText : null,
      // Single demo identity — placeholder until real auth exists
      // (BALLAST_MASTER_SPEC.md §16, DECISIONS.md #030).
      actor: "operator",
      state_at_action:
        typeof state_at_action === "string" ? state_at_action : null,
      confidence_at_action:
        typeof confidence_at_action === "number" &&
        Number.isFinite(confidence_at_action)
          ? confidence_at_action
          : null,
      engine_version_at_action:
        typeof engine_version_at_action === "string"
          ? engine_version_at_action
          : null,
    })
    .select()
    .single();

  if (error) {
    console.error("[ballast] remediation insert failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ record: data }, { status: 201 });
}
