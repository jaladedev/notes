import Link from "next/link";
import { requireUser } from "@/lib/actions/authGuards";
import { listMyConversations } from "@/lib/actions/messaging";
import { NewMessageForm } from "@/components/messaging/NewMessageForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { InboxView } from "@/lib/conversationState";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireUser();
  const { view: rawView } = await searchParams;
  const view: InboxView = rawView === "archived" ? "archived" : "inbox";
  const conversations = await listMyConversations(view);

  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? "bg-marigold-soft font-medium text-ink" : "text-ink-soft hover:text-ink"}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Messages" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>

      <NewMessageForm />

      <nav aria-label="Message views" className="flex gap-1">
        <Link href="/dashboard/messages" className={tab(view === "inbox")} aria-current={view === "inbox" ? "page" : undefined}>
          Inbox
        </Link>
        <Link
          href="/dashboard/messages?view=archived"
          className={tab(view === "archived")}
          aria-current={view === "archived" ? "page" : undefined}
        >
          Archived
        </Link>
      </nav>

      <ul className="space-y-2">
        {conversations.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/messages/${c.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-rule bg-white p-3 hover:border-marigold"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{c.otherName}</p>
                {c.last && <p className="truncate text-xs text-ink-soft">{c.last.body}</p>}
              </div>
              {c.unread && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-marigold" title="Unread messages" />
              )}
            </Link>
          </li>
        ))}
        {conversations.length === 0 && (
          <p className="text-sm text-ink-soft">
            {view === "archived" ? "No archived conversations." : "No conversations yet."}
          </p>
        )}
      </ul>
    </div>
  );
}
