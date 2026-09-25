-- Found by exercising the class flow against a real Postgres: a global
-- admin adds a student to a class (addClassMember writes through the
-- admin client, so the row lands), but the roster page reads
-- class_members through the RLS-scoped client, and
-- class_members_visible (0005) only admits (a) the student's own row or
-- (b) staff who are members of a space tied to that class. A global
-- admin is neither, and a brand-new class has no spaces yet, so the
-- roster always rendered "No students yet." even though the writes
-- succeeded. Students/staff behaviour is unchanged.

drop policy if exists class_members_visible on class_members;
create policy class_members_visible on class_members for select to public
  using (
    profile_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from spaces s join space_members m on m.space_id = s.id
      where s.class_id = class_members.class_id
        and m.profile_id = auth.uid()
        and m.role in ('teacher', 'reviewer', 'admin')
    )
  );
