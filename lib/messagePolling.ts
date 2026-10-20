// Pure helpers behind message polling. Kept free of React/Supabase imports
// so they can be unit-tested directly (tests/messages-polling.test.ts).

export type PolledMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

/**
 * Merges freshly polled rows into the list already on screen: de-duplicates
 * by id (the poll query uses `created_at >= cursor`, so it deliberately
 * re-returns the newest row) and keeps chronological order, with id as a
 * stable tie-break for rows that share a timestamp. Returns `current`
 * itself when nothing is new, so React state doesn't churn on empty polls.
 */
export function mergeMessages(current: PolledMessage[], incoming: PolledMessage[]): PolledMessage[] {
  if (incoming.length === 0) return current;
  const known = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (fresh.length === 0) return current;
  return [...current, ...fresh].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

/** Timestamp to poll from: the newest message on screen, or null for none. */
export function pollCursor(messages: PolledMessage[]): string | null {
  let latest: string | null = null;
  for (const m of messages) if (latest === null || m.created_at > latest) latest = m.created_at;
  return latest;
}

/** True if any of the given (newly arrived) messages came from someone else. */
export function hasIncomingFromOthers(fresh: PolledMessage[], currentUserId: string): boolean {
  return fresh.some((m) => m.sender_id !== currentUserId);
}

/** Rows in `next` that are not in `current` -- what a poll actually added. */
export function newlyArrived(current: PolledMessage[], next: PolledMessage[]): PolledMessage[] {
  const known = new Set(current.map((m) => m.id));
  return next.filter((m) => !known.has(m.id));
}

/** Delay before the next poll: base interval, doubling per consecutive failure, capped at 4x. */
export function nextPollDelay(baseMs: number, consecutiveFailures: number): number {
  const factor = Math.min(2 ** Math.max(0, consecutiveFailures), 4);
  return baseMs * factor;
}
