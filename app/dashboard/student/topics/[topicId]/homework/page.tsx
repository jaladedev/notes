// Student view: see homework for this topic and submit/update an answer.
// RLS (homework_submissions_own) already scopes reads/writes to the
// signed-in student's own submission.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { SubmitHomeworkForm } from "@/components/homework/SubmitHomeworkForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getDueStatus, DUE_STATUS_STYLES, DUE_STATUS_LABELS } from "@/lib/dueStatus";

export default async function StudentHomeworkPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();
  const { id: studentId } = await requireUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, space_id, spaces(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  const { data: assignments } = await supabase
    .from("homework")
    .select("id, title, instructions, due_at")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });

  const homeworkIds = (assignments ?? []).map((h) => h.id);
  const { data: mySubmissions } = homeworkIds.length
    ? await supabase
        .from("homework_submissions")
        .select("id, homework_id, content, grade, feedback, submitted_at")
        .in("homework_id", homeworkIds)
        .eq("student_id", studentId)
    : { data: [] };

  const byHomework = new Map((mySubmissions ?? []).map((s) => [s.homework_id, s]));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Spaces", href: "/dashboard/student" },
            { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/student/spaces/${topic.space_id}` },
            { label: topic.title, href: `/dashboard/student/topics/${topicId}` },
            { label: "Homework" },
          ]}
        />
        <h1 className="font-display text-xl font-semibold text-ink">Homework</h1>
      </div>

      {(assignments ?? []).map((hw) => {
        const mine = byHomework.get(hw.id);
        const status = getDueStatus(hw.due_at, mine != null);
        return (
          <div key={hw.id} className="rounded-xl border border-rule bg-white p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-ink">{hw.title}</h3>
              <div className="flex items-center gap-2">
                {status !== "none" && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DUE_STATUS_STYLES[status]}`}>
                    {DUE_STATUS_LABELS[status]}
                  </span>
                )}
                {hw.due_at && (
                  <span className="text-xs text-ink-soft">Due {new Date(hw.due_at).toLocaleString()}</span>
                )}
              </div>
            </div>
            {hw.instructions && <p className="mb-3 text-sm text-ink-soft">{hw.instructions}</p>}

            {mine?.grade != null && (
              <div className="mb-3 rounded-lg bg-leaf-soft p-3 text-sm text-ink">
                <p className="font-medium">Grade: {mine.grade}</p>
                {mine.feedback && <p className="mt-1 text-ink-soft">{mine.feedback}</p>}
              </div>
            )}

            <SubmitHomeworkForm homeworkId={hw.id} existingContent={mine?.content ?? null} />
          </div>
        );
      })}
      {(!assignments || assignments.length === 0) && (
        <p className="text-sm text-ink-soft">No homework posted for this topic yet.</p>
      )}
    </div>
  );
}
