-- Behavioural test for 0036 (per-session subscription gating). Self-contained.
-- Needs the harness setup from README.md (migrations applied, table/function
-- grants to `authenticated` done), then:
--
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/09_subscription.sql
--
-- A clean run ends with "SUBSCRIPTION: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-000000000001', 'sub-admin@test.local'),
  ('a9000000-0000-0000-0000-000000000002', 'sub-student@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('a9000000-0000-0000-0000-000000000001', 'Sub Admin', 'admin', 'sub-admin@test.local', false),
  ('a9000000-0000-0000-0000-000000000002', 'Sub Student', 'student', 'sub-student@test.local', false);

-- 1. empty table = gating off
do $$
declare s record;
begin
  delete from session_subscriptions;
  select * into s from subscription_status();
  if s.state <> 'off' then raise exception 'FAIL: empty table gave state %', s.state; end if;
  raise notice 'ok 1: an empty table means gating is off';
end $$;

-- 2. active / days_left / expired / upcoming
do $$
declare s record;
begin
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on)
    values ('2025/2026', current_date - 400, current_date - 35);
  select * into s from subscription_status();
  if s.state <> 'expired' or s.academic_year <> '2025/2026' then
    raise exception 'FAIL: only a past session should be expired, got % / %', s.state, s.academic_year;
  end if;
  raise notice 'ok 2a: a past session is expired';

  insert into session_subscriptions (academic_year, starts_on, ends_on)
    values ('2027/2028', current_date + 30, current_date + 300);
  select * into s from subscription_status();
  if s.state <> 'upcoming' or s.academic_year <> '2027/2028' then
    raise exception 'FAIL: a future session with no active one should be upcoming, got %', s.state;
  end if;
  raise notice 'ok 2b: not active now but a later session exists is upcoming';

  insert into session_subscriptions (academic_year, starts_on, ends_on)
    values ('2026/2027', current_date - 10, current_date + 9);
  select * into s from subscription_status();
  if s.state <> 'active' or s.academic_year <> '2026/2027' or s.days_left <> 9 then
    raise exception 'FAIL: active session wrong: % / % / %', s.state, s.academic_year, s.days_left;
  end if;
  raise notice 'ok 2c: an active session wins and reports days_left';

  update session_subscriptions set ends_on = current_date where academic_year = '2026/2027';
  select * into s from subscription_status();
  if s.state <> 'active' or s.days_left <> 0 then
    raise exception 'FAIL: the end date itself should still be active (days_left 0), got % / %', s.state, s.days_left;
  end if;
  raise notice 'ok 2d: the last day is still active';
end $$;

-- 3. a student can learn the status but cannot read or write the table
do $$
declare
  s record;
  v_n int;
  v_failed boolean;
begin
  perform set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000002', true);
  set local role authenticated;

  select * into s from subscription_status();
  if s.state is null then raise exception 'FAIL: a student could not read the status'; end if;

  select count(*) into v_n from session_subscriptions;
  if v_n <> 0 then raise exception 'FAIL: a student read % subscription rows', v_n; end if;

  v_failed := false;
  begin
    insert into session_subscriptions (academic_year, starts_on, ends_on)
      values ('2099/2100', current_date, current_date + 1);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: a student inserted a subscription'; end if;

  reset role;
  raise notice 'ok 3: a student sees the status only; no rows, no writes';
end $$;

-- 4. an admin can read the rows but still cannot extend them
do $$
declare
  v_n int;
  v_rows int;
  v_failed boolean;
begin
  perform set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-000000000001', true);
  set local role authenticated;

  select count(*) into v_n from session_subscriptions;
  if v_n < 1 then raise exception 'FAIL: the admin could not read subscriptions'; end if;

  v_failed := false;
  begin
    insert into session_subscriptions (academic_year, starts_on, ends_on)
      values ('2099/2100', current_date, current_date + 1);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: the school admin inserted a subscription'; end if;

  with u as (
    update session_subscriptions set ends_on = current_date + 3650 returning 1)
  select count(*) into v_rows from u;
  if v_rows <> 0 then raise exception 'FAIL: the school admin extended a subscription (% rows)', v_rows; end if;

  with d as (delete from session_subscriptions returning 1)
  select count(*) into v_rows from d;
  if v_rows <> 0 then raise exception 'FAIL: the school admin deleted % subscriptions', v_rows; end if;

  reset role;
  raise notice 'ok 4: an admin can read but not insert, extend or delete';
end $$;

-- 5. a bad date range is rejected
do $$
declare v_failed boolean := false;
begin
  begin
    insert into session_subscriptions (academic_year, starts_on, ends_on)
      values ('bad', current_date, current_date - 1);
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: ends_on before starts_on was accepted'; end if;
  raise notice 'ok 5: ends_on before starts_on is rejected';
end $$;

delete from session_subscriptions;
do $$ begin raise notice 'SUBSCRIPTION: ALL ASSERTIONS PASSED'; end $$;
