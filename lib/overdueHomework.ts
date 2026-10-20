// Pure helpers for the overdue-homework alerts. The queries live in
// lib/actions/homeworkAlerts.ts; everything here is plain data in, data out.

export type SubmissionStub = { student_id: string; submitted_at: string };

/** Whole days past the due date, rounded up, so something due 2 hours ago reads "1 day". 0 if not yet due. */
export function daysOverdue(dueAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(dueAt).getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function isOverdue(dueAt: string | null | undefined, now: Date = new Date()): boolean {
  return Boolean(dueAt) && new Date(dueAt as string).getTime() < now.getTime();
}

export type OverdueSummary = {
  submitted: number;
  /** Students expected to hand in (everyone in the topic's level). */
  expected: number;
  /** Submissions that arrived after the deadline. */
  late: number;
  /** Expected students with nothing handed in yet; never negative. */
  outstanding: number;
};

/**
 * Staff-facing counts for one overdue homework. Only the earliest submission
 * per student counts (submissions are final, but be defensive about
 * duplicates), and a student outside the expected cohort who submitted
 * anyway doesn't push `outstanding` below zero.
 */
export function summarizeSubmissions(
  dueAt: string,
  submissions: SubmissionStub[],
  expected: number
): OverdueSummary {
  const earliest = new Map<string, string>();
  for (const s of submissions) {
    const prev = earliest.get(s.student_id);
    if (!prev || s.submitted_at < prev) earliest.set(s.student_id, s.submitted_at);
  }
  const dueMs = new Date(dueAt).getTime();
  let late = 0;
  for (const at of earliest.values()) if (new Date(at).getTime() > dueMs) late += 1;
  const submitted = earliest.size;
  return { submitted, expected, late, outstanding: Math.max(0, expected - submitted) };
}

/** "3 days overdue", "1 day overdue". */
export function overdueLabel(dueAt: string, now: Date = new Date()): string {
  const d = daysOverdue(dueAt, now);
  return `${d} ${d === 1 ? "day" : "days"} overdue`;
}

/** "12 of 30 submitted · 2 late · 18 outstanding" */
export function describeSummary(s: OverdueSummary): string {
  const parts = [`${s.submitted} of ${s.expected} submitted`];
  if (s.late > 0) parts.push(`${s.late} late`);
  if (s.outstanding > 0) parts.push(`${s.outstanding} outstanding`);
  return parts.join(" · ");
}
