"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTermStartDate } from "@/lib/actions/timetable";
import { emitToast } from "@/lib/toast";

export function TermStartPanel({
  termStart,
  currentWeek,
}: {
  termStart: string | null;
  currentWeek: number | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(termStart ?? "");
  const [isPending, startTransition] = useTransition();

  function save(value: string | null) {
    startTransition(async () => {
      const result = await saveTermStartDate(value);
      if (!result.ok) {
        emitToast(result.error, "error");
        return;
      }
      emitToast(value ? "Term start saved." : "Week gate turned off.", "success");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-1 font-display text-lg font-semibold text-ink">Term weeks</h2>
      <p className="mb-3 text-xs text-ink-soft">
        Students only see notes for topics whose week number has started. Teachers and admins always see
        everything. Leave the date empty to show all weeks.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(date || null);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="text-xs text-ink-soft">
          Week 1 starts on
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-0.5 block rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || date === (termStart ?? "")}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold disabled:opacity-60"
        >
          Save
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-soft">
        {termStart === null
          ? "Week gate is off."
          : currentWeek !== null && currentWeek >= 1
            ? `It is currently week ${currentWeek}.`
            : "The term hasn't started yet — no week-numbered notes are visible to students."}
      </p>
    </section>
  );
}
