// Ported pattern from school_app's lib/audit.ts: writes go through the
// admin client regardless of the calling user's RLS, since an audit
// entry must be recorded even for actions RLS would otherwise hide from
// the actor (e.g. logging an admin's own privileged write).

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

type AuditAction =
  | "account.create"
  | "account.deactivate"
  | "account.reactivate"
  | "account.password_reset"
  | "note.publish"
  | "note.restore_version"
  | "note.delete_version"
  | "space.create"
  | "class.create"
  | "timetable.period_save"
  | "timetable.period_delete"
  | "timetable.timezone_save"
  | "timetable.entry_set"
  | "timetable.entry_clear"
  | "announcement.create"
  | "quiz.publish"
  | "homework.grade";

export async function writeAuditLog(input: {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });

  // Audit logging must never take down the action it's logging -- a
  // failed insert here is reported, not thrown.
  if (error) {
    logger.error("writeAuditLog: failed to write audit entry", { error, action: input.action });
  }
}
