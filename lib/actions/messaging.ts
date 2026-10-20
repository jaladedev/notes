"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { toResult, type ActionResult } from "@/lib/actions/result";
import { conversationBucket, latestVisible, type InboxView } from "@/lib/conversationState";

/** Finds an existing 1:1 conversation between the two users, or creates one. */
export async function getOrCreateDirectConversation(
  ...args: Parameters<typeof getOrCreateDirectConversationImpl>
): Promise<ActionResult<{ conversationId: string }>> {
  return toResult(() => getOrCreateDirectConversationImpl(...args));
}

async function getOrCreateDirectConversationImpl(otherProfileId: string) {
  const { id: userId } = await requireUser();
  // Reads can go through the request-scoped client (RLS allows a member
  // to see their own conversation_members rows), but there is no INSERT
  // policy on conversations/conversation_members -- creating a new DM
  // must go through the admin client, or every first-contact message
  // fails with an RLS permission error.
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: mine } = await supabase
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

export async function sendMessage(
  ...args: Parameters<typeof sendMessageImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof sendMessageImpl>>>> {
  return toResult(() => sendMessageImpl(...args));
}

async function sendMessageImpl(conversationId: string, body: string) {
  const { id: userId } = await requireUser();
  const supabase = createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: userId, body });
  if (error) throwDbError(error);
  // Sending counts as having read the conversation up to now.
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId);
}

/**
 * Messages in a conversation at or after `afterIso` (the poll cursor), oldest
 * first. `>=` rather than `>` so rows sharing the cursor's timestamp are not
 * skipped; the client de-duplicates by id (see mergeMessages). Membership is
 * enforced by RLS on `messages`, so a non-member simply gets an empty list.
 */
export async function fetchMessagesSince(
  ...args: Parameters<typeof fetchMessagesSinceImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof fetchMessagesSinceImpl>>>> {
  return toResult(() => fetchMessagesSinceImpl(...args));
}

async function fetchMessagesSinceImpl(conversationId: string, afterIso: string | null) {
  const { id: userId } = await requireUser();
  const supabase = createClient();
  // A member who deleted this conversation never sees anything up to that
  // moment, even when the poll has no cursor yet (an empty thread).
  const { data: member } = await supabase
    .from("conversation_members")
    .select("deleted_at")
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
    .maybeSingle();
  let query = supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (member?.deleted_at) query = query.gt("created_at", member.deleted_at);
  if (afterIso) query = query.gte("created_at", afterIso);
  const { data, error } = await query;
  if (error) throwDbError(error);
  return (data ?? []) as { id: string; sender_id: string; body: string; created_at: string }[];
}

/** Marks a conversation as read up to now for the current user. */
export async function markConversationRead(
  ...args: Parameters<typeof markConversationReadImpl>
): Promise<ActionResult<void>> {
  return toResult(() => markConversationReadImpl(...args));
}

async function markConversationReadImpl(conversationId: string) {
  const { id: userId } = await requireUser();
  const supabase = createClient();
  // .select() so an update RLS filtered to zero rows is surfaced instead of
  // silently doing nothing -- that is exactly how this was broken before 0033.
  const { data, error } = await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
    .select("conversation_id");
  if (error) throwDbError(error);
  if (!data || data.length === 0) throw new Error("Conversation not found.");
}

/** Total number of conversations with at least one message from someone else after the caller last read it. */
export async function getUnreadMessageCount(): Promise<number> {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: memberships } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, archived_at, deleted_at")
    .eq("profile_id", userId);
  if (!memberships || memberships.length === 0) return 0;

  // Archived conversations don't badge (a new message un-archives them, so
  // anything that matters resurfaces on its own). Deleted ones count only
  // for messages that arrived after the deletion.
  const memberById = new Map(memberships.map((m) => [m.conversation_id as string, m]));
  const conversationIds = memberships.filter((m) => !m.archived_at).map((m) => m.conversation_id as string);
  if (conversationIds.length === 0) return 0;

  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, created_at")
    .in("conversation_id", conversationIds)
    .neq("sender_id", userId);

  const unreadConversations = new Set<string>();
  for (const m of messages ?? []) {
    const member = memberById.get(m.conversation_id);
    if (!member) continue;
    if (member.deleted_at && m.created_at <= member.deleted_at) continue;
    if (!member.last_read_at || new Date(m.created_at) > new Date(member.last_read_at)) {
      unreadConversations.add(m.conversation_id);
    }
  }
  return unreadConversations.size;
}

/**
 * Contacts the current user is allowed to start a conversation with: anyone
 * sharing a subject assignment (teacher_subjects) or a class (class_members,
 * or a teacher who teaches that class) with them. "Teaches that class" means
 * the same thing as the database's teaches_class(): a timetable entry OR a
 * class_subject_teachers row. Checking only the timetable left students
 * seeing nothing but classmates until a timetable had been filled in. Deliberately narrower
 * than "every profile in the school" -- profiles RLS only lets a user read
 * their own row (plus admin's read-all), so this goes through the admin
 * client but filters to real relationships rather than exposing every
 * account to every user.
 */
