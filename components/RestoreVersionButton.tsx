"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreTopicNoteVersion } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

export function RestoreVersionButton({
  topicId,
  versionNoteId,
  versionNumber,
  isLatest,
}: {
  topicId: string;
  versionNoteId: string;
  versionNumber: number;
  isLatest: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  // Restoring the version that's already newest would just create an
  // identical duplicate version -- not harmful, but pointless, so it's
  // hidden rather than left to silently no-op.
  if (isLatest) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-medium text-leaf hover:underline"
      >
        Restore
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-ink-soft">Restore as a new draft?</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            try {
              await restoreTopicNoteVersion(topicId, versionNoteId);
              emitToast(`Version ${versionNumber} restored as a new draft.`);
              setConfirming(false);
              // The note editor above holds its own client-side state
              // seeded from the server-rendered `content` prop -- a plain
              // revalidatePath (already called inside the action) doesn't
              // touch that already-mounted state, so without this the
              // teacher would see the restored version listed in history
              // but the editor itself would keep showing whatever they
              // had open a second ago. Same reasoning as `handleSave`'s
              // existing router.refresh() for a brand-new note.
              router.refresh();
            } catch (err: any) {
              emitToast(err?.message ?? "Couldn't restore that version.", "error");
              setConfirming(false);
            }
          })
        }
        className="font-medium text-leaf hover:underline disabled:opacity-50"
      >
        {isPending ? "Restoring…" : "Yes, restore"}
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
