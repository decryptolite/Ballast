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

import Link from "next/link";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { TopBarGatewayControls } from "@/components/dashboard/top-bar-gateway-controls";
import { BallastWordmark } from "@/components/brand/ballast-mark";
import { LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* The mark sits first, with its own clearspace (§2). It links to
              the observability screen — the product's actual home. */}
          <Link
            href="/dashboard/observe"
            aria-label="Ballast — observability"
            className="blst-ghost shrink-0"
          >
            <BallastWordmark size={20} />
          </Link>
          <TopBarGatewayControls />
          <form action={logout}>
            <Button variant="ghost" size="icon" type="submit">
              <LogOut size={16} className="text-muted-foreground" />
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
