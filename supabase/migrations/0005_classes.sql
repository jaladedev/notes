-- Adds a real `classes` entity with its own roster, closing the gap
-- from 0004: previously every space had its own independent student
-- membership, so "JSS2A Basic Science" and "JSS2A Mathematics" needed
-- the same students added twice. Now a space can optionally belong to
-- a class, and any student in that class's roster can read every
-- space tied to it -- enroll once, not per subject.
--
-- Staff (teacher/reviewer/admin) still work exactly as before, via
-- space_members -- a class roster is students only. This mirrors
-- school_app: a student belongs to one class; a teacher is assigned
-- per subject/space, not per class.

create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  education_level education_level,
  level_number integer
);

create table class_members (
  class_id uuid not null references classes(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (class_id, profile_id)
);

alter table spaces add column class_id uuid references classes(id);

alter table classes enable row level security;
alter table class_members enable row level security;

-- Readable by anyone signed in (same reasoning as subjects in 0004 --
-- shared catalog data, not per-space content). Only an existing
-- space's admin can create a class (checked in app code via
-- assertSpaceRole before calling the admin client -- same
-- chicken-and-egg reasoning as createSubject in 0004: a brand-new
-- admin creating their first class has no space yet to check against,
-- so this goes through the admin client rather than an insert policy).
create policy classes_read_all on classes for select to public using (true);

-- A student needs to see their own class_members row (e.g. "which
-- classes am I in"); staff need to see a class's full roster to manage
-- it -- checked via any space that references this class.
create policy class_members_visible on class_members for select to public
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from spaces s join space_members m on m.space_id = s.id
      where s.class_id = class_members.class_id
        and m.profile_id = auth.uid()
        and m.role in ('teacher', 'reviewer', 'admin')
    )
  );

-- A student's membership in a class makes them a reader of every space
-- tied to that class -- this is the actual "enroll once" mechanism.
-- Used everywhere a policy previously checked space_members alone for
-- read access.
create or replace function public.is_space_reader(p_space_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members m where m.space_id = p_space_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from spaces s
    join class_members cm on cm.class_id = s.class_id
    where s.id = p_space_id and cm.profile_id = auth.uid()
  );
$$;

-- Replace the read policies that previously checked space_members
-- directly -- write policies (staff-only) are untouched, since a class
-- roster never grants write access.

drop policy if exists topics_member on topics;
create policy topics_member on topics for select to public
  using (is_space_reader(topics.space_id));

drop policy if exists resources_visible on topic_resources;
create policy resources_visible on topic_resources for select to public
  using (
    note_id is null
    or topic_note_visible(note_id)
    or exists (
      select 1 from topics t where t.id = topic_id and (
        exists (select 1 from space_members m where m.space_id = t.space_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin'))
      )
    )
  );

drop policy if exists schedule_slots_member on schedule_slots;
create policy schedule_slots_member on schedule_slots for select to public
  using (exists (
    select 1 from topics t where t.id = topic_id and is_space_reader(t.space_id)
  ));

drop policy if exists spaces_member on spaces;
create policy spaces_member on spaces for select to public
  using (is_space_reader(spaces.id));

-- topic_note_visible()'s final "published, approved, released" branch
-- checked space_members directly -- swap in is_space_reader so a
-- class-enrolled student (not directly a space_members row) also
-- passes.
create or replace function public.topic_note_visible(p_note_id uuid)
returns boolean language plpgsql security definer stable as $$
declare
  n record;
begin
  select status, moderation_status, author_id, topic_id, release_at
  into n from topic_notes where id = p_note_id;

  if n.status = 'draft' then
    return n.author_id = auth.uid() or is_reviewer_of_topic(n.topic_id);
  end if;

  if n.author_id = auth.uid() or is_reviewer_of_topic(n.topic_id) then
    return true;
  end if;

  if n.moderation_status <> 'approved' then
    return false;
  end if;

  if n.release_at is not null and n.release_at > now() then
    return false;
  end if;

  return exists (
    select 1 from topics t where t.id = n.topic_id and is_space_reader(t.space_id)
  );
end;
$$;
