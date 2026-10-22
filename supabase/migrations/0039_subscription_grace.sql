-- 0039_subscription_grace.sql
-- Grace period after a paid session ends.
--
-- Each session_subscriptions row gets grace_days (vendor-set, like the rest
-- of the row; there is still no write policy for school admins). For
-- grace_days after ends_on the school keeps full access and its admins see a
-- renewal warning; only after that does the lockout start.
--
-- New state 'grace' from subscription_status():
--   today is after ends_on but not after ends_on + grace_days, and no session
--   is active. days_left = whole days of grace remaining (0 = last grace
--   day); grace_ends_on = the last day access continues.
--
-- Order of precedence: active, then grace, then upcoming, then expired. So a
-- school still inside last session's grace stays open even if next session
-- starts later; it is not flipped to 'upcoming' (locked) early.
--
-- Existing rows get the default (7 days). Set grace_days = 0 on a row to
-- keep the old strict behaviour for that session.
--
-- The RPC's result columns change (grace_ends_on added), and CREATE OR
-- REPLACE cannot change a function's result type, so it is dropped and
-- recreated with the grants 0036 and 0037 gave it. Old app code ignores the
-- extra column; it reads the unknown state 'grace' as "could not tell" and
-- lets the request through, which is the right outcome.
--
-- The date logic lives in subscription_status_at(date) so tests can pass any
-- "today". It is not granted to anyone; only subscription_status() calls it.

alter table session_subscriptions
  add column if not exists grace_days integer not null default 7;

alter table session_subscriptions
  drop constraint if exists session_subscriptions_grace_check;
alter table session_subscriptions
  add constraint session_subscriptions_grace_check check (grace_days between 0 and 60);

comment on column session_subscriptions.grace_days is
  'Days after ends_on the school keeps access (with an admin warning) before the lockout. 0 = none.';

drop function if exists public.subscription_status();

create or replace function public.subscription_status_at(p_today date)
returns table(
  state text,
  academic_year text,
  starts_on date,
  ends_on date,
  days_left integer,
  grace_ends_on date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r session_subscriptions%rowtype;
begin
  if not exists (select 1 from session_subscriptions) then
    return query select 'off'::text, null::text, null::date, null::date, null::integer, null::date;
    return;
  end if;

  select * into r from session_subscriptions s
    where p_today between s.starts_on and s.ends_on
    order by s.ends_on desc limit 1;
  if found then
    return query select 'active'::text, r.academic_year, r.starts_on, r.ends_on,
      (r.ends_on - p_today)::integer, (r.ends_on + r.grace_days);
    return;
  end if;

  select * into r from session_subscriptions s
    where p_today > s.ends_on and p_today <= s.ends_on + s.grace_days
    order by (s.ends_on + s.grace_days) desc limit 1;
  if found then
    return query select 'grace'::text, r.academic_year, r.starts_on, r.ends_on,
      ((r.ends_on + r.grace_days) - p_today)::integer, (r.ends_on + r.grace_days);
    return;
  end if;

  select * into r from session_subscriptions s
    where s.starts_on > p_today
    order by s.starts_on asc limit 1;
  if found then
    return query select 'upcoming'::text, r.academic_year, r.starts_on, r.ends_on,
      null::integer, (r.ends_on + r.grace_days);
    return;
  end if;

  select * into r from session_subscriptions s order by s.ends_on desc limit 1;
  return query select 'expired'::text, r.academic_year, r.starts_on, r.ends_on,
    null::integer, (r.ends_on + r.grace_days);
end;
$$;

revoke all on function public.subscription_status_at(date) from public, anon, authenticated;

create or replace function public.subscription_status()
returns table(
  state text,
  academic_year text,
  starts_on date,
  ends_on date,
  days_left integer,
  grace_ends_on date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.subscription_status_at(
    (now() at time zone coalesce((select s.timezone from settings s limit 1), 'Africa/Lagos'))::date
  );
$$;

revoke all on function public.subscription_status() from public, anon;
grant execute on function public.subscription_status() to authenticated;

-- Same explicit service_role grant 0037 made (plain Postgres has no such role).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.subscription_status() to service_role;
  end if;
end $$;
