import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { CreateStudentForm } from "@/components/admin/CreateStudentForm";
import { AccountActions } from "@/components/admin/AccountActions";

export default async function AdminStudentsPage() {
  await assertGlobalRole(["admin"], "Only an admin can manage student accounts.");
  const supabase = createClient();

  const { data: students } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active, must_change_password")
    .eq("role", "student")
    .order("full_name");

  const { data: classes } = await supabase.from("classes").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="font-display text-xl font-semibold text-ink">Students</h1>

      <CreateStudentForm classes={classes ?? []} />

      <ul className="space-y-2">
        {(students ?? []).map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-white p-3"
          >
            <div>
              <p className="text-sm font-medium text-ink">
                {s.full_name}
                {!s.is_active && (
                  <span className="ml-2 rounded bg-clay/10 px-1.5 py-0.5 text-xs text-clay">
                    Deactivated
                  </span>
                )}
                {s.is_active && s.must_change_password && (
                  <span className="ml-2 rounded bg-marigold-soft px-1.5 py-0.5 text-xs text-marigold-text">
                    Pending first login
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-soft">{s.email}</p>
            </div>
            <AccountActions userId={s.id} email={s.email ?? ""} isActive={s.is_active} />
          </li>
        ))}
        {(!students || students.length === 0) && (
          <p className="text-sm text-ink-soft">No student accounts yet.</p>
        )}
      </ul>
    </div>
  );
}
