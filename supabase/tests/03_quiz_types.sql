-- Behavioural test for migrations 0025-0031 (quiz question types,
-- scheduling, essay grading, atomic create/replace). Self-contained: it
-- seeds its own rows, so it does not depend on 01_seed.sql. Run after the
-- migrations and the grants step in README.md:
--
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/03_quiz_types.sql
--
-- A clean run ends with "QUIZ TYPES: ALL ASSERTIONS PASSED".

-- ---------- seed (superuser) ----------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'qt-teacher@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'qt-student@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'qt-outsider@test.local');
-- 0006 dropped the auto-profile trigger (admins create accounts), so the
-- profile rows are inserted explicitly, as the app does.
insert into profiles (id, full_name, role, email, must_change_password) values
  ('a0000000-0000-0000-0000-000000000001', 'QT Teacher', 'teacher', 'qt-teacher@test.local', false),
  ('a0000000-0000-0000-0000-000000000002', 'QT Student', 'student', 'qt-student@test.local', false),
  ('a0000000-0000-0000-0000-000000000003', 'QT Outsider', 'student', 'qt-outsider@test.local', false);

insert into subjects (id, name) values ('b0000000-0000-0000-0000-000000000001', 'QT Biology');
insert into teacher_subjects (profile_id, subject_id) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');

insert into classes (id, name, education_level, level_number)
  values ('c0000000-0000-0000-0000-000000000001', 'QT JSS1', 'jss', 1);
insert into class_members (class_id, profile_id)
  values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');

insert into settings (id, current_academic_year, current_term, term_start_date)
  values (true, '2026/2027', 1, current_date - 70)
  on conflict (id) do update
  set current_academic_year = excluded.current_academic_year,
      current_term = excluded.current_term,
      term_start_date = excluded.term_start_date;

insert into topics (id, title, subject_id, education_level, level_number, academic_year, term)
  values ('d0000000-0000-0000-0000-000000000001', 'QT Photosynthesis',
          'b0000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 1);

-- ---------- 1. atomic create, all four types ----------
do $$
declare
  v_quiz uuid;
  v_n int;
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  v_quiz := create_quiz_with_questions(
    'd0000000-0000-0000-0000-000000000001', 'Mixed quiz', null,
    '[
      {"type":"single_choice","prompt":"Pick one","points":2,"options":[
        {"label":"Right","isCorrect":true},{"label":"Wrong","isCorrect":false}]},
      {"type":"fill_blank","prompt":"Plants make ___","points":2,"options":[
        {"label":"photosynthesis"},{"label":"food by light"}]},
      {"type":"matching","prompt":"Match","points":3,"options":[
        {"label":"Leaf","matchText":"Photosynthesis"},
        {"label":"Root","matchText":"Absorption"},
        {"label":"Stem","matchText":"Support"}]},
      {"type":"essay","prompt":"Explain","points":4}
    ]'::jsonb);

  select count(*) into v_n from quiz_questions where quiz_id = v_quiz;
  if v_n <> 4 then raise exception 'FAIL: expected 4 questions, got %', v_n; end if;
  select count(*) into v_n from quiz_options o join quiz_questions q on q.id = o.question_id
    where q.quiz_id = v_quiz and q.question_type = 'essay';
  if v_n <> 0 then raise exception 'FAIL: essay should have no options'; end if;

  reset role;
  perform set_config('app.test_quiz', v_quiz::text, false);
  update quizzes set published = true where id = v_quiz;
  raise notice 'ok 1: create_quiz_with_questions builds all four types';
end $$;

-- ---------- 2. atomicity + validation + authorization ----------
do $$
declare
  v_before int;
  v_after int;
  v_failed boolean;
begin
  select count(*) into v_before from quizzes;

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  v_failed := false;
  begin
    perform create_quiz_with_questions('d0000000-0000-0000-0000-000000000001', 'Broken', null,
      '[{"type":"single_choice","prompt":"ok","options":[
          {"label":"a","isCorrect":true},{"label":"b","isCorrect":true}]}]'::jsonb);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: two correct options should be rejected'; end if;

  reset role;
  select count(*) into v_after from quizzes;
  if v_after <> v_before then
    raise exception 'FAIL: failed create left a partial quiz behind (% -> %)', v_before, v_after;
  end if;

  -- a student (not subject staff) cannot create quizzes
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform create_quiz_with_questions('d0000000-0000-0000-0000-000000000001', 'Sneaky', null,
      '[{"type":"essay","prompt":"x"}]'::jsonb);
  exception when others then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: student was allowed to create a quiz'; end if;
  raise notice 'ok 2: invalid payload is atomic; non-staff cannot create';
