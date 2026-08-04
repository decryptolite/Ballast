# Ballast

**Settlement, observed.** A deterministic, evidence-based reconciliation instrument for Circle Nanopayments on Arc.

> Ballast is the first financial instrument that tells you what it does not know.

---

## The problem

Circle Nanopayments verifies a payment offchain instantly — the buyer signs an EIP-3009 authorization, the seller delivers immediately. Actual settlement happens later, inside a Gateway batch.

Between those two moments the money is real, owed, and unaccounted for. And it stays invisible, because **per-payment onchain settlement proof does not exist in Circle's own API**:

- `/v1/x402/settle` returns a `transaction` field that is a **UUID** — an internal settlement reference queued for batch processing, *not* an onchain transaction hash. (The SDK's own `.d.ts` mislabels it as a hash; the API reference is authoritative and contradicts it.)
- No onchain event corresponds to one specific payment being batch-settled.
- The only genuine onchain evidence is the seller's *aggregate* withdrawal — real, but disconnected from any individual payment.

That interval is not an edge case. It is every payment, every time.

## What Ballast does

Ballast observes the signals that actually exist and produces a replayable, confidence-scored, evidence-attached conclusion for each payment's lifecycle state.

| State | What it is | Basis |
|---|---|---|
| **VERIFIED** | A recorded fact (confidence `1.0`) | Circle's facilitator accepted the authorization |
| **FLOATING** | A derived conclusion, well corroborated | The pending batch total accounts for this payment's value |
| **RECONCILED** | An inference, **never** a proof | The batch holding it cleared — offchain, Circle-asserted, aggregate |
| **BREAK** | Positively unaccounted for | Window elapsed, observer coverage present, value never entered a batch |
| `insufficient_observation_coverage` | An honest non-answer | We weren't watching — reported as such, never as BREAK |

Two rules the system enforces structurally, not by convention:

- **RECONCILED is capped below certainty.** No edit can raise it to `1.0`, because no per-payment onchain proof exists to justify it.
- **A monitoring gap never becomes an accusation.** Absence of observer coverage yields `insufficient_observation_coverage`, never `BREAK`.

Confidence tiers observed in practice: `0.95` (exact-sum attribution while floating), `0.75` (witnessed rise-and-clearance within coverage), `0.6` (rise observed outside full coverage), `1.0` only for VERIFIED.

## Key features

- **Append-only evidence log** — two streams, `verification_events` and `chain_observations`. Immutability is enforced at the database privilege level via explicit `REVOKE UPDATE, DELETE`, not merely by omitting an RLS policy (Supabase's `service_role` bypasses RLS by default, so the REVOKE is the real enforcement).
- **Chain observer** — a standalone poller, independent of the payment flow, reading Gateway `/v1/balances` and onchain state. It established empirically that Gateway's `pendingBatch` behaves as an *exact running accumulator* of floating value — which is what makes arithmetic attribution possible rather than mere timing correlation.
- **Deterministic inference engine (`inferStateV1`)** — a pure, versioned function `(verification_event, chain_observations[], options?) → { state, confidence, signals[], engine_version }`. No writes, no side effects, and **no clock reads** (`asOf` is derived from the input data, not `Date.now()`), so the same evidence and engine version always produce the same answer.
- **Timeline Replay** — scrub a payment across its real recorded evidence points and see the state as it stood at each one. Ticks are discrete and correspond to actual observations; there is no interpolation, because interpolating would imply evidence that was never recorded.
- **Audit Export** — one self-describing JSON document per payment: the evidence, the conclusion, the signals, the engine version, the remediation history, and an explicit statement of what is fact versus inference.
- **BREAK remediation** — acknowledge / resolve-with-required-note, recorded append-only in `remediation_events`. These are **human-action records, architecturally type-separated from system evidence and never read by the inference engine**. A resolved BREAK is still a BREAK in engine terms; "resolved" is a human claim shown beside the conclusion, never in place of it.
- **AI Evidence Assistant ("Ask Ballast")** — see below.

### The Evidence Assistant, and how its guardrails were tested

The hard architectural rule is that **the LLM never determines payment truth**. The pipeline is fixed: scoped evidence retrieval → the existing inference engine → an LLM *explanation* layer only → an answer terminating in cited evidence.

This is enforced by two independent layers of code, not by prompt instructions:

1. **Structural.** The client sends only a payment id and a question. Evidence is retrieved server-side and the conclusion is recomputed server-side by `inferStateV1`. State, confidence, engine version and the cited signal objects are never parsed out of model text — the model may only select *which real signals* to cite, by index.
2. **Validation.** A candidate answer is rejected outright for hedging, certainty overclaim, onchain-settlement claims, any confidence figure differing from the engine's, identifiers or amounts absent from the evidence, or citations of signals that do not exist. Rejection falls back to a deterministic answer composed from engine output.

**Verified adversarially against a real model, not simulated.** Two tests, both against live Gemini:

- A request injecting `state:"BREAK"`, `confidence:1.0`, `engine_version:"v99"`, a pre-written answer and a fabricated signal returned the true engine values (`RECONCILED @ 0.75`, `v1`) with real signal kinds — **every injected field ignored**.
- Given a deliberately inverted system prompt, the live model produced a genuinely non-compliant answer (claiming onchain settlement, asserting `0.99` confidence, hedging, and presenting a real identifier as a transaction hash). The guardrails **rejected it with four violations** and served the deterministic answer instead.

The refusal path is real code, reached *before* any model call: cross-payment, predictive, advice-seeking and norm-comparison questions return "The available evidence does not show that." without a model ever being invoked. Guardrail suite: **26 passing tests**.

## Architecture

Three planes, strictly separated:

```
INGESTION       verification_events   ← lib/x402.ts, at the exact point the
                                        x402 middleware accepts a payment
                chain_observations    ← chain-observer.mts, independent poller
                (both append-only, REVOKE-enforced)
                             │
INFERENCE       inferStateV1(event, observations[], options?)
                pure · versioned · no I/O · no clock read
                → { state, confidence, signals[], engine_version }
                             │
PRESENTATION    /dashboard/observe · Operational State · Ask Ballast
                reads only; never computes state itself
```

The Operational State surface is queried **independently** of the ledger, so it can never be wrong by being coupled to another surface's stale data.

## Tech stack

- **Next.js 16** (App Router, Turbopack, Cache Components) + TypeScript
- **Supabase** — Postgres evidence log, RLS plus privilege-level append-only enforcement
- **Arc Testnet / Circle Nanopayments** — `@circle-fin/x402-batching`, Gateway API, the x402 protocol
- **Google Gemini** (`gemini-3.5-flash-lite`) — explanation layer only, provider-agnostic behind an interface; falls back to deterministic answers when no key is configured
- **IBM Plex** (Serif / Sans / Mono), self-hosted via `@fontsource`

## Running locally

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

Required environment variables (**names only** — never commit values):

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser (anon) reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side evidence writes |
| `SELLER_ADDRESS` | Seller wallet address |
| `SELLER_PRIVATE_KEY` | Gateway withdrawals |
| `GEMINI_API_KEY` | *Optional.* Ask Ballast's explanation layer; without it the assistant answers deterministically |

`BUYER_ADDRESS` / `BUYER_PRIVATE_KEY` are needed only by the local scripts (`agent.mts`, `generate-wallets.mts`), never by the deployed app.

Database migrations live in `supabase/migrations/` and must be applied to the Supabase project before the app has anything to read or write.

Other commands:

```bash
npm run test:engine      # inference engine unit tests (14)
npm run test:assistant   # assistant guardrail tests (26)
npm run agent            # drive real x402 payments (spends testnet USDC)
npm run chain-observer   # run the chain observer
npm run infer:replay     # replay the engine over real evidence, read-only
```

**Demo access:** `admin@example.com` / `123456` — inherited demo credentials, shown on the sign-in page and pre-filled. Explicitly not production-appropriate.

## Built on Circle's reference implementation

Ballast is a fork of [`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments), Circle's own Arc Nanopayments reference app. The existing payment flow, x402 middleware, Gateway integration and Supabase persistence were **preserved and extended, never rebuilt** — Ballast is layered on top. The `/dashboard` payments and withdrawals views are the original reference app; `/dashboard/observe` is Ballast.

Arc and Circle marks used for attribution are the official assets from [circle.com/pressroom](https://www.circle.com/pressroom), unmodified. Factual attribution only — no affiliation or endorsement is claimed or implied.

## Known limitations

Stated plainly, because a system whose premise is honest reporting should be honest about itself.

- **Seller wallet has no native gas on Arc Testnet.** Confirmed directly via RPC. The withdrawal flow's pre-check correctly rejects with a clear message, so a full end-to-end withdrawal cannot complete without funding that wallet.
- **Visual verification is not automated (MEDIUM confidence).** No browser/E2E suite exists — Playwright's binary CDN is unreachable from the build environment. Visual claims were verified through served markup, programmatic contrast measurement and typechecking, and confirmed by manual human checks, but not by automated tests.
- **Demo-grade authentication.** A single hardcoded credential pair inherited from the fork, behind a cookie gate. Not production-appropriate; because there is no real identity, remediation records use a placeholder `operator` actor.
- **BREAK has never fired on real data**, because no real payment has yet gone missing. Its logic is exercised only by fixed test evidence. Likewise the `0.9` onchain-corroborated confidence tier, which requires a seller withdrawal that has not occurred.
- **Ask Ballast conversations are not logged as evidence.** Whether they should be is a genuinely open question, deliberately unresolved rather than silently decided.
- **No load testing.** Under high concurrency (~40 in-flight agent requests/sec) against the shared public Arc testnet RPC, `verify()` calls have returned HTML error pages instead of JSON, with latencies of 40–50s. Known, unaddressed, and orthogonal to the core hypothesis.
- **No formal accessibility audit.** Colour-contrast pairs were verified programmatically against WCAG AA; nothing broader has been assessed.

## Project documentation

The reasoning behind every decision is recorded append-only, rather than summarised after the fact:

| Document | Contents |
|---|---|
| `DECISIONS.md` | Append-only decision log — every architectural and product decision with its reasoning, tradeoffs and status |
| `BALLAST_MASTER_SPEC.md` | Consolidated, implementation-ready specification |
| `DESIGN_PHILOSOPHY.md` | Permanent design constitution |
| `BALLAST_DESIGN_SYSTEM.md` | Concrete design tokens, components, acceptance criteria |
| `BALLAST_VISUAL_IDENTITY_REBUILD.md` | Visual identity brief |
| `PARKING_LOT.md` | Deferred ideas, each with why it was deferred |
| `CLAUDE.md` | Engineering operating rules, including the confidence policy |

---

Licensed under Apache 2.0, per the upstream reference implementation.
