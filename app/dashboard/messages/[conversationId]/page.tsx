import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { getConversationParticipantNames, markConversationRead } from "@/lib/actions/messaging";
import { MessageThread } from "@/components/messaging/MessageThread";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ConversationActions } from "@/components/messaging/ConversationActions";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { id: userId } = await requireUser();
  const supabase = createClient();

  // RLS (conversations member policy) returns nothing if the current
  // user isn't a member -- this doubles as the access check.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) notFound();

  // My own membership row: tells us whether I archived this and, if I
  // deleted it earlier, the moment before which I no longer see messages.
  const { data: member } = await supabase
    .from("conversation_members")
    .select("archived_at, deleted_at")
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
    .maybeSingle();

  let messagesQuery = supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (member?.deleted_at) messagesQuery = messagesQuery.gt("created_at", member.deleted_at);
  const { data: messages } = await messagesQuery;

  const participantNames = await getConversationParticipantNames(conversationId);
  await markConversationRead(conversationId);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Messages", href: "/dashboard/messages" },
          {
            label:
              participantNames[Object.keys(participantNames).find((id) => id !== userId) ?? ""] ?? "Conversation",
          },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-semibold text-ink">
          {participantNames[Object.keys(participantNames).find((id) => id !== userId) ?? ""] ?? "Conversation"}
        </h1>
        <ConversationActions conversationId={conversationId} archived={Boolean(member?.archived_at)} />
      </div>
      <MessageThread
        conversationId={conversationId}
        currentUserId={userId}
        initialMessages={messages ?? []}
        participantNames={participantNames}
      />
    </div>
  );
}
