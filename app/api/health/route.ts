// New, not ported. Per the plan doc's risks section: "support across N
// databases" needs a way to check which schema version each school's
// deployment is actually running, without logging into its Supabase
// project directly.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("_schema_migrations")
      .select("name")
      .order("name", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      status: "ok",
      latestMigration: data?.name ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 }
    );
  }
}
