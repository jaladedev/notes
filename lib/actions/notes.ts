"use server";

// Ported from jaladedev/school_app (lib/actions/teacher.ts, lines 557-943)
// at clone SHA 466c538. Adapted for the standalone, per-school-DB model:
//   curriculum_topics        -> topics (belongs to a space)
//   teacher_profiles /
//     subjects_taught, HOD   -> space_members (role: teacher | reviewer | admin)
//   assertRole(["teacher"])  -> assertSpaceRole (membership-scoped, not global role)
// Versioning, autosave, and the review gate are otherwise unchanged --
// see the plan doc (notes-delivery-plan.md, section 1) for why they port as-is.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertGlobalRole, assertSpaceRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { writeAuditLog } from "@/lib/audit";
import { TOPIC_RESOURCE_BUCKET } from "@/lib/storageBuckets";

/**
 * Save a note. A "published" save goes through the space's review gate
 * (see 0001_init.sql: topic_note_visible() + notes_update_reviewer) unless
 * the author IS the space's reviewer for this topic's space, in which case
 * there's no one else to review it and it auto-approves -- same rule
 * school_app applies to a solo HOD, generalized from subject+HOD to
 * space+reviewer.
 */
export async function saveTopicNote(
  topicId: string,
  content: string,
  status: "draft" | "published"
) {
  const { id: teacherId } = await requireUser();
  const supabase = createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("space_id")
    .eq("id", topicId)
    .single();
  if (!topic) throw new Error("Topic not found.");

  const membership = await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: latest } = await supabase
    .from("topic_notes")
    .select("version")
    .eq("topic_id", topicId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  let moderationStatus: "approved" | "pending" = "approved";
  if (status === "published") {
    const { data: settings } = await supabase
      .from("settings")
      .select("requires_review")
      .single();
    if (settings?.requires_review) {
      moderationStatus = membership.role === "reviewer" || membership.role === "admin"
        ? "approved"
        : "pending";
    }
  }

  // Notes are append-only: publishing a revision never overwrites an
  // earlier draft or published copy (ported reasoning, unchanged).
  const { data: note, error } = await supabase
    .from("topic_notes")
    .insert({
      topic_id: topicId,
      author_id: teacherId,
      content,
      status,
      moderation_status: moderationStatus,
      version: (latest?.version ?? 0) + 1,
    })
    .select("id")
    .single();

  if (error) throwDbError(error);

  try {
    await supabase
      .from("topic_note_drafts")
      .delete()
      .eq("topic_id", topicId)
      .eq("author_id", teacherId);
  } catch {
    // best-effort, same as upstream
  }

  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  revalidatePath("/dashboard/teacher/notes");

  return note;
}

/** Periodic autosave, upserting onto a single scratch row per (topic, author). */
export async function saveTopicNoteDraft(topicId: string, content: string) {
  const { id: teacherId } = await requireUser();
  const supabase = createClient();

  const { error } = await supabase
    .from("topic_note_drafts")
    .upsert(
      { topic_id: topicId, author_id: teacherId, content, updated_at: new Date().toISOString() },
      { onConflict: "topic_id,author_id" }
    );
  if (error) throwDbError(error);
}

export async function getTopicNoteDraft(topicId: string) {
  const { id: teacherId } = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("topic_note_drafts")
    .select("content, updated_at")
    .eq("topic_id", topicId)
    .eq("author_id", teacherId)
    .maybeSingle();
  return data;
}

export async function clearTopicNoteDraft(topicId: string) {
  const { id: teacherId } = await requireUser();
  const supabase = createClient();
  await supabase
    .from("topic_note_drafts")
    .delete()
    .eq("topic_id", topicId)
    .eq("author_id", teacherId);
}

export async function getTopicNoteVersionContent(noteId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("topic_notes")
    .select("content")
    .eq("id", noteId)
    .single();
  if (error) throwDbError(error);
  return data.content;
}

export async function restoreTopicNoteVersion(topicId: string, versionNoteId: string) {
  const supabase = createClient();
  const { id: teacherId } = await requireUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("space_id")
    .eq("id", topicId)
    .single();
  if (!topic) throw new Error("Topic not found.");
  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: version, error: versionError } = await supabase
    .from("topic_notes")
    .select("content, status")
    .eq("id", versionNoteId)
    .eq("topic_id", topicId)
    .single();
  if (versionError || !version) throw new Error("That version isn't available.");

  return saveTopicNote(topicId, version.content, version.status as "draft" | "published");
}

