\set ON_ERROR_STOP on

-- ============ Seed identities (as postgres, bypasses RLS) ============
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@school.test'),
  ('00000000-0000-0000-0000-000000000002', 'teacher.a@school.test'),
  ('00000000-0000-0000-0000-000000000003', 'teacher.b@school.test'),
  ('00000000-0000-0000-0000-000000000004', 'student.a@school.test'),
  ('00000000-0000-0000-0000-000000000005', 'student.b@school.test'),
  ('00000000-0000-0000-0000-000000000006', 'parent.a@school.test'),
  ('00000000-0000-0000-0000-000000000007', 'student.c@school.test');

insert into profiles (id, role, full_name, email, must_change_password, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'admin',   'Admin One',    'admin@school.test',      false, true),
  ('00000000-0000-0000-0000-000000000002', 'teacher', 'Teacher A',    'teacher.a@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000003', 'teacher', 'Teacher B',    'teacher.b@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000004', 'student', 'Student A',    'student.a@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000005', 'student', 'Student B',    'student.b@school.test',  false, true),
  ('00000000-0000-0000-0000-000000000006', 'parent',  'Parent of A',  'parent.a@school.test',   false, true),
  ('00000000-0000-0000-0000-000000000007', 'student', 'Student C',    'student.c@school.test',  false, true);

insert into guardian_links (parent_id, student_id) values
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004');

-- School_app-style curriculum model: two subjects, three classes on two
-- levels. JSS1A and JSS1B share a level (so they share notes); JSS2A is a
-- different level. Teacher A teaches Mathematics, Teacher B teaches Biology.
insert into subjects (id, name) values
  ('50000000-0000-0000-0000-000000000001', 'Mathematics'),
  ('50000000-0000-0000-0000-000000000002', 'Biology');

insert into teacher_subjects (profile_id, subject_id, role) values
  ('00000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'teacher');

insert into classes (id, name, education_level, level_number) values
  ('61000000-0000-0000-0000-000000000001', 'JSS1A', 'jss', 1),
  ('61000000-0000-0000-0000-000000000002', 'JSS1B', 'jss', 1),
  ('61000000-0000-0000-0000-000000000003', 'JSS2A', 'jss', 2);

insert into class_members (class_id, profile_id) values
  ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'), -- Student A: JSS1A
  ('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007'), -- Student C: JSS1B
  ('61000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005'); -- Student B: JSS2A

-- Topic A1: JSS1 Mathematics, term 1 week 1.  Topic B1: JSS2 Biology.
insert into topics (id, subject_id, education_level, level_number, academic_year, term, week_number, title) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 1, 1, 'Topic A1'),
  ('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'jss', 2, '2026/2027', 1, 1, 'Topic B1');

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

-- A published, approved note on each topic (Teacher A / Teacher B).
insert into topic_notes (id, topic_id, author_id, content, status, moderation_status, version) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '<p>A1 note</p>', 'published', 'approved', 1),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '<p>B1 note</p>', 'published', 'approved', 1);

\echo '=== Seed complete ==='
