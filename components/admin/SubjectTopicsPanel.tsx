"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTopic } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type Topic = {
  id: string;
  title: string;
  education_level: string;
  level_number: number;
  academic_year: string;
  term: number;
  week_number: number | null;
};

const LEVELS = ["primary", "jss", "sss"] as const;

export function SubjectTopicsPanel({ subjectId, topics }: { subjectId: string; topics: Topic[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [educationLevel, setEducationLevel] = useState<(typeof LEVELS)[number]>("jss");
  const [levelNumber, setLevelNumber] = useState("1");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("1");
  const [weekNumber, setWeekNumber] = useState("");
  const [isPending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createTopic({
        subjectId,
        title,
        educationLevel,
        levelNumber: Number(levelNumber),
        academicYear: academicYear.trim(),
        term: Number(term) as 1 | 2 | 3,
        weekNumber: weekNumber.trim() ? Number(weekNumber) : undefined,
      });
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      setTitle("");
      setWeekNumber("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Topics</h2>
      <ul className="mb-4 space-y-1">
        {topics.map((t) => (
          <li key={t.id}>
            <Link href={`/dashboard/teacher/notes/${t.id}`} className="text-sm text-ink hover:underline">
              {t.education_level.toUpperCase()}
              {t.level_number} · {t.academic_year} · T{t.term}
              {t.week_number != null ? ` · Wk ${t.week_number}` : ""} — {t.title}
            </Link>
          </li>
        ))}
        {topics.length === 0 && <p className="text-sm text-ink-soft">No topics yet.</p>}
      </ul>
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Topic title"
          className="col-span-2 rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink sm:col-span-3"
        />
        <select
          value={educationLevel}
          onChange={(e) => setEducationLevel(e.target.value as (typeof LEVELS)[number])}
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          value={levelNumber}
          onChange={(e) => setLevelNumber(e.target.value)}
          type="number"
          min={1}
          placeholder="Level #"
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        />
        <input
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          placeholder="2026/2027"
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        />
        <select
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        >
          <option value="1">Term 1</option>
          <option value="2">Term 2</option>
          <option value="3">Term 3</option>
        </select>
        <input
          value={weekNumber}
          onChange={(e) => setWeekNumber(e.target.value)}
          type="number"
          min={1}
          placeholder="Week # (optional)"
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={isPending || !title.trim() || !academicYear.trim()}
          className="col-span-2 rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60 sm:col-span-3"
        >
          Add topic
        </button>
      </form>
    </section>
  );
}
