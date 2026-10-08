// Printable / save-as-PDF version of a published note. Visibility is
// enforced by RLS exactly as on the main topic page (release_at, moderation,
// week gate, class membership) -- if the student can't see the note, this
// 404s. Printing is done by the browser (see the @media print block in
// globals.css), so "Save as PDF" works everywhere without a server-side
// renderer. generateMetadata sets the document title because browsers
// propose it as the default PDF filename.

import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { HandoutView } from "@/components/HandoutView";

const getTopic = cache(async (topicId: string) => {
  const supabase = createClient();
  const { data } = await supabase
    .from("topics")
    .select("id, title, education_level, level_number, academic_year, term, week_number, subjects(name)")
    .eq("id", topicId)
    .single();
  return data as
    | {
        id: string;
        title: string;
        education_level: string;
        level_number: number;
        academic_year: string;
        term: number;
        week_number: number | null;
        subjects: { name: string } | null;
      }
    | null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topicId: string }>;
}): Promise<Metadata> {
  const { topicId } = await params;
  const topic = await getTopic(topicId);
  return { title: topic ? `${topic.title} - handout` : "Handout" };
}

export default async function StudentTopicHandoutPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();
  await requireUser();

  const topic = await getTopic(topicId);
  if (!topic) notFound();

  const { data: note } = await supabase
    .from("topic_notes")
    .select("content")
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

  // Same label style the rest of the app uses, e.g. "Mathematics · JSS 2 · 2026/2027 · Term 1 · Week 3".
  const subtitle = [
    topic.subjects?.name,
    `${topic.education_level.toUpperCase()} ${topic.level_number}`,
    topic.academic_year,
    `Term ${topic.term}`,
    topic.week_number != null ? `Week ${topic.week_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link
        href={`/dashboard/student/topics/${topicId}`}
        className="mb-3 inline-block text-sm text-ink-soft hover:text-ink print:hidden"
      >
        ← Back to note
      </Link>
      <HandoutView
        content={note.content}
        resources={resources ?? []}
        topicMeta={{ title: topic.title, subtitle }}
      />
    </div>
  );
}
