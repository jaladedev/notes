"use client";

// Generic CSV upload widget: parses the file client-side (lib/csv.ts),
// hands the parsed rows to whatever server action the caller passes in,
// and shows a per-row success/failure report. Column mapping and the
// action itself are the caller's job -- this component only owns the
// file-picking, parsing, and results UI.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseCsvWithHeader } from "@/lib/csv";
import { emitToast } from "@/lib/toast";

type RowResult = { row: number; ok: boolean; message: string } & Record<string, unknown>;

export function CsvBulkImport<TRow>({
  title,
  expectedColumns,
  sampleRow,
  mapRow,
  labelKey,
  onImport,
}: {
  title: string;
  expectedColumns: string[];
  sampleRow: string;
  mapRow: (record: Record<string, string>) => TRow;
  labelKey: (row: TRow) => string;
  onImport: (rows: TRow[]) => Promise<RowResult[]>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [open, setOpen] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const records = parseCsvWithHeader(text);
      if (records.length === 0) {
        emitToast("That CSV has no data rows.", "error");
        return;
      }
      const rows = records.map(mapRow);
      startTransition(async () => {
        try {
          const res = await onImport(rows);
          setResults(res.map((r, i) => ({ ...r, label: labelKey(rows[i]) })));
          router.refresh();
        } catch (err: unknown) {
          emitToast(err instanceof Error ? err.message : "Import failed.", "error");
        }
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="rounded-xl border border-rule bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`${open ? "Hide" : "Show"} bulk CSV import for ${title.toLowerCase()}`}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="font-display text-sm font-semibold text-ink">Bulk import {title.toLowerCase()} (CSV)</h2>
        <span className="text-xs text-ink-soft">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-ink-soft">
            Columns: <code className="rounded bg-paper px-1">{expectedColumns.join(", ")}</code>. Example row:{" "}
            <code className="rounded bg-paper px-1">{sampleRow}</code>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            title={`Choose a CSV file of ${title.toLowerCase()} to import`}
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleFile(file);
            }}
            className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border file:border-rule file:bg-paper file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
          {isPending && <p className="text-sm text-ink-soft">Importing…</p>}

          {results && !isPending && (
            <div className="space-y-1 rounded-lg border border-rule bg-paper p-2">
              <p className="text-xs font-medium text-ink-soft">
                {results.filter((r) => r.ok).length} of {results.length} succeeded
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {results.map((r, i) => (
                  <li key={i} className={r.ok ? "text-leaf" : "text-clay"}>
                    Row {r.row} ({(r as any).label}): {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
