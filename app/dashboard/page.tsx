// Not a port -- school_app's dashboard index redirects straight to
// `/dashboard/${profile.role}` because role is global per user. This
// app instead shows a space picker: even with the global `profiles.role`
// added in 0006_admin_accounts.sql (admin/teacher/student/parent, needed
// so an admin/parent can act outside any single space), a teacher or
// student can still belong to several spaces, so landing on one role's
// dashboard isn't enough -- they need to choose which space first.
// Skipped entirely once a user only ever belongs to one space (redirects
// straight there).
//
// Extended for classes (0005 migration): a student's spaces now come
// from two sources -- direct space_members rows (staff, or a student
// added to one space individually) and spaces reached via a class
// they're enrolled in. Both are merged into one list here; missing
// this merge would mean a class-enrolled student never sees their
// spaces at all despite RLS correctly letting them read the notes.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { requireUser } from "@/lib/actions/authGuards";

type SpaceEntry = { id: string; name: string; role: string };

export default async function DashboardIndex() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  const { data: directMemberships } = await supabase
    .from("space_members")
    .select("role, spaces(id, name)")
    .eq("profile_id", userId);

  const { data: classMemberships } = await supabase
    .from("class_members")
    .select("classes(id)")
    .eq("profile_id", userId);

  const classIds = (classMemberships ?? []).map((c: any) => c.classes?.id).filter(Boolean);
  const { data: classSpaces } = classIds.length
    ? await supabase.from("spaces").select("id, name").in("class_id", classIds)
    : { data: [] };

  const byId = new Map<string, SpaceEntry>();
  for (const m of directMemberships ?? []) {
    const s = (m as any).spaces;
    if (s) byId.set(s.id, { id: s.id, name: s.name, role: m.role });
  }
  for (const s of classSpaces ?? []) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name, role: "student" });
  }
  const entries = [...byId.values()];

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        {isAdmin && (
          <div className="mb-6 flex flex-wrap justify-center gap-2">
            <Link href="/dashboard/admin/staff" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Staff</Link>
            <Link href="/dashboard/admin/students" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Students</Link>
            <Link href="/dashboard/admin/parents" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Parents</Link>
            <Link href="/dashboard/admin/classes" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Classes</Link>
            <Link href="/dashboard/admin/spaces" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Spaces</Link>
          </div>
        )}
        <div className="mb-4 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard/announcements" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Announcements</Link>
          <Link href="/dashboard/messages" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Messages</Link>
          <Link href="/dashboard/timetable" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Timetable</Link>
        </div>
        <p className="text-ink">
          You&apos;re signed in, but not a member of any space or class yet.
          {isAdmin ? " Create a class, space, or account above." : " Ask an admin to add you."}
        </p>
      </div>
    );
  }

  if (entries.length === 1) {
    const e = entries[0];
    const base = e.role === "student" ? "/dashboard/student/spaces" : "/dashboard/teacher/spaces";
    redirect(`${base}/${e.id}`);
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      {isAdmin && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/dashboard/admin/staff" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Staff</Link>
          <Link href="/dashboard/admin/students" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Students</Link>
          <Link href="/dashboard/admin/parents" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Parents</Link>
          <Link href="/dashboard/admin/classes" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Classes</Link>
          <Link href="/dashboard/admin/spaces" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Spaces</Link>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dashboard/announcements" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Announcements</Link>
        <Link href="/dashboard/messages" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Messages</Link>
        <Link href="/dashboard/timetable" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Timetable</Link>
      </div>
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">Your spaces</h1>
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id}>
            <Link
              href={
                e.role === "student"
                  ? `/dashboard/student/spaces/${e.id}`
                  : `/dashboard/teacher/spaces/${e.id}`
              }
              className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
            >
              {e.name}
              <span className="ml-2 text-xs uppercase tracking-wide text-ink-soft">{e.role}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
