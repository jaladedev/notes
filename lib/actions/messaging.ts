"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";

/** Finds an existing 1:1 conversation between the two users, or creates one. */
export async function getOrCreateDirectConversation(otherProfileId: string) {
  const { id: userId } = await requireUser();
  const admin = createClient();

  const { data: mine } = await admin
    .from("conversation_members")
    .select("conversation_id")
    .eq("profile_id", userId);

  const { data: theirs } = await admin
    .from("conversation_members")
    .select("conversation_id")
    .eq("profile_id", otherProfileId);

  const shared = (mine ?? []).map((m) => m.conversation_id).filter((id) =>
    (theirs ?? []).some((t) => t.conversation_id === id)
  );
  if (shared.length > 0) return { conversationId: shared[0] };

  const { data: conversation, error: convError } = await admin
    .from("conversations")
    .insert({})
    .select("id")
    .single();
  if (convError) throwDbError(convError);

  const { error: memberError } = await admin.from("conversation_members").insert([
    { conversation_id: conversation!.id, profile_id: userId },
    { conversation_id: conversation!.id, profile_id: otherProfileId },
  ]);
  if (memberError) throwDbError(memberError);

  return { conversationId: conversation!.id };
}

export async function sendMessage(conversationId: string, body: string) {
  const { id: userId } = await requireUser();
  const supabase = createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: userId, body });
  if (error) throwDbError(error);
}

/**
 * Contacts the current user is allowed to start a conversation with:
 * anyone sharing a space with them (via space_members, either side), or
 * a parent's linked children's staff. Deliberately narrower than "every
 * profile in the school" -- profiles RLS only lets a user read their
 * own row (plus admin's read-all), so this goes through the admin
 * client but filters to real relationships rather than exposing every
 * account to every user.
 */
export async function searchMessageableContacts(query: string) {
  const { id: userId } = await requireUser();
  // space_members_self only lets a user read their OWN membership row
  // (or every row if they're a space admin), so listing co-members and
  // their names needs the admin client -- gated below by "shares a
  // space with me", not by exposing every profile in the school.
  const admin = createAdminClient();

  const { data: mySpaces } = await admin
    .from("space_members")
    .select("space_id")
    .eq("profile_id", userId);
  const spaceIds = (mySpaces ?? []).map((s) => s.space_id);

  if (spaceIds.length === 0) return [];

  const { data: contacts } = await admin
    .from("space_members")
    .select("profile_id, profiles(id, full_name)")
    .in("space_id", spaceIds)
    .neq("profile_id", userId);

  const seen = new Map<string, { id: string; full_name: string }>();
  for (const c of contacts ?? []) {
    const p = (c as any).profiles;
    if (p && !seen.has(p.id)) seen.set(p.id, p);
  }

  const results = [...seen.values()];
  const trimmed = query.trim().toLowerCase();
  return trimmed
    ? results.filter((r) => r.full_name.toLowerCase().includes(trimmed))
    : results;
}

/** Names of everyone in a conversation the caller is a member of. */
export async function getConversationParticipantNames(
  conversationId: string
): Promise<Record<string, string>> {
  // Confirm membership first through the RLS-scoped client -- this is
  // the actual access check. The admin client below only fills in
  // names, which profiles RLS would otherwise hide for anyone but the
  // caller themselves.
  const supabase = createClient();
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!membership) return {};

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("conversation_members")
    .select("profile_id, profiles(full_name)")
    .eq("conversation_id", conversationId);

  return Object.fromEntries(
    (members ?? []).map((m: any) => [m.profile_id, m.profiles?.full_name ?? "Someone"])
  );
}

/** One row per conversation the caller belongs to, with the other participant's name and last message. */
export async function listMyConversations() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: myConversations } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("profile_id", userId);
  const conversationIds = (myConversations ?? []).map((c) => c.conversation_id);
  if (conversationIds.length === 0) return [];

  const admin = createAdminClient();
  const { data: allMembers } = await admin
    .from("conversation_members")
    .select("conversation_id, profile_id, profiles(full_name)")
    .in("conversation_id", conversationIds);

  const { data: lastMessages } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  const lastByConversation = new Map<string, { body: string; created_at: string }>();
  for (const m of lastMessages ?? []) {
    if (!lastByConversation.has(m.conversation_id)) lastByConversation.set(m.conversation_id, m);
  }

  const otherByConversation = new Map<string, string>();
  for (const m of allMembers ?? []) {
    if (m.profile_id !== userId) {
      otherByConversation.set(m.conversation_id, (m as any).profiles?.full_name ?? "Someone");
    }
  }

  return conversationIds
    .map((id) => ({
      id,
      otherName: otherByConversation.get(id) ?? "Someone",
      last: lastByConversation.get(id) ?? null,
    }))
    .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
}
