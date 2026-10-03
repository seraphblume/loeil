// L'Œil service worker — the reason the app opens on a shop floor with no signal.
//
// The deploy workflow stamps BUILD and the asset list on every push, so each
// release installs as a complete, consistent copy in the background and takes
// over on the next launch. The encrypted catalogue is never cached here: the app
// keeps its own decrypted copy and checks for a newer one itself.

const BUILD = 'dev';
const ASSETS = [/*__ASSETS__*/];
const SHELL = `loeil-shell-${BUILD}`;
const CDN = 'loeil-cdn-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(['./', ...ASSETS].map((u) => new Request(u, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== CDN) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only the text recogniser comes from a CDN; keep it once fetched.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(CDN, req));
    return;
  }
  if (url.origin !== location.origin) return;
  // The catalogue: always the network. The app falls back to its own copy.
  if (url.pathname.endsWith('/data/catalogue.enc.json')) return;

  if (req.mode === 'navigate') {
    // Fresh page when the network answers quickly; the cached shell otherwise,
    // so a weak signal never holds the app hostage.
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const cached = await cache.match('./');
      const network = fetch(req).then((fresh) => {
        if (fresh.ok) cache.put('./', fresh.clone());
        return fresh;
      });
      if (!cached) return network.catch(() => Response.error());
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 2500));
      return Promise.race([network.catch(() => cached), timeout]);
    })());
    return;
  }
  event.respondWith(cacheFirst(SHELL, req));
});

async function cacheFirst(name, req) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
  return res;
}
