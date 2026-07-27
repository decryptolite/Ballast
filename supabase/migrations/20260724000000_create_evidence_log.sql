-- Ballast evidence log.
--
-- These two tables are the append-only evidence stream described in
-- DECISIONS.md #003 and CLAUDE.md: raw observations only, never derived
-- state or conclusions. No UPDATE or DELETE code path may ever be written
-- against these tables — INSERT and SELECT only.
--
-- verification_events: one row per x402 payment authorization accepted by
--   the seller (the VERIFIED signal — see DECISIONS.md #008/#009). Written
--   from lib/x402.ts at the point Circle's Gateway facilitator returns
--   settleResult.success === true.
--
-- chain_observations: created now so Task 2 (the standalone chain
--   observer, not yet built) has a target table. Nothing writes to it yet.

create table public.verification_events (
  id uuid primary key default gen_random_uuid(),
  payment_id text,
  amount numeric,
  endpoint text not null,
  buyer_ref text,
  authorization_ref text,
  observed_at timestamptz not null default now(),
  raw jsonb not null
);

comment on table public.verification_events is
  'Append-only evidence log of x402 payment authorizations accepted by the seller. Rows are never updated or deleted after insert.';
comment on column public.verification_events.payment_id is
  'The buyer-generated EIP-3009 authorization nonce (paymentPayload.payload.authorization.nonce) — chosen by the buyer at signing time, not by Circle or this app. Null if the payload did not have this shape.';
comment on column public.verification_events.amount is
  'USDC amount in decimal units (e.g. 0.001 = 0.001 USDC) — same convention as payment_events.amount_usdc. Not atomic (6-decimal) units.';
comment on column public.verification_events.authorization_ref is
  'The "transaction" field returned by Circle Gateway''s POST /v1/x402/settle. Per Circle''s API reference this is a "Transaction UUID on success" — a Circle-internal settlement reference, NOT an onchain transaction hash. Do not treat as onchain settlement proof (see DECISIONS.md #008).';
comment on column public.verification_events.raw is
  'Full raw payload observed at the verification point (paymentPayload, requirements, verifyResult, settleResult) as seen at the time, sufficient to replay this observation.';

alter table public.verification_events enable row level security;

create policy "Allow public read access"
  on public.verification_events for select
  using (true);

create policy "Allow service inserts"
  on public.verification_events for insert
  to service_role
  with check (true);

-- Deliberately no UPDATE or DELETE policy — and Supabase's service_role
-- bypasses RLS entirely by default, so the absence of a policy alone does
-- not stop a service_role mutation. The REVOKE below is the actual
-- enforcement mechanism; it is independent of RLS and safe to run even if
-- these grants were never present (REVOKE on an ungranted privilege is a
-- no-op, not an error).
revoke update, delete on public.verification_events from anon, authenticated, service_role;

create table public.chain_observations (
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null default now(),
  gateway_available numeric,
  gateway_withdrawable numeric,
  onchain_tx text,
  block bigint,
  raw jsonb
);

comment on table public.chain_observations is
  'Append-only evidence log of chain/Gateway balance observations, populated by the Task 2 chain observer (not yet built as of this migration). Rows are never updated or deleted after insert.';
comment on column public.chain_observations.gateway_available is
  'Gateway "available" balance in USDC decimal units at observation time, read from Circle Gateway''s offchain ledger (POST /v1/balances). This is an offchain, Circle-asserted figure, not an onchain fact — see DECISIONS.md #008.';
comment on column public.chain_observations.gateway_withdrawable is
  'Gateway "withdrawable" balance in USDC decimal units at observation time.';
comment on column public.chain_observations.onchain_tx is
  'A genuine onchain transaction hash, when this observation corresponds to one (e.g. a seller withdrawal mint tx). Null for pure balance-poll observations, which is expected to be the common case.';

alter table public.chain_observations enable row level security;

create policy "Allow public read access"
  on public.chain_observations for select
  using (true);

create policy "Allow service inserts"
  on public.chain_observations for insert
  to service_role
  with check (true);

revoke update, delete on public.chain_observations from anon, authenticated, service_role;
