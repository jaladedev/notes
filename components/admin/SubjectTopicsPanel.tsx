"use client";

import { useState, useTransition } from "react";
import { formatWeekRange, MAX_THEME_LENGTH, validateWeekRange } from "@/lib/topicWeeks";
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
  week_end_number: number | null;
  theme: string | null;
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
  const [weekEndNumber, setWeekEndNumber] = useState("");
  const [theme, setTheme] = useState("");
  const [isPending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const start = weekNumber.trim() ? Number(weekNumber) : undefined;
    const end = weekEndNumber.trim() ? Number(weekEndNumber) : undefined;
    const weekProblem = validateWeekRange(start, end);
    if (weekProblem) {
      emitToast(weekProblem, "error");
      return;
    }
    startTransition(async () => {
      const res = await createTopic({
        subjectId,
        title,
        educationLevel,
        levelNumber: Number(levelNumber),
        academicYear: academicYear.trim(),
        term: Number(term) as 1 | 2 | 3,
        weekNumber: start,
        weekEndNumber: end,
        theme,
      });
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      setTitle("");
      setWeekNumber("");
      setWeekEndNumber("");
      setTheme("");
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
              {t.education_level.toUpperCase()} {t.level_number} · {t.academic_year} · T{t.term}
              {formatWeekRange(t.week_number, t.week_end_number) ? ` · ${formatWeekRange(t.week_number, t.week_end_number)}` : ""}
              {t.theme ? ` · ${t.theme}` : ""} — {t.title}
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
        <input
          value={weekEndNumber}
          onChange={(e) => setWeekEndNumber(e.target.value)}
          type="number"
          min={Number(weekNumber) || 1}
          disabled={!weekNumber.trim()}
          placeholder="Ends week # (optional)"
          title="Last week this topic covers. Leave blank for a single week."
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink disabled:opacity-50"
        />
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          maxLength={MAX_THEME_LENGTH}
          placeholder="Theme (optional)"
          title="Groups related topics, e.g. Number and Numeration"
          className="col-span-2 rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
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