/**
 * Ported from deleteTopicNoteVersion. The resource-reassignment logic is
 * kept verbatim: a resource's note_id records whichever version was
 * current at upload time, but the same [[resource:UUID]] marker can still
 * appear in other surviving versions' content, so a resource is only
 * hard-deleted (row + storage object) once no surviving version's content
 * still references it. Otherwise note_id is reassigned to the newest
 * surviving version that does.
 */
export async function deleteTopicNoteVersion(topicId: string, versionNoteId: string) {
  const supabase = createClient();
  const { id: teacherId } = await requireUser();

  const { data: topic } = await supabase
    .from("topics")
    .select("space_id")
    .eq("id", topicId)
    .single();
  if (!topic) throw new Error("Topic not found.");
  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: target, error: targetError } = await supabase
    .from("topic_notes")
    .select("topic_id")
    .eq("id", versionNoteId)
    .single();
  if (targetError || !target) {
    throw new Error("That version isn't available (it may have already been removed).");
  }
  if (target.topic_id !== topicId) {
    throw new Error("That version doesn't belong to this topic.");
  }

  const { data: allVersions } = await supabase
    .from("topic_notes")
    .select("id, version")
    .eq("topic_id", topicId)
    .order("version", { ascending: false });
  if ((allVersions?.length ?? 0) <= 1) {
    throw new Error("Can't delete the only version of this note.");
  }

  const { data: attachedResources } = await supabase
    .from("topic_resources")
    .select("id, file_url")
    .eq("note_id", versionNoteId);

  if (attachedResources && attachedResources.length > 0) {
    const { data: survivingVersions } = await supabase
      .from("topic_notes")
      .select("id, version, content")
      .eq("topic_id", topicId)
      .neq("id", versionNoteId)
      .order("version", { ascending: false });

    const admin = createAdminClient();
    const toHardDelete: typeof attachedResources = [];

    for (const resource of attachedResources) {
      const marker = `[[resource:${resource.id}`;
      const stillReferencedIn = survivingVersions?.find((v) => v.content?.includes(marker));

      if (stillReferencedIn) {
        const { error: reassignError } = await admin
          .from("topic_resources")
          .update({ note_id: stillReferencedIn.id })
          .eq("id", resource.id);
        if (reassignError) throwDbError(reassignError);
      } else {
        toHardDelete.push(resource);
      }
    }

    if (toHardDelete.length > 0) {
      const filePaths = toHardDelete.map((r) => r.file_url).filter((p): p is string => !!p);
      if (filePaths.length) {
        await admin.storage.from(TOPIC_RESOURCE_BUCKET).remove(filePaths);
      }
      const { error: cleanupError } = await admin
        .from("topic_resources")
        .delete()
        .in("id", toHardDelete.map((r) => r.id));
      if (cleanupError) throwDbError(cleanupError);
    }
  }

  const { error } = await supabase.from("topic_notes").delete().eq("id", versionNoteId);
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  revalidatePath("/dashboard/teacher/notes");
}

// ---------- Space / topic / membership CRUD (admin) ----------
// New, not ported -- school_app has no equivalent "space" concept
// (plan doc section 5). Kept intentionally small: create/rename/delete
// only, no bulk import or reordering UI yet.

export type EducationLevel = "primary" | "jss" | "sss";

type CurriculumSlot = {
  subjectId?: string;
  educationLevel?: EducationLevel;
  levelNumber?: number;
  academicYear?: string;
  term?: 1 | 2 | 3;
  classId?: string;
};

export async function createClass(name: string, educationLevel?: EducationLevel, levelNumber?: number) {
  // Fixed: this used to only check requireUser() (any signed-in
  // account, including a student, could create classes) -- stale
  // reasoning from before admin-provisioned accounts existed. Now
  // that profiles.role is real (0006_admin_accounts.sql), there's no
  // bootstrap excuse left: the very first admin already has role =
  // 'admin' from the moment their profile row is inserted (see that
  // migration's bootstrap note), so assertGlobalRole works from day one.
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can create a class.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the class a name.");

  // Still the admin client, not the RLS-scoped one -- classes/class_members
  // have no INSERT policy at all (deliberately: this action, gated by
  // assertGlobalRole above, is meant to be the only write path).
  const admin = createAdminClient();
  const { data: klass, error } = await admin
    .from("classes")
    .insert({ name: trimmed, education_level: educationLevel ?? null, level_number: levelNumber ?? null })
    .select("id, name")
    .single();
  if (error) throwDbError(error);

  await writeAuditLog({ actorId: admin_.id, action: "class.create", targetType: "class", targetId: klass!.id });

  revalidatePath("/dashboard/admin/classes");
  return klass;
}

