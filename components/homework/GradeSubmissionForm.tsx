"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeHomeworkSubmission } from "@/lib/actions/homework";
import { emitToast } from "@/lib/toast";

// Shown only while a submission is ungraded. Once graded, the page renders
// the grade read-only: grades are final.
export function GradeSubmissionForm({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(grade);
    if (grade.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      emitToast("Enter a grade of 0 or more.", "error");
      return;
    }
    if (!window.confirm(`Save a grade of ${parsed}? Grades are final and can't be changed afterwards.`)) return;
    startTransition(async () => {
      const res = await gradeHomeworkSubmission({
        submissionId,
        grade: parsed,
        feedback: feedback || undefined,
      });
      if (!res.ok) {
        emitToast(res.error, "error");
        router.refresh();
        return;
      }
      router.refresh();
      emitToast("Grade saved.", "success");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        step="0.1"
        min="0"
        placeholder="Grade"
        title="Numeric grade for this submission. Final once saved."
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
        {isPending ? "Saving…" : "Save grade"}
      </button>
    </form>
  );
}
