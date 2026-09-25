"use client";

// New, not ported. Shown by app/shared/[token]/page.tsx when a link
// has an access code -- resubmits the page with ?code= so
// resolveShareLink can re-check it server-side.

import { useState } from "react";

export function AccessCodeForm() {
  const [code, setCode] = useState("");

  return (
    <form method="GET" className="mx-auto max-w-sm p-8 text-center">
      <p className="mb-3 text-sm text-ink-soft">This note is protected by an access code.</p>
      <input
        type="text"
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Access code"
        title="Enter the access code shared with you to view this note"
        className="mb-3 w-full rounded-lg border border-rule bg-white px-3 py-2 text-center text-sm"
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark"
      >
        View note
      </button>
    </form>
  );
}
