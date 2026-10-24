-- 0043_platform_replay_guard.sql
-- Replay protection for the signed /api/platform/* endpoints.
--
-- Until now a captured request could be re-sent for 5 minutes (the timestamp
-- window). Each request's signature is unique per (timestamp, method, path,
-- body), so remembering signatures already seen for the window turns that
-- into "first use only". The app calls platform_claim_request() after the
-- signature checks out; false means the signature was already used.
--
-- Service role only. The table has RLS on and no policies, and is exempt from
-- the subscription gate (the platform API must keep working for a lapsed
-- school -- that is how the vendor renews it).

create table if not exists public.platform_request_nonces (
  signature text primary key,
  seen_at   timestamptz not null default now()
);
alter table public.platform_request_nonces enable row level security;
revoke all on public.platform_request_nonces from public, anon, authenticated;
create index if not exists platform_request_nonces_seen_at_idx
  on public.platform_request_nonces (seen_at);

-- Returns true the first time a signature is seen, false on a replay.
-- Rows older than 15 minutes (3x the 5 minute window) are dropped on the way.
create or replace function public.platform_claim_request(p_signature text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_inserted int;
begin
  delete from public.platform_request_nonces where seen_at < now() - interval '15 minutes';
  insert into public.platform_request_nonces (signature) values (p_signature)
    on conflict (signature) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;
revoke all on function public.platform_claim_request(text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.platform_claim_request(text) to service_role;
  end if;
end $$;

-- Keep this table out of the subscription gate (0040).
create or replace function public.subscription_gate_exempt()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['profiles', 'settings', 'session_subscriptions', 'platform_request_nonces'];
$$;
