"use client";

// Edit / reset-password / deactivate-reactivate controls, shared by the
// staff, student, and parent list pages.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetUserPassword, setAccountActive, updateAccount } from "@/lib/actions/accountAdmin";
import { emitToast } from "@/lib/toast";
import { TempPasswordReveal } from "@/components/admin/TempPasswordReveal";

export function AccountActions({
  userId,
  fullName,
  email,
  isActive,
}: {
  userId: string;
  fullName: string;
  email: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(fullName);
  const [emailDraft, setEmailDraft] = useState(email);

  const emailChanged = emailDraft.trim().toLowerCase() !== email.toLowerCase();
  const dirty = nameDraft.trim() !== fullName || emailDraft.trim().toLowerCase() !== email;

  function openEditor() {
    // Re-seed from the latest saved values so a cancelled edit never lingers.
    setNameDraft(fullName);
    setEmailDraft(email);
    setEditing(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateAccount({ userId, fullName: nameDraft, email: emailDraft });
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      emitToast(res.data.changed ? "Account updated." : "No changes to save.", "success");
      setEditing(false);
      router.refresh();
    });
  }

  function handleReset() {
    startTransition(async () => {
      const res = await resetUserPassword(userId);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      setResetPassword(res.data.password);
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const res = await setAccountActive(userId, !isActive);
      if (!res.ok) {
        emitToast(res.error, "error");
        return;
      }
      emitToast(isActive ? "Account deactivated." : "Account reactivated.", "success");
      router.refresh();
    });
  }

  if (resetPassword) {
    return (
      <TempPasswordReveal
        email={email}
        password={resetPassword}
        onDismiss={() => setResetPassword(null)}
      />
    );
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="w-full space-y-2 rounded-lg border border-rule bg-paper p-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-ink-soft">
            Full name
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={120}
              className="rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-ink-soft">
            Email
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              className="rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>
        {emailChanged && (
          <p className="text-xs text-ink-soft">
            They will sign in with the new email from now on. Their password stays the same, and the
            old email stops working straight away.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending || !dirty || !nameDraft.trim() || !emailDraft.trim()}
            className="rounded-lg bg-marigold px-3 py-1.5 text-xs font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setEditing(false)}
            className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={openEditor}
        className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold disabled:opacity-60"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleReset}
        className="rounded-lg border border-rule bg-white px-3 py-1.5 text-xs text-ink hover:border-marigold disabled:opacity-60"
      >
        Reset password
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleToggleActive}
        className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60 ${
          isActive
            ? "border-clay text-clay hover:bg-clay/10"
            : "border-leaf text-leaf hover:bg-leaf-soft"
        }`}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}
