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
    // Safe to select is_correct here -- the attempt is already locked in
    // (submit_quiz_attempt has run), so showing the answer key can't help
    // the student change their score.
    const { data: reviewQuestions } = await supabase
      .from("quiz_questions")
      .select("id, prompt, sequence_order, quiz_options(id, label, is_correct, sequence_order)")
      .eq("quiz_id", quizId)
      .order("sequence_order", { ascending: true });

    const { data: myAnswers } = await supabase
      .from("quiz_answers")
      .select("question_id, option_id")
      .eq("attempt_id", attempt.id);
    const answerByQuestion = Object.fromEntries((myAnswers ?? []).map((a) => [a.question_id, a.option_id]));

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
        <div className="mb-4 rounded-xl border border-leaf bg-leaf-soft p-6 text-center">
          <p className="font-display text-2xl font-semibold text-ink">
            {attempt.score} / {attempt.total_points}
          </p>
          <p className="mt-1 text-sm text-ink-soft">Already submitted.</p>
        </div>

        <h2 className="mb-2 text-sm font-medium text-ink-soft">Review</h2>
        <div className="space-y-3">
          {(reviewQuestions ?? []).map((q: any, i: number) => {
            const myOptionId = answerByQuestion[q.id];
            const options = (q.quiz_options ?? []).sort(
              (a: any, b: any) => a.sequence_order - b.sequence_order
            );
            const gotItRight = options.find((o: any) => o.id === myOptionId)?.is_correct === true;
            return (
              <div key={q.id} className="rounded-xl border border-rule bg-white p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    {i + 1}. {q.prompt}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      gotItRight ? "bg-leaf-soft text-leaf" : "bg-clay/10 text-clay"
                    }`}
                  >
                    {gotItRight ? "Correct" : "Incorrect"}
                  </span>
                </div>
                <div className="space-y-1">
                  {options.map((o: any) => {
                    const isMine = o.id === myOptionId;
                    const isCorrect = o.is_correct;
                    return (
                      <p
                        key={o.id}
                        className={`rounded-lg px-2 py-1 text-sm ${
                          isCorrect
                            ? "bg-leaf-soft text-ink"
                            : isMine
                              ? "bg-clay/10 text-ink"
                              : "text-ink-soft"
                        }`}
                      >
                        {o.label}
                        {isCorrect && <span className="ml-1 text-xs text-leaf">✓ correct answer</span>}
                        {isMine && !isCorrect && <span className="ml-1 text-xs text-clay">your answer</span>}
                      </p>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
