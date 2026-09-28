// NOT a "use server" file -- just a type and a helper that the action
// files import.
//
// Why this exists: in a production build, Next.js replaces the message of
// any error *thrown* from a server action with a generic "An error
// occurred in the Server Components render..." text (so internals never
// leak). That also wipes out the deliberate, user-facing messages this
// app throws ("An account with this email already exists.", etc.), so the
// UI could only ever show the generic text on Vercel.
//
// Errors that are *returned* are ordinary data and arrive intact, so
// actions called from client forms return an ActionResult instead.

import { logger } from "@/lib/logger";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

// redirect() / notFound() / forbidden() work by throwing a special error;
// swallowing it would break navigation, so always let those through.
function isNextControlFlowError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

/**
 * Runs `fn`, returning `{ ok: true, data }` or `{ ok: false, error }`.
 *
 * Only a plain `Error` (i.e. a deliberate `throw new Error("...")` or
 * `throwDbError(...)`) has its message passed to the client. Anything
 * else -- a TypeError from a bug, a library error subclass -- is logged
 * in full on the server and replaced by a generic message, so unexpected
 * internals still never reach the browser.
 */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    logger.error("server action failed", { error: err });
    const deliberate = err instanceof Error && err.constructor === Error && err.message;
    return { ok: false, error: deliberate ? err.message : GENERIC_ERROR };
  }
}