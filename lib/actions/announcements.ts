"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole, assertSpaceRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { writeAuditLog } from "@/lib/audit";

/** target: school-wide (both null), a class, or a single space. */
export async function createAnnouncement(input: {
  title: string;
  body: string;
  spaceId?: string;
  classId?: string;
}) {
  const supabase = createClient();
  let userId: string;

  if (!input.spaceId && !input.classId) {
    userId = (await assertGlobalRole(["admin"], "Only an admin can post a school-wide announcement.")).id;
  } else if (input.spaceId) {
    userId = (await assertSpaceRole(input.spaceId, ["teacher", "reviewer", "admin"])).id;
  } else {
    userId = (await assertGlobalRole(["admin"], "Only an admin can post to a class.")).id;
  }

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: input.title,
      body: input.body,
      space_id: input.spaceId ?? null,
      class_id: input.classId ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throwDbError(error);

  await writeAuditLog({
    actorId: userId,
    action: "announcement.create",
    targetType: "announcement",
    targetId: data!.id,
  });

  revalidatePath("/dashboard");
}
