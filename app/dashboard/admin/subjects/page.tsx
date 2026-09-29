// Replaces admin/spaces. A subject is now just a name -- topics (with
// their level/year/term) and teacher assignments live on the subject's
// own page.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { SubjectCreateForm } from "@/components/admin/SubjectCreateForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminSubjectsPage() {
  await requireUser();
  const supabase = createClient();

  const { data: subjects } = await supabase.from("subjects").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Subjects" }]} />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">Subjects</h1>

      <ul className="mb-6 space-y-2">
        {(subjects ?? []).map((s) => (
          <li key={s.id}>
            <Link
              href={`/dashboard/admin/subjects/${s.id}`}
              className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
            >
              {s.name}
            </Link>
          </li>
        ))}
        {(!subjects || subjects.length === 0) && (
          <p className="text-sm text-ink-soft">No subjects yet.</p>
        )}
      </ul>

      <SubjectCreateForm />
    </div>
  );
}
