"use server";

// Ported from jaladedev/school_app's lib/actions/admin.ts (SHA 466c538):
// generateTempPassword, assertEmailAvailable, createTeacherAccount,
// createStudentAccount, createParentAccount, resetUserPassword,
// deactivateUser -- adapted to this app's flat `profiles.role` (no
// separate teacher_profiles/student_profiles tables) and to
// assertGlobalRole in place of assertRole.

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { writeAuditLog } from "@/lib/audit";

const TEMP_PASSWORD_WORDS = [
  "acorn", "amber", "atlas", "basil", "birch", "cedar", "cobalt", "coral",
  "daisy", "delta", "ember", "fern", "fable", "glade", "harbor", "honey",
  "ivory", "juniper", "lagoon", "lumen", "maple", "marble", "meadow",
  "noble", "ocean", "olive", "orchid", "pearl", "pine", "quartz", "river",
  "rose", "sable", "spruce", "stone", "tulip", "verve", "willow", "zenith",
];

function generateTempPassword() {
  const segments = Array.from({ length: 4 }, () => {
    const index = crypto.randomInt(TEMP_PASSWORD_WORDS.length);
    return TEMP_PASSWORD_WORDS[index];
  });
  const suffix = crypto.randomInt(100, 999).toString();
  return `${segments.join("-")}-${suffix}`;
}

// Supabase Auth would reject a true duplicate anyway, but checking first
// gives a clear, specific error instead of surfacing Auth's raw message.
async function assertEmailAvailable(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) throw new Error("An account with this email already exists.");
}

async function deleteUserAfterFailedSetup(admin: ReturnType<typeof createAdminClient>, userId: string) {
  await admin.auth.admin.deleteUser(userId);
}

type NewAccountResult = { userId: string; temporaryPassword: string };

export async function createTeacherAccount(input: {
  fullName: string;
  email: string;
}): Promise<NewAccountResult> {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can create accounts.");
  const admin = createAdminClient();
  await assertEmailAvailable(admin, input.email);

  const temporaryPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Failed to create the auth account.");
  }
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: "teacher",
    full_name: input.fullName,
    email: input.email,
    must_change_password: true,
  });
  if (profileError) {
    await deleteUserAfterFailedSetup(admin, userId);
    throwDbError(profileError);
  }

  await writeAuditLog({
    actorId: admin_.id,
    action: "account.create",
    targetType: "profile",
    targetId: userId,
    metadata: { role: "teacher" },
  });

  revalidatePath("/dashboard/admin/staff");
  return { userId, temporaryPassword };
}

export async function createStudentAccount(input: {
  fullName: string;
  email: string;
  classId?: string;
}): Promise<NewAccountResult> {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can create accounts.");
  const admin = createAdminClient();
  await assertEmailAvailable(admin, input.email);

  const temporaryPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Failed to create the auth account.");
  }
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: "student",
    full_name: input.fullName,
    email: input.email,
    must_change_password: true,
  });
  if (profileError) {
    await deleteUserAfterFailedSetup(admin, userId);
    throwDbError(profileError);
  }

  if (input.classId) {
    const { error: classError } = await admin
      .from("class_members")
      .insert({ class_id: input.classId, profile_id: userId });
    if (classError) throwDbError(classError);
  }

  await writeAuditLog({
    actorId: admin_.id,
    action: "account.create",
    targetType: "profile",
    targetId: userId,
    metadata: { role: "student", classId: input.classId ?? null },
  });

  revalidatePath("/dashboard/admin/students");
  return { userId, temporaryPassword };
}

export async function createParentAccount(input: {
  fullName: string;
  email: string;
  childStudentIds: string[];
}): Promise<NewAccountResult> {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can create accounts.");
  const admin = createAdminClient();
  await assertEmailAvailable(admin, input.email);

  const temporaryPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Failed to create the auth account.");
  }
  const userId = created.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    role: "parent",
    full_name: input.fullName,
    email: input.email,
    must_change_password: true,
  });
  if (profileError) {
    await deleteUserAfterFailedSetup(admin, userId);
    throwDbError(profileError);
  }

  if (input.childStudentIds.length) {
    const { error: linkError } = await admin.from("guardian_links").insert(
      input.childStudentIds.map((studentId) => ({ parent_id: userId, student_id: studentId }))
    );
    if (linkError) throwDbError(linkError);
  }

  await writeAuditLog({
    actorId: admin_.id,
    action: "account.create",
    targetType: "profile",
    targetId: userId,
    metadata: { role: "parent", childCount: input.childStudentIds.length },
  });

  revalidatePath("/dashboard/admin/parents");
  return { userId, temporaryPassword };
}

export async function resetUserPassword(userId: string): Promise<{ password: string }> {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can reset a password.");
  const admin = createAdminClient();

  const newPassword = generateTempPassword();

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updateError) throwDbError(updateError);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (profileError) throwDbError(profileError);

  await writeAuditLog({
    actorId: admin_.id,
    action: "account.password_reset",
    targetType: "profile",
    targetId: userId,
  });

  revalidatePath("/dashboard/admin/staff");
  revalidatePath("/dashboard/admin/students");
  revalidatePath("/dashboard/admin/parents");
  return { password: newPassword };
}

export async function setAccountActive(userId: string, active: boolean) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can do that.");
  const admin = createAdminClient();

  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) throwDbError(error);

  // Deactivation must also kill any live session immediately, not just
  // block the next RLS check -- otherwise a still-open browser tab keeps
  // working until its JWT naturally expires.
  if (!active) {
    await admin.auth.admin.signOut(userId, "global").catch(() => {
      // Best-effort: a missing/already-signed-out session isn't an error here.
    });
  }

  await writeAuditLog({
    actorId: admin_.id,
    action: active ? "account.reactivate" : "account.deactivate",
    targetType: "profile",
    targetId: userId,
  });

  revalidatePath("/dashboard/admin/staff");
  revalidatePath("/dashboard/admin/students");
  revalidatePath("/dashboard/admin/parents");
}

/** Called from /change-password once the user has set a new password. */
export async function clearMustChangePassword(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userId);
  if (error) throwDbError(error);
}
