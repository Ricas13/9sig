/* Rebalune service worker.
 *
 * Deliberately tiny and privacy-first: it never stores a page, an API response or anything that
 * could contain account or portfolio data. It only (1) keeps the hashed, public build assets so the
 * app starts quickly and (2) shows a friendly offline screen when the network is unreachable.
 */
const CACHE = "rebalune-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the network. Only if it is unreachable, show the offline screen.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Immutable build assets (content-hashed file names) are safe to serve from cache.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
        return response;
      }))
    );
  }
  // Everything else (API calls, account data, images, fonts) goes straight to the network, untouched.
});
