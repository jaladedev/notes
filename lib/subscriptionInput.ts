// Validation for a subscription row coming from outside (the platform API).
// Mirrors the table's own checks in 0036 so callers get a readable 400
// instead of a raw constraint error.

export type SubscriptionInput = {
  academicYear: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
  /** null = let the database default (7) apply. */
  graceDays: number | null;
};

export const MAX_GRACE_DAYS = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function validateSubscriptionInput(
  raw: unknown
): { ok: true; value: SubscriptionInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Body must be an object." };
  const r = raw as Record<string, unknown>;

  const academicYear = typeof r.academicYear === "string" ? r.academicYear.trim() : "";
  if (academicYear.length < 1 || academicYear.length > 40) {
    return { ok: false, error: "academicYear must be 1-40 characters, e.g. 2026/2027." };
  }
  if (typeof r.startsOn !== "string" || !isRealDate(r.startsOn)) {
    return { ok: false, error: "startsOn must be a real date as YYYY-MM-DD." };
  }
  if (typeof r.endsOn !== "string" || !isRealDate(r.endsOn)) {
    return { ok: false, error: "endsOn must be a real date as YYYY-MM-DD." };
  }
  if (r.endsOn < r.startsOn) return { ok: false, error: "endsOn is before startsOn." };

  let note: string | null = null;
  if (r.note !== undefined && r.note !== null) {
    if (typeof r.note !== "string" || r.note.length > 500) return { ok: false, error: "note must be text up to 500 characters." };
    note = r.note.trim() || null;
  }

  let graceDays: number | null = null;
  if (r.graceDays !== undefined && r.graceDays !== null) {
    if (typeof r.graceDays !== "number" || !Number.isInteger(r.graceDays) || r.graceDays < 0 || r.graceDays > MAX_GRACE_DAYS) {
      return { ok: false, error: `graceDays must be a whole number from 0 to ${MAX_GRACE_DAYS}.` };
    }
    graceDays = r.graceDays;
  }
  return { ok: true, value: { academicYear, startsOn: r.startsOn, endsOn: r.endsOn, note, graceDays } };
}
