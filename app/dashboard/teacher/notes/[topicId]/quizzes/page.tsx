import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole } from "@/lib/actions/authGuards";
import { CreateQuizForm } from "@/components/quizzes/CreateQuizForm";
import { PublishQuizToggle } from "@/components/quizzes/PublishQuizToggle";

export default async function TeacherQuizzesPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, space_id")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, published, quiz_attempts(id, submitted_at, score, total_points)")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Link href={`/dashboard/teacher/notes/${topicId}`} className="text-sm text-ink-soft hover:text-ink">
          ← {topic.title}
        </Link>
        <h1 className="font-display text-xl font-semibold text-ink">Quizzes</h1>
      </div>

      <CreateQuizForm topicId={topicId} />

      <div className="space-y-3">
        {(quizzes ?? []).map((q: any) => {
          const submitted = q.quiz_attempts.filter((a: any) => a.submitted_at);
          const avg =
            submitted.length > 0
              ? submitted.reduce((sum: number, a: any) => sum + (a.score ?? 0) / (a.total_points || 1), 0) /
                submitted.length
              : null;
          return (
            <div
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-white p-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {q.title}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                      q.published ? "bg-leaf-soft text-leaf" : "bg-paper text-ink-soft"
                    }`}
                  >
                    {q.published ? "Published" : "Draft"}
                  </span>
                </p>
                <p className="text-xs text-ink-soft">
                  {submitted.length} attempt{submitted.length === 1 ? "" : "s"}
                  {avg !== null && ` · avg ${(avg * 100).toFixed(0)}%`}
                </p>
              </div>
              <PublishQuizToggle quizId={q.id} published={q.published} />
            </div>
          );
        })}
        {(!quizzes || quizzes.length === 0) && (
          <p className="text-sm text-ink-soft">No quizzes for this topic yet.</p>
        )}
      </div>
    </div>
  );
}
