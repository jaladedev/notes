// Adapted from jaladedev/school_app's app/page.tsx (its real marketing
// landing page), not the earlier auth-redirect-only version of this
// file. Content rewritten for what THIS app actually does -- notes,
// homework, quizzes, timetable -- since school_app's copy covers fees,
// grades and attendance, none of which exist here.
//
// Unlike school_app's version, a signed-in visitor is redirected
// straight to /dashboard rather than shown the marketing page again --
// they don't need to be sold on the product they're already using, and
// it matches how /login already behaves for a signed-in user
// (middleware.ts).
//
// `settings.school_name` is genuinely public (settings_read_all: using
// (true)) so the header can show each deployment's own school name
// without hardcoding it -- falls back to "School" if unset or the read
// fails for any reason (never blocks the page on it).

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const FEATURE_TABS: { name: string; color: string; detail: string }[] = [
  { name: "Notes", color: "#2F6B4F", detail: "Every topic, written and ready to read" },
  { name: "Homework", color: "#B24C3C", detail: "Set, submit, and grade in one place" },
  { name: "Quizzes", color: "#C98F00", detail: "Scored the moment a student submits" },
  { name: "Timetable", color: "#3B5B8C", detail: "One schedule, no double-bookings" },
];

export default async function HomePage() {
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) redirect("/dashboard");

  const { data: settings } = await supabase.from("settings").select("school_name").maybeSingle();
  const schoolName = settings?.school_name?.trim() || "School";

  return (
    <div className="min-h-screen bg-paper bg-notebook-lines">
      {/* Nav */}
      <header className="flex items-center justify-between px-8 py-6">
        <p className="font-display text-xl font-semibold text-ink">{schoolName}</p>
        <Link
          href="/login"
          className="rounded-lg border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-paper"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="grid grid-cols-1 gap-12 px-8 pb-20 pt-8 md:grid-cols-2 md:px-16">
        <div className="flex flex-col justify-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-leaf">
            Notes · Homework · Quizzes · Timetable
          </p>
          <h1 className="mb-5 font-display text-4xl font-semibold leading-tight text-ink md:text-5xl">
            One place for
            <br />
            lessons, homework,
            <br />
            and quizzes.
          </h1>
          <p className="mb-8 max-w-md text-base leading-relaxed text-ink-soft">
            Every topic a student, teacher, or parent needs — written, organized, and ready the
            moment an account is created.
          </p>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-marigold px-5 py-3 font-medium text-ink transition hover:bg-marigold-dark"
            >
              Sign in to {schoolName}
            </Link>
          </div>
        </div>

        {/* Signature element: stacked feature tabs, mirroring school_app's subject-tab layout */}
        <div className="relative flex items-center justify-center">
          <div className="w-full max-w-sm">
            {FEATURE_TABS.map((feature, i) => (
              <div
                key={feature.name}
                className="group relative mb-3 rounded-r-xl border border-l-4 border-rule bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderLeftColor: feature.color, marginLeft: i * 14 }}
              >
                <p className="font-display text-base font-semibold text-ink">{feature.name}</p>
                <p className="mt-1 text-sm text-ink-soft">{feature.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role sections -- grounded in this app's real features */}
      <section className="grid grid-cols-1 gap-6 border-t border-rule px-8 py-16 md:grid-cols-3 md:px-16">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-leaf">For students</p>
          <h2 className="mb-2 font-display text-xl font-semibold text-ink">
            Every topic, ready when class gets there
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            Read notes with diagrams and resources built in, submit homework, take quizzes and see
            the score right away, and check your timetable without asking a teacher.
          </p>
        </div>
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-clay">For teachers</p>
          <h2 className="mb-2 font-display text-xl font-semibold text-ink">
            Write, assign, and grade in one flow
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            Author topic notes your students see the moment they&apos;re published, set homework
            and grade submissions, and build quizzes that mark themselves.
          </p>
        </div>
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-marigold-text">
            For administrators
          </p>
          <h2 className="mb-2 font-display text-xl font-semibold text-ink">
            Accounts, classes, and timetables — governed centrally
          </h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            Create every staff, student, and parent account, manage classes and enrolments, and
            build a conflict-free timetable for the whole school.
          </p>
        </div>
      </section>

      <footer className="border-t border-rule px-8 py-6 text-xs text-ink-soft md:px-16">
        {schoolName}
      </footer>
    </div>
  );
}