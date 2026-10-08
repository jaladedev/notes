"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClass, type EducationLevel } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

// Notes are shared by level, so a class must have one: the level and number
// are required here (and re-checked on the server).
export function ClassCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel | "">("");
  const [levelNumber, setLevelNumber] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const ready = name.trim() !== "" && educationLevel !== "" && levelNumber !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      const res = await createClass(name, educationLevel, Number(levelNumber));
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      setName("");
      setEducationLevel("");
      setLevelNumber("");
      router.push(`/dashboard/admin/classes/${res.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-xl border border-rule bg-white p-4">
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-ink-soft">
        Class name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. JSS2A"
          className="rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        Level
        <select
          value={educationLevel}
          onChange={(e) => setEducationLevel(e.target.value as EducationLevel | "")}
          required
          className="rounded-lg border border-rule bg-white px-2 py-2 text-sm text-ink"
        >
          <option value="">Select level</option>
          <option value="primary">Primary</option>
          <option value="jss">JSS</option>
          <option value="sss">SSS</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        Grade
        <input
          type="number"
          min={1}
          max={6}
          step={1}
          value={levelNumber}
          onChange={(e) => setLevelNumber(e.target.value)}
          required
          placeholder="e.g. 2"
          title="Grade number within the level, e.g. 2 for JSS2"
          className="w-20 rounded-lg border border-rule bg-white px-2 py-2 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        disabled={isPending || !ready}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        Create class
      </button>
    </form>
  );
}
