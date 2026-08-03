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

// Primary navigation between Ballast's observability screen and the
// inherited Circle demo views.
//
// Before this existed the only route from /dashboard to /dashboard/observe
// was the wordmark itself — a logo, which reads as branding rather than as
// navigation, so the product was effectively undiscoverable from the
// dashboard a user lands on. Navigation only; no logic touched.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { color, space, text } from "@/lib/ballast/design-tokens";

const ITEMS = [
  { href: "/dashboard/observe", label: "Observability" },
  { href: "/dashboard", label: "Payments" },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      style={{ display: "flex", alignItems: "center", gap: space.lg }}
    >
      {ITEMS.map((item) => {
        // Exact match only: /dashboard must not light up while the user is
        // on /dashboard/observe.
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="blst-ghost"
            style={{
              ...text.ui,
              color: active ? color.textPrimary : color.textSecondary,
              // The current view is marked by weight and a hairline rule,
              // never by a pill or a fill.
              borderBottom: active
                ? `1px solid ${color.accent}`
                : "1px solid transparent",
              paddingBottom: 2,
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
