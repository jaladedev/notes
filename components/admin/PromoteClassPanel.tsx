"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteClass } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

const GRADUATE = "__graduate__";

export function PromoteClassPanel({
  classId,
  className,
  studentCount,
  otherClasses,
}: {
  classId: string;
  className: string;
  studentCount: number;
  otherClasses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [isPending, startTransition] = useTransition();

  const graduating = target === GRADUATE;
  const targetName = otherClasses.find((c) => c.id === target)?.name;

  function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    if (!target || studentCount === 0) return;

    const message = graduating
      ? `Remove all ${studentCount} students from ${className}? They won't be enrolled in any class.`
      : `Move all ${studentCount} students from ${className} to ${targetName}? They'll lose access to ${className}'s spaces and gain ${targetName}'s.`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await promoteClass(classId, graduating ? null : target);
      if (!result.ok) {
        emitToast(result.error, "error");
        return;
      }
      emitToast(
        graduating
          ? `${result.data.moved} students removed from ${className}.`
          : `${result.data.moved} students moved to ${targetName}.`,
        "success"
      );
      setTarget("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-1 font-display text-lg font-semibold text-ink">Promote class</h2>
      <p className="mb-3 text-xs text-ink-soft">
        Moves the whole roster at once. Notes stay with {className}&apos;s spaces for the next cohort.
      </p>
      <form onSubmit={handlePromote} className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          Promote to
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-0.5 block w-48 rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
          >
            <option value="">Choose a class…</option>
            {otherClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={GRADUATE}>Graduate (no new class)</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isPending || !target || studentCount === 0}
          className="rounded-lg bg-marigold px-3 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {graduating ? "Graduate" : "Promote"} {studentCount} student{studentCount === 1 ? "" : "s"}
        </button>
      </form>
    </section>
  );
}
