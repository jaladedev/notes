// Theme and week-range helpers for topics (0035). Pure.

/**
 * A message for the admin if the week range is invalid, else null.
 * `start` is topics.week_number (the week the topic is released); `end` is
 * week_end_number. Either may be undefined/null; an end with no start is
 * refused because the database would reject it too.
 */
export function validateWeekRange(start: number | null | undefined, end: number | null | undefined): string | null {
  const hasStart = start !== null && start !== undefined;
  const hasEnd = end !== null && end !== undefined;
  if (hasStart && (!Number.isInteger(start) || (start as number) < 1)) return "The start week must be a whole number, 1 or higher.";
  if (hasEnd && (!Number.isInteger(end) || (end as number) < 1)) return "The end week must be a whole number, 1 or higher.";
  if (hasEnd && !hasStart) return "Set a start week before setting an end week.";
  if (hasStart && hasEnd && (end as number) < (start as number)) return "The end week can't be before the start week.";
  return null;
}

/** What to store: a topic with a start week and no end is a single-week topic. */
export function normalizeWeekRange(
  start: number | null | undefined,
  end: number | null | undefined
): { week_number: number | null; week_end_number: number | null } {
  if (start === null || start === undefined) return { week_number: null, week_end_number: null };
  return { week_number: start, week_end_number: end ?? start };
}

/** "Week 2", "Weeks 2–3", or null for a topic with no week. */
export function formatWeekRange(start: number | null | undefined, end: number | null | undefined): string | null {
  if (start === null || start === undefined) return null;
  return end !== null && end !== undefined && end > start ? `Weeks ${start}–${end}` : `Week ${start}`;
}

/** Trims a theme; blank becomes null so it is stored as "no theme". */
export function cleanTheme(theme: string | null | undefined): string | null {
  const t = (theme ?? "").trim();
  return t ? t : null;
}

/** The longest a theme may be (matches topics_theme_length_check). */
export const MAX_THEME_LENGTH = 120;

/**
 * Groups topics under their theme, keeping first-seen order. Topics with
 * no theme go in a trailing group with `theme: null`. Case/space variants
 * of one theme ("number and numeration " vs "Number and Numeration") are
 * merged under the first spelling seen.
 */
export function groupByTheme<T extends { theme: string | null }>(topics: T[]): { theme: string | null; topics: T[] }[] {
  const groups = new Map<string, { theme: string | null; topics: T[] }>();
  const none: T[] = [];
  for (const t of topics) {
    const clean = cleanTheme(t.theme);
    if (!clean) {
      none.push(t);
      continue;
    }
    const key = clean.toLowerCase().replace(/\s+/g, " ");
    const existing = groups.get(key);
    if (existing) existing.topics.push(t);
    else groups.set(key, { theme: clean, topics: [t] });
  }
  const out = [...groups.values()];
  if (none.length) out.push({ theme: null, topics: none });
  return out;
}
