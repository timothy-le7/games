/* Generated per game. This worker only handles requests within its scope. */
'use strict';

const CACHE_PREFIX = "games-pwa:pulse-foundry:";
const RELEASE = "83d90cf54596f126d0fd";
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const ASSETS = ["./","./apple-touch-icon.png","./assets/icon.svg","./engine.js","./game-pwa.js","./game.js","./hd-scene.js","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest","./privacy.html","./renderer.js","./style.css"];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      // Fetch every asset before writing the release cache.  Besides retaining
      // all-or-nothing installation, this avoids WebKit's empty-cache result
      // from Cache.addAll() for a newly installed scoped worker.
      const responses = await Promise.all(ASSETS.map(async asset => {
        const request = new Request(new URL(asset, self.registration.scope), { cache: 'reload' });
        const response = await fetch(request);
        if (!response.ok || response.type === 'opaque') throw new Error('Could not cache ' + request.url);
        return [request, response];
      }));
      const cache = await caches.open(CACHE_NAME);
      for (const [request, response] of responses) await cache.put(request, response);
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
