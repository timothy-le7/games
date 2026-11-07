/*
 * One-time bridge for installations that predate the encrypted Pages gate.
 *
 * The public ./sw.js stays byte-identical to the prior scoped worker so a
 * browser cannot discover an update while only the lock screen is visible.
 * This script is referenced only by the decrypted game document. It asks the
 * existing registration to stage ./sw-gated.js after the old game runtime has
 * started, leaving the old page in control to run its normal save-before-
 * update guard. Fresh installs simply register the gated worker directly.
 */
'use strict';

(() => {
  if (!('serviceWorker' in navigator) || !isSecureContext || location.protocol === 'file:') return;
  const stageGatedWorker = async () => {
    try {
      // The legacy game runtime registers ./sw.js from its earlier
      // DOMContentLoaded listener. Waiting for the existing registration and
      // one task turn prevents this bridge from racing that setup back to the
      // legacy script URL before its real update UI can observe a waiter.
      await navigator.serviceWorker.ready;
      await new Promise(resolve => setTimeout(resolve, 0));
      await navigator.serviceWorker.register('./sw-gated.js', { scope: './', updateViaCache: 'none' });
    } catch {
      // The game PWA runtime presents its existing honest offline/update state.
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stageGatedWorker, { once: true });
  else stageGatedWorker();
})();
