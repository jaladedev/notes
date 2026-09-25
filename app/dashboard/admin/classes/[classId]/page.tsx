// New, not ported. Shows a class's roster and every space tied to it --
// this is the "enroll once, read every subject" view (plan discussion:
// closing the gap between the earlier per-space membership and
// school_app's one-class-many-subjects flow).

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/actions/authGuards";
import { ClassRosterPanel } from "@/components/admin/ClassRosterPanel";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function AdminClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  await requireUser();
  const supabase = createClient();

  const { data: klass } = await supabase.from("classes").select("id, name").eq("id", classId).single();
  if (!klass) notFound();

  const { data: members } = await supabase
    .from("class_members")
    .select("profile_id, profiles(full_name)")
    .eq("class_id", classId);

  const { data: spaces } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("class_id", classId);

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Classes", href: "/dashboard/admin/classes" },
          { label: klass.name },
        ]}
      />
      <h1 className="font-display text-xl font-semibold text-ink">{klass.name}</h1>

      <ClassRosterPanel classId={classId} members={(members ?? []) as any} />

      <section className="rounded-xl border border-rule bg-white p-4">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          Spaces using this class ({(spaces ?? []).length})
        </h2>
        <ul className="space-y-1">
          {(spaces ?? []).map((s) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/admin/spaces/${s.id}`}
                className="block rounded-md bg-paper px-3 py-1.5 text-sm text-ink hover:underline"
              >
                {s.name}
              </Link>
            </li>
          ))}
          {(!spaces || spaces.length === 0) && (
            <p className="text-sm text-ink-soft">
              No space uses this class yet. Set it from a space&apos;s settings page.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
