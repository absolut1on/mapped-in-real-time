const TILE_CACHE = 'map-tiles-v1';
const STATIC_CACHE = 'static-v1';
const MAX_TILE_ENTRIES = 600;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/viewer.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== TILE_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  if (url.includes('tile.openstreetmap.org')) {
    e.respondWith(tileFirst(e.request));
    return;
  }

  if (e.request.mode === 'navigate' || STATIC_ASSETS.some((a) => url.endsWith(a))) {
    e.respondWith(networkFirst(e.request));
    return;
  }
});

async function tileFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TILE_CACHE);
      cache.put(request, response.clone());
      trimCache(TILE_CACHE, MAX_TILE_ENTRIES);
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) {
    await cache.delete(keys[0]);
    trimCache(name, max);
  }
}
