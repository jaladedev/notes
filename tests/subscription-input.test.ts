import { describe, expect, it } from "vitest";
import { validateSubscriptionInput } from "@/lib/subscriptionInput";

const good = { academicYear: " 2026/2027 ", startsOn: "2026-09-01", endsOn: "2027-07-31", note: " Paid " };

describe("validateSubscriptionInput", () => {
  it("accepts and trims a good input", () => {
    expect(validateSubscriptionInput(good)).toEqual({
      ok: true,
      value: { academicYear: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-07-31", note: "Paid" },
    });
  });
  it("treats a missing or blank note as null", () => {
    expect(validateSubscriptionInput({ ...good, note: undefined })).toMatchObject({ ok: true, value: { note: null } });
    expect(validateSubscriptionInput({ ...good, note: "   " })).toMatchObject({ ok: true, value: { note: null } });
  });
  it("rejects non-objects and a bad year", () => {
    expect(validateSubscriptionInput(null).ok).toBe(false);
    expect(validateSubscriptionInput("x").ok).toBe(false);
    expect(validateSubscriptionInput({ ...good, academicYear: "  " }).ok).toBe(false);
    expect(validateSubscriptionInput({ ...good, academicYear: "x".repeat(41) }).ok).toBe(false);
  });
  it("rejects malformed and impossible dates", () => {
    expect(validateSubscriptionInput({ ...good, startsOn: "1/9/2026" }).ok).toBe(false);
    expect(validateSubscriptionInput({ ...good, endsOn: "2027-02-30" }).ok).toBe(false);
    expect(validateSubscriptionInput({ ...good, startsOn: 20260901 }).ok).toBe(false);
  });
  it("rejects an end before the start but allows a one-day session", () => {
    expect(validateSubscriptionInput({ ...good, endsOn: "2026-08-31" })).toEqual({ ok: false, error: "endsOn is before startsOn." });
    expect(validateSubscriptionInput({ ...good, endsOn: "2026-09-01" }).ok).toBe(true);
  });
  it("rejects an oversized note", () => {
    expect(validateSubscriptionInput({ ...good, note: "x".repeat(501) }).ok).toBe(false);
  });
});
