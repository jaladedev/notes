# Notes delivery (standalone)

A fresh, standalone notes-delivery app: no import from school_app, no
shared code path with it going forward. Its editor, present mode and
handout flow were originally adapted from school_app during design (see
`notes-delivery-plan.md` for that history and for decisions and what's
intentionally out of scope for v1), but this app owns its own schema and
ships with no migration path or tooling to bring school_app data in.

## Model in one line

One Supabase project per school, no shared tables, no `org_id`. A teacher
can edit their notes however they like — there's no other school's copy
to affect (plan section 6).

## Curriculum, classes and levels (0020)

There is no "space" any more. A **topic** is identified directly by
`subject_id` + `education_level` (`primary`/`jss`/`sss`) + `level_number` +
`academic_year` + `term` (+ optional `week_number`), the same grouping
school_app uses for `curriculum_topics`. **Notes are shared by level**: every
class at that level (JSS2A, JSS2B, ...) sees the same topics and notes --
enroll a student in a class once, and they read that class's level.

`teacher_subjects` (subject + teacher + `teacher`/`reviewer` role) replaces
space membership for staff. A teacher edits/reviews notes for the subjects
they're assigned to, at whatever level(s) that subject is taught; a global
admin can act on every subject. Manage subjects and their teachers at
`/dashboard/admin/subjects`; a teacher's own list is at `/dashboard` (redirects
straight into a subject if they're assigned to exactly one).

