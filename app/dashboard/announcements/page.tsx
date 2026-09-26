// One board for every announcement the signed-in user can see: RLS
// (announcements_visible) already covers school-wide, class-targeted
// (including a parent reading via their child's class), and
// space-targeted rows, so this page just lists what comes back.

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { CreateAnnouncementForm } from "@/components/announcements/CreateAnnouncementForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { markAllAnnouncementsRead } from "@/lib/actions/notifications";

export default async function AnnouncementsPage() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const isAdmin = profile?.role === "admin";

  const { data: staffSpaces } = await supabase
    .from("space_members")
    .select("spaces(id, name)")
    .eq("profile_id", userId)
    .in("role", ["teacher", "reviewer", "admin"]);

  const canPost = isAdmin || (staffSpaces && staffSpaces.length > 0);

  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, created_at, spaces(name), classes(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  await markAllAnnouncementsRead();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Announcements" }]} />
      <h1 className="font-display text-xl font-semibold text-ink">Announcements</h1>

      {canPost && (
        <CreateAnnouncementForm
          isAdmin={isAdmin}
          spaces={(staffSpaces ?? []).map((m: any) => m.spaces).filter(Boolean)}
        />
      )}

      <ul className="space-y-3">
        {(announcements ?? []).map((a: any) => (
          <li key={a.id} className="rounded-xl border border-rule bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-ink">{a.title}</h3>
              <span className="text-xs text-ink-soft">
                {a.spaces?.name ?? a.classes?.name ?? "School-wide"}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{a.body}</p>
            <p className="mt-2 text-xs text-ink-soft">{new Date(a.created_at).toLocaleString()}</p>
          </li>
        ))}
        {(!announcements || announcements.length === 0) && (
          <p className="text-sm text-ink-soft">No announcements yet.</p>
        )}
      </ul>
    </div>
  );
}
