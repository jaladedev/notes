-- Closes the v1 feature gap agreed on in the plan doc: quizzes, homework,
-- parent portal, announcements, messaging, timetables (schedule_slots
-- already covers this), audit log, analytics. Bulk email stays out of
-- core (see lib/tenant features note in the plan doc) -- it isn't built
-- here, but the shape below leaves room for it to gate on `announcements`.

-- ---------- Audit log ----------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

-- Written only via the admin client (lib/audit.ts) -- no insert policy
-- needed. Readable by admins only.
create policy audit_log_admin_read on audit_log for select to public
  using (is_admin());

-- ---------- Parent portal ----------

create table guardian_links (
  parent_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

alter table guardian_links enable row level security;

create policy guardian_links_visible on guardian_links for select to public
  using (parent_id = auth.uid() or student_id = auth.uid() or is_admin());

create or replace function public.is_parent_of(p_student_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from guardian_links
    where student_id = p_student_id and parent_id = auth.uid()
  );
$$;

-- A parent reads exactly what their child can read: extend the existing
-- reader checks rather than duplicating topic_note_visible's logic.
create or replace function public.is_space_reader(p_space_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members m where m.space_id = p_space_id and m.profile_id = auth.uid()
  ) or exists (
    select 1 from spaces s
    join class_members cm on cm.class_id = s.class_id
    where s.id = p_space_id and cm.profile_id = auth.uid()
  ) or exists (
    select 1 from spaces s
    join class_members cm on cm.class_id = s.class_id
    where s.id = p_space_id and is_parent_of(cm.profile_id)
  );
$$;

-- ---------- Announcements ----------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade, -- null = school-wide
  class_id uuid references classes(id) on delete cascade, -- null = not class-targeted
  title text not null,
  body text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

alter table announcements enable row level security;
alter table announcement_reads enable row level security;

create policy announcements_visible on announcements for select to public
  using (
    (space_id is null and class_id is null) -- school-wide
    or (space_id is not null and is_space_reader(space_id))
    or (class_id is not null and (
      exists (select 1 from class_members cm where cm.class_id = announcements.class_id and cm.profile_id = auth.uid())
      or exists (select 1 from class_members cm where cm.class_id = announcements.class_id and is_parent_of(cm.profile_id))
    ))
    or is_admin()
  );

create policy announcements_write_staff on announcements for insert to public
  with check (
    is_admin()
    or (space_id is not null and exists (
      select 1 from space_members m where m.space_id = announcements.space_id
        and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
    ))
  );

create policy announcement_reads_own on announcement_reads for all to public
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------- Messaging ----------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = p_conversation_id and profile_id = auth.uid()
  );
$$;

create policy conversations_member on conversations for select to public
  using (is_conversation_member(id));

create policy conversation_members_visible on conversation_members for select to public
  using (is_conversation_member(conversation_id));

create policy messages_member on messages for select to public
  using (is_conversation_member(conversation_id));

create policy messages_send on messages for insert to public
  with check (sender_id = auth.uid() and is_conversation_member(conversation_id));

-- Enable Realtime on messages so the app can subscribe to new rows.
-- Provisioning (scripts/provision-school.sh) must run this on every
-- new school -- see the note added there.
alter publication supabase_realtime add table messages;

-- ---------- Homework ----------

create table homework (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  title text not null,
  instructions text,
  due_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references homework(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  content text,
  file_url text,
  submitted_at timestamptz not null default now(),
  grade numeric,
  feedback text,
  graded_at timestamptz,
  graded_by uuid references profiles(id),
  unique (homework_id, student_id)
);

alter table homework enable row level security;
alter table homework_submissions enable row level security;

create policy homework_visible on homework for select to public
  using (exists (select 1 from topics t where t.id = topic_id and is_space_reader(t.space_id)));

create policy homework_write_staff on homework for all to public
  using (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ))
  with check (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

-- A student submits their own work; staff (and a parent, read-only via
-- a separate select policy below) can see it to grade it.
create policy homework_submissions_own on homework_submissions for all to public
  using (
    student_id = auth.uid()
    or is_parent_of(student_id)
    or exists (
      select 1 from homework h join topics t on t.id = h.topic_id
      join space_members m on m.space_id = t.space_id
      where h.id = homework_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
    )
  )
  with check (
    student_id = auth.uid()
    or exists (
      select 1 from homework h join topics t on t.id = h.topic_id
      join space_members m on m.space_id = t.space_id
      where h.id = homework_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
    )
  );

-- ---------- Quizzes ----------
-- No assessments/grades tables (school_app's version ties quiz scores to
-- a report-card grade row; this app has no report cards). Score and
-- total live directly on the attempt -- see the plan doc's "quiz
-- decoupling" decision.

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  title text not null,
  published boolean not null default false,
  time_limit_seconds integer,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  prompt text not null,
  sequence_order integer not null default 0,
  points numeric not null default 1
);

create table quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  sequence_order integer not null default 0
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric,
  total_points numeric
);

create table quiz_answers (
  attempt_id uuid not null references quiz_attempts(id) on delete cascade,
  question_id uuid not null references quiz_questions(id) on delete cascade,
  option_id uuid references quiz_options(id),
  primary key (attempt_id, question_id)
);

alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_options enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_answers enable row level security;

create or replace function public.is_quiz_staff(p_quiz_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from quizzes q join topics t on t.id = q.topic_id
    join space_members m on m.space_id = t.space_id
    where q.id = p_quiz_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  );
