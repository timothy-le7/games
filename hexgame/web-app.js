(() => {
  'use strict';
  let registration, offlineReady = false, applyingUpdate = false, registrationFailed = false;
  const style = document.createElement('style');
  style.textContent = `
    #web-app-update[hidden]{display:none}
    #web-app-update-notice[hidden]{display:none}
    #web-app-update-notice{position:absolute;left:12px;right:12px;top:calc(82px + env(safe-area-inset-top));min-height:44px;padding:10px 12px;border:1px solid #d6c178;border-radius:10px;background:#f3e2a5;color:#234559;font-size:12px;font-weight:700;z-index:18;box-shadow:0 4px 12px #173c5540}
    #web-app-menu span{min-width:0}
    #web-app-menu small{max-width:105px;white-space:normal;text-align:right}
    #web-app-library{text-decoration:none}
    .web-app-welcome{text-align:center;padding:4px 0}
    .web-app-badge{display:block;width:72px;height:72px;margin:0 auto 18px;border-radius:18px}
    .web-app-welcome h2{font-size:32px;letter-spacing:-1px}
    .web-app-welcome .subtitle{font-size:16px;line-height:1.5;margin:12px 0 20px}
    .web-app-welcome .large-button,#web-app-back{min-height:48px;font-size:16px}
    .web-app-welcome .save-label{font-size:13px;line-height:1.6}
    .web-app-steps{display:grid;gap:14px;margin:18px 0}
    .web-app-step{display:flex;align-items:flex-start;gap:12px;font-size:14px;line-height:1.5}
    .web-app-step .help-number{flex:none;width:30px;height:30px;display:grid;place-items:center}
    .web-app-step b{display:block;font-size:16px;margin-bottom:3px}
    .web-app-step svg{display:inline-block;width:22px;height:22px;vertical-align:middle;flex:none;margin-right:4px}
    .web-app-status{border:1px solid #ffffff24;border-radius:12px;padding:12px;margin:18px 0;font-size:13px;line-height:1.6}
    .web-app-status strong{display:block;font-size:15px;margin-bottom:4px}
    .web-app-backups summary{min-height:44px;padding:12px 0;cursor:pointer}
  `;
  document.head.append(style);
  const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const offlineStatus = () => offlineReady ? 'Available offline' : registrationFailed ? 'Open online to enable offline play' : 'Preparing offline play…';
  const welcomeKey = 'cairncoast-web-welcome-v1';
  const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V2m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg>';
  const homeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10m-5-5h10"/></svg>';

  function welcomeSeen() {
    try { if (localStorage.getItem(welcomeKey)) return true; } catch {}
    try { return !!sessionStorage.getItem(welcomeKey); } catch { return false; }
  }

  function rememberWelcome() {
    try { localStorage.setItem(welcomeKey, '1'); } catch {}
    try { sessionStorage.setItem(welcomeKey, '1'); } catch {}
  }

  function showWelcome() {
    openModal(modalCloseButton() + '<div class="web-app-welcome"><img class="web-app-badge" src="./icon-512.png" alt="" width="72" height="72"><h2>Hexgame</h2>' +
      '<p class="subtitle">Explore the world. Build your cities.<br>Your game saves as you play.</p>' +
      '<button class="large-button" id="web-app-play">Play now ' + icon('chevron') + '</button>' +
      '<button class="large-button secondary" id="web-app-add-icon">' + homeIcon + 'Add game icon</button>' +
      '<p class="save-label">Play here now, or add an icon first<br>for a full-screen view.</p></div>', 'Welcome to Hexgame');
    const play = () => { rememberWelcome(); closeModal(); };
    document.getElementById('web-app-play').onclick = play;
    document.querySelector('#modal .modal-close').onclick = play;
    document.getElementById('web-app-add-icon').onclick = () => { rememberWelcome(); showAppHelp(); };
  }

  function refreshStatus() {
    const label = document.getElementById('web-app-menu-status');
    if (label) label.textContent = registration?.waiting ? 'Update ready' : offlineStatus();
    const status = document.getElementById('web-app-offline-status');
    if (status) status.textContent = offlineStatus();
    const update = document.getElementById('web-app-update');
    if (update) update.hidden = !registration?.waiting;
    updateNotice.hidden = !registration?.waiting;
  }

  function applyUpdate() {
    if (!registration?.waiting || applyingUpdate) return;
    if (!save()) { toast('Export a save before updating. Autosave is unavailable.'); return; }
    applyingUpdate = true;
    toast('Progress saved. Updating Hexgame…');
    registration.waiting.postMessage({ type: 'POLY_TOP_APPLY_UPDATE' });
  }

  const updateNotice = document.createElement('button');
  updateNotice.id = 'web-app-update-notice';
  updateNotice.hidden = true;
  updateNotice.textContent = 'Update ready · Save progress and reload';
  updateNotice.onclick = applyUpdate;
  document.getElementById('phone').append(updateNotice);

  function showAppHelp() {
    const installed = standalone();
    openModal(modalCloseButton() + '<span class="eyebrow">PLAY ANYWHERE</span><h2>' + (installed ? 'Your game icon' : 'Add the game icon') + '</h2>' +
      (installed ? '<p class="subtitle">You\'re ready! Open Hexgame from its icon whenever you want to play.</p>' : '<p class="subtitle">First, open this link in Safari. Then:</p><div class="web-app-steps"><div class="web-app-step"><span class="help-number">1</span><div><b>' + shareIcon + 'Tap Share.</b>The square with an up arrow.</div></div><div class="web-app-step"><span class="help-number">2</span><div><b>' + homeIcon + 'Add to Home Screen.</b>Choose this from the Share list.</div></div><div class="web-app-step"><span class="help-number">3</span><div><b>Tap Add.</b>Keep Open as Web App switched on.</div></div></div>') +
      '<div class="web-app-status"><strong id="web-app-offline-status" role="status">' + offlineStatus() + '</strong>' + (installed ? 'Once ready, you can play without Wi-Fi.' : 'Open the new game icon once with Wi-Fi. Wait until this says Available offline.') + '</div>' +
      '<button class="large-button" id="web-app-back">Play now ' + icon('chevron') + '</button><button class="large-button secondary" id="web-app-update" hidden>Save progress and update</button>' +
      '<details class="save-label web-app-backups"><summary>Help and backups</summary><p>If Share is hidden, tap Safari’s page menu first. If Add to Home Screen is missing, scroll to Edit Actions to add it.</p><p>Your progress stays on this phone. Menu → Export save makes a backup. If a Safari game is missing from the new icon, export it in Safari and use Import save in the app.</p></details>', installed ? 'Game icon' : 'Add the game icon');
    document.getElementById('web-app-back').onclick = () => { rememberWelcome(); closeModal(); };
    document.getElementById('web-app-update').onclick = applyUpdate;
    refreshStatus();
    if (installed) navigator.storage?.persist?.().catch(() => {});
  }

  function addMenuEntry() {
    const anchor = document.getElementById('fullscreen-menu');
    if (!anchor || document.getElementById('web-app-menu')) return;
    const button = document.createElement('button');
    button.className = 'menu-item';
    button.id = 'web-app-menu';
    button.innerHTML = homeIcon + '<span>' + (standalone() ? 'Game icon' : 'Add game icon') + '</span><small id="web-app-menu-status"></small>';
    button.onclick = showAppHelp;
    anchor.before(button);
    const library = document.createElement('a');
    library.id = 'web-app-library';
    library.className = 'menu-item';
    library.href = location.pathname.startsWith('/games/') ? new URL('../', location.href).href : 'https://timothy-le7.github.io/games/';
    library.innerHTML = icon('back') + '<span>All games</span>' + icon('chevron');
    library.onclick = event => { if (!save()) { event.preventDefault(); toast('Export a save before leaving. Autosave is unavailable.'); } };
    anchor.before(library);
    refreshStatus();
  }
  function updateMenu() {
    addMenuEntry();
    // Keep the attribution readable without sending children to another website.
    document.querySelectorAll('#modal .credit a').forEach(link => link.replaceWith(document.createTextNode(link.textContent)));
  }
  new MutationObserver(updateMenu).observe(document.getElementById('modal'), { childList: true, subtree: true });
  updateMenu();
  if (!standalone() && !welcomeSeen()) showWelcome();

  if (!('serviceWorker' in navigator) || !isSecureContext || location.protocol === 'file:') {
    registrationFailed = true; refreshStatus(); return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(async reg => {
    registration = reg;
    const watchInstall = () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'redundant' && !reg.active) registrationFailed = true;
        setTimeout(refreshStatus, 0);
      });
    };
    reg.addEventListener('updatefound', watchInstall);
    watchInstall();
    await navigator.serviceWorker.ready;
    offlineReady = true;
    refreshStatus();
    if (standalone()) navigator.storage?.persist?.().catch(() => {});
  }).catch(() => { registrationFailed = true; refreshStatus(); });
})();
