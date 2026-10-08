"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { buildSnippet } from "@/lib/plainText";

export type NoteSearchResult = {
  noteId: string;
  topicId: string;
  topicTitle: string;
  subjectId: string;
  subjectName: string;
  snippet: string;
};

/**
 * Full-text search over notes the caller can already read. Relies
 * entirely on RLS (notes_visible -> topic_note_visible()) to scope
 * results -- this runs through the request-scoped client, so it can
 * never surface a note the caller couldn't already open directly.
 */
export async function searchNotes(query: string): Promise<NoteSearchResult[]> {
  await requireUser();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = createClient();
  // websearch_to_tsquery tolerates plain user input (quotes, "or", stray
  // punctuation) much better than plainto_tsquery/to_tsquery would.
  const { data, error } = await supabase
    .from("topic_notes")
    .select("id, content, status, topic_id, topics(title, subject_id, subjects(name))")
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .eq("status", "published")
    .limit(25);

  if (error || !data) return [];

  return data.map((n: any) => ({
    noteId: n.id,
    topicId: n.topic_id,
    topicTitle: n.topics?.title ?? "Untitled topic",
    subjectId: n.topics?.subject_id ?? "",
    subjectName: n.topics?.subjects?.name ?? "Subject",
    snippet: buildSnippet(n.content ?? "", trimmed),
  }));
}
