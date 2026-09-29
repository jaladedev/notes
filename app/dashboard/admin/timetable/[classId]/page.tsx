// One class's weekly timetable, editable by an admin. Every subject is a
// choice; the teacher choices are that subject's assigned teachers
// (teacher_subjects, 0020) rather than a per-space roster.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { getTimetable } from "@/lib/actions/timetable";
import { TimetableEditor, type EditorSubject } from "@/components/timetable/TimetableEditor";

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

  const { data: subjectRows } = await supabase.from("subjects").select("id, name").order("name");
  const subjectIds = (subjectRows ?? []).map((s) => s.id);

  const { data: assignments } = subjectIds.length
    ? await supabase
        .from("teacher_subjects")
        .select("subject_id, profile_id, profiles(full_name)")
        .in("subject_id", subjectIds)
    : { data: [] };

  const subjects: EditorSubject[] = (subjectRows ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    teachers: (assignments ?? [])
      .filter((a: any) => a.subject_id === s.id)
      .map((a: any) => ({ id: a.profile_id, name: a.profiles?.full_name ?? a.profile_id })),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <Link href="/dashboard/admin/timetable" className="text-sm text-ink-soft hover:underline">
          Timetable
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink">{klass.name}</h1>
      </div>

      <TimetableEditor classId={classId} periods={periods} rows={rows} subjects={subjects} />
    </div>
  );
}
