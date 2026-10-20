import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { startQuizAttempt } from "@/lib/actions/quizAttempt";
import { QuizAttemptRunner, type RunnerAnswer, type RunnerQuestion } from "@/components/quizzes/QuizAttemptRunner";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getSchoolTimeZone } from "@/lib/schoolSettings";
import { describeQuizWindow, quizWindowState } from "@/lib/quizWindow";
import { orderQuestionsForAttempt, seededShuffle } from "@/lib/quizShuffle";
import type { QuizQuestionType } from "@/lib/quizValidation";

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
    .select("id, title, subject_id, education_level, level_number, subjects(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, published, opens_at, closes_at, shuffle_questions")
    .eq("id", quizId)
    .eq("topic_id", topicId)
    .eq("published", true)
    .maybeSingle();
  if (!quiz) notFound();

  const crumbs = [
    { label: "Dashboard", href: "/dashboard" },
    { label: (topic as any).subjects?.name ?? "Subject", href: `/dashboard/student/levels/${topic.education_level}/${topic.level_number}/${topic.subject_id}` },
    { label: topic.title, href: `/dashboard/student/topics/${topicId}` },
    { label: "Quizzes", href: `/dashboard/student/topics/${topicId}/quizzes` },
    { label: quiz.title },
  ];
  const message = (text: string) => (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{quiz.title}</h1>
      <p className="rounded-lg bg-paper p-3 text-sm text-ink">{text}</p>
    </div>
  );

  let { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, submitted_at, score, total_points, needs_grading")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();

  // ---- already submitted: score + link to the review page ----
  if (attempt?.submitted_at) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Breadcrumbs items={crumbs} />
        <h1 className="mb-4 font-display text-xl font-semibold text-ink">{quiz.title}</h1>
        <div className="mb-4 rounded-xl border border-leaf bg-leaf-soft p-6 text-center">
          <p className="font-display text-2xl font-semibold text-ink">
            {attempt.score} / {attempt.total_points}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {attempt.needs_grading
              ? "Submitted. This score is provisional — your teacher still has to grade your written answers."
              : "Submitted."}
          </p>
        </div>
        <Link
          href={`/dashboard/student/topics/${topicId}/quizzes/${quizId}/review`}
          className="inline-block rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark"
        >
          Review your answers
        </Link>
      </div>
    );
  }

  // ---- not submitted: the window decides whether they can (continue to) take it ----
  const state = quizWindowState(quiz.opens_at, quiz.closes_at, new Date(), 60_000);
  if (state !== "open") {
    const label = describeQuizWindow(quiz.opens_at, quiz.closes_at, new Date(), await getSchoolTimeZone());
    return message(state === "upcoming" ? `This quiz isn't open yet. ${label ?? ""}`.trim() : "This quiz is closed.");
  }

  if (!attempt) {
    const started = await startQuizAttempt(quizId);
    if (!started.ok) return message(started.error);
    attempt = { id: started.data.attemptId, submitted_at: null, score: null, total_points: null, needs_grading: false };
  }

  // Questions, options and the student's saved answers all come from one
  // RPC (0031). quiz_options is not readable by students any more, so the
  // answer key never reaches this page at all: matching returns the left
  // terms as options and the right terms as a separate, unpaired list, and
  // fill-in-the-blank / essay return no options.
  const { data: rows, error: rpcError } = await supabase.rpc("get_quiz_attempt_questions", {
    p_attempt_id: attempt.id,
  });
  if (rpcError) return message("Couldn't load this quiz. Please try again.");

  const ordered = orderQuestionsForAttempt(rows ?? [], attempt.id, quiz.shuffle_questions);
  const questions: RunnerQuestion[] = ordered.map((q) => ({
    id: q.question_id,
    type: q.question_type as QuizQuestionType,
    prompt: q.prompt,
    points: Number(q.points),
    options: q.options ?? [],
    choices: q.question_type === "matching" ? seededShuffle(q.choices ?? [], `${attempt!.id}:${q.question_id}`) : undefined,
  }));

  const initialAnswers: Record<string, RunnerAnswer> = Object.fromEntries(
    (rows ?? []).map((q) => [
      q.question_id,
      { optionId: q.option_id, textAnswer: q.text_answer, matchingAnswer: q.matching_answer },
    ])
  );

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">{quiz.title}</h1>
      <QuizAttemptRunner attemptId={attempt.id} questions={questions} initialAnswers={initialAnswers} />
    </div>
  );
}
