// Replaces the old per-space teacher page. Topics for a subject are
// grouped by level (education_level + level_number) since one subject
// can be taught at several levels; notes are shared by level, so this
// is the natural grouping for the teacher's list too.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertSubjectRole } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function TeacherSubjectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  const supabase = createClient();

  const membership = await assertSubjectRole(subjectId, ["teacher", "reviewer"]);

  const { data: subject } = await supabase.from("subjects").select("id, name").eq("id", subjectId).single();
  if (!subject) notFound();

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, sequence_order, education_level, level_number, academic_year, term, week_number")
    .eq("subject_id", subjectId)
    .order("education_level", { ascending: true })
    .order("level_number", { ascending: true })
    .order("sequence_order", { ascending: true });

  const topicIds = (topics ?? []).map((t) => t.id);
  const { data: notes } = topicIds.length
    ? await supabase
        .from("topic_notes")
        .select("topic_id, status, version")
        .in("topic_id", topicIds)
        .order("version", { ascending: false })
    : { data: [] };

  const latestStatusByTopic = new Map<string, string>();
  for (const n of notes ?? []) {
    if (!latestStatusByTopic.has(n.topic_id)) latestStatusByTopic.set(n.topic_id, n.status);
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("current_academic_year, current_term")
    .maybeSingle();
  const currentYear = (settings as any)?.current_academic_year as string | null | undefined;
  const currentTerm = (settings as any)?.current_term as number | null | undefined;
  const gated = Boolean(currentYear && currentTerm);

  const groups = new Map<
    string,
    { label: string; isCurrent: boolean; topics: NonNullable<typeof topics> }
  >();
  const sortedTopics = [...(topics ?? [])].sort(
    (a, b) => (a.week_number ?? 99) - (b.week_number ?? 99) || a.sequence_order - b.sequence_order
  );
  for (const t of sortedTopics) {
    const key = `${t.education_level}-${t.level_number}-${t.academic_year}-${t.term}`;
    const label = `${t.education_level?.toUpperCase()} ${t.level_number} · ${t.academic_year} · Term ${t.term}`;
    const isCurrent = !gated || (t.academic_year === currentYear && t.term === currentTerm);
    if (!groups.has(key)) groups.set(key, { label, isCurrent, topics: [] });
    groups.get(key)!.topics.push(t);
  }

  const entries = [...groups.entries()];
  const currentGroups = entries.filter(([, g]) => g.isCurrent);
  const otherGroups = entries.filter(([, g]) => !g.isCurrent);

  function renderGroup(key: string, group: (typeof entries)[number][1]) {
    return (
      <div key={key} className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{group.label}</h2>
        <ul className="space-y-2">
          {group.topics.map((topic) => {
            const status = latestStatusByTopic.get(topic.id);
            return (
              <li key={topic.id}>
                <Link
                  href={`/dashboard/teacher/notes/${topic.id}`}
                  className="flex items-center justify-between rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
                >
                  <span>
                    {topic.title}
                    {topic.week_number != null && (
                      <span className="ml-2 text-xs text-ink-soft">Week {topic.week_number}</span>
                    )}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-ink-soft">
                    {status ?? "unwritten"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Subjects", href: "/dashboard" }, { label: subject.name }]} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{subject.name}</h1>
        <div className="flex items-center gap-3">
          {membership.role === "reviewer" && (
            <span className="text-xs uppercase tracking-wide text-ink-soft">Reviewer</span>
          )}
          <Link href="/dashboard/timetable" className="text-sm text-ink underline">
            My week
          </Link>
        </div>
      </div>

      {groups.size === 0 ? (
        <p className="text-sm text-ink-soft">
          No topics yet for this subject. Ask an admin to add topics under Admin → Subjects.
        </p>
      ) : (
        <>
          {gated && currentGroups.length === 0 && (
            <p className="mb-4 text-sm text-ink-soft">No topics for the current term yet.</p>
          )}
          {currentGroups.map(([key, group]) => renderGroup(key, group))}
          {otherGroups.length > 0 && (
            <details className="mt-2 rounded-lg border border-rule bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                Other terms ({otherGroups.length})
              </summary>
              <div className="mt-3">{otherGroups.map(([key, group]) => renderGroup(key, group))}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
