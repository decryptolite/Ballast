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

// Arc / Circle attribution — BALLAST_VISUAL_IDENTITY_REBUILD.md §6.
//
// The marks are the OFFICIAL assets, downloaded from circle.com/pressroom and
// stored byte-identical in public/brand/. Nothing here recreates, redraws,
// recolours, stretches or otherwise modifies them — Circle's Brand Use Policy
// states plainly: "Do not alter, stretch, or modify the assets." Rendering is
// height-constrained with width derived from each file's real aspect ratio, so
// neither is ever distorted.
//
// This is factual attribution, not co-branding: plain "Built on" / "Powered
// by" credit, no partnership framing, no endorsement implied — per the same
// policy's requirement that use must not "suggest an affiliation".

import { color, space, text } from "@/lib/ballast/design-tokens";

/** Real intrinsic dimensions of the official files, used to preserve aspect
 *  ratio exactly. Arc 500x171, Circle 467x120. */
const ARC_RATIO = 500 / 171;
const CIRCLE_RATIO = 467 / 120;

/**
 * Clearspace. Circle's brand kit specifies 2x on all sides, where x is
 * defined by their icon's internal geometry (one gap + one ring). That unit
 * cannot be derived from the full-logo file alone, so rather than claim exact
 * 2x compliance this applies a generous proportional margin — 1x the rendered
 * logo height on every side — which comfortably exceeds crowding in either
 * direction. Recorded as an approximation of the stated discipline, not as
 * verified conformance.
 */
const CLEARSPACE_FACTOR = 1;

function Mark({
  src,
  alt,
  href,
  height,
  ratio,
}: {
  src: string;
  alt: string;
  href: string;
  height: number;
  ratio: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="blst-ghost"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: height * CLEARSPACE_FACTOR,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the official
          assets are SVGs served verbatim from /public; next/image would
          require dangerouslyAllowSVG and gives no benefit here. */}
      <img
        src={src}
        alt={alt}
        height={height}
        width={Math.round(height * ratio)}
        style={{ height, width: Math.round(height * ratio), display: "block" }}
      />
    </a>
  );
}

export function Attribution({ logoHeight = 16 }: { logoHeight?: number }) {
  const label: React.CSSProperties = {
    ...text.caption,
    color: color.textTertiary,
  };

  return (
    <footer
      style={{
        borderTop: `1px solid ${color.line}`,
        marginTop: space.xxl,
        paddingTop: space.lg,
        paddingBottom: space.lg,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: space.lg,
      }}
    >
      <span style={{ ...label, display: "inline-flex", alignItems: "center" }}>
        Built on
        <Mark
          src="/brand/arc-logo-white.svg"
          alt="Arc"
          href="https://docs.arc.io"
          height={logoHeight}
          ratio={ARC_RATIO}
        />
      </span>

      <span style={{ ...label, display: "inline-flex", alignItems: "center" }}>
        Powered by
        <Mark
          src="/brand/circle-logo-white.svg"
          alt="Circle"
          href="https://www.circle.com"
          height={logoHeight}
          ratio={CIRCLE_RATIO}
        />
        Nanopayments
      </span>

      <span style={{ ...label, marginLeft: "auto" }}>
        Arc and Circle are trademarks of Circle Internet Group, Inc. Ballast is
        an independent project and is not affiliated with or endorsed by Circle.
      </span>
    </footer>
  );
}
