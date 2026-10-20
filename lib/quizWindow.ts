// Open/close window helpers for scheduled quizzes. The database enforces
// the window (0026); this only decides what to *show* and lets pages avoid
// offering a Start button that will be refused.

export type QuizWindowState = "upcoming" | "open" | "closed";

/** Mirrors quiz_window_state() in 0026. `graceMs` lets an in-flight save land just after closing. */
export function quizWindowState(
  opensAt: string | null | undefined,
  closesAt: string | null | undefined,
  now: Date = new Date(),
  graceMs = 0
): QuizWindowState {
  const t = now.getTime();
  if (opensAt && t < Date.parse(opensAt)) return "upcoming";
  if (closesAt && t > Date.parse(closesAt) + graceMs) return "closed";
  return "open";
}

/** Short label for a list row, e.g. "Opens Mon 3 Aug, 9:00 am" or "Closed". */
export function describeQuizWindow(
  opensAt: string | null | undefined,
  closesAt: string | null | undefined,
  now: Date = new Date(),
  timeZone?: string
): string | null {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));

  switch (quizWindowState(opensAt, closesAt, now)) {
    case "upcoming":
      return `Opens ${fmt(opensAt as string)}`;
    case "closed":
      return "Closed";
    default:
      return closesAt ? `Closes ${fmt(closesAt)}` : null;
  }
}

/**
 * <input type="datetime-local"> values carry no zone. Converts one, read in
 * the given IANA zone, to a UTC ISO string -- so a teacher in Lagos
 * entering 09:00 stores 08:00Z regardless of the server's own zone.
 */
export function localInputToIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Find the zone's offset at that wall-clock time, then subtract it.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const zonedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offset = zonedAsUtc - asUtc;
  return new Date(asUtc - offset).toISOString();
}

/** Inverse of localInputToIso: a UTC ISO string to a datetime-local value in `timeZone`. */
export function isoToLocalInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
