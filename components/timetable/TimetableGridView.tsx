// Weekly grid: periods down the side, weekdays across the top. Purely
// presentational (no hooks, no server imports) so the same component
// renders read-only on server pages and, with `onCellClick`, as the
// editable grid inside the admin editor's client component.

import {
  WEEKDAYS,
  buildCellMap,
  cellKey,
  formatTime,
  sortPeriods,
  visibleWeekdays,
  type Period,
  type TimetableRow,
} from "@/lib/timetable";

export function TimetableGridView({
  periods,
  rows,
  weekdays,
  showClass = false,
  onCellClick,
  selected,
}: {
  periods: Period[];
  rows: TimetableRow[];
  /** Defaults to Mon-Fri (plus Saturday/Sunday if any lesson uses them). */
  weekdays?: number[];
  /** Show the class name in each cell (teacher view) instead of the teacher. */
  showClass?: boolean;
  /** When set, empty and filled cells become buttons (admin editor). */
  onCellClick?: (weekday: number, periodNumber: number) => void;
  selected?: { weekday: number; periodNumber: number } | null;
}) {
  const days = weekdays ?? visibleWeekdays(rows);
  const cells = buildCellMap(rows);
  const ordered = sortPeriods(periods);

  if (ordered.length === 0) {
    return <p className="text-sm text-ink-soft">No periods have been set up yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-white">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="bg-paper text-left text-xs text-ink-soft">
            <th scope="col" className="w-28 border-b border-rule px-3 py-2 font-medium">
              Period
            </th>
            {days.map((d) => (
              <th key={d} scope="col" className="border-b border-l border-rule px-3 py-2 font-medium">
                {WEEKDAYS.find((w) => w.value === d)?.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map((period) => (
            <tr key={period.period_number} className={period.is_break ? "bg-paper" : undefined}>
              <th scope="row" className="border-b border-rule px-3 py-2 text-left align-top font-normal text-ink">
                <span className="block font-medium">{period.label || `Period ${period.period_number}`}</span>
                <span className="block text-xs text-ink-soft">
                  {formatTime(period.start_time)}–{formatTime(period.end_time)}
                </span>
              </th>
              {period.is_break ? (
                <td colSpan={days.length} className="border-b border-l border-rule px-3 py-2 text-xs text-ink-soft">
                  Break
                </td>
              ) : (
                days.map((d) => {
                  const lessons = cells.get(cellKey(d, period.period_number)) ?? [];
                  const isSelected = selected?.weekday === d && selected?.periodNumber === period.period_number;
                  const content =
                    lessons.length === 0 ? (
                      <span className="text-ink-soft">{onCellClick ? "Add lesson" : "—"}</span>
                    ) : (
                      lessons.map((l) => (
                        <span key={l.id} className="block">
                          <span className="block font-medium text-ink">{l.subject_name ?? l.space_name}</span>
                          <span className="block text-xs text-ink-soft">
                            {showClass ? l.class_name : (l.teacher_name ?? "No teacher")}
                            {l.room ? ` · ${l.room}` : ""}
                          </span>
                        </span>
                      ))
                    );

                  return (
                    <td
                      key={d}
                      className={`border-b border-l border-rule align-top ${isSelected ? "bg-marigold-soft" : ""}`}
                    >
                      {onCellClick ? (
                        <button
                          type="button"
                          onClick={() => onCellClick(d, period.period_number)}
                          aria-pressed={isSelected}
                          className="block w-full px-3 py-2 text-left hover:bg-marigold-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="px-3 py-2">{content}</div>
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
