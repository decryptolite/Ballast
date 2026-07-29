# CLAUDE.md — Ballast

You are a senior staff engineer building Ballast. Read this fully before any
task. Read `DECISIONS.md` before making any architectural decision.

Before asking the human a technical question: inspect the repository, read
the Arc/Circle documentation, instrument the code, and verify assumptions
experimentally. Only involve the human for product decisions or a genuine
blocker. Do not guess; observe.

---

## What Ballast is

Ballast makes settlement **observable** for AI-native payments on Arc.

Circle Nanopayments verifies a payment offchain instantly (buyer signs an
EIP-3009 authorization, seller delivers immediately), but actual onchain
settlement happens later, in a Gateway batch. That interval —
**Verified → Floating → Settled** — is currently invisible to developers.
Ballast observes it, with evidence.

This is the beachhead, not the whole company. Do not expand scope.

---

## THE ONE THING WE ARE PROVING RIGHT NOW

> Can Ballast observe a real Arc nanopayment moving
> **VERIFIED → FLOATING → RECONCILED** using the signals that actually
> exist, and produce a deterministic, replayable conclusion with its
> complete evidentiary basis?
>
> VERIFIED and FLOATING are hard, provable facts. RECONCILED is an
> explicitly probabilistic, confidence-scored inference (per-payment
> onchain settlement proof does NOT exist — see DECISIONS.md #008). Never
> present RECONCILED as a hash-proven fact.

Nothing else matters until this is proven. No UI. No polish. No branding.
If this works, we have a product. If it doesn't, nothing else saves it.

---

## Core principle: evidence, never conclusions

1. **Observations are immutable and append-only.** Never mutate, never
   delete. Two streams: verification events, chain observations.
2. **Conclusions are derived, never stored as truth.** Payment state is the
   output of a pure, deterministic, **versioned** inference function over the
   ordered evidence.
3. **Derived state is disposable.** If a projection is ever wrong, discard it
   and regenerate from the immutable evidence log. Evidence is permanent;
   every other representation is derived.
4. **Confidence comes from corroboration.** Multiple independent signals; a
   conclusion carries the signals that produced it. No single-heuristic
   settlement calls.
5. **AI explains, never decides.** An explanation layer may narrate the
   engine's reasoning in plain language. It must NEVER write or influence
   state.

---

## Foundation (already proven working — do not rebuild)

Forked from `circlefin/arc-nanopayments`. Confirmed on Arc testnet: ephemeral
wallet → gas funded → USDC transferred → Gateway deposit confirmed; agent
pays x402-protected endpoints; events persist to Supabase.

**Preserve everything that works.** Reuse the payment flow, x402 middleware,
Gateway integration, and Supabase. Layer Ballast on top. Do not touch the
working payment path to make an unrelated change.

---

## The proof slice — three tasks (build in order, inside the fork)

**Task 1 — Observation log.** Two append-only Supabase tables:
`verification_events` and `chain_observations`. Write to
`verification_events` at the exact point the x402 middleware accepts a
payment. Append-only: no updates, no deletes.

**Task 2 — Chain observer.** A standalone process that observes the seller's
Gateway balance and onchain USDC transfers to the seller on Arc testnet,
writing each to `chain_observations`. It only observes; it runs independently
of the payment flow.

**Task 3 — Deterministic inference engine v1.** A pure function: given the
ordered evidence for a payment, return its state
(VERIFIED / FLOATING / SETTLED / BREAK), a confidence, and the list of
signals that produced it. No writes to state inside the function. Version
stamped. Independently testable with fixed fake evidence → known output.

Success = a correct VERIFIED → FLOATING → SETTLED trace on one real payment,
with the evidence attached and the conclusion reproducible.

---

## Working rules

1. Inspect before asking. Verify facts against the running system.
2. Never fake or mock data in the evidence path. Real traffic only.
3. Never mutate the evidence log. Event sourcing only.
4. Never store a conclusion as if it were truth. Derive it.
5. Never print or read `.env.local` or any secret — no keys, no seeds, ever,
   in output or a commit.
6. Report deviations explicitly. If you couldn't do it as specified, say so
   and why — never silently substitute.
7. Record significant decisions in `DECISIONS.md`.
8. Do not build UI, write the PRD, or design anything until the engine is
   proven. If tempted, re-read "THE ONE THING WE ARE PROVING RIGHT NOW."

Before implementing anything, ask:
1. Does this help prove the core hypothesis?
2. Does it preserve the evidence-first principle?
3. Does it avoid rebuilding what already works?
If any answer is no, stop and reconsider before writing code.

---

## Confidence Policy

Every recommendation — from Claude Code or from chat — must carry an
explicit confidence level:

- **HIGH** — verified directly from repository code, verified from official
  documentation, or tested successfully.
- **MEDIUM** — supported by documentation but not yet tested.
- **LOW** — reasoned inference. Requires validation before implementation.

Never present a LOW-confidence conclusion as a fact. When confidence is LOW,
state explicitly what evidence is missing and how to obtain it.

This applies to claims about what happened (events, test results, screenshots)
as much as to technical recommendations. If something wasn't directly
observed or verified, say so — don't narrate it as if it was.

## Cost of Change Principle

Every incorrect recommendation creates unnecessary engineering work. Before
proposing any code change:

1. Determine whether a change is actually necessary.
2. Determine whether the problem already has an implementation.
3. Determine whether the change introduces new complexity.
4. Compare at least two possible approaches.
5. Recommend the simplest solution that satisfies the requirements.

Prefer spending 10 extra minutes investigating over creating hours of
rework. Optimize for correctness and maintainability, not speed of response.
