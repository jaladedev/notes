"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;

export function MermaidDiagram({ code, title }: { code: string; title?: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          primaryColor: "#E4F0E9",
          primaryTextColor: "#1F2A44",
          primaryBorderColor: "#2F6B4F",
          lineColor: "#4A5468",
          fontFamily: "Inter, system-ui, sans-serif",
        },
      });
      initialized = true;
    }

    const id = `mermaid-${Math.random().toString(36).slice(2)}`;

    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch((err) => {
        setError(err.message ?? "Could not render diagram");
      });
  }, [code]);

  return (
    <figure className="my-4 rounded-xl border border-rule bg-white p-4">
      {title && <figcaption className="mb-2 text-sm font-medium text-leaf">{title}</figcaption>}
      {error ? (
        <p className="text-sm text-clay">{error}</p>
      ) : (
        <div ref={containerRef} className="flex justify-center" />
      )}
    </figure>
  );
}
