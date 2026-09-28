-- Students only see notes for the current and past weeks.
--
-- topics.week_number (0004) was metadata only. This makes it a real gate,
-- driven by one school-wide date: the Monday (or any day) that Week 1 of
-- the current term starts. Week N is visible from term_start_date + 7*(N-1)
-- onward, using the school's time zone (settings.timezone, 0011).
--
-- Behaviour:
--   * term_start_date is null       -> no week gate (existing behaviour).
--   * topic.week_number is null     -> never gated by week.
--   * space staff (teacher/reviewer/admin) and global admins are never
--     gated, so teachers can still preview upcoming weeks.
--   * everything else in topic_note_visible() is unchanged from 0005.
-- Because the student space list, topic page, resources and search all read
-- through RLS, they inherit the gate automatically.

alter table settings add column term_start_date date;
comment on column settings.term_start_date is
  'Date Week 1 of the current term starts. Null disables the week gate.';

create or replace function public.current_school_week()
returns integer language sql stable security definer
set search_path = public, pg_temp as $$
  select case
    when s.term_start_date is null then null
    else floor(((now() at time zone s.timezone)::date - s.term_start_date) / 7.0)::integer + 1
  end
  from settings s
  where s.id;
$$;

create or replace function public.is_space_staff(p_space_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from space_members m
    where m.space_id = p_space_id
      and m.profile_id = (select auth.uid())
      and m.role in ('teacher', 'reviewer', 'admin')
  );
$$;

create or replace function public.topic_note_visible(p_note_id uuid)
returns boolean language plpgsql security definer stable
set search_path = public, pg_temp as $$
declare
  n record;
  t record;
  wk integer;
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

  select space_id, week_number into t from topics where id = n.topic_id;

  -- Week gate: hide future weeks from everyone who isn't staff.
  if t.week_number is not null then
    wk := current_school_week();
    if wk is not null
       and t.week_number > wk
       and not is_space_staff(t.space_id)
       and not is_admin() then
      return false;
    end if;
  end if;

  return is_space_reader(t.space_id);
end;
$$;
