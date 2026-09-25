"use client";

import { useEffect, useMemo, useState } from "react";
import { nowInZone } from "@/lib/timetable";

export type BellTimerEntry = {
  id: string;
  periodNumber: number;
  startTime: string; // "HH:MM:SS"
  endTime: string; // "HH:MM:SS"
  subjectName: string;
  className: string;
};

const WARNING_THRESHOLD_SECONDS = 5 * 60;
// How long the "Time's up" flash stays on screen after a period ends,
// before the banner disappears entirely again.
const TIME_UP_GRACE_SECONDS = 60;

// "HH:MM:SS" (today, local time) -> seconds since midnight. Only the
// hour/minute/second components are used — the DB stores a plain `time`
// column with no date or timezone, so this is inherently a "wall clock
// time today" comparison, made against the school's zone (see nowInZone).
function toSecondsSinceMidnight(hms: string): number {
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Plays a short two-tone chime via the Web Audio API — no audio asset
 * needed, works offline, and is cheap enough to fire on every threshold
 * crossing without any preloading.
 */
function playChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.28);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.28 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.28 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.28);
      osc.stop(now + i * 0.28 + 0.4);
    });
    // Auto-closes once the tail finishes playing, so this doesn't leak
    // an AudioContext per chime over a full teaching day.
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // Audio isn't available in every environment (e.g. some in-app
    // browsers) — the visual countdown is the source of truth either
    // way, so a failed chime is silently skipped.
  }
}

/**
 * Deliberately quiet most of the time. A projected classroom screen
 * doesn't need a countdown running for the whole 40-minute period — it
 * only needs to interrupt with the "wind it up" warning near the end,
 * and a brief "time's up" flash right after the bell. Outside those two
 * windows this renders nothing, so it never competes with the note
 * content on-screen for the current period.
 */
export function BellTimer({ entries, timeZone }: { entries: BellTimerEntry[]; timeZone?: string }) {
  // Seconds since midnight on the *school's* clock (its IANA zone), not the
  // device's: a projector laptop with the wrong zone would otherwise ring
  // the bell at the wrong time.
  const [nowSeconds, setNowSeconds] = useState(() => nowInZone(new Date(), timeZone).seconds);
  const [soundOn, setSoundOn] = useState(true);
  const [chimedFiveMin, setChimedFiveMin] = useState<Set<string>>(new Set());
  const [chimedEnd, setChimedEnd] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      setNowSeconds(nowInZone(new Date(), timeZone).seconds);
    }, 1000);
    return () => clearInterval(id);
  }, [timeZone]);

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) => toSecondsSinceMidnight(a.startTime) - toSecondsSinceMidnight(b.startTime)
      ),
    [entries]
  );

  const current = sorted.find(
    (e) =>
      toSecondsSinceMidnight(e.startTime) <= nowSeconds &&
      nowSeconds < toSecondsSinceMidnight(e.endTime)
  );
  const secondsLeftInCurrent = current
    ? toSecondsSinceMidnight(current.endTime) - nowSeconds
    : null;
  const isWarning =
    secondsLeftInCurrent !== null && secondsLeftInCurrent <= WARNING_THRESHOLD_SECONDS;

  // Most recently-ended period, only while still inside its grace window —
  // this is what drives the "Time's up" flash once the countdown itself
  // has nothing left to count down.
  const justEnded = sorted.find((e) => {
    const secondsSinceEnd = nowSeconds - toSecondsSinceMidnight(e.endTime);
    return secondsSinceEnd >= 0 && secondsSinceEnd <= TIME_UP_GRACE_SECONDS;
  });

  // Fire the chime exactly once per crossing per entry, not on every
  // render/tick while the condition stays true.
  useEffect(() => {
    if (!soundOn || !current) return;
    if (isWarning && !chimedFiveMin.has(current.id)) {
      playChime();
      setChimedFiveMin((prev) => new Set(prev).add(current.id));
    }
  }, [isWarning, current, soundOn, chimedFiveMin]);

  useEffect(() => {
    if (!soundOn || !justEnded) return;
    if (!chimedEnd.has(justEnded.id)) {
      playChime();
      setChimedEnd((prev) => new Set(prev).add(justEnded.id));
    }
  }, [justEnded, soundOn, chimedEnd]);

  if (!isWarning && !justEnded) return null;

  return (
    <div
      className={`mb-6 flex items-center justify-between rounded-xl border p-4 transition-colors ${
        justEnded ? "border-clay bg-clay text-white" : "border-clay bg-clay/10"
      }`}
    >
      <div>
        {isWarning && current ? (
          <>
            <p
              className={`text-xs uppercase tracking-wide ${justEnded ? "text-white/80" : "text-ink-soft"}`}
            >
              Period {current.periodNumber} · wrapping up
            </p>
            <p
              className={`font-display text-lg font-semibold ${justEnded ? "text-white" : "text-ink"}`}
            >
              {current.subjectName} — {current.className}
            </p>
          </>
        ) : (
          justEnded && (
            <p className="font-display text-lg font-semibold text-white">
              Time&apos;s up — {justEnded.subjectName} has ended
            </p>
          )
        )}
      </div>
      <div className="flex items-center gap-3">
        {isWarning && secondsLeftInCurrent !== null && (
          <span className="font-display text-2xl font-semibold tabular-nums text-clay">
            {formatClock(secondsLeftInCurrent)}
          </span>
        )}
        <button
          onClick={() => setSoundOn((v) => !v)}
          aria-label={soundOn ? "Mute bell" : "Unmute bell"}
          title={soundOn ? "Bell sound on" : "Bell sound off"}
          className={`rounded-lg border p-2 hover:opacity-80 ${
            justEnded ? "border-white/40 text-white" : "border-rule text-ink-soft"
          }`}
        >
          {soundOn ? "🔔" : "🔕"}
        </button>
      </div>
    </div>
  );
}
