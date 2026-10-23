-- 0040_subscription_rls_gate.sql
-- Enforce the subscription gate in the DATABASE, not only in middleware.
--
-- THE GAP: until now a lapsed school was locked out only by middleware.ts
-- redirecting to /subscription-expired. Middleware guards pages; it does
-- not guard the Supabase API. Anyone with a login can use the public anon
-- key plus their session to call PostgREST directly and read or write
-- everything their RLS allows, whatever the school has paid.
--
-- THE GATE: a RESTRICTIVE policy on every user-facing table. Restrictive
-- policies are AND-ed with the table's existing (permissive) policies, so
-- adding one changes no existing rule; it only adds "...and the school's
-- subscription allows access". It applies to the `authenticated` role, so
-- the service role (admin client, platform API) is unaffected, and anon
-- (e.g. /shared/[token], deliberately not gated -- see TODO.md) is
-- untouched.
--
-- IT MIRRORS lib/subscription.ts isLockedOut() EXACTLY:
--   locked   : 'expired', 'upcoming'
--   allowed  : 'off' (no rows yet), 'active', 'grace'
-- So it is OFF until the first subscription row exists, like the
-- middleware gate, and a grace period is not a lockout. If the status
-- cannot be determined it allows access: a failed lookup must not lock a
-- whole school out.
--
-- EXEMPT TABLES (the lockout flow must still work):
--   profiles, settings   read by middleware / the /subscription-expired page
--   session_subscriptions  the lock's own state; admin-read only already
--
-- WHAT THIS DOES NOT COVER (be aware):
--   * SECURITY DEFINER functions bypass table RLS by design. The student-
--     facing ones are submit_quiz_attempt, get_quiz_attempt_questions,
--     get_quiz_attempt_review, grade_essay_answer and parent_children. A
--     lapsed user can still call those directly; each only ever touches
--     that user's own attempt or children, but it is not a hard stop.
--   * Supabase Storage object policies (files are reached through signed
--     URLs and the admin client, not these tables).
--   * New tables: a table created after this migration is NOT gated until
--     apply_subscription_gate() is run. tables_missing_subscription_gate()
--     lists any that were missed, and supabase/tests/10_subscription_rls.sql
--     fails if there are any, so CI catches it.

-- Tables the lockout flow itself needs. One list, used by every function below.
create or replace function public.subscription_gate_exempt()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['profiles', 'settings', 'session_subscriptions'];
$$;

-- The predicate the policies call. SECURITY DEFINER so a student (who
-- cannot read session_subscriptions) still gets an answer.
create or replace function public.subscription_allows_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select s.state not in ('expired', 'upcoming') from public.subscription_status() s limit 1),
    true
  );
$$;

-- RLS-enabled public tables that do not yet carry the gate.
create or replace function public.tables_missing_subscription_gate()
returns setof text
language sql
stable
set search_path = public, pg_temp
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and c.relname <> all (public.subscription_gate_exempt())
    and not exists (
      select 1 from pg_policy p
      where p.polrelid = c.oid and p.polname = 'subscription_gate'
    )
  order by c.relname;
$$;

-- Adds the gate to every table that lacks it. Idempotent: safe to re-run
-- after adding a table. Returns the tables it gated. Not callable by app
-- users (it issues DDL).
create or replace function public.apply_subscription_gate()
returns setof text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t text;
begin
  for t in select * from public.tables_missing_subscription_gate() loop
    -- (select ...) makes Postgres evaluate the function once per statement
    -- instead of once per row.
    execute format(
      'create policy subscription_gate on public.%I as restrictive for all to authenticated '
      'using ((select public.subscription_allows_access())) '
      'with check ((select public.subscription_allows_access()))',
      t
    );
    return next t;
  end loop;
end;
$$;

revoke all on function public.subscription_gate_exempt() from public, anon;
revoke all on function public.subscription_allows_access() from public, anon;
revoke all on function public.tables_missing_subscription_gate() from public, anon, authenticated;
revoke all on function public.apply_subscription_gate() from public, anon, authenticated;
grant execute on function public.subscription_gate_exempt() to authenticated;
grant execute on function public.subscription_allows_access() to authenticated;

-- Same explicit service_role grant 0037 / 0039 made (plain Postgres in the
-- test harness has no such role).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.subscription_allows_access() to service_role;
  end if;
end $$;

select public.apply_subscription_gate();
