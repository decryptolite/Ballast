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

"use client";

import { useState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { color, radius, space, text } from "@/lib/ballast/design-tokens";

// Demo credentials, stated plainly so a first-time visitor is never stuck at
// the door. Informational styling only — the caption voice and a hairline
// panel, never a warning or error tone: this is a fact about the demo, not a
// problem. The values are set in sans/mono per the design system's split
// between interface chrome and literal data.
const DEMO_EMAIL = "admin@example.com";
const DEMO_PASSWORD = "123456";

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access the dashboard
          </p>
          <div
            style={{
              border: `1px solid ${color.line}`,
              borderRadius: radius,
              background: color.surface,
              padding: space.sm,
              marginTop: space.sm,
            }}
          >
            <div style={{ ...text.caption, color: color.textTertiary }}>
              Demo access
            </div>
            <div
              style={{
                ...text.data,
                color: color.textPrimary,
                marginTop: space.xxs,
                wordBreak: "break-all",
              }}
            >
              email: {DEMO_EMAIL}
              <br />
              password: {DEMO_PASSWORD}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Email"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
