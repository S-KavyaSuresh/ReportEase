/**
 * ReportEase Service Worker v2.1
 *
 * Strategy:
 *   - index.html      → Network first, cache fallback (always gets fresh shell after deploy)
 *   - Static assets   → Cache first (JS/CSS/icons have hashed filenames from CRA build)
 *   - /api/* routes   → Never cached (medical data must always be live)
 *   - External URLs   → Never cached
 *
 * IMPORTANT: Bump CACHE_VERSION with every production deployment to force SW update.
 */
const CACHE_VERSION = 'reportease-v2.1.4';
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
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-GET and API/external
  if (request.method !== 'GET' || isNeverCache(url)) return;

  // index.html and SPA navigation: network first, cache fallback
  if (request.mode === 'navigate' || url.endsWith('/index.html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html') || caches.match(request))
    );
    return;
  }

  // Static assets (JS/CSS/icons have content-hashed names): cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
