import { cache } from "react";
import { Agent } from "undici";
import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/logger";
import { TRANSIENT_AUTH_ERROR_MESSAGE } from "@/lib/authErrors";

// Plain wrapper around Node's own global fetch, forced to HTTP/1.1 --
// but *only* outside Vercel (see the `isVercel` check below).
//
// NOT a singleton -- this Agent is constructed fresh on every call and
// never stored on globalThis or at module scope, specifically to avoid the
// earlier Fast-Refresh/pooled-connection lifecycle bug. Its only purpose
// is `allowH2: false`.
//
// Why: the logs showed one request hit a corrupted TLS connection ("bad
// record mac" -- almost certainly TLS-inspecting AV/VPN software mangling
// records, not something fixable from application code), and the
// *retry* immediately failed too, with `ERR_HTTP2_INVALID_SESSION` /
// "session has been destroyed". That's HTTP/2 connection multiplexing
// working against us: undici was reusing the same pooled HTTP/2
// connection for the retry, so a single corrupted connection took every
// request on it down with it, retries included. Forcing HTTP/1.1 means a
// retry opens a genuinely new connection instead of reusing a poisoned
// one, so `getUserWithRetry`'s existing retry can actually succeed rather
// than being doomed by construction. Logs and rethrows unchanged --
// behavior (including existing retry logic) is otherwise unaffected.
//
// Vercel gate: that TLS corruption was local-machine AV/VPN interference,
// never observed in production. The standalone `undici` npm package this
// Agent comes from doesn't match the internal undici version Vercel's
// Next.js runtime patches `fetch` through -- passing this dispatcher
// there breaks the internal request-handler contract with
// `UND_ERR_INVALID_ARG: invalid onRequestStart method`, which took down
// *every* Supabase call (auth, REST) in production. Vercel sets
// `process.env.VERCEL` in every one of its own environments (prod,
// preview, `vercel dev`), so this restores the fix exactly where it's
// needed (a developer's own machine) without it ever reaching Vercel's
// runtime again.
const isVercel = Boolean(process.env.VERCEL);

export async function loggingFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      cache: "no-store",
      ...(isVercel
        ? {}
        : {
            // `dispatcher` is an undici-specific extension to RequestInit;
            // Node's global fetch is undici under the hood and accepts it,
            // but the DOM lib types don't know about it. Object-spread
            // here (rather than a direct property) means TS no longer
            // does excess-property checking against it, so the type
            // suppression comment this line used to need isn't required.
            dispatcher: new Agent({ allowH2: false }),
          }),
    });
  } catch (err) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    logger.error("loggingFetch: request failed", { url, error: err });
    throw err;
  }
}

export function createClient() {
  const cookieStorePromise = cookies();

  return createServerClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { fetch: loggingFetch },
      cookies: {
        async getAll() {
          const cookieStore = await cookieStorePromise;
          return cookieStore.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const cookieStore = await cookieStorePromise;
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when
            // middleware is refreshing sessions.
          }
        },
      },
    }
  );
}

// Shared by every server-side call site that needs the current user (this
// file's getCurrentProfile, plus assertRole/clearMustChangePassword in
// lib/actions/authGuards.ts and the ownership check in lib/actions/fees.ts).
// Extracted so all of them get the same retry-on-transient-network-blip
// behavior -- a raw, unguarded `await supabase.auth.getUser()` treats a
// network hiccup exactly the same as "not signed in" (both come back as
// `user: null`), which surfaced as a real bug: `assertRole` was throwing
// "You must be signed in." for a legitimately signed-in teacher purely
// because of an intermittent local network fetch failure, right in the
// middle of the exact same network flakiness this retry already handles
// gracefully everywhere else it's used.
export async function getUserWithRetry(supabase: SupabaseClient<Database>) {
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"] = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
    if (!error || !isAuthRetryableFetchError(error)) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { user, error, isTransient: error ? isAuthRetryableFetchError(error) : false };
}

// Fetch the current user's profile (role, name) — used across dashboard pages.
//
// Wrapped in React's cache() because it's called independently by every
// nested layout/page that needs it (DashboardLayout, TeacherLayout,
// TeacherNoteEditPage, etc. all call it for the same incoming request).
// Without dedup, that's 2-3+ concurrent `auth.getUser()` calls to the same
// Supabase host, multiplexed over one shared HTTP/2 connection -- which is
// what was actually behind the "session has been destroyed"
// (ERR_HTTP2_INVALID_SESSION) and "bad record mac" TLS errors: one
// concurrent stream on that shared connection gets corrupted (very likely
// by TLS-inspecting AV/VPN software, given the bad-record-mac signature)
// and every other in-flight request on the same connection cascade-fails.
// cache() makes this a per-request memo, so within a single incoming
// request it actually only fires once no matter how many layouts/pages
// call it -- cutting concurrent connection pressure to begin with, which
// is a more direct fix than anything at the fetch/Agent layer.
export const getCurrentProfile = cache(async function getCurrentProfile() {
  const supabase = createClient();

  // A cold connection (first outbound request after the dev server starts,
  // or after any idle period) is the single most common cause of a
  // transient getUser() failure in practice -- getUserWithRetry's retry
  // exists specifically for that case: one short-lived retry, so a one-off
  // blip resolves silently instead of surfacing the retry-screen error
  // every single time. If it fails twice in a row, that's no longer "the
  // connection was cold," so it's let through to the error path below.
  const { user, error: getUserError, isTransient } = await getUserWithRetry(supabase);

  // A null user here has two very different causes: genuinely not signed
  // in, or the request to Supabase's Auth server itself failed (network
  // blip). Every dashboard layout treats a null return from this function
  // as "not logged in" and redirects to /login -- which is correct for the
  // first case but actively wrong for the second: it silently signs out a
  // legitimately logged-in person because of a transient network hiccup.
  // Throwing here instead lets that case surface as a normal error (caught
  // by Next's nearest error.tsx, which has a built-in retry), rather than
  // masquerading as a logout.
  if (getUserError && isTransient) {
    // The thrown Error's [cause] only ever showed
    // `AuthRetryableFetchError: fetch failed` -- that's supabase-js's own
    // wrapper, not the actual network error underneath it. logger.error
    // serializes the full cause chain (server-side, so it lands in the
    // terminal, not the browser), surfacing what undici/fetch actually
    // failed with (ECONNRESET, a TLS error, a timeout, etc.) instead of
    // the opaque one-line message the error screen shows.
    logger.error("getCurrentProfile: Supabase auth fetch failed", { error: getUserError });
    throw new Error(TRANSIENT_AUTH_ERROR_MESSAGE, {
      cause: getUserError,
    });
  }

  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  // No is_active/deactivation flow in this app (unlike school_app) --
  // a profile row existing is sufficient.
  if (!profile) {
    await supabase.auth.signOut();
    return null;
  }

  return profile;
});
