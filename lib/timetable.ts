// Pure helpers for the school timetable (0011). No React, no Supabase,
// no server-only imports, so it's importable from server components,
// client components and unit tests alike.

export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
] as const;

export const DEFAULT_TIME_ZONE = "Africa/Lagos";

export type Period = {
  period_number: number;
  label: string | null;
  start_time: string; // "HH:MM:SS" (Postgres `time`)
  end_time: string;
  is_break: boolean;
};

/** One lesson: a class, in a weekday+period cell, taught from one space. */
export type TimetableRow = {
  id: string;
  class_id: string;
  class_name: string;
  space_id: string;
  space_name: string;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  weekday: number;
  period_number: number;
  room: string | null;
};

export function weekdayLabel(weekday: number, form: "short" | "long" = "long"): string {
  return WEEKDAYS.find((w) => w.value === weekday)?.[form] ?? `Day ${weekday}`;
}

/** "HH:MM" or "HH:MM:SS" -> seconds since midnight. */
export function timeToSeconds(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + (m || 0) * 60 + (s || 0);
}

/** "08:00:00" -> "08:00". */
export function formatTime(hms: string): string {
  return hms.slice(0, 5);
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

/** The period (other than `candidate` itself) whose time range overlaps it, if any. */
export function findOverlappingPeriod(
  periods: Pick<Period, "period_number" | "start_time" | "end_time">[],
  candidate: Pick<Period, "period_number" | "start_time" | "end_time">
): Period | undefined {
  const cs = timeToSeconds(candidate.start_time);
  const ce = timeToSeconds(candidate.end_time);
  return periods.find(
    (p) =>
      p.period_number !== candidate.period_number &&
      timeToSeconds(p.start_time) < ce &&
      cs < timeToSeconds(p.end_time)
  ) as Period | undefined;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_BY_SHORT: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * What weekday (1=Mon..7=Sun) and time of day it is in `timeZone`, for a
 * given instant. The server (often UTC) and the browser (whatever the
 * device says) can disagree with the school about both, so everything
 * that asks "is it period 3 yet?" goes through here with the school's zone.
 */
export function nowInZone(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): { weekday: number; seconds: number } {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    weekday: WEEKDAY_BY_SHORT[get("weekday")] ?? 1,
    seconds: Number(get("hour")) * 3600 + Number(get("minute")) * 60 + Number(get("second")),
  };
}

export function cellKey(weekday: number, periodNumber: number): string {
  return `${weekday}:${periodNumber}`;
}

export function buildCellMap(rows: TimetableRow[]): Map<string, TimetableRow[]> {
  const map = new Map<string, TimetableRow[]>();
  for (const row of rows) {
    const key = cellKey(row.weekday, row.period_number);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Mon-Fri always; Saturday/Sunday only when asked for or actually used. */
export function visibleWeekdays(rows: TimetableRow[], showSaturday = false): number[] {
  const days = [1, 2, 3, 4, 5];
  if (showSaturday || rows.some((r) => r.weekday === 6)) days.push(6);
  if (rows.some((r) => r.weekday === 7)) days.push(7);
  return days;
}

export function sortPeriods<T extends Pick<Period, "start_time" | "period_number">>(periods: T[]): T[] {
  return [...periods].sort(
    (a, b) => timeToSeconds(a.start_time) - timeToSeconds(b.start_time) || a.period_number - b.period_number
  );
}

/** Shape the bell timer wants, for one teacher's lessons on one weekday. */
export function toBellEntries(rows: TimetableRow[], periods: Period[], weekday: number) {
  const byNumber = new Map(periods.map((p) => [p.period_number, p]));
  return rows
    .filter((r) => r.weekday === weekday)
    .flatMap((r) => {
      const period = byNumber.get(r.period_number);
      if (!period || period.is_break) return [];
      return [
        {
          id: r.id,
          periodNumber: r.period_number,
          startTime: period.start_time,
          endTime: period.end_time,
          subjectName: r.subject_name ?? r.space_name,
          className: r.class_name,
        },
      ];
    })
    .sort((a, b) => timeToSeconds(a.startTime) - timeToSeconds(b.startTime));
}
