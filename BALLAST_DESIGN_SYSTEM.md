# BALLAST_DESIGN_SYSTEM.md

**Status:** Documentation only. Translates `DESIGN_PHILOSOPHY.md` and
`BALLAST_MASTER_SPEC.md` into concrete, buildable specification. Nothing
here contradicts locked philosophy. Where a concrete value fills a genuine
gap (a hex code, a font name, a spacing number) rather than restating an
existing decision, it is marked **MEDIUM** and reasoned — per explicit
authorization to make defensible engineering/design decisions without
back-and-forth, provided nothing breaks existing philosophy or the app.

---

## 1. Visual Philosophy

**Confidence: HIGH (restates locked philosophy) + MEDIUM (competitor contrast, newly articulated)**

Ballast is an instrument, not a dashboard. Compared to reference points:

- **Stripe** — Stripe designs for delight and momentum (gradients, motion,
  onboarding joy). Ballast designs for calm and evidence. Where Stripe wants
  you to feel good about moving fast, Ballast wants you to feel certain
  about what actually happened.
- **Linear** — Linear's density and keyboard-first precision are close in
  spirit, but Linear is optimized for velocity (shipping issues fast).
  Ballast is optimized for verification (proving a conclusion later).
  Linear's UI can change; Ballast's ledger never reorders.
- **Bloomberg Terminal** — the philosophical benchmark for *earned*
  credibility through blunt utility. Ballast borrows the "never decorates,
  never apologizes" posture, but rejects Bloomberg's visual density-as-
  virtue. Ballast earns trust through restraint and whitespace, not through
  cramming maximum data per pixel.
- **Apple** — Apple's restraint and typographic confidence are close
  references for craft. But Apple designs to be *loved*; Ballast designs to
  be *believed*. Apple can use delight as a tool; Ballast cannot, because
  delight implies performance, and performance is the opposite of evidence.
- **Notion** — Notion's flexible, friendly canvas is the wrong model
  entirely: Ballast's ledger is fixed and chronological by design, never a
  malleable canvas.
- **Vercel** — Vercel's dark, technical minimalism is aesthetically
  adjacent but built for developers admiring infrastructure. Ballast is
  built for operators who must defend a conclusion to someone else. Vercel
  can be moody and dark; Ballast favors paper-toned light, because a ledger
  read for eight hours a day should not strain like a developer console.

**Emotional feeling:** calm, exact, slightly formal — like reading a
well-produced financial statement, not a SaaS product.
**Cognitive feeling:** low effort at a glance, effort available on demand.
Nothing is hidden; verification is simply optional once trust is earned.
**Visual rhythm:** strict uniformity in the ledger, so that any disruption
(a BREAK) is immediately legible as a break in pattern, not a color choice.
**Interaction philosophy:** revelation, not navigation. The interface
never routes the operator away from context; it unfolds in place.

---

## 2. Visual Language

**Confidence: MEDIUM — concrete numeric decisions filling gaps in the locked philosophy.**

- **Typography carries hierarchy before size or color does.** A heavier
  weight or a shift from sans to serif communicates importance before any
  size change is needed.
- **Whitespace is structural, not decorative.** Vertical rhythm between
  ledger rows must be generous enough that a BREAK row's disruption reads
  immediately (see Section 10). Minimum row-to-row gap: 1 full spacing unit
  at scale 24px (see Section 5).
- **Grid:** 8px baseline grid throughout. All vertical spacing is a
  multiple of 8px; all horizontal spacing may drop to 4px increments only
  for tight inline groupings (e.g., a label and its value).
- **Density:** deliberately lower than a typical fintech dashboard. Ballast
  is read for hours, not scanned for seconds — density that aids
  five-minute comprehension actively harms eight-hour fatigue resistance.
- **Alignment:** all numeric data (amounts, confidence, timestamps) is
  right-aligned with tabular figures. All narrative/evidence text is
  left-aligned, ragged-right, never justified.
- **Reading order / scanning behavior:** left-to-right, top-to-bottom for
  narrative; but the *ledger's* scanning behavior is vertical-first — an
  operator scans down the state column before reading any row horizontally.
  This is why state must be the second-most-prominent element (after the
  Operational State) and must sit in a fixed horizontal position across
  every row.

---

## 3. Color System

