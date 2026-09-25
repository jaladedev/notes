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

## Curriculum structure (school_app-style, optional)

A `space` can now optionally carry the same grouping school_app uses for
`curriculum_topics`: `subject_id` + `education_level` (`primary`/`jss`/
`sss`) + `level_number` + `academic_year` + `term`. A unique index
prevents two spaces existing for the same subject+level+year+term. A
topic can carry an optional `week_number` for labeling/ordering — the
same idea as school_app's week-of-term grid, but display-only; the
actual visibility gate is still `topic_notes.release_at`, not the week
number, so nothing enforces "don't show week 5 before week 4."

This is additive, not a replacement: a space without any curriculum
fields set still works exactly as before (a bare, freely-named
container). Only `createSpace`/`createTopic` and the admin UI learned
about the new fields.

## Classes (real roster, shared across subjects)

`classes` + `class_members` (0005 migration) close the remaining gap:
a class like "JSS2A" is its own entity with its own student roster,
and a space can optionally link to one via `spaces.class_id`. Every
student in that class's roster can then read every space tied to it —
enroll a student once in the class, not once per subject-space.

This changed real RLS, not just the admin UI, because student access
used to be entirely `space_members` rows. A new `is_space_reader(space_id)`
function checks *either* a direct `space_members` row *or* class
membership via `spaces.class_id`, and every read policy that used to
check `space_members` alone (`spaces_member`, `topics_member`,
`schedule_slots_member`, and `topic_note_visible()`'s final branch) now
goes through it. Two page-level bugs this required fixing, worth
knowing about if you touch this area again:
- `/dashboard/page.tsx` (the spaces picker) used to only query
  `space_members` — a class-enrolled student would see an empty list
  despite being able to read their spaces. It now merges direct
  memberships with spaces reached via class enrollment.
- `/dashboard/student/spaces/[spaceId]/page.tsx` used to do its own
  `space_members` lookup *before* RLS ran, which 404'd a class-enrolled
  student even though RLS would have let them in. Removed — the page
  now relies entirely on RLS (the `spaces` select itself) as the gate.

Staff (teacher/reviewer/admin) are unaffected — they're still added to
a space directly via `space_members`; only student read access flows
through classes. Manage classes at `/dashboard/admin/classes`; link a
space to one from that space's own settings page.

Class writes (`createClass`, `addClassMember`, `removeClassMember`,
`createSubject`) require the global `admin` role (`assertGlobalRole`) and go
through the admin client; `addClassMember` looks the student up by
`profiles.email` and rejects non-students. Reads go through RLS:
`class_members_visible` admits a student's own row, staff of a space tied to
the class, and (0010) any global admin, so an admin sees rosters for classes
that have no spaces yet.

## School timetable

A school-wide weekly timetable (0011): one **bell schedule** shared by every
class, and a **class x weekday x period grid** where each lesson is a space
(the subject), usually a teacher, and an optional room.

- **Admin:** `/dashboard/admin/timetable` holds the bell schedule (periods,
  breaks, and the school time zone, default `Africa/Lagos`) and a link per
  class; `/dashboard/admin/timetable/[classId]` is the editable grid. Click a
  cell, choose the space and teacher, save.
- **Everyone else:** `/dashboard/timetable`, read-only. A teacher gets "My
  week" (their own lessons, class shown in each cell); a student gets their
  class's grid; a parent gets their children's classes'. Visibility is RLS,
  not page logic: a lesson is readable by exactly the people who can read its
  space (`is_space_reader`), plus admins.
- **Clashes are enforced by the database**, not just the form: one lesson
  per class per period, and a teacher can't teach two classes in the same
  period. Rooms are deliberately not clash-checked (halls, labs and fields
  are shared). A lesson can't sit in a break period, its space must be linked
  to its class (set on the space's settings page), and its teacher must be a
  teacher in that space. Removing a teacher from a space frees their cells.
- **Bell timer:** Present mode's `BellTimer` now shows the signed-in
  teacher's lessons for *today in the school's time zone*, so a server in UTC
  or a laptop with the wrong zone no longer shifts the day or the bell.
- Weekly and recurring: no term or year dimension, and no substitutions or
  one-off changes. Edit the grid when the timetable changes.

Replaces the old per-topic `schedule_slots` / `ScheduleSlotManager`. The
`schedule_slots` table is left in the database (forward-only migrations) but
nothing reads or writes it; existing slots are not migrated because they
carry no class or teacher to migrate into. Drop the table in a later
migration once no deployment needs the data.

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
- Education level / term / week gating — replaced by plain space
  membership + `release_at`.
- school_app's per-term timetable entries — replaced by the school-level weekly timetable below (no term/year dimension).
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
5. Create a class at `/dashboard/admin/classes`, add students to its roster
   by email, then create a space at `/dashboard/admin/spaces` and link it to
   the class from the space's settings.
6. Set up the bell schedule and time zone at `/dashboard/admin/timetable`,
   then fill in each class's grid. A space only appears as a choice for a
   class once it is linked to that class (step 5).

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
app's space-scoped `assertSpaceRole`, which has no test yet).
