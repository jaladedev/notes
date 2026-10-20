"use client";

// Message thread: polls for new rows in this conversation every few
// seconds (see usePolling -- it pauses while the tab is hidden) and sends
// via the sendMessage server action. Sent messages are merged in right
// away rather than waiting for the next tick.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchMessagesSince, markConversationRead, sendMessage } from "@/lib/actions/messaging";
import { usePolling } from "@/lib/hooks/usePolling";
import {
  hasIncomingFromOthers,
  mergeMessages,
  newlyArrived,
  pollCursor,
  type PolledMessage,
} from "@/lib/messagePolling";
import { requestNavRefresh } from "@/lib/unread";
import { emitToast } from "@/lib/toast";

type Message = PolledMessage;

const MESSAGE_POLL_MS = 4000;

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  participantNames,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  participantNames: Record<string, string>;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Poll for new messages (replaces the old Realtime subscription). The
  // cursor lives in a ref so each tick reads the latest value without
  // re-creating the interval.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const poll = useCallback(async () => {
    const res = await fetchMessagesSince(conversationId, pollCursor(messagesRef.current));
    if (!res.ok) throw new Error(res.error);
    const fresh = newlyArrived(messagesRef.current, res.data);
    if (fresh.length === 0) return;
    // I'm looking at this conversation, so a message from the other
    // person is read on arrival: mark it, then refresh the nav badge.
    if (hasIncomingFromOthers(fresh, currentUserId)) {
      markConversationRead(conversationId)
        .then((r) => {
          if (r.ok) requestNavRefresh();
        })
        .catch(() => {});
    }
    setMessages((current) => mergeMessages(current, res.data));
  }, [conversationId, currentUserId]);

  usePolling(poll, MESSAGE_POLL_MS);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    startTransition(async () => {
      try {
        const result = await sendMessage(conversationId, text);
        if (!result.ok) {
          emitToast(result.error, "error");
          setBody((current) => current || text); // put the message back so it isn't lost
          return;
        }
        await poll().catch(() => {}); // show my own message without waiting for the next tick
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't send that message.", "error");
        setBody((current) => current || text);
      }
    });
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-rule bg-white">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-marigold text-ink" : "bg-paper text-ink"
                }`}
              >
                {!mine && (
                  <p className="mb-0.5 text-xs font-medium text-ink-soft">
                    {participantNames[m.sender_id] ?? "Someone"}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-center text-sm text-ink-soft">Say hello.</p>
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-rule p-3">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          title="Type a message to send"
          className="flex-1 rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          title="Send this message"
          className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
