/**
 * ReportEase Service Worker v2.1
 *
 * Strategy:
 *   - index.html      → Network first, cache fallback
 *   - Static assets   → Cache first
 *   - /api/* routes   → Never cached
 *   - External URLs   → Never cached
 */
const CACHE_VERSION = 'reportease-v2.1.5';

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

  // index.html and SPA navigation: network first, cache fallback
  if (request.mode === 'navigate' || url.endsWith('/index.html')) {
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
        .catch(() => caches.match('/index.html') || caches.match(request))
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, clone);
          });
        }
        return res;
      });
    })
  );
});