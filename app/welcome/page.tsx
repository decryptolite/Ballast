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

// Ballast landing page — BALLAST_VISUAL_IDENTITY_REBUILD.md §4.
//
// Static composition, deliberately. A working, complete static page beats an
// untested animated one; the settling motion is an enhancement that can sit
// on top of this later without restructuring anything.
//
// Route: /welcome, NOT "/". proxy.ts matches only ["/", "/dashboard/:path*"],
// so this route is publicly reachable and the working auth flow is untouched
// — no redirect logic was modified.
//
// Every claim below is one the product can actually defend: the vocabulary
// (VERIFIED / FLOATING / RECONCILED, and the real signal kinds) is lifted
// from the engine itself, not invented for marketing. There are no fabricated
// metrics, no customer counts, no volume figures. Evidence before decoration
// applies here too.
//
// No maritime imagery. No gradients, no glassmorphism, no dashboard
// screenshot, no product logos used as decoration.

import type { Metadata } from "next";
import Link from "next/link";
import { BallastWordmark } from "@/components/brand/ballast-mark";
import { SettlingFigure } from "@/components/brand/settling-figure";
import { Attribution } from "@/components/brand/attribution";
import { color, layout, space, text } from "@/lib/ballast/design-tokens";

export const metadata: Metadata = {
  title: "Ballast — settlement, observed",
  description:
    "Ballast makes the interval between a verified nanopayment and its onchain settlement observable, with evidence.",
};

/** A movement, not a "section": each answers one question, then hands to the
 *  next. Separated by a hairline rather than a card edge. */
function Movement({
  question,
  children,
  first = false,
}: {
  question: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section
      style={{
        borderTop: first ? undefined : `1px solid ${color.line}`,
        paddingTop: first ? 0 : space.xxl,
        paddingBottom: space.xxl,
      }}
    >
      <h2
        style={{
          ...text.h2,
          color: color.textPrimary,
          margin: 0,
          maxWidth: layout.narrative,
        }}
      >
        {question}
      </h2>
      <div style={{ marginTop: space.md, maxWidth: layout.narrative }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        ...text.body,
        color: color.textSecondary,
        margin: `0 0 ${space.md}px`,
      }}
    >
      {children}
    </p>
  );
}

/** Product vocabulary, set in the evidence voice it uses in the ledger. */
function Term({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ ...text.data, color: color.textPrimary }}>{children}</span>
  );
}

function StateLine({
  state,
  stateColor,
  claim,
  basis,
}: {
  state: string;
  stateColor: string;
  claim: string;
  basis: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: space.sm,
        padding: `${space.sm}px 0`,
        borderTop: `1px solid ${color.line}`,
      }}
    >
      <span
        style={{
          ...text.ui,
          color: stateColor,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          borderLeft: `2px solid ${stateColor}`,
          paddingLeft: space.xs,
          minWidth: 132,
        }}
      >
        {state}
      </span>
      <span style={{ ...text.body, color: color.textSecondary, flex: 1 }}>
        {claim}{" "}
        <span style={{ color: color.textTertiary }}>{basis}</span>
      </span>
    </div>
  );
}

