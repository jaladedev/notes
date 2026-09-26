"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { getUnreadMessageCount } from "@/lib/actions/messaging";

/** Number of announcements visible to the caller that they haven't opened the board for since. */
export async function getUnreadAnnouncementCount(): Promise<number> {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: announcements } = await supabase.from("announcements").select("id");
  if (!announcements || announcements.length === 0) return 0;

  const { data: reads } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("profile_id", userId)
    .in(
      "announcement_id",
      announcements.map((a) => a.id)
    );
  const readIds = new Set((reads ?? []).map((r) => r.announcement_id));

  return announcements.filter((a) => !readIds.has(a.id)).length;
}

/** Marks every announcement currently visible to the caller as read. */
export async function markAllAnnouncementsRead() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: announcements } = await supabase.from("announcements").select("id");
  if (!announcements || announcements.length === 0) return;

  await supabase
    .from("announcement_reads")
    .upsert(
      announcements.map((a) => ({ announcement_id: a.id, profile_id: userId })),
      { onConflict: "announcement_id,profile_id", ignoreDuplicates: true }
    );
}

/** Combined counts for the dashboard nav badges. */
export async function getNavBadgeCounts(): Promise<{ messages: number; announcements: number }> {
  const [messages, announcements] = await Promise.all([
    getUnreadMessageCount(),
    getUnreadAnnouncementCount(),
  ]);
  return { messages, announcements };
}
