// A subject's teacher assignments and topics (grouped by level/year/term).

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { SubjectTeachersPanel } from "@/components/admin/SubjectTeachersPanel";
import { SubjectTopicsPanel } from "@/components/admin/SubjectTopicsPanel";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminSubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  await requireUser();
  const supabase = createClient();

  const { data: subject } = await supabase.from("subjects").select("id, name").eq("id", subjectId).single();
  if (!subject) notFound();

  const { data: teachers } = await supabase
    .from("teacher_subjects")
    .select("profile_id, role, profiles(full_name)")
    .eq("subject_id", subjectId);

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, education_level, level_number, academic_year, term, week_number")
    .eq("subject_id", subjectId)
    .order("education_level", { ascending: true })
    .order("level_number", { ascending: true })
    .order("sequence_order", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Subjects", href: "/dashboard/admin/subjects" }, { label: subject.name }]} />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{subject.name}</h1>
      <div className="space-y-6">
        <SubjectTeachersPanel subjectId={subjectId} teachers={(teachers ?? []) as any} />
        <SubjectTopicsPanel subjectId={subjectId} topics={topics ?? []} />
      </div>
    </div>
  );
}
