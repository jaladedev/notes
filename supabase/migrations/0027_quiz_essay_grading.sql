-- 0027_quiz_essay_grading.sql
-- Teacher grading of essay answers, plus the guard rails that make
-- storing grades on quiz_answers safe.
--
-- Why guards: quiz_answers_own lets a student upsert their own answer
-- rows, and 0025 put grading columns (points_awarded, feedback, graded_*)
-- on those same rows. Without the triggers below a student could award
-- themselves full marks, or keep editing answers after submitting.

-- ---------- bounds check ----------
create or replace function public.quiz_answers_bounds_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max numeric;
begin
  if new.points_awarded is null then
    return new;
  end if;
  select points into v_max from quiz_questions where id = new.question_id;
  if new.points_awarded < 0 or new.points_awarded > v_max then
    raise exception 'Points must be between 0 and % for this question.', v_max;
  end if;
  return new;
end;
$$;

create trigger quiz_answers_bounds_check
  before insert or update on quiz_answers
  for each row execute function quiz_answers_bounds_check();

-- ---------- student write guard ----------
-- Staff (grading) and the scorer (submit_quiz_attempt, which sets
-- app.quiz_scoring for its own transaction) may write grading columns.
-- Everyone else may only write their answer, only while the attempt is
-- open, and any grading columns they send are discarded.
create or replace function public.quiz_answers_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz uuid;
  v_submitted timestamptz;
begin
  if current_setting('app.quiz_scoring', true) = '1' then
    return new;
  end if;

  select a.quiz_id, a.submitted_at into v_quiz, v_submitted
  from quiz_attempts a where a.id = new.attempt_id;

  if is_quiz_staff(v_quiz) then
    return new;
  end if;

  if v_submitted is not null then
    raise exception 'Attempt already submitted';
  end if;
  if quiz_window_state(v_quiz, interval '60 seconds') = 'closed' then
    raise exception 'This quiz is closed.';
  end if;

  if tg_op = 'INSERT' then
    new.points_awarded := null;
    new.feedback := null;
    new.graded_by := null;
    new.graded_at := null;
  else
    new.points_awarded := old.points_awarded;
    new.feedback := old.feedback;
    new.graded_by := old.graded_by;
    new.graded_at := old.graded_at;
  end if;
  return new;
end;
$$;

create trigger quiz_answers_write_guard
  before insert or update on quiz_answers
  for each row execute function quiz_answers_write_guard();

-- ---------- RLS ----------
-- quiz_answers_own is FOR ALL with a student-only WITH CHECK, so staff
-- UPDATEs were being rejected. Give quiz staff an explicit UPDATE policy.
create policy quiz_answers_grading_rls on quiz_answers for update to public
  using (exists (
    select 1 from quiz_attempts a
    where a.id = quiz_answers.attempt_id and is_quiz_staff(a.quiz_id)
  ))
  with check (exists (
    select 1 from quiz_attempts a
    where a.id = quiz_answers.attempt_id and is_quiz_staff(a.quiz_id)
  ));

-- ---------- grading RPC ----------
-- One call grades one essay answer and recomputes the attempt's score,
-- so the two can never drift apart.
create or replace function public.grade_essay_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_points numeric,
  p_feedback text default null
)
returns table(score numeric, total_points numeric, needs_grading boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz uuid;
  v_submitted timestamptz;
  v_type text;
  v_max numeric;
  v_score numeric;
  v_pending boolean;
begin
  select a.quiz_id, a.submitted_at into v_quiz, v_submitted
  from quiz_attempts a where a.id = p_attempt_id;
  if v_quiz is null then
    raise exception 'Attempt not found';
  end if;
  if not is_quiz_staff(v_quiz) then
    raise exception 'Not allowed to grade this quiz';
  end if;
  if v_submitted is null then
    raise exception 'This attempt has not been submitted yet';
  end if;

  select qq.question_type, qq.points into v_type, v_max
  from quiz_questions qq where qq.id = p_question_id and qq.quiz_id = v_quiz;
  if v_type is distinct from 'essay' then
    raise exception 'Only essay questions are graded by hand';
  end if;
  if p_points is null or p_points < 0 or p_points > v_max then
    raise exception 'Points must be between 0 and %.', v_max;
  end if;

  update quiz_answers
    set points_awarded = p_points,
        feedback = nullif(btrim(coalesce(p_feedback, '')), ''),
        graded_by = auth.uid(),
        graded_at = now()
    where attempt_id = p_attempt_id and question_id = p_question_id;
  if not found then
    raise exception 'No answer to grade for that question';
  end if;

  select coalesce(sum(qa.points_awarded), 0) into v_score
  from quiz_answers qa where qa.attempt_id = p_attempt_id;

  select exists (
    select 1 from quiz_answers qa
    join quiz_questions qq on qq.id = qa.question_id
    where qa.attempt_id = p_attempt_id
      and qq.question_type = 'essay'
      and qa.points_awarded is null
  ) into v_pending;

  update quiz_attempts
    set score = v_score,
        needs_grading = v_pending,
        graded_at = case when v_pending then null else now() end
    where id = p_attempt_id;

  return query
    select v_score, (select coalesce(sum(qq.points), 0) from quiz_questions qq where qq.quiz_id = v_quiz), v_pending;
end;
$$;
