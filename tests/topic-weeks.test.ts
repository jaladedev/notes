import { describe, expect, it } from "vitest";
import { cleanTheme, formatWeekRange, groupByTheme, normalizeWeekRange, validateWeekRange } from "@/lib/topicWeeks";

describe("validateWeekRange", () => {
  it("accepts no weeks, a start only, and a proper range", () => {
    expect(validateWeekRange(undefined, undefined)).toBeNull();
    expect(validateWeekRange(2, undefined)).toBeNull();
    expect(validateWeekRange(2, 2)).toBeNull();
    expect(validateWeekRange(2, 3)).toBeNull();
  });
  it("rejects an end before the start", () => {
    expect(validateWeekRange(3, 2)).toMatch(/before the start/);
  });
  it("rejects an end week with no start week (the database would too)", () => {
    expect(validateWeekRange(null, 3)).toMatch(/start week/);
  });
  it("rejects zero, negative and fractional weeks", () => {
    expect(validateWeekRange(0, undefined)).toMatch(/start week/);
    expect(validateWeekRange(2, 0)).toMatch(/end week/);
    expect(validateWeekRange(1.5, undefined)).toMatch(/whole number/);
  });
});

describe("normalizeWeekRange", () => {
  it("makes a start-only topic a single-week span", () => {
    expect(normalizeWeekRange(4, undefined)).toEqual({ week_number: 4, week_end_number: 4 });
  });
  it("keeps an explicit range", () => {
    expect(normalizeWeekRange(2, 3)).toEqual({ week_number: 2, week_end_number: 3 });
  });
  it("leaves a weekless topic weekless", () => {
    expect(normalizeWeekRange(undefined, undefined)).toEqual({ week_number: null, week_end_number: null });
    expect(normalizeWeekRange(null, null)).toEqual({ week_number: null, week_end_number: null });
  });
});

describe("formatWeekRange", () => {
  it("formats single weeks, ranges and none", () => {
    expect(formatWeekRange(2, 2)).toBe("Week 2");
    expect(formatWeekRange(2, null)).toBe("Week 2");
    expect(formatWeekRange(2, 3)).toBe("Weeks 2–3");
    expect(formatWeekRange(null, null)).toBeNull();
  });
});

describe("cleanTheme", () => {
  it("trims and turns blank into null", () => {
    expect(cleanTheme("  Algebra ")).toBe("Algebra");
    expect(cleanTheme("   ")).toBeNull();
    expect(cleanTheme(null)).toBeNull();
  });
});

describe("groupByTheme", () => {
  it("groups by theme in first-seen order, themeless last", () => {
    const groups = groupByTheme([
      { id: 1, theme: "Number and Numeration" },
      { id: 2, theme: null },
      { id: 3, theme: "Algebra" },
      { id: 4, theme: "Number and Numeration" },
    ]);
    expect(groups.map((g) => g.theme)).toEqual(["Number and Numeration", "Algebra", null]);
    expect(groups[0].topics.map((t) => t.id)).toEqual([1, 4]);
  });
  it("merges spelling/spacing variants under the first spelling", () => {
    const groups = groupByTheme([
      { id: 1, theme: "Number and Numeration" },
      { id: 2, theme: "  number   and numeration " },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].theme).toBe("Number and Numeration");
  });
  it("treats blank themes as no theme", () => {
    expect(groupByTheme([{ id: 1, theme: "  " }])).toEqual([{ theme: null, topics: [{ id: 1, theme: "  " }] }]);
  });
});
