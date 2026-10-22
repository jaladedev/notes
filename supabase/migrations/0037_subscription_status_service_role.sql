-- 0037_subscription_status_service_role.sql
-- The platform API (app/api/platform/status) calls subscription_status() with
-- the service role. 0036 revoked execute from public/anon and granted it to
-- authenticated only; hosted Supabase normally still lets service_role run it
-- through its own default privileges, but make the grant explicit so the
-- endpoint doesn't depend on that.
--
-- A separate file because 0036 may already be applied (the provisioning
-- script never re-runs an applied migration, even if it was edited).
-- Conditional because plain Postgres (the test harness) has no service_role.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.subscription_status() to service_role;
  end if;
end $$;
