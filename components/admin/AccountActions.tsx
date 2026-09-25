"use client";

// Reset-password / deactivate-reactivate controls, shared by the staff,
// student, and parent list pages.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetUserPassword, setAccountActive } from "@/lib/actions/accountAdmin";
import { emitToast } from "@/lib/toast";
import { TempPasswordReveal } from "@/components/admin/TempPasswordReveal";

export function AccountActions({
  userId,
  email,
  isActive,
}: {
  userId: string;
  email: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [resetPassword, setResetPassword] = useState<string | null>(null);

  function handleReset() {
    startTransition(async () => {
      try {
        const { password } = await resetUserPassword(userId);
        setResetPassword(password);
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't reset that password.", "error");
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      try {
        await setAccountActive(userId, !isActive);
        emitToast(isActive ? "Account deactivated." : "Account reactivated.", "success");
        router.refresh();
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't update that account.", "error");
      }
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

  return (
    <div className="flex gap-2">
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
