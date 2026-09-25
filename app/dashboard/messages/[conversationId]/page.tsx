import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { getConversationParticipantNames } from "@/lib/actions/messaging";
import { MessageThread } from "@/components/messaging/MessageThread";
import { Breadcrumbs } from "@/components/Breadcrumbs";

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

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const participantNames = await getConversationParticipantNames(conversationId);

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
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">
        {participantNames[Object.keys(participantNames).find((id) => id !== userId) ?? ""] ?? "Conversation"}
      </h1>
      <MessageThread
        conversationId={conversationId}
        currentUserId={userId}
        initialMessages={messages ?? []}
        participantNames={participantNames}
      />
    </div>
  );
}
