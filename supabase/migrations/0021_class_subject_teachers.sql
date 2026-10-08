-- Teacher <-> subject <-> class assignments.
--
-- teacher_subjects says which subjects a teacher may write notes for;
-- timetable_entries says who teaches a given lesson. Neither says "Mrs Ade
-- teaches Maths to JSS2A" before the timetable exists. This table does, and
-- teaches_class() now counts it, so an assigned teacher can post
-- announcements to and see the roster of that class.

create table if not exists class_subject_teachers (
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, subject_id, teacher_id)
);
create index if not exists class_subject_teachers_subject_id_idx on class_subject_teachers (subject_id);
create index if not exists class_subject_teachers_teacher_id_idx on class_subject_teachers (teacher_id);

alter table class_subject_teachers enable row level security;

create policy class_subject_teachers_read on class_subject_teachers for select to public
  using (
    is_admin()
    or teacher_id = (select auth.uid())
    or is_class_reader(class_id)
  );
create policy class_subject_teachers_write_admin on class_subject_teachers for all to public
  using (is_admin())
  with check (is_admin());

create or replace function public.teaches_class(p_class_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from timetable_entries e
    where e.class_id = p_class_id and e.teacher_id = (select auth.uid())
  ) or exists (
    select 1 from class_subject_teachers c
    where c.class_id = p_class_id and c.teacher_id = (select auth.uid())
  );
$$;
