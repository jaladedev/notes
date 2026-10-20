-- Behavioural test for 0034 (parent_children). Self-contained.
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/06_parent_children.sql
-- A clean run ends with "PARENT CHILDREN: ALL ASSERTIONS PASSED".

insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000001', 'pc-parent1@test.local'),
  ('a4000000-0000-0000-0000-000000000002', 'pc-parent2@test.local'),
  ('a4000000-0000-0000-0000-000000000003', 'pc-kid1@test.local'),
  ('a4000000-0000-0000-0000-000000000004', 'pc-kid2@test.local'),
  ('a4000000-0000-0000-0000-000000000005', 'pc-nobody@test.local');
insert into profiles (id, full_name, role, email, must_change_password) values
  ('a4000000-0000-0000-0000-000000000001', 'PC Parent One', 'parent', 'pc-parent1@test.local', false),
  ('a4000000-0000-0000-0000-000000000002', 'PC Parent Two', 'parent', 'pc-parent2@test.local', false),
  ('a4000000-0000-0000-0000-000000000003', 'PC Kid One', 'student', 'pc-kid1@test.local', false),
  ('a4000000-0000-0000-0000-000000000004', 'PC Kid Two', 'student', 'pc-kid2@test.local', false),
  ('a4000000-0000-0000-0000-000000000005', 'PC Nobody', 'student', 'pc-nobody@test.local', false);
insert into guardian_links (parent_id, student_id) values
  ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003'),
  ('a4000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000004');

do $$
declare
  v_names text[];
  v_n int;
  v_failed boolean;
begin
  -- parent one sees only kid one
  perform set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  select array_agg(full_name) into v_names from parent_children();
  if v_names is distinct from array['PC Kid One'] then
    raise exception 'FAIL: parent one should see only their child, got %', v_names;
  end if;

  -- returns exactly id + full_name (no email / flags)
  select count(*) into v_n from information_schema.parameters
    where specific_schema = 'public' and specific_name like 'parent_children%' and parameter_mode = 'OUT';
  if v_n <> 2 then raise exception 'FAIL: parent_children should return exactly 2 columns, found %', v_n; end if;

  -- the child's other columns remain unreadable to the parent
  select count(*) into v_n from profiles where id = 'a4000000-0000-0000-0000-000000000003';
  if v_n <> 0 then raise exception 'FAIL: parent can read the child''s profile row directly'; end if;
  reset role;

  -- a student with no links, and a linked child themself, see nothing
  perform set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000005', true);
  set local role authenticated;
  select count(*) into v_n from parent_children();
  reset role;
  if v_n <> 0 then raise exception 'FAIL: unlinked user saw % children', v_n; end if;

  perform set_config('request.jwt.claim.sub', 'a4000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  select count(*) into v_n from parent_children();
  reset role;
  if v_n <> 0 then raise exception 'FAIL: a student saw % children', v_n; end if;

  -- anonymous callers cannot execute it at all
  set local role anon;
  v_failed := false;
  begin
    perform parent_children();
  exception when insufficient_privilege then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'FAIL: anon can execute parent_children()'; end if;

  raise notice 'ok: parents see only their own children (id + name only); everyone else sees nothing';
end $$;

select 'PARENT CHILDREN: ALL ASSERTIONS PASSED' as result;
