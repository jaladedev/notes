"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTeacherToClassSubject, removeTeacherFromClassSubject } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

export type PanelSubject = {
  id: string;
  name: string;
  teachers: { id: string; name: string }[];
};
export type PanelTeacher = { id: string; name: string };

export function ClassTeachersPanel({
  classId,
  subjects,
  allTeachers,
}: {
  classId: string;
  subjects: PanelSubject[];
  allTeachers: PanelTeacher[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Record<string, string>>({});

  function assign(subjectId: string) {
    const teacherId = picked[subjectId];
    if (!teacherId) return;
    startTransition(async () => {
      const res = await assignTeacherToClassSubject(classId, subjectId, teacherId);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      setPicked((p) => ({ ...p, [subjectId]: "" }));
      emitToast("Teacher assigned.", "success");
      router.refresh();
    });
  }

  function remove(subjectId: string, teacherId: string) {
    startTransition(async () => {
      const res = await removeTeacherFromClassSubject(classId, subjectId, teacherId);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Teachers by subject</h2>
      {subjects.length === 0 && (
        <p className="text-sm text-ink-soft">Create a subject first, then assign its teachers here.</p>
      )}
      <ul className="space-y-4">
        {subjects.map((s) => {
          const assigned = new Set(s.teachers.map((t) => t.id));
          const options = allTeachers.filter((t) => !assigned.has(t.id));
          return (
            <li key={s.id}>
              <p className="mb-1 text-sm font-medium text-ink">{s.name}</p>
              <ul className="mb-2 space-y-1">
                {s.teachers.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-md bg-paper px-3 py-1.5 text-sm"
                  >
                    <span>{t.name}</span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => remove(s.id, t.id)}
                      title={`Remove ${t.name} from ${s.name} in this class`}
                      className="text-xs font-medium text-clay hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {s.teachers.length === 0 && (
                  <li className="text-xs text-ink-soft">No teacher assigned.</li>
                )}
              </ul>
              {options.length > 0 && (
                <div className="flex gap-2">
                  <select
                    aria-label={`Add a teacher for ${s.name}`}
                    value={picked[s.id] ?? ""}
                    onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-lg border border-rule bg-white px-2 py-1.5 text-sm text-ink"
                  >
                    <option value="">Choose a teacher</option>
                    {options.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={isPending || !picked[s.id]}
                    onClick={() => assign(s.id)}
                    className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
                  >
                    Assign
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-soft">
        Assigning a teacher here also gives them access to the subject&apos;s notes, and lets them post
        announcements to this class.
      </p>
    </section>
  );
}
