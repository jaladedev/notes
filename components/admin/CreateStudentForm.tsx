"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStudentAccount } from "@/lib/actions/accountAdmin";
import { emitToast } from "@/lib/toast";
import { TempPasswordReveal } from "@/components/admin/TempPasswordReveal";

export function CreateStudentForm({ classes }: { classes: { id: string; name: string }[] }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const { temporaryPassword } = await createStudentAccount({
          fullName,
          email,
          classId: classId || undefined,
        });
        setCreated({ email, password: temporaryPassword });
        setFullName("");
        setEmail("");
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
      <h2 className="font-display text-sm font-semibold text-ink">Add a student</h2>
      <input
        type="text"
        required
        placeholder="Full name"
        title="Student's full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <input
        type="email"
        required
        placeholder="Email"
        title="Student's email address (used to sign in)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      {classes.length > 0 && (
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          title="Class to enroll this student in"
          className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        >
          <option value="">No class yet</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
