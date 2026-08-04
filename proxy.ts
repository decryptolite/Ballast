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

import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const session = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  // Logged-in user trying to access sign-in page -> redirect to dashboard
  if (pathname === "/" && session === "authenticated") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Ballast's observability screen is public: it is the product, and it is
  // read-only. Everything it renders comes from evidence tables that already
  // allow public SELECT, and every WRITE path reachable from the page
  // enforces the session server-side in its own route handler, independently
  // of this gate (see DECISIONS.md #048). Page-level auth is therefore not
  // what protects any mutation — removing it here changes what can be READ,
  // never what can be WRITTEN.
  const isPublicObservability = pathname.startsWith("/dashboard/observe");

  // Logged-out user trying to access protected routes -> redirect to sign-in.
  // /dashboard (the inherited payments/withdrawals demo) stays gated.
  if (
    pathname.startsWith("/dashboard") &&
    !isPublicObservability &&
    session !== "authenticated"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
