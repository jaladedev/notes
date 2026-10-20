-- 0034_parent_children.sql
-- Lets a parent read their linked children's names without the admin
-- client and without a row policy on `profiles`.
--
-- Why a function and not `create policy profiles_select_parent on
-- profiles for select using (is_parent_of(id))`: RLS is row-level only, so
-- that policy would also hand the parent every column of the child's row --
-- the student's login email, is_active and must_change_password -- when
-- the parent only needs a name. This returns exactly (id, full_name).
--
-- Scoped by guardian_links on auth.uid(): a parent gets their own
-- children and nobody else's, and anyone who is not a linked parent gets
-- an empty result. SECURITY DEFINER because the caller cannot read
-- profiles directly (profiles_self / profiles_admin_read_all only).

create or replace function public.parent_children()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.full_name
  from guardian_links g
  join profiles p on p.id = g.student_id
  where g.parent_id = auth.uid()
  order by p.full_name;
$$;

revoke all on function public.parent_children() from public, anon;
grant execute on function public.parent_children() to authenticated;
