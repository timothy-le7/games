/* Generated per game. This worker only handles requests within its scope. */
'use strict';

const CACHE_PREFIX = "games-pwa:block-islands:";
const RELEASE = "b1ce6f850dc918b6a1be";
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const ASSETS = ["./","./apple-touch-icon.png","./assets/icon.svg","./body-physics.js","./game-pwa.js","./game.css","./game.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./privacy.html","./rules.js","./voxel-view.js"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
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
