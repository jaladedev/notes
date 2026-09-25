"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    await supabase.auth.getSession();

    // A full navigation, not router.push(). The Supabase browser client
    // writes the new session to cookies asynchronously after sign-in;
    // router.push() reuses Next's client-side router cache for any route
    // segments it's already fetched/rendered, which can serve a
    // pre-login (unauthenticated) shell instead of picking up the fresh
    // session. Setting window.location.href forces a real browser
    // request, which guarantees proxy.ts (the auth middleware) and every
    // server component in the dashboard tree -- including
    // getCurrentProfile() in the dashboard layout -- re-run with the new
    // cookies rather than serving anything cached from before sign-in.
    window.location.href = "/dashboard";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper bg-notebook-lines px-4">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-8 shadow-sm">
        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Welcome back</h1>
        <p className="mb-6 text-sm text-ink-soft">
          Sign in to view your notes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-ink outline-none focus-visible:border-marigold"
              placeholder="you@example.com"
              title="Enter the email address for your account"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-ink outline-none focus-visible:border-marigold"
              placeholder="••••••••"
              title="Enter your account password"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-clay">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-marigold px-4 py-2 font-medium text-ink transition hover:bg-marigold-dark disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
