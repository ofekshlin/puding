const CACHE_NAME = "puding-cache-v2";
const ASSETS_TO_CACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stale = (await caches.keys()).filter((name) => name !== CACHE_NAME);
      await Promise.all(stale.map((name) => caches.delete(name)));
      await self.clients.claim();
      // Pages rendered from an old cache-first worker are outdated; reload them.
      if (stale.length > 0) {
        const windows = await self.clients.matchAll({ type: "window" });
        windows.forEach((client) => client.navigate(client.url));
      }
    })(),
  );
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    ASSETS_TO_CACHE.includes(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages depend on the sign-in session and the latest deploy: always go to
  // the network, and only fall back to a cached copy when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached || Response.error();
      }),
    );
    return;
  }

  if (!isImmutableAsset(url)) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
