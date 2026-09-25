import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { startQuizAttempt } from "@/lib/actions/quizAttempt";
import { QuizAttemptRunner } from "@/components/quizzes/QuizAttemptRunner";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function StudentQuizAttemptPage({
  params,
}: {
  params: Promise<{ topicId: string; quizId: string }>;
}) {
  const { topicId, quizId } = await params;
  const supabase = createClient();
  const { id: studentId } = await requireUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, space_id, spaces(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, published")
    .eq("id", quizId)
    .eq("published", true)
    .maybeSingle();
  if (!quiz) notFound();

  let { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, submitted_at, score, total_points")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!attempt) {
    const { attemptId } = await startQuizAttempt(quizId);
    attempt = { id: attemptId, submitted_at: null, score: null, total_points: null };
  }

  // Never select is_correct here -- a student must not be able to see
  // the answer key by inspecting the page's data, even though RLS
  // already lets them read the row.
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, prompt, sequence_order, quiz_options(id, label, sequence_order)")
    .eq("quiz_id", quizId)
    .order("sequence_order", { ascending: true });

  const { data: existingAnswers } = await supabase
    .from("quiz_answers")
    .select("question_id, option_id")
    .eq("attempt_id", attempt.id);

  const initialAnswers = Object.fromEntries(
    (existingAnswers ?? []).map((a) => [a.question_id, a.option_id])
  );

  if (attempt.submitted_at) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Breadcrumbs
          items={[
            { label: "Spaces", href: "/dashboard/student" },
            { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/student/spaces/${topic.space_id}` },
            { label: topic.title, href: `/dashboard/student/topics/${topicId}` },
            { label: "Quizzes", href: `/dashboard/student/topics/${topicId}/quizzes` },
            { label: quiz.title },
          ]}
        />
        <h1 className="mb-4 font-display text-xl font-semibold text-ink">{quiz.title}</h1>
        <div className="rounded-xl border border-leaf bg-leaf-soft p-6 text-center">
          <p className="font-display text-2xl font-semibold text-ink">
            {attempt.score} / {attempt.total_points}
          </p>
          <p className="mt-1 text-sm text-ink-soft">Already submitted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Spaces", href: "/dashboard/student" },
          { label: (topic as any).spaces?.name ?? "Space", href: `/dashboard/student/spaces/${topic.space_id}` },
          { label: topic.title, href: `/dashboard/student/topics/${topicId}` },
          { label: "Quizzes", href: `/dashboard/student/topics/${topicId}/quizzes` },
          { label: quiz.title },
        ]}
      />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{quiz.title}</h1>
      <QuizAttemptRunner
        attemptId={attempt.id}
        questions={(questions ?? []).map((q: any) => ({
          id: q.id,
          prompt: q.prompt,
          options: (q.quiz_options ?? []).sort((a: any, b: any) => a.sequence_order - b.sequence_order),
        }))}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}