$$;

create policy quizzes_visible on quizzes for select to public
  using (
    is_quiz_staff(id)
    or (published and exists (select 1 from topics t where t.id = topic_id and is_space_reader(t.space_id)))
  );

create policy quizzes_write_staff on quizzes for all to public
  using (is_quiz_staff(id) or created_by = auth.uid())
  with check (exists (
    select 1 from topics t join space_members m on m.space_id = t.space_id
    where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
  ));

-- Questions/options: staff of the owning quiz can manage; a student can
-- only read a published quiz's questions, and never sees is_correct
-- (enforced in quizAttempt.ts's select list -- RLS can't hide a single
-- column, only a whole row).
create policy quiz_questions_visible on quiz_questions for select to public
  using (is_quiz_staff(quiz_id) or exists (
    select 1 from quizzes q where q.id = quiz_id and q.published
      and exists (select 1 from topics t where t.id = q.topic_id and is_space_reader(t.space_id))
  ));
create policy quiz_questions_write_staff on quiz_questions for all to public
  using (is_quiz_staff(quiz_id)) with check (is_quiz_staff(quiz_id));

create policy quiz_options_visible on quiz_options for select to public
  using (exists (select 1 from quiz_questions qq where qq.id = question_id and (
    is_quiz_staff(qq.quiz_id) or exists (
      select 1 from quizzes q where q.id = qq.quiz_id and q.published
        and exists (select 1 from topics t where t.id = q.topic_id and is_space_reader(t.space_id))
    )
  )));
create policy quiz_options_write_staff on quiz_options for all to public
  using (exists (select 1 from quiz_questions qq where qq.id = question_id and is_quiz_staff(qq.quiz_id)))
  with check (exists (select 1 from quiz_questions qq where qq.id = question_id and is_quiz_staff(qq.quiz_id)));

-- A student manages only their own attempt; staff (and a parent) can read it.
create policy quiz_attempts_own on quiz_attempts for all to public
  using (
    student_id = auth.uid() or is_parent_of(student_id) or is_quiz_staff(quiz_id)
  )
  with check (student_id = auth.uid());

create policy quiz_answers_own on quiz_answers for all to public
  using (exists (
    select 1 from quiz_attempts a where a.id = attempt_id
      and (a.student_id = auth.uid() or is_parent_of(a.student_id) or is_quiz_staff(a.quiz_id))
  ))
  with check (exists (
    select 1 from quiz_attempts a where a.id = attempt_id and a.student_id = auth.uid()
  ));

-- Server-side scoring RPC: computes the score from quiz_answers against
-- quiz_options.is_correct (never trust a client-submitted score), then
-- locks the attempt by setting submitted_at.
create or replace function public.submit_quiz_attempt(p_attempt_id uuid)
returns table(score numeric, total_points numeric)
language plpgsql security definer as $$
declare
  v_student uuid;
  v_quiz uuid;
  v_already_submitted timestamptz;
  v_score numeric;
  v_total numeric;
begin
  select student_id, quiz_id, submitted_at into v_student, v_quiz, v_already_submitted
  from quiz_attempts where id = p_attempt_id;

  if v_student is null then
    raise exception 'Attempt not found';
  end if;
  if v_student <> auth.uid() then
    raise exception 'Not your attempt';
  end if;
  if v_already_submitted is not null then
    raise exception 'Attempt already submitted';
  end if;

  select coalesce(sum(qq.points), 0) into v_total
  from quiz_questions qq where qq.quiz_id = v_quiz;

  select coalesce(sum(qq.points), 0) into v_score
  from quiz_answers qa
  join quiz_questions qq on qq.id = qa.question_id
  join quiz_options qo on qo.id = qa.option_id
  where qa.attempt_id = p_attempt_id and qo.is_correct;

  update quiz_attempts
    set submitted_at = now(), score = v_score, total_points = v_total
    where id = p_attempt_id;

  return query select v_score, v_total;
end;
$$;

-- ---------- Analytics ----------
-- Read-only views, kept deliberately simple (no fees/attendance/grades
-- to draw on). is_admin() gates every one -- these are per-school
-- aggregates a teacher or student should not see in full.

create view analytics_note_engagement as
select
  t.id as topic_id,
  t.space_id,
  count(distinct r.student_id) as students_read,
  max(r.last_read_at) as last_read_at
from topics t
left join topic_reads r on r.topic_id = t.id
group by t.id, t.space_id;

create view analytics_homework_completion as
select
  h.id as homework_id,
  h.topic_id,
  count(s.id) as submissions,
  count(s.id) filter (where s.graded_at is not null) as graded
from homework h
left join homework_submissions s on s.homework_id = h.id
group by h.id, h.topic_id;

create view analytics_quiz_performance as
select
  q.id as quiz_id,
  q.topic_id,
  count(a.id) as attempts,
  avg(a.score / nullif(a.total_points, 0)) as avg_score_ratio
from quizzes q
left join quiz_attempts a on a.quiz_id = q.id and a.submitted_at is not null
group by q.id, q.topic_id;

-- Views inherit RLS from their underlying tables by default in Postgres
-- only if declared security_invoker; without it a view runs as its
-- owner and bypasses RLS entirely, so every one of the three above is
-- gated explicitly.
alter view analytics_note_engagement set (security_invoker = true);
alter view analytics_homework_completion set (security_invoker = true);
alter view analytics_quiz_performance set (security_invoker = true);
