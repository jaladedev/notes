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
import { toResult, type ActionResult } from "@/lib/actions/result";
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
    .select("id, class_id, subject_id, weekday, period_number, teacher_id, room");
  if (filter.classId) query = query.eq("class_id", filter.classId);
  if (filter.teacherId) query = query.eq("teacher_id", filter.teacherId);
  if (filter.weekday) query = query.eq("weekday", filter.weekday);
  const { data: entries, error: entryError } = await query;
  if (entryError) throwDbError(entryError);
  if (!entries || entries.length === 0) return { periods, rows: [] };

  const classIds = [...new Set(entries.map((e) => e.class_id as string))];
  const subjectIds = [...new Set(entries.map((e) => e.subject_id as string))];
  const teacherIds = [...new Set(entries.map((e) => e.teacher_id as string | null).filter((id): id is string => !!id))];

  const [{ data: classes }, { data: subjects }] = await Promise.all([
    supabase.from("classes").select("id, name").in("id", classIds),
    supabase.from("subjects").select("id, name").in("id", subjectIds),
  ]);

  const teacherNames = new Map<string, string>();
  if (teacherIds.length) {
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", teacherIds);
    for (const p of profiles ?? []) teacherNames.set(p.id, p.full_name);
  }

  const className = new Map((classes ?? []).map((c) => [c.id as string, c.name as string]));
  const subjectName = new Map((subjects ?? []).map((s) => [s.id as string, s.name as string]));

  const rows: TimetableRow[] = entries.map((e) => ({
    id: e.id,
    class_id: e.class_id,
    class_name: className.get(e.class_id) ?? "",
    subject_id: e.subject_id,
    subject_name: subjectName.get(e.subject_id) ?? null,
    teacher_id: e.teacher_id,
    teacher_name: e.teacher_id ? teacherNames.get(e.teacher_id) ?? null : null,
    weekday: e.weekday,
    period_number: e.period_number,
    room: e.room,
  }));

  return { periods, rows };
}

// ---------- Bell schedule (admin) ----------

