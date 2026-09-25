"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addClassMember, removeClassMember } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type Member = { profile_id: string; profiles: { full_name: string } | null };

export function ClassRosterPanel({ classId, members }: { classId: string; members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await addClassMember(classId, email);
        setEmail("");
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't add that student.", "error");
      }
    });
  }

  function handleRemove(profileId: string) {
    startTransition(async () => {
      try {
        await removeClassMember(classId, profileId);
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't remove that student.", "error");
      }
    });
  }

  return (
    <section className="rounded-xl border border-rule bg-white p-4">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">
        Roster ({members.length})
      </h2>
      <ul className="mb-3 space-y-1">
        {members.map((m) => (
          <li
            key={m.profile_id}
            className="flex items-center justify-between rounded-md bg-paper px-3 py-1.5 text-sm"
          >
            <span>{m.profiles?.full_name ?? m.profile_id}</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRemove(m.profile_id)}
              title={`Remove ${m.profiles?.full_name ?? "this student"} from the class`}
              className="text-xs font-medium text-clay hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
        {members.length === 0 && <p className="text-sm text-ink-soft">No students yet.</p>}
      </ul>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@example.com"
          title="Email of the existing student account to add to this class"
          className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="rounded-lg bg-marigold px-3 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Add
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-soft">
        They need an existing student account — create it under Admin → Students first.
      </p>
    </section>
  );
}