**Confidence: MEDIUM for all hex values — concrete fill of the locked "paper/ink, asymmetric state color" principle. Reasoning given per color. Nothing here introduces a color outside the philosophy's asymmetric model.**

All values below are 6-digit hex, sRGB, intended as CSS custom properties.

| Token | Hex | Purpose | Usage rule |
|---|---|---|---|
| `--paper` | `#F7F5F0` | Primary background | Warm off-white, never pure white — matches "paper" material metaphor. Base canvas everywhere. |
| `--paper-raised` | `#FCFBF8` | Surface (cards, rows, panels) | Barely lighter than paper — a whisper of elevation, never a drop shadow. |
| `--ink` | `#1A1A17` | Primary text | Warm near-black, never `#000`. All headers, primary data. |
| `--ink-secondary` | `#55534C` | Secondary text | Body/narrative/evidence text. |
| `--ink-tertiary` | `#8C8A80` | Tertiary text | Captions, timestamps, de-emphasized labels. |
| `--border` | `#E4E1D8` | Hairline dividers | Ledger row separators, table rules. Must remain visible but quiet — this is the "sacred alignment" the BREAK disruption depends on. |
| `--border-strong` | `#C9C5B8` | Emphasis dividers | Section separators, panel edges only — used sparingly. |
| `--break` | `#A3352B` | BREAK state ONLY | Deep oxide/brick red — deliberately not a bright alarm red, closer to the "iron oxide" reference in prior design discussion. Reserved exclusively for BREAK and `insufficient_observation_coverage` past its window. Never used decoratively, never as an accent elsewhere. |
| `--break-surface` | `#F5E8E5` | BREAK row background tint | Extremely faint — a wash, not a highlight. Used only inside a BREAK row's local disruption, never as a page-level alert background. |
| `--floating` | `#A8874A` | FLOATING state ONLY | Muted amber/gold — "a whisper of distinction." Deliberately desaturated so it does not compete with BREAK's authority. |
| `--reconciled` | `#6B7A6C` | RECONCILED state ONLY | Muted, desaturated sage-gray-green — deliberately close to `--ink-tertiary` in perceived weight. Success should nearly disappear. |
| `--confidence-track` | `--ink-tertiary` (reuse) | Confidence indicator | See note below — confidence does NOT get its own color scale. |
| `--hover` | `rgba(26,26,23,0.04)` | Hover background | 4% ink wash over paper. No color shift, only weight shift. |
| `--focus-ring` | `--ink` at 100% | Keyboard focus | 2px solid ink outline, 2px offset. Never a color-coded focus ring. |
| `--disabled` | `--ink-tertiary` at 50% opacity | Disabled elements | Text and icons only; disabled backgrounds stay `--paper`. |
| `--selection` | `rgba(26,26,23,0.08)` | Text/row selection | 8% ink wash. |
| `--system-warning` | `#8A6D1F` | Non-payment UI warnings only (e.g. form validation) | **MEDIUM confidence, new decision, reasoned below.** |
| `--system-error` | `#8C3A2E` | Non-payment UI errors only (e.g. failed API call) | Deliberately distinct in hue-weight from `--break` — see reasoning. |
| `--system-success` | `#4F6B52` | Non-payment UI confirmations only (e.g. "settings saved") | Deliberately distinct from `--reconciled`. |

**Reasoning — confidence has no color scale.** A red-to-green confidence
gradient would be a second, competing color system, undermining the
asymmetric three-state model. Confidence is always rendered as a plain
monospace number (e.g. `0.75`) in `--ink-secondary`, optionally with a
minimal horizontal tick mark using the *row's own state color* — never an
independent stoplight scale.

**Reasoning — system-level colors are a genuine gap, not a restatement.**
Nothing in prior discussion addressed generic UI chrome (a form validation
error, a failed network request toast) as distinct from payment *domain*
states. If a form error used the same red as `--break`, it would dilute
BREAK's authority — the single most important design constraint in the
entire philosophy. These three tokens exist solely to keep system-level UI
feedback visually distinct from payment-state color, and must never be used
on anything related to a payment's lifecycle state.

**Accessibility requirement (all colors):** every text/background pairing
above must meet WCAG AA contrast (4.5:1 for body text, 3:1 for large
text/UI components). `--break` on `--paper` and `--ink` on `--paper` both
pass comfortably at these values; verify programmatically during
implementation rather than trusting this document alone (see Section 13).

