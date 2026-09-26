-- 0016_advisor_fixes.sql
-- Fixes flagged by Supabase security & performance advisors:
--   1) Pin search_path on SECURITY DEFINER / helper functions (function_search_path_mutable)
--   2) Wrap auth.uid() calls in RLS policies with (select ...) so they evaluate once per
--      query instead of once per row (auth_rls_initplan)

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on functions
-- ---------------------------------------------------------------------------
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_conversation_member(uuid) set search_path = public, pg_temp;
alter function public.is_parent_of(uuid) set search_path = public, pg_temp;
alter function public.is_quiz_staff(uuid) set search_path = public, pg_temp;
alter function public.is_reviewer_of_topic(uuid) set search_path = public, pg_temp;
alter function public.is_space_admin(uuid) set search_path = public, pg_temp;
alter function public.is_space_reader(uuid) set search_path = public, pg_temp;
alter function public.submit_quiz_attempt(uuid) set search_path = public, pg_temp;
alter function public.timetable_entries_guard() set search_path = public, pg_temp;
alter function public.timetable_periods_guard() set search_path = public, pg_temp;
alter function public.timetable_release_teacher() set search_path = public, pg_temp;
alter function public.topic_note_visible(uuid) set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Wrap auth.uid() in (select auth.uid()) across flagged RLS policies
-- ---------------------------------------------------------------------------

alter policy profiles_self on public.profiles
  using (id = (select auth.uid()));

