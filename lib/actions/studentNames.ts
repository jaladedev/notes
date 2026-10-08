// Teachers can't read student rows in `profiles` (RLS: own row, or admin),
// so a `profiles(full_name)` embed on homework submissions comes back null
// and the teacher sees submissions with no name. Names are looked up here
// with the admin client instead.
//
// Only call this with ids taken from rows the caller has ALREADY read
// through RLS (e.g. their subject's homework submissions) -- that read is
// the access check; this just fills in the display name.

// NOTE: deliberately NOT a "use server" file. It lives in lib/actions/ only
// because the lint rule on createAdminClient allows it there. Marking it
// "use server" would publish it as a callable endpoint returning any user's
// name for any id; as a plain module it can only be imported by server code.

import { createAdminClient } from "@/lib/supabase/admin";

export async function getProfileNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
}
