import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { CreateParentForm } from "@/components/admin/CreateParentForm";
import { AccountActions } from "@/components/admin/AccountActions";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminParentsPage() {
  await assertGlobalRole(["admin"], "Only an admin can manage parent accounts.");
  const supabase = createClient();

  const { data: parents } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_active, must_change_password")
    .eq("role", "parent")
    .order("full_name");

  const { data: students } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .order("full_name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Parents" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">Parents</h1>

      <CreateParentForm students={students ?? []} />

      <ul className="space-y-2">
        {(parents ?? []).map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-white p-3"
          >
            <div>
              <p className="text-sm font-medium text-ink">
                {p.full_name}
                {!p.is_active && (
                  <span className="ml-2 rounded bg-clay/10 px-1.5 py-0.5 text-xs text-clay">
                    Deactivated
                  </span>
                )}
                {p.is_active && p.must_change_password && (
                  <span className="ml-2 rounded bg-marigold-soft px-1.5 py-0.5 text-xs text-marigold-text">
                    Pending first login
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-soft">{p.email}</p>
            </div>
            <AccountActions userId={p.id} email={p.email ?? ""} isActive={p.is_active} />
          </li>
        ))}
        {(!parents || parents.length === 0) && (
          <p className="text-sm text-ink-soft">No parent accounts yet.</p>
        )}
      </ul>
    </div>
  );
}
