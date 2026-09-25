import Link from "next/link";
import { requireUser } from "@/lib/actions/authGuards";
import { listMyConversations } from "@/lib/actions/messaging";
import { NewMessageForm } from "@/components/messaging/NewMessageForm";

export default async function MessagesPage() {
  await requireUser();
  const conversations = await listMyConversations();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>

      <NewMessageForm />

      <ul className="space-y-2">
        {conversations.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/messages/${c.id}`}
              className="block rounded-lg border border-rule bg-white p-3 hover:border-marigold"
            >
              <p className="text-sm font-medium text-ink">{c.otherName}</p>
              {c.last && <p className="truncate text-xs text-ink-soft">{c.last.body}</p>}
            </Link>
          </li>
        ))}
        {conversations.length === 0 && (
          <p className="text-sm text-ink-soft">No conversations yet.</p>
        )}
      </ul>
    </div>
  );
}
