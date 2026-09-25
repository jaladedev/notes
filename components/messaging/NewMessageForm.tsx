"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateDirectConversation, searchMessageableContacts } from "@/lib/actions/messaging";
import { emitToast } from "@/lib/toast";

export function NewMessageForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; full_name: string }[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleSearch(value: string) {
    setQuery(value);
    startTransition(async () => {
      const contacts = await searchMessageableContacts(value);
      setResults(contacts);
    });
  }

  function startConversation(otherId: string) {
    startTransition(async () => {
      try {
        const { conversationId } = await getOrCreateDirectConversation(otherId);
        router.push(`/dashboard/messages/${conversationId}`);
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't start that conversation.", "error");
      }
    });
  }

  return (
    <div className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-2 font-display text-sm font-semibold text-ink">New message</h2>
      <input
        type="text"
        placeholder="Search by name…"
        value={query}
        onFocus={() => handleSearch(query)}
        onChange={(e) => handleSearch(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      {results.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startConversation(r.id)}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-60"
              >
                {r.full_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
