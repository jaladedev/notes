"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitHomework } from "@/lib/actions/homework";
import { emitToast } from "@/lib/toast";

// Shown only before a submission exists. Once handed in, the page renders
// the submission read-only: submissions are final.
export function SubmitHomeworkForm({ homeworkId }: { homeworkId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    if (!window.confirm("Submit this homework? You won't be able to change it afterwards.")) return;
    startTransition(async () => {
      try {
        const result = await submitHomework({ homeworkId, content: text });
        if (!result.ok) {
          emitToast(result.error, "error");
          // Already submitted elsewhere: refresh so the read-only view shows.
          router.refresh();
          return;
        }
        router.refresh();
        emitToast("Submitted.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't submit that.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your answer here…"
        rows={4}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <p className="text-xs text-ink-soft">Submissions are final. Check your answer before you submit.</p>
      <button
        type="submit"
        disabled={isPending || !content.trim()}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
