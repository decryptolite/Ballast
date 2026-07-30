# BALLAST_MASTER_SPEC.md

**Status:** Consolidated specification. Supersedes nothing — CLAUDE.md,
DECISIONS.md, DESIGN_PHILOSOPHY.md, and PARKING_LOT.md remain the append-only
sources of truth for history and reasoning. This document is the
synthesized, implementation-ready view of everything already decided across
them, so Claude Code can build without re-reading prior conversation.

**Confidence policy applies throughout:** every section is HIGH (directly
sourced from an existing decision/document), MEDIUM (reasonable engineering
fill-in of a gap, explicitly flagged), or explicitly listed under Open
Questions / Parking Lot (not decided). Nothing here silently invents scope.

---

## 1. Executive Summary

**Confidence: HIGH**

Ballast is a deterministic, evidence-based reconciliation instrument for
Circle Nanopayments on Arc. It observes real payments moving through a
lifecycle — **VERIFIED → FLOATING → RECONCILED** (with **BREAK** and
**insufficient_observation_coverage** as honest exception states) — and
produces replayable, confidence-scored, evidence-attached conclusions. It
exists because per-payment onchain settlement is not observable in Circle's
own Nanopayments architecture, and nobody has built the instrument that
makes that gap legible, honest, and auditable.

Built on Circle's own `circlefin/arc-nanopayments` reference implementation,
extended — not replaced — with an append-only evidence log, a chain
observer, a deterministic inference engine (v1), an Operational State
surface, and a working observability screen (`/dashboard/observe`). All of
this is proven on live Arc testnet traffic, not simulated.

---

## 2. Product Vision

**Confidence: HIGH**

> Ballast is the first financial instrument that tells you what it does not
> know.

Most financial software pretends certainty. Ballast observes, records, and
reasons from evidence, and explicitly separates fact from inference. It
never claims certainty it cannot support, and it is built so that any
conclusion can be reconstructed and defended months later — evidence,
inference version, confidence, and reasoning intact.

Long-term vision (non-binding, directional): Ballast becomes the reference
implementation for evidence-based financial reconciliation — starting with
the Nanopayments/Arc beachhead, generalizable later to other settlement
rails. This is vision, not committed scope.

---

## 3. Product Philosophy

**Confidence: HIGH — full detail lives in `DESIGN_PHILOSOPHY.md`, summarized here.**

- Evidence > assumptions. Observation > speculation. Confidence > false
  certainty. Transparency > convenience.
- **Four layers** govern every feature and design decision: Awareness
  (is something wrong — pre-attentive), Priority (what needs attention
  first), Understanding (why does Ballast believe this — evidence,
  subordinate but available), Audit (can this survive scrutiny months
  later — full replay).
- The ledger is chronological and sacred; it never reorders for drama.
- The Operational State is a separate, independently-queried, always-live
  surface — never derived from the ledger's rendered state.
- Awareness is built primarily through **positional disruption**, secondarily
  through **asymmetric color** (BREAK loud, FLOATING calm, RECONCILED
  nearly silent) — never equal-weight traffic-light coloring.
- Every awareness signal terminates in evidence. No dead ends.
- The interface becomes quieter as trust is earned — not by hiding
  information, but because verification is needed less often.
- The AI assistant explains; it never decides. Retrieval-then-generation
  only; the LLM never determines payment truth.

---

## 4. Product Principles (operating rules)

**Confidence: HIGH**

1. Never fake or mock evidence. Real signals only.
2. Never mutate the evidence log. Append-only, enforced at the database
   level (explicit `REVOKE UPDATE, DELETE`), not just by convention.
3. Never store a conclusion as truth. Conclusions are always derived by a
   pure, versioned, deterministic function over evidence, and are
   disposable/regenerable from the log.
4. Confidence emerges from corroboration across independent signals, never
   a single heuristic.
5. Never overclaim. RECONCILED is capped below certainty (see Section 13)
   and is always labeled as an inference, never as onchain proof.
6. A monitoring gap must never become an accusation. Absence of observer
   coverage yields `insufficient_observation_coverage`, never `BREAK`.
7. Every recommendation (engineering or design) carries an explicit
   confidence tag (HIGH/MEDIUM/LOW) per the Confidence Policy in
   `CLAUDE.md`.
