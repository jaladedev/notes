-- Replaces "spaces" with school_app's class/curriculum model.
--
-- Before: a note lived under a topic, a topic under a *space* (one subject for
-- one class-ish group), and access came from space_members / spaces.class_id.
--
-- After (same as school_app's curriculum_topics):
--   * A topic is identified by subject + education level + level number +
--     academic year + term (+ week_number). There is no space.
--   * Notes are SHARED BY LEVEL: every class at that level (JSS2A, JSS2B, ...)
--     sees the same notes. A student sees topics for the level of the class
--     they are enrolled in (class_members -> classes.education_level /
--     level_number).
--   * Staff access comes from teacher_subjects (a teacher or reviewer per
--     subject) instead of space_members. Global admins can do everything.
--   * Promotion is just moving a student between classes. Last year's notes
--     stay on the old level for the next cohort.
--   * Student visibility follows school_app: earlier terms are fully visible,
--     the current term is visible up to the current week, future terms are
--     hidden. Staff are never gated. Nothing is gated until
--     settings.current_academic_year / current_term (and term_start_date for
--     the week cut-off) are set.
--
-- The migration refuses to run if any space that still holds topics lacks a
-- subject, level, year or term, because those notes would have nowhere to go.
-- Fill them in first (Admin > Spaces in the old UI, or SQL), then re-run.

begin;

-- ---------------------------------------------------------------------------
-- 0. Pre-flight
-- ---------------------------------------------------------------------------

do $$
declare
  bad_topics integer;
  bad_lessons integer;
begin
  select count(*) into bad_topics
  from spaces s
  where (s.subject_id is null or s.education_level is null or s.level_number is null
         or s.academic_year is null or s.term is null)
    and exists (select 1 from topics t where t.space_id = s.id);
  if bad_topics > 0 then
    raise exception
      '% space(s) with topics are missing subject, level, academic year or term. Complete them before running 0020, otherwise their notes cannot be moved.',
      bad_topics;
  end if;

  select count(*) into bad_lessons
  from timetable_entries e join spaces s on s.id = e.space_id
  where s.subject_id is null;
  if bad_lessons > 0 then
    raise exception
      '% timetable lesson(s) point at a space with no subject. Set the space''s subject (or clear those lessons) before running 0020.',
      bad_lessons;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0b. Drop the policies/view that read space columns first, so the columns
--     and tables below can go. Replacements are created in section 8.
-- ---------------------------------------------------------------------------

drop view if exists analytics_note_engagement;

drop policy if exists topics_member on topics;
drop policy if exists topics_write_staff on topics;
drop policy if exists notes_delete_staff on topic_notes;
drop policy if exists resources_visible on topic_resources;
drop policy if exists resources_write_staff on topic_resources;
drop policy if exists reads_visible_staff on topic_reads;
drop policy if exists share_links_staff on share_links;
drop policy if exists announcements_visible on announcements;
drop policy if exists announcements_write_staff on announcements;
drop policy if exists homework_visible on homework;
drop policy if exists homework_write_staff on homework;
drop policy if exists homework_submissions_own on homework_submissions;
drop policy if exists quizzes_visible on quizzes;
drop policy if exists quizzes_write_staff on quizzes;
drop policy if exists quiz_questions_visible on quiz_questions;
drop policy if exists quiz_options_visible on quiz_options;
drop policy if exists class_members_visible on class_members;
drop policy if exists timetable_entries_read on timetable_entries;
drop policy if exists settings_write_admin on settings;

-- ---------------------------------------------------------------------------
-- 1. Settings: current academic year + term (term_start_date exists from 0019)
-- ---------------------------------------------------------------------------

alter table settings
  add column current_academic_year text,
  add column current_term integer check (current_term between 1 and 3);

comment on column settings.current_academic_year is
  'e.g. 2026/2027. With current_term, decides which topics students can see. Null = not gated by year/term.';
comment on column settings.current_term is
  'Current term (1-3). Together with term_start_date, drives student note visibility.';

-- ---------------------------------------------------------------------------
-- 2. teacher_subjects replaces space_members for staff
-- ---------------------------------------------------------------------------

create table teacher_subjects (
  profile_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  role text not null default 'teacher' check (role in ('teacher', 'reviewer')),
  created_at timestamptz not null default now(),
  primary key (profile_id, subject_id)
);
create index teacher_subjects_subject_id_idx on teacher_subjects (subject_id);

-- Old space 'reviewer' and 'admin' both had reviewer powers (approve notes,
-- edit others' notes), so both become 'reviewer' here.
insert into teacher_subjects (profile_id, subject_id, role)
select m.profile_id,
       s.subject_id,
       case when bool_or(m.role in ('reviewer', 'admin')) then 'reviewer' else 'teacher' end
from space_members m
join spaces s on s.id = m.space_id
where s.subject_id is not null
  and m.role in ('teacher', 'reviewer', 'admin')
group by m.profile_id, s.subject_id
on conflict do nothing;

alter table teacher_subjects enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Topics carry the curriculum slot
-- ---------------------------------------------------------------------------

alter table topics
  add column subject_id uuid references subjects(id),
  add column education_level education_level,
  add column level_number integer,
  add column academic_year text,
  add column term integer check (term between 1 and 3);

update topics t
set subject_id = s.subject_id,
    education_level = s.education_level,
    level_number = s.level_number,
    academic_year = s.academic_year,
    term = s.term
from spaces s
where s.id = t.space_id;

alter table topics
  alter column subject_id set not null,
  alter column education_level set not null,
  alter column level_number set not null,
  alter column academic_year set not null,
  alter column term set not null;

create index topics_curriculum_idx
  on topics (subject_id, education_level, level_number, academic_year, term, week_number, sequence_order);

-- ---------------------------------------------------------------------------
-- 4. Timetable lessons point at a subject, not a space
-- ---------------------------------------------------------------------------

alter table timetable_entries add column subject_id uuid references subjects(id);

update timetable_entries e
set subject_id = s.subject_id
from spaces s
where s.id = e.space_id;

alter table timetable_entries alter column subject_id set not null;
create index timetable_entries_subject_id_idx on timetable_entries (subject_id);

-- Dropping the column also drops the composite FK to spaces(id, class_id)
-- and its index.
alter table timetable_entries drop column space_id;

-- ---------------------------------------------------------------------------
-- 5. Announcements: class or school-wide only
-- ---------------------------------------------------------------------------

-- A space-targeted announcement becomes a class-targeted one: the space's
-- class if it had one, else the single class at the space's level (if
-- exactly one exists). Anything still unresolved is removed.
update announcements a
set class_id = coalesce(
  s.class_id,
  (select case when count(*) = 1 then (array_agg(c.id))[1] end
   from classes c
   where c.education_level = s.education_level and c.level_number = s.level_number)
)
from spaces s
where a.space_id = s.id and a.class_id is null;

do $$
declare n integer;
begin
  select count(*) into n from announcements where space_id is not null and class_id is null;
  if n > 0 then
    raise notice '0020: removing % space-targeted announcement(s) that could not be mapped to a class.', n;
  end if;
end $$;

delete from announcements where space_id is not null and class_id is null;

-- ---------------------------------------------------------------------------
-- 6. Drop the space tables and their helper functions
-- ---------------------------------------------------------------------------

drop table schedule_slots;

alter table announcements drop column space_id;
alter table topics drop column space_id;

drop table space_members;
drop table spaces;
drop type space_role;

drop function if exists public.is_space_reader(uuid);
drop function if exists public.is_space_admin(uuid);
drop function if exists public.is_space_staff(uuid);
drop function if exists public.timetable_release_teacher();

-- ---------------------------------------------------------------------------
-- 7. Access helpers (SECURITY DEFINER so policies can call them without
--    recursing through RLS -- same reason 0005/0009 introduced them)
-- ---------------------------------------------------------------------------

create or replace function public.is_subject_staff(p_subject_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select is_admin() or exists (
    select 1
    from teacher_subjects ts
    join profiles p on p.id = ts.profile_id
    where ts.subject_id = p_subject_id
      and ts.profile_id = (select auth.uid())
      and p.is_active
  );
$$;

create or replace function public.is_subject_reviewer(p_subject_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select is_admin() or exists (
    select 1
    from teacher_subjects ts
    join profiles p on p.id = ts.profile_id
    where ts.subject_id = p_subject_id
      and ts.profile_id = (select auth.uid())
      and ts.role = 'reviewer'
      and p.is_active
  );
$$;

create or replace function public.is_topic_staff(p_topic_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from topics t where t.id = p_topic_id and is_subject_staff(t.subject_id)
  );
$$;

-- Same name as before (0001) so notes_update_reviewer keeps working.
create or replace function public.is_reviewer_of_topic(p_topic_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from topics t where t.id = p_topic_id and is_subject_reviewer(t.subject_id)
  );
$$;

create or replace function public.is_quiz_staff(p_quiz_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from quizzes q join topics t on t.id = q.topic_id
    where q.id = p_quiz_id and is_subject_staff(t.subject_id)
  );
$$;

-- Is the caller a student in a class at this level?
create or replace function public.student_at_level(p_level education_level, p_number integer)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from class_members cm
    join classes c on c.id = cm.class_id
    where cm.profile_id = (select auth.uid())
      and c.education_level = p_level
      and c.level_number = p_number
  );
$$;

-- Is the caller a parent of a student in a class at this level?
create or replace function public.parent_child_at_level(p_level education_level, p_number integer)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from class_members cm
    join classes c on c.id = cm.class_id
    where c.education_level = p_level
      and c.level_number = p_number
      and is_parent_of(cm.profile_id)
  );
$$;

-- Caller is enrolled in the class, or is the parent of someone who is.
create or replace function public.is_class_reader(p_class_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from class_members cm
    where cm.class_id = p_class_id
      and (cm.profile_id = (select auth.uid()) or is_parent_of(cm.profile_id))
  );
$$;

-- Caller is the timetabled teacher of at least one lesson for this class.
create or replace function public.teaches_class(p_class_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from timetable_entries e
    where e.class_id = p_class_id and e.teacher_id = (select auth.uid())
  );
$$;

-- school_app's term/week cut-off for students.
create or replace function public.topic_released_to_students(
  t_academic_year text, t_term integer, t_week_number integer
)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  cy text;
  ct integer;
  wk integer;
begin
  select s.current_academic_year, s.current_term into cy, ct from settings s where s.id;
  wk := current_school_week();

  -- Year/term not configured: fall back to the week gate alone (0019).
  if cy is null or ct is null then
    return t_week_number is null or wk is null or t_week_number <= wk;
  end if;

  -- Earlier term (or earlier year): fully visible.
  if t_academic_year < cy or (t_academic_year = cy and t_term < ct) then
    return true;
  end if;

  -- Current term: visible up to and including the current week.
  if t_academic_year = cy and t_term = ct then
    return t_week_number is null or wk is null or t_week_number <= wk;
  end if;

  -- A later term: not yet.
  return false;
end;
$$;

create or replace function public.is_topic_reader(p_topic_id uuid)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  t record;
begin
  if not exists (select 1 from profiles where id = (select auth.uid()) and is_active) then
    return false;
  end if;

  select subject_id, education_level, level_number, academic_year, term, week_number
  into t from topics where id = p_topic_id;
  if not found then
    return false;
  end if;

  if is_subject_staff(t.subject_id) then
    return true;
  end if;

  if not topic_released_to_students(t.academic_year, t.term, t.week_number) then
    return false;
  end if;

  return student_at_level(t.education_level, t.level_number)
      or parent_child_at_level(t.education_level, t.level_number);
end;
$$;

create or replace function public.topic_note_visible(p_note_id uuid)
returns boolean language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  n record;
begin
  select status, moderation_status, author_id, topic_id, release_at
  into n from topic_notes where id = p_note_id;
  if not found then
    return false;
  end if;

  if n.status = 'draft' then
    return n.author_id = auth.uid() or is_reviewer_of_topic(n.topic_id);
  end if;

  if n.author_id = auth.uid() or is_reviewer_of_topic(n.topic_id) then
    return true;
  end if;

  if n.moderation_status <> 'approved' then
    return false;
  end if;

  if n.release_at is not null and n.release_at > now() then
    return false;
  end if;

  return is_topic_reader(n.topic_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Policies on the new model
-- ---------------------------------------------------------------------------

create policy teacher_subjects_read on teacher_subjects for select to public
  using (profile_id = (select auth.uid()) or is_admin());
create policy teacher_subjects_write_admin on teacher_subjects for all to public
  using (is_admin()) with check (is_admin());

create policy topics_read on topics for select to public
  using (is_topic_reader(id));
create policy topics_write_staff on topics for all to public
  using (is_subject_staff(subject_id))
  with check (is_subject_staff(subject_id));

create policy notes_delete_staff on topic_notes for delete to public
  using (is_topic_staff(topic_id));

-- A resource with no note used to be visible to any signed-in user. It now
-- follows the topic, so future-week resources stay hidden from students too.
create policy resources_visible on topic_resources for select to public
  using (
    is_topic_staff(topic_id)
    or (note_id is null and is_topic_reader(topic_id))
    or (note_id is not null and topic_note_visible(note_id))
  );
create policy resources_write_staff on topic_resources for all to public
  using (is_topic_staff(topic_id))
  with check (is_topic_staff(topic_id));

create policy reads_visible_staff on topic_reads for select to public
  using (is_parent_of(student_id) or is_topic_staff(topic_id));

create policy share_links_staff on share_links for all to public
  using (is_topic_staff(topic_id))
  with check (is_topic_staff(topic_id));

create policy announcements_visible on announcements for select to public
  using (
    class_id is null
    or is_class_reader(class_id)
    or teaches_class(class_id)
    or is_admin()
  );
create policy announcements_write_staff on announcements for insert to public
  with check (
    is_admin()
    or (class_id is not null and teaches_class(class_id))
  );

create policy homework_visible on homework for select to public
  using (is_topic_reader(topic_id));
create policy homework_write_staff on homework for all to public
  using (is_topic_staff(topic_id))
  with check (is_topic_staff(topic_id));

create policy homework_submissions_own on homework_submissions for all to public
  using (
    student_id = (select auth.uid())
    or is_parent_of(student_id)
    or exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_staff(h.topic_id)
    )
  )
  with check (
    (student_id = (select auth.uid()) and exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_reader(h.topic_id)
    ))
    or exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_staff(h.topic_id)
    )
  );

