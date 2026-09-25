// New, not ported (no equivalent "space" admin surface in school_app --
// see plan doc section 5). Any space the signed-in user administers,
// listed here; creating one makes you its first admin (see createSpace).
// A space's curriculum fields (subject/level/year/term) are shown when
// set, same grouping label school_app derives for curriculum_topics.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { SpaceCreateForm } from "@/components/admin/SpaceCreateForm";

export default async function AdminSpacesPage() {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const { data: memberships } = await supabase
    .from("space_members")
    .select("spaces(id, name, education_level, level_number, term, academic_year)")
    .eq("profile_id", userId)
    .eq("role", "admin");

  const { data: subjects } = await supabase.from("subjects").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">Spaces you administer</h1>

      <ul className="mb-6 space-y-2">
        {(memberships ?? []).map((m: any) => (
          <li key={m.spaces.id}>
            <Link
              href={`/dashboard/admin/spaces/${m.spaces.id}`}
              className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
            >
              {m.spaces.name}
              {m.spaces.education_level && (
                <span className="ml-2 text-xs uppercase tracking-wide text-ink-soft">
                  {m.spaces.education_level}
                  {m.spaces.level_number} · {m.spaces.academic_year} · Term {m.spaces.term}
                </span>
              )}
            </Link>
          </li>
        ))}
        {(!memberships || memberships.length === 0) && (
          <p className="text-sm text-ink-soft">You don&apos;t administer any spaces yet.</p>
        )}
      </ul>

      <SpaceCreateForm subjects={subjects ?? []} />
    </div>
  );
}
