"use client";

// New, not ported. Registers public/sw.js once on mount. Silently
// no-ops on browsers without service worker support rather than
// throwing -- offline reading is a progressive enhancement, not a
// requirement.

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort -- see file header comment.
    });
  }, []);

  return null;
}
