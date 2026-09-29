\set ON_ERROR_STOP on

-- ---------- Subject/level isolation ----------
-- Teacher A (Mathematics) must not see Biology's topic.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare cnt int; begin
  select count(*) into cnt from topics where id = '20000000-0000-0000-0000-000000000002';
  if cnt <> 0 then raise exception 'FAIL: teacher can read another subject''s topic'; end if;
  raise notice 'PASS: teacher cannot read another subject''s topic';
end $$;
reset role;

-- Student A (JSS1) submits homework on their level's topic.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
insert into homework_submissions (homework_id, student_id, content)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'My answer');
reset role;

-- Student B is JSS2, so must not be able to submit against JSS1 homework.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$
begin
  begin
    insert into homework_submissions (homework_id, student_id, content)
    values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Sneaky');
    raise exception 'FAIL: a JSS2 student inserted a submission against JSS1 homework';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a student on another level is blocked from submitting (%)', sqlerrm;
  end;
end $$;
reset role;

-- Quiz scoring: Student A answers Q1 correctly (4), Q2 incorrectly (Rome),
-- submits, and the server-computed score must be exactly 1/2 -- and must
-- come from submit_quiz_attempt(), never a client-supplied number.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
insert into quiz_attempts (id, quiz_id, student_id)
values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004');
insert into quiz_answers (attempt_id, question_id, option_id) values
  ('50000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002'), -- correct (4)
  ('50000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000004'); -- wrong (Rome)
select * from submit_quiz_attempt('50000000-0000-0000-0000-000000000001');
do $$
declare v_score numeric; v_total numeric;
begin
  select score, total_points into v_score, v_total from quiz_attempts where id = '50000000-0000-0000-0000-000000000001';
  if v_score <> 1 or v_total <> 2 then
    raise exception 'FAIL: quiz score wrong, got %/%, expected 1/2', v_score, v_total;
  end if;
  raise notice 'PASS: quiz scored correctly server-side (%/%)', v_score, v_total;
