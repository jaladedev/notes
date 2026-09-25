// Service worker for offline reading (plan doc phase P3). New, not
// ported -- school_app has its own separate service worker for offline
// attendance (a write-queue problem); this is a read-cache problem
// instead, so the strategy is different and much simpler.
//
// Strategy: network-first for student topic pages, falling back to
// cache when offline. Nothing is cached proactively/in bulk -- a topic
// becomes available offline the first time a student opens it while
// online, same as most "read it once, it's yours" offline note apps.
// Resource files (images/PDFs/audio/video) are NOT cached here: their
// signed URLs expire after 6h (see lib/actions/resources.ts), so a
// cached response would go stale and 403 on replay. Only the page
// shell + note text/markdown are cached, which is what actually
// matters for "can I still read my notes on the bus with no signal".

const CACHE_NAME = "notes-offline-v1";
const PRECACHE_URLS = ["/dashboard", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {
      // Precache is best-effort -- a failed precache shouldn't block
      // install (e.g. if /dashboard 302s to /login when logged out).
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

function isCacheableStudentPage(url) {
  return /\/dashboard\/student\/(topics|spaces)\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET navigations/pages -- never touch
  // Supabase API calls, storage signed URLs, or POST/server actions.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!isCacheableStudentPage(url) && url.pathname !== "/dashboard") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
