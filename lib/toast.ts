export type ToastTone = "success" | "error" | "info";
type ToastOptions = { duration?: number };

export function emitToast(
  message: string,
  tone: ToastTone = "success",
  options: ToastOptions = {}
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("app:toast", {
      detail: { message, tone, duration: options.duration },
    })
  );
}