end $$;
-- Double-submit must be rejected (attempt already locked).
do $$
begin
  begin
    perform submit_quiz_attempt('50000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: double-submit was allowed';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: double-submit rejected (%)', sqlerrm;
  end;
end $$;
reset role;

-- Student B (JSS2) has no access to this JSS1 quiz at all -- confirm that.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ declare cnt int; begin
  select count(*) into cnt from quiz_questions where quiz_id = '40000000-0000-0000-0000-000000000001';
  if cnt <> 0 then raise exception 'FAIL: Student B (other level) can see JSS1 quiz questions'; end if;
  raise notice 'PASS: Student B cannot see another level''s quiz questions';
end $$;
reset role;

-- Messaging: two students with no shared conversation can't see each other's messages.
insert into conversations (id) values ('60000000-0000-0000-0000-000000000001');
insert into conversation_members (conversation_id, profile_id) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'),
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
insert into messages (conversation_id, sender_id, body) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Hi Teacher A');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- Student B, not in this conversation
do $$ declare cnt int; begin
  select count(*) into cnt from messages where conversation_id = '60000000-0000-0000-0000-000000000001';
  if cnt <> 0 then raise exception 'FAIL: Student B can read a conversation they are not a member of'; end if;
  raise notice 'PASS: Student B cannot read a conversation they are not in';
end $$;
do $$
begin
  begin
    insert into messages (conversation_id, sender_id, body)
    values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Butting in');
    raise exception 'FAIL: Student B could send a message into a conversation they are not in';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: Student B blocked from sending into a conversation they are not in (%)', sqlerrm;
  end;
end $$;
reset role;

-- Audit log: only admin can read it.
insert into audit_log (actor_id, action, target_type, target_id) values
  ('00000000-0000-0000-0000-000000000001', 'account.create', 'profile', '00000000-0000-0000-0000-000000000004');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Teacher A, not admin
do $$ declare cnt int; begin
  select count(*) into cnt from audit_log;
  if cnt <> 0 then raise exception 'FAIL: non-admin can read audit_log'; end if;
  raise notice 'PASS: non-admin cannot read audit_log';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- Admin
do $$ declare cnt int; begin
  select count(*) into cnt from audit_log;
  if cnt <> 1 then raise exception 'FAIL: admin cannot read audit_log (got %)', cnt; end if;
  raise notice 'PASS: admin can read audit_log';
end $$;
reset role;

-- ---------- Teacher assignment is admin-only ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Teacher A
do $$ begin
  begin
    insert into teacher_subjects (profile_id, subject_id) values
      ('00000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: a teacher assigned themselves to another subject';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a teacher cannot assign themselves to a subject (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------- Notes shared by level ----------
-- Student A is JSS1A, Student C is JSS1B: both see JSS1 Maths notes. Student B
-- (JSS2A) does not, and sees only the JSS2 Biology note.
do $$ begin perform 1; end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A (JSS1A)
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000001';
  if cnt <> 1 then raise exception 'FAIL: JSS1A student cannot read their level''s note'; end if;
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000002';
  if cnt <> 0 then raise exception 'FAIL: JSS1A student can read a JSS2 note'; end if;
  raise notice 'PASS: a student reads their own level''s notes and not another level''s';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007'; -- Student C (JSS1B)
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000001';
  if cnt <> 1 then raise exception 'FAIL: JSS1B student cannot read the note written for JSS1'; end if;
  raise notice 'PASS: both arms of a level (JSS1A and JSS1B) share the same notes';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006'; -- Parent of Student A
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000001';
  if cnt <> 1 then raise exception 'FAIL: parent cannot read their child''s level notes'; end if;
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000002';
  if cnt <> 0 then raise exception 'FAIL: parent can read notes for a level their child is not on'; end if;
  raise notice 'PASS: a parent reads their child''s level notes only';
end $$;
reset role;

-- Staff: Teacher A reads Maths, not Biology, notes; global admin reads all.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes;
  if cnt <> 1 then raise exception 'FAIL: teacher should see exactly their subject''s note (got %)', cnt; end if;
  raise notice 'PASS: a teacher sees notes for their own subject only';
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes;
  if cnt <> 2 then raise exception 'FAIL: admin should see every note (got %)', cnt; end if;
  raise notice 'PASS: global admin sees every note';
end $$;
reset role;

-- ---------- Promotion: moving a student changes what they see ----------
-- Promote Student A from JSS1A to JSS2A. They lose JSS1 notes and gain JSS2's,
-- and the JSS1 note stays for the next cohort (Student C, still JSS1B).
update class_members set class_id = '61000000-0000-0000-0000-000000000003'
  where profile_id = '00000000-0000-0000-0000-000000000004';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000002';
  if cnt <> 1 then raise exception 'FAIL: promoted student cannot read the new level''s note'; end if;
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000001';
  if cnt <> 0 then raise exception 'FAIL: promoted student still reads the old level''s note'; end if;
  raise notice 'PASS: promotion swaps which level''s notes a student sees';
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007';
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes where id = '70000000-0000-0000-0000-000000000001';
  if cnt <> 1 then raise exception 'FAIL: the old level''s note disappeared for the next cohort'; end if;
  raise notice 'PASS: notes stay on the old level after promotion';
end $$;
reset role;
-- Put Student A back for the tests below.
update class_members set class_id = '61000000-0000-0000-0000-000000000001'
  where profile_id = '00000000-0000-0000-0000-000000000004';

-- ---------- Term / week gate (school_app semantics) ----------
-- Current: 2026/2027 term 1, week 2 (term started 8 days ago, school time zone).
update settings set current_academic_year = '2026/2027', current_term = 1,
  term_start_date = (now() at time zone timezone)::date - 8 where id;
insert into topics (id, subject_id, education_level, level_number, academic_year, term, week_number, title) values
  ('21000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 1, 2, 'This week'),
  ('21000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 1, 5, 'Future week'),
  ('21000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'jss', 1, '2026/2027', 2, 1, 'Next term'),
  ('21000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'jss', 1, '2025/2026', 3, 12, 'Last year');
insert into topic_notes (topic_id, author_id, content, status, moderation_status, version)
select id, '00000000-0000-0000-0000-000000000002', '<p>x</p>', 'published', 'approved', 1
from topics where id::text like '21000000-%';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A (JSS1)
do $$ declare titles text; begin
  select string_agg(t.title, ', ' order by t.title) into titles
  from topics t where t.subject_id = '50000000-0000-0000-0000-000000000001';
  if titles is distinct from 'Last year, This week, Topic A1' then
    raise exception 'FAIL: student sees wrong topics: %', titles;
  end if;
  raise notice 'PASS: student sees past + current weeks and past years, not future weeks or terms (%)', titles;
end $$;
do $$ declare cnt int; begin
  select count(*) into cnt from topic_notes n join topics t on t.id = n.topic_id where t.title in ('Future week', 'Next term');
  if cnt <> 0 then raise exception 'FAIL: student can read a future week/term note'; end if;
  raise notice 'PASS: future-week and future-term notes are hidden from students';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Teacher A (staff)
do $$ declare cnt int; begin
  select count(*) into cnt from topics where subject_id = '50000000-0000-0000-0000-000000000001';
  if cnt <> 5 then raise exception 'FAIL: teacher should see every week (got %)', cnt; end if;
  raise notice 'PASS: staff are never gated by week';
end $$;
reset role;

-- Gate off: with no term start and no current term, students see everything at their level.
update settings set current_academic_year = null, current_term = null, term_start_date = null where id;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ declare cnt int; begin
  select count(*) into cnt from topics where subject_id = '50000000-0000-0000-0000-000000000001';
  if cnt <> 5 then raise exception 'FAIL: with the gate off the student should see all 5 topics (got %)', cnt; end if;
  raise notice 'PASS: with no term settings nothing is gated';
end $$;
reset role;

-- ---------- Classes ----------
-- Global admin sees rosters; a student outside the class does not.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare cnt int; begin
  select count(*) into cnt from class_members where class_id = '61000000-0000-0000-0000-000000000003';
  if cnt <> 1 then raise exception 'FAIL: global admin cannot see class roster (got % rows)', cnt; end if;
  raise notice 'PASS: global admin can read a class roster';
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ declare cnt int; begin
  select count(*) into cnt from class_members where class_id = '61000000-0000-0000-0000-000000000003';
  if cnt <> 0 then raise exception 'FAIL: a non-member student can read another class roster'; end if;
  raise notice 'PASS: a student outside the class cannot read its roster';
end $$;
reset role;

-- ---------- School timetable (0011, subject-based since 0020) ----------
create or replace function public.expect_fail(stmt text, needle text, label text)
returns void language plpgsql as $f$
begin
  begin
    execute stmt;
    raise exception 'FAIL: % succeeded but should have been rejected', label;
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if needle is not null and sqlerrm not like '%' || needle || '%' then
      raise exception 'FAIL: % was rejected for the wrong reason: %', label, sqlerrm;
    end if;
    raise notice 'PASS: % (%)', label, sqlerrm;
  end;
end $f$;

insert into timetable_periods (period_number, label, start_time, end_time, is_break) values
  (1, 'Period 1', '08:00', '08:40', false),
  (2, 'Period 2', '08:40', '09:20', false),
  (3, 'Break',    '09:20', '09:40', true);

select public.expect_fail(
  $q$insert into timetable_periods (period_number, start_time, end_time) values (9, '08:30', '09:00')$q$,
  'overlap', 'overlapping period rejected');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin
insert into timetable_entries (class_id, subject_id, weekday, period_number, teacher_id, room) values
  ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 1,
   '00000000-0000-0000-0000-000000000002', 'Lab 1');
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 1 then raise exception 'FAIL: admin could not create a timetable entry (got %)', cnt; end if;
  raise notice 'PASS: global admin can create a timetable entry';
end $$;

select public.expect_fail(
  $q$insert into timetable_entries (class_id, subject_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 1)$q$,
  'timetable_entries_class_period_unique', 'class cannot have two lessons in one period');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, subject_id, weekday, period_number, teacher_id) values
     ('61000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 1, 1,
      '00000000-0000-0000-0000-000000000002')$q$,
  'timetable_entries_teacher_period_unique', 'teacher cannot be in two classes in one period');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, subject_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 2, 3)$q$,
  'break', 'lesson in a break period rejected');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, subject_id, weekday, period_number, teacher_id) values
     ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 2, 2,
      '00000000-0000-0000-0000-000000000003')$q$,
  'teacher must be', 'teacher not assigned to the subject rejected');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Teacher A
