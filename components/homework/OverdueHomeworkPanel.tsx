// Overdue-homework alerts. Server components: the data comes from
// lib/actions/homeworkAlerts.ts. Renders nothing when there is nothing
// overdue, so a clean dashboard stays clean.

import Link from "next/link";
import type { StaffOverdueItem, StudentOverdueItem } from "@/lib/actions/homeworkAlerts";
import { describeSummary, overdueLabel } from "@/lib/overdueHomework";

export function StaffOverdueHomeworkPanel({ items }: { items: StaffOverdueItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Overdue homework" className="rounded-xl border border-clay/40 bg-clay/5 p-4">
      <h2 className="mb-2 font-display text-sm font-semibold text-ink">Overdue homework</h2>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.homeworkId} className="text-sm">
            <Link
              href={`/dashboard/teacher/notes/${it.topicId}/homework`}
              className="font-medium text-ink hover:underline"
            >
              {it.title}
            </Link>
            <span className="text-ink-soft"> · {it.topicTitle} · </span>
            <span className="text-clay">{overdueLabel(it.dueAt)}</span>
            <p className="text-xs text-ink-soft">{describeSummary(it.summary)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudentOverdueHomeworkPanel({ items }: { items: StudentOverdueItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Overdue homework" className="rounded-xl border border-clay/40 bg-clay/5 p-4">
      <h2 className="mb-2 font-display text-sm font-semibold text-ink">
        You have {items.length} overdue {items.length === 1 ? "homework" : "homeworks"}
      </h2>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.homeworkId} className="text-sm">
            <Link href={`/dashboard/student/topics/${it.topicId}/homework`} className="font-medium text-ink hover:underline">
              {it.title}
            </Link>
            <span className="text-ink-soft"> · {it.topicTitle} · </span>
            <span className="text-clay">{overdueLabel(it.dueAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
