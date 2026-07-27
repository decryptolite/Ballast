# Ballast — Decision Log

Append-only. Every significant architectural or product decision is recorded
here with its reasoning, tradeoffs, and status. Never delete a decision; if
one is reversed, add a new entry that supersedes it and mark the old one
`Superseded by #NNN`.

---

### Decision #001 — Fork Arc Nanopayments rather than rebuild
**Decision:** Build Ballast on top of Circle's `circlefin/arc-nanopayments`
reference implementation.
**Reason:** The payment flow, x402 middleware, Gateway integration, and
Supabase persistence already work end-to-end on Arc testnet (verified: real
ephemeral wallet, gas funded, USDC transferred, Gateway deposit confirmed).
Engineering effort goes to observability, not re-proving infrastructure.
**Tradeoffs:** Inherit the repo's stack choices (Next.js, Supabase, shadcn).
Accepted.
**Status:** Accepted.

---

### Decision #002 — Company/product name: Ballast
**Decision:** The product is named Ballast.
**Reason:** Ballast is the weight below the waterline that keeps a vessel
stable under load — invisible infrastructure providing stability. Not
over-descriptive; meaning accrues to the company rather than the company
being named after a feature. Spellable on first hearing, two clean syllables.
**Tradeoffs:** "Ballast" can carry a faint "dead weight" connotation;
judged survivable. Chosen over Cairn specifically to avoid Cairn Capital,
a same-sector (financial services) trademark conflict.
**Status:** Accepted. (Domain + trademark posture to be verified before
any spend.)

---

### Decision #003 — Evidence-first, not conclusion-first
**Decision:** Ballast is an observability system before it is a
reconciliation system. It stores **evidence**, never conclusions.
**Reason:** Trust in financial operations comes from being able to replay
history and show every observation and inference step behind any result.
**Implications:**
- Observations are immutable and append-only.
- Conclusions (payment state) are always **derived** by running a
  deterministic, versioned inference engine over the evidence.
- Any derived projection is **disposable** — if wrong, discard and
  regenerate from the immutable evidence log.
- AI may explain reasoning but must NEVER write or influence state.
**Status:** Accepted. Core principle.

---

### Decision #004 — Deterministic, versioned inference engine
**Decision:** Payment state is produced by a pure, versioned function over
the ordered evidence for a payment. Same evidence + same engine version =
same output, always.
**Reason:** Replayability and auditability. A customer challenging a
reconciliation six months later must get an identical, explainable result,
attributable to a specific engine version.
**Status:** Accepted.

---

### Decision #005 — Confidence emerges from corroboration
**Decision:** Settlement is not detected by a single heuristic. Multiple
independent signals (e.g. Gateway balance delta, onchain USDC transfer to
the seller) each contribute evidence; confidence rises when signals agree.
**Reason:** Real batch settlement is noisy. A single signal risks
false-positives, which would destroy the accuracy claim the product rests on.
**Status:** Accepted. Specific signals confirmed empirically by Decision
#008.

---

### Decision #006 — Settlement-detection signals are determined empirically
**Decision:** Whether the seller Gateway balance is a usable settlement
signal is decided by inspecting and instrumenting the running system, not by
assumption.
**Reason:** Gateway does not expose batch settlement as a discrete
subscribable onchain event (verified earlier). The available signals must be
established from observed fact.
**Status:** Superseded by #008 (resolved: no per-payment onchain settlement
signal exists).

---

### Decision #007 — Prove before building UI/docs
**Decision:** Build the thinnest slice that proves Verified → Floating →
Settled on real Arc traffic BEFORE writing the PRD, design system, motion
system, or any UI.
**Reason:** Every document written before the engine is proven is a
conclusion without evidence. If the engine can't observe the lifecycle, no
UI or doc saves it. If it can, the docs get written from proven reality.
**Status:** Accepted.

---