`classes` + `class_members` are unchanged in shape, but now do double duty:
they're the roster admins manage, *and* `education_level`/`level_number` on
the class is what decides which level's notes its students can read.
**Promoting** a student is just moving them to a different class
(`promoteClass` in `lib/actions/notes.ts`, or the "Promote class" panel on a
class's admin page) -- last year's notes stay on the old level for the next
cohort, and the student immediately sees the new level's notes, no note data
is copied or touched.

**Term/week visibility** (`topic_released_to_students`, called from
`is_topic_reader`/`topic_note_visible`): with `settings.current_academic_year`
+ `current_term` set, a student sees every topic from an earlier term or year
in full, and -- for the current term -- only weeks up to
`current_school_week()` (driven by `settings.term_start_date`, same as the
week gate added in 0019). A later term is hidden entirely. Staff and admins
are never gated. Leaving `current_academic_year`/`current_term` unset falls
back to the plain week gate alone; leaving `term_start_date` unset too turns
off all gating. Set these at `/dashboard/admin/timetable` ("Term weeks").

## School timetable

A school-wide weekly timetable (0011, re-keyed to subjects in 0020): one
**bell schedule** shared by every class, and a **class x weekday x period
grid** where each lesson is a class + subject + optional teacher + optional
room.

- **Admin:** `/dashboard/admin/timetable` holds the bell schedule (periods,
  breaks, school time zone, and the term/week settings above) and a link per
  class; `/dashboard/admin/timetable/[classId]` is the editable grid. Click a
  cell, choose the subject and teacher, save.
- **Everyone else:** `/dashboard/timetable`, read-only. A teacher gets "My
  week" (lessons for subjects they teach); a student gets their class's grid;
  a parent gets their children's classes'. Visibility is RLS: a lesson is
  readable by staff of its subject, anyone who can read its class
  (`is_class_reader`), or admins.
- **Clashes are enforced by the database:** one lesson per class per period,
  a teacher can't teach two classes in the same period, a lesson can't sit in
  a break period, and its teacher (if set) must be assigned to that subject
  (`teacher_subjects`). Unassigning a teacher from a subject frees their
  cells. Rooms aren't clash-checked (halls, labs and fields are shared).
- **Bell timer:** Present mode's `BellTimer` shows the signed-in teacher's
  lessons for *today in the school's time zone*.
- Weekly and recurring: no substitutions or one-off changes -- edit the grid
  when the timetable changes.

## Announcements

Class-targeted or school-wide only (no space targeting). A teacher can post
to a class they're timetabled to teach; an admin can post to any class or
school-wide. See `lib/actions/announcements.ts`.

## What's ported and working (module-wise)

- Full note editor (TipTap): sections, callouts, math, code blocks, slash
  commands, drag-reorder, resource chips, topic links, mermaid diagrams,
  video embeds, link previews.
- Versioning: append-only `topic_notes`, autosave drafts, restore/delete
  version (with the resource-reassignment logic for shared markers), and
  a diff view between any two versions on the teacher's note page.
- Delivery: Present mode (slide view + BellTimer, driven by the school
  timetable below), Handout (print/PDF),
  student reader, share links (`/shared/[token]`, optional access code,
  no account needed), and offline reading (a service worker caches any
  student topic page the student has opened while online — see below).
- Optional review gate (`settings.requires_review`), release gate
  (`topic_notes.release_at`), read receipts (`topic_reads`).

## What's dropped from school_app (intentionally)

- Assessments/quizzes and the assessment-link chip.
- school_app's per-term timetable entries -- replaced by the school-level weekly timetable below (still no substitutions/one-off changes).
- Payments (Paystack).

## Not yet built

- Email-on-publish (plan phase P3 remainder).
- `provision-school.sh` migrates a project you have already created, creates
  the bucket and writes the env file. It does not create the Supabase
  project or deploy anything; both are manual steps.
- Self-signup and invite links do not exist by design: an admin creates
  every account (see below).
- Editing a name or email after account creation, CSV bulk student import,
  and bulk email.
- Timetable extras: copy-a-day/duplicate-a-class tools, term-scoped
  timetables, substitutions and one-off changes, and room clash checking.

## Setup (new school)

1. Create a Supabase project for the school (dashboard — no provisioning
   API for this step yet).
2. Run `./scripts/provision-school.sh <school-slug> <project-ref> <db-password>`.
   It applies every migration in order (tracked in `_schema_migrations`,
   safe to re-run; an already-applied file is never re-run, even if edited,
   so ship fixes as new numbered migrations), creates the `topic-resources`
   bucket, and writes `deployments/<school-slug>.env` (gitignored — never
   commit it).
3. Deploy, using that env file's three values as the deployment's env vars.
4. Create the first admin manually: create the auth user (dashboard or
   `npx supabase auth admin create-user`), then insert their `profiles` row
   with `role = 'admin'` (see the bootstrap note in
   `0006_admin_accounts.sql`). Sign in as them, then create every other
   account from `/dashboard/admin/staff`, `/students` and `/parents`; each
   gets a one-time temporary password and must change it on first login.
5. Create a class at `/dashboard/admin/classes` (set its education level and
   level number so its students see the right notes), add students to its
   roster by email, then create a subject at `/dashboard/admin/subjects` and
   assign teachers to it.
6. Set up the bell schedule, time zone, and (once the term begins) the term
   start date and current term/year at `/dashboard/admin/timetable`, then
   fill in each class's grid, choosing a subject and teacher per lesson.

`GET /api/health` reports the latest applied migration for a running
deployment — useful for checking N schools are all on the same schema
version without opening each Supabase project individually.

## Local development

For working on the app itself (not provisioning a school), `.env.example`
still works the normal way: copy to `.env.local`, fill in a dev project's
credentials, `npm install && npm run dev`.

> `npm install` (plain) currently hits a known npm/arborist bug on this dependency tree (vitest 4.x's peer-dep graph) -- use `npm install --legacy-peer-deps` instead. Everything else (build, typecheck, lint, tests) runs normally after that.

## Offline reading

`public/sw.js` caches student topic pages network-first: a page opened
while online is available offline afterward, nothing is cached in bulk
up front. Resource files (images/PDFs/audio/video) aren't cached — their
signed URLs expire after 6h, so a cached copy would go stale — only the
page shell and note text are. `public/manifest.json` makes the app
installable (add real icons at `public/icon-192.png` /
`public/icon-512.png`; the manifest references them but none are
included).

This is a read cache, not a write queue — a student can reopen a note
offline, but a teacher can't edit or publish offline. school_app's own
service worker solves a different problem (queuing offline attendance
writes), which is why this one is a fresh file rather than a port.

## Tests

Ported: `diff.test.ts`, `block-reorder.test.ts`, `resource-chip-reorder.test.ts`,
`section-grouping.test.ts` — all school-agnostic logic (`lib/diff.ts`,
`lib/tiptap/block-reorder.ts`, `lib/tiptap/section-node.ts`), copied
unmodified. Run with `npm test`.

Not ported: `attendance`, `authGuards`, `csv`, `database`, `fees*`,
`installments`, `receipt-view`, `report-card`, `validation` — all
school_app-specific (attendance/fees/report cards don't exist here, and
`authGuards.test.ts` tests the old global-role `assertRole`, not this
app's subject-scoped `assertSubjectRole`, which has no test yet).
