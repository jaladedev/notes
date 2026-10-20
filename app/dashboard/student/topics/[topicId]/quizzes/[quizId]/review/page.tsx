// Question-by-question review of a submitted attempt, for every question
// type. Everything comes from get_quiz_attempt_review() (0031), which
// refuses until the attempt is submitted -- so the answer key can only
// reach this page once the student is done. Per-question points are
// quiz_answers.points_awarded (set by the scorer or by a teacher grading
// an essay), so what's shown always matches the score.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { normalizeAnswer } from "@/lib/quizValidation";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default async function StudentQuizReviewPage({
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
    .select("id, title")
    .eq("id", quizId)
    .eq("topic_id", topicId)
    .eq("published", true)
    .maybeSingle();
  if (!quiz) notFound();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, submitted_at, score, total_points, needs_grading")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!attempt?.submitted_at) redirect(`/dashboard/student/topics/${topicId}/quizzes/${quizId}`);

  const backHref = `/dashboard/student/topics/${topicId}/quizzes/${quizId}`;
  const crumbs = [
    { label: "Dashboard", href: "/dashboard" },
    { label: (topic as any).subjects?.name ?? "Subject", href: `/dashboard/student/levels/${topic.education_level}/${topic.level_number}/${topic.subject_id}` },
    { label: topic.title, href: `/dashboard/student/topics/${topicId}` },
    { label: "Quizzes", href: `/dashboard/student/topics/${topicId}/quizzes` },
    { label: quiz.title, href: backHref },
    { label: "Review" },
  ];

  const { data: review, error: reviewError } = await supabase.rpc("get_quiz_attempt_review", {
    p_attempt_id: attempt.id,
  });
  if (reviewError || !review) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Breadcrumbs items={crumbs} />
        <p className="rounded-lg bg-paper p-3 text-sm text-ink">Couldn&apos;t load your review. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="font-display text-xl font-semibold text-ink">{quiz.title} — review</h1>
      <p className="text-sm text-ink-soft">
        Score: {attempt.score} / {attempt.total_points}
        {attempt.needs_grading ? " (provisional — essays are still being graded)" : ""}
      </p>

      <div className="space-y-3">
        {review.map((q, i) => {
          // One row per question; an unanswered question has no answer fields.
          const a = q.option_id || q.text_answer || q.matching_answer || q.points_awarded !== null ? q : null;
          const max = Number(q.points);
          const awarded = a?.points_awarded === null || a?.points_awarded === undefined ? null : Number(a.points_awarded);
          const options = q.options ?? []; // already in authored order
          const pending = q.question_type === "essay" && Boolean(a?.text_answer?.trim()) && awarded === null;
          const unanswered = !a;
          const full = awarded !== null && awarded >= max;

          return (
            <div key={q.question_id} className="rounded-xl border border-rule bg-white p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  {i + 1}. {q.prompt}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    pending
                      ? "bg-paper text-ink-soft"
                      : full
                        ? "bg-leaf-soft text-leaf"
                        : awarded && awarded > 0
                          ? "bg-marigold/20 text-ink"
                          : "bg-clay/10 text-clay"
                  }`}
                >
                  {pending ? "Awaiting grade" : `${fmt(awarded ?? 0)} / ${fmt(max)}`}
                </span>
              </div>

              {unanswered && <p className="text-sm text-ink-soft">You didn&apos;t answer this question.</p>}

              {q.question_type === "single_choice" && !unanswered && (
                <div className="space-y-1">
                  {options.map((o: any) => {
                    const mine = o.id === a?.option_id;
                    return (
                      <p
                        key={o.id}
                        className={`rounded-lg px-2 py-1 text-sm ${
                          o.is_correct ? "bg-leaf-soft text-ink" : mine ? "bg-clay/10 text-ink" : "text-ink-soft"
                        }`}
                      >
                        {o.label}
                        {o.is_correct && <span className="ml-1 text-xs text-leaf">✓ correct answer</span>}
                        {mine && !o.is_correct && <span className="ml-1 text-xs text-clay">your answer</span>}
                      </p>
                    );
                  })}
                </div>
              )}

              {q.question_type === "fill_blank" && !unanswered && (
                <div className="space-y-1 text-sm">
                  <p className="rounded-lg bg-paper px-2 py-1 text-ink">Your answer: {a.text_answer || "—"}</p>
                  {!full && (
                    <p className="px-2 text-ink-soft">
                      Accepted: {options.map((o: any) => o.label).join(" · ")}
                    </p>
                  )}
                </div>
              )}

              {q.question_type === "matching" && !unanswered && (
                <div className="space-y-1">
                  {options.map((o: any) => {
                    const chosen: string | undefined = a.matching_answer?.[o.id];
                    const ok = normalizeAnswer(chosen) === normalizeAnswer(o.match_text);
                    return (
                      <p key={o.id} className={`rounded-lg px-2 py-1 text-sm ${ok ? "bg-leaf-soft text-ink" : "bg-clay/10 text-ink"}`}>
                        {o.label} → {chosen || "—"}
                        {!ok && <span className="ml-1 text-xs text-ink-soft">(correct: {o.match_text})</span>}
                      </p>
                    );
                  })}
                </div>
              )}

              {q.question_type === "essay" && !unanswered && (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap rounded-lg bg-paper p-3 text-sm text-ink">{a.text_answer || "—"}</p>
                  {a.feedback && (
                    <p className="rounded-lg bg-leaf-soft p-2 text-sm text-ink">
                      <span className="text-xs font-medium text-leaf">Teacher feedback: </span>
                      {a.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Link href={backHref} className="text-sm text-marigold-text hover:underline">
        ← Back to your result
      </Link>
    </div>
  );
}
