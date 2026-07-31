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

import type { Metadata } from "next";
import { IBM_Plex_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Arc Nanopayments Demo",
  description: "Arc nanopayments demo application",
};

// BALLAST_DESIGN_SYSTEM.md §4: the IBM Plex superfamily — one type system
// across three optical purposes. Self-hosted by next/font (no runtime request
// to Google), which also closes the "Plex not bundled" gap flagged in
// DECISIONS.md #023. Geist was previously loaded here and is removed: a
// generic modern sans is precisely what DESIGN_PHILOSOPHY.md's "not Inter as
// the sole typeface" prohibition is about.
const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plexSerif.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
