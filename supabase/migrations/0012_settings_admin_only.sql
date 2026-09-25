-- Found while reviewing 0011_school_timetable.sql: settings_write_admin
-- (0001_init.sql) let ANY space's admin update `settings`, not just a
-- global admin -- it checked "is the user an admin of some space",
-- never "of the whole school". Pre-existing since 0001, but the blast
-- radius grew with 0011: `settings` now also holds `timezone`, which
-- governs the schoolwide bell timer, on top of `requires_review`
-- (already schoolwide -- toggling it off disables the review gate for
-- every space, not just the actor's own).
--
-- The app-layer action (saveSchoolTimeZone, lib/actions/timetable.ts)
-- already correctly requires assertGlobalRole(["admin"]) -- but that's
-- enforcement in exactly one call site, not at the database layer. 0011
-- added is_admin() as an additional allowed path without removing the
-- original one, so the RLS-level hole remained. Confirmed exploitable
-- with a direct update as a space-admin-only identity (not a global
-- admin) against a live test database, bypassing the app entirely:
-- both `timezone` and `requires_review` were successfully changed.
--
-- Fix: settings is school-wide configuration, so only a school-wide
-- admin should be able to write it -- drop the space-admin path
-- entirely rather than special-case which settings.* columns each
-- writer may touch.

drop policy if exists settings_write_admin on settings;
create policy settings_write_admin on settings for update to public
  using (is_admin())
  with check (is_admin());
