-- 0026_quiz_scheduling.sql
-- Open/close windows. Until now a published quiz was open forever (the
-- only limit was an unenforced time_limit_seconds). Both columns are
-- optional: null opens_at = open as soon as published, null closes_at =
-- never closes. Enforced here in the database, not just hidden in the UI.

alter table quizzes
  add column opens_at timestamptz,
  add column closes_at timestamptz,
  add constraint quizzes_window_order check (
    opens_at is null or closes_at is null or closes_at > opens_at
  );

-- 'upcoming' | 'open' | 'closed'. `p_grace` lets an in-flight answer
-- save/submit land just after closes_at (clock skew, slow network)
-- without letting anyone start a new attempt.
create or replace function public.quiz_window_state(p_quiz_id uuid, p_grace interval default interval '0')
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when q.opens_at is not null and now() < q.opens_at then 'upcoming'
    when q.closes_at is not null and now() > q.closes_at + p_grace then 'closed'
    else 'open'
  end
  from quizzes q where q.id = p_quiz_id;
$$;

-- Starting an attempt is only possible inside the window (staff previewing
-- their own quiz are exempt).
create or replace function public.quiz_attempts_window_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
begin
  if is_quiz_staff(new.quiz_id) then
    return new;
  end if;
  v_state := quiz_window_state(new.quiz_id);
  if v_state = 'upcoming' then
    raise exception 'This quiz has not opened yet.';
  elsif v_state = 'closed' then
    raise exception 'This quiz is closed.';
  end if;
  return new;
end;
$$;

create trigger quiz_attempts_window_guard
  before insert on quiz_attempts
  for each row execute function quiz_attempts_window_guard();

-- Submitting is allowed up to 60s past closes_at; after that the attempt
-- stays unsubmitted and the student can no longer complete it.
create or replace function public.quiz_attempts_submit_window_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.submitted_at is null and new.submitted_at is not null
     and quiz_window_state(new.quiz_id, interval '60 seconds') = 'closed' then
    raise exception 'This quiz is closed.';
  end if;
  return new;
end;
$$;

create trigger quiz_attempts_submit_window_guard
  before update on quiz_attempts
  for each row execute function quiz_attempts_submit_window_guard();