select public.expect_fail(
  $q$insert into timetable_entries (class_id, subject_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 3, 1)$q$,
  'row-level security', 'non-admin cannot write the timetable');
select public.expect_fail(
  $q$insert into timetable_periods (period_number, start_time, end_time) values (8, '14:00', '14:40')$q$,
  'row-level security', 'non-admin cannot write periods');
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 1 then raise exception 'FAIL: teacher of the subject should see its lesson (got %)', cnt; end if;
  raise notice 'PASS: a teacher sees lessons for their own subject';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A (JSS1A, enrolled)
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 1 then raise exception 'FAIL: enrolled student cannot see their class timetable (got %)', cnt; end if;
  raise notice 'PASS: an enrolled student sees their class timetable';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006'; -- Parent of Student A
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 1 then raise exception 'FAIL: parent cannot see their child''s class timetable (got %)', cnt; end if;
  raise notice 'PASS: a parent sees their child''s class timetable';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- Student B (JSS2A)
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 0 then raise exception 'FAIL: a student outside the class can see its timetable (got %)', cnt; end if;
  raise notice 'PASS: a student in another class cannot see this timetable';
end $$;
reset role;

-- Unassigning a teacher from a subject frees their timetable cells.
delete from teacher_subjects
  where subject_id = '50000000-0000-0000-0000-000000000001'
    and profile_id = '00000000-0000-0000-0000-000000000002';
