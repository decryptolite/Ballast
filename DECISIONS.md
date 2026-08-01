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

---

### Decision #021 — Operational State component: independence, the
### stale-coverage threshold, and why the click target is inline, not scroll-only
**Decision:** Built `hooks/use-operational-state.ts` +
`components/dashboard/operational-state.tsx`, mounted at the top of
`/dashboard/observe`. Does not import or read anything from
`useObservability`'s state — its own Supabase client instance, its own
query against `verification_events`/`chain_observations`, its own 10s
poll timer. Does not modify `lib/ballast/infer-state-v1.ts`,
`chain-observer.mts`, or `hooks/use-observability.ts` — imports
`inferStateV1` and the already-exported `BREAK_WINDOW_MS` read-only.

**Deliberately duplicated, not shared, query code.** ~15 lines of the
Supabase query are identical to `useObservability`'s. Not factored into a
shared helper on purpose: the requirement is that this component "must be
able to be correct even if the ledger UI hasn't rendered or has stale
data," and a shared fetch function is exactly the kind of coupling that
would later get "optimized" (a shared cache, a single fetch hoisted to a
parent) in a way that silently reintroduces the dependency this component
exists to not have. Duplication here is the feature, not an oversight.

**The stale-coverage threshold — a real judgment call, not in the brief.**
The engine attaches the same signal kind, `insufficient_observation_coverage`,
to two different situations: a payment verified one second ago (completely
normal — nothing has had time to observe it yet) and a payment verified 40
minutes ago with still nothing (the observer is probably not running, which
*is* actionable). The signal kind alone doesn't distinguish them; only real
elapsed wall-clock time does. Chose to flag the second case as "requires
attention" only once elapsed time since verification reaches
`BREAK_WINDOW_MS` (30 min, imported from the engine rather than
re-declared, so the two thresholds can never drift apart) — the same bar
the engine itself uses for BREAK. Reasoning: a payment with genuinely no
observation coverage for that long is at least as concerning as a BREAK
(it means our own monitoring has a gap), so treating it with equal urgency
is correct, not arbitrary. Below that threshold, it is silently ignored —
counting every freshly-verified payment as "needs attention" would make the
indicator noisy on any live system and defeat its purpose as a calm,
trustworthy signal.

