import Link from "next/link";
import { getParentDigest } from "@/lib/actions/parent";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getDueStatus, DUE_STATUS_STYLES, DUE_STATUS_LABELS } from "@/lib/dueStatus";

export default async function ParentDashboardPage() {
  const children = await getParentDigest();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "My children" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">My children</h1>

      {children.length === 0 && (
        <p className="text-sm text-ink-soft">
          No children are linked to your account yet. Ask an admin to link them.
        </p>
      )}

      <div className="space-y-6">
        {children.map((child) => (
          <section key={child.id} className="rounded-xl border border-rule bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{child.fullName}</h2>
              <span className="text-xs text-ink-soft">
                {child.notesReadLast7Days} topic{child.notesReadLast7Days === 1 ? "" : "s"} read this week
              </span>
            </div>

            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
                Upcoming homework
              </h3>
              {child.upcomingHomework.length === 0 ? (
                <p className="text-sm text-ink-soft">Nothing outstanding.</p>
              ) : (
                <ul className="space-y-1.5">
                  {child.upcomingHomework.map((hw) => {
                    const status = getDueStatus(hw.dueAt, false);
                    return (
                      <li key={hw.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-ink">{hw.title}</span>
                        <span className="flex items-center gap-2">
                          {status !== "none" && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DUE_STATUS_STYLES[status]}`}>
                              {DUE_STATUS_LABELS[status]}
                            </span>
                          )}
                          {hw.dueAt && (
                            <span className="text-xs text-ink-soft">
                              {new Date(hw.dueAt).toLocaleDateString()}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">Recent grades</h3>
              {child.recentGrades.length === 0 ? (
                <p className="text-sm text-ink-soft">No graded work yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {child.recentGrades.map((g, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-ink">{g.homeworkTitle}</span>
                        <span className="font-medium text-ink">{g.grade}</span>
                      </div>
                      {g.feedback && <p className="text-xs text-ink-soft">{g.feedback}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/messages" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Messages</Link>
        <Link href="/dashboard/announcements" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Announcements</Link>
        <Link href="/dashboard/timetable" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Timetable</Link>
        <Link href="/dashboard/search" className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold">Search</Link>
      </div>
    </div>
  );
}
