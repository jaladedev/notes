"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeHomeworkSubmission } from "@/lib/actions/homework";
import { emitToast } from "@/lib/toast";

export function GradeSubmissionForm({
  submissionId,
  existingGrade,
  existingFeedback,
}: {
  submissionId: string;
  existingGrade: number | null;
  existingFeedback: string | null;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState(existingGrade?.toString() ?? "");
  const [feedback, setFeedback] = useState(existingFeedback ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(grade);
    if (Number.isNaN(parsed)) {
      emitToast("Enter a numeric grade.", "error");
      return;
    }
    startTransition(async () => {
      try {
        await gradeHomeworkSubmission({ submissionId, grade: parsed, feedback: feedback || undefined });
        router.refresh();
        emitToast("Grade saved.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save that grade.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        step="0.1"
        placeholder="Grade"
        title="Numeric grade for this submission"
        value={grade}
        onChange={(e) => setGrade(e.target.value)}
        className="w-20 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
      />
      <input
        type="text"
        placeholder="Feedback (optional)"
        title="Feedback for the student"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-rule px-2 py-1 text-sm text-ink"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-leaf px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
