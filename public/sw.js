const CACHE_NAME = "marshall-os-shell-v5";
const APP_SHELL = [
  "/",
  "/offline",
  "/dashboard",
  "/clock-in",
  "/jobs",
  "/billing",
  "/customers",
  "/inventory",
  "/service",
  "/resources",
  "/settings",
  "/manifest.webmanifest",
  "/marshall-os.svg",
  "/icons/app-icon.svg",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/icons/clock.png",
  "/icons/invoice.png",
  "/fonts/BAHNSCHRIFT%202.TTF",
  "/wallpapers/w1.jpg",
  "/wallpapers/w2.png",
  "/wallpapers/w3.jpg",
  "/wallpapers/w4.jpg",
  "/wallpapers/w5.jpg",
  "/sounds/ping1.mp3",
  "/sounds/click1.mp3",
  "/sounds/chime1.mp3",
  "/sounds/beep1.mp3",
  "/sounds/alert1.mp3",
  "/boot/boot-sound.mp3",
];

async function cacheRouteAndAssets(cache, route) {
  const response = await fetch(route, { cache: "reload" });
  if (!response.ok) return;

  await cache.put(route, response.clone());

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return;

  const html = await response.text();
  const assetPaths = new Set();
  for (const match of html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g)) {
    assetPaths.add(match[1]);
  }

  await Promise.allSettled([...assetPaths].map((asset) => cache.add(asset)));
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "WARM_APP_SHELL") return;

  const routes = Array.isArray(event.data.routes) ? event.data.routes : APP_SHELL;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(routes.map((route) => cacheRouteAndAssets(cache, route)));
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline") || caches.match("/dashboard") || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then((fallback) => fallback || Response.error()));
    })
  );
});
