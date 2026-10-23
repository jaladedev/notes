-- 0042_gate_security_definer_rpcs.sql
-- Close the gap 0040 documented: SECURITY DEFINER functions bypass table RLS,
-- so the restrictive `subscription_gate` policy never applied to them. A lapsed
-- user could still call the five student-facing RPCs directly through PostgREST.
--
-- Each function below is redefined unchanged (bodies copied from 0031 / the
-- live database) with ONE added guard at the top:
--   subscription_allows_access()  -- same predicate the RLS gate uses
-- so the rule stays in one place: off with no subscription rows, allowed when
-- active/grace, closed when expired/upcoming, and open if status is unknown.
--
-- CREATE OR REPLACE keeps existing grants. Safe to re-run.
--
-- STILL NOT COVERED: Supabase Storage object policies (see TODO.md).

-- 1. get_quiz_attempt_questions ------------------------------------------------
create or replace function public.get_quiz_attempt_questions(p_attempt_id uuid)
returns table(question_id uuid, question_type text, prompt text, points numeric, sequence_order integer, options jsonb, choices jsonb, option_id uuid, text_answer text, matching_answer jsonb)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_quiz uuid;
  v_student uuid;
begin
  if not public.subscription_allows_access() then
    raise exception 'Your school''s subscription is not active.' using errcode = '42501';
  end if;

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
$function$;

-- 2. get_quiz_attempt_review ---------------------------------------------------
create or replace function public.get_quiz_attempt_review(p_attempt_id uuid)
returns table(question_id uuid, question_type text, prompt text, points numeric, sequence_order integer, options jsonb, option_id uuid, text_answer text, matching_answer jsonb, points_awarded numeric, feedback text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_quiz uuid;
  v_student uuid;
  v_submitted timestamptz;
begin
  if not public.subscription_allows_access() then
    raise exception 'Your school''s subscription is not active.' using errcode = '42501';
  end if;

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
$function$;

-- 3. grade_essay_answer --------------------------------------------------------
create or replace function public.grade_essay_answer(p_attempt_id uuid, p_question_id uuid, p_points numeric, p_feedback text default null::text)
returns table(score numeric, total_points numeric, needs_grading boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_quiz uuid;
  v_submitted timestamptz;
  v_type text;
  v_max numeric;
  v_score numeric;
  v_pending boolean;
begin
  if not public.subscription_allows_access() then
    raise exception 'Your school''s subscription is not active.' using errcode = '42501';
  end if;

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
$function$;

-- 4. parent_children (plain SQL: the predicate goes in the WHERE) -------------
create or replace function public.parent_children()
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p.id, p.full_name
  from guardian_links g
  join profiles p on p.id = g.student_id
  where g.parent_id = auth.uid()
    and public.subscription_allows_access()
  order by p.full_name;
$function$;

-- 5. submit_quiz_attempt -------------------------------------------------------
create or replace function public.submit_quiz_attempt(p_attempt_id uuid)
returns table(score numeric, total_points numeric, needs_grading boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_student uuid;
  v_quiz uuid;
  v_already_submitted timestamptz;
  v_score numeric;
  v_total numeric;
  v_pending boolean;
begin
  if not public.subscription_allows_access() then
    raise exception 'Your school''s subscription is not active.' using errcode = '42501';
  end if;

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

  perform set_config('app.quiz_scoring', '1', true);

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
$function$;
