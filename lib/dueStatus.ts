export type DueStatus = "overdue" | "due-soon" | "upcoming" | "none";

const DUE_SOON_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Classifies a due date relative to now, for badge styling. */
export function getDueStatus(dueAt: string | null, submitted: boolean): DueStatus {
  if (!dueAt) return "none";
  if (submitted) return "none";
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  if (due < now) return "overdue";
  if (due - now <= DUE_SOON_MS) return "due-soon";
  return "upcoming";
}

export const DUE_STATUS_STYLES: Record<Exclude<DueStatus, "none">, string> = {
  overdue: "bg-clay/10 text-clay",
  "due-soon": "bg-marigold/20 text-ink",
  upcoming: "bg-paper text-ink-soft",
};

export const DUE_STATUS_LABELS: Record<Exclude<DueStatus, "none">, string> = {
  overdue: "Overdue",
  "due-soon": "Due soon",
  upcoming: "Upcoming",
};
