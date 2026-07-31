/**
 * Ballast — design tokens (BALLAST_DESIGN_SYSTEM.md §3/§4/§5/§14).
 *
 * The VALUES live in app/globals.css as CSS custom properties, exactly as §3
 * specifies ("intended as CSS custom properties"). This module holds only
 * named `var()` references and the type/space scales, so there is one source
 * of truth rather than a hex table duplicated per component — which is what
 * this file replaces.
 *
 * Styling only. Nothing here touches logic, queries, or the engine.
 */

import type { CSSProperties } from "react";

/** §3 Color System. Every value resolves to a custom property in globals.css. */
export const color = {
  paper: "var(--paper)",
  paperRaised: "var(--paper-raised)",
  ink: "var(--ink)",
  inkSecondary: "var(--ink-secondary)",
  inkTertiary: "var(--ink-tertiary)",
  border: "var(--border-hairline)",
  borderStrong: "var(--border-strong)",
  /** Payment-state colors — §16: never used outside a state badge or its
   * directly-associated row accent. */
  break: "var(--break)",
  breakSurface: "var(--break-surface)",
  floating: "var(--floating)",
  reconciled: "var(--reconciled)",
  /** System-level UI feedback ONLY — never payment lifecycle state (§3). */
  systemWarning: "var(--system-warning)",
  systemError: "var(--system-error)",
  systemSuccess: "var(--system-success)",
} as const;

/** §4 Typography families. Loaded via next/font in app/layout.tsx. */
export const font = {
  serif: "var(--font-plex-serif)",
  sans: "var(--font-plex-sans)",
  mono: "var(--font-plex-mono)",
} as const;

/** §5 Spacing scale, 8px baseline grid. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  huge: 64,
} as const;

/** §5 Containers. */
export const layout = {
  /** Ledger/dashboard max width. */
  content: 1120,
  /** Narrative reading measure (~75 characters). */
  narrative: 720,
} as const;

/** §14 Border widths — 1px hairline, 2px focus/badge, 4px BREAK accent. Nothing else. */
export const borderWidth = { hairline: 1, emphasis: 2, accent: 4 } as const;

/** §14 Radius — sharp, instrument-like. 2px maximum, never a pill. */
export const radius = 2;

/**
 * §4 Type scale (modular, ratio ~1.25, base 16px). Each entry is a complete
 *, ready-to-spread style so sizes and line-heights cannot drift per usage.
 */
export const text = {
  h1: {
    fontFamily: font.serif,
    fontSize: 28,
    lineHeight: 1.2,
    fontWeight: 600,
  },
  h2: {
    fontFamily: font.serif,
    fontSize: 22,
    lineHeight: 1.3,
    fontWeight: 600,
  },
  h3: {
    fontFamily: font.sans,
    fontSize: 18,
    lineHeight: 1.4,
    fontWeight: 600,
  },
  /** Narrative / evidence prose. */
  body: {
    fontFamily: font.serif,
    fontSize: 16,
    lineHeight: 1.6,
    fontWeight: 400,
  },
  /** Interface chrome: buttons, labels, nav. */
  ui: {
    fontFamily: font.sans,
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 500,
  },
  /** Timestamps, secondary metadata. */
  caption: {
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 1.4,
    fontWeight: 400,
  },
  /** All evidence and data. Tabular figures are non-negotiable (§4). */
  data: {
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: 1.5,
    fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
  },
  /** The Operational State's headline. */
  dataLg: {
    fontFamily: font.mono,
    fontSize: 18,
    lineHeight: 1.3,
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
  },
} satisfies Record<string, CSSProperties>;

/**
 * §7 Buttons — two variants only. No tertiary/outline: extra variants are
 * exactly the surface area the philosophy says to refuse.
 */
export const button = {
  primary: {
    ...text.ui,
    color: color.paper,
    background: color.ink,
    border: "none",
    borderRadius: radius,
    padding: "8px 16px",
    cursor: "pointer",
  },
  ghost: {
    ...text.ui,
    color: color.ink,
    background: "none",
    border: "none",
    borderRadius: 0,
    padding: 0,
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;

/**
 * §7 State badge — uppercase text in the state color, a 2px left border as
 * the only container. No fill, no pill. §13: always paired with an
 * aria-label so colour is never the sole signal.
 */
export function stateBadge(stateColorValue: string): CSSProperties {
  return {
    ...text.ui,
    color: stateColorValue,
    textTransform: "uppercase",
    letterSpacing: "0.02em",
    borderLeft: `${borderWidth.emphasis}px solid ${stateColorValue}`,
    paddingLeft: space.xs,
    background: "none",
  };
}

/**
 * §7 Evidence Signal Line — mono bracketed tag in ink-tertiary, followed by
 * a serif sentence in ink-secondary. The established pattern; §12 requires
 * Ask Ballast's "Evidence used" block to reuse it rather than invent a new
 * citation style.
 */
export const evidenceLine = {
  tag: {
    ...text.data,
    fontSize: 13,
    color: color.inkTertiary,
  },
  detail: {
    ...text.body,
    fontSize: 14,
    color: color.inkSecondary,
  },
} satisfies Record<string, CSSProperties>;
