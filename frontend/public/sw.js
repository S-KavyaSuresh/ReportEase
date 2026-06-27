/**
 * ReportEase Service Worker v2.1
 *
 * Strategy:
 *   - index.html      → Network first, cache fallback
 *   - Static assets   → Cache first
 *   - /api/* routes   → Never cached
 *   - External URLs   → Never cached
 */
const CACHE_VERSION = 'reportease-v2.1.6';

const STATIC_PRECACHE = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.json',
];

const NEVER_CACHE_PATTERNS = [
  '/api/',
  'groq.com',
  'openstreetmap.org',
  'overpass-api.de',
  'nominatim',
];

function isNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some((p) => url.includes(p));
}

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-http requests like chrome-extension://
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  const requestOrigin = new URL(url).origin;
  const appOrigin = self.location.origin;

  // Skip non-GET, API routes, and external URLs
  if (
    request.method !== 'GET' ||
    isNeverCache(url) ||
    requestOrigin !== appOrigin
  ) {
    return;
  }

  // SPA navigation: fallback safely if network fails
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, clone);
            });
          }
          return res;
        })
        .catch(async () => {
          const cachedHome = await caches.match('/');
          const cachedIndex = await caches.match('/index.html');
          return (
            cachedHome ||
            cachedIndex ||
            new Response('Offline', {
              status: 503,
              statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        })
    );
    return;
  }

  // Static assets: cache first, then network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, clone);
            });
          }
          return res;
        })
        .catch(() => {
          return new Response('', {
            status: 204,
            statusText: 'No cached response available',
          });
        });
    })
  );
});