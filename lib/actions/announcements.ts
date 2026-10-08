"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { toResult, type ActionResult } from "@/lib/actions/result";
import { writeAuditLog } from "@/lib/audit";

/**
 * target: school-wide (classId omitted, admin only) or a single class. A
 * "space" target no longer exists (0020) -- a teacher posts to a class
 * they're timetabled to teach (RLS: announcements_write_staff / teaches_class),
 * an admin can post to any class or school-wide.
 */
export async function createAnnouncement(
  ...args: Parameters<typeof createAnnouncementImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createAnnouncementImpl>>>> {
  return toResult(() => createAnnouncementImpl(...args));
}

async function createAnnouncementImpl(input: {
  title: string;
  body: string;
  classId?: string;
}) {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title: input.title,
      body: input.body,
      class_id: input.classId ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("row-level security")) {
      throw new Error(
        input.classId
          ? "You aren't timetabled to teach this class."
          : "Only an admin can post a school-wide announcement."
      );
    }
    throwDbError(error);
  }

  await writeAuditLog({
    actorId: userId,
    action: "announcement.create",
    targetType: "announcement",
    targetId: data!.id,
  });

  revalidatePath("/dashboard");
}
