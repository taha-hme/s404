const SCOPE_URL = new URL(
  self.registration && self.registration.scope ? self.registration.scope : './',
  self.location.href
);
const BASE_PATH = SCOPE_URL.pathname.endsWith('/') ? SCOPE_URL.pathname : `${SCOPE_URL.pathname}/`;
const CACHE_PREFIX = `s404-home-${BASE_PATH}-`;
const CACHE_VERSION = /* @S404_CACHE_VERSION */ 'v2';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const PRECACHE_ASSETS = /* @S404_PRECACHE_ASSETS */ ['index.html', 'manifest.webmanifest'];

const ROOT_URL = SCOPE_URL.href;
const INDEX_URL = new URL('index.html', SCOPE_URL).href;
const MANIFEST_URL = new URL('manifest.webmanifest', SCOPE_URL).href;

function isCacheableResponse(response) {
  return Boolean(response && response.ok && (response.type === 'basic' || response.type === 'default'));
}

function isWithinBase(pathname) {
  if (BASE_PATH === '/') {
    return true;
  }
  const baseWithoutSlash = BASE_PATH.slice(0, -1);
  return pathname.startsWith(BASE_PATH) || pathname === baseWithoutSlash;
}

function isExcludedPath(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith(`${BASE_PATH}api/`) ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith(`${BASE_PATH}auth/`)
  );
}

self.addEventListener('install', (event) => {
  const urlsToPrecache = Array.from(
    new Set([ROOT_URL, ...PRECACHE_ASSETS.map((asset) => new URL(asset, SCOPE_URL).href)])
  );

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          urlsToPrecache.map(async (assetUrl) => {
            try {
              const response = await fetch(assetUrl, { cache: 'no-cache' });
              if (isCacheableResponse(response)) {
                await cache.put(assetUrl, response);
              }
            } catch {
              // Skip failed precache items rather than storing broken responses.
            }
          })
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key === 's404-league-static-v1' ||
                (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isWithinBase(url.pathname) || isExcludedPath(url.pathname)) {
    return;
  }

  // Network-first for HTML navigation, falling back to cached app entry offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(INDEX_URL, clone));
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex =
            (await caches.match(INDEX_URL, { ignoreVary: true })) ||
            (await caches.match(ROOT_URL, { ignoreVary: true }));
          return cachedIndex || Response.error();
        })
    );
    return;
  }

  // Network-first for Web App Manifest so metadata updates propagate when online
  if (url.href === MANIFEST_URL) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => (await caches.match(request, { ignoreVary: true })) || Response.error())
    );
    return;
  }

  // Cache-first for base-scoped bundled JS/CSS/media assets
  if (url.pathname.startsWith(`${BASE_PATH}assets/`) || url.pathname.startsWith(`${BASE_PATH}src/assets/`)) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
