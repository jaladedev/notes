\set ON_ERROR_STOP on

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare cnt int; begin
  select count(*) into cnt from topics where id = '20000000-0000-0000-0000-000000000002';
  if cnt <> 0 then raise exception 'FAIL: cross-space topic leak'; end if;
  raise notice 'PASS: no cross-space topic leak';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A
insert into homework_submissions (homework_id, student_id, content)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'My answer');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- Student B (Space B)
do $$
begin
  begin
    insert into homework_submissions (homework_id, student_id, content)
    values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'Sneaky');
    raise exception 'FAIL: Student B inserted a submission against another space''s homework';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: Student B blocked from cross-space homework submission (%)', sqlerrm;
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

-- Student B must not be able to see the answer key (is_correct) even
-- for a published quiz's questions in their own... actually Student B
-- has no access to this quiz at all (different space) -- confirm that.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ declare cnt int; begin
  select count(*) into cnt from quiz_questions where quiz_id = '40000000-0000-0000-0000-000000000001';
  if cnt <> 0 then raise exception 'FAIL: Student B (other space) can see Space A quiz questions'; end if;
  raise notice 'PASS: Student B cannot see another space''s quiz questions';
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

-- Space membership management: an EXISTING space admin can add/remove
-- other members; a plain (non-admin) member of that same space cannot.
-- Teacher A is only a plain 'teacher' in seeded Space A -- promote them
-- to admin first so this exercises a real space-admin identity, not a
-- false positive from testing against the wrong role (a mistake made
-- and caught while developing this suite -- see plan doc Addendum 5).
insert into space_members (space_id, profile_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'admin')
on conflict (space_id, profile_id) do update set role = 'admin';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Teacher A, now admin of Space A
insert into space_members (space_id, profile_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'teacher');
reset role;
do $$ declare cnt int; begin
  select count(*) into cnt from space_members
  where space_id = '10000000-0000-0000-0000-000000000001'
    and profile_id = '00000000-0000-0000-0000-000000000003';
  if cnt <> 1 then raise exception 'FAIL: space admin could not add a member (got %)', cnt; end if;
  raise notice 'PASS: an existing space admin can add a member';
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
delete from space_members
  where space_id = '10000000-0000-0000-0000-000000000001'
    and profile_id = '00000000-0000-0000-0000-000000000003';
reset role;
do $$ declare cnt int; begin
  select count(*) into cnt from space_members
  where space_id = '10000000-0000-0000-0000-000000000001'
    and profile_id = '00000000-0000-0000-0000-000000000003';
  if cnt <> 0 then raise exception 'FAIL: space admin could not remove a member (still % rows)', cnt; end if;
  raise notice 'PASS: an existing space admin can remove a member';
end $$;

-- A plain (student) member of the SAME space must not be able to do either.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A, plain student of Space A
do $$
begin
  begin
    insert into space_members (space_id, profile_id, role) values
      ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'student');
    raise exception 'FAIL: a plain space member could add another member';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: a plain space member cannot add another member (%)', sqlerrm;
  end;
end $$;
reset role;

-- Classes: the admin-client write path (createClass/addClassMember)
-- bypasses RLS, so we seed as superuser, then check what each identity
-- can actually READ -- the roster page uses the RLS-scoped client.
insert into classes (id, name) values ('60000000-0000-0000-0000-000000000001', 'JSS2A');
insert into class_members values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- global admin, in no space
do $$ declare cnt int; begin
  select count(*) into cnt from class_members where class_id = '60000000-0000-0000-0000-000000000001';
  if cnt <> 1 then raise exception 'FAIL: global admin cannot see class roster (got % rows)', cnt; end if;
  raise notice 'PASS: global admin can read a class roster';
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A, not in this class
do $$ declare cnt int; begin
  select count(*) into cnt from class_members where class_id = '60000000-0000-0000-0000-000000000001';
  if cnt <> 0 then raise exception 'FAIL: a non-member student can read another class roster'; end if;
  raise notice 'PASS: a student outside the class cannot read its roster';
end $$;
reset role;

