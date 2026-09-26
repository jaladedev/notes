-- 0017_fk_indexes.sql
-- Adds covering indexes for foreign keys flagged by the Supabase performance
-- advisor (unindexed_foreign_keys). Speeds up joins/deletes on these columns.

create index if not exists announcement_reads_profile_id_idx on public.announcement_reads (profile_id);
create index if not exists announcements_class_id_idx on public.announcements (class_id);
create index if not exists announcements_created_by_idx on public.announcements (created_by);
create index if not exists announcements_space_id_idx on public.announcements (space_id);
create index if not exists audit_log_actor_id_idx on public.audit_log (actor_id);
create index if not exists class_members_profile_id_idx on public.class_members (profile_id);
create index if not exists conversation_members_profile_id_idx on public.conversation_members (profile_id);
create index if not exists guardian_links_student_id_idx on public.guardian_links (student_id);
create index if not exists homework_created_by_idx on public.homework (created_by);
create index if not exists homework_topic_id_idx on public.homework (topic_id);
create index if not exists homework_submissions_graded_by_idx on public.homework_submissions (graded_by);
create index if not exists homework_submissions_student_id_idx on public.homework_submissions (student_id);
create index if not exists messages_conversation_id_idx on public.messages (conversation_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists quiz_answers_option_id_idx on public.quiz_answers (option_id);
create index if not exists quiz_answers_question_id_idx on public.quiz_answers (question_id);
create index if not exists quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id);
create index if not exists quiz_attempts_student_id_idx on public.quiz_attempts (student_id);
create index if not exists quiz_options_question_id_idx on public.quiz_options (question_id);
create index if not exists quiz_questions_quiz_id_idx on public.quiz_questions (quiz_id);
create index if not exists quizzes_created_by_idx on public.quizzes (created_by);
create index if not exists quizzes_topic_id_idx on public.quizzes (topic_id);
create index if not exists schedule_slots_topic_id_idx on public.schedule_slots (topic_id);
create index if not exists share_links_created_by_idx on public.share_links (created_by);
create index if not exists share_links_topic_id_idx on public.share_links (topic_id);
create index if not exists space_members_profile_id_idx on public.space_members (profile_id);
create index if not exists spaces_class_id_idx on public.spaces (class_id);
create index if not exists timetable_entries_period_number_idx on public.timetable_entries (period_number);
create index if not exists timetable_entries_space_class_idx on public.timetable_entries (space_id, class_id);
create index if not exists topic_note_drafts_author_id_idx on public.topic_note_drafts (author_id);
create index if not exists topic_notes_author_id_idx on public.topic_notes (author_id);
create index if not exists topic_reads_student_id_idx on public.topic_reads (student_id);
create index if not exists topic_resources_note_id_idx on public.topic_resources (note_id);
create index if not exists topic_resources_topic_id_idx on public.topic_resources (topic_id);
create index if not exists topic_resources_uploaded_by_idx on public.topic_resources (uploaded_by);
create index if not exists topics_space_id_idx on public.topics (space_id);
