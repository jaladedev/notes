"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSubject } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

export function SubjectCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createSubject(name);
      if (!result.ok) {
        emitToast(result.error, "error");
        return;
      }
      setName("");
      router.push(`/dashboard/admin/subjects/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Subject name (e.g. Mathematics)"
        className="flex-1 rounded-md border border-rule bg-white px-2 py-1.5 text-sm text-ink"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="rounded-lg bg-marigold px-3 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        Add subject
      </button>
    </form>
  );
}
