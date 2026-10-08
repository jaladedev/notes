"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addClassMembers, removeClassMember } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type Member = { profile_id: string; profiles: { full_name: string } | null };

export type Candidate = {
  id: string;
  fullName: string;
  email: string;
  currentClass: string | null;
};

export function ClassRosterPanel({
  classId,
  members,
  candidates,
}: {
  classId: string;
  members: Member[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const filtered = candidates.filter(
    (c) => !q || c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addClassMembers(classId, Array.from(selected));
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      const { added, moved } = res.data;
      emitToast(
        `Added ${added} student${added === 1 ? "" : "s"}${moved ? ` (${moved} moved from another class)` : ""}.`,
        "success"
      );
      setSelected(new Set());
      setQuery("");
      router.refresh();
    });
  }

  function handleRemove(profileId: string) {
    startTransition(async () => {
      const res = await removeClassMember(classId, profileId);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      router.refresh();
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
      <form onSubmit={handleAdd} className="border-t border-rule pt-3">
        <h3 className="mb-2 text-sm font-medium text-ink">Add students</h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Every student account is already in this class. Create more under Admin → Students.
          </p>
        ) : (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search students"
              className="mb-2 w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm"
            />
            <label className="mb-1 flex items-center gap-2 px-1 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAllFiltered}
                disabled={filtered.length === 0}
              />
              Select all {q ? "matching " : ""}({filtered.length})
            </label>
            <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-rule p-1">
              {filtered.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-marigold-soft">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{c.fullName}</span>
                      <span className="block truncate text-xs text-ink-soft">{c.email}</span>
                    </span>
                    {c.currentClass && (
                      <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 text-xs text-ink-soft">
                        In {c.currentClass}
                      </span>
                    )}
                  </label>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-2 py-3 text-sm text-ink-soft">No students match “{query}”.</li>
              )}
            </ul>
            <button
              type="submit"
              disabled={isPending || selected.size === 0}
              className="rounded-lg bg-marigold px-3 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
            >
              {selected.size === 0
                ? "Add students"
                : `Add ${selected.size} student${selected.size === 1 ? "" : "s"}`}
            </button>
            <p className="mt-2 text-xs text-ink-soft">
              A student belongs to one class. Anyone marked “In …” moves here from that class.
            </p>
          </>
        )}
      </form>
    </section>
  );
}
