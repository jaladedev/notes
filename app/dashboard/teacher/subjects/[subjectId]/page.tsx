// Replaces the old per-space teacher page. Topics for a subject are
// grouped by level (education_level + level_number) since one subject
// can be taught at several levels; notes are shared by level, so this
// is the natural grouping for the teacher's list too.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertSubjectRole } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getProfileNames } from "@/lib/actions/studentNames";
import { getSchoolTimeZone } from "@/lib/actions/timetable";

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

  // Ungraded homework across this subject's topics. Read through the
  // request-scoped client, so RLS (is_topic_staff) decides what a teacher
  // can see; only the display names need the admin client.
  const topicTitleById = new Map((topics ?? []).map((t) => [t.id, t.title]));
  const { data: homeworkRows } = topicIds.length
    ? await supabase.from("homework").select("id, title, topic_id").in("topic_id", topicIds)
    : { data: [] };
  const homeworkById = new Map((homeworkRows ?? []).map((h) => [h.id, h]));
  const { data: pendingRows } = homeworkById.size
    ? await supabase
        .from("homework_submissions")
        .select("id, homework_id, student_id, submitted_at")
        .in("homework_id", [...homeworkById.keys()])
        .is("grade", null)
        .order("submitted_at", { ascending: false })
        .limit(50)
    : { data: [] };
  const pending = pendingRows ?? [];
  const pendingNames = await getProfileNames(pending.map((p) => p.student_id));
  const schoolTz = pending.length ? await getSchoolTimeZone() : "UTC";
  const PENDING_SHOWN = 8;

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

      {pending.length > 0 && (
        <section className="mb-6 rounded-xl border border-marigold bg-white p-4">
          <h2 className="mb-2 font-display text-sm font-semibold text-ink">
            Homework to grade ({pending.length}
            {pending.length === 50 ? "+" : ""})
          </h2>
          <ul className="space-y-2">
            {pending.slice(0, PENDING_SHOWN).map((p) => {
              const hw = homeworkById.get(p.homework_id);
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/teacher/notes/${hw?.topic_id}/homework`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-paper p-3 text-sm hover:ring-1 hover:ring-marigold"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {pendingNames.get(p.student_id) ?? "Student"} · {hw?.title}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {hw ? topicTitleById.get(hw.topic_id) : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {new Date(p.submitted_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        timeZone: schoolTz,
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {pending.length > PENDING_SHOWN && (
            <p className="mt-2 text-xs text-ink-soft">
              and {pending.length - PENDING_SHOWN} more. Open a topic&apos;s homework page to grade them.
            </p>
          )}
        </section>
      )}

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
