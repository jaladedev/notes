"use client";

// Realtime message thread: subscribes to new rows in `messages` for
// this conversation (server-side inserts and other tabs both arrive
// this way), and sends via the sendMessage server action.

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage } from "@/lib/actions/messaging";
import { emitToast } from "@/lib/toast";

type Message = { id: string; sender_id: string; body: string; created_at: string };

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

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages((current) =>
            current.some((m) => m.id === payload.new.id) ? current : [...current, payload.new as Message]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

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
        await sendMessage(conversationId, text);
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't send that message.", "error");
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
          className="flex-1 rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={isPending || !body.trim()}
          className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