### Decision #008 — Per-payment onchain settlement is not observable;
### RECONCILED replaces SETTLED as a probabilistic inference
**Decision:** The lifecycle Ballast can actually observe is
**VERIFIED → FLOATING → RECONCILED**, not VERIFIED → FLOATING → SETTLED.
RECONCILED is an explicitly probabilistic, confidence-scored conclusion —
never presented as a hash-proven fact.
**Reason:** Investigated the fork's live code path and Circle's own
documentation directly (not assumption):
- `lib/x402.ts`'s call to `facilitator.settle()` (`@circle-fin/x402-batching`)
  hits Circle's `POST /v1/x402/settle`. Circle's API reference documents the
  returned `transaction` field as *"Transaction UUID on success, empty
  string on failure"* — an internal settlement reference, **not** an onchain
  transaction hash. The SDK's own `.d.ts` comment calling it a "transaction
  hash" is misleading; the API reference is authoritative.
- Circle's Gateway Technical Guide states nanopayment receipt is a **pure
  offchain ledger update** ("the seller's available balance increases via
  the offchain ledger"), "eventually consistent with onchain state." No
  onchain event fires per received payment.
- Circle's contract events reference (GatewayWallet / GatewayMinter) lists
  `Deposited`, `WithdrawalInitiated`, `WithdrawalCompleted`, `GatewayBurned`,
  `AttestationUsed` — none of which correspond to "this specific payment was
  batch-settled onchain." The only genuine onchain event anywhere in the
  system is `AttestationUsed`, which fires on a seller's own aggregate
  withdrawal (`GatewayClient.withdraw()` → `mintTxHash`), not per-payment.
**Implication:** The two available corroborating signals for
settlement-adjacent confidence are both weak in different ways:
  1. Gateway `available` balance delta (polled, offchain, Circle-asserted,
     not per-payment attributable — a correlation problem when payments
     arrive close together).
  2. The seller's eventual withdrawal `mintTxHash` (genuinely onchain, but
     proves aggregate value existed at withdrawal time, not that a specific
     payment settled).
Neither alone, nor combined, gives a deterministic per-payment SETTLED fact.
**Status:** Accepted. Supersedes #006. Product-level naming/framing decision
(RECONCILED vs SETTLED) made explicitly so the UI/API never overclaims.

---

### Decision #009 — Evidence log: payment identity and append-only enforcement
**Decision (Task 1 — observation log):**
- `verification_events.payment_id` is sourced from
  `paymentPayload.payload.authorization.nonce` — the buyer-generated,
  EIP-712-signed EIP-3009 nonce created client-side in
  `BatchEvmScheme`/`GatewayClient` (`@circle-fin/x402-batching`). This is a
  real, pre-existing, cryptographically-bound identifier for the payment
  itself, distinct from Circle's own settlement reference
  (`authorization_ref`, i.e. `settleResult.transaction`, see #008 — a
  Circle-internal UUID, not a payment identity).
- Append-only is enforced two ways, not one: (a) no UPDATE/DELETE policy is
  granted via RLS, and (b) an explicit `REVOKE UPDATE, DELETE` from
  `anon`, `authenticated`, and `service_role` on both evidence tables.
  (b) is the real enforcement — Supabase's `service_role` (used by
  `lib/x402.ts`) bypasses RLS by default, so RLS policy omission alone would
  not stop a service-role mutation.
- The evidence write in `lib/x402.ts` is wrapped in its own try/catch,
  separate from the pre-existing `payment_events` insert's error handling,
  so a Supabase failure on the new table can never propagate to the outer
  handler and turn into a failed payment response.
