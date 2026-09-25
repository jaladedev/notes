-- Minimal emulation of what Supabase's platform provides before any
-- of this app's own migrations run: the auth schema, auth.uid(), and
-- the supabase_realtime publication. Not part of the app's own
-- migrations -- this only exists so 0001-0008 can be smoke-tested
-- against a plain local Postgres.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- Supabase's real auth.uid() reads the JWT claim embedded by PostgREST
-- for the current request. Here it just reads a session-local setting
-- we set explicitly per "request" with set_config(), which is exactly
-- how a manual RLS smoke test wants to control identity.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

create publication supabase_realtime;
