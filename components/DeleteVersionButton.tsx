"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTopicNoteVersion } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

export function DeleteVersionButton({
  topicId,
  versionNoteId,
  versionNumber,
  disabled,
}: {
  topicId: string;
  versionNoteId: string;
  versionNumber: number;
  // Passed in as `versionCount <= 1` from the page rather than derived
  // here -- the button has no way to know how many sibling versions
  // exist on its own, and the server action enforces the same "can't
  // delete the only version" rule anyway, so this is purely to avoid
  // showing an action that would just bounce back as an error.
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  if (disabled) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-clay hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-ink-soft">Delete version {versionNumber} permanently?</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            try {
              await deleteTopicNoteVersion(topicId, versionNoteId);
              emitToast(`Version ${versionNumber} deleted.`);
              setConfirming(false);
              router.refresh();
            } catch (err: any) {
              emitToast(err?.message ?? "Couldn't delete that version.", "error");
              setConfirming(false);
            }
          })
        }
        className="font-medium text-clay hover:underline disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(false)}
        className="text-ink-soft hover:underline disabled:opacity-50"
      >
        Cancel
      </button>
    </span>
  );
}
