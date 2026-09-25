import { describe, expect, it } from "vitest";
import {
  buildCellMap,
  findOverlappingPeriod,
  formatTime,
  isValidTime,
  isValidTimeZone,
  nowInZone,
  sortPeriods,
  timeToSeconds,
  toBellEntries,
  visibleWeekdays,
  type Period,
  type TimetableRow,
} from "@/lib/timetable";

const p = (n: number, start: string, end: string, is_break = false): Period => ({
  period_number: n,
  label: null,
  start_time: start,
  end_time: end,
  is_break,
});

const row = (over: Partial<TimetableRow>): TimetableRow => ({
  id: "r1",
  class_id: "c1",
  class_name: "JSS1A",
  space_id: "s1",
  space_name: "JSS1A Basic Science",
  subject_name: "Basic Science",
  teacher_id: "t1",
  teacher_name: "Ms Ade",
  weekday: 1,
  period_number: 1,
  room: null,
  ...over,
});

describe("time helpers", () => {
  it("converts HH:MM and HH:MM:SS to seconds", () => {
    expect(timeToSeconds("08:00")).toBe(28800);
    expect(timeToSeconds("08:40:30")).toBe(31230);
  });
  it("formats and validates", () => {
    expect(formatTime("08:00:00")).toBe("08:00");
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("8:00")).toBe(false);
  });
  it("validates time zones", () => {
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("findOverlappingPeriod", () => {
  const existing = [p(1, "08:00", "08:40"), p(2, "08:40", "09:20")];
  it("allows back-to-back periods", () => {
    expect(findOverlappingPeriod(existing, p(3, "09:20", "10:00"))).toBeUndefined();
  });
  it("rejects a partial overlap", () => {
    expect(findOverlappingPeriod(existing, p(3, "08:30", "09:00"))?.period_number).toBe(1);
  });
  it("ignores the period being edited", () => {
    expect(findOverlappingPeriod(existing, p(1, "07:50", "08:40"))).toBeUndefined();
  });
});

describe("nowInZone", () => {
  it("uses the school's zone, not UTC, across midnight", () => {
    // Thu 2026-09-24 23:30 UTC is already Fri 00:30 in Lagos (UTC+1).
    const d = new Date("2026-09-24T23:30:00Z");
    expect(nowInZone(d, "UTC")).toEqual({ weekday: 4, seconds: 23 * 3600 + 30 * 60 });
    expect(nowInZone(d, "Africa/Lagos")).toEqual({ weekday: 5, seconds: 30 * 60 });
  });
  it("maps Sunday to 7 and falls back on a bad zone", () => {
    const sunday = new Date("2026-09-27T12:00:00Z");
    expect(nowInZone(sunday, "UTC").weekday).toBe(7);
    expect(nowInZone(sunday, "Not/AZone").weekday).toBe(7);
  });
});

describe("grid helpers", () => {
  it("groups rows into weekday:period cells", () => {
    const map = buildCellMap([row({}), row({ id: "r2", weekday: 2 })]);
    expect(map.get("1:1")?.length).toBe(1);
    expect(map.get("2:1")?.[0].id).toBe("r2");
    expect(map.has("3:1")).toBe(false);
  });
  it("shows Mon-Fri, and Saturday only when asked or used", () => {
    expect(visibleWeekdays([])).toEqual([1, 2, 3, 4, 5]);
    expect(visibleWeekdays([], true)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(visibleWeekdays([row({ weekday: 6 })])).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("orders periods by start time, then number", () => {
    const sorted = sortPeriods([p(3, "10:00", "10:40"), p(1, "08:00", "08:40"), p(2, "08:40", "09:20")]);
    expect(sorted.map((x) => x.period_number)).toEqual([1, 2, 3]);
  });
});

describe("toBellEntries", () => {
  const periods = [p(1, "08:00:00", "08:40:00"), p(2, "08:40:00", "09:20:00"), p(3, "09:20:00", "09:40:00", true)];
  it("keeps only the given weekday, sorted by time, with subject and class names", () => {
    const entries = toBellEntries(
      [
        row({ id: "b", weekday: 1, period_number: 2 }),
        row({ id: "a", weekday: 1, period_number: 1 }),
        row({ id: "x", weekday: 2, period_number: 1 }),
      ],
      periods,
      1
    );
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(entries[0]).toMatchObject({ startTime: "08:00:00", subjectName: "Basic Science", className: "JSS1A" });
  });
  it("falls back to the space name and skips breaks and unknown periods", () => {
    const entries = toBellEntries(
      [row({ subject_name: null, period_number: 1 }), row({ id: "brk", period_number: 3 }), row({ id: "ghost", period_number: 9 })],
      periods,
      1
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].subjectName).toBe("JSS1A Basic Science");
  });
});
