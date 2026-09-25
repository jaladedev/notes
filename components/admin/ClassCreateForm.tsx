"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClass, type EducationLevel } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

export function ClassCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel | "">("");
  const [levelNumber, setLevelNumber] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const klass = await createClass(
          name,
          educationLevel || undefined,
          levelNumber ? Number(levelNumber) : undefined
        );
        setName("");
        router.push(`/dashboard/admin/classes/${klass.id}`);
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't create that class.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 rounded-xl border border-rule bg-white p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. JSS2A"
        title="Class name, e.g. JSS2A"
        className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
      />
      <select
        value={educationLevel}
        onChange={(e) => setEducationLevel(e.target.value as EducationLevel | "")}
        title="Education level this class belongs to"
        className="rounded-lg border border-rule bg-white px-2 py-2 text-sm"
      >
        <option value="">Level (optional)</option>
        <option value="primary">Primary</option>
        <option value="jss">JSS</option>
        <option value="sss">SSS</option>
      </select>
      <input
        type="number"
        min={1}
        max={6}
        value={levelNumber}
        onChange={(e) => setLevelNumber(e.target.value)}
        placeholder="#"
        title="Grade number within the level, e.g. 2 for JSS2"
        className="w-16 rounded-lg border border-rule bg-white px-2 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        Create class
      </button>
    </form>
  );
}
