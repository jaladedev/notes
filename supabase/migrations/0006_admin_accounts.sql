-- Removes open self-signup; admin creates every account instead
-- (school_app's model). See lib/actions/accountAdmin.ts.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- A global role, independent of space_members. Needed because an admin
-- must be able to act as "the school's admin" (create accounts, manage
-- classes/subjects) before they belong to any single space -- and a
-- parent (new in this migration) never belongs to a space at all.
create type global_role as enum ('admin', 'teacher', 'student', 'parent');

alter table profiles
  add column role global_role not null default 'student',
  add column email text,
  add column must_change_password boolean not null default true,
  add column is_active boolean not null default true;

-- profiles.email mirrors auth.users.email for admin list views (avoids an
-- admin-client join from every staff/student list page). Only ever
-- written by accountAdmin.ts at creation time.
create unique index profiles_email_unique on profiles (email) where email is not null;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- A deactivated account keeps its row (audit history, authored notes,
-- etc.) but can no longer read anything via RLS. assertGlobalRole and
-- assertSpaceRole (see authGuards.ts) both re-check is_active server-side
-- too, since a stale JWT-verified session shouldn't survive deactivation.
drop policy if exists spaces_member on spaces;
create policy spaces_member on spaces for select to public
  using (
    exists (select 1 from profiles where id = auth.uid() and is_active)
    and (is_space_reader(spaces.id) or is_admin())
  );

comment on function public.is_admin() is
  'True only for an active profile with the global admin role. Used by '
  'RLS policies and assertGlobalRole(["admin"]) in accountAdmin.ts.';

-- Bootstrap: the very first admin has no admin to create them. Run once,
-- manually, right after provisioning a school and before handing it off:
--   1. supabase auth admin createUser (or the dashboard) with a temp password
--   2. insert into public.profiles (id, role, full_name, email, must_change_password)
--      values ('<the new user id>', 'admin', '<name>', '<email>', true);
-- Everyone after that goes through accountAdmin.ts's createXAccount functions.