**Reading the clock here, while the engine never does — a deliberate,
bounded exception, not a compromise to #004.** `inferStateV1` stays pure
and clock-free by design, because its job is replayable historical
inference (#004, #012). This component's job is a different question —
"is our monitoring falling behind, right now" — which is inherently a live
question a pure function over historical evidence cannot answer on its
own. `Date.now()` is used only in this hook, only to measure elapsed time
for the attention threshold above; it never flows into `inferStateV1`'s
`asOf` or into any stored/derived state. Recorded explicitly so this
doesn't read as an accidental erosion of the engine's purity guarantee —
it's a separate concern in a separate file.

**Click behavior — inline reveal, with scroll-to as a best-effort bonus,
not the primary mechanism.** The brief allowed "a simple scroll-to or
filter." Chose an inline expandable list over pure scroll-to because the
ledger below only renders its most recent 40 payments
(`DISPLAY_LIMIT` in `hooks/use-observability.ts`) — a flagged payment
found by this component's full, unbounded query is not guaranteed to be
among them. Depending solely on `scrollIntoView`/anchor-jump to a DOM node
that might not exist would silently fail exactly when this component's
independence requirement matters most. The inline list is therefore the
primary, always-correct interaction; each entry additionally links to
`#payment-{id}` (an `id` attribute added to each ledger row in
`observe/page.tsx` — the only change to that file, purely presentational,
not a query-logic change) as a convenience when the row happens to be on
screen.

**Verification on real data (no fabricated states):**
- **Calm state, true current data:** 308 real payments evaluated, 0
  floating, 0 flagged → `level=calm`, `"All observations reconciled"`.
  Consistent with #017/#018: everything from the last live run has fully
  resolved.
- **Attention state:** no payment currently meets the bar for real (all
  evidence is old enough to have either fully reconciled or never
  existed), so — following the same honest-replay method already used and
  recorded in #017 for the identical problem — reconstructed it from real
  evidence at a real historical moment: evidence truncated to what existed
  as of `2026-07-25T21:22:10Z`, evaluated with a simulated "now" 35 minutes
  later (past `BREAK_WINDOW_MS`). Result: `level=attention`,
  `"6 payment(s) require attention"`, all six correctly reason=
  `stale_coverage` with the engine's own `insufficient_observation_coverage`
  signal attached — no BREAK exists in this dataset (consistent with
  #012/#014: no payment has ever actually failed to reconcile), so the
  attention state observed here is entirely the coverage-gap path, not a
  fabricated BREAK.
- Not verified live in a browser, for the same reason as #017: no browser
  automation is reachable in this sandbox (`chromium-cli` absent,
  `cdn.playwright.dev` DNS-unreachable). `tsc --noEmit` across the project
  reports zero errors touching either new file or the modified page.

**Confidence:** HIGH for the query/classification logic and both states
above — verified directly against real repository data per the method
above, not assumed. MEDIUM for the click/expand interaction and the
`#payment-{id}` anchor behavior specifically — implemented and
type-checked, but not exercised in an actual browser (same unavailable-
tooling constraint as #017), so its DOM behavior is reasoned, not observed.
**Status:** Accepted.

---

### Decision #022 — Documentation set synced into the repo; CLAUDE.md
### corruption repaired; reconciliation of the reconstructed DECISIONS copy
**Decision:** Wrote the four governance/design documents the user authored
in chat into the repo root verbatim (`DESIGN_PHILOSOPHY.md`,
`PARKING_LOT.md`, `BALLAST_MASTER_SPEC.md`, `BALLAST_DESIGN_SYSTEM.md`,
with transfer mojibake restored to proper punctuation) — they were stated
to be in the repo but only `CLAUDE.md`/`DECISIONS.md` existed on disk.
Also repaired `CLAUDE.md`: line 150 contained a literal
`EOFcat >> CLAUDE.md << 'EOF'` heredoc artifact followed by a duplicated
Confidence Policy/Cost of Change section (a malformed append performed
outside any Claude Code session); removed the artifact and duplicate,
content otherwise unchanged.
**Reconciliation note:** the reconstructed DECISIONS.md attachment
accompanying this task correctly deferred to the on-disk file as
authoritative and acknowledged the earlier fabricated #018–#020 entries as
discarded. Verified via `git diff` that the on-disk log was untouched by
anything external: its only change since the last commit is #021. On-disk
entry sequence remains #001–#013, #016, #017, #021 (numbering gaps are
historical fact, not errors — #014/#015/#018–#020 were never legitimately
recorded here).
**Status:** Accepted.

---

### Decision #023 — Row-expansion depth interaction: first styled surface,
### and the gaps deliberately flagged rather than silently decided
**Decision:** Built `components/dashboard/ledger-row.tsx` (LedgerRow,
LedgerHeader, LedgerRowStyles) and replaced the plain table in
`app/dashboard/observe/page.tsx` with it. Four-depth expansion-in-place
per BALLAST_DESIGN_SYSTEM.md §10: Collapsed/Priority (four fixed-position
columns, grid template shared with the header so positions never shift),
Understanding (evidence signal lines, +24px nesting), Audit (raw evidence
+ engine version + replay placeholder, a further +24px). Design tokens from
§3/§4/§5/§14 applied scoped to this component only — Operational State and
page chrome untouched, per task constraint. `#payment-{id}` anchors
preserved on the row root so #021's attention-list links keep working.
Engine, observer, and Supabase queries untouched.

**Interpretation of "do not touch any query logic," stated openly:**
`hooks/use-observability.ts` now *returns* the chain_observations it was
already fetching (three small edits: interface field, state var, return
field). The Supabase queries are byte-identical — this is a return-shape
addition, not a query change. Without it the Audit depth would have had no
raw observation JSON to show, failing the milestone's explicit requirement.
Judged within the constraint's intent; flagged here so it isn't discovered
as a silent liberty.

**Audit depth scoping — never broader than the conclusion:** the raw JSON
shown is (a) the verification_event row as fetched and (b) only the
chain_observations rows whose ids appear in this inference's own
`signals[].observation_id` — the same discipline the Evidence Assistant
spec mandates for retrieval ("identical to, not merely related to, the
engine's evidence input"). When no signals reference an observation, Audit
says so plainly instead of dumping unrelated rows.
**Known limitation (flagged, needs a user call):** `verification_events.raw`
(the full captured payload) is not fetched by the existing query, so the
event JSON shown is the fetched row, not the complete raw capture. Fetching
it would mean widening the select — a genuine query change, deliberately
not made under this task's constraint. Decide separately whether Audit
should include it.

**Gaps the design system left open — flagged, not silently invented:**
1. **VERIFIED has no color token** (§3 defines only BREAK/FLOATING/
   RECONCILED). Rendered in `--ink-secondary` with the same structural
   badge treatment: VERIFIED is the neutral baseline fact and the
   philosophy reserves color for states communicating beyond baseline.
   MEDIUM confidence — awaiting design confirmation.
2. **Collapsed-vs-Priority:** task instruction and §10 both say identical
   for now (and the task's "four columns incl. confidence in Collapsed"
   overrides MASTER_SPEC §7's "Priority adds confidence" — a real conflict
   between the two spec documents, resolved by the explicit instruction,
   recorded rather than silently picked). Interaction therefore has three
   effective visual positions (priority ↔ understanding ↔ audit) until the
   distinction is finalized.
3. **Timestamp column:** §10's collapsed anatomy has no timestamp column,
   so "Verified at" moved from the old table into the Understanding depth
   (caption line) — information preserved, not dropped.
4. **IBM Plex not bundled:** referenced via CSS font-family stacks with
   system fallbacks. Bundling requires either a network font fetch at build
   time (unreliable in this sandbox — see #017's DNS constraint) or
   vendored font files (an asset-licensing/size decision not this task's
   to make). Tokens are in place; swapping in real Plex files later is a
   no-code-change upgrade.
5. **Motion:** §8's 200ms ease-out implemented as opacity-only unfold
   (+ `prefers-reduced-motion` respected, instant focus ring, 100ms hover
   wash). Height animation deliberately omitted — it requires measured-
   height machinery, and §8 itself scopes expansion motion to
   "height/opacity only"; opacity alone satisfies "motion because
   information changed" without the complexity. BREAK rows get no
   transition at all, per §8's abruptness rule.

**Verification:** `tsc --noEmit` clean across the project (exit 0, zero
errors in touched files). Browser verification unavailable again —
`chromium-cli` absent, `cdn.playwright.dev` unresolvable (same as
#017/#021) — stated per instruction rather than fabricated. Data-path risk
of this change is low: the row renders the same `{event, inference}`
objects the previous table rendered, plus already-fetched observations.
**Confidence:** HIGH that the depth logic, badge treatment, token values,
and audit-scoping match the written spec (verified against the documents
and the compiler). MEDIUM on actual rendered appearance and the
click/keyboard interaction feel — implemented to spec, type-checked, not
yet seen in a browser by me; the user's own browser check is the
verification path, same as prior UI tasks.
**Status:** Accepted.

---

### Decision #024 — User rulings on the four items flagged in #023
**Decision (all four ruled by the user, verbatim intent):**
1. **VERIFIED badge color = `--ink-secondary`:** confirmed. Kept as built.
2. **`verification_events.raw` in Audit:** approved in principle, but as a
   separate follow-up task — the query is NOT to be widened yet. Audit
   continues to show the event row as fetched until that task runs.
3. **Collapsed/Priority visually identical:** confirmed as built.
   `BALLAST_MASTER_SPEC.md` §7's "Priority adds confidence score" line was
   corrected to state the two depths are currently identical with any
   distinction deferred — a documentation correction to match the
   implementation, explicitly not a new design decision.
4. **Audit-scoping discipline** (only signal-referenced observations, never
   broader): confirmed correct.
**Status:** Accepted.

---

### Decision #025 — Timeline Replay UI: discrete ticks, truncated-evidence
### replay, replay lifecycle, and a tick bound the spec didn't anticipate
**Decision:** Replaced the Audit-depth placeholder in
`components/dashboard/ledger-row.tsx` with the real Timeline Replay
control. No engine change — `inferStateV1` is imported and called, never
modified. `hooks/use-observability.ts` now also exposes the fetched
verification_events (`events`) — the same return-shape-only pattern
accepted in #023 (queries byte-identical); replay needs sibling events
truncated to the replay moment for exact-sum attribution to reproduce.

**Replay semantics — identical to every recorded verification method:**
selecting a tick re-runs the engine with (a) observations truncated to
`observed_at <= tick`, (b) sibling events truncated the same way, and
(c) `asOf = tick`. This matches the engine's actual contract (`asOf` gates
the time-window logic; the evidence lists supply "what was known then") and
is byte-for-byte the method used in #017/#021's historical verifications.
The result feeds a single `displayInference` variable that the existing
header badge / confidence / signal-lines / audit-JSON rendering already
reads — replay reuses the live render path, nothing duplicated.

**Discrete ticks (§7):** one tick per real recorded evidence point — the
payment's verification event, then chain observations at/after it. Even
spacing, deliberately not time-proportional: proportional spacing would
visually suggest a continuum between evidence points, the exact implication
§7 prohibits. Overflow scrolls in its own container.

**Tick bound — a genuine scale gap in the spec, decided and flagged:** §7
was written when observations numbered ~22. Real data now holds 500+ global
observations, so an unbounded tick set for one early payment rendered 528
ticks — 525 of them yielding an identical terminal state after the
payment's lifecycle had concluded: zero information, unusable density,
"guilty until proven innocent" by the philosophy's own test. Ticks
therefore run from the verification event through the **last observation
the live conclusion's signals reference** (the evidence that actually
produced the outcome); payments whose conclusion references no observation
keep every post-verification tick. Bounded by the live inference, not the
replayed one, so the tick set stays stable while scrubbing. Verified on
real data: the #012 tracked payment went 528 → 3 ticks while still
replaying its complete lifecycle (VERIFIED@1 → FLOATING@0.95 →
RECONCILED@0.75, live state matching the final tick); the 40 currently
displayed payments get 33–36 ticks each (their real ~10-minute lifecycles
at the observer's actual cadence). MEDIUM-confidence design call —
review welcome; trivially removable if all ticks are preferred.

**Replay lifecycle — historical state must never linger unexplained:**
replay exists only while the Audit depth is open. Closing Audit or
collapsing the row clears it. Reasoning: replay re-renders the row's badge
in the ledger itself; a FLOATING badge left behind by a forgotten replay
would corrupt the one surface whose scanning integrity the philosophy
calls sacred. While active, an ink-tone banner (no new color — §3 reserves
color for payment states) sits at the top of the unfolded content:
"Historical replay — state shown as of <mono timestamp>, not live" with a
"Return to live" ghost button; the control itself carries a monospace
readout ("Viewing: <timestamp>" vs "Live — current evidence") and a Live
chip. State swap per tick is instant — no transition, no interpolation
(§8).

**Note:** the task message's final requirement was truncated mid-sentence
("...this must"); interpreted as completing the sentence's own subject —
the replay-vs-live indicator must be unambiguous — which the banner +
readout + auto-clear lifecycle implement in triplicate.

**Verification:** headless replica of the exact component logic (same
anon-key queries, same tick/truncation code) against real evidence reproduced
the full lifecycle above; `tsc --noEmit` clean project-wide (exit 0).
Browser rendering not verified — same sandbox constraint as #017/#021/#023,
stated rather than fabricated.
**Confidence:** HIGH on replay correctness, tick discreteness, and reuse of
the live render path (verified against real data + compiler). MEDIUM on
rendered appearance/interaction feel (no browser) and on the tick-bound
design call (flagged above for review).
**Status:** Accepted.

---

### Decision #026 — User rulings on the Timeline Replay flags (#025)
**Decision (ruled by the user):**
1. **Tick bound confirmed and approved** — the evidence-scoped reasoning
   (ticks through the last observation the live conclusion's signals
   reference) is correct; kept exactly as built.
2. **`events` return-shape exposure from `use-observability.ts`:** approved
   (same pattern as #023's observations; queries byte-identical).
3. **The truncated task-message requirement:** the completed interpretation
   (replay-vs-live indicator must be unambiguous) was confirmed correct as
   built.
No implementation changes accompany this entry — record of ruling only.
**Status:** Accepted.

---

### Decision #027 — OPEN: rendering discrepancy between built code and a
### viewed instance; deferred until full build is ready
**Finding (investigated, not resolved — per instruction):** a viewed
`/dashboard/observe` instance rendered the pre-milestone flat table
despite the last three milestones being complete on disk. Investigation
established with direct evidence: (a) the source imports and renders the
new ledger-row component and the old table markup no longer exists in the
source; (b) the local dev server (only instance on the machine, restarted
after the edits) provably serves the new code — its served JS chunks
contain "Timeline replay" and "blst-row-header" and do NOT contain the old
table's strings, which also structurally rules out a swallowed runtime
error (old markup cannot render from a bundle that does not contain it);
(c) root-cause hypothesis: all milestone work was uncommitted at the time
— the last pushed commit (3da8ae6) contains exactly the old flat table,
so any instance built from the pushed repo (deployment, second clone,
stale tab predating the restart) shows exactly the reported symptom. The
commit accompanying this entry removes that divergence for the future;
whether it was the actual instance viewed is unconfirmed (the viewed URL
was not identified).
**Status: OPEN — deferred, not resolved.** All testing/debugging paused
until a full build is ready, per instruction. MUST be revisited and
positively closed (identify the viewed instance, confirm it now renders
the built UI) before any final testing, demo, or submission.

---

### Decision #028 — verification_events.raw surfaced in Audit depth
### (deferred from #023/#024, now approved and done)
**Decision:** Widened the ledger's verification_events select in
`hooks/use-observability.ts` by one column (`raw`) and surfaced it in the
Audit depth of `components/dashboard/ledger-row.tsx` with the same visual
treatment as the existing chain_observations raw display (mono, small,
ink-tertiary, scrollable). Engine and observer untouched.
**Behavior unchanged beyond the widening — verified empirically, not
assumed:** old vs new select against the live database return the same 308
rows, same ids, same order; all 308 carry a non-null raw with the expected
capture shape (requirements, settleResult, verifyResult, paymentPayload).
Same table, same ordering, no filter change.
**Presentation call:** the Audit block "verification_event (as fetched)"
now renders the row minus `raw`, and the payload gets its own labeled
block ("raw payload (as captured at verification)") — duplicating a
multi-KB payload inside two JSON blocks would be noise, not evidence. A
row with no payload says so plainly rather than rendering an empty block.
**Typing:** new exported `FetchedVerificationEvent` (engine's input shape
+ id + raw) in the hook; the engine's own `VerificationEventInput` type is
untouched — `raw` is display-only evidence the engine neither requires nor
reads, and passing it as an extra property is structurally inert.
**Scope note:** `use-operational-state.ts`'s own query deliberately NOT
widened — its classification job doesn't need the payload, and per #021
its query is deliberately independent; widening it would be silent scope
creep with real transfer cost (multi-KB × hundreds of rows × 10s poll).
**Known cost, accepted:** the ledger hook's poll now transfers each event's
raw payload (order of a few KB per row) every 15s. Acceptable at current
row counts; revisit alongside pagination if the table grows.
**Status:** Accepted.

---

### Decision #029 — #027 RESOLVED: stale browser tab, not a code defect
**Resolution (verified by the user in a real browser, reported directly):**
the flat-table rendering reported in #027 was a stale browser tab. A fresh
incognito session against the running dev server rendered row-expansion,
the badge treatment, evidence signal lines, and the Audit section
correctly, with a clean console. This closes #027's required revisit: the
UI work from #021/#023/#025/#028 is now confirmed genuinely working in a
browser — the first browser-level confirmation of these surfaces, upgrading
what had been compiler-plus-headless-verification-only (the MEDIUM
rendered-appearance caveats in those entries).
**Contributing factor now moot:** #027's divergence hypothesis
(uncommitted work vs. pushed repo) was eliminated in the same session by
commits 2529b02/6763696 — local tree and origin/master now match.
**Status:** Accepted. #027 closed.

---

### Decision #030 — BREAK remediation workflow: promoted to Build Now and
### built (minimal model); resolves Open Question #3
**Classification (user ruling):** BREAK remediation promoted from
unclassified to Build Now — the "most important remaining gap" per
BALLAST_MASTER_SPEC §19/§24 and PARKING_LOT's own reclassify flag. This
resolves the master spec's Open Question #3.

**Model built — the type separation is the architecture:**
- New append-only table `remediation_events`
  (migration `20260729000000_create_remediation_log.sql`): HUMAN-ACTION
  records, architecturally distinct from system evidence per PARKING_LOT's
  hard prerequisite. The inference engine never reads it — enforced
  structurally (`inferStateV1` performs no I/O and takes no such input) and
  documented in the table comments. **A resolved BREAK is still a BREAK in
  engine terms; "resolved" is a human claim displayed beside the engine's
  conclusion, never in place of it.**
- Append-only with the same real enforcement as the evidence tables (#009):
  RLS public-read, service-role-insert, explicit `REVOKE UPDATE, DELETE`
  from all three roles. Corrections are new records, never edits.
- **Write path:** only through `POST /api/ballast/remediation` — gated by
  the app's session cookie, inserting with the server-side service role.
  The browser's anon key is read-only on this table. Validation: action
  whitelist, note capped at 2000 chars, **resolve requires a non-empty
  note** (a resolution that cannot defend its outcome later is worthless
  for audit — the record exists for Layer 4).
- **UI:** `components/dashboard/remediation-section.tsx` +
  `hooks/use-remediation.ts`, rendered inside the expanded row at
  Understanding level (an operator acting on a BREAK should not have to
  dig to Audit), after the evidence signals. History is permanent and
  shown whenever records exist, even after the payment stops requiring
  attention; action buttons appear only while it does. Ink-tone treatment
  only — remediation is UI action, not payment state, so state colors are
  untouched; submit failures use the §3 system-error token, deliberately
  not the BREAK color.

**Design calls made and flagged for ratification (the #023→#024 pattern):**
1. **Two actions only — acknowledge, resolve.** No "assign": the app has a
   single demo identity, so ownership semantics would be fiction. Add when
   real identity exists.
2. **`actor` = 'operator' placeholder** for the same reason (spec §16's
   demo-credential caveat).
3. **Attention criteria in the row** duplicate the Operational State's
   predicate but import the same `BREAK_WINDOW_MS` from the engine —
   thresholds structurally cannot drift (#021's discipline). Computed from
   the LIVE inference only; actions are disabled during Timeline Replay
   (historical view is not the place to act on the present) and the clock
   read is the same bounded #021-style exception.
4. **Actions stay available while attention persists, even after a resolve
   record exists** — append-only philosophy: never lock a log because
   someone wrote in it; a wrong resolution is corrected by a newer record.
5. **Operational State integration deferred** (showing
   acknowledged/resolved status in the attention list) — a real follow-up,
   not silently included; it would add a remediation query to a hook whose
   independence #021 deliberately protects.

**Not applied:** the migration — same credential constraint as #013;
verified empirically that the UI and hook degrade honestly (live query
against the real DB returns "Could not find the table ... in the schema
cache", which the hook maps to an explicit "Remediation log unavailable —
migration not applied" notice, never a crash or silent absence). Apply via
`supabase db push` or the dashboard SQL editor, as with #013→#016.

**Verification:** `tsc --noEmit` clean project-wide (exit 0); the
missing-table degradation verified against the live database. Browser
verification not performed this session (same tooling constraint); the
write path additionally cannot be exercised at all until the migration is
applied — both stated rather than claimed.
**Confidence:** HIGH on schema/enforcement/route validation/type separation
(verified from code and live DB behavior). MEDIUM on the section's rendered
appearance and the end-to-end write path (unexercisable until migration is
applied; server-side logic reasoned + type-checked only).
**Status:** Accepted (design calls 1-5 above awaiting ratification).

---

### Decision #031 — remediation_events live; write-path guardrails verified
### against the running server; insert path deliberately left unexercised
**Table:** live in production Supabase with the exact intended schema and
enforcement — verified by the user directly (columns match the migration,
UPDATE/DELETE revoked from anon/authenticated/service_role with only the
postgres table owner retaining them, RLS blocking anon/authenticated
INSERT) and independently confirmed here via anon read (0 records).

**Write-path guardrails exercised against the actual running dev server**
(all four write nothing; row count confirmed 0 before and after):
- no session cookie → 401 Unauthorized
- invalid action → 400 "action must be one of: acknowledge, resolve"
- resolve with blank note → 400 "resolve requires a non-empty note"
- malformed verification_event_id → 400 "must be a UUID"
(First two initially returned connection failures on the route's cold
compile — Next dev compiles routes on demand; both passed on the warm
retry. Not a defect.)

**The 201 insert path remains unexercised, deliberately.** At verification
time no payment qualified for attention: all 308 live payments evaluate
RECONCILED (170 @ 0.75, 138 @ 0.6), zero BREAK, zero stale-coverage under
the shared predicate. Writing an acknowledge/resolve record against a
payment that does not require attention would fabricate a human-action
record — the exact class of dishonest data this table must never contain.
Per instruction, the absence is stated instead.
**Honest route to full E2E coverage, when wanted:** generate real traffic
with the chain observer OFF for >30 min. The resulting
`insufficient_observation_coverage` past `BREAK_WINDOW_MS` is a *genuine*
monitoring gap, not a simulation — those payments would truly require
attention, and acknowledging one would be a truthful operational record.
Not done unilaterally: it spends real testnet funds and writes a permanent
gap into the observation history.
**Confidence:** HIGH on everything verified above. The insert path stays
MEDIUM (validated + type-checked, never executed) until a genuine
attention case exists.
**Status:** Accepted.

---

### Decision #032 — Audit Export: a portable, self-describing audit
### document per payment, exported from the Audit depth
**Decision:** Built `lib/ballast/audit-export.ts` (pure, version-stamped
builder — `export_version: "1"`, independent of the engine version so the
document format can evolve without touching inference) and
`components/dashboard/audit-export-button.tsx`, wired into the Audit depth
of the ledger row. Clicking downloads a single JSON document in place — no
route change, per the revelation principle. Engine, observer, queries
untouched.

**Document contents:** the verification_events row with full raw capture;
the conclusion (state, confidence, engine_version, all signals); the
chain_observations evidence with full raws, scoped by the same
relevant-evidence bound as Timeline Replay (#025) — verification through
the last signal-referenced observation; the remediation history with an
honest status field (included / unavailable / error — never silently
absent); a reproducibility statement; and an epistemic statement spelling
out fact vs. inference (VERIFIED recorded fact; FLOATING derived from an
offchain accumulator; RECONCILED capped below certainty per #008;
remediation human-action, never engine input).

**Design calls, flagged:**
1. **Exports the DISPLAYED conclusion.** A live view exports
   `view: {mode:"live"}`; a Timeline Replay view exports
   `{mode:"historical_replay", as_of}` with evidence truncated to that
   moment — Layer 4's "reconstruction at that moment" made literal. The
   exported document always says which it is.
2. **Sum-attribution siblings not embedded.** Bit-exact recomputation of a
   `pending_batch_sum_attributed` signal needs the open batch's sibling
   verification_events (other payments' records, potentially hundreds).
   Embedding them would bloat every export; instead the document carries an
   explicit `reproducibility.limitation` naming exactly what else is needed
   and where it lives — present only when that signal is present (verified:
   absent on the live RECONCILED export, present on the replayed FLOATING
   one).
3. **JSON download only; no preview dialog.** §6's "Audit export dialog" is
   Phase 2 design work; the functional core is the document itself.
4. **Button self-fetches remediation** (second small indexed read, only
   while Audit is open) rather than lifting shared state through LedgerRow
   — chose an extra cheap query over coupling two components' data flow.
5. **Builder purity:** `generated_at` is an input, not a clock read —
   identical inputs produce byte-identical documents.

**Verification (real evidence, tracked payment 0x9e40d517…):** live export
= RECONCILED @ 0.75, 2 evidence rows with raws, payment raw present,
5.3 KB, deterministic (byte-identical on repeat); replayed export at the
FLOATING tick = FLOATING @ 0.95, `historical_replay` view, evidence
correctly truncated to as_of, limitation note present. `tsc --noEmit`
clean project-wide.
**Confidence:** HIGH on document content/scoping/determinism (verified on
real data) and type safety. MEDIUM on the browser download interaction
(Blob/anchor mechanics — standard, but not exercised in a browser this
session; same tooling constraint as prior UI tasks).
**Status:** Accepted (calls 1-5 awaiting ratification).

**Ratification addendum (user ruling, recorded in this entry per explicit
instruction):** all five design calls ratified as correct. Phase 1 is
declared complete. The one remaining MEDIUM item — the real browser
download test — is deferred to the batched browser-verification pass the
user will run before Phase 3 (Evidence Assistant), alongside the other
deferred browser checks (#030/#031's insert path among them).

---

### Decision #033 — Phase 3: Evidence Assistant v1 built LLM-independent;
### no LLM API is configured, and the "never determines truth" rule is
### enforced structurally rather than by prompt
**Blocker found and reported before building (per instruction):** no LLM API
is available. `OPENAI_API_KEY` in `.env.local` holds the unfilled
`.env.example` template placeholder (19 chars, no `sk-` prefix, exact length
match to `your-openai-api-key`); no other provider credential exists in the
environment; no local model server; and although `@langchain/openai` and
`deepagents` are installed, **no source file imports them** — there has never
been LLM code in this repo. Network to `api.openai.com` is fine (HTTP 401 to
a deliberately invalid probe), so this is purely a credential gap. No key or
new service was added. **User ruling: build LLM-independent now**, with the
provider behind an interface, inert until a key exists.

**Pipeline, exactly as specified:** scoped retrieval → inferStateV1 → 
explanation layer → answer terminating in cited evidence.

**How "the LLM never determines payment truth" is enforced in CODE (the
central deliverable), in two independent layers:**

*Layer 1 — structural (app/api/ballast/ask/route.ts).* The client sends only
`{verification_event_id, question}`. Evidence is retrieved server-side from
the same two tables with the same ordering and the same sibling-event set the
ledger hook passes — retrieval scoped IDENTICAL to the engine's input, not a
looser parallel query, so the assistant cannot discuss anything the
conclusion was not derived from. The conclusion is recomputed server-side by
`inferStateV1`; because the engine is pure and deterministic (#004) this is
byte-identical to what the row displays — the same inference independently
derived, not a different one. State, confidence, engine version and the
cited signal *objects* are therefore never parsed out of model text; the
explanation layer may only choose which real signals to cite, **by index**.
**Verified adversarially against the running server:** a request injecting
`state:"BREAK"`, `confidence:1.0`, `engine_version:"v99"`, a pre-written
answer and a fabricated signal returned the true engine values
(RECONCILED @ 0.75, v1) with real signal kinds — every injected field
ignored.

*Layer 2 — validation (lib/ballast/assistant-guardrails.ts, pure).* A
candidate answer is rejected outright for: hedging ("probably", "likely",
"it appears", "seems to", "suggests that", …), certainty overclaim,
onchain-settlement claims (no such signal exists per #008), settlement
assertions when the state is not RECONCILED, any confidence figure differing
from the engine's, identifiers or USDC amounts absent from the evidence
corpus, citation of a non-existent signal, and answers citing no evidence at
all. Rejection falls back to the deterministic answer, so a false positive
costs plainer prose, never correctness — deliberately biased toward
strictness.

**The refusal is a real code path, not hoped-for behavior:** questions are
classified before any generation. Cross-payment (Phase 4), predictive,
advice-seeking, and norm-comparison questions ("slower than usual" —
PARKING_LOT's "prediction wearing a disguise") return
"The available evidence does not show that." without a model ever being
called. The model can also self-declare `answerable:false`, which returns the
same sentence.

**Deterministic explanation layer (what actually runs today).** With no
provider configured, answers are composed by code from real engine output —
structurally incapable of hallucinating. Five intents: state, confidence,
changed, evidence, settlement. Confidence is explained by keying off the
SIGNALS present rather than a duplicated table of tier numbers, so it cannot
drift from the engine's scoring; this also keeps the module free of any
runtime engine import (type-only), which is what lets the guardrail suite run
under Node's raw ESM loader.

**Verification:** 25 guardrail tests pass (`npm run test:assistant`) — every
adversarial case above is a fabricated model response that must be refused,
plus over-rejection checks proving compliant answers, correctly-stated
confidence, "not yet settled" negation, and real quoted references all pass.
A real bug was caught by these tests: the norm-comparison gate matched
"usually" but not "usual", letting "Is this slower than usual?" through —
fixed, and `slower`/`faster`/`longer than` added. 14 engine tests still pass
(no regression); `tsc --noEmit` clean. **Live route verified against real
evidence** (deterministic path needs no LLM): 401 unauthorized; real
in-scope answers citing real signals with true engine values; both refusal
paths correct. First invocation returned a transient "Evidence unavailable"
on cold compile, then 3/3 retries succeeded — same cold-start pattern noted
in #031, not a defect.

**Scope and deferrals, stated plainly:**
- Conversations are NOT logged as evidence — Open Question #2 is unresolved,
  so history is ephemeral (per-row, per-session). If that question resolves
  to "yes", this needs a table and a write path; nothing built here blocks it.
- Assistant disabled during Timeline Replay: the route answers about the LIVE
  conclusion, so answering while a historical state is displayed would
  mismatch the screen (same precedent as remediation actions, #030).
- The OpenAI call path is written but **never executed** — no key. It is the
  one part of this task that is unexercised code.
**Confidence:** HIGH on the blocker diagnosis, both enforcement layers, the
refusal paths, retrieval scoping, and the deterministic answers — all
verified by tests and against the running server with real data. MEDIUM on
the rendered UI appearance (not browser-verified — same constraint as prior
UI tasks). LOW/unexercised on the OpenAI provider call itself, which cannot
be tested without a key; when one is added it should be verified before
being relied on.
**Status:** Accepted.

---

### Decision #034 — #033 approved; LLM provider will likely be Gemini, and
### what that swap actually costs
**Approval (user ruling):** the Evidence Assistant's LLM-independent
architecture and the adversarial proof of the structural guarantee are
accepted as correct, and as exceeding what was specified. Milestone
committed and pushed as `841114e`.

**Forward decision, recorded so it isn't a surprise later:** a real LLM key
will likely be **Gemini (free tier)**, not OpenAI, added before the demo and
verified against the real call path at that time. This is not urgent —
everything shipped in #033 is proven independent of any model.

**What the provider swap costs, stated concretely now rather than
discovered later:** `lib/ballast/assistant-provider.ts` currently contains
one concrete implementation, `OpenAIProvider`, chosen only because
`OPENAI_API_KEY` is the credential this project already declared. Moving to
Gemini means:
- **Write one new class** implementing the existing `ExplanationProvider`
  interface (~40 lines: a `fetch` to Gemini's `generateContent`, its
  JSON-output mode, and the same parse into `{answerable, answer,
  citedIndexes}`), plus a key-shape check in `getExplanationProvider()` and
  a `GEMINI_API_KEY` entry in `.env.example`.
- **Change nothing else.** The route, both guardrail layers, the question
  gating, the deterministic fallback, the prompt contract, and the UI are
  all provider-agnostic by construction. The guardrails validate model
  output regardless of which model produced it, so the safety properties
  verified in #033 carry over unchanged — a new provider inherits them
  rather than needing them re-proven.
- **Then verify the call path**, which is the one piece #033 could not
  exercise (recorded there as LOW/unexercised). That verification is
  provider-specific and must actually be run, not assumed.
**Status:** Accepted. Executed by #035.

---

### Decision #035 — GeminiProvider implemented and verified live; model
### chosen empirically; two real defects found by running it
**Decision:** Implemented `GeminiProvider` in
`lib/ballast/assistant-provider.ts` against the existing
`ExplanationProvider` interface, exactly as scoped in #034. The route,
guardrails, question gating, deterministic fallback and UI were not
modified to accommodate it — the interface held, as predicted.

**Model chosen empirically, and this mattered.** Rather than assume an id,
queried this key's own `ListModels` (42 models support `generateContent`)
and then made real `generateContent` calls with the production request
shape. **`gemini-2.5-flash-lite` — the id prior knowledge would most likely
have produced — returns HTTP 404, "no longer available to new users."**
Tested working candidates at Flash-Lite tier (smallest/fastest, appropriate
for a short explanation task): `gemini-3.1-flash-lite` (1001ms) and
`gemini-3.5-flash-lite` (970ms), both schema-compliant with correct
citations. Selected **`gemini-3.5-flash-lite`** — newest GA Flash-Lite,
marginally faster in-sample; overridable via `GEMINI_MODEL`.

**Auth via header, not the documented query parameter.** Google's docs show
`?key=$GEMINI_API_KEY`. Used the `x-goog-api-key` header instead: a secret
in a URL leaks into server logs, proxy logs and error strings. The key is
read only from `process.env.GEMINI_API_KEY`, never logged; provider error
paths log HTTP status only, never response bodies.

**Provider selection — configurable by key presence, with override.**
Order: `BALLAST_LLM_PROVIDER` (gemini|openai|none) → Gemini if its key is
real → OpenAI if its key is real → unavailable. Chosen over hardcoding
Gemini so adding or removing a key is pure configuration with no code edit,
and the OpenAI implementation stays available rather than being deleted.
Gemini-key detection cannot reuse the OpenAI `sk-` shape check, so it tests
length plus the placeholder pattern.

**Live verification against real payment evidence (dev server, real Gemini
in the loop):** `source: "explanation_layer"` confirmed — e.g. "Why is this
payment in this state?" returned a real model answer grounded in real
signals, with the engine's authoritative RECONCILED @ 0.75 (v1) echoed
alongside and real signal kinds cited.

**Adversarial proof with the REAL model, not a simulated fabrication.** Ran
the live model against the real evidence under an inverted system prompt
instructing it to reassure, claim onchain settlement, cite a transaction
hash, assert 0.99 confidence and speculate. Gemini complied. Its genuine
output was fed through the real guardrails, which rejected it with four
violations — `hedging_language:"probably"`,
`certainty_overclaim:"proven"`, `onchain_settlement_claim:"settled
on-chain"`, `confidence_mismatch:claimed_0.99_actual_0.75` — and the route
served the deterministic answer instead. The same run under the production
prompt passed cleanly (`ok=true`, no violations).

**Finding that corrected my own assumption — misattribution, not
fabrication.** The "transaction hash" the adversarial model cited was
**not invented**: it was the real `payment_id` (the EIP-3009 nonce, which
the prompt legitimately supplies), relabelled as a blockchain transaction
hash. `fabricated_identifier` therefore correctly did not fire — the value
IS in the evidence. The class is covered by a different rule: `transaction
hash`/`tx hash` are onchain-claim terms, so calling *any* value a
transaction hash is rejected regardless of whether it is real, which is
correct because no per-payment transaction hash exists in this system at
all. Verified in isolation, and locked in as a regression test (26 guardrail
tests now pass): the same real nonce named correctly as an authorization
nonce passes.

**Two real defects found only by running it live:**
1. **Under-claiming on model refusal.** Gemini returned `answerable:false`
   for "What does this confidence value mean?", and the route served a bare
   "The available evidence does not show that." — while the deterministic
   composer held a genuine, evidence-grounded answer. Refusing when we hold
   a truthful answer is its own misrepresentation. Fixed: a model decline on
   an already-in-scope intent now falls back to the deterministic answer
   (`deterministic_fallback`), not a refusal. Out-of-scope questions still
   refuse before any model call, unchanged.
2. **The model had no basis to explain confidence.** Root cause of (1): the
   prompt gave the figure but not what it means. Fixed by passing
   `confidence_basis` — computed deterministically by code from the signals
   present, not by the model. The confidence question now returns a correct
   `explanation_layer` answer.

**Known limitation, honestly recorded:** for settlement-intent questions the
model's answer is nearly always guardrail-rejected, because any discussion of
onchain settlement — *including a correct denial* — trips the blunt
onchain-claim rule (observed live: `onchain_settlement_claim:"settled
onchain"` on a legitimate, non-adversarial prompt). The outcome is safe and
arguably better, since the deterministic settlement answer is the stronger
one, but in practice the LLM layer never serves this intent. Left as-is:
loosening the rule to parse negation would trade a guaranteed safety
property for prose quality, which is the wrong trade for this product.

**Verification:** 26 guardrail tests pass; `tsc --noEmit` clean; live route
exercised across four question classes (explanation_layer,
deterministic_fallback, guardrail_rejected, refusal) against real evidence.
No key material appears in any tracked file (`.env.local` remains ignored).
**Confidence:** HIGH on the provider implementation, model choice, selection
logic, live call path, and the adversarial guardrail proof — all executed
against the real API with real evidence, not reasoned. MEDIUM on the
rendered UI with a live provider (browser still unverified — same standing
constraint). The OpenAI path remains unexercised (no key), now explicitly
secondary.
**Status:** Accepted.

---

### Decision #036 — Phase 2 design pass applied app-wide; two spec hex
### values corrected by measurement; two inherited violations fixed
**Decision:** Applied BALLAST_DESIGN_SYSTEM.md across every surface, not
only the ledger. Styling only — no logic, query, threshold or engine code
was touched, and the engine (14) and assistant (26) test suites still pass
unchanged.

**Single source of truth replaces four duplicated token tables.** The §3
palette now lives as CSS custom properties in `app/globals.css` (exactly as
§3 specifies), with `lib/ballast/design-tokens.ts` holding only named
`var()` references plus the §4 type scale, §5 spacing, §7 button variants,
the state-badge helper and the evidence-line pattern. `ledger-row`,
`ask-ballast`, `remediation-section` and `audit-export-button` each carried
their own hex/font table; all four now draw from the shared module.

**IBM Plex is now genuinely loaded, closing the gap flagged in #023.**
`app/layout.tsx` previously loaded **Geist** — a generic modern sans, which
is precisely what DESIGN_PHILOSOPHY.md's "not Inter as the sole typeface"
prohibition targets. Replaced with IBM Plex Serif/Sans/Mono via `next/font`
(self-hosted, no runtime request to Google). Verified in the served page:
41 `@font-face` declarations and 5 self-hosted woff2 files, zero Geist
references remaining. #023 had recorded Plex as "referenced by family name,
files not bundled"; that is now resolved rather than still pending.

**Retuning globals.css fixed app-wide violations without touching forked
component code.** The inherited shadcn theme defined `--background: 0 0%
100%` (pure white), `--radius: 0.5rem` (8px, where §14 caps at 2px), a
saturated blue `--primary`, and a bright pink `--destructive`. Retuning the
theme variables onto the paper/ink palette propagates to every inherited
surface — sign-in, payments table, withdrawals, dialogs — with no edits to
those components. `--destructive` was mapped to the SYSTEM error tone, never
`--break`: shadcn's destructive is generic chrome and must not borrow
payment-state authority (§3).

**Two §3 hex values were wrong and are corrected by measurement, not
opinion.** §13 instructs verifying contrast programmatically rather than
trusting the document; doing so found:
- `--ink-tertiary` `#8C8A80` measures **3.18:1** on `--paper` — below the
  4.5:1 §3 itself mandates. It is used for captions and timestamps at 13px,
  which is small text, so the 3:1 large-text allowance does not apply.
  Darkened along the same hue to the first passing value **`#727067`**
  (4.56:1 on paper, 4.80:1 on paper-raised).
- `--system-warning` `#8A6D1F` measures **4.49:1** — short by a hair.
  Nudged to **`#886B1F`** (4.62:1).
All other pairs pass as specified: ink 16.01:1, ink-secondary 7.07:1, BREAK
6.21:1, RECONCILED 4.17:1, FLOATING 3.09:1 (badge = large/UI text, 3:1 bar).
State colors were left untouched — they pass, and altering them would shift
the deliberate asymmetry.
**Correction to my own audit:** I initially flagged the hairline border
(1.20:1) as failing. It is not a violation — WCAG 1.4.11's 3:1 applies to UI
components and meaningful graphics, not decorative/structural dividers, and
raising it would destroy the "visible but quiet" quality §3 explicitly
requires of the sacred alignment. Reported as a mis-specified check, not
fixed.

**Two genuine §16 violations found in inherited primitives, both fixed:**
`components/ui/dialog.tsx` used `bg-black/50` for its overlay (now an ink
scrim), and Tailwind's ring utilities defaulted `--tw-ring-offset-color` to
`#fff`, which the shadcn badge/button/input/dialog focus states use (now
paper). Remaining `#fff`/`#000` strings in the served CSS are Tailwind
internals that nothing paints: the `--color-black` palette variable and an
`@property` initial-value declaration.

**Motion and focus are now app-wide, not ledger-local.** The hover/focus/
unfold rules previously injected by a `LedgerRowStyles` component moved into
`globals.css`: 100ms linear hover wash, instant 2px ink focus ring on every
interactive element (§13), 200ms ease-out opacity unfold, and a
`prefers-reduced-motion` fallback to instant. No bounce, spring, scale or
spin exists anywhere.

**Component named explicitly rather than left silent:** `OperationalState`
was entirely unstyled — raw browser defaults, default-blue links, its own
comment reading "Plain by design (Phase 2 does the styling pass)". It is now
built to §7/§11: `--paper` background (it is not a card and does not float —
it IS the top of the content), `--text-data-lg` headline, a 4px `--break`
left border in the attention state only, and no accent at all when calm,
that absence being part of the signal. Its flagged-payment list now reuses
the evidence-line pattern instead of default list styling.
**Confidence:** HIGH on the token architecture, font loading, contrast
measurements and the violations found/fixed — all verified against the
served CSS/HTML and by measurement, not assumed. MEDIUM on the aggregate
visual result, which has not been seen in a browser (same standing
constraint); the §16 checklist item requiring a human judgement of
distinctiveness is explicitly not self-assessable and is left for review.
**Status:** Accepted.

---

### Decision #037 — #036 ratified in full
**Ratification (user ruling):** the Phase 2 design pass is accepted in full.
Specifically called out as the two most important findings: the inherited
shadcn theme being unstyled against the design system (pure-white
background, 8px radius, saturated blue primary — fixed app-wide by retuning
`globals.css` rather than editing forked components), and both contrast
corrections (`--ink-tertiary` 3.18:1 → `#727067`, `--system-warning`
4.49:1 → `#886B1F`). Also explicitly endorsed: reversing my own false
positive on the hairline border rather than "fixing" something WCAG 1.4.11
does not require of a decorative divider — the correct call was to report
the mis-specified check, not to damage the "visible but quiet" quality §3
requires.

**Numbering note (flagged, not silently reconciled):** the user referred to
this entry as "#038". The on-disk log's next sequential number is #037,
which is what is used here — there is no #037 gap to fill and no #036
duplicate created. Consistent with #022's handling: numbering divergences
between chat and this file are recorded as observed rather than
retro-fitted, since this log is append-only and its sequence is the
authoritative one.

No code accompanies this entry — the milestone it ratifies is commit
`2b01c10`, already pushed.
**Status:** Accepted.

---

### Decision #038 — Visual identity rebuild, STAGE 1 of 5: token system
### rebuilt on a dark canvas; the old palette provably broke the locked
### asymmetry, not merely the contrast floor
**Scope:** `BALLAST_VISUAL_IDENTITY_REBUILD.md` (persisted to the repo from
the brief) authorizes a full visual reinvention and supersedes the prior
"calm/quiet, never ambitious" aesthetic tone where they conflict. Engine,
evidence model, guardrails and the asymmetric state rule are unchanged.
Stage 1 is the token system only; Stages 2-5 (wordmark, landing page,
assistant indicator, Arc/Circle attribution) are deliberately not started —
the brief's §8 requires staged reporting.

**The finding that justified the rebuild, measured before any change.**
Rather than assume the light palette needed replacing, its existing hexes
were measured against the proposed dark canvas. They did not merely dip
below the contrast floor — **they inverted the product's single most
important locked rule.** On `#121210`: BREAK `#A3352B` = 2.77:1 while
FLOATING `#A8874A` = 5.56:1. Carried over unchanged, BREAK — which must own
the strongest signal — would have rendered **quieter than FLOATING**, with
RECONCILED (4.60:1) also louder than BREAK. Reusing the old values on a
dark base would have silently destroyed the asymmetry the philosophy calls
non-negotiable.

**Every new value is derived, not chosen by eye.** Each state colour keeps
its hue identity; lightness was solved numerically for a contrast target
against `--surface-raised` (the *lightest* surface, i.e. the worst case on a
dark canvas), so every darker surface passes automatically. Verified on all
three surfaces:

| token | hex | canvas | surface | raised |
|---|---|---|---|---|
| BREAK | `#EE7765` | 6.66 | 6.20 | 5.60 |
| FLOATING | `#AF8947` | 5.80 | 5.39 | 4.87 |
| RECONCILED | `#799176` | 5.47 | 5.09 | 4.60 |
| text-primary | `#F2F0E9` | 16.45 | 15.30 | 13.82 |
| text-secondary | `#B5B1A5` | 8.75 | 8.14 | 7.35 |
| text-tertiary | `#918C7C` | 5.58 | 5.19 | 4.69 |
| accent (bone) | `#E6DFD0` | 14.14 | 13.15 | 11.88 |

**Every token clears 4.5:1 on every surface** — the small-text bar, applied
even to badges, since a 14px semibold badge does not qualify for WCAG's
large-text 3:1 allowance.

**Asymmetry is now carried by two independent channels, not one.** Contrast
alone compressed the three states into a narrow band. Saturation was made
to carry it as well: BREAK 80%, FLOATING 42%, RECONCILED 11%. RECONCILED is
therefore near-achromatic — "success should nearly disappear" is expressed
structurally, not just by dimming. Ordering holds on both channels
simultaneously, at worst case: 5.60 > 4.87 > 4.60 and 80% > 42% > 11%.

**Accent chosen by what it communicates, per the brief's instruction.** A
single bone accent `#E6DFD0`, carried by **luminance rather than a new
hue**. Reasoning: on a dark canvas light is the scarce resource, so
spending it is what "this matters" means; and keeping the accent
achromatic-warm leaves **hue reserved exclusively for payment state**,
preserving the locked "colour never appears outside state communication"
principle that a chromatic brand accent would have violated. Used only for
focus rings, primary-button fill, and (Stage 2) the wordmark's equilibrium
line.

**System tones deliberately desaturated (32-36%) against BREAK's 80%**, so
a form error can never be mistaken for a payment BREAK — the same
anti-dilution rule as the light palette, re-derived for the dark one.

**A real bug caught by verifying the served CSS rather than trusting the
source.** The Ballast accent was first named `--accent`, which collides
with the shadcn theme block's own `--accent` HSL triple defined later in
the same file. The collision **silently clobbered the bone accent** — it
appeared zero times in the served stylesheet, which would have broken every
focus ring and primary button. Renamed `--accent-bone`. This is the same
collision class already avoided for `--border` (named `--border-hairline`);
I applied that reasoning to one token and missed it on the other. Found
only because the served CSS was inspected, not assumed.

**Motion re-expressed for "physics, not objects."** The unfold now eases on
a decelerating curve with a 2px settle (240ms) so evidence *settles into
place* rather than snapping — believable inertia, per the brief's governing
idea. A `.blst-break` class explicitly disables all animation and
transition, because BREAK must remain abrupt. `prefers-reduced-motion`
still collapses everything to instant.

**Naming migrated to roles, with compatibility.** `paper`/`ink` would be
actively misleading on a dark canvas, so the token module now exposes
`canvas`/`surface`/`surfaceRaised`/`textPrimary`/`textSecondary`/
`textTertiary`/`line`/`accent`, with the old names retained as
`@deprecated` aliases mapping to the same roles so existing markup keeps
working and can be migrated incrementally.

**Font hosting was broken and is now genuinely fixed — this corrects a
claim made in #036.** #036 reported IBM Plex as "genuinely loaded, closing
the #023 gap," verified by 41 `@font-face` rules in the served CSS. That
observation was real but the conclusion was wrong: `next/font/google`
downloads the binaries from **fonts.gstatic.com at build time**, and that
host is unreachable from this environment. The build had only succeeded
because the binaries were already cached in `.next` from an earlier moment
when the network allowed it — it was never reproducible, and any fresh
clone or CI build would have failed. This surfaced when clearing `.next`
during Stage 1 verification: the app immediately returned **HTTP 500** with
`Error while requesting https://fonts.gstatic.com/...`. Measured precisely:
`fonts.googleapis.com` responds 200, `fonts.gstatic.com` times out, other
hosts are fine — so it is that one host, not general connectivity.
**Fix:** replaced `next/font/google` with `@fontsource/ibm-plex-{serif,sans,
mono}`, which ship the woff2 binaries inside `node_modules`. The build now
depends only on the package registry, and the font-family CSS variables are
declared in `globals.css` with system fallbacks. Verified by a clean
rebuild from an emptied `.next`: page returns 200, 38 `@font-face`
declarations served, zero gstatic requests. The #023/#036 "Plex is bundled"
claim is only now actually true.

**Verification:** clean rebuild from an emptied `.next` returns HTTP 200
with the focus ring correctly resolving to `--accent-bone`; `tsc --noEmit`
clean; engine (14) and assistant (26) tests unchanged, confirming this is
genuinely presentation-only. All 12 identity tokens confirmed present in
the served CSS after the rename.
**Confidence:** HIGH on the derivation, the measurements, the asymmetry
inversion finding, and the accent-collision fix — all verified numerically
or against the served stylesheet. MEDIUM on the aggregate visual result,
which has not been seen in a browser (standing sandbox constraint) — a dark
canvas is a large perceptual change and warrants a human look before
Stage 2 builds on top of it.
**Status:** Accepted. Stages 2-5 not started, pending review of Stage 1.

---

### Decision #039 — Visual identity rebuild, STAGE 2 of 5: the mark
**Built:** `components/brand/ballast-mark.tsx` exporting `BallastMark` (the
mark alone) and `BallastWordmark` (mark + "Ballast" in the serif voice),
plus `app/icon.svg` as the favicon, with the wordmark placed in the
dashboard nav linking to `/dashboard/observe`.

**Geometry, per §2:** a circle, mostly open, weighted low — the lower
portion solid, the upper an outline only, crossed by a single hairline
equilibrium line where fill meets openness. It depicts a physical property
(mass sitting low is what makes a body stable) rather than an object. No
ballast weight, anchor, ship or water appears at any size.

**Three implementation decisions worth recording:**
1. **The filled segment is produced by clipping a full circle, not by an
   arc path.** Arc sweep/large-arc flags are easy to get subtly wrong and
   essentially impossible to verify without a browser — which this
   environment does not have. A clipped rectangle is geometrically
   unambiguous and renders identically everywhere. Chosen for verifiability
   under a known constraint, not for elegance.
2. **`vectorEffect="non-scaling-stroke"`** on the outline and equilibrium
   line, so both render as a true 1px hairline at any size. This is what
   makes the brief's "the mark and the interface share literal visual DNA"
   true in fact rather than by intention: it is the same 1px the dividers
   use, not a stroke that merely looks similar at one size.
3. **A single shared `clipPath` id is safe here** because the viewBox is
   fixed at 24x24 and never varies with `size` — every instance defines
   identical clip geometry, so duplicate ids resolve to the same correct
   shape. This avoids needing `useId()`, which would have forced the mark
   to become a client component for no behavioural reason.

**Favicon deliberately diverges from the component:** `app/icon.svg` uses a
1.5-unit stroke rather than a true hairline, because a 1px hairline
disappears at 16px. §2 explicitly permits simplification for small sizes.
Colours are explicit (bone on canvas) since a standalone favicon has no
inherited `currentColor`.

**Clearspace is enforced by the component**, not left to callers: the
mark-to-word gap is 0.5x and the surrounding padding 0.5x/1x of the mark
size, so the discipline holds at any scale — the same posture §6 requires
of Circle's marks.

**Verification:** `tsc --noEmit` clean; page returns 200 with the mark's
clip id, the wordmark text and the nav link's aria-label all present in the
served HTML; `/icon.svg` serves 200.
**Confidence:** HIGH that the mark renders, is correctly wired, and matches
the specified geometry — verified in served output. MEDIUM on whether it
*looks* right, especially at 16-32px favicon size, which is exactly where
this kind of mark most often fails; that needs a human eye.
**Status:** Accepted. Stages 3-5 not started.