alter policy topics_write_staff on public.topics
  using (exists (select 1 from space_members m
                 where m.space_id = topics.space_id
                   and m.profile_id = (select auth.uid())
                   and m.role = any (array['teacher','reviewer','admin']::space_role[])))
  with check (exists (select 1 from space_members m
                       where m.space_id = topics.space_id
                         and m.profile_id = (select auth.uid())
                         and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy notes_write_author on public.topic_notes
  with check (author_id = (select auth.uid()));

alter policy notes_delete_staff on public.topic_notes
  using (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                 where t.id = topic_notes.topic_id
                   and m.profile_id = (select auth.uid())
                   and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy drafts_own on public.topic_note_drafts
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

alter policy resources_write_staff on public.topic_resources
  using (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                 where t.id = topic_resources.topic_id
                   and m.profile_id = (select auth.uid())
                   and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy resources_visible on public.topic_resources
  using (note_id is null
         or topic_note_visible(note_id)
         or exists (select 1 from topics t
                    where t.id = topic_resources.topic_id
                      and exists (select 1 from space_members m
                                  where m.space_id = t.space_id
                                    and m.profile_id = (select auth.uid())
                                    and m.role = any (array['teacher','reviewer','admin']::space_role[]))));

alter policy reads_own on public.topic_reads
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

alter policy reads_visible_staff on public.topic_reads
  using (is_parent_of(student_id)
         or exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                    where t.id = topic_reads.topic_id
                      and m.profile_id = (select auth.uid())
                      and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy share_links_staff on public.share_links
  using (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                 where t.id = share_links.topic_id
                   and m.profile_id = (select auth.uid())
                   and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy schedule_slots_write_staff on public.schedule_slots
  using (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                 where t.id = schedule_slots.topic_id
                   and m.profile_id = (select auth.uid())
                   and m.role = any (array['teacher','reviewer','admin']::space_role[])))
  with check (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                       where t.id = schedule_slots.topic_id
                         and m.profile_id = (select auth.uid())
                         and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy spaces_member on public.spaces
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.is_active)
         and (is_space_reader(id) or is_admin()));

alter policy spaces_insert_staff on public.spaces
  with check (exists (select 1 from profiles
                       where profiles.id = (select auth.uid())
                         and profiles.role = any (array['teacher','admin']::global_role[])
                         and profiles.is_active));

alter policy guardian_links_visible on public.guardian_links
  using (parent_id = (select auth.uid()) or student_id = (select auth.uid()) or is_admin());

alter policy announcements_visible on public.announcements
  using (
    (space_id is null and class_id is null)
    or (space_id is not null and is_space_reader(space_id))
    or (class_id is not null and (
          exists (select 1 from class_members cm where cm.class_id = announcements.class_id and cm.profile_id = (select auth.uid()))
          or exists (select 1 from class_members cm where cm.class_id = announcements.class_id and is_parent_of(cm.profile_id))
        ))
    or is_admin()
  );

alter policy announcements_write_staff on public.announcements
  with check (is_admin() or (space_id is not null and exists (
    select 1 from space_members m
    where m.space_id = announcements.space_id
      and m.profile_id = (select auth.uid())
      and m.role = any (array['teacher','reviewer','admin']::space_role[])
  )));

alter policy announcement_reads_own on public.announcement_reads
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

alter policy messages_send on public.messages
  with check (sender_id = (select auth.uid()) and is_conversation_member(conversation_id));

alter policy homework_write_staff on public.homework
  using (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                 where t.id = homework.topic_id
                   and m.profile_id = (select auth.uid())
                   and m.role = any (array['teacher','reviewer','admin']::space_role[])))
  with check (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                       where t.id = homework.topic_id
                         and m.profile_id = (select auth.uid())
                         and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy quizzes_write_staff on public.quizzes
  using (is_quiz_staff(id) or created_by = (select auth.uid()))
  with check (exists (select 1 from topics t join space_members m on m.space_id = t.space_id
                       where t.id = quizzes.topic_id
                         and m.profile_id = (select auth.uid())
                         and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy quiz_attempts_own on public.quiz_attempts
  using (student_id = (select auth.uid()) or is_parent_of(student_id) or is_quiz_staff(quiz_id))
  with check (student_id = (select auth.uid()));

alter policy quiz_answers_own on public.quiz_answers
  using (exists (select 1 from quiz_attempts a
                 where a.id = quiz_answers.attempt_id
                   and (a.student_id = (select auth.uid()) or is_parent_of(a.student_id) or is_quiz_staff(a.quiz_id))))
  with check (exists (select 1 from quiz_attempts a
                       where a.id = quiz_answers.attempt_id and a.student_id = (select auth.uid())));

alter policy space_members_self on public.space_members
  using (profile_id = (select auth.uid()) or is_space_admin(space_id) or is_admin());

alter policy space_members_insert_self_admin on public.space_members
  with check (profile_id = (select auth.uid())
              and role = 'admin'::space_role
              and exists (select 1 from profiles
                          where profiles.id = (select auth.uid())
                            and profiles.role = any (array['teacher','admin']::global_role[])
                            and profiles.is_active));

alter policy homework_submissions_own on public.homework_submissions
  using (student_id = (select auth.uid())
         or is_parent_of(student_id)
         or exists (select 1 from homework h join topics t on t.id = h.topic_id join space_members m on m.space_id = t.space_id
                    where h.id = homework_submissions.homework_id
                      and m.profile_id = (select auth.uid())
                      and m.role = any (array['teacher','reviewer','admin']::space_role[])))
  with check (
    (student_id = (select auth.uid()) and exists (
       select 1 from homework h join topics t on t.id = h.topic_id join space_members m on m.space_id = t.space_id
       where h.id = homework_submissions.homework_id and m.profile_id = (select auth.uid())
    ))
    or exists (select 1 from homework h join topics t on t.id = h.topic_id join space_members m on m.space_id = t.space_id
               where h.id = homework_submissions.homework_id
                 and m.profile_id = (select auth.uid())
                 and m.role = any (array['teacher','reviewer','admin']::space_role[]))
  );

alter policy class_members_visible on public.class_members
  using (profile_id = (select auth.uid())
         or is_admin()
         or exists (select 1 from spaces s join space_members m on m.space_id = s.id
                    where s.class_id = class_members.class_id
                      and m.profile_id = (select auth.uid())
                      and m.role = any (array['teacher','reviewer','admin']::space_role[])));

alter policy timetable_periods_read on public.timetable_periods
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.is_active));

alter policy timetable_entries_read on public.timetable_entries
  using (exists (select 1 from profiles where profiles.id = (select auth.uid()) and profiles.is_active)
         and (is_admin() or is_space_reader(space_id)));
