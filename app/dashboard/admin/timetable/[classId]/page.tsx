// One class's weekly timetable, editable by an admin. The subject choices
// are the spaces linked to this class; the teacher choices are each
// space's teachers.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { getTimetable } from "@/lib/actions/timetable";
import { TimetableEditor, type EditorSpace } from "@/components/timetable/TimetableEditor";

export default async function AdminClassTimetablePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await assertGlobalRole(["admin"], "Only an admin can manage the timetable.");
  const supabase = createClient();

  const { data: klass } = await supabase.from("classes").select("id, name").eq("id", classId).maybeSingle();
  if (!klass) notFound();

  const { periods, rows } = await getTimetable({ classId });

  const { data: spaceRows } = await supabase
    .from("spaces")
    .select("id, name, subjects(name)")
    .eq("class_id", classId)
    .order("name");
  const spaceIds = (spaceRows ?? []).map((s) => s.id);

  const { data: members } = spaceIds.length
    ? await supabase
        .from("space_members")
        .select("space_id, profile_id, role, profiles(full_name)")
        .in("space_id", spaceIds)
        .in("role", ["teacher", "admin"])
    : { data: [] };

  const spaces: EditorSpace[] = (spaceRows ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    subjectName: s.subjects?.name ?? null,
    teachers: (members ?? [])
      .filter((m: any) => m.space_id === s.id)
      .map((m: any) => ({ id: m.profile_id, name: m.profiles?.full_name ?? m.profile_id })),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <Link href="/dashboard/admin/timetable" className="text-sm text-ink-soft hover:underline">
          Timetable
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink">{klass.name}</h1>
      </div>

      <TimetableEditor classId={classId} periods={periods} rows={rows} spaces={spaces} />
    </div>
  );
}
