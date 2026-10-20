import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso, quizWindowState } from "@/lib/quizWindow";

const at = (iso: string) => new Date(iso);

describe("quizWindowState", () => {
  const opens = "2026-08-03T08:00:00Z";
  const closes = "2026-08-03T10:00:00Z";
  it("is open with no window at all", () => {
    expect(quizWindowState(null, null, at("2030-01-01T00:00:00Z"))).toBe("open");
  });
  it("walks upcoming -> open -> closed", () => {
    expect(quizWindowState(opens, closes, at("2026-08-03T07:59:59Z"))).toBe("upcoming");
    expect(quizWindowState(opens, closes, at("2026-08-03T08:00:00Z"))).toBe("open");
    expect(quizWindowState(opens, closes, at("2026-08-03T10:00:00Z"))).toBe("open");
    expect(quizWindowState(opens, closes, at("2026-08-03T10:00:01Z"))).toBe("closed");
  });
  it("honours a grace period after closing", () => {
    expect(quizWindowState(opens, closes, at("2026-08-03T10:00:30Z"), 60_000)).toBe("open");
    expect(quizWindowState(opens, closes, at("2026-08-03T10:01:01Z"), 60_000)).toBe("closed");
  });
  it("supports open-ended windows", () => {
    expect(quizWindowState(opens, null, at("2099-01-01T00:00:00Z"))).toBe("open");
    expect(quizWindowState(null, closes, at("2026-08-03T11:00:00Z"))).toBe("closed");
  });
});

describe("local <-> UTC conversion", () => {
  it("reads a datetime-local value in the given zone (Lagos is UTC+1, no DST)", () => {
    expect(localInputToIso("2026-08-03T09:00", "Africa/Lagos")).toBe("2026-08-03T08:00:00.000Z");
  });
  it("handles a zone with DST on either side of the change", () => {
    expect(localInputToIso("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
    expect(localInputToIso("2026-12-01T09:00", "Europe/London")).toBe("2026-12-01T09:00:00.000Z");
  });
  it("round-trips", () => {
    const iso = localInputToIso("2026-08-03T09:30", "Africa/Lagos")!;
    expect(isoToLocalInput(iso, "Africa/Lagos")).toBe("2026-08-03T09:30");
  });
  it("returns null / empty for blank input", () => {
    expect(localInputToIso("", "Africa/Lagos")).toBeNull();
    expect(isoToLocalInput(null, "Africa/Lagos")).toBe("");
  });
});
