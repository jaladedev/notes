"use client";

import { useEffect, useRef, useState } from "react";
import type { ToastTone } from "@/lib/toast";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 4;

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timeouts = useRef<Map<number, number>>(new Map());

  function dismissToast(id: number) {
    const timeout = timeouts.current.get(id);
    if (timeout) window.clearTimeout(timeout);
    timeouts.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  useEffect(() => {
    const activeTimeouts = timeouts.current;

    function handleToast(event: Event) {
      const customEvent = event as CustomEvent<{
        message: string;
        tone?: ToastTone;
        duration?: number;
      }>;
      const { message, tone = "success", duration = DEFAULT_DURATION } = customEvent.detail;
      if (!message) return;

      const id = ++nextId.current;
      setToasts((current) => [...current, { id, message, tone }].slice(-MAX_TOASTS));

      if (duration > 0) {
        const timeout = window.setTimeout(() => dismissToast(id), duration);
        activeTimeouts.set(id, timeout);
      }
    }

    window.addEventListener("app:toast", handleToast);
    return () => {
      window.removeEventListener("app:toast", handleToast);
      activeTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      activeTimeouts.clear();
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-3 py-2 text-sm shadow-sm ${
            toast.tone === "error"
              ? "border-clay bg-clay/10 text-clay"
              : toast.tone === "info"
                ? "border-marigold bg-marigold-soft text-ink"
                : "border-leaf bg-leaf-soft text-leaf"
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="-mr-1 -mt-1 rounded p-1 text-current opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
