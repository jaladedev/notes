"use client";

// Toggles the builder into edit mode for one quiz. Only rendered by the
// teacher page while the quiz has no attempts -- replace_quiz_questions()
// refuses otherwise, and this keeps the button from promising what the
// database will reject.

import { useState } from "react";
import { QuizBuilderForm, type QuizBuilderInitial } from "@/components/quizzes/QuizBuilderForm";

export function EditQuizPanel({
  topicId,
  timeZone,
  initial,
}: {
  topicId: string;
  timeZone: string;
  initial: QuizBuilderInitial;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-soft hover:border-marigold hover:text-ink"
      >
        Edit questions
      </button>
    );
  }
  return (
    <div className="mt-3 w-full">
      <QuizBuilderForm topicId={topicId} timeZone={timeZone} initial={initial} onDone={() => setOpen(false)} />
    </div>
  );
}
