"use client";

// Post-creation settings for a quiz: the open/close window and question
// shuffling. Unlike editing the
// questions themselves, these are safe to change even after students have
// started, so this is always available.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateQuizSettings } from "@/lib/actions/quizAttempt";
import { QuizWindowFields } from "@/components/quizzes/QuizWindowFields";
import { emitToast } from "@/lib/toast";

export function QuizScheduleEditor({
  quizId,
  topicId,
  timeZone,
  initial,
}: {
  quizId: string;
  topicId: string;
  timeZone: string;
  initial: { opensAt: string | null; closesAt: string | null; shuffleQuestions: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opensAt, setOpensAt] = useState(initial.opensAt);
  const [closesAt, setClosesAt] = useState(initial.closesAt);
  const [shuffle, setShuffle] = useState(initial.shuffleQuestions);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) {
      emitToast("The quiz must close after it opens.", "error");
      return;
    }
    startTransition(async () => {
      try {
        const res = await updateQuizSettings({
          quizId,
          topicId,
          opensAt,
          closesAt,
          shuffleQuestions: shuffle,
        });
        if (!res.ok) {
          emitToast(res.error, "error");
          return;
        }
        router.refresh();
        setOpen(false);
        emitToast("Quiz settings saved.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save those settings.", "error");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-soft hover:border-marigold hover:text-ink"
      >
        Schedule &amp; settings
      </button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-3 rounded-lg border border-rule bg-paper p-3">
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
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="rounded-lg bg-marigold px-3 py-1.5 text-xs font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-soft hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
