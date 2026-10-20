// Server-side read of the school's time zone (settings.timezone, readable
// by everyone via settings_read_all). Falls back to Lagos, the column default.

import { createClient } from "@/lib/supabase/server";

export const DEFAULT_TIME_ZONE = "Africa/Lagos";

export async function getSchoolTimeZone(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("timezone").maybeSingle();
  return (data as { timezone?: string } | null)?.timezone || DEFAULT_TIME_ZONE;
}

/** Current academic year/term as configured by the admin (either may be unset). */
export async function getCurrentTerm(): Promise<{ academicYear: string | null; term: number | null }> {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("current_academic_year, current_term").maybeSingle();
  const row = data as { current_academic_year?: string | null; current_term?: number | null } | null;
  return { academicYear: row?.current_academic_year ?? null, term: row?.current_term ?? null };
}
