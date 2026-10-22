// Request signing for the central platform dashboard (app/api/platform/*).
// The dashboard is a separate app that manages many schools; each school
// deployment trusts it only through a per-school shared secret
// (PLATFORM_SECRET), never through a user session or a database key.
//
// Signature = hex HMAC-SHA256(secret, `${timestamp}.${METHOD}.${pathAndQuery}.${body}`)
// sent as x-platform-timestamp (unix seconds) and x-platform-signature.
// The dashboard keeps its own copy of this algorithm (platform-dashboard/
// lib/sign.ts); tests/platform-auth.test.ts and its twin share one fixed
// vector so the two cannot drift apart.
//
// Replay: a captured request is only reusable inside the timestamp window
// (5 minutes). The endpoints are idempotent enough that this is acceptable;
// it is not a nonce scheme.

import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_SECONDS = 300;
export const MIN_SECRET_LENGTH = 32;

export function signPlatformRequest(input: {
  secret: string;
  timestamp: number;
  method: string;
  pathAndQuery: string;
  body: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.method.toUpperCase()}.${input.pathAndQuery}.${input.body}`)
    .digest("hex");
}

export type PlatformAuthResult = { ok: true } | { ok: false; reason: "disabled" | "stale" | "bad_signature" | "malformed" };

export function verifyPlatformRequest(input: {
  secret: string | undefined;
  timestampHeader: string | null;
  signatureHeader: string | null;
  method: string;
  pathAndQuery: string;
  body: string;
  nowSeconds?: number;
}): PlatformAuthResult {
  // Unset or weak secret = the whole API is switched off.
  if (!input.secret || input.secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: "disabled" };
  if (!input.timestampHeader || !input.signatureHeader) return { ok: false, reason: "malformed" };
  if (!/^\d{1,12}$/.test(input.timestampHeader) || !/^[0-9a-f]{64}$/.test(input.signatureHeader)) {
    return { ok: false, reason: "malformed" };
  }

  const timestamp = Number(input.timestampHeader);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

  const expected = signPlatformRequest({
    secret: input.secret,
    timestamp,
    method: input.method,
    pathAndQuery: input.pathAndQuery,
    body: input.body,
  });
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(input.signatureHeader, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
