"use client";

// Client-side runner for a student's quiz attempt: pick an answer per
// question (saved immediately via answerQuizQuestion, so a refresh
// doesn't lose progress), then submit. Scoring happens server-side in
// submit_quiz_attempt() -- this component never computes or trusts a
// score itself.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerQuizQuestion, submitQuizAttempt } from "@/lib/actions/quizAttempt";
import { emitToast } from "@/lib/toast";

type Question = {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
};

export function QuizAttemptRunner({
  attemptId,
  questions,
  initialAnswers,
}: {
  attemptId: string;
  questions: Question[];
  initialAnswers: Record<string, string>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ score: number; total_points: number } | null>(null);

  function selectAnswer(questionId: string, optionId: string) {
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
    startTransition(async () => {
      try {
        await answerQuizQuestion({ attemptId, questionId, optionId });
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save that answer.", "error");
      }
    });
  }

  function handleSubmit() {
    if (Object.keys(answers).length < questions.length) {
      emitToast("Answer every question before submitting.", "error");
      return;
    }
    startTransition(async () => {
      try {
        const score = await submitQuizAttempt(attemptId);
        if (score) setResult(score);
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't submit that attempt.", "error");
      }
    });
  }

  if (result) {
    return (
      <div className="rounded-xl border border-leaf bg-leaf-soft p-6 text-center">
        <p className="font-display text-2xl font-semibold text-ink">
          {result.score} / {result.total_points}
        </p>
        <p className="mt-1 text-sm text-ink-soft">Submitted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-xl border border-rule bg-white p-4">
          <p className="mb-2 text-sm font-medium text-ink">
            {i + 1}. {q.prompt}
          </p>
          <div className="space-y-1.5">
            {q.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === o.id}
                  onChange={() => selectAnswer(q.id, o.id)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={isPending}
        onClick={handleSubmit}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Submitting…" : "Submit quiz"}
      </button>
    </div>
  );
}
