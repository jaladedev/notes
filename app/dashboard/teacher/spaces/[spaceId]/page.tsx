// New page, not ported (school_app has no equivalent -- "space" is a
// concept from this app's own data model, plan doc section 5).

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function TeacherSpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  const supabase = createClient();

  const membership = await assertSpaceRole(spaceId, ["teacher", "reviewer", "admin"]);

  const { data: space } = await supabase.from("spaces").select("id, name").eq("id", spaceId).single();
  if (!space) notFound();

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, sequence_order")
    .eq("space_id", spaceId)
    .order("sequence_order", { ascending: true });

  // One query per topic's latest note would be N+1 -- pull every note
  // for this space's topics at once and reduce to the latest per topic
  // client-side instead.
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

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Spaces", href: "/dashboard/teacher" }, { label: space.name }]} />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{space.name}</h1>
        <div className="flex items-center gap-3">
          {membership.role === "admin" && (
            <span className="text-xs uppercase tracking-wide text-ink-soft">Admin</span>
          )}
          <Link href="/dashboard/timetable" className="text-sm text-ink underline">
            My week
          </Link>
        </div>
      </div>

      {(topics ?? []).length === 0 ? (
        <p className="text-sm text-ink-soft">
          No topics yet in this space. Create one directly in Supabase for now (topic/space CRUD UI
          isn&apos;t built yet — see README).
        </p>
      ) : (
        <ul className="space-y-2">
          {(topics ?? []).map((topic) => {
            const status = latestStatusByTopic.get(topic.id);
            return (
              <li key={topic.id}>
                <Link
                  href={`/dashboard/teacher/notes/${topic.id}`}
                  className="flex items-center justify-between rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
                >
                  <span>{topic.title}</span>
                  <span className="text-xs uppercase tracking-wide text-ink-soft">
                    {status ?? "unwritten"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
