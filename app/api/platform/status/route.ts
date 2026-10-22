// Read-only snapshot for the central platform dashboard. Signed requests only
// (lib/platformAuth.ts); returns 404 unless PLATFORM_SECRET is configured.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizePlatformRequest } from "@/lib/platformRoute";
import { parseSubscriptionStatus } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizePlatformRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const roles = ["admin", "teacher", "student", "parent"] as const;
    const [settings, migration, subscription, ...counts] = await Promise.all([
      admin.from("settings").select("school_name, current_academic_year, current_term, timezone").maybeSingle(),
      admin.from("_schema_migrations").select("name").order("name", { ascending: false }).limit(1).maybeSingle(),
      admin.rpc("subscription_status"),
      ...roles.map((role) =>
        admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", role).eq("is_active", true)
      ),
    ]);

    // A missing function means this school hasn't applied 0036 yet; say so
    // instead of failing the whole snapshot.
    const subscriptionState = subscription.error ? null : parseSubscriptionStatus(subscription.data);

    return NextResponse.json({
      status: "ok",
      schoolName: settings.data?.school_name ?? null,
      academicYear: settings.data?.current_academic_year ?? null,
      term: settings.data?.current_term ?? null,
      timezone: settings.data?.timezone ?? null,
      latestMigration: migration.data?.name ?? null,
      subscription: subscriptionState,
      subscriptionError: subscription.error ? subscription.error.message : null,
      activeUsers: Object.fromEntries(roles.map((role, i) => [role, counts[i]?.count ?? 0])),
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 }
    );
  }
}
