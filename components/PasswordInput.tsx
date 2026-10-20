"use client";

// Password field with a Show/Hide toggle. Drop-in replacement for
// <input type="password">: every standard input prop passes through, so
// callers keep their own id, autoComplete, minLength, etc.

import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? "text" : "password"}
        className={
          className ??
          "w-full rounded-lg border border-rule bg-white py-2 pl-3 pr-16 text-ink outline-none focus-visible:border-marigold"
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-2 my-auto h-8 rounded px-2 text-sm text-ink-soft hover:text-ink"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
