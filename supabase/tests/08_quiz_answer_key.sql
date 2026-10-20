-- Behavioural test for 0031 (answer key hidden from students; review RPC)
-- and for all-or-nothing matching. Self-contained.
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/08_quiz_answer_key.sql
-- Needs the harness to grant table privileges to `authenticated` before the
-- migrations (as Supabase does), as for 05_conversation_state.sql.
-- A clean run ends with "QUIZ ANSWER KEY: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('a8000000-0000-0000-0000-000000000001', 'ak-teacher@test.local'),
  ('a8000000-0000-0000-0000-000000000002', 'ak-student@test.local'),
  ('a8000000-0000-0000-0000-000000000003', 'ak-rival@test.local'),
  ('a8000000-0000-0000-0000-000000000004', 'ak-parent@test.local'),
  ('a8000000-0000-0000-0000-000000000005', 'ak-stranger@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('a8000000-0000-0000-0000-000000000001', 'AK Teacher', 'teacher', 'ak-teacher@test.local', false),
  ('a8000000-0000-0000-0000-000000000002', 'AK Student', 'student', 'ak-student@test.local', false),
  ('a8000000-0000-0000-0000-000000000003', 'AK Rival', 'student', 'ak-rival@test.local', false),
  ('a8000000-0000-0000-0000-000000000004', 'AK Parent', 'parent', 'ak-parent@test.local', false),
  ('a8000000-0000-0000-0000-000000000005', 'AK Stranger', 'parent', 'ak-stranger@test.local', false);
insert into guardian_links (parent_id, student_id)
  values ('a8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000002');

insert into subjects (id, name) values ('b8000000-0000-0000-0000-000000000001', 'AK Science');
insert into teacher_subjects (profile_id, subject_id)
  values ('a8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001');
insert into classes (id, name, education_level, level_number)
  values ('c8000000-0000-0000-0000-000000000001', 'AK JSS1', 'jss', 1);
insert into class_members (class_id, profile_id) values
  ('c8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002'),
  ('c8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000003');
insert into settings (id, current_academic_year, current_term, term_start_date)
  values (true, '2026/2027', 1, current_date - 70)
  on conflict (id) do update set current_academic_year = excluded.current_academic_year,
    current_term = excluded.current_term, term_start_date = excluded.term_start_date;
insert into topics (id, title, subject_id, education_level, level_number, academic_year, term)
  values ('d8000000-0000-0000-0000-000000000001', 'AK Cells',
          'b8000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 1);

-- a published quiz with every question type
do $$
declare v_quiz uuid;
begin
  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  v_quiz := create_quiz_with_questions('d8000000-0000-0000-0000-000000000001', 'Key quiz', null,
    '[
      {"type":"single_choice","prompt":"Pick","points":1,"options":[
        {"label":"Right","isCorrect":true},{"label":"Wrong","isCorrect":false}]},
      {"type":"fill_blank","prompt":"Fill","points":1,"options":[{"label":"secretword"}]},
      {"type":"matching","prompt":"Match","points":3,"options":[
        {"label":"Leaf","matchText":"Photosynthesis"},
        {"label":"Root","matchText":"Absorption"},
        {"label":"Stem","matchText":"Support"}]},
      {"type":"essay","prompt":"Explain","points":2}
    ]'::jsonb);
  update quizzes set published = true where id = v_quiz;
  reset role;
  perform set_config('app.ak_quiz', v_quiz::text, false);
end $$;

-- 1. a student cannot read the key table at all
do $$
declare v_n int; v_staff int;
begin
  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into v_n from quiz_options;
  reset role;
  if v_n <> 0 then raise exception 'FAIL: student can read % quiz_options rows (the answer key)', v_n; end if;

  -- the teacher still can
  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into v_staff from quiz_options;
  reset role;
  if v_staff = 0 then raise exception 'FAIL: quiz staff lost access to quiz_options'; end if;
  raise notice 'ok 1: students cannot read quiz_options; staff still can';
end $$;

-- 2. the in-progress RPC returns questions but never the key or the pairing
do $$
declare
  v_quiz uuid := current_setting('app.ak_quiz')::uuid;
  v_attempt uuid;
  r record;
  v_blob text;
  v_failed boolean;
begin
  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  insert into quiz_attempts (quiz_id, student_id) values (v_quiz, 'a8000000-0000-0000-0000-000000000002')
    returning id into v_attempt;

  select string_agg(to_jsonb(q)::text, ' ') into v_blob from get_quiz_attempt_questions(v_attempt) q;
  if v_blob is null then raise exception 'FAIL: RPC returned no questions'; end if;
  if v_blob like '%is_correct%' then raise exception 'FAIL: in-progress RPC exposes is_correct'; end if;
  if v_blob ilike '%secretword%' then raise exception 'FAIL: in-progress RPC exposes the fill-in-the-blank answer'; end if;
  if v_blob like '%match_text%' then raise exception 'FAIL: in-progress RPC exposes match_text'; end if;

  select * into r from get_quiz_attempt_questions(v_attempt) q where q.question_type = 'matching';
  -- left terms as options, right terms as a separate unpaired list
  if jsonb_array_length(r.options) <> 3 or jsonb_array_length(r.choices) <> 3 then
    raise exception 'FAIL: matching should return 3 left terms and 3 right terms';
  end if;
  if r.options::text like '%Photosynthesis%' then raise exception 'FAIL: a right-hand term is attached to a left-hand option'; end if;
  if r.choices <> '["Absorption", "Photosynthesis", "Support"]'::jsonb then
    raise exception 'FAIL: right-hand terms should be sorted alphabetically (no pair order), got %', r.choices;
  end if;

  select * into r from get_quiz_attempt_questions(v_attempt) q where q.question_type = 'fill_blank';
  if jsonb_array_length(r.options) <> 0 then raise exception 'FAIL: fill_blank returned options'; end if;

  -- another student cannot read this attempt's questions
  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000003', true);
  v_failed := false;
  begin perform * from get_quiz_attempt_questions(v_attempt); exception when others then v_failed := true; end;
  reset role;
  if not v_failed then raise exception 'FAIL: another student could load this attempt'; end if;

  perform set_config('app.ak_attempt', v_attempt::text, false);
  raise notice 'ok 2: in-progress RPC hides the key, accepted answers and the pairing';
end $$;

-- 3. review is refused until submit; then allowed for the right people only
do $$
declare
  v_attempt uuid := current_setting('app.ak_attempt')::uuid;
  v_quiz uuid := current_setting('app.ak_quiz')::uuid;
  q_single uuid; o_right uuid; q_match uuid; o_leaf uuid; o_root uuid; o_stem uuid;
  v_failed boolean; v_n int; v_blob text;
begin
  select id into q_single from quiz_questions where quiz_id = v_quiz and question_type = 'single_choice';
  select id into o_right from quiz_options where question_id = q_single and is_correct;
  select id into q_match from quiz_questions where quiz_id = v_quiz and question_type = 'matching';
  select id into o_leaf from quiz_options where question_id = q_match and label = 'Leaf';
  select id into o_root from quiz_options where question_id = q_match and label = 'Root';
  select id into o_stem from quiz_options where question_id = q_match and label = 'Stem';

  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000002', true);
  set local role authenticated;

  -- not submitted yet: refused, even for the student themselves
  v_failed := false;
  begin perform * from get_quiz_attempt_review(v_attempt); exception when others then v_failed := true; end;
  if not v_failed then raise exception 'FAIL: review available before submission'; end if;

  -- answer everything; matching is ALL pairs right here
  insert into quiz_answers (attempt_id, question_id, option_id) values (v_attempt, q_single, o_right);
  insert into quiz_answers (attempt_id, question_id, text_answer)
    select v_attempt, id, '  SecretWord ' from quiz_questions where quiz_id = v_quiz and question_type = 'fill_blank';
  insert into quiz_answers (attempt_id, question_id, matching_answer) values (v_attempt, q_match,
    jsonb_build_object(o_leaf::text, 'photosynthesis', o_root::text, 'Absorption', o_stem::text, 'support'));
  insert into quiz_answers (attempt_id, question_id, text_answer)
    select v_attempt, id, 'an essay' from quiz_questions where quiz_id = v_quiz and question_type = 'essay';
  perform * from submit_quiz_attempt(v_attempt);

  select string_agg(to_jsonb(r)::text, ' ') into v_blob from get_quiz_attempt_review(v_attempt) r;
  if v_blob not like '%is_correct%' or v_blob not ilike '%secretword%' then
    raise exception 'FAIL: review after submit should include the key';
  end if;
  reset role;

  -- all three pairs right earns the full 3 points (all-or-nothing)
  select count(*) into v_n from quiz_answers qa
    where qa.attempt_id = v_attempt and qa.question_id = q_match and qa.points_awarded = 3;
  if v_n <> 1 then raise exception 'FAIL: fully correct matching did not earn full points'; end if;

  -- allowed: the linked parent, the teacher
  foreach v_blob in array array['a8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000001'] loop
    perform set_config('request.jwt.claim.sub', v_blob, true);
    set local role authenticated;
    select count(*) into v_n from get_quiz_attempt_review(v_attempt);
    reset role;
    if v_n <> 4 then raise exception 'FAIL: % could not review (rows=%)', v_blob, v_n; end if;
  end loop;

  -- denied: a classmate, and an unrelated parent
  foreach v_blob in array array['a8000000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-000000000005'] loop
    perform set_config('request.jwt.claim.sub', v_blob, true);
    set local role authenticated;
    v_failed := false;
    begin perform * from get_quiz_attempt_review(v_attempt); exception when others then v_failed := true; end;
    reset role;
    if not v_failed then raise exception 'FAIL: % could review someone else''s attempt', v_blob; end if;
  end loop;

  raise notice 'ok 3: review refused until submit; allowed for student, parent, staff only; matching all-or-nothing';
end $$;

-- 4. one wrong pair earns nothing
do $$
declare
  v_quiz uuid := current_setting('app.ak_quiz')::uuid;
  v_attempt uuid; q_match uuid; o_leaf uuid; o_root uuid; o_stem uuid; v_pts numeric;
begin
  select id into q_match from quiz_questions where quiz_id = v_quiz and question_type = 'matching';
  select id into o_leaf from quiz_options where question_id = q_match and label = 'Leaf';
  select id into o_root from quiz_options where question_id = q_match and label = 'Root';
  select id into o_stem from quiz_options where question_id = q_match and label = 'Stem';

  perform set_config('request.jwt.claim.sub', 'a8000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  insert into quiz_attempts (quiz_id, student_id) values (v_quiz, 'a8000000-0000-0000-0000-000000000003')
    returning id into v_attempt;
  insert into quiz_answers (attempt_id, question_id, matching_answer) values (v_attempt, q_match,
    jsonb_build_object(o_leaf::text, 'Photosynthesis', o_root::text, 'Absorption', o_stem::text, 'Absorption'));
  perform * from submit_quiz_attempt(v_attempt);
  reset role;

  select points_awarded into v_pts from quiz_answers where attempt_id = v_attempt and question_id = q_match;
  if v_pts <> 0 then raise exception 'FAIL: 2 of 3 pairs right earned % points', v_pts; end if;
  raise notice 'ok 4: a single wrong pair earns 0';
end $$;

select 'QUIZ ANSWER KEY: ALL ASSERTIONS PASSED' as result;
