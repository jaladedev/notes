// Admin account management: staff. Reads go through the request-scoped
// client (createClient), not the admin client -- profiles_admin_read_all
// (0008_admin_profile_list.sql) already lets an admin see every row, so
// no service-role bypass is needed just to list them.

import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { CreateTeacherForm } from "@/components/admin/CreateTeacherForm";
import { AccountActions } from "@/components/admin/AccountActions";

export default async function AdminStaffPage() {
  await assertGlobalRole(["admin"], "Only an admin can manage staff accounts.");
  const supabase = createClient();

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active, must_change_password")
    .eq("role", "teacher")
    .order("full_name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="font-display text-xl font-semibold text-ink">Staff</h1>

      <CreateTeacherForm />

      <ul className="space-y-2">
        {(staff ?? []).map((s) => (
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
        {(!staff || staff.length === 0) && (
          <p className="text-sm text-ink-soft">No staff accounts yet.</p>
        )}
      </ul>
    </div>
  );
}
