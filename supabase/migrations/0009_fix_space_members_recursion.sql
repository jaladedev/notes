-- Fixes a real bug found by running the migrations against a live
-- Postgres and exercising RLS as a non-superuser role (the plan doc's
-- "verified the scaffold actually runs" pass): querying `topics`,
-- `class_members`, or `space_members` itself as any authenticated user
-- raised "infinite recursion detected in policy for relation
-- space_members".
--
-- Root cause: space_members_self (0001_init.sql) checked "is the
-- current user a space admin" by querying space_members directly,
-- inside space_members' own SELECT policy:
--
--   using (profile_id = auth.uid() or exists (
--     select 1 from space_members m2 where m2.space_id = space_id
--       and m2.profile_id = auth.uid() and m2.role = 'admin'
--   ));
--
-- That subquery's own rows are themselves subject to
-- space_members_self, which requires re-running the same subquery --
-- an unbounded loop Postgres detects and refuses. 0005_classes.sql
-- introduced is_space_reader() as a SECURITY DEFINER helper precisely
-- to avoid this trap elsewhere (its own comment says as much), but
-- missed the one place -- space_members's own policy -- where the
-- trap was self-contained and didn't need any other table's policy to
-- trigger it. Anything that reads space_members directly (topics_write_staff,
-- class_members_visible, and space_members_self itself) inherited the
-- break.

create or replace function public.is_space_admin(p_space_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members m
    where m.space_id = p_space_id and m.profile_id = auth.uid() and m.role = 'admin'
  );
$$;

drop policy if exists space_members_self on space_members;
create policy space_members_self on space_members for select to public
  using (profile_id = auth.uid() or is_space_admin(space_id) or is_admin());

-- Second bug found by the same test pass: homework_submissions_own's
-- WITH CHECK allowed `student_id = auth.uid()` unconditionally, with
-- no check that the student is actually a member of the homework's
-- space. Any authenticated student could insert a submission against
-- any homework_id in the database (not read it -- homework_visible
-- still gates SELECT -- but write a row against it), given the UUID
-- from anywhere: a leaked share link, a guess, another student
-- mentioning it. Confirmed by test: a Space B student successfully
-- inserted a submission for Space A's homework.

drop policy if exists homework_submissions_own on homework_submissions;
create policy homework_submissions_own on homework_submissions for all to public
  using (
    student_id = auth.uid()
    or is_parent_of(student_id)
    or exists (
      select 1 from homework h join topics t on t.id = h.topic_id
      join space_members m on m.space_id = t.space_id
      where h.id = homework_submissions.homework_id and m.profile_id = auth.uid()
        and m.role in ('teacher','reviewer','admin')
    )
  )
  with check (
    (
      student_id = auth.uid()
      and exists (
        select 1 from homework h join topics t on t.id = h.topic_id
        join space_members m on m.space_id = t.space_id
        where h.id = homework_submissions.homework_id and m.profile_id = auth.uid()
      )
    )
    or exists (
      select 1 from homework h join topics t on t.id = h.topic_id
      join space_members m on m.space_id = t.space_id
      where h.id = homework_submissions.homework_id and m.profile_id = auth.uid()
        and m.role in ('teacher','reviewer','admin')
    )
  );

-- Third and fourth bugs found running this for real: `spaces` and
-- `space_members` have NEVER had an INSERT policy across any
-- migration (0001-0008), yet createSpace() (lib/actions/notes.ts)
-- inserts into both via the RLS-scoped client, not the admin client --
-- meaning space creation has been completely non-functional this
-- whole time, for every role including admin. Confirmed empirically:
-- `insert into spaces (...)` as an authenticated admin fails with
-- "new row violates row-level security policy for table spaces".
--
-- Fix matches createSpace's actual (and only) write pattern: a global
-- teacher or admin can create a space, and a user can insert
-- themselves into space_members with role 'admin' for a space they
-- just created (the "creator becomes the space's first admin" step
-- createSpace already does). No other code path writes to either
-- table, so this covers the real usage exactly rather than opening
-- more than what's used.
--
-- Also tightened alongside this: createClass/addClassMember/
-- removeClassMember/createSubject in notes.ts now require the global
-- admin role (previously any signed-in user, including a student,
-- could create classes and edit any class's roster -- see this
-- migration's earlier fixes for the same requireUser()-only gap).

create policy spaces_insert_staff on spaces for insert to public
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('teacher', 'admin') and is_active
    )
  );

create policy space_members_insert_self_admin on space_members for insert to public
  with check (
    profile_id = auth.uid()
    and role = 'admin'
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('teacher', 'admin') and is_active
    )
  );

-- Fifth bug in this same batch: addSpaceMember/removeSpaceMember
-- (lib/actions/notes.ts) already existed and were already correctly
-- gated by assertSpaceRole(spaceId, ["admin"]) -- but write through
-- the RLS-scoped client, and space_members_insert_self_admin (added
-- earlier in this migration) only covers a user inserting THEMSELVES
-- as admin of a space they just created. An existing space admin
-- adding a colleague, or removing anyone, had no matching policy at
-- all. Confirmed empirically: Teacher A (already an admin of Space A)
-- failed to add Teacher B to Space A with the same RLS violation.

create policy space_members_write_by_space_admin on space_members for insert to public
  with check (is_space_admin(space_id) or is_admin());

create policy space_members_delete_by_space_admin on space_members for delete to public
  using (is_space_admin(space_id) or is_admin());

create policy space_members_update_by_space_admin on space_members for update to public
  using (is_space_admin(space_id) or is_admin())
  with check (is_space_admin(space_id) or is_admin());
