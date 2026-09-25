// New, not ported. Extended for the school_app-style curriculum flow:
// a space now optionally carries subject/level/year/term, shown here
// alongside the original name/members/topics management.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole } from "@/lib/actions/authGuards";
import { SpaceSettingsPanel } from "@/components/admin/SpaceSettingsPanel";

export default async function AdminSpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  const supabase = createClient();

  await assertSpaceRole(spaceId, ["admin"]);

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, education_level, level_number, academic_year, term, class_id, subjects(name)")
    .eq("id", spaceId)
    .single();
  if (!space) notFound();

  const { data: classes } = await supabase.from("classes").select("id, name").order("name");

  const { data: members } = await supabase
    .from("space_members")
    .select("profile_id, role, profiles(full_name)")
    .eq("space_id", spaceId);

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, week_number")
    .eq("space_id", spaceId)
    .order("sequence_order", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{space.name}</h1>
      <SpaceSettingsPanel
        spaceId={spaceId}
        spaceName={space.name}
        members={(members ?? []) as any}
        topics={topics ?? []}
        curriculum={{
          subjectName: (space as any).subjects?.name ?? null,
          educationLevel: space.education_level,
          levelNumber: space.level_number,
          academicYear: space.academic_year,
          term: space.term,
        }}
        classes={classes ?? []}
        currentClassId={space.class_id}
      />
    </div>
  );
}
