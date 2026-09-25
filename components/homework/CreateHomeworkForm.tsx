"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createHomework } from "@/lib/actions/homework";
import { emitToast } from "@/lib/toast";

export function CreateHomeworkForm({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createHomework({
          topicId,
          title,
          instructions: instructions || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        });
        setTitle("");
        setInstructions("");
        setDueAt("");
        router.refresh();
        emitToast("Homework posted.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't post that homework.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-rule bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-ink">Set homework</h2>
      <input
        type="text"
        required
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <textarea
        placeholder="Instructions (optional)"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft">Due (optional)</label>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Posting…" : "Post homework"}
      </button>
    </form>
  );
}