---

## 4. Typography System

**Confidence: MEDIUM — concrete typeface selection filling the locked "monospace for data, editorial serif for narrative, never Inter" principle.**

**Family selection and reasoning:** the IBM Plex superfamily (Plex Serif,
Plex Sans, Plex Mono) is specified as the base, for one deliberate reason:
it is a single type system designed to share metrics and visual DNA across
three optical purposes, which avoids the "typography mismatch" risk of
combining unrelated typefaces from different foundries. It is free,
well-supported, has genuine tabular figures, and was originally designed
for IBM's own instrument-and-systems documentation — a closer philosophical
match to "technical manual" than a purely editorial serif alone.

- **IBM Plex Serif** — narrative voice: page headers, section titles,
  evidence explanation prose, the Evidence Assistant's responses. Carries
  the "editorial, human-authored" register.
- **IBM Plex Mono** — all evidence and data: amounts, timestamps, hashes,
  confidence values, engine versions, table contents. Tabular figures
  enabled everywhere numbers appear in a column.
- **IBM Plex Sans** — UI chrome only: buttons, nav labels, form labels,
  anything that is *interface*, not *content*. This is the typeface that
  should "disappear" — it never carries narrative weight.

**Open Question (explicitly not decided — flagged, not resolved):** if
IBM Plex is later found unavailable/unlicensed for a specific deployment
target, the fallback direction (per `DESIGN_PHILOSOPHY.md`'s own reference
list) would be Source Serif 4 (narrative) + a monospace with true tabular
figures such as JetBrains Mono (data) + a neutral humanist sans, but this
substitution is not decided here and should not be made without
re-confirming it doesn't reintroduce the "looks like every other product"
problem.

**Scale (modular, ratio ~1.25, base 16px):**

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `--text-display` | 40px | 1.1 | Plex Serif, 600 | Landing page hero only |
| `--text-h1` | 28px | 1.2 | Plex Serif, 600 | Page titles |
| `--text-h2` | 22px | 1.3 | Plex Serif, 600 | Section headers |
| `--text-h3` | 18px | 1.4 | Plex Sans, 600 | Subsection / component titles |
| `--text-body` | 16px | 1.6 | Plex Serif, 400 | Narrative, evidence explanation |
| `--text-ui` | 14px | 1.5 | Plex Sans, 500 | Buttons, labels, nav |
| `--text-caption` | 13px | 1.4 | Plex Sans, 400 | Timestamps, secondary metadata |
| `--text-data` | 14px | 1.5 | Plex Mono, 400, tabular-nums | Amounts, confidence, hashes, IDs |
| `--text-data-lg` | 18px | 1.3 | Plex Mono, 500, tabular-nums | The Operational State's headline number |

**Letter spacing:** default (0) for body/data; `+0.02em` on all-caps labels
(e.g. state badges "BREAK", "FLOATING") to preserve legibility at small
size without italicizing or bolding for emphasis.

**Numeric alignment:** every table/ledger column containing numbers uses
`font-variant-numeric: tabular-nums` without exception — this is
non-negotiable per the "beautiful if color disappeared" principle; misaligned
numbers in a ledger are a credibility failure, not a cosmetic one.

---

## 5. Spacing System

**Confidence: MEDIUM.**

