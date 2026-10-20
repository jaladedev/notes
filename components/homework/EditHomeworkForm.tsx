"use client";

// Inline editor for one homework: title, instructions and due date.
// Submissions are untouched. The due-date field starts from the stored
// value; the server only insists on "tomorrow or later" when it changes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateHomework } from "@/lib/actions/homework";
import { emitToast } from "@/lib/toast";
import { earliestDueInputValue } from "@/lib/dueDate";
import { MAX_HOMEWORK_INSTRUCTIONS, MAX_HOMEWORK_TITLE } from "@/lib/homeworkValidation";
import { isoToLocalInput, localInputToIso } from "@/lib/quizWindow";

export function EditHomeworkForm({
  homeworkId,
  topicId,
  timeZone,
  initial,
}: {
  homeworkId: string;
  topicId: string;
  timeZone: string;
  initial: { title: string; instructions: string | null; dueAt: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [instructions, setInstructions] = useState(initial.instructions ?? "");
  // Held as an ISO string (or null) and shown in the school's zone, so
  // saving without touching it round-trips the stored value exactly.
  const [dueAt, setDueAt] = useState<string | null>(initial.dueAt);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-marigold-text hover:underline"
      >
        Edit
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await updateHomework({ homeworkId, topicId, title, instructions: instructions || null, dueAt });
        if (!res.ok) {
          emitToast(res.error, "error");
          return;
        }
        router.refresh();
        setOpen(false);
        emitToast("Homework updated.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save those changes.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-lg border border-rule bg-paper p-3">
      <input
        type="text"
        required
        maxLength={MAX_HOMEWORK_TITLE}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        title="Homework title"
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <textarea
        rows={3}
        maxLength={MAX_HOMEWORK_INSTRUCTIONS}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Instructions (optional)"
        title="Instructions for students"
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          min={earliestDueInputValue()}
          suppressHydrationWarning
          value={isoToLocalInput(dueAt, timeZone)}
          onChange={(e) => setDueAt(localInputToIso(e.target.value, timeZone))}
          title="Due date and time (optional)"
          className="rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        />
        {dueAt && (
          <button type="button" onClick={() => setDueAt(null)} className="text-xs text-ink-soft hover:underline">
            Remove due date
          </button>
        )}
      </div>
      <p className="text-xs text-ink-soft">Times are in the school&apos;s time zone ({timeZone}).</p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-marigold px-3 py-1.5 text-xs font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink-soft hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
