import { describe, expect, it } from "vitest";
import {
  hasIncomingFromOthers,
  mergeMessages,
  newlyArrived,
  nextPollDelay,
  pollCursor,
  type PolledMessage,
} from "@/lib/messagePolling";

const msg = (id: string, created_at: string, sender_id = "u1", body = id): PolledMessage => ({
  id,
  sender_id,
  body,
  created_at,
});

describe("mergeMessages", () => {
  it("returns the same array when nothing was polled", () => {
    const current = [msg("a", "2026-01-01T00:00:01Z")];
    expect(mergeMessages(current, [])).toBe(current);
  });

  it("de-duplicates rows the >= cursor query re-returns", () => {
    const current = [msg("a", "2026-01-01T00:00:01Z")];
    expect(mergeMessages(current, [msg("a", "2026-01-01T00:00:01Z")])).toBe(current);
  });

  it("appends new rows in chronological order", () => {
    const current = [msg("a", "2026-01-01T00:00:01Z")];
    const merged = mergeMessages(current, [
      msg("c", "2026-01-01T00:00:03Z"),
      msg("b", "2026-01-01T00:00:02Z"),
    ]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks timestamp ties by id so order is stable", () => {
    const merged = mergeMessages([], [msg("b", "2026-01-01T00:00:01Z"), msg("a", "2026-01-01T00:00:01Z")]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("pollCursor", () => {
  it("is null for an empty thread", () => {
    expect(pollCursor([])).toBeNull();
  });
  it("is the newest created_at regardless of array order", () => {
    expect(
      pollCursor([msg("b", "2026-01-01T00:00:02Z"), msg("a", "2026-01-01T00:00:01Z")])
    ).toBe("2026-01-01T00:00:02Z");
  });
});

describe("newlyArrived / hasIncomingFromOthers", () => {
  const mine = msg("a", "2026-01-01T00:00:01Z", "me");
  const theirs = msg("b", "2026-01-01T00:00:02Z", "them");

  it("lists only rows not already shown", () => {
    expect(newlyArrived([mine], [mine, theirs])).toEqual([theirs]);
  });
  it("flags messages from other people only", () => {
    expect(hasIncomingFromOthers([mine], "me")).toBe(false);
    expect(hasIncomingFromOthers([mine, theirs], "me")).toBe(true);
  });
});

describe("nextPollDelay", () => {
  it("uses the base interval while healthy", () => {
    expect(nextPollDelay(4000, 0)).toBe(4000);
  });
  it("doubles per failure and caps at 4x", () => {
    expect(nextPollDelay(4000, 1)).toBe(8000);
    expect(nextPollDelay(4000, 2)).toBe(16000);
    expect(nextPollDelay(4000, 9)).toBe(16000);
  });
});
