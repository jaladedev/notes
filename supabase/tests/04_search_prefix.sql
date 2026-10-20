-- Behavioural test for 0032 (prefix search). Self-contained; run after the
-- migrations and the grants step in README.md:
--
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/04_search_prefix.sql
--
-- A clean run ends with "SEARCH PREFIX: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'sp-teacher@test.local'),
  ('a1000000-0000-0000-0000-000000000002', 'sp-student@test.local'),
  ('a1000000-0000-0000-0000-000000000003', 'sp-other@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('a1000000-0000-0000-0000-000000000001', 'SP Teacher', 'teacher', 'sp-teacher@test.local', false),
  ('a1000000-0000-0000-0000-000000000002', 'SP Student', 'student', 'sp-student@test.local', false),
  ('a1000000-0000-0000-0000-000000000003', 'SP Other', 'student', 'sp-other@test.local', false);

insert into subjects (id, name) values ('b1000000-0000-0000-0000-000000000001', 'SP Biology');
insert into teacher_subjects (profile_id, subject_id)
  values ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001');
insert into classes (id, name, education_level, level_number)
  values ('c1000000-0000-0000-0000-000000000001', 'SP JSS1', 'jss', 1);
-- only the first student is in the class; the other cannot read these notes
insert into class_members (class_id, profile_id)
  values ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');

insert into settings (id, current_academic_year, current_term, term_start_date)
  values (true, '2026/2027', 1, current_date - 70)
  on conflict (id) do update set current_academic_year = excluded.current_academic_year,
    current_term = excluded.current_term, term_start_date = excluded.term_start_date;

insert into topics (id, title, subject_id, education_level, level_number, academic_year, term)
  values ('d1000000-0000-0000-0000-000000000001', 'SP Plants',
          'b1000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 1);

insert into topic_notes (id, topic_id, author_id, content, status, version) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   '<p>Photosynthesis lets plants make food from light.</p>', 'published', 1),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   '<p>The classes of cell division are mitosis and meiosis.</p>', 'published', 2),
  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   '<p>Photosynthesis draft that students must not find.</p>', 'draft', 3);

do $$
declare
  v_ids uuid[];
  v_n int;
begin
  perform set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
  set local role authenticated;

  -- a half-typed word finds the full word
  select array_agg(id) into v_ids from search_topic_notes_prefix('photo');
  if v_ids is distinct from array['e1000000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'FAIL: "photo" should find only the published photosynthesis note, got %', v_ids;
  end if;

  select count(*) into v_n from search_topic_notes_prefix('photosynth');
  if v_n <> 1 then raise exception 'FAIL: "photosynth" returned % rows', v_n; end if;

  -- a whole word typed in full still works (stemming: classes -> class)
  select count(*) into v_n from search_topic_notes_prefix('classes');
  if v_n <> 1 then raise exception 'FAIL: whole word "classes" returned % rows', v_n; end if;

  -- several words are AND-ed, each as a prefix
  select count(*) into v_n from search_topic_notes_prefix('cell mito');
  if v_n <> 1 then raise exception 'FAIL: "cell mito" returned % rows', v_n; end if;
  select count(*) into v_n from search_topic_notes_prefix('cell photo');
  if v_n <> 0 then raise exception 'FAIL: "cell photo" should match nothing, got %', v_n; end if;

  -- hostile / empty input is inert
  select count(*) into v_n from search_topic_notes_prefix('''); drop table profiles; --');
  select count(*) into v_n from search_topic_notes_prefix('!!! &:*|');
  if v_n <> 0 then raise exception 'FAIL: punctuation-only query returned rows'; end if;
  select count(*) into v_n from search_topic_notes_prefix(null);
  if v_n <> 0 then raise exception 'FAIL: null query returned rows'; end if;

  reset role;
  if to_regclass('public.profiles') is null then raise exception 'FAIL: injection dropped a table'; end if;
  raise notice 'ok 1: prefix, whole-word, multi-word and hostile input behave; drafts excluded';
end $$;

-- RLS still applies: a student who cannot read the topic finds nothing
do $$
declare v_n int;
begin
  perform set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  select count(*) into v_n from search_topic_notes_prefix('photo');
  reset role;
  if v_n <> 0 then raise exception 'FAIL: user outside the class found % notes', v_n; end if;
  raise notice 'ok 2: results are scoped by RLS (invoker rights)';
end $$;

select 'SEARCH PREFIX: ALL ASSERTIONS PASSED' as result;
