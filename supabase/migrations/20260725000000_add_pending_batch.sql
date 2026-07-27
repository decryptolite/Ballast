-- Ballast evidence log — additive migration.
--
-- Promotes `pendingBatch` from Circle Gateway's POST /v1/balances response to
-- a first-class column on chain_observations. The chain observer has always
-- captured this value inside `raw`; this migration does not add a new
-- observation, it makes an existing one directly queryable.
--
-- Why: DECISIONS.md #011 established empirically that gateway_available does
-- not move at a useful timescale, while pendingBatch tracks floating value
-- within seconds. DECISIONS.md #012 establishes further that pendingBatch is
-- an exact running accumulator of verified-but-unsettled payment value,
-- making it the primary FLOATING signal for the inference engine.
--
-- Additive only: no existing column is altered, renamed, or dropped, and no
-- existing row is rewritten. Rows written before this migration keep
-- pending_batch = NULL; their pendingBatch value is still present in `raw`,
-- and inferStateV1 reads the column when populated and falls back to `raw`
-- otherwise, so historical rows remain fully usable as evidence.

alter table public.chain_observations
  add column if not exists pending_batch numeric;

comment on column public.chain_observations.pending_batch is
  'USDC value (decimal units) sitting in the seller''s currently-open Gateway batch, from the "pendingBatch" field of Circle''s POST /v1/balances response. Offchain, Circle-asserted, and aggregate across all of the seller''s payments — NOT a per-payment onchain settlement proof (see DECISIONS.md #008). NULL for rows written before this column existed, and for any cycle where Circle''s response omitted the field.';

-- Re-assert append-only enforcement (DECISIONS.md #009). Table-level REVOKE
-- already covers columns added later, so this is belt-and-braces rather than
-- strictly required — but it keeps the guarantee visible in every migration
-- that touches an evidence table, and REVOKE on an ungranted privilege is a
-- no-op rather than an error.
revoke update, delete on public.chain_observations from anon, authenticated, service_role;
