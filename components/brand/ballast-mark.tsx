/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// Ballast mark — BALLAST_VISUAL_IDENTITY_REBUILD.md §2.
//
// A circle, mostly open, weighted low: the lower portion solid, the upper a
// thin outline only, crossed by a single hairline equilibrium line where fill
// meets openness.
//
// It depicts a physical PROPERTY — mass sitting low is what makes a body
// stable — not an object. There is no ballast weight, anchor, ship or water
// here, at any size. Nothing to decode: it reads as grounded because its
// weight is genuinely at the bottom.
//
// Geometry notes:
//   - The viewBox is fixed at 24x24 and never changes with `size`, so the
//     clip geometry is identical in every instance. That is why a single
//     shared clipPath id is safe even with several marks on one page.
//   - The filled segment is produced by clipping a full circle rather than
//     by an arc path: clipping is geometrically unambiguous, where arc
//     sweep flags are easy to get subtly wrong and impossible to verify
//     without a browser.
//   - The outline and equilibrium line use vectorEffect="non-scaling-stroke"
//     so they render as a true 1px hairline at ANY size — literally the same
//     stroke weight as the dividers in the interface, which is what the
//     brief means by the mark and the product sharing visual DNA.

const VIEWBOX = 24;
const CENTER = 12;
const RADIUS = 9;
/** Where fill meets openness. Below centre, so the mass reads as low. */
const EQUILIBRIUM_Y = 14;
/** The equilibrium line runs past the circle on both sides — a datum line on
 *  an instrument, not a slice through an object. */
const LINE_INSET = 1.5;

const CLIP_ID = "blst-mark-weighted-low";

export interface BallastMarkProps {
  /** Rendered edge length in px. The viewBox is constant, so geometry and
   *  hairline weight are identical at every size. */
  size?: number;
  /** Accessible name. Omit for decorative use beside a visible wordmark. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function BallastMark({
  size = 24,
  title,
  className,
  style,
}: BallastMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <rect
            x="0"
            y={EQUILIBRIUM_Y}
            width={VIEWBOX}
            height={VIEWBOX - EQUILIBRIUM_Y}
          />
        </clipPath>
      </defs>

      {/* Mass, sitting low. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="currentColor"
        clipPath={`url(#${CLIP_ID})`}
      />

      {/* The open upper portion: outline only. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* The equilibrium line. */}
      <line
        x1={LINE_INSET}
        y1={EQUILIBRIUM_Y}
        x2={VIEWBOX - LINE_INSET}
        y2={EQUILIBRIUM_Y}
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface BallastWordmarkProps {
  /** Mark edge length in px; the word is set to match its optical height. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Mark + "Ballast" in the serif voice. Clearspace is enforced by the
 * component itself (§2: do not crowd the mark against other UI) — the gap
 * between mark and word, and the padding around the pair, are proportional
 * to the mark so they hold at any size.
 */
export function BallastWordmark({
  size = 24,
  className,
  style,
}: BallastWordmarkProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        // 1x gap between mark and word, 2x clearspace around the pair —
        // the same discipline Circle's own brand kit requires of its marks.
        gap: size * 0.5,
        padding: `${size * 0.5}px ${size}px ${size * 0.5}px 0`,
        color: "var(--text-primary)",
        ...style,
      }}
    >
      <BallastMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-plex-serif)",
          fontSize: size * 0.92,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.01em",
        }}
      >
        Ballast
      </span>
    </span>
  );
}
