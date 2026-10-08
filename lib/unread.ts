// Tells the dashboard nav to re-fetch its unread badges (e.g. after a
// message arrives in the conversation that's open, and has been marked read).
export function requestNavRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("app:refresh-nav-badges"));
}