Base unit: **8px.** Scale: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128` (px).

- **Containers:** max content width `1120px` for the ledger/dashboard
  (wide enough for tabular data, not so wide that row-scanning fatigues the
  eye). Narrative/landing content max width `720px` (optimal reading
  measure, ~75 characters per line).
- **Rows (collapsed ledger row):** vertical padding `16px`, horizontal
  padding `24px`. Row-to-row gap: hairline border only, no additional gap —
  uniformity is the point (see Section 10).
- **Cards/panels:** internal padding `24px`; gap between stacked panels
  `32px`.
- **Expansion (row depth transitions):** each additional depth level adds
  `24px` of internal padding before its content begins, visually nesting
  Understanding inside Priority, and Audit inside Understanding.
- **Drawer (Evidence Assistant, when built):** fixed width `420px` on
  desktop, full-width on mobile, internal padding `24px`.

---

## 6. Layout System

**Confidence: MEDIUM.**

- **Desktop (≥1280px):** full layout — Operational State full-width at top,
  ledger below at max-width 1120px centered, Evidence Assistant as a
  right-side drawer when open (does not reflow the ledger).
- **Tablet (768–1279px):** Operational State full-width; ledger single
  column, evidence/audit expansion pushes content down rather than
  drawering sideways.
- **Mobile (<768px):** Operational State condenses to its message only (no
  inline expandable list — tapping navigates to a filtered list view,
  since inline expansion at this width would break row uniformity). Ledger
  rows stack amount/state/confidence vertically rather than in fixed
  columns, since tabular alignment cannot be preserved below ~600px without
  harming legibility — **MEDIUM confidence, explicitly a compromise**;
  revisit if operators use Ballast on mobile in practice.
- **Sidebar/navigation:** not yet specified in prior discussion beyond the
  existing forked app's nav. No new sidebar is introduced by this
  document — **Open Question**, left to whoever builds primary navigation.
- **Replay panel, Audit export dialog:** not yet built; when built, follow
  the drawer/panel pattern above (in-place, never a route change), per the
  "revelation not navigation" principle.

---

## 7. Component Library

**Confidence: HIGH for existing components (already built, described faithfully); MEDIUM for not-yet-built components (concrete spec, not yet implemented).**

### Ledger Row (built, styling pending)
Collapsed: endpoint (Plex Sans, `--text-ui`), amount (Plex Mono,
`--text-data`, right-aligned), state badge (Plex Sans, uppercase,
`+0.02em` tracking, state color per Section 3), confidence (Plex Mono,
`--text-data`, right-aligned). Row background `--paper-raised`; border
`--border` bottom only.

### State Badge
Small, plain-text label (not a filled pill unless genuinely understated —
per the hard prohibition on rounded-pill badges unless they read
restrained). Recommended treatment: uppercase text in the state color, no
background fill, a 2px left border in the state color as the only
"container" — this satisfies "positional disruption + color reinforcement"
without introducing a decorative pill shape.

### Operational State (built)
Full-width band above the ledger. `--text-data-lg` for the headline
number/message. Background `--paper` (same as page — it is not a card,
it does not float above the content; it IS the top of the content, always
present). In attention state: left border `4px solid var(--break)`; in calm
state: no border accent at all — its *absence* of accent is itself part of
the signal.

### Evidence Signal Line (built, inside row's Understanding depth)
Monospace bracketed tag (e.g. `[pending_batch_sum_attributed]`) in
`--ink-tertiary`, followed by Plex Serif explanatory sentence in
`--ink-secondary`. This pairing (mono tag + serif sentence) is the
established evidence-line pattern and should not be altered.

### Buttons (MEDIUM — not previously specified)
Two variants only, deliberately minimal: **Primary** (ink background, paper
text, no radius or 2px radius max — sharp, instrument-like, never a pill)
and **Text/Ghost** (no background, ink text, underline on hover). No
tertiary/outline variant — extra button variants are exactly the kind of
"every extra element is guilty until proven innocent" surface area to
avoid.

### Table (generic, for Audit Export preview / future views)
Hairline row dividers only (`--border`), no zebra striping (zebra striping
is a density crutch; Ballast should not need it if spacing/typography are
correct), tabular-nums throughout.

### Timeline / Replay control (not yet built — MEDIUM spec)
A horizontal scrubber, monospace timestamp readout, discrete tick marks at
each real observation (not a continuous/interpolated scrubber — ticks must
correspond to actual evidence points, never implying evidence between
observations that wasn't recorded).

### Confidence display (built as text; formalizing)
Always `--text-data`, right-aligned, shown as a decimal (e.g. `0.75`),
never as a percentage or a star rating — decimals read as measurement;
percentages and stars read as marketing.

### Alerts / Toasts (MEDIUM — not yet built, system-level only)
Use `--system-warning` / `--system-error` / `--system-success` exclusively
(never payment-state colors). Plain text, no icons required, dismiss
manually or after a long delay (8s+) — never auto-dismiss quickly, since
that itself would be a form of decorative motion.

### Loading / Empty / Error states (MEDIUM — not yet built)
Loading: no spinner. A calm, static, monospace "Loading evidence…" text
matches the "nothing moves unless information changed" motion principle
better than a spinning icon. Empty: plain statement of fact ("No payments
observed yet"), never a decorative illustration. Error: the same voice
discipline as the Evidence Assistant — state what's known, state what
isn't, never apologize theatrically.

### Assistant / Search / Filters / Export dialog
Not yet built. Follow the drawer/panel and typography rules above when
built; no new visual pattern is introduced by this document for them.

---

## 8. Motion System

**Confidence: HIGH for principle (restated); MEDIUM for concrete durations.**

- **Governing rule (unchanged):** motion exists only because information
  changed. If nothing changed, nothing moves.
- **Expansion (row depth change):** 200ms, ease-out, height/opacity only —
  no scale, no bounce.
- **Hover:** 100ms linear background-color transition (the `--hover` wash)
  — fast enough to feel responsive, too fast to read as "designed delight."
- **Focus:** no transition — the focus ring should appear instantly, since
  a delayed focus indicator harms keyboard-accessibility perception.
- **BREAK appearance:** no transition at all. A row entering BREAK state
  should render its disruption immediately on next data refresh, not fade
  or slide in — abruptness is intentional, matching "gravity, not delight"
  and the earlier principle that BREAK must never feel softened.
- **Loading:** no spinner animation (see Section 7); if any motion is used
  it should be a slow, calm opacity pulse (1.5s cycle) on the static text,
  never a rotating icon.
- **Replay/Timeline scrubbing:** instantaneous state swap per tick, no
  interpolation between observations — interpolating would visually imply
  evidence that was never recorded.

---

## 9. Iconography

**Confidence: MEDIUM — genuine gap, reasoned decision.**

**Recommendation: use icons only where text cannot substitute, and prefer
text over icons by default.** Per "every icon must defend itself" — most
of Ballast's interface should not need icons at all (state is communicated
by the badge treatment in Section 7, not an icon). Where icons are
unavoidable (e.g., a collapse/expand chevron, a close control on a drawer):
outline style, 1.5px stroke weight, no fill, single consistent icon set
(e.g. Lucide — outline-only, no decorative icon packs). Never use icons to
represent payment state (no checkmarks, no warning triangles) — state is
communicated exclusively through the typographic badge treatment, to avoid
a second, competing semantic system alongside color and position.

---

## 10. Ledger Specification

**Confidence: HIGH for behavior (already built/decided); MEDIUM for exhaustive visual anatomy not previously fully itemized.**

**Row anatomy (collapsed):** four fixed-position columns — Endpoint (left,
Plex Sans), Amount (right, Plex Mono, tabular), State (fixed position,
badge treatment per Section 7), Confidence (right, Plex Mono, tabular).
Column positions never shift between rows — this fixed positioning is what
makes positional disruption legible.

**Expansion behavior:** four depths, expansion-in-place (never a route
change), each depth nests inside the previous with `24px` additional
padding (Section 5):
1. **Collapsed** — the four columns above only.
2. **Priority** (default resting state) — adds nothing visually beyond
   collapsed in the current build; confidence is already always visible.
   *(Note: per Section 24 of the master spec, the distinct Priority-vs-
   Collapsed visual difference is not yet finalized — this is an
   implementation task, not a contradiction.)*
3. **Understanding** — unfolds the Evidence Signal Line list (Section 7)
   beneath the row, indented `24px`, `--paper` background (same as row,
   no visual "card" separation — it's a continuation of the row, not a
   new surface).
4. **Audit** — further unfolds raw observation JSON (Plex Mono, small,
   `--ink-tertiary`, scrollable if long), the engine version string, and
   (when built) a "replay as of this moment" control.

**BREAK appearance:** 4px left border in `--break`, `--break-surface`
background wash on the row only (not the page), state badge reads `BREAK`
in `--break`. No icon. Row height may be marginally taller if the state
badge text is longer than others (e.g. `insufficient_observation_coverage`)
— this height difference is itself an acceptable, honest form of
positional disruption, not something to normalize away.

**FLOATING appearance:** no border accent, state badge in `--floating`,
otherwise visually identical row structure to RECONCILED.

**RECONCILED appearance:** no border accent, state badge in `--reconciled`
— deliberately close in weight to `--ink-tertiary` so it reads as quiet
confirmation, not celebration.

**Confidence display:** as specified in Section 7 — decimal, monospace,
right-aligned, no color scale of its own.

**Evidence, Timeline, Audit, Assistant integration:** all as specified in
their respective sections above; the ledger row is the single point of
entry for all four, via expansion, never separate navigation.

---

## 11. Operational State Specification

**Confidence: HIGH — restates built behavior; no new decisions needed beyond visual tokens already given in Sections 3/4/7.**

Full-width, top of `/dashboard/observe`, independently queried (already
built — Decision recorded separately in `DECISIONS.md`), three message
levels (calm / floating-only / attention), never derived from ledger state,
attention state overrides and lists flagged payments inline. Visual
treatment per Section 7. No contradiction with the ledger: they may report
on the same underlying evidence, but neither is the other's data source.

---

## 12. Evidence Assistant UI

**Confidence: MEDIUM — not yet built; concrete UI spec for when it is, consistent with the locked architecture in the master spec.**

- **Layout:** lives inside an expanded row's Understanding/Audit depth, not
  a floating corner widget (per locked philosophy) — rendered as an inline
  "Ask Ballast" affordance beneath the Evidence Signal Line list.
- **Conversation layout:** question and answer both in `--text-body` (Plex
  Serif) — deliberately NOT styled like a chat bubble UI (no rounded
  bubbles, no avatar icons) — styled instead like an analyst's written
  note beneath the evidence it discusses.
- **Evidence citations:** every answer ends with a monospace "Evidence
  used" block, listing the same bracketed signal tags already used in the
  row (Section 7) — reusing the existing evidence-line visual pattern
  rather than inventing a new citation style.
- **Guardrails (visual expression of the architectural rule):** if the
  assistant cannot answer from evidence, the response renders in the exact
  same typographic treatment as any other answer — never a distinct
  "error" style — because "the evidence does not show that" is a normal,
  first-class answer, not a failure state.
- **Loading:** same calm static text pattern as Section 7's loading state,
  not a "typing indicator" animation (typing indicators imply liveliness/
  personality, which contradicts the analyst tone).
- **History:** append-only within the row's context (consistent with the
  Open Question in the master spec about whether conversations are logged
  as evidence — this UI spec does not resolve that question, only notes
  that if they are logged, they should render identically to how they
  appeared live, per the replay-determinism principle).

---

## 13. Accessibility

**Confidence: MEDIUM — gap-filling; no formal audit performed yet (flagged in master spec).**

- **Keyboard:** every expansion/interaction must be reachable and
  operable via keyboard alone (Tab to focus a row, Enter/Space to expand)
  — required, not optional, given the "eight hour daily use" target
  audience likely includes keyboard-preferring power users.
- **Screen readers:** state badges must have an accessible text equivalent
  beyond color (e.g. `aria-label="State: BREAK"`) — color alone must never
  be the only signal, consistent with the "positional disruption primary"
  principle already requiring a non-color mechanism to exist.
- **Contrast:** all color pairs in Section 3 must be verified against WCAG
  AA programmatically during implementation — this document specifies
  intent, not a substitute for automated contrast testing.
- **Focus:** visible 2px ink ring, instant (no transition), on every
  interactive element.
- **Reduced motion:** respect `prefers-reduced-motion` — given the motion
  system is already minimal (Section 8), this mainly means disabling the
  200ms expansion transition and any loading pulse, falling back to
  instant state changes.
- **Color blindness:** because BREAK/FLOATING/RECONCILED rely on hue
  (red/amber/green-gray) as their secondary signal, position and text
  labels (the state badge text itself) must always be sufficient alone,
  without color, to identify state — already satisfied by design (badges
  are always text, never color-only chips), but must be explicitly
  verified during implementation, not assumed.
- **Touch targets:** minimum 44x44px for any tappable element on mobile
  layouts (Section 6).

---

## 14. Design Tokens

**Confidence: MEDIUM — direct Tailwind-ready translation of Sections 3-5 and 8. No new decisions, only format.**

```js
// tailwind.config extension (illustrative — adapt to actual Tailwind version in repo)
module.exports = {
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F7F5F0', raised: '#FCFBF8' },
        ink: { DEFAULT: '#1A1A17', secondary: '#55534C', tertiary: '#8C8A80' },
        border: { DEFAULT: '#E4E1D8', strong: '#C9C5B8' },
        state: {
          break: '#A3352B',
          'break-surface': '#F5E8E5',
          floating: '#A8874A',
          reconciled: '#6B7A6C',
        },
        system: {
          warning: '#8A6D1F',
          error: '#8C3A2E',
          success: '#4F6B52',
        },
      },
      fontFamily: {
        serif: ['IBM Plex Serif', 'serif'],
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '1.1' }],
        h1: ['28px', { lineHeight: '1.2' }],
        h2: ['22px', { lineHeight: '1.3' }],
        h3: ['18px', { lineHeight: '1.4' }],
        body: ['16px', { lineHeight: '1.6' }],
        ui: ['14px', { lineHeight: '1.5' }],
        caption: ['13px', { lineHeight: '1.4' }],
        data: ['14px', { lineHeight: '1.5' }],
        'data-lg': ['18px', { lineHeight: '1.3' }],
      },
      spacing: {
        // Tailwind's default 4px scale already covers 4/8/12/16/24/32/48/64/96/128 —
        // no custom scale override needed; use standard Tailwind spacing units.
      },
      borderRadius: {
        DEFAULT: '2px', // sharp, instrument-like — avoid Tailwind's default rounded-md/lg
      },
      transitionDuration: {
        hover: '100ms',
        expand: '200ms',
      },
      boxShadow: {
        // Deliberately minimal — no default elevation shadows.
        // Use border + subtle paper/paper-raised contrast instead of shadow.
        none: 'none',
      },
    },
  },
};
```

**Border widths:** `1px` (hairline, default), `2px` (focus ring, state
badge left border), `4px` (BREAK row accent). No other widths.
**Breakpoints:** `768px` (tablet), `1280px` (desktop), per Section 6.
**Opacity tokens:** `0.04` (hover), `0.08` (selection), `0.5` (disabled).
**Elevation:** none — Ballast uses tone (`--paper` vs `--paper-raised`) and
borders instead of shadows, consistent with "nothing synthetic or glossy."

---

## 15. Figma Structure

**Confidence: LOW — not previously discussed at all; offered as a reasonable default, entirely optional, does not affect app or code.**

If a Figma file is created (not required for Claude Code to build from
this document): Pages — `Tokens`, `Components`, `Ledger`, `Operational
State`, `Evidence Assistant`, `Landing (Chapter One)`. Components organized
by the same names as Section 7, each with variants for the three payment
states where relevant. Naming convention: `Ballast/Component/Variant`
(e.g. `Ballast/StateBadge/Break`). This section is advisory only and has no
bearing on implementation.

---

## 16. Acceptance Criteria

**Confidence: HIGH.**

A Ballast UI faithfully represents this specification if and only if:

- [ ] No pure white or pure black appears anywhere; `--paper`/`--ink`
  and their variants are used exclusively.
- [ ] `--break`, `--floating`, `--reconciled` never appear outside a
  payment state badge or its directly-associated row accent.
- [ ] Every number in a table or ledger uses tabular figures and is
  right-aligned.
- [ ] The ledger never reorders rows for any reason.
- [ ] The Operational State never reads stale relative to the ledger.
- [ ] No gradients, no glassmorphism, no rounded-pill badges, no icon
  feature-cards, no "Powered by AI" badge, and no celebratory animation
  on RECONCILED exist anywhere in the build.
- [ ] Every expansion is in-place; no payment-detail view requires a
  route change.
- [ ] A screenshot of any screen, with the logo removed, is
  distinguishable from a generic fintech dashboard by a person unfamiliar
  with Ballast — if it isn't, the design has failed regardless of how
  closely it follows the token values above.

---

## Open Questions (not decided here)

Restated from `BALLAST_MASTER_SPEC.md`, not resolved by this document:

1. Depth-preference memory — automatic vs. manual.
2. Whether Ask Ballast conversations are logged as evidence.
3. BREAK remediation workflow — still unclassified in the roadmap.
4. Sidebar/primary navigation pattern — not specified by this document.
5. Mobile ledger column-stacking — flagged above as a compromise, not a
   confirmed final decision.

---

*This document should be re-read by Claude Code before any visual/styling
task. It does not replace `DESIGN_PHILOSOPHY.md` — it operationalizes it.*
