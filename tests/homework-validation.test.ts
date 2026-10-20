import { describe, expect, it } from "vitest";
import { validateHomework } from "@/lib/homeworkValidation";
import { daysOverdue, describeSummary, isOverdue, overdueLabel, summarizeSubmissions } from "@/lib/overdueHomework";

const TZ = "Africa/Lagos";
const now = new Date("2026-10-19T12:00:00Z"); // Monday noon in Lagos

describe("validateHomework", () => {
  it("accepts a title with no due date", () => {
    expect(validateHomework({ title: "Read ch.3" }, now, TZ)).toBeNull();
  });
  it("requires a non-blank title within the length limit", () => {
    expect(validateHomework({ title: "   " }, now, TZ)).toMatch(/title/);
    expect(validateHomework({ title: "x".repeat(201) }, now, TZ)).toMatch(/at most 200/);
  });
  it("limits instructions", () => {
    expect(validateHomework({ title: "t", instructions: "x".repeat(5001) }, now, TZ)).toMatch(/at most 5,000/);
  });
  it("requires a new due date to be tomorrow or later", () => {
    expect(validateHomework({ title: "t", dueAt: "2026-10-19T18:00:00Z" }, now, TZ)).toMatch(/today/);
    expect(validateHomework({ title: "t", dueAt: "2026-10-10T18:00:00Z" }, now, TZ)).toMatch(/past/);
    expect(validateHomework({ title: "t", dueAt: "2026-10-21T18:00:00Z" }, now, TZ)).toBeNull();
  });
  it("lets an edit keep its existing (now past) due date", () => {
    const past = "2026-10-10T18:00:00Z";
    expect(validateHomework({ title: "Fixed typo", dueAt: past }, now, TZ, past)).toBeNull();
    // ...but changing it to another past date is still refused
    expect(validateHomework({ title: "t", dueAt: "2026-10-11T18:00:00Z" }, now, TZ, past)).toMatch(/past/);
  });
});

describe("overdue helpers", () => {
  it("counts whole days, rounding up", () => {
    expect(daysOverdue("2026-10-19T10:00:00Z", now)).toBe(1);
    expect(daysOverdue("2026-10-17T12:00:00Z", now)).toBe(2);
    expect(daysOverdue("2026-10-17T11:59:00Z", now)).toBe(3);
    expect(daysOverdue("2026-10-20T12:00:00Z", now)).toBe(0);
  });
  it("knows what is overdue", () => {
    expect(isOverdue("2026-10-18T00:00:00Z", now)).toBe(true);
    expect(isOverdue("2026-10-20T00:00:00Z", now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
  it("labels singular and plural", () => {
    expect(overdueLabel("2026-10-19T10:00:00Z", now)).toBe("1 day overdue");
    expect(overdueLabel("2026-10-16T12:00:00Z", now)).toBe("3 days overdue");
  });
});

describe("summarizeSubmissions", () => {
  const due = "2026-10-15T12:00:00Z";
  it("counts submitted, late and outstanding", () => {
    const s = summarizeSubmissions(
      due,
      [
        { student_id: "a", submitted_at: "2026-10-14T10:00:00Z" },
        { student_id: "b", submitted_at: "2026-10-16T10:00:00Z" }, // late
      ],
      5
    );
    expect(s).toEqual({ submitted: 2, expected: 5, late: 1, outstanding: 3 });
    expect(describeSummary(s)).toBe("2 of 5 submitted · 1 late · 3 outstanding");
  });
  it("counts each student once, by their earliest submission", () => {
    const s = summarizeSubmissions(
      due,
      [
        { student_id: "a", submitted_at: "2026-10-16T10:00:00Z" },
        { student_id: "a", submitted_at: "2026-10-14T10:00:00Z" },
      ],
      1
    );
    expect(s).toMatchObject({ submitted: 1, late: 0, outstanding: 0 });
  });
  it("never reports negative outstanding", () => {
    const s = summarizeSubmissions(due, [{ student_id: "z", submitted_at: "2026-10-14T10:00:00Z" }], 0);
    expect(s.outstanding).toBe(0);
  });
  it("omits zero parts from the description", () => {
    expect(describeSummary({ submitted: 3, expected: 3, late: 0, outstanding: 0 })).toBe("3 of 3 submitted");
  });
});