create policy quizzes_visible on quizzes for select to public
  using (is_quiz_staff(id) or (published and is_topic_reader(topic_id)));
create policy quizzes_write_staff on quizzes for all to public
  using (is_quiz_staff(id) or created_by = (select auth.uid()))
  with check (is_topic_staff(topic_id));

create policy quiz_questions_visible on quiz_questions for select to public
  using (
    is_quiz_staff(quiz_id)
    or exists (
      select 1 from quizzes q
      where q.id = quiz_questions.quiz_id and q.published and is_topic_reader(q.topic_id)
    )
  );

create policy quiz_options_visible on quiz_options for select to public
  using (exists (
    select 1 from quiz_questions qq
    where qq.id = quiz_options.question_id
      and (
        is_quiz_staff(qq.quiz_id)
        or exists (
          select 1 from quizzes q
          where q.id = qq.quiz_id and q.published and is_topic_reader(q.topic_id)
        )
      )
  ));

-- A parent can now see their child's roster row too (needed by the digest).
create policy class_members_visible on class_members for select to public
  using (
    profile_id = (select auth.uid())
    or is_admin()
    or is_parent_of(profile_id)
    or teaches_class(class_id)
  );

create policy timetable_entries_read on timetable_entries for select to public
  using (
    exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.is_active)
    and (
      is_admin()
      or is_subject_staff(subject_id)
      or is_class_reader(class_id)
    )
  );

