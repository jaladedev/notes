// New page, not ported. The bell timer in Present mode is fed by the
// school timetable (0011): this teacher's own lessons for today, in the
// school's time zone.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole, getAuthenticatedUser } from "@/lib/actions/authGuards";
import { NoteWorkspace } from "@/components/NoteWorkspace";
import { NoteVersionDiff } from "@/components/NoteVersionDiff";
import { RestoreVersionButton } from "@/components/RestoreVersionButton";
import { DeleteVersionButton } from "@/components/DeleteVersionButton";
import { ShareLinkManager } from "@/components/ShareLinkManager";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { LinkableTopic } from "@/lib/tiptap/topic-link-node";
import { getSchoolTimeZone, getTimetable } from "@/lib/actions/timetable";
import { nowInZone, toBellEntries } from "@/lib/timetable";

export default async function TeacherNotePage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();
  const user = await getAuthenticatedUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, space_id, spaces(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: latestNote } = await supabase
    .from("topic_notes")
    .select("id, content, status")
    .eq("topic_id", topicId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: resources } = await supabase
    .from("topic_resources")
    .select("*")
    .eq("topic_id", topicId)
    .order("sequence_order", { ascending: true });

  const { data: otherTopics } = await supabase
    .from("topics")
    .select("id, title")
    .eq("space_id", topic.space_id)
    .neq("id", topicId);

  // Bell timer (Present mode): this teacher's own lessons today, by the
  // school's clock rather than the server's or the browser's.
  const timeZone = await getSchoolTimeZone();
  const { weekday } = nowInZone(new Date(), timeZone);
  const { periods, rows: todaysLessons } = await getTimetable({ teacherId: user.id, weekday });
  const todaysEntries = toBellEntries(todaysLessons, periods, weekday);

  // Version history -- ordered newest first so RestoreVersionButton's
  // isLatest={i === 0} matches, same as school_app.
  const { data: rawVersions } = await supabase
    .from("topic_notes")
    .select("id, version, status, moderation_status, created_at")
    .eq("topic_id", topicId)
    .order("version", { ascending: false });
  const versions = (rawVersions ?? []).map((v) => ({ ...v, updated_at: v.created_at }));

  const { data: shareLinks } = await supabase
    .from("share_links")
    .select("id, token, access_code, expires_at")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Spaces", href: "/dashboard/teacher" },
          { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/teacher/spaces/${topic.space_id}` },
          { label: topic.title },
        ]}
      />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{topic.title}</h1>
      <NoteWorkspace
        topicId={topicId}
        noteId={latestNote?.id}
        initialContent={latestNote?.content ?? ""}
        initialStatus={(latestNote?.status as "draft" | "published") ?? "unwritten"}
        resources={resources ?? []}
        topics={(otherTopics ?? []) as LinkableTopic[]}
        todaysEntries={todaysEntries}
        timeZone={timeZone}
        topicMeta={{
          title: topic.title,
          subtitle: (topic as any).spaces?.name ?? null,
        }}
        placeholder="Start writing this lesson's notes…"
      />
      <div className="mb-4 flex gap-2 print:hidden">
        <a
          href={`/dashboard/teacher/notes/${topicId}/homework`}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold"
        >
          Homework
        </a>
        <a
          href={`/dashboard/teacher/notes/${topicId}/quizzes`}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold"
        >
          Quizzes
        </a>
      </div>

      <ShareLinkManager topicId={topicId} links={shareLinks ?? []} />

      {versions.length > 0 && (
        <section className="mt-6 rounded-xl border border-rule bg-white p-4 print:hidden">
          <h2 className="font-display text-lg font-semibold text-ink">Version history</h2>
          <div className="mt-3 space-y-2">
            {versions.map((version, i) => (
              <div
                key={version.id}
                className="flex flex-col gap-2 rounded-lg bg-paper px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-ink">Version {version.version}</span>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="text-xs text-ink-soft">
                    {version.status}
                    {version.status === "published" ? ` (${version.moderation_status})` : ""} ·{" "}
                    {new Date(version.updated_at).toLocaleString()}
                  </span>
                  <RestoreVersionButton
                    topicId={topicId}
                    versionNoteId={version.id}
                    versionNumber={version.version}
                    isLatest={i === 0}
                  />
                  <DeleteVersionButton
                    topicId={topicId}
                    versionNoteId={version.id}
                    versionNumber={version.version}
                    disabled={versions.length <= 1}
                  />
                </div>
              </div>
            ))}
          </div>
          <NoteVersionDiff versions={versions} />
        </section>
      )}
    </div>
  );
}
