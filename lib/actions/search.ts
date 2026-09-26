"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";

export type NoteSearchResult = {
  noteId: string;
  topicId: string;
  topicTitle: string;
  spaceId: string;
  spaceName: string;
  snippet: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function buildSnippet(content: string, query: string, radius = 80): string {
  const plain = stripHtml(content);
  const lower = plain.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let index = -1;
  for (const w of words) {
    const i = lower.indexOf(w);
    if (i !== -1) {
      index = i;
      break;
    }
  }
  if (index === -1) return plain.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(plain.length, index + radius);
  return `${start > 0 ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`;
}

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
    .select("id, content, status, topic_id, topics(title, space_id, spaces(name))")
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .eq("status", "published")
    .limit(25);

  if (error || !data) return [];

  return data.map((n: any) => ({
    noteId: n.id,
    topicId: n.topic_id,
    topicTitle: n.topics?.title ?? "Untitled topic",
    spaceId: n.topics?.space_id ?? "",
    spaceName: n.topics?.spaces?.name ?? "Space",
    snippet: buildSnippet(n.content ?? "", trimmed),
  }));
}