export type BulkClassRowResult = { row: number; name: string; ok: boolean; message: string };

/** CSV import for classes, reusing createClass per row so validation and audit logging stay identical to the single-class form. */
export async function bulkCreateClasses(
  rows: { name: string; educationLevel?: string; levelNumber?: string }[]
): Promise<BulkClassRowResult[]> {
  await assertGlobalRole(["admin"], "Only an admin can create a class.");

  const validLevels: EducationLevel[] = ["primary", "jss", "sss"];
  const results: BulkClassRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNumber = i + 2;
    if (!r.name?.trim()) {
      results.push({ row: rowNumber, name: r.name || "(missing)", ok: false, message: "Missing class name." });
      continue;
    }
    const level = r.educationLevel?.trim().toLowerCase();
    if (level && !validLevels.includes(level as EducationLevel)) {
      results.push({
        row: rowNumber,
        name: r.name,
        ok: false,
        message: `Level must be primary, jss, or sss (got "${r.educationLevel}").`,
      });
      continue;
    }
    const levelNumber = r.levelNumber?.trim() ? Number(r.levelNumber) : undefined;
    if (r.levelNumber?.trim() && (!Number.isFinite(levelNumber) || levelNumber! < 1)) {
      results.push({ row: rowNumber, name: r.name, ok: false, message: `Invalid level number "${r.levelNumber}".` });
      continue;
    }
    try {
      await createClass(r.name, level as EducationLevel | undefined, levelNumber);
      results.push({ row: rowNumber, name: r.name, ok: true, message: "Created." });
    } catch (err) {
      results.push({
        row: rowNumber,
        name: r.name,
        ok: false,
        message: err instanceof Error ? err.message : "Failed to create.",
      });
    }
  }

  revalidatePath("/dashboard/admin/classes");
  return results;
}

export async function addClassMember(classId: string, studentEmail: string) {
  // Fixed: same requireUser()-only gap as createClass. Also rewritten
  // to look up by profiles.email (added in 0006_admin_accounts.sql)
  // instead of admin.auth.admin.listUsers() -- that call only returns
  // one page of users by default, so the email match would silently
  // fail to find a student once the school passed that page size. This
  // also lets us verify the matched account is actually a student
  // (listUsers had no way to check that at all -- an admin could have
  // "added" a teacher or another admin to a class roster).
  await assertGlobalRole(["admin"], "Only an admin can manage a class roster.");

  const admin = createAdminClient();
  const { data: match, error: lookupError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", studentEmail.trim().toLowerCase())
    .maybeSingle();
  if (lookupError) throwDbError(lookupError);
  if (!match) throw new Error(`No account found for ${studentEmail}.`);
  if (match.role !== "student") {
    throw new Error(`${studentEmail} is a ${match.role}, not a student -- only students belong on a class roster.`);
  }

  const { error } = await admin
    .from("class_members")
    .upsert({ class_id: classId, profile_id: match.id }, { onConflict: "class_id,profile_id" });
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/admin/classes/${classId}`);
}

export async function removeClassMember(classId: string, profileId: string) {
  // Fixed: same requireUser()-only gap as createClass/addClassMember.
  await assertGlobalRole(["admin"], "Only an admin can manage a class roster.");
  const admin = createAdminClient();
  const { error } = await admin
    .from("class_members")
    .delete()
    .eq("class_id", classId)
    .eq("profile_id", profileId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/admin/classes/${classId}`);
}

export async function createSubject(name: string) {
  // Fixed: same requireUser()-only gap as createClass/addClassMember
  // above -- any signed-in account could create subjects.
  await assertGlobalRole(["admin"], "Only an admin can create a subject.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the subject a name.");

  // Admin client, not the RLS-scoped one: subjects are low-sensitivity
  // shared catalog data with no per-row ownership to check against, so
  // assertGlobalRole above is the real (and only) gate.
  const admin = createAdminClient();
  const { data: subject, error } = await admin
    .from("subjects")
    .insert({ name: trimmed })
    .select("id, name")
    .single();
  if (error) throwDbError(error);
  revalidatePath("/dashboard/admin/spaces");
  return subject;
}

/**
 * Space name is now optional if a curriculum slot is given -- it
 * defaults to "<Subject> <Level><LevelNumber>" (e.g. "Basic Science
 * JSS2"), same idea as school_app deriving a display label from
 * subject+level+level_number rather than a teacher typing it by hand
 * every time.
 */
