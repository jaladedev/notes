// Rebuilt for the subject/level model (0020): there is no "space" to pick
// between any more. A teacher/reviewer sees the subjects they're assigned
// to (teacher_subjects); a student's notes live at a single URL for their
// class's level, so they're sent straight there.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { requireUser } from "@/lib/actions/authGuards";

export default async function DashboardIndex() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";
  if (profile?.role === "parent") redirect("/dashboard/parent");

  if (profile?.role === "student") {
    const { data: membership } = await supabase
      .from("class_members")
      .select("classes(education_level, level_number)")
      .eq("profile_id", userId)
      .maybeSingle();
    const klass = (membership as any)?.classes;
    if (klass?.education_level && klass?.level_number) {
      redirect(`/dashboard/student/levels/${klass.education_level}/${klass.level_number}`);
    }
  }

  const { data: subjectAssignments } = await supabase
    .from("teacher_subjects")
    .select("role, subjects(id, name)")
    .eq("profile_id", userId);
  const subjects = (subjectAssignments ?? [])
    .map((a: any) => a.subjects)
    .filter(Boolean);

  if (!isAdmin && subjects.length === 1) {
    redirect(`/dashboard/teacher/subjects/${subjects[0].id}`);
  }

  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-ink">
          You&apos;re signed in, but not assigned to any subject yet.
          {isAdmin ? " Create a subject and assign teachers from the Admin bar." : " Ask an admin to assign you to one."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">Your subjects</h1>
      <ul className="space-y-2">
        {subjects.map((s: any) => (
          <li key={s.id}>
            <Link
              href={`/dashboard/teacher/subjects/${s.id}`}
              className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
