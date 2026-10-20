"use client";

// One essay answer: shows what the student wrote and lets a teacher award
// points (0..max) and leave feedback. The bound is checked here for a
// friendly message and again in grade_essay_answer() (0027), which is the
// one that counts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeEssayAnswer } from "@/lib/actions/quizAttempt";
import { emitToast } from "@/lib/toast";

export function EssayGradingForm({
  attemptId,
  questionId,
  quizId,
  topicId,
  prompt,
  answer,
  maxPoints,
  initialPoints,
  initialFeedback,
}: {
  attemptId: string;
  questionId: string;
  quizId: string;
  topicId: string;
  prompt: string;
  answer: string;
  maxPoints: number;
  initialPoints: number | null;
  initialFeedback: string | null;
}) {
  const router = useRouter();
  const [points, setPoints] = useState(initialPoints === null ? "" : String(initialPoints));
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [isPending, startTransition] = useTransition();
  const graded = initialPoints !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(points);
    if (points.trim() === "" || !Number.isFinite(value) || value < 0 || value > maxPoints) {
      emitToast(`Enter a score between 0 and ${maxPoints}.`, "error");
      return;
    }
    startTransition(async () => {
      try {
        const res = await gradeEssayAnswer({ attemptId, questionId, quizId, topicId, points: value, feedback });
        if (!res.ok) {
          emitToast(res.error, "error");
          return;
        }
        router.refresh();
        emitToast("Grade saved.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save that grade.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-rule bg-white p-3">
      <p className="text-sm font-medium text-ink">{prompt}</p>
      <p className="whitespace-pre-wrap rounded-lg bg-paper p-3 text-sm text-ink">{answer}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-ink-soft">
          Score
          <input
            type="number"
            min={0}
            max={maxPoints}
            step={0.5}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="w-20 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
          />
          / {maxPoints}
        </label>
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Feedback for the student (optional)"
          className="min-w-[12rem] flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-marigold px-3 py-1.5 text-xs font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isPending ? "Saving…" : graded ? "Update grade" : "Save grade"}
        </button>
      </div>
    </form>
  );
}
