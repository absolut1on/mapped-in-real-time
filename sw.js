const TILE_CACHE = 'map-tiles-v1';
const MAX_TILE_ENTRIES = 600;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== TILE_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('tile.openstreetmap.org')) {
    e.respondWith(tileCacheFirst(e.request));
  }
});

async function tileCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TILE_CACHE);
      cache.put(request, response.clone());
      trimCache();
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

async function trimCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILE_ENTRIES) {
    await cache.delete(keys[0]);
  }
}
