// One subject's topics at one level. RLS (topic_note_visible / is_topic_reader,
// 0020) is the real gate -- this only lists topics that currently have a
// visible published note, same principle as the old per-space page.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function StudentLevelSubjectPage({
  params,
}: {
  params: Promise<{ level: string; levelNumber: string; subjectId: string }>;
}) {
  const { level, levelNumber, subjectId } = await params;
  const supabase = createClient();
  await requireUser();

  const { data: subject } = await supabase.from("subjects").select("id, name").eq("id", subjectId).single();
  if (!subject) notFound();

  const { data: topicRows } = await supabase
    .from("topics")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("education_level", level)
    .eq("level_number", Number(levelNumber));
  const topicIds = (topicRows ?? []).map((t) => t.id);

  const { data: visibleNotes } = topicIds.length
    ? await supabase
        .from("topic_notes")
        .select("topic_id, topics(id, title, sequence_order)")
        .eq("status", "published")
        .in("topic_id", topicIds)
    : { data: [] };

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
      <Breadcrumbs
        items={[
          { label: `${level.toUpperCase()} ${levelNumber}`, href: `/dashboard/student/levels/${level}/${levelNumber}` },
          { label: subject.name },
        ]}
      />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{subject.name}</h1>

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
