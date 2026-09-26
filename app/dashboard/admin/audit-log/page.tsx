// Admin-only read of audit_log (0007_feature_expansion.sql). The
// audit_log_admin_read RLS policy already restricts this to admins, so
// a normal request-scoped client is enough -- no service-role needed.

import { createClient } from "@/lib/supabase/server";
import { assertGlobalRole } from "@/lib/actions/authGuards";
import { Breadcrumbs } from "@/components/Breadcrumbs";

const ACTION_LABELS: Record<string, string> = {
  "account.create": "Created account",
  "account.password_reset": "Reset password",
  "account.deactivate": "Deactivated account",
  "account.reactivate": "Reactivated account",
};

function describe(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await assertGlobalRole(["admin"], "Only an admin can view the audit log.");
  const supabase = createClient();

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: entries, count } = await supabase
    .from("audit_log")
    .select("id, action, target_type, target_id, metadata, created_at, profiles(full_name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = count ? Math.ceil(count / pageSize) : 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit log" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">Audit log</h1>
      <p className="text-sm text-ink-soft">
        A record of administrative actions -- account creation, deactivation, deletions.
      </p>

      <ul className="space-y-2">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="rounded-lg border border-rule bg-white p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{describe(e.action)}</span>
              <span className="text-xs text-ink-soft">{new Date(e.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-ink-soft">
              by {(e as any).profiles?.full_name ?? "Unknown"}
              {e.target_type && <> · {e.target_type}</>}
            </p>
            {e.metadata && Object.keys(e.metadata).length > 0 && (
              <pre className="mt-1 overflow-x-auto rounded bg-paper p-2 text-xs text-ink-soft">
                {JSON.stringify(e.metadata, null, 2)}
              </pre>
            )}
          </li>
        ))}
        {(entries ?? []).length === 0 && <p className="text-sm text-ink-soft">No entries yet.</p>}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <a
            href={`?page=${Math.max(1, page - 1)}`}
            aria-disabled={page <= 1}
            className={`rounded-lg border border-rule px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-paper"}`}
          >
            Previous
          </a>
          <span className="text-ink-soft">
            Page {page} of {totalPages}
          </span>
          <a
            href={`?page=${Math.min(totalPages, page + 1)}`}
            aria-disabled={page >= totalPages}
            className={`rounded-lg border border-rule px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-paper"}`}
          >
            Next
          </a>
        </div>
      )}
    </div>
  );
}
