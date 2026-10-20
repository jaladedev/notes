-- 0030_replace_quiz_questions.sql
-- Edit a quiz's questions after creation. Replaces the whole question set
-- atomically (delete + re-insert in one transaction) and can update the
-- quiz's own settings in the same call.
--
-- Refused once anyone has started an attempt: quiz_answers cascade-delete
-- with their questions, so replacing questions under a live attempt would
-- silently erase student work or re-score it against different questions.
-- Unpublish and duplicate the quiz instead.

create or replace function public.replace_quiz_questions(
  p_quiz_id uuid,
  p_title text,
  p_time_limit_seconds integer,
  p_questions jsonb,
  p_opens_at timestamptz default null,
  p_closes_at timestamptz default null,
  p_shuffle_questions boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not is_quiz_staff(p_quiz_id) then
    raise exception 'Not allowed to edit this quiz.';
  end if;
  if exists (select 1 from quiz_attempts where quiz_id = p_quiz_id) then
    raise exception 'Students have already started this quiz, so its questions can no longer be edited.';
  end if;
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'A quiz needs a title.';
  end if;

  update quizzes
    set title = btrim(p_title),
        time_limit_seconds = p_time_limit_seconds,
        opens_at = p_opens_at,
        closes_at = p_closes_at,
        shuffle_questions = coalesce(p_shuffle_questions, false)
    where id = p_quiz_id;

  delete from quiz_questions where quiz_id = p_quiz_id;
  perform quiz_insert_questions(p_quiz_id, p_questions);
end;
$$;
