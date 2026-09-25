// RLS (quizzes_visible) already limits this to published quizzes for
// topics the student can read.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function StudentQuizzesPage({
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

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, time_limit_seconds")
    .eq("topic_id", topicId)
    .eq("published", true)
    .order("created_at", { ascending: false });

  const quizIds = (quizzes ?? []).map((q) => q.id);
  const { data: myAttempts } = quizIds.length
    ? await supabase
        .from("quiz_attempts")
        .select("id, quiz_id, submitted_at, score, total_points")
        .in("quiz_id", quizIds)
        .eq("student_id", studentId)
    : { data: [] };

  const attemptByQuiz = new Map((myAttempts ?? []).map((a) => [a.quiz_id, a]));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Spaces", href: "/dashboard/student" },
            { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/student/spaces/${topic.space_id}` },
            { label: topic.title, href: `/dashboard/student/topics/${topicId}` },
            { label: "Quizzes" },
          ]}
        />
        <h1 className="font-display text-xl font-semibold text-ink">Quizzes</h1>
      </div>

      {(quizzes ?? []).map((q) => {
        const attempt = attemptByQuiz.get(q.id);
        const done = attempt?.submitted_at;
        return (
          <Link
            key={q.id}
            href={`/dashboard/student/topics/${topicId}/quizzes/${q.id}`}
            className="block rounded-lg border border-rule bg-white p-3 hover:border-marigold"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">{q.title}</span>
              {done ? (
                <span className="text-xs text-leaf">
                  {attempt!.score} / {attempt!.total_points}
                </span>
              ) : (
                <span className="text-xs text-marigold-text">
                  {attempt ? "In progress" : "Not started"}
                </span>
              )}
            </div>
          </Link>
        );
      })}
      {(!quizzes || quizzes.length === 0) && (
        <p className="text-sm text-ink-soft">No quizzes published for this topic yet.</p>
      )}
    </div>
  );
}
