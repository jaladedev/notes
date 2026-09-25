// Ported concept from school_app's student topic page, rewritten
// against this app's schema (no education-level/week gating -- release
// is just topic_notes.release_at, see plan doc section 5).

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { TopicContent } from "@/components/TopicContent";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function StudentTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();
  const { id: studentId } = await requireUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, space_id, spaces(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  // RLS (topic_note_visible) already enforces release_at/moderation/membership --
  // if the student can't see it, this just returns null.
  const { data: note } = await supabase
    .from("topic_notes")
    .select("id, content")
    .eq("topic_id", topicId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!note) notFound();

  const { data: resources } = await supabase
    .from("topic_resources")
    .select("*")
    .eq("topic_id", topicId)
    .order("sequence_order", { ascending: true });

  // Fire-and-forget read receipt -- upsert so re-opening doesn't create
  // duplicate rows, only bumps last_read_at (plan doc section 7).
  await supabase
    .from("topic_reads")
    .upsert(
      { topic_id: topicId, student_id: studentId, last_read_at: new Date().toISOString() },
      { onConflict: "topic_id,student_id" }
    );

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Spaces", href: "/dashboard/student" },
          { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/student/spaces/${topic.space_id}` },
          { label: topic.title },
        ]}
      />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{topic.title}</h1>
      <div className="mb-4 flex gap-2">
        <a
          href={`/dashboard/student/topics/${topicId}/homework`}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold"
        >
          Homework
        </a>
        <a
          href={`/dashboard/student/topics/${topicId}/quizzes`}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold"
        >
          Quizzes
        </a>
      </div>
      <TopicContent content={note.content} resources={resources ?? []} />
    </div>
  );
}
