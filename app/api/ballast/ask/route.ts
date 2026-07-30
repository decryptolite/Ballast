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

// Ballast — Evidence Assistant route (DECISIONS.md #033).
//
// THE STRUCTURAL GUARANTEE lives here: the client sends only a payment id
// and a question. Everything authoritative — the evidence, the state, the
// confidence, the signals — is retrieved and computed SERVER-SIDE and is
// never accepted from, or parsed out of, model text. The explanation layer
// receives facts and returns prose; if that prose fails validation it is
// discarded and the deterministic answer is used instead.
//
// Read-only: this route writes nothing.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  inferStateV1,
  type ChainObservationInput,
  type VerificationEventInput,
} from "@/lib/ballast/infer-state-v1";
import {
  classifyQuestion,
  composeDeterministicAnswer,
  REFUSAL,
  SCOPE_NOTE,
  type AssistantFacts,
} from "@/lib/ballast/assistant";
import { validateAnswer } from "@/lib/ballast/assistant-guardrails";
import { getExplanationProvider } from "@/lib/ballast/assistant-provider";

const MAX_QUESTION_LENGTH = 500;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (req.cookies.get("session")?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { verification_event_id, question } = body as Record<string, unknown>;

  if (
    typeof verification_event_id !== "string" ||
    !UUID_RE.test(verification_event_id)
  ) {
    return NextResponse.json(
      { error: "verification_event_id must be a UUID" },
      { status: 400 },
    );
  }
  if (typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 },
    );
  }
  const q = question.trim().slice(0, MAX_QUESTION_LENGTH);

  // --- Evidence Retriever -------------------------------------------------
  // Scoped IDENTICAL to inferStateV1's actual input for this payment: the
  // same two tables, same ordering, same sibling-event set the ledger hook
  // passes. Not a looser or separate query — the retrieval and the inference
  // see exactly the same evidence, so the assistant can never discuss
  // anything the conclusion was not derived from.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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

  if (eventsResult.error || observationsResult.error) {
    const message =
      eventsResult.error?.message ?? observationsResult.error?.message;
    console.error("[ballast/ask] evidence retrieval failed:", message);
    return NextResponse.json({ error: "Evidence unavailable" }, { status: 500 });
  }

  const allEvents = eventsResult.data as (VerificationEventInput & {
    id: string;
  })[];
  const allObservations = observationsResult.data as ChainObservationInput[];
  const event = allEvents.find((e) => e.id === verification_event_id);
  if (!event) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // --- Inference ----------------------------------------------------------
  // Recomputed server-side over that same evidence. Because inferStateV1 is
  // pure and deterministic (DECISIONS.md #004), this is byte-identical to the
  // conclusion the row displays — it is the same inference, independently
  // derived, not a different one. Computing it here rather than trusting the
  // client means no caller can hand the assistant a state it did not earn.
  const inference = inferStateV1(event, allObservations, {
    siblingEvents: allEvents,
  });

  const verifiedMs = Date.parse(event.observed_at);
  const inScopeObservations = allObservations.filter(
    (o) => Date.parse(o.observed_at) >= verifiedMs,
  );

  const facts: AssistantFacts = {
    endpoint: event.endpoint ?? "unknown endpoint",
    amount: String(event.amount),
    verifiedAt: event.observed_at,
    paymentId: event.payment_id ?? null,
    authorizationRef: event.authorization_ref ?? null,
    inference,
    observationCount: inScopeObservations.length,
    lastObservationAt:
      inScopeObservations.length > 0
        ? inScopeObservations[inScopeObservations.length - 1].observed_at
        : null,
  };

  const intent = classifyQuestion(q);
  const deterministic = composeDeterministicAnswer(intent, facts);

  // Signals are ALWAYS the engine's real objects. The explanation layer may
  // only choose indexes into this array; it never supplies citation content.
  const signalKinds = inference.signals.map((s) => s.kind);
  const citedFrom = (indexes: number[]) =>
    indexes
      .filter((i) => i >= 0 && i < inference.signals.length)
      .map((i) => inference.signals[i]);

  const respond = (
    answer: string,
    citedIndexes: number[],
    source: string,
    extra: Record<string, unknown> = {},
  ) =>
    NextResponse.json({
      answer,
      source,
      intent,
      // Authoritative engine output, echoed for display. Never model-derived.
      state: inference.state,
      confidence: inference.confidence,
      engine_version: inference.engine_version,
      evidence_used: citedFrom(citedIndexes),
      ...extra,
    });

  // Out-of-scope and unrecognized questions never reach a model: the refusal
  // is a real code path, reached before any generation.
  if (intent === "out_of_scope" || intent === "unknown") {
    return respond(
      intent === "out_of_scope" ? `${REFUSAL} ${SCOPE_NOTE}` : REFUSAL,
      [],
      "refusal",
    );
  }

  // --- Explanation layer (optional) ---------------------------------------
  const provider = getExplanationProvider();
  if (!provider.available) {
    return respond(deterministic.answer, deterministic.citedIndexes, "deterministic", {
      explanation_layer: {
        available: false,
        reason: provider.unavailableReason,
      },
    });
  }

  const result = await provider.explain({ question: q, intent, facts });

  // No usable output, or the model declared the facts insufficient.
  if (!result) {
    return respond(
      deterministic.answer,
      deterministic.citedIndexes,
      "deterministic_fallback",
      { explanation_layer: { available: true, note: "provider returned no usable output" } },
    );
  }
  if (!result.answerable) {
    return respond(REFUSAL, [], "refusal");
  }

  // --- Guardrails ---------------------------------------------------------
  // Deterministic validation of the candidate. Rejection is safe: it falls
  // back to an answer assembled from engine output, so a false positive
  // costs plainer prose, never correctness.
  const verdict = validateAnswer(result.answer, result.citedIndexes, {
    state: inference.state,
    confidence: inference.confidence,
    signalKinds,
    evidenceCorpus: JSON.stringify({ event, observations: inScopeObservations }),
  });

  if (!verdict.ok) {
    console.error(
      `[ballast/ask] explanation rejected by guardrails: ${verdict.violations.join(", ")}`,
    );
    return respond(
      deterministic.answer,
      deterministic.citedIndexes,
      "guardrail_rejected",
      { guardrail_violations: verdict.violations },
    );
  }

  return respond(result.answer, result.citedIndexes, "explanation_layer");
}
