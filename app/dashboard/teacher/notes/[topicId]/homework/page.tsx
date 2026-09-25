// Teacher/reviewer/admin view: post homework for this topic, see every
// student's submission, and grade it inline.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole } from "@/lib/actions/authGuards";
import { CreateHomeworkForm } from "@/components/homework/CreateHomeworkForm";
import { GradeSubmissionForm } from "@/components/homework/GradeSubmissionForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function TeacherHomeworkPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, space_id, spaces(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: assignments } = await supabase
    .from("homework")
    .select("id, title, instructions, due_at")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });

  const homeworkIds = (assignments ?? []).map((h) => h.id);
  const { data: submissions } = homeworkIds.length
    ? await supabase
        .from("homework_submissions")
        .select("id, homework_id, content, file_url, submitted_at, grade, feedback, profiles(full_name)")
        .in("homework_id", homeworkIds)
        .order("submitted_at", { ascending: false })
    : { data: [] };

  const byHomework = new Map<string, typeof submissions>();
  for (const s of submissions ?? []) {
    const list = byHomework.get(s.homework_id) ?? [];
    list.push(s);
    byHomework.set(s.homework_id, list);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Spaces", href: "/dashboard/teacher" },
            { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/teacher/spaces/${topic.space_id}` },
            { label: topic.title, href: `/dashboard/teacher/notes/${topicId}` },
            { label: "Homework" },
          ]}
        />
        <h1 className="font-display text-xl font-semibold text-ink">Homework</h1>
      </div>

      <CreateHomeworkForm topicId={topicId} />

      <div className="space-y-4">
        {(assignments ?? []).map((hw) => {
          const subs = byHomework.get(hw.id) ?? [];
          return (
            <div key={hw.id} className="rounded-xl border border-rule bg-white p-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-ink">{hw.title}</h3>
                {hw.due_at && (
                  <span className="text-xs text-ink-soft">
                    Due {new Date(hw.due_at).toLocaleString()}
                  </span>
                )}
              </div>
              {hw.instructions && <p className="mb-3 text-sm text-ink-soft">{hw.instructions}</p>}

              <p className="mb-2 text-xs uppercase tracking-wide text-ink-soft">
                {subs.length} submission{subs.length === 1 ? "" : "s"}
              </p>
              <div className="space-y-3">
                {subs.map((s: any) => (
                  <div key={s.id} className="rounded-lg bg-paper p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{s.profiles?.full_name}</span>
                      <span className="text-xs text-ink-soft">
                        {new Date(s.submitted_at).toLocaleString()}
                      </span>
                    </div>
                    {s.content && <p className="mb-2 whitespace-pre-wrap text-sm text-ink">{s.content}</p>}
                    <GradeSubmissionForm
                      submissionId={s.id}
                      existingGrade={s.grade}
                      existingFeedback={s.feedback}
                    />
                  </div>
                ))}
                {subs.length === 0 && <p className="text-sm text-ink-soft">No submissions yet.</p>}
              </div>
            </div>
          );
        })}
        {(!assignments || assignments.length === 0) && (
          <p className="text-sm text-ink-soft">No homework posted for this topic yet.</p>
        )}
      </div>
    </div>
  );
}
