"use client";

// Admin editor for one class's weekly timetable: click a cell, pick the
// space (subject) and teacher, optionally a room, save. The server action
// re-validates everything (and the database enforces clashes), so this
// form only has to make the valid choices easy.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearTimetableEntry, setTimetableEntry } from "@/lib/actions/timetable";
import { emitToast } from "@/lib/toast";
import { TimetableGridView } from "@/components/timetable/TimetableGridView";
import { formatTime, visibleWeekdays, weekdayLabel, type Period, type TimetableRow } from "@/lib/timetable";

export type EditorSpace = {
  id: string;
  name: string;
  subjectName: string | null;
  teachers: { id: string; name: string }[];
};

export function TimetableEditor({
  classId,
  periods,
  rows,
  spaces,
}: {
  classId: string;
  periods: Period[];
  rows: TimetableRow[];
  spaces: EditorSpace[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSaturday, setShowSaturday] = useState(false);
  const [selected, setSelected] = useState<{ weekday: number; periodNumber: number } | null>(null);
  const [spaceId, setSpaceId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [room, setRoom] = useState("");

  const weekdays = useMemo(() => visibleWeekdays(rows, showSaturday), [rows, showSaturday]);
  const existing = selected
    ? rows.find((r) => r.weekday === selected.weekday && r.period_number === selected.periodNumber)
    : undefined;
  const chosenSpace = spaces.find((s) => s.id === spaceId);
  const period = selected ? periods.find((p) => p.period_number === selected.periodNumber) : undefined;

  function selectCell(weekday: number, periodNumber: number) {
    setSelected({ weekday, periodNumber });
    const current = rows.find((r) => r.weekday === weekday && r.period_number === periodNumber);
    setSpaceId(current?.space_id ?? "");
    setTeacherId(current?.teacher_id ?? "");
    setRoom(current?.room ?? "");
  }

  function chooseSpace(id: string) {
    setSpaceId(id);
    const teachers = spaces.find((s) => s.id === id)?.teachers ?? [];
    // One teacher in the space? That's almost always who teaches it.
    setTeacherId(teachers.length === 1 ? teachers[0].id : "");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !spaceId) return;
    startTransition(async () => {
      try {
        await setTimetableEntry({
          classId,
          weekday: selected.weekday,
          periodNumber: selected.periodNumber,
          spaceId,
          teacherId: teacherId || null,
          room,
        });
        emitToast("Lesson saved.", "success");
        setSelected(null);
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't save that lesson.", "error");
      }
    });
  }

  function remove() {
    if (!existing) return;
    startTransition(async () => {
      try {
        await clearTimetableEntry(existing.id, classId);
        emitToast("Lesson removed.", "success");
        setSelected(null);
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't remove that lesson.", "error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={showSaturday} onChange={(e) => setShowSaturday(e.target.checked)} title="Show Saturday in the timetable grid" />
        Show Saturday
      </label>

      <TimetableGridView
        periods={periods}
        rows={rows}
        weekdays={weekdays}
        onCellClick={selectCell}
        selected={selected}
      />

      {selected && period && (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-rule bg-white p-4">
          <h2 className="font-display text-lg font-semibold text-ink">
            {weekdayLabel(selected.weekday)}, {period.label || `Period ${period.period_number}`}{" "}
            <span className="text-sm font-normal text-ink-soft">
              {formatTime(period.start_time)}–{formatTime(period.end_time)}
            </span>
          </h2>

          {spaces.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No space is linked to this class yet. Link one from the space&apos;s settings, then come back.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-ink">
                Subject
                <select
                  value={spaceId}
                  onChange={(e) => chooseSpace(e.target.value)}
                  required
                  title="Subject/space taught in this lesson"
                  className="mt-1 block rounded-lg border border-rule bg-white px-3 py-2 text-sm"
                >
                  <option value="">Choose a space</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.subjectName ? `${s.subjectName} (${s.name})` : s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-ink">
                Teacher
                <select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={!chosenSpace}
                  title="Teacher for this lesson"
                  className="mt-1 block rounded-lg border border-rule bg-white px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">No teacher</option>
                  {(chosenSpace?.teachers ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-ink">
                Room
                <input
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  maxLength={40}
                  placeholder="Optional"
                  title="Room for this lesson (optional, not clash-checked)"
                  className="mt-1 block w-32 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending || !spaceId}
              className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
            >
              Save lesson
            </button>
            {existing && (
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium text-clay hover:border-clay disabled:opacity-60"
              >
                Remove lesson
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-rule bg-white px-4 py-2 text-sm text-ink hover:border-marigold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