**Reason:** Do not invent identifiers or weaken the append-only guarantee
for convenience; ground every field in something that actually exists in
the observed payload (per CLAUDE.md working rule: "if a field isn't
available... say so rather than inventing it").
**Status:** Accepted.

---

### Decision #010 — Fix: authorization validity window was shorter than
### Circle's live minimum; every payment failed verify() as a result
**Problem:** Every payment failed at `facilitator.verify()` with
`invalidReason: "authorization_validity_too_short"`, 100% reproducible, not
intermittent. `lib/x402.ts`'s `buildPaymentRequirements()` hardcoded
`maxTimeoutSeconds: 345600` (4 days). This value determines the buyer's
signed EIP-3009 `validBefore`, which every buyer client (`GatewayClient` in
`@circle-fin/x402-batching`) derives from whatever the server advertises in
its 402 response — so the entire buyer population was signing authorizations
too short to pass, regardless of wallet, key, or balance.
**How this was found:** Investigated empirically, not by assumption (per
CLAUDE.md working rule). Queried Circle's own
`GET /v1/x402/supported` for `eip155:5042002` directly and found
`extra.minValiditySeconds: 604800` (7 days) published live for the
`GatewayWalletBatched` kind on Arc Testnet — a requirement the app's
hardcoded 4-day constant predates or never matched. Confirmed causally, not
just correlationally, by replaying the exact client-side signing logic
against Circle's `/v1/x402/verify` with three window sizes:
- 345600s (4 days, the shipped value) → rejected,
  `authorization_validity_too_short`
- 604800s (7 days, exactly Circle's published minimum) → still rejected
  (a few seconds of clock skew/latency erode an exact boundary value)
- 691200s (8 days, ~1-day margin above the minimum) → `isValid: true`

Also ruled out empirically in the same investigation: buyer USDC balance,
wallet/address correctness, chain ID, facilitator URL, private key/signature
validity, and environment variables — none were implicated. Clock skew
between the local machine and Circle's servers was measured at ~6.6 seconds
(via Circle's `Date` response header), which explains why the exact 7-day
value still failed, but is far too small to explain the original 4-day
shortfall.
**Decision:** Set `maxTimeoutSeconds: 691200` (8 days) in
`buildPaymentRequirements()` — Circle's published minimum plus a deliberate
~1-day margin, not an arbitrary round number. Also added a `console.error`
in the `withGateway` verify-failure branch: previously, a failed
verification returned a 402 to the buyer with zero server-side log output,
making this class of failure invisible to anyone watching the server
console — unacceptable for a system whose entire premise is observability.
**Reason:** Ballast's evidence log is only as good as its inputs; a payment
flow that fails silently upstream produces no verification event to reason
about at all. This decision preserves the working payment path (per
CLAUDE.md: "do not touch the working payment path to make an unrelated
change") while fixing what was, in fact, broken — verification never
succeeded before this fix, so there was no working path to preserve at the
`verify()` boundary.
**Status:** Accepted.

---

### Decision #011 — Task 2 chain observer: poll interval, onchain-transfer
### correlation, and an empirical correction to how "moves" the balance signal
**Decision:** Built `chain-observer.mts` as a standalone, read-only process
(no import of `lib/x402.ts`, no private key of any kind, does not touch
`verification_events` or the payment flow). Each cycle inserts exactly one
row into `chain_observations` with both signals from CLAUDE.md Task 2, even
when one or both are null/absent that cycle.

**Poll interval — continuous, default 20s, overridable via
`CHAIN_OBSERVER_INTERVAL_MS`:** Chose a long-running `setInterval` process
(matching `agent.mts`'s own pattern) over a one-shot script invoked
externally (e.g. by cron), with a `--once` flag kept for manual/CI use.
**Tradeoff:** a continuous process is simpler to reason about and to run
during this kind of live verification, but is one more long-lived process to
supervise; an externally-scheduled one-shot invocation would decouple
scheduling from this codebase entirely but wasn't needed for Task 2 as
specified ("your call, state the tradeoff"). 20s balances API/RPC call
volume against freshness; nothing about the two signals observed below
suggested a shorter interval would surface anything a 20s interval misses.

**Onchain-transfer correlation:** Watches `Transfer(address,address,uint256)`
logs on the Arc Testnet USDC contract filtered to `to == SELLER_ADDRESS`,
picking up exactly where the previous cycle's block scan left off
(`lastCheckedBlock + 1`), with a bounded lookback (200 blocks, configurable)
used only on the process's first cycle. This is deliberately the same
signal DECISIONS.md #008 already identified as the only genuine onchain
event available — the seller's own eventual withdrawal mint — expressed as
its underlying ERC-20 `Transfer` rather than the Gateway-specific
`AttestationUsed` event, since watching the token contract directly requires
no Gateway-contract ABI/topic knowledge beyond an address filter. **During
live verification, this stayed null every cycle** — expected and correctly
reported as null, not fabricated: the seller wallet never called
`withdraw()` in either test run, so there is no onchain transfer yet to
observe. This is not a bug in the observer; it is the honest absence of a
signal that only exists after a withdrawal.

**Empirical finding — `gateway_available` and `pendingBatch` move on
different timescales; report this precisely, not optimistically:** Ran the
observer (10s interval for faster sampling) concurrently with a live
`agent.mts` run generating real traffic (86 successful payments, confirmed
via `agent.mts`'s own success log lines, against 125 failures — see the
concurrency-backlog note below). Across the full ~9-minute window and 21
inserted rows:
- `gateway_available` (the `balance` field in Circle's `/v1/balances`
  response) **did not move once** — stayed at `0.9999` for every single row,
  despite dozens of confirmed-successful settles happening during that
  exact window.
- Circle's raw response also carries a **`pendingBatch`** field — present
  in the `raw` jsonb column (captured faithfully as part of the full raw
  response) but not promoted to its own `chain_observations` column, since
  the existing schema (migration `20260724000000_create_evidence_log.sql`)
  only defines `gateway_available`/`gateway_withdrawable` and this task was
  scoped to capture evidence into the existing table, not alter its schema.
  `pendingBatch` **did move**, four times, tracking payment volume almost
  immediately: `0 → 0.2985 → 0.3398 → 0.4334 → 0.5463 → 0.6399` USDC,
  climbing step by step as the agent's payments settled.
- `gateway_withdrawable` was `null` every row — Circle's response never
  contained a `withdrawable` key in any observation this session (only
  `balance` and `pendingBatch` were ever present). Reported as null rather
  than defaulted to `0`, per CLAUDE.md's rule against inventing a field that
  isn't actually there.

**Why this matters for Task 3:** This empirically sharpens, not just
confirms, DECISIONS.md #008's "eventually consistent" characterization —
the lag between a confirmed `settle()` and a visible `available` change is
longer than a single ~9-minute test window, not a few seconds of batching
jitter. Anyone building Task 3's corroboration logic on `gateway_available`
alone would see zero signal for a long stretch of genuinely successful
payments — a false negative, not a false positive, but still a real gap. If
`pendingBatch` remains this responsive under more testing, it may be a
better near-real-time corroborating signal than `available`, and worth a
first-class column rather than being left inside `raw` — a decision left to
whoever builds Task 3, not made here.

**Related, but explicitly not addressed here (holding, per instruction):**
during the live run, once concurrent in-flight requests climbed into the
dozens (`agent.mts` fires one request/second regardless of whether prior
ones have completed, and each request was taking several seconds to tens of
seconds end-to-end), a number of `verify()` calls returned HTML instead of
JSON (`Unexpected token '<', "<!doctype "... is not valid JSON`), consistent
with the Cloudflare-fronted Gateway testnet API rate-limiting or erroring
under burst load. This is the same RPC-latency/backlog territory flagged as
a side note after Task 1's fix and is explicitly out of scope for Task 2;
it did not prevent this task's verification (86 real successful payments
still landed), but it is why the payment count wasn't higher for the same
elapsed time.
**Status:** Accepted.

---

### Decision #012 — Task 3 inference engine v1: pendingBatch is an exact
### accumulator, and BREAK requires positive evidence
**Decision:** Built `lib/ballast/infer-state-v1.ts` — a pure, versioned
function `inferStateV1(event, observations, options?)` returning
`{ state, confidence, signals, engine_version }`. No I/O, no database access,
no clock read. `infer-replay.mts` reads evidence and prints derived
conclusions; it writes nothing back (CLAUDE.md principle 2).

**Empirical finding that reshaped the design — pendingBatch is an exact
running accumulator, not merely a correlated indicator.** #011 established
that pendingBatch "moves" with payment volume. Checking it properly against
the evidence log shows something considerably stronger: at 18 of 21
observations, pendingBatch equalled the cumulative sum of verified payment
amounts since the batch opened to the exact micro-USDC (diff 0.000000). The
three exceptions were -0.001000, -0.000300 and -0.000000 — each exactly one
payment's amount, i.e. a payment whose verification row was written on one
side of Circle's balance snapshot and counted on the other. Sampling
boundary, not drift.

This changes what is inferable. An aggregate reading normally cannot be
attributed to one payment (#008's correlation problem). But if the aggregate
equals the *exact sum* of a known set of payments, and every amount is
positive, then each member of that set is necessarily part of the total —
arithmetic attribution rather than timing coincidence. Confirmed on real
data: 46 of 199 payments reach FLOATING with an exact-sum match (e.g.
"0.639900 USDC equals the exact sum of 61 verified payments, this one among
them").

**Deviations from the task brief's suggested logic, and why:**

1. **BREAK requires positive evidence — this is the most important change.**
   The brief allowed BREAK on "still not reconciled after an expected
   window". Implemented instead as requiring *all* of: the window elapsed,
   readable observation coverage existing across it, and that coverage
   showing the value never entered a batch. **Absence of evidence is never
   sufficient.** If the observer was not running, the payment stays VERIFIED
   with an explicit `insufficient_observation_coverage` signal. A monitoring
   gap of ours must never be reported as a payment failure of theirs — that
   is manufacturing bad news from our own blind spot, and it would destroy
   the accuracy claim the product rests on. Verified on real data: 50
   payments verified after observation coverage ended returned VERIFIED, not
   BREAK.

2. **Ingestion-lag guard (`INGESTION_GRACE_MS` = 2 min).** Real data shows
   Circle takes seconds to tens of seconds to reflect a payment in
   pendingBatch (payments at 21:19:27-28 were absent at 21:19:23, present by
   21:19:32). Without a guard, a zero reading landing in that gap reads as
   "already cleared" when it means "not yet counted". 2 minutes is far beyond
   any observed lag.

3. **`promptCoverage` disambiguation.** A zero reading long after
   verification is equally consistent with "the batch cleared before we
   looked" and "this payment never entered a batch" — distinguishable only by
   whether we were watching at the time. If we observed promptly and the
   value never appeared, that is BREAK territory; if we only looked long
   after, a later zero is better explained by a batch we missed (weak
   RECONCILED, 0.6). Encoded explicitly rather than left to chance.

4. **Optional `siblingEvents` parameter** extends the brief's two-argument
   signature. The two-argument call behaves exactly as specified; supplying
   siblings only unlocks the exact-sum signal above. Kept optional because
   the stronger signal needs data the specified signature does not carry, and
   omitting it must never change correctness — only how much can be claimed.

5. **`asOf` derives from the inputs, never the clock.** Defaults to the
   latest observation's timestamp. Calling `Date.now()` inside the engine
   would make the same evidence yield different answers on different days,
   breaking the replayability that #004 exists to guarantee.

6. **BREAK window = 30 minutes**, the conservative top of the suggested
   range. A false BREAK tells someone their money vanished when it did not;
   a late BREAK merely tells them later. With only one incomplete batch cycle
   observed, err toward silence.

**Confidence scale, and why RECONCILED is clamped:**
- `VERIFIED` 1.0 — a hard fact. Circle's facilitator accepted the payment;
  the row exists only because `settle()` returned success.
- `FLOATING` 0.95 with exact-sum attribution, 0.85 with amount coverage
  alone. High, per the brief, but never 1.0: pendingBatch is an aggregate
  reading from a single source and does not name the payment.
- `RECONCILED` 0.75 (observed rise then clearance), 0.6 (zero after grace,
  rise never witnessed), 0.9 (corroborated by an onchain transfer to the
  seller). Hard-clamped at `MAX_RECONCILED_CONFIDENCE = 0.9`, enforced
  structurally in code rather than by convention, so no future edit can reach
  certainty. Rationale: the offchain signals all originate from Circle's own
  balances API — two readings from one source are not the independent
  corroboration CLAUDE.md principle 4 asks for. An onchain transfer *is*
  independent (it comes from the chain via RPC), which is why it scores
  highest, but per #008 it is an aggregate withdrawal and never names the
  payment. Nothing available justifies 1.0, so nothing returns 1.0.
- `BREAK` 0.7 — positive evidence, but "we looked and found nothing" is
  inherently weaker than a positive observation.

**A bug that only real data exposed:** batch-scoping for the exact-sum check
initially searched post-verification observations only. The batch holding a
payment generally opens *before* that payment is verified, so the opening
zero-reading sits in earlier evidence; scoping to post-verification silently
folded every previous batch's payments into the sum, which then never
matched. The synthetic tests passed anyway because they had no prior-batch
history. Fixed, and `CASE 7b` now encodes exactly that shape. Worth
recording as a reason STEP 4 (replay against real evidence) is not optional
validation theatre.

**A second bug, also only exposed by real evidence.** A payment that had
already cleared (accumulator empty well after its verification) continued to
be scanned against later observations, and was credited with the rise *and*
fall of a subsequent, unrelated batch — reporting 0.75 ("we watched it float
and clear") on evidence belonging to other payments. Verified concretely: a
run-1 payment verified at 20:59:03, already cleared by the 21:13:14 reading
of zero, was being scored on run 2's 21:19:32 rise. Fixed by terminating the
scan at the first post-grace zero: an empty accumulator ends that payment's
lifecycle, and everything after belongs to a later batch. `CASE 7c` encodes
it. The conclusion (RECONCILED) was never wrong — the *confidence* was
overstated, which for this product is the more dangerous failure.

**A live batch settlement landed mid-task, and it corrects #011.** A routine
observer run after the engine was written returned `available=1.9999`,
`pendingBatch=0` — up exactly 1.000000 USDC from the 0.9999 that #011
recorded as immovable, and exactly run 2's verified total (111 payments,
1.000000 USDC). So `gateway_available` **does** move; #011's "did not move
once" was true of its ~9-minute window but wrong as a general claim. The
corrected picture: value flows `pendingBatch` → `available` when a batch
settles, on a timescale of tens of minutes rather than seconds. This also
confirms the accumulator model end-to-end, from an independent direction.

**Results on real evidence (199 verification_events, 22 chain_observations,
after the batch settled):** 61 RECONCILED @ 0.75 — the strong path, witnessed
rise *and* clearance — and 138 RECONCILED @ 0.6, the weak path where the rise
fell outside observation coverage. **0 BREAK.** The 61 corresponds exactly to
the payments falling inside the observer's coverage window, an independent
consistency check on the engine's discrimination. Before the batch settled
the same evidence yielded 46 FLOATING @ 0.95, 15 FLOATING @ 0.85, 88
RECONCILED @ 0.6 and 50 VERIFIED @ 1.0 — the engine tracked the lifecycle
forward as evidence arrived, without any state being stored or mutated.

**This satisfies CLAUDE.md's "THE ONE THING WE ARE PROVING RIGHT NOW":** a
real Arc nanopayment observed moving VERIFIED → FLOATING → RECONCILED, with
a deterministic, replayable conclusion carrying its complete evidentiary
basis, and RECONCILED presented as a confidence-scored inference rather than
a hash-proven fact.

**Known limitations, stated rather than papered over:**
- BREAK has never fired on real data, because no real payment has gone
  missing. Its logic is exercised only by fixed test evidence.
- No conclusion in this dataset reaches 0.9: that requires an onchain
  withdrawal, and the seller has never called `withdraw()`. Unit-tested only.
- The 138 payments at 0.6 are scored weakly because of *our* coverage gaps,
  not anything about those payments. Denser observation would move most of
  them to 0.75; this is a monitoring-completeness limit, not a payment
  problem, and the engine says so in its signals rather than hiding it.
- `gateway_available` is read but no signal depends on it yet. Now that it is
  known to move (above), a v2 could use an `available` increase as genuine
  corroboration — deliberately not added to v1, whose behaviour is frozen.
**Status:** Accepted.

---

### Decision #013 — pending_batch column added by migration but NOT applied
**Decision:** `supabase/migrations/20260725000000_add_pending_batch.sql`
adds `chain_observations.pending_batch` (additive; no existing column
altered, no row rewritten). **The migration has not been applied to the
remote database** — it needs to be run by someone holding credentials this
environment does not have.
**Reason:** Applying it requires either a linked Supabase project plus the
database password, or a `SUPABASE_ACCESS_TOKEN`. Neither is present, the
project is not linked, and no DDL-capable RPC is exposed to the service role
(verified: `exec_sql`/`execute_sql`/`sql` all absent). Per CLAUDE.md rule 5,
no attempt was made to obtain or handle a database secret.
**Consequences, handled rather than deferred:**
- `chain-observer.mts` probes for the column once at startup and includes it
  only when present, so the observer keeps recording evidence unchanged
  against the un-migrated database instead of failing every insert. The
  value continues to be captured in `raw` regardless, so no observation is
  lost in the interim.
- `inferStateV1` reads the column when populated and falls back to `raw`
  otherwise, so rows written before and after the migration are equally
  usable. This is also the correct long-term posture: `raw` is the permanent
  evidence, the column is a derived convenience (CLAUDE.md principle 3).
**To apply:** `supabase link --project-ref <ref>` then `supabase db push`,
or paste the migration into the Supabase dashboard SQL editor.
**Status:** Accepted, pending application.

---

### Decision #016 — pending_batch migration confirmed applied
**Decision:** User confirmed migration `20260725000000_add_pending_batch.sql`
applied in production Supabase (column visible in Table Editor).
`chain-observer.mts` required no new code for this — its write path already
existed from Task 2, gated behind the startup probe described in #013. The
probe now passes silently and writes land in `pending_batch` directly.
Verified with a real row: `pending_batch: 0` (numeric, not null) — correctly
0 because the batch open during Task 3 had already cleared by the time of
this check (see #012's `available` jump to 1.9999), not a broken write.
**Status:** Accepted. Supersedes the "pending application" note in #013.

---

### Decision #017 — Task 4 first observability screen: route placement,
### state-vs-signal reconciliation, poll cadence, and how "current" was verified
**Decision:** Built `app/dashboard/observe/page.tsx` + `hooks/use-observability.ts`
— a client-rendered page at `/dashboard/observe` that queries
`verification_events` and `chain_observations` directly (both allow public
SELECT via RLS — confirmed empirically before relying on it, not assumed)
and calls `inferStateV1` client-side for each of the most recent 40
payments. No mocked, simulated, or hardcoded values anywhere on the page;
every number is a live query result or a direct output of the engine.

**Route placement — nested under `/dashboard`, not a new top-level route.**
The brief allowed either "/observe or extend the existing dashboard." Chose
nesting under the existing `app/dashboard/layout.tsx` so the page inherits
the app's only auth gate (`proxy.ts`'s session-cookie check) for free,
rather than standing up an unauthenticated route or duplicating auth
plumbing for a page whose entire content is the seller's private payment
evidence. No other dashboard file was modified — no nav link was added, to
avoid touching files outside this task's explicit scope; the page is
reachable directly at `/dashboard/observe`.

**Display limit — 40 most recent payments, no pagination.** Chosen so the
whole set fits on one scroll for a "functional, not designed" first screen;
pagination was judged to be design-system work the task explicitly excluded.
Sibling-event context for exact-sum attribution is NOT limited to 40 — the
hook fetches the full `verification_events` table for that purpose, since
the engine's arithmetic attribution can require siblings outside the
displayed window (see #012's batch-scoping fix).

**Poll cadence — 15s plain interval, no websockets.** Per the brief's
explicit allowance. #012 established payment states here evolve on a
tens-of-minutes timescale (pendingBatch clears, gateway_available moves),
not seconds — a realtime subscription would solve a latency problem that
does not exist yet, matching #011's identical reasoning for the chain
observer's own poll interval. Tradeoff: up to 15s of staleness and a
repeated full-table read per client, both cheap at current row counts (low
hundreds); revisit if row counts or the audience for this page grow.

**Reconciled the brief's phrasing against the actual engine contract, without
touching the engine.** The task listed `insufficient_observation_coverage`
alongside `VERIFIED/FLOATING/RECONCILED/BREAK` as if it were a fifth state.
Per #012's actual design it is a *signal* attached to `VERIFIED`, not a
distinct state — `inferStateV1`'s return type has exactly four state values.
Adding a pseudo-state to match the phrasing would have both violated this
task's explicit "do not touch the inference engine" constraint and
contradicted #012's own reasoning for why that information belongs on a
signal, not a state. The page shows the real state (`VERIFIED`) with that
signal listed underneath, which conveys the identical information correctly
labeled.

**Verification could not include a browser screenshot — reported rather
than faked.** Neither `chromium-cli` nor a working Playwright browser
install is reachable in this sandbox: `chromium-cli` is absent from PATH,
and `npx playwright install chromium` failed outright with
`getaddrinfo ENOTFOUND cdn.playwright.dev` — the sandbox's network allows
Circle's API, Supabase, npm, and Arc RPC, but not Playwright's browser CDN.
No custom driver could route around a DNS failure. Verified everything
short of pixels instead: (1) `curl` with a manually-set `session=authenticated`
cookie confirmed the route returns HTTP 200 with the correct initial shell
(not redirected by the auth gate, no server-side render error); (2)
`tsc --noEmit` across the project reported zero errors touching either new
file; (3) a standalone script reusing the exact same public-anon-key queries
and `inferStateV1` calls the hook makes reproduced, headlessly, precisely
what the component computes — this is the strongest verification available
without a browser, since it exercises the real network path (same
credential class, same RLS, same live tables) and the real engine, just
without a DOM.

**An honest, unplanned finding from that verification: "now" had moved
past every currently known payment.** Running the real query today (two
real days after the evidence was generated) showed all 40 most recent
payments as RECONCILED @ 0.6 — no VERIFIED-only or FLOATING payment
remained, because the engine's default `asOf` (the latest observation's
timestamp) is now itself two days in the past relative to true current
time, and every payment verified before that point has had its complete
lifecycle observed. This is correct behavior, not a bug: a replay system
evaluated against complete historical evidence should converge to final
states, not stay artificially suspended in an earlier phase. To actually
demonstrate the VERIFIED→FLOATING→RECONCILED discrimination the task asked
to see, evaluated the same real evidence at three earlier, labeled `asOf`
snapshots (a parameter already built into the engine for exactly this kind
of replay, not a special case added for this check) — real data throughout,
just anchored to when it actually happened rather than to the frozen "now"
of a two-day-old observation window:
- `asOf` 21:19:00 (before run 2's first observation): a run-1 payment
  reads RECONCILED @ 0.6 — its batch had genuinely already cleared earlier.
- `asOf` 21:19:33 (moments after the first mid-run reading): a payment
  verified seconds earlier reads FLOATING @ 0.95, with exact-sum
  attribution against 27 other payments in the same open batch.
- `asOf` 21:22:10 (near the end of run 2, batch still open): a payment
  verified 2 seconds earlier reads VERIFIED @ 1.0, with an
  `insufficient_observation_coverage` signal — correctly nothing more
  claimed, since no observation existed yet after it.
- The same payment (0x90a9f60b6d…, 0.03 USDC, /api/premium/agent-task)
  tracked FLOATING @ 0.95 at both the 21:19:33 and 21:22:10 snapshots,
  consistent with the batch it was part of not having cleared yet at
  either point — exactly the persistence a correct engine should show.

**Deviation this implies for the live page today:** anyone opening
`/dashboard/observe` right now will see every row as RECONCILED, not a mix
of all three states — an accurate reflection of the evidence's actual age,
not a defect in the page or the engine. A mixed view returns automatically
the next time new traffic is generated (`npm run agent` + `npm run
chain-observer`), with no code change required.
**Status:** Accepted.
