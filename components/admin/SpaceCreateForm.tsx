"use client";

// Extended for the school_app-style curriculum flow: a space can now
// optionally be tied to a subject + education level + level number +
// academic year + term, same grouping school_app uses for
// curriculum_topics, instead of only a free-typed name.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSpace, createSubject, type EducationLevel } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type SubjectOption = { id: string; name: string };

export function SpaceCreateForm({ subjects }: { subjects: SubjectOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [useCurriculum, setUseCurriculum] = useState(false);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel>("jss");
  const [levelNumber, setLevelNumber] = useState(1);
  const [academicYear, setAcademicYear] = useState("2026/2027");
  const [term, setTerm] = useState<1 | 2 | 3>(1);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        let finalSubjectId = subjectId;
        if (useCurriculum && !finalSubjectId && newSubjectName.trim()) {
          const subject = await createSubject(newSubjectName);
          finalSubjectId = subject.id;
        }

        const space = await createSpace(name, {
          subjectId: useCurriculum ? finalSubjectId || undefined : undefined,
          educationLevel: useCurriculum ? educationLevel : undefined,
          levelNumber: useCurriculum ? levelNumber : undefined,
          academicYear: useCurriculum ? academicYear.trim() || undefined : undefined,
          term: useCurriculum ? term : undefined,
        });
        setName("");
        router.push(`/dashboard/admin/spaces/${space.id}`);
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't create that space.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-rule bg-white p-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={useCurriculum}
          onChange={(e) => setUseCurriculum(e.target.checked)}
          title="Tie this space to the subject/level/term grid instead of a free-typed name"
        />
        Tie this space to a subject, level, and term (school_app-style)
      </label>

      {useCurriculum ? (
        <div className="flex flex-wrap gap-2">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            title="Subject for this space"
            className="rounded-lg border border-rule bg-white px-2 py-2 text-sm"
          >
            <option value="">New subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!subjectId && (
            <input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Subject name, e.g. Basic Science"
              title="Name for the new subject"
              className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
            />
          )}
          <select
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value as EducationLevel)}
            title="Education level for this space"
            className="rounded-lg border border-rule bg-white px-2 py-2 text-sm"
          >
            <option value="primary">Primary</option>
            <option value="jss">JSS</option>
            <option value="sss">SSS</option>
          </select>
          <input
            type="number"
            min={1}
            max={6}
            value={levelNumber}
            onChange={(e) => setLevelNumber(Number(e.target.value))}
            className="w-16 rounded-lg border border-rule bg-white px-2 py-2 text-sm"
            title="Level number, e.g. 2 for JSS2"
          />
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2026/2027"
            title="Academic year, e.g. 2026/2027"
            className="w-28 rounded-lg border border-rule bg-white px-2 py-2 text-sm"
          />
          <select
            value={term}
            onChange={(e) => setTerm(Number(e.target.value) as 1 | 2 | 3)}
            title="Term this space covers"
            className="rounded-lg border border-rule bg-white px-2 py-2 text-sm"
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </div>
      ) : (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. JSS2 Basic Science"
          title="Space name"
          className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm outline-none focus-visible:border-marigold"
        />
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        Create space
      </button>
    </form>
  );
}
