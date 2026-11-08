/*
 * One-time scoped transition worker for installs that predate the encrypted
 * Pages gate. It intentionally does not own a release cache or delete legacy
 * caches. A first online navigation gets the current encrypted document from
 * the network; after unlock, old cached game assets can still render the real
 * save-before-update UI while sw-gated.js waits behind that controlled page.
 */
'use strict';

const CACHE_PREFIX = "games-pwa:pulse-foundry:";
// The shared packages and Hexgame keep distinct, established update message
// contracts. A transition build supplies the messages its real legacy update
// UI can send; accepting only the shared name would leave an old Hex update
// control unable to activate a waiting transition worker.
const UPDATE_MESSAGE_TYPES = new Set(["GAMES_PWA_APPLY_UPDATE"]);
// A package with an independently maintained PWA controller can name the
// controller script here. Fetching that one script from the current release
// after unlock prevents an old cached controller from registering this
// transition endpoint again after the gated worker has taken over. It still
// falls back to the retained legacy copy for an offline old installation.
const NETWORK_FIRST_FILES = new Set([]);
const APPROVAL_CACHE = 'games-gate:approved-activation:' + encodeURIComponent(self.registration.scope);
const APPROVAL_URL = new URL('./__games-gate-approved-activation__', self.registration.scope).href;

async function hasApprovedFinalHandoff() {
  if (!(await caches.keys()).includes(APPROVAL_CACHE)) return false;
  return !!(await (await caches.open(APPROVAL_CACHE)).match(APPROVAL_URL));
}

async function consumeApprovedFinalHandoff() {
  const cache = await caches.open(APPROVAL_CACHE);
  if (!await cache.match(APPROVAL_URL)) return false;
  await cache.delete(APPROVAL_URL);
  if ((await cache.keys()).length === 0) await caches.delete(APPROVAL_CACHE);
  return true;
}

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
  if (event.data?.type === 'GAMES_GATE_TRANSITION_PROBE') {
    event.ports?.[0]?.postMessage({ type: 'GAMES_GATE_TRANSITION_ACTIVE' });
    return;
  }
  if (event.data?.type === 'GAMES_GATE_FINAL_HANDOFF') {
    const reply = event.ports?.[0];
    event.waitUntil((async () => {
      try {
        // The page can send this only after its current game reports a durable
        // save and writes the scoped approval marker. Keep every legacy cache
        // intact here: the newly registered gated worker removes stale scoped
        // cache families only after it has installed and activated. A fresh
        // registration activates without needing a marker, so consume this
        // one-time authorization after the registration is successfully
        // released and before acknowledging the reload.
        if (!await hasApprovedFinalHandoff()) throw new Error('Missing approved final handoff marker.');
        if (!await self.registration.unregister()) throw new Error('Could not release the transition registration.');
        if (!await consumeApprovedFinalHandoff()) throw new Error('Could not consume approved final handoff marker.');
        reply?.postMessage({ type: 'GAMES_GATE_FINAL_HANDOFF_READY' });
      } catch {
        reply?.postMessage({ type: 'GAMES_GATE_FINAL_HANDOFF_FAILED' });
      }
    })());
    return;
  }
  // The installed worker may be waiting behind a live client. Calling
  // skipWaiting directly mirrors the established scoped-worker contract and
  // avoids tying activation to an extendable message-event lifetime.
  if (event.data && UPDATE_MESSAGE_TYPES.has(event.data.type)) self.skipWaiting();
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
    const relative = requestUrl.pathname.slice(scope.pathname.length);
    if (NETWORK_FIRST_FILES.has(relative)) {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await legacyResponse(event.request);
        if (cached) return cached;
        throw new Error('No offline legacy asset is available.');
      }
    }
    return (await legacyResponse(event.request)) || fetch(event.request);
  })());
});
