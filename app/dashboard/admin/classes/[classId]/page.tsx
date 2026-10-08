// New, not ported. Shows a class's roster and every space tied to it --
// this is the "enroll once, read every subject" view (plan discussion:
// closing the gap between the earlier per-space membership and
// school_app's one-class-many-subjects flow).

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { ClassRosterPanel } from "@/components/admin/ClassRosterPanel";
import { PromoteClassPanel } from "@/components/admin/PromoteClassPanel";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await requireUser();
  const supabase = createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, name, education_level, level_number")
    .eq("id", classId)
    .single();
  if (!klass) notFound();

  const { data: members } = await supabase
    .from("class_members")
    .select("profile_id, profiles(full_name)")
    .eq("class_id", classId);

  // Students who can be added: everyone not already on this roster, with
  // the class they're currently in (adding moves them).
  const onRoster = new Set((members ?? []).map((m: any) => m.profile_id));
  const [{ data: allStudents }, { data: allMemberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "student")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("class_members").select("profile_id, classes(name)"),
  ]);
  const currentClass = new Map<string, string>(
    (allMemberships ?? []).map((m: any) => [m.profile_id, m.classes?.name ?? ""])
  );
  const candidates = (allStudents ?? [])
    .filter((st) => !onRoster.has(st.id))
    .map((st) => ({
      id: st.id,
      fullName: st.full_name,
      email: st.email ?? "",
      currentClass: currentClass.get(st.id) || null,
    }));

  // Every subject is linked to every class automatically.
  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const subjects = subjectRows ?? [];

  const { data: otherClasses } = await supabase
    .from("classes")
    .select("id, name")
    .neq("id", classId)
    .order("name");

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Classes", href: "/dashboard/admin/classes" },
          { label: klass.name },
        ]}
      />
      <h1 className="font-display text-xl font-semibold text-ink">{klass.name}</h1>

      <ClassRosterPanel classId={classId} members={(members ?? []) as any} candidates={candidates} />

      <PromoteClassPanel
        classId={classId}
        className={klass.name}
        studentCount={(members ?? []).length}
        otherClasses={otherClasses ?? []}
      />

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          Subjects ({subjects.length})
        </h2>
        <ul className="space-y-1">
          {subjects.map((s: any) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/admin/subjects/${s.id}`}
                className="block rounded-md bg-paper px-3 py-1.5 text-sm text-ink hover:underline"
              >
                {s.name}
              </Link>
            </li>
          ))}
          {subjects.length === 0 && (
            <p className="text-sm text-ink-soft">No subjects have been created yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}
