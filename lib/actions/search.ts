"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { buildSnippet } from "@/lib/plainText";
import { extractSearchTerms, usesPhraseSyntax } from "@/lib/searchQuery";

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
  const select = "id, content, status, topic_id, topics(title, subject_id, subjects(name))";
  let rows: any[] | null = null;

  if (usesPhraseSyntax(trimmed)) {
    // Quoted phrases / "or" / -exclusions: keep full websearch semantics.
    // websearch_to_tsquery tolerates plain user input (quotes, "or", stray
    // punctuation) much better than plainto_tsquery/to_tsquery would.
    const { data, error } = await supabase
      .from("topic_notes")
      .select(select)
      .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
      .eq("status", "published")
      .limit(25);
    if (error) return [];
    rows = data;
  } else {
    // Prefix search ("photo" finds "photosynthesis"): the RPC runs as the
    // caller, so RLS still decides which notes can come back (0032).
    const { data: hits, error: rpcError } = await supabase.rpc("search_topic_notes_prefix", {
      p_query: trimmed,
      p_limit: 25,
    });
    if (rpcError || !hits || hits.length === 0) return [];
    const ids = hits.map((h: { id: string }) => h.id);
    const { data, error } = await supabase.from("topic_notes").select(select).in("id", ids);
    if (error || !data) return [];
    const order = new Map<string, number>(ids.map((id: string, i: number) => [id, i]));
    rows = [...data].sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  if (!rows) return [];
  const snippetQuery = extractSearchTerms(trimmed).join(" ") || trimmed;

  return rows.map((n: any) => ({
    noteId: n.id,
    topicId: n.topic_id,
    topicTitle: n.topics?.title ?? "Untitled topic",
    subjectId: n.topics?.subject_id ?? "",
    subjectName: n.topics?.subjects?.name ?? "Subject",
    snippet: buildSnippet(n.content ?? "", snippetQuery),
  }));
}