export async function saveTimetablePeriod(
  ...args: Parameters<typeof saveTimetablePeriodImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof saveTimetablePeriodImpl>>>> {
  return toResult(() => saveTimetablePeriodImpl(...args));
}

async function saveTimetablePeriodImpl(input: {
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

export async function deleteTimetablePeriod(
  ...args: Parameters<typeof deleteTimetablePeriodImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteTimetablePeriodImpl>>>> {
  return toResult(() => deleteTimetablePeriodImpl(...args));
}

async function deleteTimetablePeriodImpl(periodNumber: number) {
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

export async function saveSchoolTimeZone(
  ...args: Parameters<typeof saveSchoolTimeZoneImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof saveSchoolTimeZoneImpl>>>> {
  return toResult(() => saveSchoolTimeZoneImpl(...args));
}

async function saveSchoolTimeZoneImpl(timeZone: string) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can change the school time zone.");
  const tz = timeZone.trim();
  if (!isValidTimeZone(tz)) throw new Error("That isn't a valid time zone. Try something like Africa/Lagos.");

  const supabase = createClient();
  const { error } = await supabase.from("settings").update({ timezone: tz }).eq("id", true);
  if (error) throwDbError(error);

  await writeAuditLog({ actorId: admin_.id, action: "timetable.timezone_save", targetType: "settings", metadata: { timeZone: tz } });
  revalidateTimetable();
}

export async function getTermWeekInfo(): Promise<{
  termStart: string | null;
  currentWeek: number | null;
  academicYear: string | null;
  term: number | null;
}> {
  await requireUser();
  const supabase = createClient();
  const [{ data: row }, { data: week }] = await Promise.all([
    supabase.from("settings").select("term_start_date, current_academic_year, current_term").maybeSingle(),
    supabase.rpc("current_school_week"),
  ]);
  const r = row as {
    term_start_date?: string | null;
    current_academic_year?: string | null;
    current_term?: number | null;
  } | null;
  return {
    termStart: r?.term_start_date ?? null,
    currentWeek: typeof week === "number" ? week : null,
    academicYear: r?.current_academic_year ?? null,
    term: r?.current_term ?? null,
  };
}

/** Set the current academic year (e.g. 2026/2027) and term (1-3), or both null to stop gating by year/term. */
export async function saveCurrentTerm(academicYear: string | null, term: number | null): Promise<ActionResult> {
  return toResult(async () => {
    const admin_ = await assertGlobalRole(["admin"], "Only an admin can change the current term.");
    const year = academicYear?.trim() || null;
    if ((year === null) !== (term === null)) {
      throw new Error("Set both the academic year and the term, or leave both empty.");
    }
    if (year && !/^\d{4}\/\d{4}$/.test(year)) {
      throw new Error("Academic year should look like 2026/2027.");
    }
    if (term !== null && ![1, 2, 3].includes(term)) throw new Error("Term must be 1, 2 or 3.");

    const supabase = createClient();
    const { error } = await supabase
      .from("settings")
      .update({ current_academic_year: year, current_term: term })
      .eq("id", true);
    if (error) throwDbError(error);

    await writeAuditLog({
      actorId: admin_.id,
      action: "settings.term_save",
      targetType: "settings",
      metadata: { academicYear: year, term },
    });
    revalidateTimetable();
    revalidatePath("/dashboard/student", "layout");
    return undefined;
  });
}

/** Set the date Week 1 starts (YYYY-MM-DD), or null to switch the week gate off. */
export async function saveTermStartDate(date: string | null): Promise<ActionResult> {
  return toResult(async () => {
    const admin_ = await assertGlobalRole(["admin"], "Only an admin can change the term start date.");
    const value = date?.trim() || null;
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) {
      throw new Error("That isn't a valid date.");
    }

    const supabase = createClient();
    const { error } = await supabase.from("settings").update({ term_start_date: value }).eq("id", true);
    if (error) throwDbError(error);

    await writeAuditLog({
      actorId: admin_.id,
      action: "settings.term_start_save",
      targetType: "settings",
      metadata: { termStart: value },
    });
    revalidateTimetable();
    revalidatePath("/dashboard/student", "layout");
    return undefined;
  });
}

// ---------- Lessons (admin) ----------

export async function setTimetableEntry(
  ...args: Parameters<typeof setTimetableEntryImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setTimetableEntryImpl>>>> {
  return toResult(() => setTimetableEntryImpl(...args));
}

async function setTimetableEntryImpl(input: {
  classId: string;
  weekday: number;
  periodNumber: number;
  subjectId: string;
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
  // every one of them again (guard trigger, unique indexes), so a race
  // can't produce a bad row, only a less friendly error.
  const { data: subject } = await supabase.from("subjects").select("id").eq("id", input.subjectId).maybeSingle();
  if (!subject) throw new Error("That subject doesn't exist.");

  const teacherId = input.teacherId || null;
  if (teacherId) {
    const { data: assignment } = await supabase
      .from("teacher_subjects")
      .select("role")
      .eq("subject_id", input.subjectId)
      .eq("profile_id", teacherId)
      .maybeSingle();
    if (!assignment) {
      throw new Error("That person isn't assigned to this subject. Assign them to the subject first.");
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
        subject_id: input.subjectId,
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
    metadata: { classId: input.classId, weekday: input.weekday, periodNumber: input.periodNumber, subjectId: input.subjectId },
  });
  revalidateTimetable(input.classId);
}

export async function clearTimetableEntry(
  ...args: Parameters<typeof clearTimetableEntryImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof clearTimetableEntryImpl>>>> {
  return toResult(() => clearTimetableEntryImpl(...args));
}

async function clearTimetableEntryImpl(entryId: string, classId: string) {
  const admin_ = await assertGlobalRole(["admin"], "Only an admin can edit the timetable.");
  const supabase = createClient();
  const { error } = await supabase.from("timetable_entries").delete().eq("id", entryId);
  if (error) throwDbError(error);

  await writeAuditLog({ actorId: admin_.id, action: "timetable.entry_clear", targetType: "timetable_entry", targetId: entryId });
  revalidateTimetable(classId);
}
