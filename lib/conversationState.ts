// Per-member conversation state (0033). Pure helpers, shared by the inbox
// listing, the unread count and the thread page so they all agree on what
// "archived" and "deleted" mean.

export type MemberState = { archived_at: string | null; deleted_at: string | null };
export type InboxView = "inbox" | "archived";
export type Bucket = "inbox" | "archived" | "hidden";

/**
 * Where a conversation shows up for one member.
 *  - deleted, and nothing newer than the deletion  -> hidden
 *  - deleted, but a message arrived since          -> back in play (it
 *    returns showing only the newer messages)
 *  - archived                                      -> "archived"
 *  - otherwise                                     -> "inbox"
 */
export function conversationBucket(member: MemberState, lastMessageAt: string | null): Bucket {
  if (member.deleted_at) {
    const hasNewer = lastMessageAt !== null && lastMessageAt > member.deleted_at;
    if (!hasNewer) return "hidden";
  }
  return member.archived_at ? "archived" : "inbox";
}

/** True when a message is visible to a member who may have deleted the conversation earlier. */
export function isMessageVisible(createdAt: string, deletedAt: string | null): boolean {
  return deletedAt === null || createdAt > deletedAt;
}

/** The newest message the member can still see, from newest-first or any-order input. */
export function latestVisible<T extends { created_at: string }>(messages: T[], deletedAt: string | null): T | null {
  let best: T | null = null;
  for (const m of messages) {
    if (!isMessageVisible(m.created_at, deletedAt)) continue;
    if (best === null || m.created_at > best.created_at) best = m;
  }
  return best;
}

export const DELETE_CONFIRMATION =
  "Delete this conversation from your inbox? The other person keeps their copy. " +
  "If they write again it will reappear, showing only the new messages.";
