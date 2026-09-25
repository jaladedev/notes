"use client";

// Minimal multiple-choice quiz builder: add questions, each with 2-4
// options, mark exactly one correct. Kept intentionally simple -- no
// question-type variety yet (school_app's essay-grading flow isn't
// ported here, see plan doc's quiz-decoupling note).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuizWithQuestions } from "@/lib/actions/quizAttempt";
import { emitToast } from "@/lib/toast";

type DraftOption = { label: string; isCorrect: boolean };
type DraftQuestion = { prompt: string; points: number; options: DraftOption[] };

function emptyQuestion(): DraftQuestion {
  return {
    prompt: "",
    points: 1,
    options: [
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
    ],
  };
}

export function CreateQuizForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [isPending, startTransition] = useTransition();

  function updateQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function updateOption(qIdx: number, oIdx: number, patch: Partial<DraftOption>) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx !== qIdx
          ? q
          : {
              ...q,
              options: q.options.map((o, i2) =>
                i2 !== oIdx ? (patch.isCorrect ? { ...o, isCorrect: false } : o) : { ...o, ...patch }
              ),
            }
      )
    );
  }
  function addOption(qIdx: number) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx !== qIdx || q.options.length >= 4 ? q : { ...q, options: [...q.options, { label: "", isCorrect: false }] }
      )
    );
  }
  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion()]);
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    for (const q of questions) {
      if (!q.prompt.trim() || q.options.some((o) => !o.label.trim())) {
        emitToast("Fill in every question and option before saving.", "error");
        return;
      }
    }
    startTransition(async () => {
      try {
        await createQuizWithQuestions({
          topicId,
          title,
          timeLimitSeconds: timeLimit ? Number(timeLimit) * 60 : undefined,
          questions,
        });
        setTitle("");
        setTimeLimit("");
        setQuestions([emptyQuestion()]);
        router.refresh();
        emitToast("Quiz created (unpublished — students can't see it yet).", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't create that quiz.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-rule bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-ink">New quiz</h2>
      <input
        type="text"
        required
        placeholder="Quiz title"
        title="Quiz title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <input
        type="number"
        min={1}
        placeholder="Time limit in minutes (optional)"
        title="Time limit in minutes (optional)"
        value={timeLimit}
        onChange={(e) => setTimeLimit(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />

      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="rounded-lg border border-rule bg-paper p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                Question {qIdx + 1}
              </span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qIdx)}
                  className="text-xs text-clay hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="text"
              required
              placeholder="Question prompt"
              value={q.prompt}
              onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
              className="mb-2 w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
            />
            <div className="space-y-1.5">
              {q.options.map((o, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={o.isCorrect}
                    onChange={() => updateOption(qIdx, oIdx, { isCorrect: true })}
                  />
                  <input
                    type="text"
                    required
                    placeholder={`Option ${oIdx + 1}`}
                    value={o.label}
                    onChange={(e) => updateOption(qIdx, oIdx, { label: e.target.value })}
                    className="flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
                  />
                </div>
              ))}
            </div>
            {q.options.length < 4 && (
              <button
                type="button"
                onClick={() => addOption(qIdx)}
                className="mt-2 text-xs text-marigold-text hover:underline"
              >
                + Add option
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addQuestion} className="text-sm text-marigold-text hover:underline">
        + Add question
      </button>

      <button
        type="submit"
        disabled={isPending}
        className="block rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save quiz"}
      </button>
    </form>
  );
}
