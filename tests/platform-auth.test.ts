import { describe, expect, it } from "vitest";
import { signPlatformRequest, verifyPlatformRequest } from "@/lib/platformAuth";

const secret = "s".repeat(32);
// Shared with platform-dashboard/tests/sign.test.ts: if either side changes the
// algorithm, one of the two tests fails.
const VECTOR = { timestamp: 1760000000, method: "POST", pathAndQuery: "/api/platform/subscriptions?x=1", body: '{"a":1}' };
const VECTOR_SIGNATURE = "34abd77f6bedbb06d6ccc7068f398fa5fbbc70e86628f90c4dc7d2eb2cc9f88f";

function verify(over: Partial<Parameters<typeof verifyPlatformRequest>[0]> = {}) {
  const sig = signPlatformRequest({ secret, ...VECTOR });
  return verifyPlatformRequest({
    secret,
    timestampHeader: String(VECTOR.timestamp),
    signatureHeader: sig,
    method: VECTOR.method,
    pathAndQuery: VECTOR.pathAndQuery,
    body: VECTOR.body,
    nowSeconds: VECTOR.timestamp + 10,
    ...over,
  });
}

describe("signPlatformRequest", () => {
  it("matches the shared test vector", () => {
    expect(signPlatformRequest({ secret, ...VECTOR })).toBe(VECTOR_SIGNATURE);
  });
  it("treats the method case-insensitively", () => {
    expect(signPlatformRequest({ secret, ...VECTOR, method: "post" })).toBe(VECTOR_SIGNATURE);
  });
});

describe("verifyPlatformRequest", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verify()).toEqual({ ok: true });
  });
  it("is disabled when the secret is unset or too short", () => {
    expect(verify({ secret: undefined })).toEqual({ ok: false, reason: "disabled" });
    expect(verify({ secret: "short" })).toEqual({ ok: false, reason: "disabled" });
  });
  it("rejects missing or malformed headers", () => {
    expect(verify({ signatureHeader: null })).toEqual({ ok: false, reason: "malformed" });
    expect(verify({ timestampHeader: null })).toEqual({ ok: false, reason: "malformed" });
    expect(verify({ signatureHeader: "zz" })).toEqual({ ok: false, reason: "malformed" });
    expect(verify({ timestampHeader: "12ab" })).toEqual({ ok: false, reason: "malformed" });
  });
  it("rejects a stale or future timestamp", () => {
    expect(verify({ nowSeconds: VECTOR.timestamp + 301 })).toEqual({ ok: false, reason: "stale" });
    expect(verify({ nowSeconds: VECTOR.timestamp - 301 })).toEqual({ ok: false, reason: "stale" });
    expect(verify({ nowSeconds: VECTOR.timestamp + 300 })).toEqual({ ok: true });
  });
  it("rejects a tampered body, path or method", () => {
    expect(verify({ body: '{"a":2}' })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verify({ pathAndQuery: "/api/platform/subscriptions?x=2" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verify({ method: "DELETE" })).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejects a signature made with a different secret", () => {
    expect(verify({ secret: "t".repeat(32) })).toEqual({ ok: false, reason: "bad_signature" });
  });
});
