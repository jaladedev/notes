"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitHomework } from "@/lib/actions/homework";
import { emitToast } from "@/lib/toast";

export function SubmitHomeworkForm({
  homeworkId,
  existingContent,
}: {
  homeworkId: string;
  existingContent: string | null;
}) {
  const router = useRouter();
  const [content, setContent] = useState(existingContent ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await submitHomework({ homeworkId, content: content || undefined });
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
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Submitting…" : existingContent ? "Update submission" : "Submit"}
      </button>
    </form>
  );
}
