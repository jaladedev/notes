"use client";

// Client-side runner for a student's quiz attempt. Each answer is saved as
// soon as it's given (selects/radios immediately, text fields on blur), so
// a refresh doesn't lose progress. Scoring happens server-side in
// submit_quiz_attempt() -- this component never computes or trusts a score
// itself, and never sees which options are correct.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerQuizQuestion, submitQuizAttempt } from "@/lib/actions/quizAttempt";
import type { QuizQuestionType } from "@/lib/quizValidation";
import { emitToast } from "@/lib/toast";

export type RunnerQuestion = {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  /** single_choice: the choices. matching: the left-hand terms. Unused otherwise. */
  options: { id: string; label: string }[];
  /** matching only: the right-hand terms, already shuffled by the server. */
  choices?: string[];
};

export type RunnerAnswer = {
  optionId?: string | null;
  textAnswer?: string | null;
  matchingAnswer?: Record<string, string> | null;
};

function isAnswered(q: RunnerQuestion, a: RunnerAnswer | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "single_choice":
      return Boolean(a.optionId);
    case "fill_blank":
    case "essay":
      return Boolean(a.textAnswer?.trim());
    case "matching":
      return q.options.every((o) => Boolean(a.matchingAnswer?.[o.id]));
  }
}

export function QuizAttemptRunner({
  attemptId,
  questions,
  initialAnswers,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, RunnerAnswer>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, RunnerAnswer>>(initialAnswers);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ score: number; total_points: number; needs_grading: boolean } | null>(null);

  function save(questionId: string, answer: RunnerAnswer) {
    startTransition(async () => {
      try {
        const saved = await answerQuizQuestion({ attemptId, questionId, ...answer });
        if (!saved.ok) emitToast(saved.error, "error");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save that answer.", "error");
      }
    });
  }

  function setLocal(questionId: string, answer: RunnerAnswer) {
    setAnswers((a) => ({ ...a, [questionId]: answer }));
  }

  function handleSubmit() {
    const missing = questions.findIndex((q) => !isAnswered(q, answers[q.id]));
    if (missing !== -1) {
      emitToast(`Answer question ${missing + 1} before submitting.`, "error");
      return;
    }
    startTransition(async () => {
      try {
        const submitted = await submitQuizAttempt(attemptId);
        if (!submitted.ok) {
          emitToast(submitted.error, "error");
          return;
        }
        if (submitted.data) setResult(submitted.data);
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
        <p className="mt-1 text-sm text-ink-soft">
          {result.needs_grading
            ? "Submitted. This score is provisional — your teacher still has to grade your written answers."
            : "Submitted."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const a = answers[q.id] ?? {};
        return (
          <div key={q.id} className="rounded-xl border border-rule bg-white p-4">
            <p className="mb-2 text-sm font-medium text-ink">
              {i + 1}. {q.prompt}
              <span className="ml-2 text-xs font-normal text-ink-soft">
                ({q.points} {q.points === 1 ? "point" : "points"})
              </span>
            </p>

            {q.type === "single_choice" && (
              <div className="space-y-1.5">
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name={q.id}
                      checked={a.optionId === o.id}
                      onChange={() => {
                        setLocal(q.id, { optionId: o.id });
                        save(q.id, { optionId: o.id });
                      }}
                      title={`Select "${o.label}" as your answer`}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            )}

            {q.type === "fill_blank" && (
              <input
                type="text"
                value={a.textAnswer ?? ""}
                onChange={(e) => setLocal(q.id, { textAnswer: e.target.value })}
                onBlur={(e) => save(q.id, { textAnswer: e.target.value })}
                placeholder="Type your answer"
                aria-label={`Answer to question ${i + 1}`}
                className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
              />
            )}

            {q.type === "matching" && (
              <div className="space-y-2">
                {q.options.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-[8rem] flex-1 text-sm text-ink">{o.label}</span>
                    <select
                      value={a.matchingAnswer?.[o.id] ?? ""}
                      onChange={(e) => {
                        const next = { ...(a.matchingAnswer ?? {}), [o.id]: e.target.value };
                        setLocal(q.id, { matchingAnswer: next });
                        save(q.id, { matchingAnswer: next });
                      }}
                      aria-label={`Match for ${o.label}`}
                      className="flex-1 rounded-lg border border-rule bg-white px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="">Choose…</option>
                      {(q.choices ?? []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {q.type === "essay" && (
              <textarea
                value={a.textAnswer ?? ""}
                onChange={(e) => setLocal(q.id, { textAnswer: e.target.value })}
                onBlur={(e) => save(q.id, { textAnswer: e.target.value })}
                rows={6}
                placeholder="Write your answer"
                aria-label={`Answer to question ${i + 1}`}
                className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
              />
            )}
          </div>
        );
      })}
      <button
        type="button"
        disabled={isPending}
        onClick={handleSubmit}
        title="Submit your quiz answers"
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Working…" : "Submit quiz"}
      </button>
    </div>
  );
}
