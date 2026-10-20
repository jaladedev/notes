-- Behavioural test for 0035 (topic themes + week ranges): the CHECK
-- constraints. (The backfill of existing rows is exercised separately by
-- applying 0035 onto a database that already holds topics.) Self-contained.
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/07_topic_weeks.sql
-- A clean run ends with "TOPIC WEEKS: ALL ASSERTIONS PASSED".

insert into subjects (id, name) values ('b7000000-0000-0000-0000-000000000001', 'TW Maths');

do $$
declare
  v_failed boolean;
  v_end int;
begin
  -- valid shapes: no week, single week, range, with/without theme
  insert into topics (subject_id, title, education_level, level_number, academic_year, term)
    values ('b7000000-0000-0000-0000-000000000001', 'no week', 'jss', 1, '2026/2027', 1);
  insert into topics (subject_id, title, education_level, level_number, academic_year, term, week_number, week_end_number, theme)
    values ('b7000000-0000-0000-0000-000000000001', 'range', 'jss', 1, '2026/2027', 1, 2, 3, 'Number and Numeration');
  insert into topics (subject_id, title, education_level, level_number, academic_year, term, week_number, week_end_number)
    values ('b7000000-0000-0000-0000-000000000001', 'single', 'jss', 1, '2026/2027', 1, 4, 4);

  -- end before start
  v_failed := false;
  begin
    insert into topics (subject_id, title, education_level, level_number, academic_year, term, week_number, week_end_number)
      values ('b7000000-0000-0000-0000-000000000001', 'bad', 'jss', 1, '2026/2027', 1, 5, 4);
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: end week before start week accepted'; end if;

  -- end week with no start week
  v_failed := false;
  begin
    insert into topics (subject_id, title, education_level, level_number, academic_year, term, week_end_number)
      values ('b7000000-0000-0000-0000-000000000001', 'orphan end', 'jss', 1, '2026/2027', 1, 3);
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: end week without a start week accepted'; end if;

  -- blank / over-long theme
  v_failed := false;
  begin
    insert into topics (subject_id, title, education_level, level_number, academic_year, term, theme)
      values ('b7000000-0000-0000-0000-000000000001', 'blank theme', 'jss', 1, '2026/2027', 1, '   ');
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: blank theme accepted'; end if;

  v_failed := false;
  begin
    insert into topics (subject_id, title, education_level, level_number, academic_year, term, theme)
      values ('b7000000-0000-0000-0000-000000000001', 'long theme', 'jss', 1, '2026/2027', 1, repeat('x', 121));
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: 121-char theme accepted'; end if;

  -- clearing the start week of a ranged topic must also clear the end
  v_failed := false;
  begin
    update topics set week_number = null where title = 'range';
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL: removing the start week left a dangling end week'; end if;

  raise notice 'ok: week-range and theme constraints hold';
end $$;

select 'TOPIC WEEKS: ALL ASSERTIONS PASSED' as result;
