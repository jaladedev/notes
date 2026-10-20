"use client";

// Quiz builder for all four question types (multiple choice, fill in the
// blank, matching, essay). Used for both creating a quiz and -- until a
// student has started it -- editing its questions. Validation is shared
// with the server (lib/quizValidation.ts) so the same rules apply either way.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuizWithQuestions, replaceQuizQuestions } from "@/lib/actions/quizAttempt";
import {
  MAX_OPTIONS,
  QUESTION_TYPE_LABELS,
  emptyQuestion,
  validateQuiz,
  type QuizOptionInput,
  type QuizQuestionInput,
  type QuizQuestionType,
} from "@/lib/quizValidation";
import { QuizWindowFields } from "@/components/quizzes/QuizWindowFields";
import { emitToast } from "@/lib/toast";

export type QuizBuilderInitial = {
  quizId: string;
  title: string;
  timeLimitSeconds: number | null;
  opensAt: string | null;
  closesAt: string | null;
  shuffleQuestions: boolean;
  questions: QuizQuestionInput[];
};

export function QuizBuilderForm({
  topicId,
  timeZone,
  initial,
  onDone,
}: {
  topicId: string;
  timeZone: string;
  /** Present when editing an existing quiz. */
  initial?: QuizBuilderInitial;
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimitSeconds ? String(initial.timeLimitSeconds / 60) : "");
  const [opensAt, setOpensAt] = useState<string | null>(initial?.opensAt ?? null);
  const [closesAt, setClosesAt] = useState<string | null>(initial?.closesAt ?? null);
  const [shuffle, setShuffle] = useState(initial?.shuffleQuestions ?? false);
  const [questions, setQuestions] = useState<QuizQuestionInput[]>(initial?.questions ?? [emptyQuestion()]);
  const [isPending, startTransition] = useTransition();

  function updateQuestion(i: number, patch: Partial<QuizQuestionInput>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function changeType(i: number, type: QuizQuestionType) {
    // Keep what the teacher already typed (prompt, points) but start the
    // answer data fresh -- options mean different things per type.
    setQuestions((qs) =>
      qs.map((q, idx) => (idx === i ? { ...emptyQuestion(type), prompt: q.prompt, points: type === "essay" ? Math.max(q.points, 1) : q.points } : q))
    );
  }
  function updateOption(qIdx: number, oIdx: number, patch: Partial<QuizOptionInput>) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qIdx) return q;
        return {
          ...q,
          options: q.options.map((o, i2) => {
            if (i2 === oIdx) return { ...o, ...patch };
            // single choice: marking one correct unmarks the others
            return q.type === "single_choice" && patch.isCorrect ? { ...o, isCorrect: false } : o;
          }),
        };
      })
    );
  }
  function addOption(qIdx: number) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qIdx || q.options.length >= MAX_OPTIONS) return q;
        const blank: QuizOptionInput =
          q.type === "matching" ? { label: "", matchText: "" } : q.type === "single_choice" ? { label: "", isCorrect: false } : { label: "" };
        return { ...q, options: [...q.options, blank] };
      })
    );
  }
  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((qs) => qs.map((q, idx) => (idx !== qIdx ? q : { ...q, options: q.options.filter((_, i2) => i2 !== oIdx) })));
  }
  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion()]);
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }
  function moveQuestion(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const timeLimitSeconds = timeLimit ? Math.round(Number(timeLimit) * 60) : null;
    const definition = { title, timeLimitSeconds, opensAt, closesAt, shuffleQuestions: shuffle, questions };
    const problem = validateQuiz(definition);
    if (problem) {
      emitToast(problem, "error");
      return;
    }
    startTransition(async () => {
      try {
        const result = initial
          ? await replaceQuizQuestions({ ...definition, quizId: initial.quizId, topicId })
          : await createQuizWithQuestions({ ...definition, topicId });
        if (!result.ok) {
          emitToast(result.error, "error");
          return;
        }
        if (!editing) {
          setTitle("");
          setTimeLimit("");
          setOpensAt(null);
          setClosesAt(null);
          setShuffle(false);
          setQuestions([emptyQuestion()]);
        }
        router.refresh();
        onDone?.();
        emitToast(editing ? "Quiz updated." : "Quiz created (unpublished — students can't see it yet).", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save that quiz.", "error");
      }
    });
  }

  const input = "w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-rule bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-ink">{editing ? "Edit quiz" : "New quiz"}</h2>
      <input
        type="text"
        required
        placeholder="Quiz title"
        title="Quiz title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={input}
      />
      <input
        type="number"
        min={1}
        placeholder="Time limit in minutes (optional)"
        title="Time limit in minutes (optional)"
        value={timeLimit}
        onChange={(e) => setTimeLimit(e.target.value)}
        className={input}
      />
      <QuizWindowFields
        opensAt={opensAt}
        closesAt={closesAt}
        timeZone={timeZone}
        onChange={(next) => {
          setOpensAt(next.opensAt);
          setClosesAt(next.closesAt);
        }}
      />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
        Shuffle question order for each student
      </label>

      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <div key={qIdx} className="rounded-lg border border-rule bg-paper p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">Question {qIdx + 1}</span>
              <div className="flex items-center gap-2">
                <select
                  value={q.type}
                  onChange={(e) => changeType(qIdx, e.target.value as QuizQuestionType)}
                  title="Question type"
                  className="rounded-lg border border-rule bg-white px-2 py-1 text-xs text-ink"
                >
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuizQuestionType[]).map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={q.points}
                  onChange={(e) => updateQuestion(qIdx, { points: Number(e.target.value) })}
                  title="Points"
                  aria-label={`Points for question ${qIdx + 1}`}
                  className="w-16 rounded-lg border border-rule px-2 py-1 text-xs text-ink"
                />
                <span className="text-xs text-ink-soft">pts</span>
                <button type="button" onClick={() => moveQuestion(qIdx, -1)} disabled={qIdx === 0} className="text-xs text-ink-soft hover:text-ink disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" onClick={() => moveQuestion(qIdx, 1)} disabled={qIdx === questions.length - 1} className="text-xs text-ink-soft hover:text-ink disabled:opacity-30" aria-label="Move down">↓</button>
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qIdx)} className="text-xs text-clay hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </div>

            <input
              type="text"
              placeholder={q.type === "fill_blank" ? "Question prompt (use ___ for the blank)" : "Question prompt"}
              value={q.prompt}
              onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
              className={`mb-2 ${input}`}
            />

            {q.type === "single_choice" && (
              <div className="space-y-1.5">
                {q.options.map((o, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      checked={Boolean(o.isCorrect)}
                      onChange={() => updateOption(qIdx, oIdx, { isCorrect: true })}
                      title="Mark as the correct answer"
                    />
                    <input
                      type="text"
                      placeholder={`Option ${oIdx + 1}`}
                      value={o.label}
                      onChange={(e) => updateOption(qIdx, oIdx, { label: e.target.value })}
                      className="flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
                    />
                    {q.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-xs text-clay hover:underline" aria-label="Remove option">×</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {q.type === "fill_blank" && (
              <div className="space-y-1.5">
                <p className="text-xs text-ink-soft">
                  Accepted answers — any one is correct. Capitals and extra spaces are ignored.
                </p>
                {q.options.map((o, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Accepted answer ${oIdx + 1}`}
                      value={o.label}
                      onChange={(e) => updateOption(qIdx, oIdx, { label: e.target.value })}
                      className="flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
                    />
                    {q.options.length > 1 && (
                      <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-xs text-clay hover:underline" aria-label="Remove answer">×</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {q.type === "matching" && (
              <div className="space-y-1.5">
                <p className="text-xs text-ink-soft">
                  Enter each pair. Students see the right-hand terms shuffled, and every pair must be right to earn the points.
                </p>
                {q.options.map((o, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Left term"
                      value={o.label}
                      onChange={(e) => updateOption(qIdx, oIdx, { label: e.target.value })}
                      className="flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
                    />
                    <span className="text-ink-soft">↔</span>
                    <input
                      type="text"
                      placeholder="Matching term"
                      value={o.matchText ?? ""}
                      onChange={(e) => updateOption(qIdx, oIdx, { matchText: e.target.value })}
                      className="flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
                    />
                    {q.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(qIdx, oIdx)} className="text-xs text-clay hover:underline" aria-label="Remove pair">×</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {q.type === "essay" && (
              <p className="text-xs text-ink-soft">
                Students write a free-text answer. You grade it by hand after they submit; their score is provisional until then.
              </p>
            )}

            {q.type !== "essay" && q.options.length < MAX_OPTIONS && (
              <button type="button" onClick={() => addOption(qIdx)} className="mt-2 text-xs text-marigold-text hover:underline">
                {q.type === "matching" ? "+ Add pair" : q.type === "fill_blank" ? "+ Add accepted answer" : "+ Add option"}
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addQuestion} className="text-sm text-marigold-text hover:underline">
        + Add question
      </button>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="block rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isPending ? "Saving…" : editing ? "Save changes" : "Save quiz"}
        </button>
        {editing && onDone && (
          <button type="button" onClick={onDone} className="text-sm text-ink-soft hover:underline">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
