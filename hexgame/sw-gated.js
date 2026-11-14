'use strict';
const RELEASE = '7d7448bdc28701ddaca8';
// Include the scope so unrelated apps on the same host cannot delete our caches.
const PREFIX = 'poly-top:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + RELEASE;
const ASSETS = ['index.html', 'web-app.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'privacy.html'];
const urlFor = file => new URL(file, self.registration.scope).href;
// A legacy compatible migration may leave this scoped marker only after the
// second real durable-save guard succeeds. The current transition-unregister
// handoff consumes its marker before the fresh registration begins; this
// defensive path keeps a compatible marker-gated install from promoting a
// later ordinary update, which has no marker and stays behind its visible save
// guard.
const APPROVAL_CACHE = 'games-gate:approved-activation:' + encodeURIComponent(self.registration.scope);
const APPROVAL_URL = new URL('./__games-gate-approved-activation__', self.registration.scope).href;

async function consumeApprovedActivation() {
  if (!(await caches.keys()).includes(APPROVAL_CACHE)) return false;
  const cache = await caches.open(APPROVAL_CACHE);
  const approval = await cache.match(APPROVAL_URL);
  if (!approval) return false;
  await cache.delete(APPROVAL_URL);
  if ((await cache.keys()).length === 0) await caches.delete(APPROVAL_CACHE);
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      if (await consumeApprovedActivation()) self.skipWaiting();
      // Consume one body at a time. Waiting to put every fetched response can
      // exhaust a browser's per-worker connection budget. This cache cannot
      // control pages until installation succeeds, and failures delete it.
      const cache = await caches.open(CACHE);
      for (const file of ASSETS) {
        const response = await fetch(new Request(urlFor(file), { cache: 'reload' }));
        if (!response.ok || response.type === 'opaque') throw new Error('Could not cache ' + file);
        await cache.put(urlFor(file), response);
      }
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Updates wait until the game closes, or until the player explicitly saves and updates.
self.addEventListener('message', event => {
  // Keep the established Hexgame update action usable while this worker waits
  // behind a transition-controlled page. The direct call is intentional: it
  // is the same activation contract as the shared scoped workers.
  if (event.data?.type === 'POLY_TOP_APPLY_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relative = url.pathname.slice(scope.pathname.length) || 'index.html';
  if (!ASSETS.includes(relative)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = urlFor(relative);
    const response = await cache.match(key);
    return response || fetch(event.request);
  })());
});