export async function createSpace(name: string, slot: CurriculumSlot = {}) {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  let displayName = name.trim();
  if (!displayName && slot.subjectId) {
    const { data: subject } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", slot.subjectId)
      .single();
    displayName = [subject?.name, slot.educationLevel, slot.levelNumber]
      .filter(Boolean)
      .join(" ");
  }
  if (!displayName) throw new Error("Give the space a name, or fill in the curriculum fields.");

  const { data: space, error } = await supabase
    .from("spaces")
    .insert({
      name: displayName,
      subject_id: slot.subjectId ?? null,
      education_level: slot.educationLevel ?? null,
      level_number: slot.levelNumber ?? null,
      academic_year: slot.academicYear ?? null,
      term: slot.term ?? null,
      class_id: slot.classId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "A space already exists for that subject, level, year, and term. Open it instead of creating another."
      );
    }
    throwDbError(error);
  }

  // Creator becomes the space's first admin -- otherwise a freshly
  // created space would have no members at all and be invisible to
  // its own creator under RLS.
  const { error: memberError } = await supabase
    .from("space_members")
    .insert({ space_id: space.id, profile_id: userId, role: "admin" });
  if (memberError) throwDbError(memberError);

  revalidatePath("/dashboard/admin/spaces");
  return space;
}

