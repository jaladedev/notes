-- Students no longer read quiz_options directly: it holds the answer key
-- (is_correct, accepted fill-in-the-blank answers, matching pairs). They use
-- get_quiz_attempt_questions / get_quiz_attempt_review instead (0031).
-- quiz_options_write_staff (FOR ALL, quiz staff) stays and still covers staff SELECT.
drop policy if exists quiz_options_visible on quiz_options;
