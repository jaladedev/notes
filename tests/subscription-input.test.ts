import { describe, expect, it } from "vitest";
import { validateSubscriptionInput } from "@/lib/subscriptionInput";

const good = { academicYear: " 2026/2027 ", startsOn: "2026-09-01", endsOn: "2027-07-31", note: " Paid " };

describe("validateSubscriptionInput", () => {
  it("accepts and trims a good input", () => {
    expect(validateSubscriptionInput(good)).toEqual({
      ok: true,
      value: { academicYear: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-07-31", note: "Paid", graceDays: null },
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

describe("graceDays", () => {
  it("is optional (null lets the database default apply)", () => {
    expect(validateSubscriptionInput({ ...good, graceDays: undefined })).toMatchObject({ ok: true, value: { graceDays: null } });
    expect(validateSubscriptionInput({ ...good, graceDays: null })).toMatchObject({ ok: true, value: { graceDays: null } });
  });
  it("accepts whole numbers from 0 to 60", () => {
    expect(validateSubscriptionInput({ ...good, graceDays: 0 })).toMatchObject({ ok: true, value: { graceDays: 0 } });
    expect(validateSubscriptionInput({ ...good, graceDays: 14 })).toMatchObject({ ok: true, value: { graceDays: 14 } });
    expect(validateSubscriptionInput({ ...good, graceDays: 60 })).toMatchObject({ ok: true, value: { graceDays: 60 } });
  });
  it("rejects out-of-range, fractional and non-numeric values", () => {
    for (const bad of [-1, 61, 1.5, "7", NaN, Infinity]) {
      expect(validateSubscriptionInput({ ...good, graceDays: bad }).ok).toBe(false);
    }
  });
});

