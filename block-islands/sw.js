/* Generated per game. This worker only handles requests within its scope. */
'use strict';

const CACHE_PREFIX = "games-pwa:block-islands:";
const RELEASE = "a2662a7cb6022ae862e5";
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const ASSETS = ["./","./apple-touch-icon.png","./assets/icon.svg","./game-pwa.js","./game.css","./game.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./privacy.html","./rules.js","./voxel-view.js"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // addAll either obtains every required local asset or the partial cache is removed.
      await cache.addAll(ASSETS);
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
