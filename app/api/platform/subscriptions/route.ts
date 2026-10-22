// Vendor-side management of session_subscriptions (0036) for the central
// platform dashboard. Signed requests only; 404 unless PLATFORM_SECRET is set.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizePlatformRequest } from "@/lib/platformRoute";
import { validateSubscriptionInput } from "@/lib/subscriptionInput";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await authorizePlatformRequest(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await createAdminClient()
    .from("session_subscriptions")
    .select("id, academic_year, starts_on, ends_on, grace_days, note, created_at")
    .order("ends_on", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await authorizePlatformRequest(request);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = JSON.parse(auth.body);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = validateSubscriptionInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("session_subscriptions")
    .insert({
      academic_year: parsed.value.academicYear,
      starts_on: parsed.value.startsOn,
      ends_on: parsed.value.endsOn,
      note: parsed.value.note,
      // Omitted when not given, so the column default (7 days) applies.
      ...(parsed.value.graceDays === null ? {} : { grace_days: parsed.value.graceDays }),
    })
    .select("id, academic_year, starts_on, ends_on, grace_days, note, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizePlatformRequest(request);
  if (!auth.ok) return auth.response;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid." }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("session_subscriptions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "No such subscription." }, { status: 404 });
  return NextResponse.json({ deleted: id });
}
