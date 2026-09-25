import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { HandoutView } from "@/components/HandoutView";

export default async function StudentTopicHandoutPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();
  await requireUser();

  const { data: topic } = await supabase.from("topics").select("id, title").eq("id", topicId).single();
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

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <HandoutView
        content={note.content}
        resources={resources ?? []}
        topicMeta={{ title: topic.title }}
      />
    </div>
  );
}
