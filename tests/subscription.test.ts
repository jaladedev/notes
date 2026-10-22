import { describe, expect, it } from "vitest";
import {
  formatSubscriptionDate,
  isLockedOut,
  lockoutMessage,
  parseSubscriptionStatus,
  renewalWarning,
  shouldWarnAdmin,
  type SubscriptionStatus,
} from "@/lib/subscription";

const active = (daysLeft: number): SubscriptionStatus => ({
  state: "active",
  academicYear: "2026/2027",
  startsOn: "2026-09-01",
  endsOn: "2027-07-31",
  daysLeft,
});

describe("parseSubscriptionStatus", () => {
  it("reads the one-row array the RPC returns", () => {
    expect(
      parseSubscriptionStatus([
        { state: "active", academic_year: "2026/2027", starts_on: "2026-09-01", ends_on: "2027-07-31", days_left: 12 },
      ])
    ).toEqual({ state: "active", academicYear: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-07-31", daysLeft: 12 });
  });
  it("accepts a bare row and null fields", () => {
    expect(parseSubscriptionStatus({ state: "off", academic_year: null, starts_on: null, ends_on: null, days_left: null })).toEqual({
      state: "off", academicYear: null, startsOn: null, endsOn: null, daysLeft: null,
    });
  });
  it("returns null for empty, malformed or unknown-state data", () => {
    expect(parseSubscriptionStatus(null)).toBeNull();
    expect(parseSubscriptionStatus([])).toBeNull();
    expect(parseSubscriptionStatus("active")).toBeNull();
    expect(parseSubscriptionStatus([{ state: "paid" }])).toBeNull();
  });
});

describe("isLockedOut", () => {
  it("locks only expired and upcoming", () => {
    expect(isLockedOut({ ...active(5), state: "expired", daysLeft: null })).toBe(true);
    expect(isLockedOut({ ...active(5), state: "upcoming", daysLeft: null })).toBe(true);
    expect(isLockedOut(active(5))).toBe(false);
    expect(isLockedOut({ ...active(5), state: "off", daysLeft: null })).toBe(false);
  });
  it("fails open when the status could not be read", () => {
    expect(isLockedOut(null)).toBe(false);
  });
});

describe("shouldWarnAdmin", () => {
  it("warns at 14 days or fewer, including the last day", () => {
    expect(shouldWarnAdmin(active(14))).toBe(true);
    expect(shouldWarnAdmin(active(0))).toBe(true);
  });
  it("stays quiet with more time left, or when not active", () => {
    expect(shouldWarnAdmin(active(15))).toBe(false);
    expect(shouldWarnAdmin({ ...active(3), state: "expired", daysLeft: null })).toBe(false);
    expect(shouldWarnAdmin(null)).toBe(false);
  });
});

describe("messages", () => {
  it("formats dates without a time zone shift", () => {
    expect(formatSubscriptionDate("2027-07-31")).toBe("31 July 2027");
    expect(formatSubscriptionDate("2026-01-01")).toBe("1 January 2026");
    expect(formatSubscriptionDate(null)).toBe("");
  });
  it("explains an expired and an upcoming lockout", () => {
    expect(lockoutMessage({ ...active(0), state: "expired", daysLeft: null })).toBe(
      "This school's subscription for the 2026/2027 session ended on 31 July 2027."
    );
    expect(lockoutMessage({ ...active(0), state: "upcoming", daysLeft: null })).toBe(
      "This school's subscription for the 2026/2027 session starts on 1 September 2026."
    );
  });
  it("words the renewal warning by days left", () => {
    expect(renewalWarning(active(0))).toContain("ends today");
    expect(renewalWarning(active(1))).toContain("ends tomorrow");
    expect(renewalWarning(active(9))).toContain("ends in 9 days");
  });
});
