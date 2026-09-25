// New page, not ported. Only shows topics with a currently-visible
// published note -- RLS (topic_note_visible) is the source of truth,
// this just avoids listing topics that would 404 on click.
//
// Membership check: this used to do its own space_members lookup
// before RLS ever ran. That broke for a class-enrolled student (0005
// migration) -- they have no space_members row at all, only a
// class_members one, so the old check 404'd them even though RLS's
// spaces_member policy (which now also checks is_space_reader) would
// have let them read the space. Removed the manual check entirely and
// let the `spaces` select below be the real gate -- RLS returns no row
// for someone who isn't a reader either way, direct or via class.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function StudentSpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  const supabase = createClient();
  await requireUser();

  const { data: space } = await supabase.from("spaces").select("id, name").eq("id", spaceId).single();
  if (!space) notFound();

  // RLS already filters topic_notes to what's visible (published,
  // approved, released) -- this select only returns rows the student
  // can actually open.
  const { data: visibleNotes } = await supabase
    .from("topic_notes")
    .select("topic_id, topics(id, title, sequence_order)")
    .eq("status", "published")
    .in(
      "topic_id",
      (
        await supabase.from("topics").select("id").eq("space_id", spaceId)
      ).data?.map((t) => t.id) ?? []
    );

  const seen = new Set<string>();
  const topics = (visibleNotes ?? [])
    .map((n: any) => n.topics)
    .filter((t: any) => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .sort((a: any, b: any) => a.sequence_order - b.sequence_order);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Spaces", href: "/dashboard/student" }, { label: space.name }]} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{space.name}</h1>
        <Link href="/dashboard/timetable" className="text-sm text-ink underline">
          Timetable
        </Link>
      </div>

      {topics.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing published here yet.</p>
      ) : (
        <ul className="space-y-2">
          {topics.map((topic: any) => (
            <li key={topic.id}>
              <Link
                href={`/dashboard/student/topics/${topic.id}`}
                className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
              >
                {topic.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
