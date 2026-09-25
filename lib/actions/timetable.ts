"use server";

// School-level timetable (0011_school_timetable.sql). Writes are admin-only
// twice over: assertGlobalRole here, and the write policies on
// timetable_periods / timetable_entries (is_admin()). Reads go through
// RLS, so a caller only ever gets the lessons they're allowed to see
// (admin: everything; teacher/student/parent: those of their own spaces).
//
// The one read that uses the admin client is teacher display names:
// profiles RLS only exposes a user's own row, so without it a student
// would see a blank teacher on every lesson. It is limited to the teacher
// ids on rows RLS has already let the caller see.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertGlobalRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { writeAuditLog } from "@/lib/audit";
import {
  DEFAULT_TIME_ZONE,
  findOverlappingPeriod,
  formatTime,
  isValidTime,
  isValidTimeZone,
  sortPeriods,
  weekdayLabel,
  type Period,
  type TimetableRow,
} from "@/lib/timetable";

function revalidateTimetable(classId?: string) {
  revalidatePath("/dashboard/admin/timetable");
  if (classId) revalidatePath(`/dashboard/admin/timetable/${classId}`);
  revalidatePath("/dashboard/timetable");
}

// ---------- Reads ----------

export async function getSchoolTimeZone(): Promise<string> {
  await requireUser();
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("timezone").maybeSingle();
  const tz = (data as { timezone?: string } | null)?.timezone;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

export async function getTimetable(
  filter: { classId?: string; teacherId?: string; weekday?: number } = {}
): Promise<{ periods: Period[]; rows: TimetableRow[] }> {
  await requireUser();
  const supabase = createClient();

  const { data: periodRows, error: periodError } = await supabase.from("timetable_periods").select("*");
  if (periodError) throwDbError(periodError);
  const periods = sortPeriods((periodRows ?? []) as Period[]);

  let query = supabase
    .from("timetable_entries")
    .select("id, class_id, space_id, weekday, period_number, teacher_id, room");
  if (filter.classId) query = query.eq("class_id", filter.classId);
  if (filter.teacherId) query = query.eq("teacher_id", filter.teacherId);
  if (filter.weekday) query = query.eq("weekday", filter.weekday);
  const { data: entries, error: entryError } = await query;
  if (entryError) throwDbError(entryError);
  if (!entries || entries.length === 0) return { periods, rows: [] };

  const classIds = [...new Set(entries.map((e) => e.class_id as string))];
  const spaceIds = [...new Set(entries.map((e) => e.space_id as string))];
  const teacherIds = [...new Set(entries.map((e) => e.teacher_id as string | null).filter((id): id is string => !!id))];

  const [{ data: classes }, { data: spaces }] = await Promise.all([
    supabase.from("classes").select("id, name").in("id", classIds),
    supabase.from("spaces").select("id, name, subjects(name)").in("id", spaceIds),
  ]);

  const teacherNames = new Map<string, string>();
  if (teacherIds.length) {
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", teacherIds);
    for (const p of profiles ?? []) teacherNames.set(p.id, p.full_name);
  }

  const className = new Map((classes ?? []).map((c) => [c.id as string, c.name as string]));
  const spaceInfo = new Map(
    (spaces ?? []).map((s: any) => [s.id as string, { name: s.name as string, subject: (s.subjects?.name ?? null) as string | null }])
  );

  const rows: TimetableRow[] = entries.map((e) => ({
    id: e.id,
    class_id: e.class_id,
    class_name: className.get(e.class_id) ?? "",
    space_id: e.space_id,
    space_name: spaceInfo.get(e.space_id)?.name ?? "",
    subject_name: spaceInfo.get(e.space_id)?.subject ?? null,
    teacher_id: e.teacher_id,
    teacher_name: e.teacher_id ? teacherNames.get(e.teacher_id) ?? null : null,
    weekday: e.weekday,
    period_number: e.period_number,
    room: e.room,
  }));

  return { periods, rows };
}

// ---------- Bell schedule (admin) ----------

export async function saveTimetablePeriod(input: {
  periodNumber: number;
  label?: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can change the bell schedule.");

  if (!Number.isInteger(input.periodNumber) || input.periodNumber < 1) {
    throw new Error("Period number must be a whole number, 1 or higher.");
  }
  if (!isValidTime(input.startTime) || !isValidTime(input.endTime)) {
    throw new Error("Enter start and end times as HH:MM.");
  }
  if (input.startTime >= input.endTime) throw new Error("End time must be after start time.");

  const supabase = createClient();
  const { data: existing } = await supabase.from("timetable_periods").select("*");
  const overlap = findOverlappingPeriod((existing ?? []) as Period[], {
    period_number: input.periodNumber,
    start_time: input.startTime,
    end_time: input.endTime,
  });
  if (overlap) {
    throw new Error(
      `That overlaps period ${overlap.period_number} (${formatTime(overlap.start_time)}–${formatTime(overlap.end_time)}).`
    );
  }

  if (input.isBreak) {
    const { count } = await supabase
      .from("timetable_entries")
      .select("id", { count: "exact", head: true })
      .eq("period_number", input.periodNumber);
    if (count && count > 0) {
      throw new Error("This period already has lessons. Remove them before marking it as a break.");
    }
  }

  const { error } = await supabase.from("timetable_periods").upsert(
    {
      period_number: input.periodNumber,
      label: input.label?.trim() || null,
      start_time: input.startTime,
      end_time: input.endTime,
      is_break: input.isBreak,
    },
    { onConflict: "period_number" }
  );
  if (error) throwDbError(error);

  await writeAuditLog({
    actorId: admin_.id,
    action: "timetable.period_save",
    targetType: "timetable_period",
    metadata: { periodNumber: input.periodNumber, isBreak: input.isBreak },
  });
  revalidateTimetable();
}

export async function deleteTimetablePeriod(periodNumber: number) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can change the bell schedule.");
  const supabase = createClient();
  const { error } = await supabase.from("timetable_periods").delete().eq("period_number", periodNumber);
  if (error) throwDbError(error);

  await writeAuditLog({
    actorId: admin_.id,
    action: "timetable.period_delete",
    targetType: "timetable_period",
    metadata: { periodNumber },
  });
  revalidateTimetable();
}

export async function saveSchoolTimeZone(timeZone: string) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can change the school time zone.");
  const tz = timeZone.trim();
  if (!isValidTimeZone(tz)) throw new Error("That isn't a valid time zone. Try something like Africa/Lagos.");

  const supabase = createClient();
  const { error } = await supabase.from("settings").update({ timezone: tz }).eq("id", true);
  if (error) throwDbError(error);

  await writeAuditLog({ actorId: admin_.id, action: "timetable.timezone_save", targetType: "settings", metadata: { timeZone: tz } });
  revalidateTimetable();
}

