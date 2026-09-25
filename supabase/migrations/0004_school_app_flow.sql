-- Adopts school_app's curriculum structure: subject + education level +
-- level number + academic year + term, instead of a bare space name.
-- Kept as columns ON spaces rather than replacing it with a new table,
-- so every existing RLS policy, action, and page keyed on space_id
-- keeps working unchanged -- a space now just carries more structure
-- about what it represents (one class's one subject for one term).

create type education_level as enum ('primary', 'jss', 'sss');

create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

alter table subjects enable row level security;

-- Subjects are shared catalog data (like a dropdown list) -- readable
-- by anyone signed in. Writes go through createSubject's admin client
-- (see lib/actions/notes.ts) rather than a policy here, since a
-- brand-new admin's first subject is created before they have any
-- space_members row a policy could check against.
create policy subjects_read_all on subjects for select to public using (true);

alter table spaces
  add column subject_id uuid references subjects(id),
  add column education_level education_level,
  add column level_number integer,
  add column academic_year text,
  add column term integer check (term between 1 and 3);

-- Two spaces for the exact same class+subject+term would be confusing
-- (which one is current?) -- enforce uniqueness the way school_app's
-- curriculum_topics grouping implicitly does, but only when all the
-- structured fields are actually set (a space can still be created
-- without them, for anything that doesn't fit this grid).
create unique index spaces_unique_curriculum_slot
  on spaces (subject_id, education_level, level_number, academic_year, term)
  where subject_id is not null
    and education_level is not null
    and level_number is not null
    and academic_year is not null
    and term is not null;

-- Mirrors school_app's week_number gate (curriculum_topics.week_number)
-- for display/ordering. The actual visibility gate stays
-- topic_notes.release_at (already built and working) -- week_number
-- here is metadata a teacher can use to label/sort topics by week,
-- not a second enforcement mechanism.
alter table topics add column week_number integer;
