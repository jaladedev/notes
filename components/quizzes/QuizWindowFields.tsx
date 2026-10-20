"use client";

// Open/close pickers. <input type="datetime-local"> has no time zone, so
// values are read and written in the *school's* zone (settings.timezone),
// not the teacher's browser zone -- see lib/quizWindow.ts.

import { isoToLocalInput, localInputToIso } from "@/lib/quizWindow";

export function QuizWindowFields({
  opensAt,
  closesAt,
  timeZone,
  onChange,
}: {
  opensAt: string | null;
  closesAt: string | null;
  timeZone: string;
  onChange: (next: { opensAt: string | null; closesAt: string | null }) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-medium text-ink-soft">
        Opens (optional)
        <input
          type="datetime-local"
          value={isoToLocalInput(opensAt, timeZone)}
          onChange={(e) => onChange({ opensAt: localInputToIso(e.target.value, timeZone), closesAt })}
          className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        />
      </label>
      <label className="block text-xs font-medium text-ink-soft">
        Closes (optional)
        <input
          type="datetime-local"
          value={isoToLocalInput(closesAt, timeZone)}
          onChange={(e) => onChange({ opensAt, closesAt: localInputToIso(e.target.value, timeZone) })}
          className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-sm text-ink"
        />
      </label>
      <p className="text-xs text-ink-soft sm:col-span-2">Times are in the school&apos;s time zone ({timeZone}).</p>
    </div>
  );
}
