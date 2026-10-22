-- 0036_session_subscriptions.sql
-- Per-academic-session subscription gating. One deployment = one school, so
-- there is no org_id: each row is one paid session (e.g. "2026/2027") with a
-- start and end date.
--
-- Who can set it: ONLY the service role (the vendor, via
-- scripts/set-subscription.sh or the SQL editor). There is deliberately no
-- insert/update/delete policy: if the school's own admin could write this
-- table they could extend their own subscription. School admins can READ it
-- (to see when they expire); nobody else can.
--
-- Gating is OFF until the first row exists. An empty table means "not
-- enforced", so existing deployments, local dev and the test harness keep
-- working on upgrade, and nobody is locked out before a subscription has
-- been recorded. Once any row exists, access requires today's date (in the
-- school's time zone) to fall inside some row's [starts_on, ends_on].
--
-- Enforcement lives in middleware.ts (it redirects to /subscription-expired).
-- This migration only supplies the state; see subscription_status() below.

create table session_subscriptions (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  starts_on date not null,
  ends_on date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint session_subscriptions_dates_check check (ends_on >= starts_on),
  constraint session_subscriptions_year_check check (char_length(btrim(academic_year)) between 1 and 40)
);

comment on table session_subscriptions is
  'One row per paid academic session. Written only by the service role. Gating is off while this table is empty.';

alter table session_subscriptions enable row level security;

-- Admin read only. No write policies on purpose (see header).
create policy session_subscriptions_read_admin on session_subscriptions
  for select to authenticated
  using (public.is_admin());

-- What the app asks on each request. SECURITY DEFINER so every signed-in
-- user (a student, who cannot read the table) gets the answer without being
-- able to read the rows. Always returns exactly one row.
--
--   state      'off'      table is empty: gating not enforced
--              'active'   today is inside a subscribed session
--              'upcoming' not active now, but a later session is recorded
--              'expired'  not active and nothing later is recorded
--   days_left  whole days until ends_on while active (0 = last day); else null
--   academic_year / starts_on / ends_on describe the row the state refers to
--              (the active one, else the next one, else the most recent).
create or replace function public.subscription_status()
returns table(
  state text,
  academic_year text,
  starts_on date,
  ends_on date,
  days_left integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date;
  r session_subscriptions%rowtype;
begin
  if not exists (select 1 from session_subscriptions) then
    return query select 'off'::text, null::text, null::date, null::date, null::integer;
    return;
  end if;

  v_today := (now() at time zone coalesce((select s.timezone from settings s limit 1), 'Africa/Lagos'))::date;

  select * into r from session_subscriptions s
    where v_today between s.starts_on and s.ends_on
    order by s.ends_on desc limit 1;
  if found then
    return query select 'active'::text, r.academic_year, r.starts_on, r.ends_on, (r.ends_on - v_today)::integer;
    return;
  end if;

  select * into r from session_subscriptions s
    where s.starts_on > v_today
    order by s.starts_on asc limit 1;
  if found then
    return query select 'upcoming'::text, r.academic_year, r.starts_on, r.ends_on, null::integer;
    return;
  end if;

  select * into r from session_subscriptions s order by s.ends_on desc limit 1;
  return query select 'expired'::text, r.academic_year, r.starts_on, r.ends_on, null::integer;
end;
$$;

revoke all on function public.subscription_status() from public, anon;
grant execute on function public.subscription_status() to authenticated;
