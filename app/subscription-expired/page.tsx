// Where middleware.ts sends everyone while the school has no active
// subscription session (0036). Lives outside /dashboard on purpose, so it
// doesn't render the dashboard nav (every link there would bounce back
// here). Middleware sends people with an active subscription away from it.

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/session";
import { lockoutMessage, parseSubscriptionStatus } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function SubscriptionExpiredPage() {
  const supabase = createClient();
  const [profile, { data: settings }, { data: rawStatus }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("settings").select("school_name").maybeSingle(),
    supabase.rpc("subscription_status"),
  ]);

  const schoolName = settings?.school_name?.trim() || "Your school";
  const message = lockoutMessage(parseSubscriptionStatus(rawStatus));
  const isAdmin = profile?.role === "admin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-rule bg-white p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">{schoolName}</p>
        <h1 className="font-display text-xl font-semibold text-ink">Access is paused</h1>
        <p className="text-sm text-ink-soft">{message}</p>
        <p className="text-sm text-ink-soft">
          {isAdmin
            ? "Renew the subscription to restore access for everyone. Nothing has been deleted, and notes, homework and results will be back as soon as it's active."
            : "Please ask your school administrator to renew it. Nothing has been deleted, and your notes and results will be back as soon as it's active."}
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-rule px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
