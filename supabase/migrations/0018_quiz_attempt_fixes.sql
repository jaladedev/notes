-- 0018_quiz_attempt_fixes.sql
-- Fixes two related bugs found in review:
--   1) startQuizAttempt had no guard against duplicate attempts -- a
--      student could retake a quiz indefinitely. Add a unique constraint
--      so the app can look up-or-create instead of blindly inserting.
--   2) quiz_attempts_own was a single ALL policy with a with_check that
--      only covers INSERT/UPDATE, not DELETE -- so quiz staff (allowed in
--      using()) could delete any student's attempt. No code path does
--      this intentionally (only startQuizAttempt inserts, only the
--      SECURITY DEFINER submit_quiz_attempt() updates), so replace the
--      single ALL policy with a broad SELECT and an insert-only-your-own
--      write policy, removing UPDATE/DELETE via RLS entirely.

alter table quiz_attempts
  add constraint quiz_attempts_quiz_student_unique unique (quiz_id, student_id);

drop policy if exists quiz_attempts_own on quiz_attempts;

create policy quiz_attempts_select on quiz_attempts for select to public
  using (student_id = (select auth.uid()) or is_parent_of(student_id) or is_quiz_staff(quiz_id));

create policy quiz_attempts_insert_own on quiz_attempts for insert to public
  with check (student_id = (select auth.uid()));
