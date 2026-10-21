import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";

// Everything under /dashboard/admin is admin-only. Middleware blocks
// non-admins first; this re-checks on the server so the guard still holds
// if the middleware matcher ever changes. Pages and server actions
// re-check again (assertGlobalRole) -- a layout alone is not a data boundary.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin" || profile.is_active === false) redirect("/dashboard");
  return <>{children}</>;
}
