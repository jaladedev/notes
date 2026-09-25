-- School-level timetable: one bell schedule for the whole school, and a
-- class x weekday x period grid where each cell is one lesson (a space,
-- usually with a teacher and a room). Replaces the per-topic
-- `schedule_slots` from 0002, which only fed the BellTimer and had no
-- notion of a class, a shared bell schedule, or clashes.
--
-- Design notes:
--  * Periods are defined once (timetable_periods) so "period 3" means the
--    same clock time for every class. Break rows (is_break) show in the
--    grid but can't hold a lesson.
--  * A lesson's class and space must agree: the composite FK to
--    spaces(id, class_id) means a space that isn't linked to the class
--    can't be timetabled for it (spaces.class_id is set in space settings).
--  * Clashes are enforced by the database, not just the UI: a class has
--    one lesson per period, and a teacher can't be in two places in the
--    same period. Rooms are NOT clash-checked (shared halls, labs and
--    fields are legitimately double-booked by design in many schools).
--  * Recurring weekly; there is no term/year dimension. Change the grid
--    when the timetable changes.
--  * schedule_slots is left in place (forward-only migrations, and a
--    deployment may hold rows) but nothing reads or writes it any more.
--    Drop it in a later migration once no deployment needs the data.

alter table settings add column timezone text not null default 'Africa/Lagos';
comment on column settings.timezone is
  'IANA zone used to decide which weekday/time "now" is for the bell timer.';

-- The existing write policy only admitted space admins; a global admin
-- (profiles.role = 'admin') must be able to change school settings too.
drop policy if exists settings_write_admin on settings;
create policy settings_write_admin on settings for update to public
  using (
    is_admin()
    or exists (select 1 from space_members m where m.profile_id = auth.uid() and m.role = 'admin')
  );

create table timetable_periods (
  period_number integer primary key check (period_number > 0),
  label text,
  start_time time not null,
  end_time time not null,
  is_break boolean not null default false,
  constraint timetable_periods_time_order check (start_time < end_time)
);

create or replace function public.timetable_periods_guard()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from timetable_periods p
    where p.period_number <> new.period_number
      and p.start_time < new.end_time
      and new.start_time < p.end_time
  ) then
    raise exception 'Period times overlap another period.' using errcode = 'check_violation';
  end if;

  if new.is_break and exists (
    select 1 from timetable_entries e where e.period_number = new.period_number
  ) then
    raise exception 'Remove this period''s lessons before marking it as a break.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Target of timetable_entries' composite FK below. Trivially unique
-- because id is already the primary key.
alter table spaces add constraint spaces_id_class_unique unique (id, class_id);

-- (timetable_periods_guard above reads timetable_entries; plpgsql bodies
-- are resolved at run time, so it's fine that the table comes next.)
create table timetable_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  space_id uuid not null,
  weekday integer not null check (weekday between 1 and 7), -- 1=Mon .. 7=Sun
  period_number integer not null
    references timetable_periods(period_number) on update cascade on delete restrict,
  teacher_id uuid references profiles(id) on delete set null,
  room text check (room is null or char_length(room) <= 40),
  created_at timestamptz not null default now(),
  constraint timetable_entries_class_period_unique unique (class_id, weekday, period_number),
  constraint timetable_entries_space_class_fkey
    foreign key (space_id, class_id) references spaces(id, class_id)
    on update cascade on delete cascade
);

create unique index timetable_entries_teacher_period_unique
  on timetable_entries (teacher_id, weekday, period_number)
  where teacher_id is not null;

create trigger timetable_periods_guard_trg
  before insert or update on timetable_periods
  for each row execute function public.timetable_periods_guard();

create or replace function public.timetable_entries_guard()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from timetable_periods p
    where p.period_number = new.period_number and p.is_break
  ) then
    raise exception 'A lesson can''t be scheduled in a break period.' using errcode = 'check_violation';
  end if;

  if new.teacher_id is not null and not exists (
    select 1 from space_members m
    where m.space_id = new.space_id and m.profile_id = new.teacher_id
      and m.role in ('teacher', 'admin')
  ) then
    raise exception 'The teacher must be a teacher in this space.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger timetable_entries_guard_trg
  before insert or update on timetable_entries
  for each row execute function public.timetable_entries_guard();

-- If a teacher leaves a space (or stops being a teacher in it), free their
-- timetable cells instead of leaving a stale teacher_id behind. SECURITY
-- DEFINER because the space admin removing them can't write timetable rows.
create or replace function public.timetable_release_teacher()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' or new.role not in ('teacher', 'admin') then
    update timetable_entries
    set teacher_id = null
    where space_id = old.space_id and teacher_id = old.profile_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger space_members_release_teacher_trg
  after delete or update of role on space_members
  for each row execute function public.timetable_release_teacher();

alter table timetable_periods enable row level security;
alter table timetable_entries enable row level security;

create policy timetable_periods_read on timetable_periods for select to public
  using (exists (select 1 from profiles where id = auth.uid() and is_active));

create policy timetable_periods_write_admin on timetable_periods for all to public
  using (is_admin()) with check (is_admin());

-- is_space_reader() already covers direct members, class-enrolled
-- students and (0007) their parents, so a lesson is visible to exactly
-- the people who can read its space. Admins see everything.
create policy timetable_entries_read on timetable_entries for select to public
  using (
    exists (select 1 from profiles where id = auth.uid() and is_active)
    and (is_admin() or is_space_reader(space_id))
  );

create policy timetable_entries_write_admin on timetable_entries for all to public
  using (is_admin()) with check (is_admin());

comment on table schedule_slots is
  'Deprecated by timetable_entries (0011). Unused; drop once no deployment needs the data.';
