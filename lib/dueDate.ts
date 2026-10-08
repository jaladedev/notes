/**
 * Homework due dates must be on a *later calendar day* than today -- not in
 * the past, and not later today. "Today" is judged in the school's time zone
 * (settings.timezone), not the server's: Vercel runs in UTC, so around
 * midnight in Lagos the server's idea of "today" is a day behind.
 *
 * Returns a message for the teacher, or null when the date is acceptable.
 */
export function validateDueDate(dueAtIso: string, now: Date, timeZone: string): string | null {
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return "That due date isn't valid.";

  // en-CA formats as YYYY-MM-DD, which compares correctly as a string.
  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const dueDay = dayOf(due);
  const today = dayOf(now);
  if (dueDay < today) return "The due date can't be in the past. Choose tomorrow or later.";
  if (dueDay === today) return "The due date can't be today. Choose tomorrow or later.";
  return null;
}

/** The earliest allowed due date as a datetime-local value ("YYYY-MM-DDT00:00"), in the browser's zone. */
export function earliestDueInputValue(now: Date = new Date()): string {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T00:00`;
}