create policy settings_write_admin on settings for update to public
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- 9. Timetable guard / teacher release on the new model
-- ---------------------------------------------------------------------------

create or replace function public.timetable_entries_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from timetable_periods p
    where p.period_number = new.period_number and p.is_break
  ) then
    raise exception 'A lesson can''t be scheduled in a break period.' using errcode = 'check_violation';
  end if;

  if new.teacher_id is not null and not exists (
    select 1 from teacher_subjects ts
    where ts.subject_id = new.subject_id and ts.profile_id = new.teacher_id
  ) then
    raise exception 'The teacher must be assigned to this subject.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- If a teacher is unassigned from a subject, free their timetable cells for
-- it instead of leaving a stale teacher_id behind.
create or replace function public.timetable_release_teacher_subject()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  update timetable_entries
  set teacher_id = null
  where subject_id = old.subject_id and teacher_id = old.profile_id;
  return old;
end;
$$;

create trigger teacher_subjects_release_teacher_trg
  after delete on teacher_subjects
  for each row execute function public.timetable_release_teacher_subject();

-- ---------------------------------------------------------------------------
-- 10. Analytics view (was keyed on space_id)
-- ---------------------------------------------------------------------------

create view analytics_note_engagement as
select
  t.id as topic_id,
  t.subject_id,
  t.education_level,
  t.level_number,
  count(distinct r.student_id) as students_read,
  max(r.last_read_at) as last_read_at
from topics t
left join topic_reads r on r.topic_id = t.id
group by t.id, t.subject_id, t.education_level, t.level_number;

alter view analytics_note_engagement set (security_invoker = true);

commit;
