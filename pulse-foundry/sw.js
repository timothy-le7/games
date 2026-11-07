/*
 * One-time scoped transition worker for installs that predate the encrypted
 * Pages gate. It intentionally does not own a release cache or delete legacy
 * caches. A first online navigation gets the current encrypted document from
 * the network; after unlock, old cached game assets can still render the real
 * save-before-update UI while sw-gated.js waits behind that controlled page.
 */
'use strict';

const CACHE_PREFIX = "games-pwa:pulse-foundry:";

async function legacyResponse(request) {
  const names = await caches.keys();
  for (const name of names) {
    if (!name.startsWith(CACHE_PREFIX)) continue;
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  return null;
}

self.addEventListener('activate', event => {
  // Deliberately retain prior scoped caches until the player has used the real
  // game save/update control to activate the gated worker.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GAMES_PWA_APPLY_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (requestUrl.origin !== scope.origin || !requestUrl.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    // Never serve a cached pre-gate document while online. It is still a
    // fallback for a genuinely offline old installation, which cannot be
    // retroactively revoked and is documented as a static-hosting limit.
    if (event.request.mode === 'navigate') {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await legacyResponse(event.request);
        if (cached) return cached;
        throw new Error('No offline legacy document is available.');
      }
    }
    return (await legacyResponse(event.request)) || fetch(event.request);
  })());
});
