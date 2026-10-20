-- 0029_create_quiz_with_questions.sql
-- createQuizWithQuestions used to insert the quiz, then each question,
-- then each question's options as separate requests: a failure part-way
-- left a half-built quiz behind. This does it in one transaction.
--
-- Question JSON shape (camelCase, same as lib/quizValidation.ts):
--   [{ "type": "single_choice|fill_blank|matching|essay",
--      "prompt": "...", "points": 1,
--      "options": [{ "label": "...", "isCorrect": true, "matchText": "..." }] }]
-- Validation here mirrors lib/quizValidation.ts as a database-level safety
-- net; the app validates first for friendly messages.

create or replace function public.quiz_insert_questions(p_quiz_id uuid, p_questions jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  q jsonb;
  o jsonb;
  v_qid uuid;
  v_type text;
  v_points numeric;
  v_qi int := 0;
  v_oi int;
  v_opts jsonb;
  v_correct int;
  v_n int;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'A quiz needs at least one question.';
  end if;

  for q in select * from jsonb_array_elements(p_questions) loop
    v_qi := v_qi + 1;
    v_type := coalesce(q ->> 'type', 'single_choice');
    v_points := coalesce((q ->> 'points')::numeric, 1);
    v_opts := coalesce(q -> 'options', '[]'::jsonb);
    v_n := jsonb_array_length(v_opts);

    if btrim(coalesce(q ->> 'prompt', '')) = '' then
      raise exception 'Question % needs a prompt.', v_qi;
    end if;
    if v_points <= 0 then
      raise exception 'Question % must be worth more than 0 points.', v_qi;
    end if;
    if v_type not in ('single_choice', 'fill_blank', 'matching', 'essay') then
      raise exception 'Question % has an unknown type.', v_qi;
    end if;

    if v_type = 'single_choice' then
      select count(*) filter (where (e ->> 'isCorrect')::boolean) into v_correct from jsonb_array_elements(v_opts) e;
      if v_n < 2 then raise exception 'Question % needs at least 2 options.', v_qi; end if;
      if v_correct <> 1 then raise exception 'Question % needs exactly one correct option.', v_qi; end if;
    elsif v_type = 'fill_blank' then
      if v_n < 1 then raise exception 'Question % needs at least one accepted answer.', v_qi; end if;
    elsif v_type = 'matching' then
      if v_n < 2 then raise exception 'Question % needs at least 2 pairs.', v_qi; end if;
      if exists (
        select 1 from jsonb_array_elements(v_opts) e
        where btrim(coalesce(e ->> 'label', '')) = '' or btrim(coalesce(e ->> 'matchText', '')) = ''
      ) then
        raise exception 'Every pair in question % needs both sides filled in.', v_qi;
      end if;
    elsif v_type = 'essay' then
      v_opts := '[]'::jsonb;
    end if;

    if v_type in ('single_choice', 'fill_blank') and exists (
      select 1 from jsonb_array_elements(v_opts) e where btrim(coalesce(e ->> 'label', '')) = ''
    ) then
      raise exception 'Every option in question % needs text.', v_qi;
    end if;

    insert into quiz_questions (quiz_id, prompt, points, sequence_order, question_type)
    values (p_quiz_id, btrim(q ->> 'prompt'), v_points, v_qi - 1, v_type)
    returning id into v_qid;

    v_oi := 0;
    for o in select * from jsonb_array_elements(v_opts) loop
      insert into quiz_options (question_id, label, is_correct, sequence_order, match_text)
      values (
        v_qid,
        btrim(o ->> 'label'),
        case v_type
          when 'single_choice' then coalesce((o ->> 'isCorrect')::boolean, false)
          when 'fill_blank' then true
          when 'matching' then true
        end,
        v_oi,
        case when v_type = 'matching' then btrim(o ->> 'matchText') end
      );
      v_oi := v_oi + 1;
    end loop;
  end loop;
end;
$$;

create or replace function public.create_quiz_with_questions(
  p_topic_id uuid,
  p_title text,
  p_time_limit_seconds integer,
  p_questions jsonb,
  p_opens_at timestamptz default null,
  p_closes_at timestamptz default null,
  p_shuffle_questions boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
  v_quiz uuid;
begin
  select subject_id into v_subject from topics where id = p_topic_id;
  if v_subject is null then
    raise exception 'Topic not found.';
  end if;
  if not is_subject_staff(v_subject) then
    raise exception 'Not allowed to create quizzes for this subject.';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A quiz needs a title.';
  end if;

  -- security invoker: every insert below runs under the caller's RLS, so a
  -- user who is not staff of the quiz's subject cannot slip rows in.
  insert into quizzes (topic_id, title, time_limit_seconds, created_by, opens_at, closes_at, shuffle_questions)
  values (p_topic_id, btrim(p_title), p_time_limit_seconds, auth.uid(), p_opens_at, p_closes_at, coalesce(p_shuffle_questions, false))
  returning id into v_quiz;

  perform quiz_insert_questions(v_quiz, p_questions);
  return v_quiz;
end;
$$;
