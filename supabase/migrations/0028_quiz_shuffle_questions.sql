-- 0028_quiz_shuffle_questions.sql
-- Per-attempt question shuffling. The flag lives on the quiz; the order
-- itself is derived from the attempt id (lib/quizShuffle.ts) so a student
-- sees the same order on every refresh but different students differ.

alter table quizzes
  add column shuffle_questions boolean not null default false;
