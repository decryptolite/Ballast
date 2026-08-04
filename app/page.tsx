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

// Ballast — sign in.
//
// Presentation only. The server action, session creation and the demo
// credential VALUES are untouched; this file changed what the page looks
// like and where the credentials live, nothing about how auth works.
//
// The mark is the anchor. Demo credentials are no longer displayed: they sit
// behind a secondary "Use demo account" control that fills the form. The
// fields therefore start EMPTY — a pre-filled form would still put the
// credentials on screen, which is exactly what this redesign removes.
//
// Motion: none, except the error message, which appears only when something
// actually changed (a failed attempt). No decorative animation.

"use client";

import { useState } from "react";
import Link from "next/link";
import { login } from "./actions";
import { BallastWordmark } from "@/components/brand/ballast-mark";
import { button, color, radius, space, text } from "@/lib/ballast/design-tokens";

// Unchanged values, reused — not redeclared or duplicated anywhere.
const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "123456";

const fieldStyle: React.CSSProperties = {
  ...text.ui,
  fontWeight: 400,
  color: color.textPrimary,
  background: color.canvas,
  border: `1px solid ${color.line}`,
  borderRadius: radius,
  padding: `10px ${space.sm}px`,
  width: "100%",
  display: "block",
  outline: "none",
};

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Controlled so the demo control can fill them. The form still submits via
  // the same server action, with the same field names.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: color.canvas,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.lg,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* The mark is the page's anchor, given its own clearspace. */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <BallastWordmark size={26} />
        </div>

        <p
          style={{
            ...text.body,
            color: color.textSecondary,
            textAlign: "center",
            margin: `${space.xs}px 0 0`,
          }}
        >
          Settlement, observed.
        </p>

        {/* Surface panel: depth by tone and a hairline, never a shadow. */}
        <section
          style={{
            background: color.surface,
            border: `1px solid ${color.line}`,
            borderRadius: radius,
            padding: space.xl,
            marginTop: space.xl,
          }}
        >
          <h1
            style={{
              ...text.h3,
              color: color.textPrimary,
              margin: 0,
            }}
          >
            Sign in
          </h1>

          <form
            action={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: space.md,
              marginTop: space.lg,
            }}
          >
            <div>
              <label
                htmlFor="email"
                style={{
                  ...text.caption,
                  color: color.textTertiary,
                  display: "block",
                  marginBottom: space.xxs,
                }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={fieldStyle}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{
                  ...text.caption,
                  color: color.textTertiary,
                  display: "block",
                  marginBottom: space.xxs,
                }}
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={fieldStyle}
              />
            </div>

            {/* Appears only when an attempt actually failed — the one place on
                this page where information changes, so the one place motion is
                justified. System error tone, never the BREAK state colour. */}
            {error && (
              <p
                className="blst-unfold"
                role="alert"
                style={{
                  ...text.caption,
                  color: color.systemError,
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="blst-primary"
              style={{
                ...button.primary,
                width: "100%",
                padding: `10px ${space.md}px`,
                marginTop: space.xxs,
              }}
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/*
            Secondary, deliberately quiet. This is the only place the demo
            credentials exist in the UI now, and they are filled rather than
            displayed. A future "or continue with…" section would sit
            naturally between the submit button above and this divider — no
            placeholder is rendered for it, because a button that does
            nothing reads as broken, not as forward-looking.
          */}
          <div
            style={{
              borderTop: `1px solid ${color.line}`,
              marginTop: space.lg,
              paddingTop: space.md,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              className="blst-ghost"
              onClick={() => {
                setEmail(DEMO_EMAIL);
                setPassword(DEMO_PASSWORD);
                setError(null);
              }}
              style={{
                ...text.caption,
                color: color.textSecondary,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Use demo account
            </button>
          </div>
        </section>

        {/* The observability screen is public (DECISIONS.md #048), so offer it
            directly rather than making a visitor sign in to see the product. */}
        <p
          style={{
            ...text.caption,
            color: color.textTertiary,
            textAlign: "center",
            margin: `${space.lg}px 0 0`,
          }}
        >
          <Link
            href="/dashboard/observe"
            className="blst-ghost"
            style={{ color: color.textSecondary }}
          >
            View the ledger without signing in
          </Link>
        </p>
      </div>
    </main>
  );
}
