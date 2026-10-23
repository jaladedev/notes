-- Behavioural test for 0042: the SECURITY DEFINER RPCs honour the subscription gate.
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/11_subscription_rpc_gate.sql
-- Needs the harness grants from README.md. A clean run ends with
-- "SUBSCRIPTION RPC GATE: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('ac000000-0000-0000-0000-000000000001', 'rg-parent@test.local'),
  ('ac000000-0000-0000-0000-000000000002', 'rg-student@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('ac000000-0000-0000-0000-000000000001', 'RG Parent', 'parent', 'rg-parent@test.local', false),
  ('ac000000-0000-0000-0000-000000000002', 'RG Student', 'student', 'rg-student@test.local', false);
insert into guardian_links (parent_id, student_id) values
  ('ac000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002');
delete from session_subscriptions;

-- Runs fn as the given user; returns 'ok', 'gated' (our 42501), or the other error text.
create or replace function pg_temp.call_as(p_user uuid, p_sql text)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql;
    v := 'ok';
  exception
    when insufficient_privilege then v := 'gated';
    when others then v := 'other: ' || sqlerrm;
  end;
  reset role;
  return v;
end $$;

do $$
declare
  parent uuid := 'ac000000-0000-0000-0000-000000000001';
  student uuid := 'ac000000-0000-0000-0000-000000000002';
  calls text[] := array[
    'select * from get_quiz_attempt_questions(''' || '00000000-0000-0000-0000-000000000000' || ''')',
    'select * from get_quiz_attempt_review(''' || '00000000-0000-0000-0000-000000000000' || ''')',
    'select * from submit_quiz_attempt(''' || '00000000-0000-0000-0000-000000000000' || ''')',
    'select * from grade_essay_answer(''' || '00000000-0000-0000-0000-000000000000' || ''', ''' || '00000000-0000-0000-0000-000000000000' || ''', 0, null)'
  ];
  c text; r text; n int;
begin
  -- parent_children() is a plain SQL function: when gated it returns zero rows
  -- rather than raising, so it is asserted separately from the four that raise.
  -- 1. gating off (no subscription rows): the guard passes. Calls on a missing
  --    attempt fail for their own reason, never with the gate's 42501.
  foreach c in array calls loop
    r := pg_temp.call_as(student, c);
    if r = 'gated' then raise exception 'FAIL (off): gate fired with no subscription rows: %', c; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', parent::text, true);
  set local role authenticated;
  select count(*) into n from parent_children();
  reset role;
  if n <> 1 then raise exception 'FAIL (off): parent_children returned % rows, expected 1', n; end if;

  -- 2. expired: every RPC is closed
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2025/2026', current_date - 400, current_date - 35, 0);
  foreach c in array calls loop
    r := pg_temp.call_as(student, c);
    if r <> 'gated' then raise exception 'FAIL (expired): expected gated, got % for %', r, c; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', parent::text, true);
  set local role authenticated;
  select count(*) into n from parent_children();
  reset role;
  if n <> 0 then raise exception 'FAIL (expired): parent_children still returned % rows', n; end if;

  -- 3. grace: still open
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2025/2026', current_date - 100, current_date - 5, 14);
  foreach c in array calls loop
    r := pg_temp.call_as(student, c);
    if r = 'gated' then raise exception 'FAIL (grace): gate fired during grace: %', c; end if;
  end loop;

  -- 4. active: parent_children works again
  delete from session_subscriptions;
  insert into session_subscriptions (academic_year, starts_on, ends_on, grace_days)
    values ('2026/2027', current_date - 10, current_date + 200, 0);
  perform set_config('request.jwt.claim.sub', parent::text, true);
  set local role authenticated;
  select count(*) into n from parent_children();
  reset role;
  if n <> 1 then raise exception 'FAIL (active): parent_children returned % rows', n; end if;

  raise notice 'ok: all five RPCs closed when expired, open when off/grace/active';
end $$;

delete from session_subscriptions;  -- leave gating OFF for any test that runs after this one
select 'SUBSCRIPTION RPC GATE: ALL ASSERTIONS PASSED' as result;
