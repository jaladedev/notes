"use client";

import { useEffect, useState } from "react";
import { getTopicNoteVersionContent } from "@/lib/actions/notes";
import { computeWordDiff, stripMarkdownForDiff, type DiffToken } from "@/lib/diff";

type VersionSummary = {
  id: string;
  version: number;
  status: string;
  moderation_status: string;
  updated_at: string;
};

function tokenClassName(type: DiffToken["type"]) {
  if (type === "added") return "bg-leaf-soft text-leaf";
  if (type === "removed") return "bg-clay/20 text-clay line-through";
  return "";
}

export function NoteVersionDiff({ versions }: { versions: VersionSummary[] }) {
  const [open, setOpen] = useState(false);
  // Default to comparing the two most recent versions -- that's almost
  // always the comparison someone opening this wants ("what changed in
  // the latest save"), so it should need zero clicks to see.
  const [fromId, setFromId] = useState(versions[1]?.id ?? versions[0]?.id ?? "");
  const [toId, setToId] = useState(versions[0]?.id ?? "");

  const [tokens, setTokens] = useState<DiffToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !fromId || !toId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTokens(null);

    Promise.all([getTopicNoteVersionContent(fromId), getTopicNoteVersionContent(toId)])
      .then(([fromContent, toContent]) => {
        if (cancelled) return;
        setTokens(
          computeWordDiff(stripMarkdownForDiff(fromContent), stripMarkdownForDiff(toContent))
        );
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message ?? "Couldn't load those versions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, fromId, toId]);

  if (versions.length < 2) return null;

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-leaf hover:underline"
      >
        {open ? "Hide version comparison" : "Compare versions"}
      </button>

      {open && (
        <div className="mt-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className="rounded-lg border border-rule px-2 py-1.5 outline-none focus-visible:border-leaf"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version} ({v.status})
                </option>
              ))}
            </select>
            <span className="text-ink-soft">→</span>
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className="rounded-lg border border-rule px-2 py-1.5 outline-none focus-visible:border-leaf"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version} ({v.status})
                </option>
              ))}
            </select>
          </div>

          {loading && <p className="text-sm text-ink-soft">Loading…</p>}
          {error && <p className="text-sm text-clay">{error}</p>}

          {tokens && !loading && (
            <div className="whitespace-pre-wrap rounded-lg bg-paper p-4 font-body text-sm leading-relaxed text-ink">
              {tokens.length ? (
                tokens.map((token, i) => (
                  <span key={i} className={tokenClassName(token.type)}>
                    {token.text}
                  </span>
                ))
              ) : (
                <span className="text-ink-soft">Both versions are identical.</span>
              )}
            </div>
          )}

          <p className="mt-2 text-xs text-ink-soft">
            <span className="rounded bg-leaf-soft px-1 text-leaf">green</span> = added ·{" "}
            <span className="rounded bg-clay/20 px-1 text-clay line-through">red</span> = removed
          </p>
        </div>
      )}
    </div>
  );
}
