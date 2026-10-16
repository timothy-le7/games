'use strict';
const RELEASE = '5ecfdadd012d0dae5fa5';
// Include the scope so unrelated apps on the same host cannot delete our caches.
const PREFIX = 'poly-top:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + RELEASE;
const ASSETS = ['index.html', 'web-app.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const urlFor = file => new URL(file, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      // Fetch everything before committing any entries. A partial release must not install.
      const responses = await Promise.all(ASSETS.map(async file => {
        const response = await fetch(new Request(urlFor(file), { cache: 'reload' }));
        if (!response.ok || response.type === 'opaque') throw new Error('Could not cache ' + file);
        return [urlFor(file), response];
      }));
      const cache = await caches.open(CACHE);
      await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
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
  if (event.data?.type === 'POLY_TOP_APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relative = url.pathname.slice(scope.pathname.length);
  if (event.request.mode !== 'navigate' && !ASSETS.includes(relative)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = event.request.mode === 'navigate' ? urlFor('index.html') : urlFor(relative);
    const response = await cache.match(key);
    return response || fetch(event.request);
  })());
});
