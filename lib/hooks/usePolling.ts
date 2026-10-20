"use client";

// Calls `callback` on an interval while the tab is visible. Replaces the
// Supabase Realtime subscriptions the messaging UI used to hold open:
// polling needs no websocket per tab and no `supabase_realtime`
// publication, and RLS applies to every poll like any other query.
//
//  - Runs once immediately on mount (unless `immediate` is false).
//  - Pauses while the tab is hidden and fires straight away when it
//    becomes visible again, so a returning user sees fresh data without
//    waiting out the interval.
//  - Never overlaps: a slow callback delays the next tick instead of
//    stacking requests.
//  - Backs off (up to 4x) after consecutive failures and resets on success.

import { useEffect, useRef } from "react";
import { nextPollDelay } from "@/lib/messagePolling";

export function usePolling(
  callback: () => Promise<void> | void,
  intervalMs: number,
  options: { enabled?: boolean; immediate?: boolean } = {}
) {
  const { enabled = true, immediate = true } = options;
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let failures = 0;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clear();
      if (cancelled || document.visibilityState === "hidden") return;
      timer = setTimeout(tick, nextPollDelay(intervalMs, failures));
    };

    const tick = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        await saved.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        clear();
        void tick();
      } else {
        clear();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (immediate) void tick();
    else schedule();

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled, immediate]);
}
