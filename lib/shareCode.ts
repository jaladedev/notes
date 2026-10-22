// Access codes for share links (app/shared/[token]).
//
// - Codes are never stored in plain text: only a salted scrypt hash.
// - Comparisons are constant-time.
// - A viewer who enters the right code gets a short-lived proof cookie
//   (HMAC keyed by the stored hash), so the code itself is never put in a
//   URL, browser history or server log. Changing or removing the code
//   invalidates every outstanding proof.
//
// Plain module on purpose (not "use server"): nothing here may become a
// callable endpoint.

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 32;

export const PROOF_COOKIE = "share_proof";
export const PROOF_MAX_AGE_SECONDS = 8 * 60 * 60;

function derive(code: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(code, salt, KEY_LEN, { N: n, r, p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** `scrypt$N$r$p$<salt b64>$<hash b64>` */
export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(code, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length !== KEY_LEN) return false;
  try {
    const actual = await derive(code, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Constant-time equality for two strings of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function mac(storedHash: string, token: string, issuedAt: number): string {
  return createHmac("sha256", storedHash).update(`${token}.${issuedAt}`).digest("hex");
}

/** Cookie value proving the viewer entered the right code: `<issuedAt>.<hmac>`. */
export function makeUnlockProof(storedHash: string, token: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  return `${nowSeconds}.${mac(storedHash, token, nowSeconds)}`;
}

export function verifyUnlockProof(
  storedHash: string,
  token: string,
  proof: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!proof) return false;
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(proof);
  if (!m) return false;
  const issuedAt = Number(m[1]);
  if (issuedAt > nowSeconds + 60 || nowSeconds - issuedAt > PROOF_MAX_AGE_SECONDS) return false;
  return safeEqual(m[2], mac(storedHash, token, issuedAt));
}

/**
 * Best-effort failed-attempt limiter, in memory. On serverless hosting each
 * instance counts separately, so this slows guessing rather than stopping a
 * determined attacker; scrypt's cost and a long random code do the rest.
 */
export function createAttemptLimiter(maxFailures: number, windowMs: number) {
  const failures = new Map<string, number[]>();
  const recent = (key: string, now: number) => (failures.get(key) ?? []).filter((t) => now - t < windowMs);
  return {
    isBlocked(key: string, now = Date.now()): boolean {
      return recent(key, now).length >= maxFailures;
    },
    recordFailure(key: string, now = Date.now()): void {
      const list = recent(key, now);
      list.push(now);
      failures.set(key, list);
      if (failures.size > 5000) {
        for (const [k] of failures) {
          if (recent(k, now).length === 0) failures.delete(k);
        }
      }
    },
    reset(key: string): void {
      failures.delete(key);
    },
  };
}
