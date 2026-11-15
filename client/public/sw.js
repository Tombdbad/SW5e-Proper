// The service worker: it keeps what a phone downloads once (the scripts of a build, the models, textures and sounds), so that the
// next visit does not fetch them again. It never answers the page itself, the API or the socket: the home page and every
// navigation go to the network, so the open tab's "is this still the newest build" check in App.tsx sees the server's own answer.
// __BUILD_ID__ is set by tools/optimizeDist.mjs when the site is built; a new build is a new worker, which drops the old caches.
const BUILD = "__BUILD_ID__";
const SCRIPTS = `sw5e-build-${BUILD}`; // the hashed files of this build: they never change under their name
const MEDIA = "sw5e-media-v1"; // models, textures and sounds under a fixed name: answered at once, then refreshed for the next visit

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("sw5e-build-") && key !== SCRIPTS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const HASHED = /^\/assets\/.+-[A-Za-z0-9_-]{8}\.(js|css)$/;
const MEDIA_PATH = /^\/(figures|textures|assets|audio|sounds|fonts|geometries|megascans)\//;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode === "navigate" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (HASHED.test(url.pathname)) {
    event.respondWith(
      caches.open(SCRIPTS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  } else if (MEDIA_PATH.test(url.pathname)) {
    event.respondWith(
      caches.open(MEDIA).then(async (cache) => {
        const hit = await cache.match(req);
        const fresh = fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        });
        if (hit) {
          fresh.catch(() => {}); // refresh in the background; offline keeps the copy
          return hit;
        }
        return fresh;
      }),
    );
  }
});
