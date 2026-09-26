import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { searchNotes } from "@/lib/actions/search";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SearchBox } from "@/components/SearchBox";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { id: userId } = await requireUser();
  const supabase = createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const isStudent = profile?.role === "student";

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchNotes(query) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Search" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">Search notes</h1>

      <SearchBox initialQuery={query} />

      {query && (
        <p className="text-xs text-ink-soft">
          {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
        </p>
      )}

      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.noteId}>
            <Link
              href={
                isStudent
                  ? `/dashboard/student/topics/${r.topicId}`
                  : `/dashboard/teacher/notes/${r.topicId}`
              }
              className="block rounded-lg border border-rule bg-white p-3 hover:border-marigold"
            >
              <p className="text-sm font-medium text-ink">{r.topicTitle}</p>
              <p className="text-xs text-ink-soft">{r.spaceName}</p>
              <p className="mt-1 text-sm text-ink-soft">{r.snippet}</p>
            </Link>
          </li>
        ))}
        {query && results.length === 0 && (
          <p className="text-sm text-ink-soft">No published notes match that search.</p>
        )}
      </ul>
    </div>
  );
}
