-- Behavioural test for 0033 (conversation archive/delete + read-marking
-- fix). Self-contained. Requires the harness to grant table privileges to
-- `authenticated` BEFORE the migrations run (as Supabase does by default),
-- so the migration's own REVOKE/GRANT is what is tested:
--
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/05_conversation_state.sql
--
-- A clean run ends with "CONVERSATION STATE: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('a3000000-0000-0000-0000-000000000001', 'cs-a@test.local'),
  ('a3000000-0000-0000-0000-000000000002', 'cs-b@test.local'),
  ('a3000000-0000-0000-0000-000000000003', 'cs-c@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('a3000000-0000-0000-0000-000000000001', 'CS A', 'teacher', 'cs-a@test.local', false),
  ('a3000000-0000-0000-0000-000000000002', 'CS B', 'teacher', 'cs-b@test.local', false),
  ('a3000000-0000-0000-0000-000000000003', 'CS C', 'teacher', 'cs-c@test.local', false);
insert into conversations (id) values
  ('f3000000-0000-0000-0000-000000000001'),   -- A <-> B
  ('f3000000-0000-0000-0000-000000000002');   -- B <-> C (A must never be able to join this)
insert into conversation_members (conversation_id, profile_id, last_read_at) values
  ('f3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('f3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('f3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', now() - interval '1 day'),
  ('f3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000003', now() - interval '1 day');

-- 1. read-marking now works (it updated 0 rows before 0033)
do $$
declare v_n int;
begin
  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  with u as (
    update conversation_members set last_read_at = now()
    where conversation_id = 'f3000000-0000-0000-0000-000000000001'
      and profile_id = 'a3000000-0000-0000-0000-000000000001'
    returning 1)
  select count(*) into v_n from u;
  reset role;
  if v_n <> 1 then raise exception 'FAIL: marking own conversation read updated % rows', v_n; end if;
  raise notice 'ok 1: a member can update their own last_read_at';
end $$;

-- 2. but only their own row, and only the three state columns
do $$
declare
  v_n int;
  v_failed boolean;
begin
  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  with u as (
    update conversation_members set archived_at = now()
    where conversation_id = 'f3000000-0000-0000-0000-000000000001'
      and profile_id = 'a3000000-0000-0000-0000-000000000002'
    returning 1)
  select count(*) into v_n from u;
  if v_n <> 0 then raise exception 'FAIL: A archived B''s copy of the conversation'; end if;

  -- cannot re-point own membership row at someone else's conversation
  v_failed := false;
  begin
    update conversation_members set conversation_id = 'f3000000-0000-0000-0000-000000000002'
    where conversation_id = 'f3000000-0000-0000-0000-000000000001'
      and profile_id = 'a3000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: member could change conversation_id (join any conversation)'; end if;

  v_failed := false;
  begin
    update conversation_members set profile_id = 'a3000000-0000-0000-0000-000000000003'
    where conversation_id = 'f3000000-0000-0000-0000-000000000001'
      and profile_id = 'a3000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: member could change profile_id'; end if;
  reset role;
  raise notice 'ok 2: updates limited to own row and to last_read_at/archived_at/deleted_at';
end $$;

-- 3. archive is per member; a new message un-archives for everyone
do $$
declare v_a timestamptz; v_b timestamptz;
begin
  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  update conversation_members set archived_at = now()
    where conversation_id = 'f3000000-0000-0000-0000-000000000001'
      and profile_id = 'a3000000-0000-0000-0000-000000000001';
  reset role;

  select archived_at into v_a from conversation_members
    where conversation_id = 'f3000000-0000-0000-0000-000000000001' and profile_id = 'a3000000-0000-0000-0000-000000000001';
  select archived_at into v_b from conversation_members
    where conversation_id = 'f3000000-0000-0000-0000-000000000001' and profile_id = 'a3000000-0000-0000-0000-000000000002';
  if v_a is null then raise exception 'FAIL: archive did not stick'; end if;
  if v_b is not null then raise exception 'FAIL: archiving leaked to the other member'; end if;

  -- B writes: A's archived conversation comes back
  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  insert into messages (conversation_id, sender_id, body)
    values ('f3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'hello again');
  reset role;
  select archived_at into v_a from conversation_members
    where conversation_id = 'f3000000-0000-0000-0000-000000000001' and profile_id = 'a3000000-0000-0000-0000-000000000001';
  if v_a is not null then raise exception 'FAIL: new message did not un-archive the conversation'; end if;
  raise notice 'ok 3: archive is per member and a new message un-archives it';
end $$;

-- 4. delete is per member and leaves the messages themselves intact
do $$
declare v_msgs int; v_b_deleted timestamptz;
begin
  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  update conversation_members set deleted_at = now()
    where conversation_id = 'f3000000-0000-0000-0000-000000000001'
      and profile_id = 'a3000000-0000-0000-0000-000000000001';
  reset role;

  select count(*) into v_msgs from messages where conversation_id = 'f3000000-0000-0000-0000-000000000001';
  if v_msgs <> 1 then raise exception 'FAIL: deleting for A removed shared messages (% left)', v_msgs; end if;
  select deleted_at into v_b_deleted from conversation_members
    where conversation_id = 'f3000000-0000-0000-0000-000000000001' and profile_id = 'a3000000-0000-0000-0000-000000000002';
  if v_b_deleted is not null then raise exception 'FAIL: delete leaked to the other member'; end if;
  raise notice 'ok 4: delete is per member; shared messages are untouched';
end $$;

select 'CONVERSATION STATE: ALL ASSERTIONS PASSED' as result;
