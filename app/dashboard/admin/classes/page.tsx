// New, not ported. Lists every class -- classes are shared catalog
// data readable by anyone signed in (see 0005 migration), not scoped
// to "classes you administer" the way /admin/spaces is, since a class
// isn't owned by one space.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { ClassCreateForm } from "@/components/admin/ClassCreateForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminClassesPage() {
  await requireUser();
  const supabase = createClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, education_level, level_number")
    .order("name");

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Classes" }]} />
      <h1 className="mb-4 font-display text-xl font-semibold text-ink">Classes</h1>
      <p className="mb-4 text-sm text-ink-soft">
        A class has its own student roster. Tie a space to a class (from that space&apos;s settings)
        and every student in the class can read it — no need to add them per subject.
      </p>

      <ul className="mb-6 space-y-2">
        {(classes ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/admin/classes/${c.id}`}
              className="block rounded-lg border border-rule bg-white p-3 text-ink hover:border-marigold"
            >
              {c.name}
              {c.education_level && (
                <span className="ml-2 text-xs uppercase tracking-wide text-ink-soft">
                  {c.education_level}
                  {c.level_number}
                </span>
              )}
            </Link>
          </li>
        ))}
        {(!classes || classes.length === 0) && (
          <p className="text-sm text-ink-soft">No classes yet.</p>
        )}
      </ul>

      <ClassCreateForm />
    </div>
  );
}
