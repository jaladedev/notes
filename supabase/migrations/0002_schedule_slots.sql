-- Optional weekly schedule, for BellTimer in Present mode (plan doc
-- section 5). Generalized from school_app's timetable_entries:
--   class_id + subject_id + teacher_id  -> topic_id (a topic already
--     belongs to one space/teacher; no separate class/subject needed)
--   academic_year + term                -> dropped (no term concept
--     in this app -- a slot just recurs weekly until removed/edited)

create table schedule_slots (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 7), -- 1=Mon .. 7=Sun, same convention as school_app
  period_number integer not null,
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz not null default now()
);

alter table schedule_slots enable row level security;

create policy schedule_slots_member on schedule_slots for select to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid()
  ));

create policy schedule_slots_write_staff on schedule_slots for all to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ))
  with check (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));
