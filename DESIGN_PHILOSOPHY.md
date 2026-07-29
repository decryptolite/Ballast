# Ballast — Design Philosophy

Permanent design constitution. Documentation only — nothing here is a new
decision; everything below was agreed across prior discussion. If you find
something unresolved, it's marked **Open Question**, not decided. Read this
before any presentation/UI task, the same way CLAUDE.md and DECISIONS.md are
read before any engineering task.

---

## What Ballast is

Ballast is an evidence instrument, not a dashboard. Central idea: **Ballast
is the first financial instrument that tells you what it does not know.**
It observes, records, and reasons from evidence. It clearly separates fact
from inference and never claims certainty it cannot support.

Priority order, always: Evidence > assumptions. Observation > speculation.
Confidence > false certainty. Transparency > convenience.

---

## The four layers

Every design decision serves one of these. If it serves none, reject it.

- **Layer 1 — Awareness.** "Is something wrong?" Pre-attentive, no reading
  required. Comes from operational state, visual rhythm, and controlled
  disruption — never from reading text.
- **Layer 2 — Priority.** "What needs attention first?" State, amount,
  confidence.
- **Layer 3 — Understanding.** "Why does Ballast believe this?" Evidence,
  signals — available immediately, visually subordinate.
- **Layer 4 — Audit.** "Can this survive scrutiny months later?" Full
  reconstruction: observations, timestamps, engine version, confidence at
  that moment.

Interaction across the layers is **expansion-in-place, not navigation.**
A row has four depths (collapsed / priority / understanding / audit); moving
through them is "revelation," not routing — the operator never leaves
context.

**Trust is measured by depth preference over time.** A new operator's rows
default open at Understanding. An experienced operator's default collapsed
at Priority, expanding only anomalies. The interface becomes quieter as
trust is earned — not by hiding information, but because the operator stops
needing to verify it. Nothing is ever hidden; the need to check simply
decreases.

**Open Question:** should this depth preference be remembered/adapted
automatically by the system over time, or should it always be a manual,
explicit operator action? Not resolved — flagged as a live open question in
prior discussion, not settled either way.

---

## The ledger and the operational state are two different surfaces

**The ledger is chronological and sacred.** Rows never reorder to create
drama or draw attention. Evidence exists independently of attention;
attention adapts to evidence, not the reverse. A BREAK introduces disruption
*inside* its row (position/weight, not reordering) — never a position
change in the list.

**The Current Operational State is a separate, always-live surface** —
not a "summary." A summary describes what happened; an operational state
claims to be true *right now*. It must be independently and directly
queried from evidence — never derived from whatever the ledger happens to
have rendered — so it can never be wrong by being coupled to another
surface's staleness. Its language changes only in content, never in
behavior: calm and factual when nothing needs attention ("all observations
reconciled" / "17 payments currently floating"), direct when something does
("1 unresolved item requires attention"). It never changes its own
demeanor — only what it reports.

**Every awareness signal must terminate in evidence.** No alert, badge,
operational-state message, or confidence score may be a dead end. Clicking
one must lead directly to the evidence that produced it.

---

## Awareness mechanism: position first, color second

Color habituates — a static red badge stops registering after hours of use.
Positional/rhythmic disruption does not, because it's relational (a pattern
violation), not a fixed stimulus. Therefore:

- **Positional disruption is primary.** Requires strict uniformity in
  normal rows so that disruption is legible at all.
- **Color is secondary reinforcement**, applied asymmetrically, layered
  across two surfaces at different scales (cockpit-instrument model): the
  operational state owns prominence ("something requires attention"); the
  row owns specificity ("this is the thing"). Same fact, different scale —
  not redundant repetition at equal weight.

---

## Color principle

Color is information, never decoration. Every color must answer: what does
this communicate. Asymmetric, not a traffic light:

- **BREAK** — strongest visual attention. Rare, abnormal, deserves urgency.
- **FLOATING** — visible but calm. Normal, expected, unresolved uncertainty.
- **RECONCILED** — nearly silent. Success is expected, not celebrated —
  quiet acknowledgment, not a green checkmark celebration.

No traffic-light equal-weighting. No gradients. No neon. No trend-driven
palettes.

