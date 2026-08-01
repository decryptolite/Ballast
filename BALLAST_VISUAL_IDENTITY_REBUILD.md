> Persisted to the repo from the brief supplied in chat. Authorizes a full
> visual reinvention; supersedes the prior "calm/quiet/instrument-only,
> never ambitious" tone where they conflict. Engine, evidence model and the
> asymmetric state-color rule are unchanged. Implementation status is
> tracked in DECISIONS.md (#038 onward).

# Ballast — Visual Identity Rebuild Brief

**Status: this document authorizes a full visual reinvention. It supersedes
the "calm/quiet/instrument-only, never ambitious" tone of prior design
guidance where it conflicts. Nothing about the engine, evidence model, or
product principles changes. Everything visual is open to reimagination,
provided it stays faithful to what Ballast actually is.**

---

## What must never change (non-negotiable, unaffected by this rebuild)

- Evidence integrity: no fake data, no decorative fabrication of numbers.
- Every animation represents a real state transition — never delight for
  its own sake.
- The engine (inferStateV1), evidence tables, and guardrails are
  untouched by this document. This is presentation only.
- BREAK still owns the strongest signal. FLOATING and RECONCILED remain
  asymmetric, not equal-weight.

Everything else — palette, motion language, logo, landing page, dashboard
composition, the AI assistant's presentation — is being rebuilt from first
principles below.

---

## 1. The governing idea

**Design around physics, not objects.** Ballast means stability, weight,
balance, grounding, calm under pressure, quiet confidence, permanence,
trust earned through physics rather than appearance.

**Do not depict a ballast weight, an anchor, a ship, water, or any
maritime object.** The word should shape how the product feels, never
what it visually shows. No literal nautical imagery anywhere, at any
scale, in any component.

**What this looks like in practice:**
- Motion has believable inertia — nothing arrives instantly or leaves
  abruptly without a sense of mass behind it (except BREAK, which is
  deliberately abrupt — see below).
- Panels feel anchored, never floating in the "UI card casting a shadow"
  sense.
- Expansion feels like revealing depth, not opening a new page.
- State transitions feel earned — something settles into place because
  evidence accumulated, not because a designer wanted movement.
- Nothing jitters, bounces, springs, or feels unstable. Ever.

---

## 2. The wordmark and mark

A concept has been built and approved: a circle, mostly open, weighted low
— the lower portion solid-filled, the upper portion a thin outline only —
crossed by a single hairline "equilibrium line" at the point where fill
meets openness. The hairline reuses the exact stroke weight already used
for dividers throughout the product — the mark and the interface share
literal visual DNA.

**Why this works, and why Claude Code should not deviate from the
principle even if the exact geometry is refined:** it depicts a physical
property (mass sitting low = stability) rather than an object. It requires
no caption to be understood as "grounded" and "precise." Someone should
recognize it because of its simplicity and confidence, not because they
understand a metaphor.

**Build:**
- A proper SVG logo component (components/brand/ballast-mark.tsx or
  similar), parametrized so it can render at multiple sizes (favicon,
  nav mark, landing hero) without losing legibility at small sizes.
- Wordmark pairing: mark + "Ballast" set in the serif voice typeface,
  generous clearspace around both (do not crowd the mark against other
  UI elements — treat it with the same clearspace discipline Circle's own
  brand kit requires for their marks, see Section 6).
- Favicon: the mark alone, simplified if needed for legibility at 16-32px.

---

## 3. Color system — reasoned from principle, not from materials

Do not choose colors because they resemble any material (metal, water,
paper specifically-as-metaphor, etc.). Choose colors because they
reinforce: permanence, authority, confidence, clarity, precision,
restraint.

**Direction:** a deep, quiet, high-contrast base (this is where genuine
ambition and drama are earned — a dark, confident canvas is not
off-limits, it simply must be chosen for what it communicates:
seriousness and permanence, not "dark mode because it looks cool") paired
with a single, restrained accent used sparingly enough that its
appearance always means something. If a warm, low-saturation accent
happens to reinforce authority and precision, use it — but justify it by
what it communicates, not by what it resembles.

**State colors remain asymmetric** — BREAK strongest, FLOATING a whisper,
RECONCILED nearly silent — this rule is inherited unchanged from the
locked philosophy and must survive the rebuild regardless of what the new
base palette looks like.

**Concrete decision for Claude Code to implement (reasoned fill, not
left open):** rebuild the token file with a deep near-black/graphite base
(not pure black), a warm neutral or single restrained accent hue chosen
for authority rather than trend, and state colors re-tuned against the
new base so BREAK/FLOATING/RECONCILED still pass WCAG contrast on the
new, darker canvas (verify programmatically, per the standing contrast
discipline — do not assume the old light-mode hex values work on a dark
base without re-measuring).

---

## 4. The landing page — the real opportunity

**Do not build another fintech landing page. Do not build another SaaS
hero. Do not put a dashboard screenshot over a gradient.**

The emotional arc to build toward: certainty emerging from uncertainty.
Evidence becoming understanding. Noise becoming order. Observation
becoming confidence. That transformation is Ballast's real story — not
ships, not water, not generic finance imagery.

**Concrete hero concept, consistent with "physics not objects":**
scattered, unresolved points — representing floating, unverified state —
gradually settling, under something that behaves like gravity, into an
ordered, resting arrangement. This is the same mechanism already proven
in the product (VERIFIED to FLOATING to RECONCILED) expressed as pure
motion and light, with zero literal imagery. No droplets, no water
surface, no ship. Points of light finding rest. That is the whole idea,
and it should use real language even in the hero if possible (e.g. cycle
through real evidence-signal terms already used in the product) rather
than invented marketing copy — evidence before decoration applies to the
landing page too.

**Section-by-section ambition:** each section should answer one question
before introducing the next, and transitions between sections should feel
continuous — like scenes in a film, not independent blocks. Do not treat
this as "hero, then features, then footer." Treat it as a small number of
inevitable-feeling movements, each one a natural consequence of the one
before it.

**Do not use Stripe, Neon, Linear, or any specific product as a visual
template to imitate.** Study them only to identify what to deliberately
avoid. The target is not "better X." The target is a screenshot, logo
included, that someone recognizes as unmistakably Ballast's own, with no
other product's fingerprints visible in it.

---

## 5. The AI Assistant — reconciling the reference image correctly

A reference image was provided showing a mobile AI-assistant app: gradient
icon tiles, a floating chat bubble avatar, casual startup polish. The
visual skin of that reference directly contradicts a locked principle
(the assistant is part of the instrument, never a customer-support-style
chatbot, never a floating corner widget with an avatar).

**What to keep from the reference: the feeling of persistent, ambient
presence** — available everywhere, moving with the user through the
product, feeling alive rather than buried in a menu.

**What to discard: gradient tiles, bubble avatars, floating-orb
chat-widget visual language, any "AI assistant" iconography.**

**The correct synthesis:** a small, fixed, grounded indicator — using the
same weighted-circle visual language as the wordmark itself — present in
a consistent position as the user moves through the product. It does not
float in the sense of drifting or bouncing; it is anchored, the way
weight is anchored. It does not chase the cursor, does not animate in
with delight-driven motion, does not perform enthusiasm. It is simply,
calmly, always there — the same principle as "the interface becomes
quieter as confidence increases" applied to the assistant's own presence:
confident, not eager.

Reuse the existing evidence-scoped, guardrail-verified backend (already
built and adversarially proven) — this task is presentation only, wrapping
the existing Ask Ballast pipeline in a persistent, grounded UI surface
instead of only living inside a row's expanded depth.

---

## 6. Arc and Circle attribution — sourced correctly, not fabricated

Do not invent or approximate Arc's or Circle's logos. Both maintain
official, legally protected brand assets:

- Circle's official Pressroom and Brand Kit: circle.com/pressroom —
  confirmed to include approved logo variations for light and dark
  backgrounds, and an explicit rule: "do not alter, stretch, or modify
  the assets."
- Circle's own brand kit specifies clearspace = 2x on all sides of the
  logo, 1x between the icon and wordmark (where x = one gap + one ring)
  — apply the same clearspace discipline to however Ballast displays
  these marks.
- Arc's marks fall under Circle's family of brands per the same policy
  (Circle's Brand Use Policy explicitly covers "the Icon and Arc Logo,
  collectively, the Arc Marks").

**Action for Claude Code:**
1. Download the official logo files directly from circle.com/pressroom
   (do not recreate them from a description).
2. Place a simple, honest attribution — e.g. "Built on Arc" / "Powered by
   Circle Nanopayments" — in the footer and/or an About/Technology
   section, using the official assets, respecting the stated clearspace
   rule.
3. Link the marks to circle.com and docs.arc.io respectively (real,
   working links, not placeholder hrefs).
4. Do not imply endorsement or affiliation beyond factual attribution —
   per Circle's own policy language, usage must not "suggest an
   affiliation without our okay." A plain "built on X" / "powered by Y"
   factual credit is standard and appropriate; do not design it to look
   like a partnership or co-branding.

---

## 7. What Claude Code should NOT do

- Do not touch inferStateV1, chain-observer.mts, evidence tables, or any
  guardrail logic. This is a presentation-layer rebuild only.
- Do not reintroduce any maritime/nautical imagery anywhere, including in
  "just a small decorative touch" form.
- Do not adopt a generic AI-chatbot visual language for the assistant,
  even in a toned-down form.
- Do not copy Neon's, Stripe's, or Linear's specific visual patterns
  wholesale — study, then deliberately diverge.
- Do not fabricate Arc or Circle brand assets — source them officially.

---

## 8. Sequencing

This is a large task. Recommend Claude Code sequence it as: (1) token
system rebuild — new palette, contrast-verified, applied globally; (2)
wordmark/logo component built and placed in nav + favicon; (3) landing
page rebuilt around the "noise becoming order" hero concept; (4) AI
assistant's persistent grounded-indicator presentation, wrapping the
existing proven backend; (5) Arc/Circle attribution sourced and placed
correctly. Report progress in stages rather than attempting all five in
one uninterrupted pass — this is the largest single design task in the
project and deserves the same "verify against reality before proceeding"
discipline as every engineering milestone so far.
