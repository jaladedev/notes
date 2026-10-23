-- Behavioural test for 0040 (subscription gate enforced by RLS). Self-
-- contained; needs the harness to grant table privileges to `authenticated`
-- BEFORE the migrations run, as Supabase does (see 05_conversation_state.sql).
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/10_subscription_rls.sql
-- A clean run ends with "SUBSCRIPTION RLS: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('aa000000-0000-0000-0000-000000000001', 'sg-student@test.local'),
  ('aa000000-0000-0000-0000-000000000002', 'sg-teacher@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('aa000000-0000-0000-0000-000000000001', 'SG Student', 'student', 'sg-student@test.local', false),
  ('aa000000-0000-0000-0000-000000000002', 'SG Teacher', 'teacher', 'sg-teacher@test.local', false);
insert into subjects (id, name) values ('ba000000-0000-0000-0000-000000000001', 'SG Subject');
insert into conversations (id) values ('fa000000-0000-0000-0000-000000000001');
insert into conversation_members (conversation_id, profile_id) values
  ('fa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002');
insert into settings (id, school_name) values (true, 'SG School')
  on conflict (id) do update set school_name = excluded.school_name;
delete from session_subscriptions;

-- Runs as the student: can they read a table, write a table, and still
-- reach the two exempt tables the lockout flow needs?
create or replace function pg_temp.probe(p_label text)
returns text
language plpgsql
as $$
declare
  v_read int; v_write text; v_profile int; v_settings int;
begin
  perform set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  -- only this test's own subject: other test files leave subjects behind
  select count(*) into v_read from subjects where id = 'ba000000-0000-0000-0000-000000000001';
  select count(*) into v_profile from profiles where id = 'aa000000-0000-0000-0000-000000000001';
  select count(*) into v_settings from settings;
  begin
    insert into messages (conversation_id, sender_id, body)
      values ('fa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', p_label);
    v_write := 'ok';
  exception when insufficient_privilege then v_write := 'denied';
  end;
  reset role;
  return v_read || '/' || v_write || '/' || v_profile || '/' || v_settings;
end $$;

do $$
declare r text;
begin
  -- 1. no subscription rows: gating is OFF, everything works
  r := pg_temp.probe('off');
  if r <> '1/ok/1/1' then raise exception 'FAIL (off): expected 1/ok/1/1, got %', r; end if;

  -- 2. expired: tables are closed, but the lockout flow's own tables are not
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2025/2026', current_date - 400, current_date - 35, 0);
  r := pg_temp.probe('expired');
  if r <> '0/denied/1/1' then raise exception 'FAIL (expired): expected 0/denied/1/1, got %', r; end if;

  -- 3. upcoming (session starts in the future, nothing current): also locked
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2027/2028', current_date + 30, current_date + 300, 0);
  r := pg_temp.probe('upcoming');
  if r <> '0/denied/1/1' then raise exception 'FAIL (upcoming): expected 0/denied/1/1, got %', r; end if;

  -- 4. grace: a lapsed session inside its grace window is NOT a lockout
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2025/2026', current_date - 100, current_date - 5, 14);
  if (select state from subscription_status()) <> 'grace' then raise exception 'FAIL: setup did not produce grace'; end if;
  r := pg_temp.probe('grace');
  if r <> '1/ok/1/1' then raise exception 'FAIL (grace): expected 1/ok/1/1, got %', r; end if;

  -- 5. active
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2026/2027', current_date - 10, current_date + 200, 0);
  r := pg_temp.probe('active');
  if r <> '1/ok/1/1' then raise exception 'FAIL (active): expected 1/ok/1/1, got %', r; end if;

  raise notice 'ok 1: off/active/grace allow access; expired/upcoming close tables but not profiles/settings';
end $$;

-- 6. the gate holds for every role that is not the service role, and the
--    privileged path is unaffected
do $$
declare v_n int; v_as_teacher int;
begin
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2025/2026', current_date - 400, current_date - 35, 0);

  perform set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into v_as_teacher from subjects where id = 'ba000000-0000-0000-0000-000000000001';
  reset role;
  if v_as_teacher <> 0 then raise exception 'FAIL: a lapsed school''s teacher can still read subjects'; end if;

  -- the superuser / service path bypasses RLS, so platform + admin-client code keeps working
  select count(*) into v_n from subjects where id = 'ba000000-0000-0000-0000-000000000001';
  if v_n <> 1 then raise exception 'FAIL: privileged access was blocked by the gate'; end if;
  raise notice 'ok 2: teachers are gated too; the privileged (service) path is unaffected';
end $$;

-- 7. coverage: every RLS table is gated except the exempt ones, and a new
--    table that is not gated gets caught
do $$
declare v_missing text[]; v_fixed text[]; v_exempt_gated int;
begin
  select coalesce(array_agg(t), '{}') into v_missing from tables_missing_subscription_gate() t;
  if cardinality(v_missing) <> 0 then raise exception 'FAIL: ungated tables: %', v_missing; end if;

  select count(*) into v_exempt_gated from pg_policy p join pg_class c on c.oid = p.polrelid
    where p.polname = 'subscription_gate' and c.relname = any (subscription_gate_exempt());
  if v_exempt_gated <> 0 then raise exception 'FAIL: an exempt table (profiles/settings/session_subscriptions) was gated'; end if;

  create table public.sg_new_table (id int primary key);
  alter table public.sg_new_table enable row level security;
  select coalesce(array_agg(t), '{}') into v_missing from tables_missing_subscription_gate() t;
  if v_missing <> array['sg_new_table'] then raise exception 'FAIL: a new table was not flagged, got %', v_missing; end if;

  select coalesce(array_agg(t), '{}') into v_fixed from apply_subscription_gate() t;
  if v_fixed <> array['sg_new_table'] then raise exception 'FAIL: apply_subscription_gate gated %', v_fixed; end if;
  if exists (select 1 from tables_missing_subscription_gate()) then raise exception 'FAIL: still missing after apply'; end if;
  -- idempotent
  if exists (select 1 from apply_subscription_gate()) then raise exception 'FAIL: second apply gated something again'; end if;

  drop table public.sg_new_table;
  raise notice 'ok 3: all 27 tables gated; exempt tables left alone; a new ungated table is caught and fixed';
end $$;

-- 8. app users cannot run the DDL helpers
do $$
declare v_failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin perform * from apply_subscription_gate(); exception when insufficient_privilege then v_failed := true; end;
  reset role;
  if not v_failed then raise exception 'FAIL: a student can run apply_subscription_gate()'; end if;
  raise notice 'ok 4: students cannot run apply_subscription_gate()';
end $$;

delete from session_subscriptions;  -- leave gating OFF for any test that runs after this one
select 'SUBSCRIPTION RLS: ALL ASSERTIONS PASSED' as result;
