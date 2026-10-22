import { describe, expect, it } from "vitest";
import {
  PROOF_MAX_AGE_SECONDS,
  createAttemptLimiter,
  hashAccessCode,
  makeUnlockProof,
  safeEqual,
  verifyAccessCode,
  verifyUnlockProof,
} from "@/lib/shareCode";

describe("access code hashing", () => {
  it("never stores the code and salts every hash", async () => {
    const a = await hashAccessCode("maths-2026");
    const b = await hashAccessCode("maths-2026");
    expect(a).not.toContain("maths-2026");
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("verifies the right code and rejects wrong ones", async () => {
    const h = await hashAccessCode("maths-2026");
    expect(await verifyAccessCode("maths-2026", h)).toBe(true);
    expect(await verifyAccessCode("maths-2027", h)).toBe(false);
    expect(await verifyAccessCode("", h)).toBe(false);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyAccessCode("x", "plaintext")).toBe(false);
    expect(await verifyAccessCode("x", "scrypt$1$2$3$4")).toBe(false);
    expect(await verifyAccessCode("x", "scrypt$16384$8$1$AAAA$AAAA")).toBe(false);
  });

  it("safeEqual compares strings of different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});

describe("unlock proof cookie", () => {
  const hash = "scrypt$16384$8$1$c2FsdA==$aGFzaA==";
  const now = 1_800_000_000;

  it("accepts a fresh proof for the same link and hash", () => {
    const proof = makeUnlockProof(hash, "tok", now);
    expect(verifyUnlockProof(hash, "tok", proof, now + 60)).toBe(true);
  });

  it("rejects a proof for another link", () => {
    const proof = makeUnlockProof(hash, "tok", now);
    expect(verifyUnlockProof(hash, "other", proof, now)).toBe(false);
  });

  it("is invalidated when the code (hash) changes", () => {
    const proof = makeUnlockProof(hash, "tok", now);
    expect(verifyUnlockProof(hash + "x", "tok", proof, now)).toBe(false);
  });

  it("expires", () => {
    const proof = makeUnlockProof(hash, "tok", now);
    expect(verifyUnlockProof(hash, "tok", proof, now + PROOF_MAX_AGE_SECONDS + 1)).toBe(false);
  });

  it("rejects tampering, future timestamps and junk", () => {
    const proof = makeUnlockProof(hash, "tok", now);
    const [, mac] = proof.split(".");
    expect(verifyUnlockProof(hash, "tok", `${now + 1}.${mac}`, now + 1)).toBe(false);
    expect(verifyUnlockProof(hash, "tok", makeUnlockProof(hash, "tok", now + 3600), now)).toBe(false);
    expect(verifyUnlockProof(hash, "tok", undefined, now)).toBe(false);
    expect(verifyUnlockProof(hash, "tok", "nope", now)).toBe(false);
  });
});

describe("attempt limiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    const l = createAttemptLimiter(3, 1000);
    for (let i = 0; i < 3; i++) l.recordFailure("k", 0);
    expect(l.isBlocked("k", 500)).toBe(true);
    expect(l.isBlocked("k", 1001)).toBe(false);
    expect(l.isBlocked("other", 0)).toBe(false);
  });

  it("reset clears the count", () => {
    const l = createAttemptLimiter(1, 1000);
    l.recordFailure("k", 0);
    l.reset("k");
    expect(l.isBlocked("k", 1)).toBe(false);
  });
});
