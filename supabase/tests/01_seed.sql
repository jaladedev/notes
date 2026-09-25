\set ON_ERROR_STOP on

-- ============ Seed identities (as postgres, bypasses RLS) ============
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@school.test'),
  ('00000000-0000-0000-0000-000000000002', 'teacher.a@school.test'),
  ('00000000-0000-0000-0000-000000000003', 'teacher.b@school.test'),
  ('00000000-0000-0000-0000-000000000004', 'student.a@school.test'),
  ('00000000-0000-0000-0000-000000000005', 'student.b@school.test'),
  ('00000000-0000-0000-0000-000000000006', 'parent.a@school.test');

insert into profiles (id, role, full_name, email, must_change_password, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'admin',   'Admin One',    'admin@school.test',      false, true),
  ('00000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A',    'teacher.a@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B',    'teacher.b@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000004', 'student', 'Student A',    'student.a@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000005', 'student', 'Student B',    'student.b@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000006', 'parent',  'Parent of A',  'parent.a@school.test',   false, true);

insert into guardian_links (parent_id, student_id) values
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004');

-- Two spaces: A owned/taught by Teacher A, B by Teacher B. Student A is
-- only in Space A. This is the core isolation this whole plan hinges on.
insert into spaces (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Space A'),
  ('10000000-0000-0000-0000-000000000002', 'Space B');

insert into space_members (space_id, profile_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'teacher'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'student'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'teacher'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'student');

insert into topics (id, space_id, title) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Topic A1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Topic B1');

insert into homework (id, topic_id, title, created_by) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'HW A1', '00000000-0000-0000-0000-000000000002');

insert into quizzes (id, topic_id, title, published, created_by) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Quiz A1', true, '00000000-0000-0000-0000-000000000002');
insert into quiz_questions (id, quiz_id, prompt, points, sequence_order) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2+2?', 1, 0),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Capital of France?', 1, 1);
insert into quiz_options (id, question_id, label, is_correct, sequence_order) values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '3', false, 0),
  ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', '4', true,  1),
  ('42000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000002', 'Paris', true, 0),
  ('42000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000002', 'Rome',  false, 1);

\echo '=== Seed complete ==='
