"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createParentAccount } from "@/lib/actions/accountAdmin";
import { emitToast } from "@/lib/toast";
import { TempPasswordReveal } from "@/components/admin/TempPasswordReveal";

export function CreateParentForm({ students }: { students: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function toggleChild(id: string) {
    setChildIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const { temporaryPassword } = await createParentAccount({
          fullName,
          email,
          childStudentIds: childIds,
        });
        setCreated({ email, password: temporaryPassword });
        setFullName("");
        setEmail("");
        setChildIds([]);
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't create that account.", "error");
      }
    });
  }

  if (created) {
    return (
      <TempPasswordReveal
        email={created.email}
        password={created.password}
        onDismiss={() => setCreated(null)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-rule bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-ink">Add a parent</h2>
      <input
        type="text"
        required
        placeholder="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      {students.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-soft">Children (optional)</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-rule p-2">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={childIds.includes(s.id)}
                  onChange={() => toggleChild(s.id)}
                />
                {s.full_name}
              </label>
            ))}
          </div>
        </div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
