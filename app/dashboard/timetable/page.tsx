// Read-only timetable for everyone who isn't editing it. RLS decides what
// comes back: a student gets their class's lessons, a parent their
// children's classes', a teacher the lessons of spaces they belong to.
// Teachers see just their own week (one grid, class in each cell);
// students and parents see one grid per class.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { getTimetable } from "@/lib/actions/timetable";
import { TimetableGridView } from "@/components/timetable/TimetableGridView";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { TimetableRow } from "@/lib/timetable";

export default async function TimetablePage() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role === "admin") redirect("/dashboard/admin/timetable");

  const isTeacher = profile?.role === "teacher";
  const { periods, rows } = await getTimetable(isTeacher ? { teacherId: userId } : {});

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Timetable" }]} />
        <h1 className="mb-2 font-display text-xl font-semibold text-ink">Timetable</h1>
        <p className="text-sm text-ink-soft">
          {isTeacher
            ? "No lessons are assigned to you yet. An admin sets the timetable."
            : "The timetable for your class hasn't been set up yet."}
        </p>
      </div>
    );
  }

  const byClass = new Map<string, { name: string; rows: TimetableRow[] }>();
  for (const r of rows) {
    const group = byClass.get(r.class_id) ?? { name: r.class_name, rows: [] };
    group.rows.push(r);
    byClass.set(r.class_id, group);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Timetable" }]} />
      {isTeacher ? (
        <>
          <h1 className="font-display text-xl font-semibold text-ink">My week</h1>
          <TimetableGridView periods={periods} rows={rows} showClass />
        </>
      ) : (
        [...byClass.entries()].map(([classId, group]) => (
          <section key={classId} className="space-y-2">
            <h1 className="font-display text-xl font-semibold text-ink">{group.name} timetable</h1>
            <TimetableGridView periods={periods} rows={group.rows} />
          </section>
        ))
      )}
    </div>
  );
}
