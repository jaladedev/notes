"use client";

// Bell schedule + school time zone. One list of periods shared by every
// class's timetable, so "period 3" means the same clock time everywhere.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTimetablePeriod, saveSchoolTimeZone, saveTimetablePeriod } from "@/lib/actions/timetable";
import { emitToast } from "@/lib/toast";
import { formatTime, sortPeriods, type Period } from "@/lib/timetable";

export function PeriodsPanel({ periods, timeZone }: { periods: Period[]; timeZone: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ordered = sortPeriods(periods);
  const nextNumber = periods.length ? Math.max(...periods.map((p) => p.period_number)) + 1 : 1;

  const [number, setNumber] = useState(nextNumber);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("08:40");
  const [isBreak, setIsBreak] = useState(false);
  const [zone, setZone] = useState(timeZone);

  function run(action: () => Promise<void>, ok: string, fail: string, after?: () => void) {
    startTransition(async () => {
      try {
        await action();
        emitToast(ok, "success");
        after?.();
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : fail, "error");
      }
    });
  }

  function edit(p: Period) {
    setNumber(p.period_number);
    setLabel(p.label ?? "");
    setStart(formatTime(p.start_time));
    setEnd(formatTime(p.end_time));
    setIsBreak(p.is_break);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => saveTimetablePeriod({ periodNumber: number, label, startTime: start, endTime: end, isBreak }),
      "Period saved.",
      "Couldn't save that period.",
      () => {
        setNumber(number + 1);
        setLabel("");
        setIsBreak(false);
      }
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-rule bg-white p-4">
      <h2 className="font-display text-lg font-semibold text-ink">Bell schedule</h2>

      <ul className="space-y-1">
        {ordered.map((p) => (
          <li key={p.period_number} className="flex items-center justify-between rounded-md bg-paper px-3 py-1.5 text-sm text-ink">
            <span>
              {p.label || `Period ${p.period_number}`}
              {p.is_break ? " (break)" : ""}{" "}
              <span className="text-ink-soft">
                #{p.period_number} · {formatTime(p.start_time)}–{formatTime(p.end_time)}
              </span>
            </span>
            <span className="flex gap-3">
              <button type="button" onClick={() => edit(p)} className="text-xs font-medium text-ink hover:underline">
                Edit
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(() => deleteTimetablePeriod(p.period_number), "Period removed.", "Couldn't remove that period.")
                }
                className="text-xs font-medium text-clay hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
        {ordered.length === 0 && (
          <p className="text-sm text-ink-soft">No periods yet. Add the first one below.</p>
        )}
      </ul>

      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          Number
          <input
            type="number"
            min={1}
            value={number}
            onChange={(e) => setNumber(Number(e.target.value))}
            className="mt-0.5 block w-16 rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-soft">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional"
            className="mt-0.5 block w-28 rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-soft">
          Start
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-0.5 block rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-soft">
          End
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-0.5 block rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="flex items-center gap-1 pb-1 text-xs text-ink-soft">
          <input type="checkbox" checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
          Break
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Save period
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveSchoolTimeZone(zone), "Time zone saved.", "Couldn't save the time zone.");
        }}
        className="flex flex-wrap items-end gap-2 border-t border-rule pt-4"
      >
        <label className="text-xs text-ink-soft">
          School time zone
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="mt-0.5 block w-48 rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || zone.trim() === timeZone}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold disabled:opacity-60"
        >
          Save time zone
        </button>
        <p className="w-full text-xs text-ink-soft">
          Decides which day and period the bell timer treats as &quot;now&quot;. Use an IANA name such as Africa/Lagos.
        </p>
      </form>
    </section>
  );
}