-- Enrolment must actually grant read access to a space tied to the class.
update spaces set class_id = '60000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- Student B, enrolled in the class
do $$ declare cnt int; begin
  select count(*) into cnt from spaces where id = '10000000-0000-0000-0000-000000000002';
  if cnt <> 1 then raise exception 'FAIL: class-enrolled student cannot read a space tied to their class'; end if;
  raise notice 'PASS: class enrolment grants read access to the linked space';
end $$;
reset role;

-- ---------- School timetable (0011) ----------
-- Fixtures via superuser: a bell schedule, class JSS1A tied to Space A,
-- Student A enrolled in it. Teacher A is already a member of Space A
-- (promoted to 'admin' above, which the timetable accepts as teaching).
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
insert into classes (id, name) values ('61000000-0000-0000-0000-000000000001', 'JSS1A');
update spaces set class_id = '61000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000001';
insert into class_members values ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004');
-- Teacher A also teaches Space B, so a teacher clash across two classes is possible.
insert into space_members (space_id, profile_id, role) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'teacher');

select public.expect_fail(
  $q$insert into timetable_periods (period_number, start_time, end_time) values (9, '08:30', '09:00')$q$,
  'overlap', 'overlapping period rejected');

-- Only a global admin can write the timetable.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- admin
insert into timetable_entries (class_id, space_id, weekday, period_number, teacher_id, room) values
  ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 1,
   '00000000-0000-0000-0000-000000000002', 'Lab 1');
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 1 then raise exception 'FAIL: admin could not create a timetable entry (got %)', cnt; end if;
  raise notice 'PASS: global admin can create a timetable entry';
end $$;

select public.expect_fail(
  $q$insert into timetable_entries (class_id, space_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 1)$q$,
  'timetable_entries_class_period_unique', 'class cannot have two lessons in one period');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, space_id, weekday, period_number, teacher_id) values
     ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 1, 1,
      '00000000-0000-0000-0000-000000000002')$q$,
  'timetable_entries_teacher_period_unique', 'teacher cannot be in two classes in one period');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, space_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 2, 1)$q$,
  'timetable_entries_space_class_fkey', 'space not linked to the class is rejected');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, space_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, 3)$q$,
  'break', 'lesson in a break period rejected');
select public.expect_fail(
  $q$insert into timetable_entries (class_id, space_id, weekday, period_number, teacher_id) values
     ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, 2,
      '00000000-0000-0000-0000-000000000003')$q$,
  'teacher must be', 'teacher who is not in the space rejected');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Teacher A (global teacher)
select public.expect_fail(
  $q$insert into timetable_entries (class_id, space_id, weekday, period_number) values
     ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 3, 1)$q$,
  'row-level security', 'non-admin cannot write the timetable');
select public.expect_fail(
  $q$insert into timetable_periods (period_number, start_time, end_time) values (8, '14:00', '14:40')$q$,
  'row-level security', 'non-admin cannot write periods');
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 1 then raise exception 'FAIL: teacher of the space should see its lesson (got %)', cnt; end if;
  raise notice 'PASS: a teacher sees lessons for their own space';
end $$;
reset role;

-- Read isolation: who can see JSS1A's lesson?
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Student A (enrolled)
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
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- Student B (other class/space)
do $$ declare cnt int; begin
  select count(*) into cnt from timetable_entries;
  if cnt <> 0 then raise exception 'FAIL: a student outside the class can see its timetable (got %)', cnt; end if;
  raise notice 'PASS: a student in another class cannot see this timetable';
end $$;
reset role;

-- A teacher leaving the space frees their cells instead of leaving a stale id.
delete from space_members
  where space_id = '10000000-0000-0000-0000-000000000001'
    and profile_id = '00000000-0000-0000-0000-000000000002';
do $$ declare t uuid; begin
  select teacher_id into t from timetable_entries limit 1;
  if t is not null then raise exception 'FAIL: removed teacher still assigned to a lesson'; end if;
  raise notice 'PASS: removing a teacher from a space clears their timetable cells';
end $$;

-- A period with lessons can't be deleted out from under them.
select public.expect_fail($q$delete from timetable_periods where period_number = 1$q$,
  'timetable_entries_period_number_fkey', 'period with lessons cannot be deleted');

drop function public.expect_fail(text, text, text);

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
