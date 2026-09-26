"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/dashboard/search?q=${encodeURIComponent(value.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search published notes…"
        title="Search text within published notes you can access"
        autoFocus
        className="flex-1 rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink outline-none focus-visible:border-marigold"
      />
      <button
        type="submit"
        title="Search"
        className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark"
      >
        Search
      </button>
    </form>
  );
}
