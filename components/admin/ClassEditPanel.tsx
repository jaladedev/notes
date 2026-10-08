"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClass, deleteClass, type EducationLevel } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

export function ClassEditPanel({
  classId,
  initialName,
  initialLevel,
  initialLevelNumber,
}: {
  classId: string;
  initialName: string;
  initialLevel: EducationLevel | null;
  initialLevelNumber: number | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [level, setLevel] = useState<EducationLevel | "">(initialLevel ?? "");
  const [levelNumber, setLevelNumber] = useState(initialLevelNumber ? String(initialLevelNumber) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty =
    name.trim() !== initialName ||
    (level || null) !== initialLevel ||
    (levelNumber ? Number(levelNumber) : null) !== initialLevelNumber;

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateClass(
        classId,
        name,
        level || null,
        levelNumber ? Number(levelNumber) : null
      );
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      emitToast("Class updated.", "success");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteClass(classId);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      router.push("/dashboard/admin/classes");
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Class details</h2>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-ink-soft">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-soft">
          Level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as EducationLevel | "")}
            className="mt-1 block rounded-lg border border-rule bg-white px-2 py-2 text-sm text-ink"
          >
            <option value="">Not set</option>
            <option value="primary">Primary</option>
            <option value="jss">JSS</option>
            <option value="sss">SSS</option>
          </select>
        </label>
        <label className="text-xs text-ink-soft">
          Number
          <input
            type="number"
            min={1}
            max={6}
            value={levelNumber}
            onChange={(e) => setLevelNumber(e.target.value)}
            className="mt-1 block w-16 rounded-lg border border-rule bg-white px-2 py-2 text-sm text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !dirty || !name.trim()}
          className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Save changes
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-soft">
        Students see the notes for this class&apos;s level, so set both the level and the number.
      </p>

      <div className="mt-4 border-t border-rule pt-3">
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-sm font-medium text-clay hover:underline"
          >
            Delete class
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink">
              Delete this class and its roster? Student accounts and notes are kept.
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={remove}
              className="rounded-lg bg-clay px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              Delete class
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm text-ink-soft underline">
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
