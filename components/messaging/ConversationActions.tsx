"use client";

// Archive / restore / delete controls for one conversation. These change
// only the signed-in user's own view (see 0033): the other person keeps
// their copy, and a new message from them brings the conversation back.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setConversationState } from "@/lib/actions/messaging";
import { DELETE_CONFIRMATION } from "@/lib/conversationState";
import { requestNavRefresh } from "@/lib/unread";
import { emitToast } from "@/lib/toast";

export function ConversationActions({ conversationId, archived }: { conversationId: string; archived: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: "archive" | "unarchive" | "delete", done: string) {
    startTransition(async () => {
      try {
        const res = await setConversationState(conversationId, action);
        if (!res.ok) {
          emitToast(res.error, "error");
          return;
        }
        requestNavRefresh();
        emitToast(done, "success");
        // The conversation has left this view (or moved to the inbox): go to the list.
        router.push("/dashboard/messages");
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Something went wrong.", "error");
      }
    });
  }

  const button =
    "rounded-lg border border-rule px-3 py-1.5 text-xs text-ink-soft hover:border-marigold hover:text-ink disabled:opacity-60";

  return (
    <div className="flex items-center gap-2">
      {archived ? (
        <button type="button" disabled={isPending} onClick={() => run("unarchive", "Moved back to your inbox.")} className={button}>
          Move to inbox
        </button>
      ) : (
        <button type="button" disabled={isPending} onClick={() => run("archive", "Conversation archived.")} className={button}>
          Archive
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (window.confirm(DELETE_CONFIRMATION)) run("delete", "Conversation deleted.");
        }}
        className={`${button} hover:border-clay hover:text-clay`}
      >
        Delete
      </button>
    </div>
  );
}
