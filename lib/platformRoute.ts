// Shared gate for app/api/platform/* route handlers. Reads the body once
// (it is part of the signature) and returns either a ready error response
// or the verified body text.

import { NextResponse, type NextRequest } from "next/server";
import { verifyPlatformRequest } from "@/lib/platformAuth";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export async function authorizePlatformRequest(
  request: NextRequest
): Promise<{ ok: true; body: string } | { ok: false; response: NextResponse }> {
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  const result = verifyPlatformRequest({
    secret: process.env.PLATFORM_SECRET,
    timestampHeader: request.headers.get("x-platform-timestamp"),
    signatureHeader: request.headers.get("x-platform-signature"),
    method: request.method,
    pathAndQuery: request.nextUrl.pathname + request.nextUrl.search,
    body,
  });
  if (result.ok) {
    // Replay guard (0043): a signature is good for ONE use inside the window.
    // Fails open if the lookup errors or 0043 isn't applied yet -- a broken
    // guard must not lock the vendor out of managing the school.
    const signature = request.headers.get("x-platform-signature") ?? "";
    try {
      const { data, error } = await createAdminClient().rpc("platform_claim_request", { p_signature: signature });
      if (error) {
        logger.warn("platform api: replay guard unavailable, allowing the request", { error: error.message });
      } else if (data === false) {
        logger.warn("platform api: rejected request", { reason: "replay", path: request.nextUrl.pathname });
        return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
      }
    } catch (e) {
      logger.warn("platform api: replay guard failed, allowing the request", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return { ok: true, body };
  }

  // "disabled" looks like a route that doesn't exist, so a school that never
  // turned this on doesn't advertise it. Everything else is a plain 401 with
  // no hint about which check failed.
  if (result.reason === "disabled") {
    return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  logger.warn("platform api: rejected request", { reason: result.reason, path: request.nextUrl.pathname });
  return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}
