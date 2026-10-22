# TODO

## Done
- [x] Fix Vercel build failure: grade page imported `createAdminClient` directly (restricted by ESLint); now uses `getProfileNames` from `lib/actions/studentNames`.
- [x] Remove unused `components/quizzes/CreateQuizForm.tsx` (superseded by `QuizBuilderForm`, failed type-check against `QuizQuestionInput`).
- [x] Per-session subscription gating: migration `0036_session_subscriptions.sql` (table + `subscription_status()`), middleware gate and `/subscription-expired` page, admin renewal banner, `scripts/set-subscription.sh`, `lib/subscription.ts` + tests, `supabase/tests/09_subscription.sql`, README section.

## Next
- [ ] Decide whether `/shared/[token]` links should be gated for a lapsed school.
- [ ] Gate at the database level (RLS) if direct-Supabase access by students becomes a concern.
- [ ] Optional: grace period and a vendor-side view of every school's expiry date.

