"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTeacherToSubject, removeTeacherFromSubject } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type Teacher = { profile_id: string; role: "teacher" | "reviewer"; profiles: { full_name: string } | null };

export type TeacherOption = { id: string; email: string; name: string };

export function SubjectTeachersPanel({
  subjectId,
  teachers,
  allTeachers,
}: {
  subjectId: string;
  teachers: Teacher[];
  allTeachers: TeacherOption[];
}) {
  const assignedIds = new Set(teachers.map((t) => t.profile_id));
  const options = allTeachers.filter((t) => !assignedIds.has(t.id));
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"teacher" | "reviewer">("teacher");
  const [isPending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await assignTeacherToSubject(subjectId, email, role);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      setEmail("");
      router.refresh();
    });
  }

  function remove(profileId: string) {
    startTransition(async () => {
      const res = await removeTeacherFromSubject(subjectId, profileId);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Teachers</h2>
      <ul className="mb-3 space-y-1">
        {teachers.map((t) => (
          <li key={t.profile_id} className="flex items-center justify-between text-sm text-ink">
            <span>
              {t.profiles?.full_name ?? t.profile_id}
              <span className="ml-2 text-xs uppercase tracking-wide text-ink-soft">{t.role}</span>
            </span>
            <button
              onClick={() => remove(t.profile_id)}
              disabled={isPending}
              className="text-xs text-ink-soft underline hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
        {teachers.length === 0 && <p className="text-sm text-ink-soft">No teachers assigned yet.</p>}
      </ul>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <select
          aria-label="Teacher"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        >
          <option value="">{options.length === 0 ? "All teachers assigned" : "Choose a teacher"}</option>
          {options.map((t) => (
            <option key={t.id} value={t.email}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "teacher" | "reviewer")}
          className="rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
        >
          <option value="teacher">Teacher</option>
          <option value="reviewer">Reviewer</option>
        </select>
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Assign
        </button>
      </form>
    </section>
  );
}
