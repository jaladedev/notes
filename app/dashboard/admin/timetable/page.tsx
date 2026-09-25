// School timetable, admin home: the shared bell schedule plus one link per
// class to that class's weekly grid. New, not ported -- school_app's
// timetable_entries is per class/subject/teacher/term; here it is per class
// and space, recurring weekly (see 0011_school_timetable.sql).

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { getSchoolTimeZone, getTimetable } from "@/lib/actions/timetable";
import { PeriodsPanel } from "@/components/admin/PeriodsPanel";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminTimetablePage() {
  await assertGlobalRole(["admin"], "Only an admin can manage the timetable.");
  const supabase = createClient();

  const [{ periods }, timeZone, { data: classes }, { data: entries }] = await Promise.all([
    getTimetable(),
    getSchoolTimeZone(),
    supabase.from("classes").select("id, name, education_level, level_number").order("name"),
    supabase.from("timetable_entries").select("class_id"),
  ]);

  const lessonCount = new Map<string, number>();
  for (const e of entries ?? []) lessonCount.set(e.class_id, (lessonCount.get(e.class_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Timetable" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">Timetable</h1>

      <PeriodsPanel periods={periods} timeZone={timeZone} />

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Classes</h2>
        {periods.length === 0 && (
          <p className="mb-3 text-sm text-ink-soft">Set up the bell schedule above before filling in a class.</p>
        )}
        <ul className="space-y-2">
          {(classes ?? []).map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/admin/timetable/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
              >
                <span>{c.name}</span>
                <span className="text-xs text-ink-soft">
                  {lessonCount.get(c.id) ?? 0} lesson{lessonCount.get(c.id) === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
          {(!classes || classes.length === 0) && (
            <p className="text-sm text-ink-soft">
              No classes yet. Create one under{" "}
              <Link href="/dashboard/admin/classes" className="underline">
                Classes
              </Link>
              .
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
