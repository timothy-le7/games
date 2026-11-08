/*
 * One-time bridge for installations that predate the encrypted Pages gate.
 *
 * An old scoped worker can discover the changed ./sw.js before the encrypted
 * document is unlocked. That worker must remain the first visible, guarded
 * update: replacing its waiter with ./sw-gated.js races the player's existing
 * save-before-update UI. Once that transition worker controls the unlocked
 * document, this bridge hands off to the cache-owning gated worker as the
 * second, separately guarded update. Fresh installs stage the gated worker
 * directly.
 */
'use strict';

(() => {
  if (!('serviceWorker' in navigator) || !isSecureContext || location.protocol === 'file:') return;

  const scope = './';
  const transitionUrl = new URL('./sw.js', location.href).href;
  const gatedUrl = new URL('./sw-gated.js', location.href).href;
  const approvalScope = new URL(scope, location.href).href;
  const approvalCache = 'games-gate:approved-activation:' + encodeURIComponent(approvalScope);
  const approvalUrl = new URL('./__games-gate-approved-activation__', location.href).href;
  const workerUrl = worker => worker?.scriptURL || null;
  const isTransition = worker => workerUrl(worker) === transitionUrl;
  const isGated = worker => {
    const url = workerUrl(worker);
    if (!url) return false;
    try {
      const current = new URL(url);
      const endpoint = new URL(gatedUrl);
      return current.origin === endpoint.origin && current.pathname === endpoint.pathname;
    } catch {
      return false;
    }
  };
  const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function announce(phase, registration) {
    const detail = {
      phase,
      transitionUrl,
      gatedUrl,
      active: workerUrl(registration?.active),
      waiting: workerUrl(registration?.waiting),
      installing: workerUrl(registration?.installing)
    };
    try { window.dispatchEvent(new CustomEvent('games-gate-migration-state', { detail })); } catch {}
    return detail;
  }

  async function activeIsTransition(worker) {
    if (!worker || typeof MessageChannel !== 'function') return false;
    try {
      const channel = new MessageChannel();
      const answer = new Promise(resolve => {
        const timeout = setTimeout(() => resolve(false), 750);
        channel.port1.onmessage = event => {
          clearTimeout(timeout);
          resolve(event.data?.type === 'GAMES_GATE_TRANSITION_ACTIVE');
        };
      });
      worker.postMessage({ type: 'GAMES_GATE_TRANSITION_PROBE' }, [channel.port2]);
      return await answer;
    } catch {
      return false;
    }
  }

  async function waitForTransition(registration) {
    // A registration update is asynchronous. Hold the current runtime's
    // sw-gated registration until the legacy endpoint is visibly installing
    // or waiting, so the first user-facing action cannot promote a race.
    if (isTransition(registration.waiting) || isTransition(registration.installing)) return 'waiting';
    if (await activeIsTransition(registration.active)) return 'active';
    for (let attempt = 0; attempt < 40; attempt++) {
      if (isTransition(registration.waiting) || isTransition(registration.installing)) return 'waiting';
      await delay(50);
    }
    return isTransition(registration.waiting) || isTransition(registration.installing) ? 'waiting' : 'pending';
  }

  function needsApprovedFinalActivation(registration) {
    return isTransition(registration?.active) && !registration?.waiting && !registration?.installing;
  }

  function handOffTransitionWorker(worker) {
    if (!worker || typeof MessageChannel !== 'function') return Promise.reject(new Error('The protected-update bridge is unavailable.'));
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error('The protected-update bridge did not respond.')), 15000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        if (event.data?.type === 'GAMES_GATE_FINAL_HANDOFF_READY') resolve();
        else reject(new Error('The protected-update bridge could not prepare the final worker.'));
      };
      try {
        worker.postMessage({ type: 'GAMES_GATE_FINAL_HANDOFF' }, [channel.port2]);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async function activateApprovedFinalWorker() {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!needsApprovedFinalActivation(registration)) {
      return { approved: false, registration, state: announce('gated-not-awaiting-approval', registration) };
    }
    // A direct register() call against an active transition registration can
    // remain queued behind that registration in Chromium. After the durable
    // save succeeds, ask the active transition worker to unregister itself.
    // The same tab then reloads into a fresh scoped registration, where the
    // ordinary ./sw-gated.js bootstrap starts from a fresh registration. The
    // transition worker consumes this one-time marker only after it has
    // verified the approved handoff and released its registration. This avoids
    // treating a queued replacement job as a completed update, while later
    // ordinary gated-worker updates still use their visible save-before-update
    // path.
    const cache = await caches.open(approvalCache);
    await cache.put(approvalUrl, new Response('approved', { headers: { 'Content-Type': 'text/plain;charset=utf-8' } }));
    await handOffTransitionWorker(registration.active);
    const state = announce('gated-handoff-ready', registration);
    // The old controller remains alive until this document reloads. Reloading
    // only after its successful reply releases that controller; the next
    // decrypted page registers the final worker without a competing
    // transition-registration job. It preserves the current URL, query, hash,
    // and session-only gate unlock material.
    setTimeout(() => location.reload(), 0);
    return { approved: true, registration, state };
  }

  async function stageMigration() {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register('./sw-gated.js', { scope, updateViaCache: 'none' });
      return announce('gated-staged', registration);
    }

    // Do not replace an already discovered transition waiter. Its activation
    // is the first real save/refusal-guarded action for this old install.
    if (isTransition(registration.waiting) || isTransition(registration.installing)) {
      return announce('transition-waiting', registration);
    }

    if (isGated(registration.active) || isGated(registration.waiting) || isGated(registration.installing)) {
      return announce(isGated(registration.active) ? 'gated-active' : 'gated-staged', registration);
    }

    if (await activeIsTransition(registration.active)) {
      // Do not create the final worker until the second visible save guard has
      // succeeded. A message to an already-waiting worker proved unreliable
      // in the real cross-engine refusal/retry path.
      return announce('transition-active', registration);
    }

    // This is a genuine pre-gate controller. Deliberately stage the transition
    // endpoint first. Its message contract still requires the player's normal
    // durable save before it can activate.
    registration = await navigator.serviceWorker.register('./sw.js', { scope, updateViaCache: 'none' });
    const transition = await waitForTransition(registration);
    if (transition === 'active') return announce('transition-active', registration);
    return announce(transition === 'waiting' ? 'transition-waiting' : 'transition-pending', registration);
  }

  // Current runtimes wait for this promise before registering sw-gated.js.
  // Cached pre-gate runtimes do not know about it and continue to expose their
  // established first-stage save/update control.
  window.GamesGateMigration = Object.freeze({
    needsApprovedFinalActivation,
    activateApprovedFinalWorker
  });
  window.GamesGateMigrationReady = stageMigration().catch(() => ({ phase: 'unavailable' }));
})();
