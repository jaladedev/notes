"use client";

// Shown once, right after an account is created or reset -- the temp
// password is never stored anywhere retrievable (Supabase Auth only
// keeps a hash), so this is the one chance to hand it to the admin.

import { useState } from "react";

export function TempPasswordReveal({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-marigold bg-marigold-soft p-4">
      <p className="mb-2 text-sm font-medium text-ink">
        Account created for {email}. Share this password once — it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="rounded-lg border border-rule bg-white px-3 py-2 font-mono text-sm text-ink">
          {password}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink hover:border-marigold"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto text-sm text-ink-soft hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        They&apos;ll be asked to set their own password the first time they sign in.
      </p>
    </div>
  );
}
