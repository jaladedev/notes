"use client";

import React from "react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
