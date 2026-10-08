// Replaces the old per-space student page. There is one URL per level
// (e.g. jss/2), not per class -- JSS2A and JSS2B both land here and see
// the same notes, since notes are shared by level (0020).

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function StudentLevelPage({
  params,
}: {
  params: Promise<{ level: string; levelNumber: string }>;
}) {
  const { level, levelNumber } = await params;
  const supabase = createClient();
  const { id: userId } = await requireUser();

  // Confirm the signed-in user is actually enrolled at this level (or is
  // staff/admin) -- RLS is still the real gate on the notes themselves,
  // this just avoids showing an empty page with no explanation.
  const { data: membership } = await supabase
    .from("class_members")
    .select("classes(education_level, level_number)")
    .eq("profile_id", userId);
  const atThisLevel = (membership ?? []).some(
    (m: any) => m.classes?.education_level === level && String(m.classes?.level_number) === levelNumber
  );
  if (!atThisLevel) notFound();

  // Every subject is linked to every class automatically: list all subjects,
  // not just the ones that already have topics at this level.
  const { data: subjects } = await supabase.from("subjects").select("id, name").order("name");
  const subjectList = subjects ?? [];

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={[{ label: `${level.toUpperCase()} ${levelNumber}` }]} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">
          {level.toUpperCase()} {levelNumber}
        </h1>
        <Link href="/dashboard/timetable" className="text-sm text-ink underline">
          Timetable
        </Link>
      </div>

      {subjectList.length === 0 ? (
        <p className="text-sm text-ink-soft">No subjects have been created yet.</p>
      ) : (
        <ul className="space-y-2">
          {subjectList.map((s: any) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/student/levels/${level}/${levelNumber}/${s.id}`}
                className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
