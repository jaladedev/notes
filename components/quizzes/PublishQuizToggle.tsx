"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setQuizPublished } from "@/lib/actions/quizAttempt";
import { emitToast } from "@/lib/toast";

export function PublishQuizToggle({ quizId, published }: { quizId: string; published: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await setQuizPublished(quizId, !published);
        router.refresh();
        emitToast(published ? "Quiz unpublished." : "Quiz published — students can now take it.", "success");
      } catch (err: unknown) {
        emitToast(err instanceof Error ? err.message : "Couldn't update that quiz.", "error");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60 ${
        published
          ? "border-clay text-clay hover:bg-clay/10"
          : "border-leaf text-leaf hover:bg-leaf-soft"
      }`}
    >
      {published ? "Unpublish" : "Publish"}
    </button>
  );
}
