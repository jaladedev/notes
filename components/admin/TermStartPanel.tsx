"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTermStartDate, saveCurrentTerm } from "@/lib/actions/timetable";
import { emitToast } from "@/lib/toast";

export function TermStartPanel({
  termStart,
  currentWeek,
  academicYear,
  term,
}: {
  termStart: string | null;
  currentWeek: number | null;
  academicYear: string | null;
  term: number | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(termStart ?? "");
  const [year, setYear] = useState(academicYear ?? "");
  const [termValue, setTermValue] = useState(term ? String(term) : "");
  const [isPending, startTransition] = useTransition();

  function saveTerm(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCurrentTerm(year.trim() || null, termValue ? Number(termValue) : null);
      if (!result.ok) {
        emitToast(result.error, "error");
        return;
      }
      emitToast("Current term saved.", "success");
      router.refresh();
    });
  }

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
        Students see earlier terms in full, the current term up to the current week, and nothing from later
        terms. Teachers and admins always see everything. Leave the fields empty to turn a limit off.
      </p>
      <form onSubmit={saveTerm} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          Academic year
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2026/2027"
            className="mt-0.5 block w-32 rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-soft">
          Term
          <select
            value={termValue}
            onChange={(e) => setTermValue(e.target.value)}
            className="mt-0.5 block rounded-md border border-rule bg-white px-2 py-1 text-sm text-ink"
          >
            <option value="">Not set</option>
            <option value="1">Term 1</option>
            <option value="2">Term 2</option>
            <option value="3">Term 3</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending || (year.trim() === (academicYear ?? "") && termValue === (term ? String(term) : ""))}
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold disabled:opacity-60"
        >
          Save term
        </button>
      </form>
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