// ---------- Lessons (admin) ----------

export async function setTimetableEntry(input: {
  classId: string;
  weekday: number;
  periodNumber: number;
  spaceId: string;
  teacherId?: string | null;
  room?: string | null;
}) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can edit the timetable.");
  const supabase = createClient();

  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    throw new Error("Weekday must be 1 (Mon) through 7 (Sun).");
  }
  const room = input.room?.trim() || null;
  if (room && room.length > 40) throw new Error("Keep the room name under 40 characters.");

  const { data: period } = await supabase
    .from("timetable_periods")
    .select("period_number, is_break")
    .eq("period_number", input.periodNumber)
    .maybeSingle();
  if (!period) throw new Error("That period doesn't exist. Add it to the bell schedule first.");
  if (period.is_break) throw new Error("That period is a break, so it can't hold a lesson.");

  // These pre-checks exist to give a specific message; the schema enforces
  // every one of them again (composite FK, guard trigger, unique indexes),
  // so a race can't produce a bad row, only a less friendly error.
  const { data: space } = await supabase.from("spaces").select("id, class_id").eq("id", input.spaceId).maybeSingle();
  if (!space) throw new Error("That space doesn't exist.");
  if (space.class_id !== input.classId) {
    throw new Error("That space isn't linked to this class. Link it from the space's settings first.");
  }

  const teacherId = input.teacherId || null;
  if (teacherId) {
    const { data: member } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", input.spaceId)
      .eq("profile_id", teacherId)
      .maybeSingle();
    if (!member || !["teacher", "admin"].includes(member.role)) {
      throw new Error("That person isn't a teacher in this space. Add them to the space first.");
    }

    const { data: clash } = await supabase
      .from("timetable_entries")
      .select("class_id")
      .eq("teacher_id", teacherId)
      .eq("weekday", input.weekday)
      .eq("period_number", input.periodNumber)
      .neq("class_id", input.classId)
      .maybeSingle();
    if (clash) {
      const [{ data: otherClass }, { data: teacher }] = await Promise.all([
        supabase.from("classes").select("name").eq("id", clash.class_id).maybeSingle(),
        createAdminClient().from("profiles").select("full_name").eq("id", teacherId).maybeSingle(),
      ]);
      throw new Error(
        `${teacher?.full_name ?? "That teacher"} is already teaching ${otherClass?.name ?? "another class"} in period ${input.periodNumber} on ${weekdayLabel(input.weekday)}.`
      );
    }
  }

  const { data: saved, error } = await supabase
    .from("timetable_entries")
    .upsert(
      {
        class_id: input.classId,
        space_id: input.spaceId,
        weekday: input.weekday,
        period_number: input.periodNumber,
        teacher_id: teacherId,
        room,
      },
      { onConflict: "class_id,weekday,period_number" }
    )
    .select("id")
    .single();
  if (error) throwDbError(error);

  await writeAuditLog({
    actorId: admin_.id,
    action: "timetable.entry_set",
    targetType: "timetable_entry",
    targetId: saved!.id,
    metadata: { classId: input.classId, weekday: input.weekday, periodNumber: input.periodNumber, spaceId: input.spaceId },
  });
  revalidateTimetable(input.classId);
}

export async function clearTimetableEntry(entryId: string, classId: string) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can edit the timetable.");
  const supabase = createClient();
  const { error } = await supabase.from("timetable_entries").delete().eq("id", entryId);
  if (error) throwDbError(error);

  await writeAuditLog({ actorId: admin_.id, action: "timetable.entry_clear", targetType: "timetable_entry", targetId: entryId });
  revalidateTimetable(classId);
}
