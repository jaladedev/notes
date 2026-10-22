// Pure helpers around the subscription_status() RPC (0036). No React, no
// Supabase client, so middleware (edge) and server components can share it.

export type SubscriptionState = "off" | "active" | "upcoming" | "expired";

export type SubscriptionStatus = {
  state: SubscriptionState;
  academicYear: string | null;
  startsOn: string | null; // YYYY-MM-DD
  endsOn: string | null; // YYYY-MM-DD
  daysLeft: number | null;
};

/** Admins see a renewal warning when this many days or fewer remain. */
export const RENEWAL_WARNING_DAYS = 14;

const STATES: SubscriptionState[] = ["off", "active", "upcoming", "expired"];

/**
 * Normalises whatever the RPC returned (a one-row array, a bare row, or
 * nothing). Anything unrecognised becomes null, and callers treat null as
 * "could not tell" and let the request through -- a failed lookup must not
 * lock a whole school out.
 */
export function parseSubscriptionStatus(raw: unknown): SubscriptionStatus | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.state !== "string" || !STATES.includes(r.state as SubscriptionState)) return null;
  return {
    state: r.state as SubscriptionState,
    academicYear: typeof r.academic_year === "string" ? r.academic_year : null,
    startsOn: typeof r.starts_on === "string" ? r.starts_on : null,
    endsOn: typeof r.ends_on === "string" ? r.ends_on : null,
    daysLeft: typeof r.days_left === "number" ? r.days_left : null,
  };
}

/** True when the school should be locked out of /dashboard. */
export function isLockedOut(status: SubscriptionStatus | null): boolean {
  return status?.state === "expired" || status?.state === "upcoming";
}

export function shouldWarnAdmin(status: SubscriptionStatus | null): boolean {
  return status?.state === "active" && status.daysLeft !== null && status.daysLeft <= RENEWAL_WARNING_DAYS;
}

/** "31 July 2027" from "2027-07-31". Parsed by hand: no time zone shift. */
export function formatSubscriptionDate(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = months[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** Why the school is locked out, for the /subscription-expired page. */
export function lockoutMessage(status: SubscriptionStatus | null): string {
  const session = status?.academicYear ? ` for the ${status.academicYear} session` : "";
  if (status?.state === "upcoming") {
    return `This school's subscription${session} starts on ${formatSubscriptionDate(status.startsOn)}.`;
  }
  if (status?.state === "expired") {
    return `This school's subscription${session} ended on ${formatSubscriptionDate(status.endsOn)}.`;
  }
  return "This school's subscription is not active.";
}

export function renewalWarning(status: SubscriptionStatus): string {
  const when =
    status.daysLeft === 0 ? "today" : status.daysLeft === 1 ? "tomorrow" : `in ${status.daysLeft} days`;
  return `Your ${status.academicYear ?? "current"} subscription ends ${when} (${formatSubscriptionDate(status.endsOn)}). Renew to keep access for teachers, students and parents.`;
}