end $$;

-- ---------- 3. scheduling window ----------
do $$
declare
  v_quiz uuid;
  v_failed boolean;
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  v_quiz := create_quiz_with_questions('d0000000-0000-0000-0000-000000000001', 'Scheduled', null,
    '[{"type":"essay","prompt":"x"}]'::jsonb, now() + interval '1 day', now() + interval '2 days');
  update quizzes set published = true where id = v_quiz;
  reset role;

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_failed := false;
  begin
    insert into quiz_attempts (quiz_id, student_id) values (v_quiz, 'a0000000-0000-0000-0000-000000000002');
  exception when others then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: attempt started before opens_at'; end if;

  update quizzes set opens_at = now() - interval '2 days', closes_at = now() - interval '1 day' where id = v_quiz;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_failed := false;
  begin
    insert into quiz_attempts (quiz_id, student_id) values (v_quiz, 'a0000000-0000-0000-0000-000000000002');
  exception when others then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: attempt started after closes_at'; end if;

  v_failed := false;
  begin
    update quizzes set opens_at = now() + interval '2 days', closes_at = now() + interval '1 day' where id = v_quiz;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: closes_at before opens_at accepted'; end if;
  raise notice 'ok 3: attempts blocked outside the window; window order enforced';
end $$;

-- ---------- 4. take, auto-score, guard against self-grading ----------
do $$
declare
  v_quiz uuid := current_setting('app.test_quiz')::uuid;
  v_attempt uuid;
  q_single uuid; q_fill uuid; q_match uuid; q_essay uuid;
  o_right uuid; o_leaf uuid; o_root uuid; o_stem uuid;
  v_score numeric; v_total numeric; v_pending boolean;
  v_points numeric;
  v_failed boolean;
begin
  select id into q_single from quiz_questions where quiz_id = v_quiz and question_type = 'single_choice';
  select id into q_fill   from quiz_questions where quiz_id = v_quiz and question_type = 'fill_blank';
  select id into q_match  from quiz_questions where quiz_id = v_quiz and question_type = 'matching';
  select id into q_essay  from quiz_questions where quiz_id = v_quiz and question_type = 'essay';
  select id into o_right from quiz_options where question_id = q_single and is_correct;
  select id into o_leaf from quiz_options where question_id = q_match and label = 'Leaf';
  select id into o_root from quiz_options where question_id = q_match and label = 'Root';
  select id into o_stem from quiz_options where question_id = q_match and label = 'Stem';

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;

  insert into quiz_attempts (quiz_id, student_id) values (v_quiz, 'a0000000-0000-0000-0000-000000000002')
    returning id into v_attempt;

  insert into quiz_answers (attempt_id, question_id, option_id) values (v_attempt, q_single, o_right);
  -- messy casing/whitespace must still match
  insert into quiz_answers (attempt_id, question_id, text_answer) values (v_attempt, q_fill, '  PhotoSynthesis ');
  -- 2 of 3 pairs right: matching is all-or-nothing, so this earns 0 of 3
  insert into quiz_answers (attempt_id, question_id, matching_answer) values (v_attempt, q_match,
    jsonb_build_object(o_leaf::text, 'photosynthesis', o_root::text, 'Absorption', o_stem::text, 'Absorption'));
  -- the student tries to award themselves full marks on the essay
  insert into quiz_answers (attempt_id, question_id, text_answer, points_awarded, feedback)
    values (v_attempt, q_essay, 'Plants turn light into sugar.', 4, 'self-graded');

  reset role;
  select points_awarded into v_points from quiz_answers where attempt_id = v_attempt and question_id = q_essay;
  if v_points is not null then
    raise exception 'FAIL: student set their own essay points (%)', v_points;
  end if;

  set local role authenticated;
  select s.score, s.total_points, s.needs_grading into v_score, v_total, v_pending
    from submit_quiz_attempt(v_attempt) s;
  reset role;

  -- single 2 + fill 2 + matching 0 (all-or-nothing) = 4 of 11; essay pending
  if v_score <> 4 or v_total <> 11 or v_pending is not true then
    raise exception 'FAIL: expected 4/11 pending, got %/% pending=%', v_score, v_total, v_pending;
  end if;

  -- answers are frozen after submit
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_failed := false;
  begin
    update quiz_answers set text_answer = 'changed my mind' where attempt_id = v_attempt and question_id = q_essay;
  exception when others then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: answer edited after submit'; end if;

  perform set_config('app.test_attempt', v_attempt::text, false);
  perform set_config('app.test_essay_q', q_essay::text, false);
  raise notice 'ok 4: all four types auto-scored; self-grading and post-submit edits blocked';
