(() => {
  'use strict';

  const state = { registration: null, ready: false, failed: false, applying: false };
  const selector = value => Array.from(document.querySelectorAll(value));
  const gameName = () => document.querySelector('meta[name="application-name"]')?.content || document.title.replace(/\s*[|—-].*$/, '').trim() || 'this game';
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const isFilePreview = () => location.protocol === 'file:';
  const isStandalone = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  const statusText = () => {
    if (state.registration?.waiting) return 'Update ready';
    if (state.ready) return 'Available offline';
    if (isFilePreview()) return 'Offline setup is unavailable in a file preview.';
    if (state.failed) return 'Open online to enable offline play.';
    return 'Preparing offline play…';
  };

  function setStatus(message) {
    for (const node of selector('[data-game-offline-status]')) node.textContent = message || statusText();
  }

  function toast(message) {
    let node = document.getElementById('games-pwa-notice');
    if (!node) {
      node = document.createElement('p');
      node.id = 'games-pwa-notice';
      node.className = 'games-pwa-notice';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      (document.querySelector('[data-install-game]')?.parentElement || document.body).append(node);
    }
    node.textContent = message;
  }

  function saveBeforeLeaving() {
    const app = window.GameApp;
    if (!app || typeof app.save !== 'function') {
      toast('The game is still starting. Please wait before leaving.');
      return false;
    }
    try {
      if (app.save() === true) return true;
    } catch {}
    toast('Progress could not be saved. Export a backup from the game menu before leaving.');
    return false;
  }

  function closeHelp() {
    document.getElementById('games-pwa-help')?.remove();
  }

  function openHelp() {
    closeHelp();
    const dialog = document.createElement('section');
    dialog.id = 'games-pwa-help';
    dialog.className = 'games-pwa-help';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Install ' + gameName());
    const installed = isStandalone();
    dialog.innerHTML = '<div class="games-pwa-panel"><button type="button" class="games-pwa-close" aria-label="Close">×</button>' +
      '<h2>' + (installed ? 'Game icon ready' : 'Add ' + escapeHtml(gameName()) + ' to your Home Screen') + '</h2>' +
      (installed
        ? '<p>This game is running from an app icon. Your game data is stored separately from Safari, so keep exported backups for important progress.</p>'
        : '<p>In Safari, follow these steps:</p><ol><li><strong>Share</strong> — tap the square with the up arrow.</li><li><strong>Add to Home Screen</strong> — choose it from the Share menu.</li><li><strong>Add</strong> — keep “Open as Web App” enabled.</li></ol><p>Open the new icon once while online. It is offline-ready only after the status says “Available offline.”</p>') +
      '<p class="games-pwa-status" data-game-offline-status role="status"></p>' +
      '<button type="button" class="games-pwa-done">Back to game</button></div>';
    document.body.append(dialog);
    dialog.querySelector('.games-pwa-close').onclick = closeHelp;
    dialog.querySelector('.games-pwa-done').onclick = closeHelp;
    dialog.addEventListener('click', event => { if (event.target === dialog) closeHelp(); });
    setStatus();
    dialog.querySelector('.games-pwa-done').focus();
  }

  function installStyles() {
    if (document.getElementById('games-pwa-style')) return;
    const style = document.createElement('style');
    style.id = 'games-pwa-style';
    style.textContent = '.games-pwa-update,[data-install-game]{min-height:44px;touch-action:manipulation}.games-pwa-update[hidden]{display:none}.games-pwa-notice{margin:.5rem 0;color:inherit;font:inherit}.games-pwa-help{position:fixed;z-index:2147483647;inset:0;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:#08111de0;color:#f8fafc}.games-pwa-panel{position:relative;width:min(34rem,100%);max-height:100%;overflow:auto;box-sizing:border-box;border-radius:18px;padding:24px;background:#132238;box-shadow:0 16px 48px #0009;line-height:1.5}.games-pwa-panel h2{margin:0 32px 12px 0;font-size:1.35rem}.games-pwa-panel ol{padding-left:1.35rem}.games-pwa-panel li{margin:.45rem 0}.games-pwa-close{position:absolute;right:12px;top:10px;width:44px;height:44px;border:0;border-radius:50%;font-size:1.6rem;line-height:1;background:transparent;color:inherit}.games-pwa-done,.games-pwa-update{min-height:44px;padding:.6rem .9rem;border:0;border-radius:10px;font:inherit;font-weight:700;cursor:pointer}.games-pwa-done{background:#f8fafc;color:#102033}.games-pwa-status{font-weight:700}';
    document.head.append(style);
  }

  function updateControl() {
    const button = document.querySelector('[data-games-pwa-update]');
    if (!button) return;
    const waiting = !!state.registration?.waiting;
    button.hidden = !waiting;
    if (waiting) {
      button.textContent = 'Save progress and update';
      button.disabled = state.applying;
      button.setAttribute('aria-label', 'Save progress and update ' + gameName());
    }
    setStatus();
  }

  function applyUpdate() {
    const waiting = state.registration?.waiting;
    if (!waiting || state.applying) return;
    if (!saveBeforeLeaving()) return;
    state.applying = true;
    toast('Progress saved. Applying update…');
    waiting.postMessage({ type: 'GAMES_PWA_APPLY_UPDATE' });
  }

  function prepareControls() {
    installStyles();
    for (const install of selector('[data-install-game]')) {
      if (install.dataset.gamesPwaInstallBound) continue;
      install.dataset.gamesPwaInstallBound = '1';
      install.addEventListener('click', openHelp);
    }
    for (const link of selector('[data-all-games]')) {
      if (link.dataset.gamesPwaLibraryBound) continue;
      link.dataset.gamesPwaLibraryBound = '1';
      link.addEventListener('click', event => { if (!saveBeforeLeaving()) event.preventDefault(); });
    }
    const install = document.querySelector('[data-install-game]');
    if (install && !document.querySelector('[data-games-pwa-update]')) {
      const update = document.createElement('button');
      update.type = 'button';
      update.hidden = true;
      update.className = 'games-pwa-update';
      update.dataset.gamesPwaUpdate = '';
      update.addEventListener('click', applyUpdate);
      install.insertAdjacentElement('afterend', update);
    }
    setStatus();
    updateControl();
  }

  async function registerWorker() {
    if (isFilePreview() || !('serviceWorker' in navigator) || !window.isSecureContext) {
      state.failed = !isFilePreview();
      setStatus();
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      state.registration = registration;
      const observe = worker => worker?.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !registration.active) state.failed = true;
        updateControl();
      });
      observe(registration.installing);
      registration.addEventListener('updatefound', () => observe(registration.installing));
      if (registration.waiting) updateControl();
      await navigator.serviceWorker.ready;
      state.ready = true;
      setStatus();
      updateControl();
      if (isStandalone()) navigator.storage?.persist?.().catch(() => {});
    } catch {
      state.failed = true;
      setStatus();
    }
  }

  function initialise() {
    prepareControls();
    window.addEventListener('game-ready', prepareControls);
    navigator.serviceWorker?.addEventListener('controllerchange', () => { if (state.applying) location.reload(); });
    registerWorker();
  }

  // Game menus may be rendered after this small runtime initializes.  A game
  // can call this optional hook after inserting its menu so install, update,
  // save-before-leaving, and offline status controls receive the same wiring.
  window.GamesPWARefreshControls = prepareControls;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