8. Prefer investigation over rework (Cost of Change Principle, `CLAUDE.md`).
9. Design decisions are evaluated against the four layers, never against
   trends or competitor parity.

---

## 5. PRD Summary

**Confidence: HIGH for the core loop; MEDIUM for stated user segments (reasoned, not independently user-tested).**

**Problem:** Circle Nanopayments verifies a payment offchain instantly, but
actual settlement happens later, in an opaque batch. Per-payment onchain
settlement proof does not exist in the current API (confirmed directly
against Circle's own docs). Circle's own developer materials name
"settlement monitoring" as an unbuilt, needed capability.

**Solution:** Ballast observes the real signals that do exist (verification
events; Gateway's `pendingBatch`, empirically discovered to behave as an
exact running accumulator) and produces a deterministic, confidence-scored,
replayable conclusion for every payment's lifecycle state.

**Primary user (reasoned, not yet validated with a real operator — MEDIUM):**
a developer or finance operator integrating Nanopayments who needs to know,
per payment, whether it is floating, reconciled, or requires attention, and
who may need to defend that conclusion later (audit, dispute, regulator).

**Core job to be done:** "Tell me what is actually true about this payment's
settlement, how sure you are, and why — and let me prove it later."

---

## 6. Information Architecture

**Confidence: MEDIUM — synthesized from agreed component boundaries; exact routing not previously specified in detail.**

```
/dashboard                     existing Circle reference app (payments/withdrawals) — untouched
/dashboard/observe             Ballast's observability screen
  |-- Operational State        top of page, independent component
  \-- Ledger                   chronological payment rows
        \-- Row (4 depths)     Collapsed -> Priority -> Understanding -> Audit
              \-- Ask Ballast  contextual, lives inside an expanded row (not yet built)
```

Future, not yet built (Build This Sprint / After Hackathon per roadmap):
Timeline Replay view, Audit Export, BREAK remediation surface.

---

## 7. UX Specification

**Confidence: HIGH for principles (from DESIGN_PHILOSOPHY.md); MEDIUM for exact interaction mechanics not yet browser-verified.**

### Row expansion (four depths — not yet fully implemented as of this spec; Operational State is built, full row-expansion is the next Build Now item)

1. **Collapsed** — visible from a distance: the four fixed-position
   columns (endpoint, amount, state badge, confidence). Uniform rhythm
   across all rows (required for positional disruption to work at all).
2. **Priority** (default resting state) — currently visually identical to
   Collapsed (confidence is already visible in both). Any future
   Collapsed-vs-Priority distinction is deferred, not designed — see
   DECISIONS.md #023/#024 and the Open Questions section.
3. **Understanding** — unfolds evidence signals, plain-language reasoning
   (already exists as row content in `/dashboard/observe` — the "unfold in
   place" *interaction model* for depth-switching is not yet built as a
   distinct UI affordance).
4. **Audit** — raw observations, engine version, replay controls.

Expansion is in-place ("revelation"), never a route change. New operators'
rows default more open; experienced operators' default more collapsed —
this is the literal, measurable expression of earned trust.
**Open Question:** whether this default depth is remembered automatically
per-operator, or always manual (see DESIGN_PHILOSOPHY.md Open Questions).

### Operational State (built)

Independent query, own poll (10s, faster than ledger's 15s), three levels:
calm ("all observations reconciled"), floating-only (factual, non-alarming),
attention-required (overrides other states, lists flagged payments inline).
Uses `BREAK_WINDOW_MS` imported from the inference engine (not re-declared)
to avoid threshold drift between surfaces.

---

## 8. Design System

**Confidence: HIGH for principles; explicit hex/type values are NOT yet locked as final production tokens — see note below.**

Full detail in `DESIGN_PHILOSOPHY.md`. Summary:

- **Palette:** paper/ink base tones (warm off-white, near-black — exact hex
  not yet finalized in a build task); BREAK owns the strongest, rare color;
  FLOATING gets a whisper of distinction; RECONCILED nearly disappears.
  Color never appears outside state communication.
- **Typography:** monospace for all evidence data (amounts, timestamps,
  hashes, refs — tabular figures); serif/editorial register for narrative
  and headers; explicitly not Inter as the sole typeface.
- **Motion:** exists only when information changes. No bounce, no spin, no
  celebration. BREAK appears abruptly, not softly animated in.
- **Material metaphor:** paper, ink, stone, metal — nothing synthetic or
  glossy.

**Note (MEDIUM confidence flag):** No design/styling pass has been applied
to any screen yet. `/dashboard/observe` and the Operational State component
are functionally correct but visually plain by deliberate choice: prove the
engine before styling. The design system above is principle-locked;
token-level implementation (exact hex values, exact type scale) is
upcoming work, explicitly paused per the user's most recent instruction
pending a platform/model switch.

---

## 9. Component Library

**Confidence: HIGH for what's built; explicitly incomplete for what isn't.**

**Built:**
- `OperationalState` (`components/dashboard/operational-state.tsx` +
  `hooks/use-operational-state.ts`) - independent evidence query, three
  states, inline expandable attention list.
- Observability ledger rows (`app/dashboard/observe/`,
  `hooks/use-observability.ts`) - renders real evidence + confidence +
  signals per payment.

**Not yet built (Build Now / Build This Sprint, per roadmap):**
- Row-expansion depth-switch interaction (currently rows show full
  Understanding-level detail; the collapsed/priority/audit depth states as
  distinct, togglable UI are not implemented).
- Timeline Replay UI (engine already supports `asOf`; no UI surface yet).
- Audit Export.
- Evidence Assistant / "Ask Ballast" UI and retrieval pipeline.
- BREAK remediation workflow surface (see Section 19, Open Questions/escalation).

---

## 10. Feature Specifications

**Confidence: HIGH — directly from the pruned roadmap the user finalized.**

| Feature | Status | Notes |
|---|---|---|
| Evidence log (verification_events, chain_observations) | Built | Append-only, REVOKE-enforced. |
| Chain observer | Built | pendingBatch confirmed exact accumulator. |
| Inference engine v1 (inferStateV1) | Built | Pure, versioned, replayable. |
| /dashboard/observe ledger screen | Built | Real evidence + confidence + signals rendered. |
| Operational State | Built | Independent surface, own query, own poll. |
| Row-expansion depth interaction | Build Now (next) | Not yet built as distinct UI. |
| Timeline Replay UI | Build Now / This Sprint | Engine-ready, UI pending. |
| Audit Export | Build This Sprint | Formatting existing data; low net-new logic. |
| Evidence Assistant ("Ask Ballast") | Built — v1, LLM-independent (DECISIONS.md #033) | Per-payment only. Guardrails enforced structurally + by validation, not by prompt. No LLM API configured; runs on a deterministic explanation path until a key exists. |
| Natural Language Investigation | After Hackathon | Build only atop Assistant's retrieval layer. |
| BREAK remediation workflow | Build Now — promoted, minimal model built (DECISIONS.md #030) | Human-action records, type-separated from evidence, never engine input. Migration pending application. |
| Historical Diff | After Hackathon | Built on Timeline Replay's asOf, not standalone. |
| Human Notes | After Hackathon | Requires type-separation from system evidence before build. |
| Team Collaboration | Parking Lot | High complexity, low trust-impact relative to cost. |
| Evidence Graph | Parking Lot | Rejected on value grounds, not feasibility. |
| Counterfactual Confidence | Parking Lot | Rejected on architectural grounds. |
| Alert Intelligence / Operational Memory | Parking Lot | Prediction disguised as pattern description. |
| Multiple UI Modes | Rejected outright | Superseded by the single depth-continuum model. |

---

## 11. AI Evidence Assistant Specification

**Confidence: HIGH for architecture; NOT YET BUILT.**

**Hard rule:** the LLM never determines payment truth. Fixed pipeline:

```
User question
    -> Evidence Retriever (scoped IDENTICAL to inferStateV1's actual
       input for the payment in context - never broader)
    -> existing inference engine output (state, confidence, signals)
    -> LLM explanation layer only
    -> Natural-language answer, always terminating in cited evidence
```

**Forbidden LLM behaviors:** inventing missing evidence; explaining
unobserved causes; upgrading confidence; claiming settlement without proof;
speculative hedging ("probably," "most likely," "it appears"). Correct
behavior when evidence is absent: "The available evidence does not show
that."

**Tone:** calm, measured, analyst-register. Test: would this sentence be
said in the same voice regardless of good or bad news? If not, rewrite.

**Contextual awareness:** when a row is open, the assistant already has
that payment's verification event, chain observations, inference version,
confidence, and signals — the operator never pastes IDs.

**Open Question:** are assistant conversations themselves logged as
append-only evidence (consistent with Layer 4)? Reasoned as likely yes, not
formally locked.

---

## 12. Technical Architecture

**Confidence: HIGH — built and verified.**

Three planes, strictly separated:

- **Ingestion plane** — `verification_events` (written at the exact point
  x402 middleware accepts payment, in `lib/x402.ts`) and
  `chain_observations` (written by `chain-observer.mts`, independent poller,
  reads Gateway `/v1/balances` and onchain state). Both append-only,
  enforced via explicit `REVOKE UPDATE, DELETE FROM anon, authenticated,
  service_role` (not merely RLS-policy omission — service_role bypasses RLS
  by default).
- **Reconciliation/inference plane** — `inferStateV1` (`lib/ballast/`), a
  pure, versioned function: `(verification_event, chain_observations[],
  options?) -> { state, confidence, signals[], engine_version }`. No writes,
  no side effects, no clock reads (uses `asOf` derived from input data, not
  `Date.now()`, to guarantee replay determinism).
- **Presentation plane** — `/dashboard/observe`, `OperationalState`. Reads
  only; never computes state itself; renders what the inference plane
  produced.

Foundation: forked from `circlefin/arc-nanopayments`. Existing payment flow,
x402 middleware, and Gateway integration preserved and extended, never
rebuilt.

---

## 13. State Machine

**Confidence: HIGH — implemented, tested against real and synthetic data.**

```
                    +-------------+
                    |  VERIFIED   |  (hard fact - confidence 1.0,
                    +------+------+   Circle accepted the authorization)
                           |
            +--------------+----------------------------+
            v                                            v
    +-------------+                        +--------------------------+
    |  FLOATING   |                        | insufficient_observation_ |
    +------+------+                        |          coverage         |
           |                               +-------------+--------------+
           | pending_batch drop /                        | (elapsed time +
           | onchain withdrawal signal                   |  no observer coverage)
           v                                             v
    +-------------+                             +-------------+
    | RECONCILED  |                             |    BREAK    |
    +-------------+                             +------+------+
     confidence capped                                 | (late signal arrives)
     < 1.0, always                                      v
     labeled inferred                            RECONCILED (late)
```

**Key rule:** BREAK requires **positive evidence** — window elapsed AND
verifiable observer coverage across that window AND that coverage showing
the value never entered a batch. Absence of coverage alone yields
`insufficient_observation_coverage`, never BREAK. A monitoring gap must
never become an accusation against a payment.

**Confidence tiers observed in practice:** 0.95 (direct observation, e.g.
exact-sum attribution while floating), 0.75 (witnessed rise-and-clearance
within observer coverage), 0.6 (rise observed outside full coverage), 1.0
only for VERIFIED (hard fact, not inferred). RECONCILED never reaches 1.0 —
capped structurally so no future edit can raise it, because no per-payment
onchain proof exists.

---

## 14. Data Model

**Confidence: HIGH — as built.**

```sql
-- Append-only. REVOKE UPDATE, DELETE enforced for anon, authenticated,
-- and service_role (service_role bypasses RLS by default; REVOKE is the
-- real enforcement, not RLS policy omission).

verification_events
  id                 uuid PK
  payment_id         text        -- buyer's EIP-3009 nonce
  amount             numeric
  endpoint           text
  buyer_ref          text null
  authorization_ref  text null   -- Circle settle() UUID - NOT an onchain
                                 -- tx hash (see note below)
  observed_at        timestamptz
  raw                jsonb       -- full raw payload, for replay

chain_observations
  id                    uuid PK
  observed_at           timestamptz
  gateway_available     numeric null
  gateway_withdrawable  numeric null
  pending_batch         numeric null  -- Circle's exact running accumulator
                                      -- of floating value
  onchain_tx            text null
  block                 bigint null
  raw                   jsonb
```

**Critical documented fact:** Circle's `/v1/x402/settle` `transaction`
field is a **UUID**, explicitly "queued for batch processing" — NOT an
onchain transaction hash, despite the SDK's own `.d.ts` mislabeling it as
such. No per-payment onchain settlement event exists. This is why
RECONCILED is an inference, never a hash-proven fact.

---

## 15. API Specification

**Confidence: MEDIUM — no formal external API has been specified or built yet; internal query patterns exist.**

Internal (built): direct Supabase queries from `use-observability.ts` and
`use-operational-state.ts` against the two evidence tables, passed through
`inferStateV1`.

External API surface (e.g. a `/api/ballast/*` REST layer for programmatic
access, matching the "if humans can inspect it, machines should too"
principle) is **not yet built.** Currently satisfied implicitly (the
architecture is just data + a pure function, nothing is UI-exclusive), but
no versioned, documented external endpoint exists. Flag as a gap, not a
decision — belongs in Build This Sprint / After Hackathon depending on
time.

---

## 16. Security

**Confidence: HIGH for what's been actively enforced; MEDIUM for completeness of a full security review (not formally performed).**

- `.env.local` never read, printed, or committed by any agent — verified
  multiple times against the actual repo (`.gitignore` confirmed to include
  `.env*.local`/`.env`; `git status` confirmed clean before every push).
- Evidence tables: append-only enforced at the database privilege level.
- No private keys or secrets have been exposed in any commit (manually
  verified).
- **Not yet formally reviewed:** RLS policies beyond the REVOKE statements;
  rate limiting on the observer/agent; auth boundaries on `/dashboard/*`
  beyond the existing demo login (`admin@example.com`/`123456` — a demo
  credential, explicitly not production-appropriate, inherited from the
  forked repo).

---

## 17. Performance

**Confidence: MEDIUM — informal only, no load testing performed.**

Known real-world data point: under high concurrency (~40 in-flight agent
requests/sec against a shared public Arc testnet RPC), `verify()` calls
occasionally returned HTML error pages instead of JSON, and latencies
climbed to 40-50s. This was explicitly **held, not fixed**, per direct
instruction, as it's orthogonal to proving the core hypothesis.
**Outstanding technical debt**, not resolved.

No frontend performance budget or load target has been formally set.

---

## 18. Accessibility

**Confidence: LOW — not yet addressed as a dedicated work item.**

No accessibility audit has been performed. The design philosophy's emphasis
on typography-as-structure and high-contrast, restrained color use is
accessibility-friendly in principle, but this has not been verified against
WCAG or any concrete standard. **Open item, not yet scoped into a
milestone.**

---

## 19. Error Handling

**Confidence: HIGH for the evidence/inference path; MEDIUM elsewhere.**

- Evidence writes: non-blocking, logged loudly on failure, never break the
  payment response.
- Previously-silent failure fixed: Circle's `verify()` `invalidReason` is
  now logged server-side — was previously swallowed entirely, a real bug
  independently discovered and fixed.
- Inference engine: never throws on missing/incomplete evidence; returns
  `insufficient_observation_coverage` rather than guessing.
- **BREAK remediation workflow: built (DECISIONS.md #030).** Ballast now
  answers "then what happens": acknowledge and resolve-with-required-note
  actions, recorded append-only in `remediation_events` (human-action
  records, type-separated from system evidence, never read by the
  inference engine), written only through the session-gated
  `/api/ballast/remediation` route, with permanent history rendered inside
  the flagged row. Ownership/assignment deliberately excluded until real
  identity exists. Migration pending application; Operational State status
  integration is a deferred follow-up.

---

## 20. Testing Strategy

**Confidence: HIGH for what exists; explicitly partial.**

- `inferStateV1`: unit-tested (14 passing cases at last count, including
  coverage-gap guards, ingestion-lag guards, replay-determinism/order-
  independence, and no-input-mutation checks).
- Verified against real data, not just synthetic fixtures — this caught two
  real confidence-overstatement bugs before they shipped (exact-sum
  attribution scoping error; an already-cleared payment inheriting a later
  batch's signal — both fixed).
- `tsc --noEmit` run clean before every commit as a standing gate.
- **No browser/E2E test suite exists.** Playwright/Chromium has been
  unreachable in the build sandbox (DNS failure to `cdn.playwright.dev`)
  across multiple tasks. All UI-level verification to date has been done
  via the user's own manual browser testing and screenshots — which is
  real and trustworthy, but not automated. **Gap:** no repeatable,
  automated UI test suite.

---

## 21. Deployment

**Confidence: MEDIUM.**

Repository: `github.com/decryptolite/Ballast` (public, confirmed `.env.local`
absent). Local development confirmed working (Next.js dev server, Supabase
local via Docker, Arc testnet RPC — with a documented DNS caveat: default
resolver failed to resolve `rpc.testnet.arc.network`; Google DNS 8.8.8.8
resolved it correctly).

**Not yet done:** no production deployment (e.g. Vercel) has been
configured or verified for Ballast specifically. **Open item.**

---

## 22. Roadmap (as locked by the user)

**Confidence: HIGH — directly transcribed from the user's final pruned roadmap, unmodified.**

**Phase 1 (Build Now — COMPLETE, user-declared with #032's ratification):**
Engine, Evidence, Ledger, Operational State, Row-expansion interaction,
Timeline Replay UI, Audit Export, BREAK remediation (promoted per #030) —
all built. Remaining Phase 1 debt: the batched browser-verification pass
(Audit Export download, remediation insert path) before Phase 3.

**Phase 2:** Design pass — typography, spacing, hierarchy, motion (paused
per explicit user instruction pending platform switch).

**Phase 3:** Evidence Assistant.

**Phase 4:** Natural Language Search (built only atop Phase 3's retrieval
layer).

**Phase 5:** Enterprise — permissions, comments, external API.

---

## 23. Parking Lot

**Confidence: HIGH — full detail and reasoning lives in `PARKING_LOT.md`; summarized here for completeness.**

Evidence Graph; Counterfactual Confidence; Alert Intelligence /
Operational Memory; Multiple UI Modes (all rejected/parked with reasons);
Natural Language Investigation; Team Collaboration (blocked on evidence
type-separation); Evidence Lifecycle/Retention Policy; Historical Diff
(low priority, bundles with Timeline Replay).

---

## 24. Open Questions

**Confidence: HIGH that these are genuinely unresolved — not decided here, per explicit instruction.**

1. **Depth-preference memory:** should row-expansion default depth be
   automatically remembered/adapted per operator, or always a manual,
   explicit action?
2. **Ask Ballast conversation logging:** should assistant Q&A be logged as
   immutable evidence itself, per Layer 4? Reasoned as likely yes, not
   formally locked.
3. **BREAK remediation workflow classification: RESOLVED (DECISIONS.md
   #030).** Promoted to Build Now by user ruling; minimal model built —
   append-only `remediation_events` (human-action records, type-separated
   from system evidence, never read by the engine), session-gated write
   route, row-level acknowledge/resolve UI. Remaining sub-items: migration
   application, Operational State status integration (deferred follow-up),
   and ratification of the design calls flagged in #030.
4. **External API surface:** no versioned `/api/ballast/*` layer exists;
   unscoped as to whether it's needed before the hackathon deadline.
5. **Evidence lifecycle/retention:** no decision yet on whether evidence is
   retained forever or archived, and how archival would preserve
   replayability if it happens.

---

## 25. Acceptance Criteria (for what's already built, as a verification checklist)

**Confidence: HIGH.**

- [x] A real payment on Arc testnet produces a row in `verification_events`
  with non-null `payment_id` and `authorization_ref`.
- [x] `chain-observer.mts` produces real, non-null `pending_batch` values
  that rise and fall with real payment activity.
- [x] `inferStateV1` produces a correct, replayable VERIFIED -> FLOATING ->
  RECONCILED trace for a real tracked payment, with confidence that
  decreases (not increases) between FLOATING and RECONCILED, consistent
  with FLOATING being a stronger, more direct signal.
- [x] BREAK is never produced from absence of coverage alone.
- [x] The Operational State component renders correctly independent of the
  ledger's own data-loading state.
- [x] Row-expansion four-depth interaction — built (#023), browser-confirmed
  (#029).
- [x] Timeline Replay UI — built (#025/#026), verified on real evidence.
- [x] Audit Export — built (#032, all calls ratified); real browser download
  test deferred to the batched browser-verification pass before Phase 3.
- [x] Evidence Assistant — built v1 (#033), LLM-independent. Structural
  guarantee verified adversarially: injected state/confidence/signals are
  ignored in favour of real engine output. Conversation logging still
  deferred (Open Question #2).
- [x] BREAK remediation workflow — built (#030/#031); happy-path insert
  deferred to final testing (no genuine attention case exists — see #031).

---

*This document should be treated as current as of the most recent
DECISIONS.md entry and the most recent DESIGN_PHILOSOPHY.md write. Update
this file, not just the underlying documents, when a future milestone
changes any section above.*