do $$ declare t uuid; begin
  select teacher_id into t from timetable_entries limit 1;
  if t is not null then raise exception 'FAIL: unassigned teacher still on a lesson'; end if;
  raise notice 'PASS: unassigning a teacher clears their timetable cells';
end $$;

select public.expect_fail($q$delete from timetable_periods where period_number = 1$q$,
  'timetable_entries_period_number_fkey', 'period with lessons cannot be deleted');

drop function public.expect_fail(text, text, text);

-- ---------- Announcements: class-targeted, teacher of that class can post ----------
-- (Teacher A was unassigned above, so use Teacher B via a fresh lesson.)
insert into teacher_subjects (profile_id, subject_id) values
  ('00000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001');
insert into timetable_entries (class_id, subject_id, weekday, period_number, teacher_id) values
  ('61000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 4, 2, '00000000-0000-0000-0000-000000000003');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Teacher B teaches JSS1B
insert into announcements (class_id, title, body, created_by)
  values ('61000000-0000-0000-0000-000000000002', 'Test', 'Hello', '00000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    insert into announcements (class_id, title, body, created_by)
      values ('61000000-0000-0000-0000-000000000003', 'Nope', 'x', '00000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: teacher posted to a class they do not teach';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a teacher can only post to classes they teach (%)', sqlerrm;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007'; -- Student C (JSS1B)
do $$ declare cnt int; begin
  select count(*) into cnt from announcements where title = 'Test';
  if cnt <> 1 then raise exception 'FAIL: class member cannot see their class announcement'; end if;
  raise notice 'PASS: a class member sees their class announcement';
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- Student B (JSS2A)
do $$ declare cnt int; begin
  select count(*) into cnt from announcements where title = 'Test';
  if cnt <> 0 then raise exception 'FAIL: a student outside the class can see its announcement'; end if;
  raise notice 'PASS: announcements stay within their class';
end $$;
reset role;

-- School time zone (settings.timezone): a global admin can change it; a
-- plain teacher who administers nothing cannot.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- global admin
update settings set timezone = 'Africa/Accra' where id = true;
reset role;
do $$ declare tz text; begin
  select timezone into tz from settings;
  if tz <> 'Africa/Accra' then raise exception 'FAIL: global admin could not change the school time zone (got %)', tz; end if;
  raise notice 'PASS: global admin can change the school time zone';
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Teacher B, administers nothing
update settings set timezone = 'UTC' where id = true;
reset role;
do $$ declare tz text; begin
  select timezone into tz from settings;
  if tz <> 'Africa/Accra' then raise exception 'FAIL: a non-admin changed the school time zone'; end if;
  raise notice 'PASS: a non-admin cannot change the school time zone';
end $$;

\echo '=== ALL ASSERTIONS PASSED ==='
