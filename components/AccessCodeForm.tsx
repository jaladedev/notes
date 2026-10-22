// Shown by app/shared/[token]/page.tsx when a link has an access code. The
// code is POSTed to the unlockShareLink server action (never put in the URL,
// so it stays out of browser history and server logs); a correct entry sets
// an httpOnly cookie and redirects back to the note.

import { unlockShareLink } from "@/lib/actions/notes";

export function AccessCodeForm({ token, error }: { token: string; error?: "wrong" | "wait" }) {
  return (
    <form action={unlockShareLink.bind(null, token)} method="POST" className="mx-auto max-w-sm p-8 text-center">
      <p className="mb-3 text-sm text-ink-soft">This note is protected by an access code.</p>
      {error === "wrong" && (
        <p role="alert" className="mb-3 text-sm text-clay">
          That code isn&apos;t right. Try again.
        </p>
      )}
      {error === "wait" && (
        <p role="alert" className="mb-3 text-sm text-clay">
          Too many attempts. Wait a few minutes and try again.
        </p>
      )}
      <input
        type="password"
        name="code"
        required
        maxLength={100}
        autoComplete="off"
        placeholder="Access code"
        title="Enter the access code shared with you to view this note"
        className="mb-3 w-full rounded-lg border border-rule bg-white px-3 py-2 text-center text-sm"
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-marigold px-4 py-2 text-sm font-medium text-ink hover:bg-marigold-dark"
      >
        View note
      </button>
    </form>
  );
}
