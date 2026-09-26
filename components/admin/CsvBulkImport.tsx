"use client";

// Generic CSV upload widget: parses the file client-side (lib/csv.ts),
// hands the parsed rows to whatever server action the caller passes in,
// and shows a per-row success/failure report. Column mapping and the
// action itself are the caller's job -- this component only owns the
// file-picking, parsing, and results UI.
//
// Fixed: a row's temporaryPassword (present only for bulkCreateStudents,
// where createStudentAccount always generates one) used to be silently
// dropped -- the results list only ever rendered `message`. After
// importing N students there was no way to retrieve any of their
// passwords short of resetting each one individually. Now shown inline
// per row and offered as a CSV download, since Supabase Auth never
// stores a password retrievably -- this is the one chance to capture it.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseCsvWithHeader } from "@/lib/csv";
import { emitToast } from "@/lib/toast";

type RowResult = { row: number; ok: boolean; message: string } & Record<string, unknown>;

function downloadResultsCsv(rows: RowResult[], title: string) {
  const hasPassword = rows.some((r) => typeof r.temporaryPassword === "string");
  const header = ["row", "label", "ok", "message", ...(hasPassword ? ["temporaryPassword"] : [])];
  const lines = rows.map((r) => {
    const cells = [
      String(r.row),
      String((r as any).label ?? ""),
      String(r.ok),
      r.message,
      ...(hasPassword ? [String(r.temporaryPassword ?? "")] : []),
    ];
    // Minimal CSV quoting: wrap and escape any cell with a comma, quote, or newline.
    return cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-import-results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
            <div className="space-y-2 rounded-lg border border-rule bg-paper p-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-soft">
                  {results.filter((r) => r.ok).length} of {results.length} succeeded
                </p>
                {results.some((r) => typeof r.temporaryPassword === "string") && (
                  <button
                    type="button"
                    onClick={() => downloadResultsCsv(results, title)}
                    className="rounded-lg border border-rule bg-white px-2 py-1 text-xs text-ink hover:border-marigold"
                  >
                    Download passwords (CSV)
                  </button>
                )}
              </div>
              {results.some((r) => typeof r.temporaryPassword === "string") && (
                <p className="text-xs text-clay">
                  Temporary passwords are shown once and can&apos;t be retrieved again — download or
                  copy them now.
                </p>
              )}
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {results.map((r, i) => (
                  <li key={i} className={r.ok ? "text-leaf" : "text-clay"}>
                    Row {r.row} ({(r as any).label}): {r.message}
                    {typeof r.temporaryPassword === "string" && (
                      <>
                        {" — "}
                        <code className="rounded bg-white px-1 text-ink">{r.temporaryPassword}</code>
                      </>
                    )}
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