export default function Welcome() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: color.canvas,
        padding: `0 ${space.lg}px`,
      }}
    >
      <div style={{ maxWidth: layout.content, margin: "0 auto" }}>
        {/* Nav: the mark, and one way in. Nothing else. */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: space.md,
          }}
        >
          <BallastWordmark size={20} />
          <Link
            href="/dashboard/observe"
            className="blst-ghost"
            style={{ ...text.ui, color: color.textSecondary }}
          >
            Open the ledger
          </Link>
        </header>

        {/* Hero. One statement, then the figure that restates it without
            words: scatter resolving onto the equilibrium line. */}
        <section style={{ paddingTop: space.huge, paddingBottom: space.xl }}>
          <h1
            style={{
              ...text.h1,
              fontSize: 40,
              lineHeight: 1.15,
              color: color.textPrimary,
              margin: 0,
              maxWidth: 760,
            }}
          >
            A payment is verified in milliseconds. It settles much later, in a
            batch nobody watches.
          </h1>
          <p
            style={{
              ...text.body,
              fontSize: 18,
              color: color.textSecondary,
              maxWidth: layout.narrative,
              margin: `${space.lg}px 0 0`,
            }}
          >
            Ballast observes that interval and says exactly what is known
            about it, how confident it is, and why — from evidence it can
            replay months later.
          </p>

          <div style={{ marginTop: space.xxl }}>
            <SettlingFigure />
          </div>
        </section>

        <Movement question="What is actually invisible?" first>
          <P>
            Circle Nanopayments verifies a payment offchain and the seller
            delivers immediately. Actual settlement happens afterwards, inside
            a Gateway batch. Between those two moments the money is real,
            owed, and unaccounted for — and nothing in the stack reports on
            it.
          </P>
          <P>
            That interval is the whole problem. It is not an edge case; it is
            every payment, every time.
          </P>
        </Movement>

        <Movement question="What can honestly be observed?">
          <P>
            Three states, derived by a deterministic engine from an
            append-only evidence log. They are not equally certain, and
            Ballast does not present them as though they were.
          </P>
          <div style={{ marginTop: space.lg }}>
            <StateLine
              state="Verified"
              stateColor={color.textSecondary}
              claim="A recorded fact."
              basis="Circle's facilitator accepted the payment authorization."
            />
            <StateLine
              state="Floating"
              stateColor={color.floating}
              claim="Derived, and well corroborated."
              basis="The pending batch total accounts for this payment's value."
            />
            <StateLine
              state="Reconciled"
              stateColor={color.reconciled}
              claim="An inference, never a proof."
              basis="The batch holding it cleared — asserted offchain, in aggregate."
            />
            <StateLine
              state="Break"
              stateColor={color.break}
              claim="Positively unaccounted for."
              basis="Observed across a full window, and never explained."
            />
          </div>
        </Movement>

        <Movement question="What does it refuse to claim?">
          <P>
            Per-payment onchain settlement proof does not exist in this
            system. Circle&apos;s settle response returns an internal
            identifier, not a transaction hash, and no onchain event
            corresponds to one specific payment being batch-settled.
          </P>
          <P>
            So <Term>RECONCILED</Term> is capped below certainty by
            construction — no edit can raise it to 1.0 — and it always arrives
            labelled as an inference. A monitoring gap is reported as{" "}
            <Term>insufficient_observation_coverage</Term>, never as a{" "}
            <Term>BREAK</Term>: an absence of evidence on our side must never
            become an accusation about someone&apos;s payment.
          </P>
        </Movement>

        <Movement question="Why would anyone believe it?">
          <P>
            Every conclusion carries the signals that produced it —{" "}
            <Term>pending_batch_sum_attributed</Term>,{" "}
            <Term>pending_batch_cleared_after_rise</Term>,{" "}
            <Term>onchain_withdrawal_observed</Term> — in the operator&apos;s
            own words, alongside the raw evidence they were read from.
          </P>
          <P>
            The engine is pure, versioned, and reads no clock. The same
            evidence and the same engine version produce the same answer,
            always. Any payment can be replayed as it stood at any recorded
            moment, and exported whole — evidence, inference version,
            confidence and reasoning intact — for someone who was not there.
          </P>
          <div style={{ marginTop: space.lg }}>
            <Link
              href="/dashboard/observe"
              className="blst-primary"
              style={{
                ...text.ui,
                display: "inline-block",
                color: color.canvas,
                background: color.accent,
                borderRadius: 2,
                padding: `${space.sm}px ${space.lg}px`,
                textDecoration: "none",
              }}
            >
              Open the ledger
            </Link>
          </div>
        </Movement>

        <Attribution />
      </div>
    </main>
  );
}