---

## Typography

Typography does most of the visual work — it is structure, not decoration.

- Numbers, timestamps, hashes, references: monospace, precise, tabular
  figures, right-aligned where numeric.
- Narrative/evidence text: calm, measured, editorial register (closer to a
  financial document or technical manual than a SaaS app).
- The page should still feel beautiful if every color were removed.

---

## Material and visual language

Feel: paper, ink, stone, metal. Glass only when it carries actual meaning.
Nothing synthetic, glossy, or "digital candy." No gradients, no excessive
rounded corners, no meaningless animation, no colorful SaaS card patterns.

Emotional benchmark (not visual template): the feeling of Aurai — cinematic,
intentional, handcrafted — reinterpreted, not copied. Philosophical
references: Bloomberg Terminal (credibility through blunt utility, not
approachability), The Economist (precision of voice over decoration), Leica
/ Dieter Rams (restraint, permanence, nothing accidental).

**Timelessness test:** would this still feel correct in 2035? If a decision
depends on a current trend, remove it.

---

## Motion

Motion exists because information changed — never because movement looks
good. If nothing changed, nothing moves. Nothing bounces, spins, or
celebrates. Numbers "breathe," evidence "unfolds," rows "settle" — gravity
as the inspiration, not delight-driven micro-interaction. A BREAK state's
appearance should feel abrupt/structural, not softly animated in.

---

## Landing page vs. dashboard: two different jobs

These solve different problems and must not be designed as one continuous
surface with one goal:

- **Landing page** — permission to create *emotional* trust ("someone
  cared deeply"). Chapter One: discovery of a hidden truth.
- **Dashboard** — responsible for *operational* trust only ("someone
  thought deeply"). Its job is to disappear with use, not to impress. If
  the dashboard ever tries to impress, that's a failure of its actual job.

Craft is allowed to be visible and striking in the landing page and in
Layer 4's audit/export view (rare, deliberate, earned moments) — not in the
ambient, everyday row-by-row surface, which must stay quiet.

---

## The Evidence Agent ("Ask Ballast")

Governed by the same philosophy as the inference engine. It is part of the
instrument, not customer support — closer to a financial analyst than a
chatbot.

**Hard architectural rule:** the LLM must never determine payment truth.
Pipeline is fixed: Evidence Retriever → existing inference engine →
verified state + confidence + evidence → LLM explanation layer only. The
LLM explains; it never decides, never upgrades confidence, never invents
missing evidence, never speculates on unobserved causes.

If evidence doesn't exist, the correct answer is explicit: "The available
evidence does not show that." Never "probably," "most likely," "it
appears." This is the same discipline as the engine's
`insufficient_observation_coverage` state, applied to natural language.

Retrieval scope must be **identical to**, not merely related to, the actual
inference engine's evidence input for that payment — never broader, so the
AI's explanation can never diverge from what the engine actually used to
reach its conclusion.

Tone: calm, measured, specific — never "Great question!" or similar
chatbot enthusiasm. Test: would this exact sentence be said in the same
voice regardless of whether the outcome was good or bad? If not, rewrite.

Lives contextually beside evidence (inside an expanded row), not as a
floating corner widget. Already knows the payment/evidence in context —
the operator never pastes IDs.

**Open Question:** should every Ask Ballast conversation be logged as
evidence itself (append-only, tied to payment + engine version at that
moment), consistent with Layer 4's audit promise? Reasoned as very likely
yes in prior discussion, but not explicitly confirmed/locked — flagged as
open, not decided.

---

## Hard prohibitions (visual)

No gradients. No glassmorphism. No purple/violet as a primary. No floating
browser mockups. No icon feature-cards. No rounded pill badges unless
genuinely understated. No emoji. No "Powered by AI" badges. No Inter as the
sole typeface. No traffic-light equal-weight color. No celebratory
animation on success states.

**Test for any element:** if it could be dropped into any other AI-startup
or fintech-dashboard site without changing its meaning, remove it.

---

## Design integrity check (apply to every future visual decision)

Does it strengthen Awareness, Priority, Understanding, or Audit? If it
serves none of the four, reject it, regardless of how it looks.
