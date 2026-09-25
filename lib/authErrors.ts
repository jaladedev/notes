// The message thrown by getCurrentProfile (lib/supabase/server.ts) and
// assertRole (lib/actions/authGuards.ts) when Supabase's auth server itself
// failed to respond -- a network blip, not "not signed in" -- see
// getCurrentProfile's doc comment for why that distinction matters.
//
// Exported so ErrorState can detect this specific case and give a more
// targeted message/treatment than a generic error, without duplicating the
// string (and risking it drifting out of sync with what's actually thrown).
export const TRANSIENT_AUTH_ERROR_MESSAGE =
  "Couldn't verify your session right now — check your connection and retry.";
