-- Standalone notes delivery system: initial schema, v3 (one Supabase
-- project per school -- see notes-delivery-plan.md section 5).
-- No org_id anywhere: isolation is the whole project, not a column.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type space_role as enum ('teacher', 'reviewer', 'admin', 'student');

create table space_members (
  space_id uuid not null references spaces(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role space_role not null,
  created_at timestamptz not null default now(),
  primary key (space_id, profile_id)
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  title text not null,
  sequence_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Append-only: publishing a revision never overwrites an earlier draft
-- or published copy (ported reasoning from school_app's saveTopicNote).
create table topic_notes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  author_id uuid not null references profiles(id),
  content text not null,
  status text not null check (status in ('draft', 'published')),
  moderation_status text not null default 'approved' check (moderation_status in ('approved', 'pending')),
  version integer not null,
  release_at timestamptz,
  created_at timestamptz not null default now(),
  unique (topic_id, version)
);

-- Single scratch row per (topic, author) for periodic autosave --
-- deliberately not versioned (see notes.ts doc comment).
create table topic_note_drafts (
  topic_id uuid not null references topics(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (topic_id, author_id)
);

create table topic_resources (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  note_id uuid references topic_notes(id) on delete set null,
  resource_type text not null,
  title text,
  file_url text,
  sequence_order integer not null default 0,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table topic_reads (
  topic_id uuid not null references topics(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  first_read_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (topic_id, student_id)
);

create table share_links (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  token text not null unique,
  access_code text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table settings (
  id boolean primary key default true check (id),
  requires_review boolean not null default false,
  school_name text
);
insert into settings (id) values (true);

-- ---------- Visibility ----------
-- Ported from school_app's topic_note_visible() (2026_07_29f), generalized
-- from subject+HOD to space+reviewer, and from is_hod_of_topic() the same way.

create or replace function public.is_reviewer_of_topic(p_topic_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from topics t
    join space_members m on m.space_id = t.space_id
    where t.id = p_topic_id
      and m.profile_id = auth.uid()
      and m.role in ('reviewer', 'admin')
  );
$$;

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

  -- published: visible to author/reviewer regardless of moderation
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
    select 1 from topics t
    join space_members m on m.space_id = t.space_id
    where t.id = n.topic_id and m.profile_id = auth.uid()
  );
end;
$$;

-- ---------- RLS ----------

alter table profiles enable row level security;
alter table spaces enable row level security;
alter table space_members enable row level security;
alter table topics enable row level security;
alter table topic_notes enable row level security;
alter table topic_note_drafts enable row level security;
alter table topic_resources enable row level security;
alter table topic_reads enable row level security;
alter table share_links enable row level security;
alter table settings enable row level security;

create policy profiles_self on profiles for select to public
  using (id = auth.uid());

create policy spaces_member on spaces for select to public
  using (exists (select 1 from space_members m where m.space_id = id and m.profile_id = auth.uid()));

create policy space_members_self on space_members for select to public
  using (profile_id = auth.uid() or exists (
    select 1 from space_members m2 where m2.space_id = space_id and m2.profile_id = auth.uid() and m2.role = 'admin'
  ));

create policy topics_member on topics for select to public
  using (exists (select 1 from space_members m where m.space_id = topics.space_id and m.profile_id = auth.uid()));

create policy topics_write_staff on topics for all to public
  using (exists (select 1 from space_members m where m.space_id = topics.space_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')))
  with check (exists (select 1 from space_members m where m.space_id = topics.space_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')));

create policy notes_visible on topic_notes for select to public
  using (topic_note_visible(id));

create policy notes_write_author on topic_notes for insert to public
  with check (author_id = auth.uid());

create policy notes_update_reviewer on topic_notes for update to public
  using (is_reviewer_of_topic(topic_id))
  with check (is_reviewer_of_topic(topic_id));

create policy notes_delete_staff on topic_notes for delete to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

create policy drafts_own on topic_note_drafts for all to public
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy resources_visible on topic_resources for select to public
  using (note_id is null or topic_note_visible(note_id) or exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

create policy resources_write_staff on topic_resources for all to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

create policy reads_own on topic_reads for all to public
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy reads_visible_staff on topic_reads for select to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

create policy share_links_staff on share_links for all to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

create policy settings_read_all on settings for select to public using (true);
create policy settings_write_admin on settings for update to public
  using (exists (select 1 from space_members m where m.profile_id = auth.uid() and m.role = 'admin'));