end $$;

-- ---------- 5. essay grading ----------
do $$
declare
  v_attempt uuid := current_setting('app.test_attempt')::uuid;
  q_essay uuid := current_setting('app.test_essay_q')::uuid;
  v_score numeric; v_pending boolean;
  v_failed boolean;
begin
  -- a student cannot grade
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform grade_essay_answer(v_attempt, q_essay, 4, null);
  exception when others then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: student graded an essay'; end if;

  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  v_failed := false;
  begin
    perform grade_essay_answer(v_attempt, q_essay, 5, null);   -- max is 4
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: points above the maximum accepted'; end if;

  v_failed := false;
  begin
    perform grade_essay_answer(v_attempt, q_essay, -1, null);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: negative points accepted'; end if;

  select s.score, s.needs_grading into v_score, v_pending
    from grade_essay_answer(v_attempt, q_essay, 3, 'Good, but name the chloroplast.') s;
  reset role;

  if v_score <> 7 or v_pending then
    raise exception 'FAIL: expected score 7 and nothing pending, got % pending=%', v_score, v_pending;
  end if;
  if not exists (select 1 from quiz_attempts where id = v_attempt and graded_at is not null and score = 7) then
    raise exception 'FAIL: attempt not marked graded';
  end if;
  raise notice 'ok 5: essay grading bounds-checked, restricted to staff, rescores the attempt';
end $$;

-- ---------- 6. replace questions ----------
do $$
declare
  v_quiz uuid := current_setting('app.test_quiz')::uuid;
  v_fresh uuid;
  v_n int;
  v_failed boolean;
begin
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  -- refused: the seeded quiz has an attempt
  v_failed := false;
  begin
    perform replace_quiz_questions(v_quiz, 'Mixed quiz', null, '[{"type":"essay","prompt":"new"}]'::jsonb);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: replaced questions under a live attempt'; end if;

  -- allowed on an untouched quiz
  v_fresh := create_quiz_with_questions('d0000000-0000-0000-0000-000000000001', 'Editable', null,
    '[{"type":"essay","prompt":"old"}]'::jsonb);
  perform replace_quiz_questions(v_fresh, 'Editable v2', 600,
    '[{"type":"single_choice","prompt":"a?","options":[{"label":"x","isCorrect":true},{"label":"y"}]},
      {"type":"essay","prompt":"b?"}]'::jsonb, null, null, true);
  reset role;

  select count(*) into v_n from quiz_questions where quiz_id = v_fresh;
  if v_n <> 2 then raise exception 'FAIL: expected 2 questions after replace, got %', v_n; end if;
  if not exists (select 1 from quizzes where id = v_fresh and title = 'Editable v2'
                 and time_limit_seconds = 600 and shuffle_questions) then
    raise exception 'FAIL: quiz settings not updated by replace_quiz_questions';
  end if;
  raise notice 'ok 6: replace_quiz_questions refuses live attempts, replaces atomically otherwise';
end $$;

select 'QUIZ TYPES: ALL ASSERTIONS PASSED' as result;
