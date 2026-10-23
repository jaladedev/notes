# TODO

## Done
- [x] Fix Vercel build failure: grade page imported `createAdminClient` directly (restricted by ESLint); now uses `getProfileNames` from `lib/actions/studentNames`.
- [x] Remove unused `components/quizzes/CreateQuizForm.tsx` (superseded by `QuizBuilderForm`, failed type-check against `QuizQuestionInput`).
- [x] Per-session subscription gating: migration `0036_session_subscriptions.sql` (table + `subscription_status()`), middleware gate and `/subscription-expired` page, admin renewal banner, `scripts/set-subscription.sh`, `lib/subscription.ts` + tests, `supabase/tests/09_subscription.sql`, README section.

- [x] Central platform API: signed `/api/platform/status` and `/api/platform/subscriptions` (`lib/platformAuth.ts`, `lib/platformRoute.ts`, `lib/subscriptionInput.ts`), off until `PLATFORM_SECRET` is set; tests in `tests/platform-*.test.ts` and `tests/subscription-input.test.ts`.
- [x] `notes-platform` dashboard app (separate project): operator login (scrypt password + optional TOTP), all-schools overview, per-school session add/remove.

- [x] `0037_subscription_status_service_role.sql`: explicit service-role grant, kept out of 0036 because 0036 was already applied (applied migrations are never re-run).

- [x] Grace period after a session ends: `0039_subscription_grace.sql` (`grace_days`, `grace` state, `subscription_status_at(date)`), admin warning during grace, `graceDays` on the platform API, optional grace arg on `set-subscription.sh`, SQL + unit tests.
- [x] Decided: `/shared/[token]` links are **not** gated for a lapsed school; they keep working (access code and expiry still apply). README's "Limits" note already says so.

- [x] Gate at the database level: `0040_subscription_rls_gate.sql` adds a restrictive `subscription_gate` RLS policy to every user-facing table (mirrors `isLockedOut()`; `profiles`, `settings`, `session_subscriptions` exempt), plus `apply_subscription_gate()` / `tables_missing_subscription_gate()`; `supabase/tests/10_subscription_rls.sql` (also fails on any ungated table). README "Limits" updated.

## Next
- [x] Gate the five student-facing `SECURITY DEFINER` RPCs: `0042_gate_security_definer_rpcs.sql` adds a `subscription_allows_access()` check to `submit_quiz_attempt`, `get_quiz_attempt_questions`, `get_quiz_attempt_review`, `grade_essay_answer` and `parent_children`; `supabase/tests/11_subscription_rpc_gate.sql`.
- [ ] Gate Supabase Storage object policies (the last database-gate gap).
- [ ] Optional: a vendor-side view of every school's expiry date (the platform dashboard could show `grace_days` / `graceEndsOn` now).
- [ ] Platform dashboard: durable audit log (today it is stdout JSON lines only), edge rate limiting on `/login`, per-operator accounts instead of one shared password.
- [ ] Platform API: add a nonce/replay store if the 5-minute replay window is a concern.
