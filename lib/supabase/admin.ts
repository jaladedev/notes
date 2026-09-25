import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env.server";
import { loggingFetch } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// SERVER-ONLY. Never import this from a Client Component ("use client")
// file — the service role key bypasses RLS entirely and must never reach
// the browser bundle. It has no NEXT_PUBLIC_ prefix specifically so that
// Next.js never inlines it into client code.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // Without this, this client falls back to Next's own patched global
      // fetch, which isn't forced to HTTP/1.1 -- it hit the exact same
      // ERR_HTTP2_INVALID_SESSION connection-corruption bug as the
      // unpatched server client did before that fix, just here instead.
      global: { fetch: loggingFetch },
    }
  );
}