export async function searchMessageableContacts(query: string) {
  const { id: userId } = await requireUser();
  // The tables below only let a user read their OWN row (or every row if
  // they're an admin), so listing co-members and their names needs the
  // admin client -- gated by "shares a subject/class with me", not by
  // exposing every profile in the school.
  const admin = createAdminClient();

  const [{ data: mySubjects }, { data: myClasses }, { data: myTimetabled }, { data: myAssigned }] =
    await Promise.all([
      admin.from("teacher_subjects").select("subject_id").eq("profile_id", userId),
      admin.from("class_members").select("class_id").eq("profile_id", userId),
      admin.from("timetable_entries").select("class_id").eq("teacher_id", userId),
      admin.from("class_subject_teachers").select("class_id").eq("teacher_id", userId),
    ]);
  const subjectIds = (mySubjects ?? []).map((s) => s.subject_id);
  const classIds = [
    ...new Set([
      ...(myClasses ?? []).map((c) => c.class_id),
      ...(myTimetabled ?? []).map((c) => c.class_id),
      ...(myAssigned ?? []).map((c) => c.class_id),
    ]),
  ];

  if (subjectIds.length === 0 && classIds.length === 0) return [];

  const seen = new Map<string, { id: string; full_name: string }>();

  if (subjectIds.length > 0) {
    const { data: subjectMates } = await admin
      .from("teacher_subjects")
      .select("profile_id, profiles(id, full_name)")
      .in("subject_id", subjectIds)
      .neq("profile_id", userId);
    for (const c of subjectMates ?? []) {
      const p = (c as any).profiles;
      if (p && !seen.has(p.id)) seen.set(p.id, p);
    }
  }

  if (classIds.length > 0) {
    const [{ data: classmates }, { data: timetableTeachers }, { data: assignedTeachers }] = await Promise.all([
      admin.from("class_members").select("profile_id, profiles(id, full_name)").in("class_id", classIds),
      admin
        .from("timetable_entries")
        .select("teacher_id, profiles:profiles!timetable_entries_teacher_id_fkey(id, full_name)")
        .in("class_id", classIds)
        .not("teacher_id", "is", null),
      admin
        .from("class_subject_teachers")
        .select("teacher_id, profiles:profiles!class_subject_teachers_teacher_id_fkey(id, full_name)")
        .in("class_id", classIds),
    ]);
    const classTeachers = [...(timetableTeachers ?? []), ...(assignedTeachers ?? [])];
    for (const c of classmates ?? []) {
      const p = (c as any).profiles;
      if (p && p.id !== userId && !seen.has(p.id)) seen.set(p.id, p);
    }
    for (const c of classTeachers) {
      const p = (c as any).profiles;
      if (p && p.id !== userId && !seen.has(p.id)) seen.set(p.id, p);
    }
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
  const { id: userId } = await requireUser();
  const supabase = createClient();
  const { data: membership } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
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

/**
 * One row per conversation in the requested view ("inbox" or "archived"),
 * with the other participant's name and the last message the caller can
 * still see. Conversations the caller deleted stay out unless something
 * newer has arrived since.
 */
export async function listMyConversations(view: InboxView = "inbox") {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: myConversations } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at, archived_at, deleted_at")
    .eq("profile_id", userId);
  if (!myConversations || myConversations.length === 0) return [];
  const conversationIds = myConversations.map((c) => c.conversation_id as string);
  const memberById = new Map(myConversations.map((c) => [c.conversation_id as string, c]));

  const admin = createAdminClient();
  const { data: allMembers } = await admin
    .from("conversation_members")
    .select("conversation_id, profile_id, profiles(full_name)")
    .in("conversation_id", conversationIds);

  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, body, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  const byConversation = new Map<string, { conversation_id: string; sender_id: string; body: string; created_at: string }[]>();
  for (const m of messages ?? []) {
    const list = byConversation.get(m.conversation_id) ?? [];
    list.push(m);
    byConversation.set(m.conversation_id, list);
  }

  const otherByConversation = new Map<string, string>();
  for (const m of allMembers ?? []) {
    if (m.profile_id !== userId) {
      otherByConversation.set(m.conversation_id, (m as any).profiles?.full_name ?? "Someone");
    }
  }

  return conversationIds
    .flatMap((id) => {
      const member = memberById.get(id)!;
      const last = latestVisible(byConversation.get(id) ?? [], member.deleted_at);
      const bucket = conversationBucket(member, last?.created_at ?? null);
      if (bucket !== view) return [];
      const unread =
        !!last && last.sender_id !== userId && (!member.last_read_at || new Date(last.created_at) > new Date(member.last_read_at));
      return [{ id, otherName: otherByConversation.get(id) ?? "Someone", last, unread }];
    })
    .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
}

type StateAction = "archive" | "unarchive" | "delete";

/**
 * Archive, restore, or delete a conversation from the caller's own view.
 * Only the caller's membership row changes (RLS + column grants, 0033);
 * the other person's inbox and the messages themselves are untouched.
 */
export async function setConversationState(
  ...args: Parameters<typeof setConversationStateImpl>
): Promise<ActionResult<void>> {
  return toResult(() => setConversationStateImpl(...args));
}

async function setConversationStateImpl(conversationId: string, action: StateAction) {
  const { id: userId } = await requireUser();
  const supabase = createClient();
  const now = new Date().toISOString();
  const patch =
    action === "archive"
      ? { archived_at: now }
      : action === "unarchive"
        ? { archived_at: null }
        : { deleted_at: now, archived_at: null };

  // .select() so a row filtered out by RLS is reported, not silently ignored.
  const { data, error } = await supabase
    .from("conversation_members")
    .update(patch)
    .eq("conversation_id", conversationId)
    .eq("profile_id", userId)
    .select("conversation_id");
  if (error) throwDbError(error);
  if (!data || data.length === 0) throw new Error("Conversation not found.");
}
