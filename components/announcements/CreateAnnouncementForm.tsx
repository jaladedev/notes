"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAnnouncement } from "@/lib/actions/announcements";
import { emitToast } from "@/lib/toast";

export function CreateAnnouncementForm({
  isAdmin,
  spaces,
}: {
  isAdmin: boolean;
  spaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [spaceId, setSpaceId] = useState(isAdmin ? "" : spaces[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createAnnouncement({ title, body, spaceId: spaceId || undefined });
        setTitle("");
        setBody("");
        router.refresh();
        emitToast("Announcement posted.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't post that announcement.", "error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-rule bg-white p-4">
      <h2 className="font-display text-sm font-semibold text-ink">Post an announcement</h2>
      <input
        type="text"
        required
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      <textarea
        required
        placeholder="What's this about?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
      />
      {spaces.length > 0 && (
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          className="w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        >
          {isAdmin && <option value="">School-wide</option>}
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {spaces.length === 0 && isAdmin && (
        <p className="text-xs text-ink-soft">Posting school-wide (you don&apos;t administer any spaces).</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
      >
        {isPending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}
