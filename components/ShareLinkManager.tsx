"use client";

// New, not ported. Lets a teacher create/revoke share links for one
// topic -- only shown once the topic has a published note (an
// unpublished topic has nothing resolveShareLink would find anyway).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShareLink, revokeShareLink } from "@/lib/actions/notes";
import { emitToast } from "@/lib/toast";

type ShareLink = {
  id: string;
  token: string;
  access_code: string | null;
  expires_at: string | null;
};

export function ShareLinkManager({ topicId, links }: { topicId: string; links: ShareLink[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [accessCode, setAccessCode] = useState("");
  const [origin, setOrigin] = useState("");

  if (typeof window !== "undefined" && !origin) setOrigin(window.location.origin);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createShareLink(topicId, { accessCode: accessCode.trim() || undefined });
        setAccessCode("");
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't create a share link.", "error");
      }
    });
  }

  function handleRevoke(linkId: string) {
    startTransition(async () => {
      try {
        await revokeShareLink(linkId);
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't revoke that link.", "error");
      }
    });
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${origin}/shared/${token}`);
    emitToast("Link copied.", "success");
  }

  return (
    <details className="mt-6 rounded-xl border border-rule bg-white p-4 print:hidden">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Share links ({links.length})
      </summary>

      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li
            key={link.id}
            className="flex items-center justify-between gap-2 rounded-md bg-paper px-3 py-1.5 text-sm text-ink"
          >
            <span className="min-w-0 truncate">
              /shared/{link.token}
              {link.access_code && (
                <span className="ml-2 text-xs text-ink-soft">(code protected)</span>
              )}
            </span>
            <span className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => copyLink(link.token)}
                title="Copy this share link to your clipboard"
                className="text-xs font-medium text-leaf hover:underline"
              >
                Copy
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleRevoke(link.id)}
                title="Revoke this share link — it will stop working immediately"
                className="text-xs font-medium text-clay hover:underline disabled:opacity-50"
              >
                Revoke
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          placeholder="Optional access code"
          title="Optional code viewers must enter to open this link"
          className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          title="Create a new share link"
          className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          Create link
        </button>
      </form>
    </details>
  );
}
