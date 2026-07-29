# Ballast — Parking Lot

Ideas that are genuinely valuable but do not belong in the current build.
Each entry states why it was deferred, not just that it was. Nothing here
is rejected as wrong — it's sequenced for later, or blocked on a real
prerequisite. Do not rebuild these from scratch without checking here first.

Classification key: ⏳ After Hackathon | 🚫 Parked (infra/prediction/research)

---

### 🚫 Evidence Graph
Visual relationship graph between payments, wallets, balances, observations.
**Why parked:** Technically easy, but node-graph visualizations are
notoriously imprecise to read and easy to make look impressive without
adding real comprehension. No described operator workflow requires it over
a filtered table. Bloomberg-style terminals deliberately avoid this pattern
for the same reason. Revisit only if a specific, real, unanswerable
question emerges that a table genuinely cannot resolve.

---

### 🚫 Counterfactual Confidence ("what evidence would raise confidence to X")
**Why parked — architecturally, not just sequentially.** This requires the
engine to reason about evidence that doesn't yet exist — simulating
hypothetical future observations. `inferStateV1` is a pure function over
recorded fact (Decision #004). Building this would change what kind of
system Ballast is, from observational/deterministic to
predictive/simulative. Do not build without a deliberate, explicit decision
to change the engine's fundamental nature — this is not a feature add, it's
a philosophy change.

---

### 🚫 Alert Intelligence ("this is outside normal patterns")
### 🚫 Operational Memory ("this type of payment usually reconciles in 12 min")
**Why parked together — same root problem.** Both use historical pattern
data to characterize the present, which is prediction wearing a disguise —
the same failure mode already forbidden elsewhere (no forecasting settled
values). **Narrower, honest version that IS acceptable later:** show a
labeled historical fact with zero implied judgment — "this endpoint's
payments have historically taken 8-15 min, based on N prior observations"
— and let the operator draw their own conclusion. Never phrase anything as
"abnormal," "too long," or "outside pattern" relative to the current case.

---

### 🚫 Multiple UI Modes (Teaching Mode / Expert Mode / Instrument Mode)
**Why parked.** The four-depth row-expansion model (collapsed → priority →
understanding → audit) already solves this as one continuum instead of
three named configurations to keep in sync. Building named modes would be
net-new complexity solving an already-solved problem. Do not build.

---

### ⏳ Natural Language Investigation ("show payments over $500 still floating")
**Why deferred, not rejected.** Real value, but a query compiler over
natural language is easy to underestimate — compound queries ("from vendor
X excluding refunds, last Friday") become "SQL in English" fast. Build
after the Evidence Assistant exists and only on top of its retrieval layer,
never as a separate system. Every result must show the literal query it
ran, not just results — a wrong silent interpretation is worse than no
feature.

---

### ⏳ Team Collaboration (comments, assignments, mentions, handoffs, presence)
**Why deferred.** High engineering complexity ("building Slack"), and
ranks below anything touching evidence integrity directly. **Hard
prerequisite before building, even later:** human annotations must be
architecturally typed as a distinct evidence category from system
observations, and must NEVER be read as input by the inference engine. A
well-meaning human note ("vendor is probably just slow") must never
contaminate a deterministic, replayable conclusion. Do not build the
feature before this type-separation is decided.

---

### ⏳ Evidence Lifecycle / Retention Policy
**Why deferred.** Not urgent while the evidence log is small, but the
append-only-forever design means this needs a deliberate decision before
the tables grow large — not something to discover accidentally. Decide:
does evidence ever archive, and if so, how is replayability (Decision #004)
preserved through archival.

---

### ⏳ Historical Diff (compare two points in time)
**Why deferred, not rejected — low complexity.** Not a separate system;
it's Timeline Replay's `asOf` capability applied twice and subtracted.
Build alongside or immediately after Timeline Replay, not as standalone
architecture.

---

### 🚫 → Reclassify as required: BREAK Remediation Workflow
**Not actually optional — flagged here so it isn't lost, but this should be
promoted into the active roadmap, not left parked.** Detection without a
defined next step (ownership, escalation, resolution record) is the single
gap a regulator would ask about first. Revisit this classification before
finalizing Phase 1/Sprint scope.
