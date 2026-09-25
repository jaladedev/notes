"use client";

// New page -- required once accounts are admin-provisioned with a temp
// password (accountAdmin.ts) instead of self-signed-up. Mirrors
// school_app's forced-reset flow: middleware.ts redirects here whenever
// profiles.must_change_password is true and won't let the user past it
// until they've set a real password.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearMustChangePassword } from "@/lib/actions/accountAdmin";

export default function ChangePasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { data: userData, error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError || !userData.user) {
      setLoading(false);
      setError(updateError?.message ?? "Couldn't update your password.");
      return;
    }

    await clearMustChangePassword(userData.user.id);

    // Full navigation -- see login/page.tsx's doc comment: forces
    // middleware and every server component to re-run with the cookie
    // that now reflects must_change_password: false.
    window.location.href = "/dashboard";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper bg-notebook-lines px-4">
      <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-8 shadow-sm">
        <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Choose a password</h1>
        <p className="mb-6 text-sm text-ink-soft">
          You&apos;re using a temporary password. Set your own before continuing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-rule px-3 py-2 text-ink"
              placeholder="At least 8 characters"
              title="Choose a new password, at least 8 characters"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-ink">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-rule px-3 py-2 text-ink"
              placeholder="Re-enter your new password"
              title="Re-enter the same new password to confirm"
            />
          </div>

          {error && <p className="text-sm text-clay">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-marigold px-4 py-2 font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
          >
            {loading ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