export async function setSpaceClass(spaceId: string, classId: string | null) {
  await assertSpaceRole(spaceId, ["admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("spaces").update({ class_id: classId }).eq("id", spaceId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/admin/spaces/${spaceId}`);
}

export async function renameSpace(spaceId: string, name: string) {
  await assertSpaceRole(spaceId, ["admin"]);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the space a name.");

  const supabase = createClient();
  const { error } = await supabase.from("spaces").update({ name: trimmed }).eq("id", spaceId);
  if (error) throwDbError(error);
  revalidatePath("/dashboard/admin/spaces");
  revalidatePath(`/dashboard/admin/spaces/${spaceId}`);
}

export async function deleteSpace(spaceId: string) {
  await assertSpaceRole(spaceId, ["admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
  if (error) throwDbError(error);
  revalidatePath("/dashboard/admin/spaces");
}

export async function addSpaceMember(
  spaceId: string,
  profileEmail: string,
  role: "teacher" | "reviewer" | "admin" | "student"
) {
  await assertSpaceRole(spaceId, ["admin"]);

  // Fixed: was using admin.auth.admin.listUsers(), which only returns
  // one page of accounts by default -- the email match would silently
  // fail once the school had enough accounts to paginate. Also had no
  // check that the matched account's global role made sense for the
  // space role being assigned (a parent could have been added as a
  // space "teacher"). Both fixed the same way as addClassMember.
  const admin = createAdminClient();
  const { data: match, error: lookupError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("email", profileEmail.trim().toLowerCase())
    .maybeSingle();
  if (lookupError) throwDbError(lookupError);
  if (!match) throw new Error(`No account found for ${profileEmail}. Check the email is correct.`);

  const wantsStudent = role === "student";
  const matchIsStudent = match.role === "student";
  if (wantsStudent !== matchIsStudent) {
    throw new Error(
      wantsStudent
        ? `${profileEmail} is a ${match.role}, not a student.`
        : `${profileEmail} is a student -- students join a space as "student", not "${role}".`
    );
  }

  // Was via the RLS-scoped client, matching space_members having no
  // write policy for an existing space admin at all (fixed alongside
  // this in 0009_fix_space_members_recursion.sql: space_members_write_by_space_admin).
  const { error } = await admin
    .from("space_members")
    .upsert({ space_id: spaceId, profile_id: match.id, role }, { onConflict: "space_id,profile_id" });
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/admin/spaces/${spaceId}`);
}

export async function removeSpaceMember(spaceId: string, profileId: string) {
  await assertSpaceRole(spaceId, ["admin"]);
  const admin = createAdminClient();
  const { error } = await admin
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("profile_id", profileId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/admin/spaces/${spaceId}`);
}

export async function createTopic(spaceId: string, title: string, weekNumber?: number) {
  await assertSpaceRole(spaceId, ["teacher", "reviewer", "admin"]);
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Give the topic a title.");

  const supabase = createClient();
  const { data: latest } = await supabase
    .from("topics")
    .select("sequence_order")
    .eq("space_id", spaceId)
    .order("sequence_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: topic, error } = await supabase
    .from("topics")
    .insert({
      space_id: spaceId,
      title: trimmed,
      week_number: weekNumber ?? null,
      sequence_order: (latest?.sequence_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/spaces/${spaceId}`);
  return topic;
}

export async function renameTopic(topicId: string, title: string) {
  const supabase = createClient();
  const { data: topic } = await supabase.from("topics").select("space_id").eq("id", topicId).single();
  if (!topic) throw new Error("Topic not found.");
  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const trimmed = title.trim();
  if (!trimmed) throw new Error("Give the topic a title.");

  const { error } = await supabase.from("topics").update({ title: trimmed }).eq("id", topicId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/spaces/${topic.space_id}`);
  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
}

export async function deleteTopic(topicId: string) {
  const supabase = createClient();
  const { data: topic } = await supabase.from("topics").select("space_id").eq("id", topicId).single();
  if (!topic) throw new Error("Topic not found.");
  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  // Resource files aren't cleaned up here (relies on ON DELETE CASCADE
  // for the rows; storage objects would be orphaned). Fine for v1 --
  // note the same caveat as the plan doc's storage-isn't-transactional
  // comments elsewhere.
  const { error } = await supabase.from("topics").delete().eq("id", topicId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/spaces/${topic.space_id}`);
}

// ---------- Share links ----------
// New, not ported -- school_app has no equivalent (plan doc section 7,
// phase P3). A share link exposes one topic's published note, read-only,
// to anyone with the link -- no account needed. RLS can't cover this
// (the viewer isn't authenticated at all), so the public page below
// looks the token up with the admin client and re-checks everything
// RLS would have: published + approved + released.

function generateShareToken(): string {
  // 24 random bytes, base64url -- unguessable, URL-safe, no padding.
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createShareLink(
  topicId: string,
  options: { accessCode?: string; expiresAt?: string } = {}
) {
  const { id: teacherId } = await requireUser();
  const supabase = createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("space_id")
    .eq("id", topicId)
    .single();
  if (!topic) throw new Error("Topic not found.");
  await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const token = generateShareToken();
  const { data: link, error } = await supabase
    .from("share_links")
    .insert({
      topic_id: topicId,
      token,
      access_code: options.accessCode?.trim() || null,
      created_by: teacherId,
      expires_at: options.expiresAt || null,
    })
    .select("*")
    .single();
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/notes/${topicId}`);
  return link;
}

export async function revokeShareLink(linkId: string) {
  const supabase = createClient();
  const { data: link } = await supabase
    .from("share_links")
    .select("id, topic_id, topics(space_id)")
    .eq("id", linkId)
    .single();
  if (!link) throw new Error("Link not found.");
  await assertSpaceRole((link as any).topics.space_id, ["teacher", "reviewer", "admin"]);

  const { error } = await supabase.from("share_links").delete().eq("id", linkId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${link.topic_id}`);
}

/**
 * Looks up a share link and returns its topic's content -- unauthenticated,
 * for the public /shared/[token] page. Uses the admin client since the
 * viewer has no session for RLS to check; re-implements every check RLS
 * would apply to a logged-in student (published + approved + released),
 * plus the link's own expiry and optional access code.
 */
export async function resolveShareLink(token: string, accessCode?: string) {
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("share_links")
    .select("id, topic_id, access_code, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return { error: "not_found" as const };

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { error: "expired" as const };
  }
  if (link.access_code && link.access_code !== accessCode) {
    return { error: "needs_code" as const };
  }

  const { data: topic } = await admin
    .from("topics")
    .select("id, title")
    .eq("id", link.topic_id)
    .single();
  if (!topic) return { error: "not_found" as const };

  const { data: note } = await admin
    .from("topic_notes")
    .select("id, content, status, moderation_status, release_at")
    .eq("topic_id", link.topic_id)
    .eq("status", "published")
    .eq("moderation_status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!note) return { error: "not_found" as const };
  if (note.release_at && new Date(note.release_at) > new Date()) {
    return { error: "not_found" as const };
  }

  const { data: resources } = await admin
    .from("topic_resources")
    .select("*")
    .eq("topic_id", link.topic_id)
    .order("sequence_order", { ascending: true });

  // Resource file_urls are storage paths, not signed URLs, when read
  // this way -- sign them fresh since the viewer has no session to do
  // it themselves (mirrors what uploadTopicResource does right after
  // insert, in lib/actions/resources.ts).
  const signedResources = await Promise.all(
    (resources ?? []).map(async (r) => {
      if (!r.file_url) return r;
      const { data: signed } = await admin.storage
        .from(TOPIC_RESOURCE_BUCKET)
        .createSignedUrl(r.file_url, 6 * 60 * 60);
      return { ...r, file_url: signed?.signedUrl ?? r.file_url };
    })
  );

  return {
    topic: { id: topic.id, title: topic.title },
    content: note.content,
    resources: signedResources,
  };
}
