-- Homework submissions and grades are final.
--
-- Until now homework_submissions_own was a single FOR ALL policy, so a
-- student could update or delete their own row straight through the API
-- (including the grade columns), and staff could rewrite a grade at will.
-- The server actions now refuse that, but only the database can make it
-- hold for every caller.
--
--   students  : SELECT own, INSERT own (ungraded). No UPDATE, no DELETE.
--   staff     : SELECT, and UPDATE only while the row has no graded_at;
--               that update must set graded_at and graded_by = themselves.
--   parents   : SELECT only (unchanged).
--
-- Deleting a homework still removes its submissions: foreign-key
-- cascades don't go through RLS.

drop policy if exists homework_submissions_own on public.homework_submissions;

create policy homework_submissions_select on public.homework_submissions
  for select to public
  using (
    student_id = (select auth.uid())
    or is_parent_of(student_id)
    or exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_staff(h.topic_id)
    )
  );

create policy homework_submissions_insert_own on public.homework_submissions
  for insert to public
  with check (
    student_id = (select auth.uid())
    and grade is null and feedback is null and graded_at is null and graded_by is null
    and exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_reader(h.topic_id)
    )
  );

create policy homework_submissions_grade_staff on public.homework_submissions
  for update to public
  using (
    graded_at is null
    and exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_staff(h.topic_id)
    )
  )
  with check (
    graded_at is not null
    and graded_by = (select auth.uid())
    and exists (
      select 1 from homework h
      where h.id = homework_submissions.homework_id and is_topic_staff(h.topic_id)
    )
  );

-- Grading may only touch the grade columns: a staff UPDATE must not be
-- able to rewrite what the student handed in or move it to someone else.
create or replace function public.homework_submissions_lock_work()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.homework_id is distinct from old.homework_id
     or new.student_id is distinct from old.student_id
     or new.content is distinct from old.content
     or new.file_url is distinct from old.file_url
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'A submitted homework answer cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists homework_submissions_lock_work on public.homework_submissions;
create trigger homework_submissions_lock_work
  before update on public.homework_submissions
  for each row execute function public.homework_submissions_lock_work();
