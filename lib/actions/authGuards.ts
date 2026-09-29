"use server";

// Adapted from jaladedev/school_app's lib/actions/authGuards.ts (SHA
// 466c538). getAuthenticatedUser's JWT-revalidation pattern is kept
// verbatim -- see the upstream doc comment for why.
//
// Two separate guards now, because this app has two separate notions of
// role: assertGlobalRole checks profiles.role (admin/teacher/student/
// parent -- set only by accountAdmin.ts, never by the user), used for
// school-wide actions (creating accounts, classes, subjects). assertSubjectRole
// checks teacher_subjects (teacher/reviewer within one subject),
// used for anything scoped to a single space's notes/resources.

import type { User } from "@supabase/supabase-js";
import { createClient, getUserWithRetry } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRANSIENT_AUTH_ERROR_MESSAGE } from "@/lib/authErrors";

type SubjectRole = "teacher" | "reviewer";
type GlobalRole = "admin" | "teacher" | "student" | "parent";

export async function getAuthenticatedUser(): Promise<User> {
  const supabase = createClient();
  const { user, error: getUserError, isTransient } = await getUserWithRetry(supabase);

  if (getUserError && isTransient) {
    throw new Error(TRANSIENT_AUTH_ERROR_MESSAGE, { cause: getUserError });
  }
  if (!user) {
    throw new Error("You must be signed in.");
  }
  return user;
}

export async function requireUser(): Promise<{ id: string }> {
  const user = await getAuthenticatedUser();
  return { id: user.id };
}

/**
 * Verifies the current user's global role (profiles.role) and that their
 * account is active. Re-checked via the admin client -- a profile row read
 * through the anon-key client is only as trustworthy as its RLS SELECT
 * policy, same reasoning as upstream's assertRole.
 */
export async function assertGlobalRole(
  allowedRoles: GlobalRole[],
  message = "You don't have permission to do that."
): Promise<{ id: string; role: GlobalRole; fullName: string }> {
  const user = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role, full_name, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error("Could not verify access.", { cause: error });
  if (!profile || !profile.is_active) throw new Error("Your account has been deactivated.");
  if (!allowedRoles.includes(profile.role as GlobalRole)) throw new Error(message);

  return { id: user.id, role: profile.role as GlobalRole, fullName: profile.full_name };
}

/**
 * Verifies the current user is assigned to `subjectId` (teacher_subjects)
 * with one of `allowedRoles`, or is a global admin (who can act on any
 * subject without a teacher_subjects row -- same as RLS's is_subject_staff /
 * is_subject_reviewer). Also re-checks the account is active.
 */
export async function assertSubjectRole(
  subjectId: string,
  allowedRoles: SubjectRole[]
): Promise<{ id: string; role: SubjectRole | "admin" }> {
  const user = await getAuthenticatedUser();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_active) throw new Error("Your account has been deactivated.");
  if (profile.role === "admin") return { id: user.id, role: "admin" };

  const { data: assignment, error } = await admin
    .from("teacher_subjects")
    .select("role")
    .eq("subject_id", subjectId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) throw new Error("Could not verify access.", { cause: error });
  if (!assignment || !allowedRoles.includes(assignment.role as SubjectRole)) {
    throw new Error("You don't teach this subject.");
  }

  return { id: user.id, role: assignment.role as SubjectRole };
}
