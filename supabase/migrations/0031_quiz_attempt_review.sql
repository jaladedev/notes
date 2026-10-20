-- 0031_quiz_attempt_review.sql
-- Keeps the answer key away from students, and gives them a proper review
-- once they have submitted. Follows school_app's model
-- (20260926170200_quiz_attempt_review): options are readable by quiz staff
-- only, and students go through RPCs.
--
-- THE PROBLEM THIS CLOSES: quiz_options holds the key -- is_correct for
-- multiple choice, the accepted answers for fill-in-the-blank, and
-- match_text for matching -- and quiz_options_visible let any student who
-- can see the quiz SELECT every row. Hiding the columns in the page's query
-- changed nothing: anyone with the public API key could read the key
-- straight from the table.
--
-- Two deliberate differences from school_app, whose in-progress RPC returns
-- each matching pair's left AND right term on one row (so the pairing is in
-- the network response) and returns fill-in-the-blank accepted answers as
-- options:
--   * matching: left terms come back as options; right terms come back as a
--     separate list with no link to a left term and no ordering that
--     follows the pairs.
--   * fill_blank / essay: no options at all.

-- ---------- 1. students can no longer read quiz_options ----------
-- quiz_options_write_staff (FOR ALL, quiz staff) stays and still covers
-- staff SELECT, so the teacher pages are unaffected.
drop policy if exists quiz_options_visible on quiz_options;

-- ---------- 2. in progress: questions + saved answers, never the key ----------
create or replace function public.get_quiz_attempt_questions(p_attempt_id uuid)
returns table(
  question_id uuid,
  question_type text,
  prompt text,
  points numeric,
  sequence_order integer,
  options jsonb,        -- [{id,label}] for single_choice and matching (left terms)
  choices jsonb,        -- matching only: right-hand terms, unpaired and sorted
  option_id uuid,       -- the student's saved single-choice answer
  text_answer text,
  matching_answer jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz uuid;
  v_student uuid;
begin
  select a.quiz_id, a.student_id into v_quiz, v_student
  from quiz_attempts a where a.id = p_attempt_id;
  if v_quiz is null or v_student <> auth.uid() then
    raise exception 'Attempt not found.';
  end if;

  return query
  select
    qq.id,
    qq.question_type,
    qq.prompt,
    qq.points,
    qq.sequence_order,
    case when qq.question_type in ('single_choice', 'matching') then
      coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.sequence_order)
        from quiz_options o where o.question_id = qq.id
      ), '[]'::jsonb)
    else '[]'::jsonb end,
    case when qq.question_type = 'matching' then
      coalesce((
        -- sorted by the text itself, so the order says nothing about which
        -- left term each one belongs to
        select jsonb_agg(t order by t)
        from (select distinct o.match_text as t from quiz_options o where o.question_id = qq.id) d
      ), '[]'::jsonb)
    else '[]'::jsonb end,
    qa.option_id,
    qa.text_answer,
    qa.matching_answer
  from quiz_questions qq
  left join quiz_answers qa on qa.attempt_id = p_attempt_id and qa.question_id = qq.id
  where qq.quiz_id = v_quiz
  order by qq.sequence_order;
end;
$$;

-- ---------- 3. after submit: the same plus the key and the marks ----------
-- Same viewer set as quiz_attempts_select: the student, a parent, an admin,
-- or staff for the quiz's subject -- so a teacher reviewing a submission
-- sees what the student sees, answers included. Refuses until the attempt
-- is submitted.
create or replace function public.get_quiz_attempt_review(p_attempt_id uuid)
returns table(
  question_id uuid,
  question_type text,
  prompt text,
  points numeric,
  sequence_order integer,
  options jsonb,        -- [{id,label,is_correct,match_text}]
  option_id uuid,       -- the student's single-choice answer
  text_answer text,
  matching_answer jsonb,
  points_awarded numeric,
  feedback text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz uuid;
  v_student uuid;
  v_submitted timestamptz;
begin
  select a.quiz_id, a.student_id, a.submitted_at into v_quiz, v_student, v_submitted
  from quiz_attempts a where a.id = p_attempt_id;
  if v_quiz is null then
    raise exception 'Attempt not found.';
  end if;
  if v_submitted is null then
    raise exception 'This attempt has not been submitted yet.';
  end if;
  if not (
    v_student = auth.uid()
    or is_parent_of(v_student)
    or is_admin()
    or is_quiz_staff(v_quiz)
  ) then
    raise exception 'Not authorized to review this attempt.';
  end if;

  return query
  select
    qq.id,
    qq.question_type,
    qq.prompt,
    qq.points,
    qq.sequence_order,
    coalesce((
      select jsonb_agg(
               jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct, 'match_text', o.match_text)
               order by o.sequence_order)
      from quiz_options o where o.question_id = qq.id
    ), '[]'::jsonb),
    qa.option_id,
    qa.text_answer,
    qa.matching_answer,
    qa.points_awarded,
    qa.feedback
  from quiz_questions qq
  left join quiz_answers qa on qa.attempt_id = p_attempt_id and qa.question_id = qq.id
  where qq.quiz_id = v_quiz
  order by qq.sequence_order;
end;
$$;

revoke all on function public.get_quiz_attempt_questions(uuid) from public, anon;
revoke all on function public.get_quiz_attempt_review(uuid) from public, anon;
grant execute on function public.get_quiz_attempt_questions(uuid) to authenticated;
grant execute on function public.get_quiz_attempt_review(uuid) to authenticated;
