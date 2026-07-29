-- Ballast remediation log — HUMAN-ACTION records, NOT system evidence.
--
-- This table answers the "then what happens" question for payments that
-- require attention (BREAK / stale coverage): who acknowledged it, how it
-- was resolved, with what explanation — recorded so the answer survives
-- scrutiny later (Layer 4), exactly like evidence does.
--
-- CRITICAL TYPE SEPARATION (PARKING_LOT.md prerequisite, DECISIONS.md #030):
-- rows here are records of human operational actions. They are:
--   - append-only, like evidence (corrections are new records, never edits);
--   - NEVER read by the inference engine. inferStateV1's conclusions derive
--     exclusively from system evidence (verification_events,
--     chain_observations). A human note must never change what Ballast
--     claims is true about a payment — a resolved BREAK is still a BREAK
--     in engine terms; "resolved" is a human claim displayed beside the
--     engine's conclusion, never in place of it.

create table public.remediation_events (
  id uuid primary key default gen_random_uuid(),
  verification_event_id uuid not null references public.verification_events(id),
  payment_id text,
  action text not null check (action in ('acknowledge', 'resolve')),
  note text,
  actor text not null default 'operator',
  state_at_action text,
  confidence_at_action numeric,
  engine_version_at_action text,
  created_at timestamptz not null default now()
);

comment on table public.remediation_events is
  'Append-only log of human remediation actions on payments requiring attention. HUMAN-ACTION records, architecturally distinct from system evidence: the inference engine must NEVER read this table (DECISIONS.md #030). Corrections are new records; rows are never updated or deleted.';
comment on column public.remediation_events.verification_event_id is
  'The verification_events row this action refers to — always present (payment_id can be null on old rows, the DB id cannot).';
comment on column public.remediation_events.payment_id is
  'Denormalized copy of the payment''s buyer-nonce identity (see #009) for cross-referencing. May be null when the source row had none.';
comment on column public.remediation_events.action is
  'acknowledge = a human has seen this and is on it. resolve = a human recorded an outcome (note required at the API layer). Neither changes engine state.';
comment on column public.remediation_events.actor is
  'Free-text actor label. The app currently has a single demo identity, so this defaults to ''operator'' — a placeholder until real authentication exists (BALLAST_MASTER_SPEC.md §16).';
comment on column public.remediation_events.state_at_action is
  'The engine state AS DISPLAYED to the operator at the moment of action (with confidence_at_action / engine_version_at_action). A record of what the human saw and acted on — not authoritative engine output, which is always re-derivable from evidence.';

create index remediation_events_verification_event_id_idx
  on public.remediation_events (verification_event_id);

alter table public.remediation_events enable row level security;

create policy "Allow public read access"
  on public.remediation_events for select
  using (true);

-- Inserts go exclusively through the session-gated server route
-- (app/api/ballast/remediation), which uses the service role. The browser's
-- anon key can read but never write.
create policy "Allow service inserts"
  on public.remediation_events for insert
  to service_role
  with check (true);

-- Append-only enforcement, same mechanism as the evidence tables (#009):
-- REVOKE is the real enforcement; service_role bypasses RLS by default.
revoke update, delete on public.remediation_events from anon, authenticated, service_role;
