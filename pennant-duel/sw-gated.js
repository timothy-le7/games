/* Generated per game. This worker only handles requests within its scope. */
'use strict';

const CACHE_PREFIX = "games-pwa:tower-duel:";
const RELEASE = "b720b0eae584cb61ea4c";
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const ASSETS = ["./","./apple-touch-icon.png","./assets/crew-portraits-v1.png","./assets/icon.svg","./engine.js","./game-pwa.js","./game.js","./gate-migration.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./privacy.html","./style.css","./tower-renderer.js"];
// A legacy compatible migration may leave this scoped marker only after the
// current game's durable-save guard has succeeded. The current transition
// unregister handoff consumes its marker before the fresh registration begins;
// this defensive path keeps a compatible marker-gated install from promoting
// a later ordinary update, which has no marker and retains the usual explicit
// save-before-update behavior.
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
      // Consume one response before requesting the next. Holding every body
      // open until a later cache.put can exhaust a browser's per-worker HTTP
      // connection budget and leave installation stuck. The cache is inactive
      // until install completes; the catch below deletes any partial release.
      const cache = await caches.open(CACHE_NAME);
      for (const asset of ASSETS) {
        const request = new Request(new URL(asset, self.registration.scope), { cache: 'reload' });
        const response = await fetch(request);
        if (!response.ok || response.type === 'opaque') throw new Error('Could not cache ' + request.url);
        await cache.put(request, response);
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GAMES_PWA_APPLY_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      return await fetch(event.request);
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const index = await cache.match(new URL('./index.html', self.registration.scope).href);
        if (index) return index;
      }
      throw error;
    }
  })());
});
