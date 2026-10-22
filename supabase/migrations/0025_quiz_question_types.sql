-- 0025_quiz_question_types.sql
-- Quizzes were single-choice only (one option_id per answer). Add three
-- more question types and teach server-side scoring about all four.
--
--   single_choice  quiz_options: label + is_correct (exactly one correct)
--   fill_blank     quiz_options: each row is an ACCEPTED answer (is_correct
--                  = true, label = the text). Compared after trimming,
--                  collapsing whitespace and lower-casing.
--   matching       quiz_options: label = the left-hand term, match_text =
--                  its correct right-hand term. The student's answer is a
--                  jsonb map { "<option_id>": "<chosen right-hand text>" }.
--                  All-or-nothing: every pair must match to earn the points
--                  (same rule as school_app).
--   essay          no options. Free text, graded by hand (see 0027). A
--                  blank essay is scored 0 on submit; a written one stays
--                  pending (points_awarded is null) until a teacher grades it.

alter table quiz_questions
  add column question_type text not null default 'single_choice'
    check (question_type in ('single_choice', 'fill_blank', 'matching', 'essay'));

alter table quiz_options
  add column match_text text;

alter table quiz_answers
  add column text_answer text,
  add column matching_answer jsonb,
  add column points_awarded numeric,
  add column feedback text,
  add column graded_by uuid references profiles(id),
  add column graded_at timestamptz;

alter table quiz_attempts
  add column needs_grading boolean not null default false,
  add column graded_at timestamptz;

-- Normalises free text for comparison: trim, collapse runs of whitespace,
-- lower-case. IMMUTABLE so it is cheap to call per row.
create or replace function public.quiz_normalize_text(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g'));
$$;

-- Same contract as before (server-side only, never trust a client score),
-- now per-question and type-aware. Each answer row gets its own
-- points_awarded; the attempt's score is the sum of the awarded ones, and
-- needs_grading is true while any written essay is still ungraded.
drop function if exists public.submit_quiz_attempt(uuid);

create function public.submit_quiz_attempt(p_attempt_id uuid)
returns table(score numeric, total_points numeric, needs_grading boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid;
  v_quiz uuid;
  v_already_submitted timestamptz;
  v_score numeric;
  v_total numeric;
  v_pending boolean;
begin
  select student_id, quiz_id, submitted_at into v_student, v_quiz, v_already_submitted
  from quiz_attempts where id = p_attempt_id;

  if v_student is null then
    raise exception 'Attempt not found';
  end if;
  if v_student <> auth.uid() then
    raise exception 'Not your attempt';
  end if;
  if v_already_submitted is not null then
    raise exception 'Attempt already submitted';
  end if;

  -- Lets the quiz_answers guard trigger (0027) know the next write is the
  -- scorer, not a student trying to award themselves points. It is turned
  -- off again immediately after the scoring UPDATE below: set_config(...,
  -- true) lasts for the whole transaction, so leaving it on would exempt
  -- every later write in the same transaction from the guard.
  perform set_config('app.quiz_scoring', '1', true);

  -- Auto-scored types.
  update quiz_answers qa
  set points_awarded = case qq.question_type
    when 'single_choice' then
      case when exists (
        select 1 from quiz_options qo
        where qo.id = qa.option_id and qo.question_id = qq.id and qo.is_correct
      ) then qq.points else 0 end
    when 'fill_blank' then
      case when exists (
        select 1 from quiz_options qo
        where qo.question_id = qq.id and qo.is_correct
          and quiz_normalize_text(qo.label) = quiz_normalize_text(qa.text_answer)
          and quiz_normalize_text(qa.text_answer) <> ''
      ) then qq.points else 0 end
    when 'matching' then
      case when coalesce((
        select bool_and(
                 quiz_normalize_text(qa.matching_answer ->> qo.id::text)
                 = quiz_normalize_text(qo.match_text)
               )
        from quiz_options qo where qo.question_id = qq.id
      ), false) then qq.points else 0 end
    when 'essay' then
      case when quiz_normalize_text(qa.text_answer) = '' then 0 else null end
  end
  from quiz_questions qq
  where qa.attempt_id = p_attempt_id
    and qq.id = qa.question_id
    and qq.quiz_id = v_quiz;

  perform set_config('app.quiz_scoring', '0', true);

  select coalesce(sum(qq.points), 0) into v_total
  from quiz_questions qq where qq.quiz_id = v_quiz;

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
    set submitted_at = now(),
        score = v_score,
        total_points = v_total,
        needs_grading = v_pending,
        graded_at = case when v_pending then null else now() end
    where id = p_attempt_id;

  return query select v_score, v_total, v_pending;
end;
$$;

-- Backfill: attempts submitted before this migration were scored by the old
-- function, which stored only the attempt total. Give their answers a
-- per-question points_awarded (all were single-choice) so the review page
-- shows real marks instead of 0 for everything. Idempotent, and a no-op on
-- a database with no earlier attempts.
update quiz_answers qa
set points_awarded = case
      when exists (
        select 1 from quiz_options qo
        where qo.id = qa.option_id and qo.question_id = qa.question_id and qo.is_correct
      ) then qq.points else 0 end
from quiz_questions qq, quiz_attempts a
where qq.id = qa.question_id
  and a.id = qa.attempt_id
  and a.submitted_at is not null
  and qa.points_awarded is null;