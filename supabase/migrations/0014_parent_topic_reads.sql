-- Parent digest page needs to show whether a child has opened their
-- notes recently. homework_submissions_own and quiz_attempts_own
-- already let a parent read via is_parent_of; topic_reads never got
-- the same treatment, so extend its staff-only read policy.

drop policy if exists reads_visible_staff on topic_reads;
create policy reads_visible_staff on topic_reads for select to public
  using (
    is_parent_of(student_id)
    or exists (
      select 1 from topics t join space_members m on m.space_id = t.space_id
      where t.id = topic_id and m.profile_id = auth.uid() and m.role in ('teacher','reviewer','admin')
    )
  );
