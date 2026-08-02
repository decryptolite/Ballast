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

// Noise becoming order — BALLAST_VISUAL_IDENTITY_REBUILD.md §4, static form.
//
// The brief's hero concept is scattered, unresolved points settling under
// something like gravity into an ordered arrangement. This is the STATIC
// translation of that idea: rather than showing the transformation over
// TIME, it shows it over SPACE — scatter at the top resolving, band by band,
// onto the equilibrium line at the bottom. Same mechanism, no motion, and
// nothing here depends on animation landing correctly.
//
// The equilibrium line is the same hairline as the mark's, and the mark's
// own language (weight settling low) is what the figure restates at scale.
// No maritime imagery: these are points finding rest, not droplets or waves.
//
// Positions are DETERMINISTIC — computed once at module scope from an index
// hash, never Math.random(). That keeps server and client markup identical
// (no hydration mismatch) and makes the composition stable across builds.

import { color } from "@/lib/ballast/design-tokens";

const WIDTH = 880;
const HEIGHT = 300;
const EQUILIBRIUM_Y = 252;

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

interface Point {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

/**
 * Five bands. Scatter and vertical jitter decay to zero as the bands
 * descend, while opacity and radius rise — unresolved and faint at the top,
 * resolved and certain at the line.
 */
function buildPoints(): Point[] {
  const points: Point[] = [];
  const bands = 5;
  const perBand = 22;

  for (let b = 0; b < bands; b++) {
    // 0 at the top band, 1 at the settled band.
    const settled = b / (bands - 1);
    const bandY = 40 + settled * (EQUILIBRIUM_Y - 40);
    // Scatter collapses as the band settles.
    const jitterY = (1 - settled) ** 1.6 * 34;
    const jitterX = (1 - settled) ** 1.4 * 26;

    for (let i = 0; i < perBand; i++) {
      const seed = b * 101 + i * 7;
      const evenX = ((i + 0.5) / perBand) * WIDTH;
      points.push({
        x: evenX + (hash(seed) - 0.5) * 2 * jitterX,
        y: bandY + (hash(seed + 3) - 0.5) * 2 * jitterY,
        r: 1.1 + settled * 1.0,
        opacity: 0.18 + settled * 0.72,
      });
    }
  }
  return points;
}

const POINTS = buildPoints();

export function SettlingFigure({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height="auto"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ display: "block", maxWidth: "100%" }}
    >
      {POINTS.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={p.r}
          fill={color.accent}
          opacity={p.opacity}
        />
      ))}

      {/* The equilibrium line — the same hairline the mark uses. */}
      <line
        x1="0"
        y1={EQUILIBRIUM_Y}
        x2={WIDTH}
        y2={EQUILIBRIUM_Y}
        stroke={color.line}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
