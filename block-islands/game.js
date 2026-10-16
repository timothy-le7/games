(function () {
  'use strict';
  const R = window.BlockIslandsRules;
  const KEY = 'games:block-islands:v1';
  const PREF_KEY = KEY + ':prefs';
  const clamp = (number, minimum, maximum) => Math.max(minimum, Math.min(maximum, number));
  const $ = id => document.getElementById(id);
  const canvas = $('world');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const overlay = $('overlay');
  const panel = $('panel');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state;
  let world;
  let selectedBlock = 'plank';
  let target = null;
  let lastTime = performance.now();
  let previousStageComplete = false;
  let completionOpen = false;
  let running = true;
  let moveTimer = 0;
  let prefs = readPrefs();
  let pickMap = [];
  let renderOrder = [];
  let view = { width: 0, height: 0, scale: 30, dpr: 1, centerX: 0, centerY: 0, cameraX: 0, cameraY: 0, cameraZ: 0 };
  let audioContext = null;

  function readPrefs() {
    try {
      const value = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return { sound: value.sound !== false, motion: value.motion !== false };
    } catch (_) { return { sound: true, motion: true }; }
  }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} }
  function packed() { return { format: 'block-islands-save', version: R.SAVE_VERSION, payload: state }; }
  function validPacked(value) { return value && value.format === 'block-islands-save' && value.version === R.SAVE_VERSION ? R.sanitizeState(value.payload) : null; }
  function loadGame() {
    let backupNotice = '';
    for (const storageKey of [KEY, KEY + ':backup']) {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
        const loaded = validPacked(parsed);
        if (loaded) { if (storageKey !== KEY) backupNotice = 'Recovered the last valid backup.'; return { state: loaded, recovered: backupNotice }; }
      } catch (_) {}
    }
    return { state: R.createGame(), recovered: '' };
  }
  function durableSave() {
    const text = JSON.stringify(packed());
    try {
      localStorage.setItem(KEY, text);
      localStorage.setItem(KEY + ':backup', text);
      return true;
    } catch (_) {
      say('Autosave needs browser storage. Export a backup before leaving.');
      return false;
    }
  }
  function importSave(value) {
    const next = validPacked(value);
    if (!next) { say('That save is not a valid Block Islands backup. Your current journey is unchanged.'); return false; }
    state = next; world = R.makeWorld(state.stage, state.edits); target = null; previousStageComplete = state.stageComplete; completionOpen = false;
    if (!durableSave()) { say('Imported, but browser storage is unavailable. Export a copy before leaving.'); }
    updateUI();
    return true;
  }
  function getSummary() { return R.summary(state); }

  window.GameApp = { save: durableSave, exportSave: () => JSON.parse(JSON.stringify(packed())), importSave, getSummary };
  window.dispatchEvent(new Event('game-ready'));

  const loaded = loadGame();
  state = loaded.state;
  world = R.makeWorld(state.stage, state.edits);
  previousStageComplete = state.stageComplete;

  function say(message) {
    const line = $('statusLine');
    line.textContent = message;
    line.classList.remove('toast');
    void line.offsetWidth;
    line.classList.add('toast');
  }
  function buzz(kind) {
    if (!prefs.sound || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
      oscillator.frequency.value = kind === 'danger' ? 150 : kind === 'success' ? 620 : 370;
      gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .11);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .12);
    } catch (_) {}
  }
  function open(html) { panel.innerHTML = html; overlay.classList.add('open'); running = false; }
  function close() { overlay.classList.remove('open'); running = true; completionOpen = false; lastTime = performance.now(); }
  function escape(text) { return String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function button(id, text, cls) { return '<button id="' + id + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</button>'; }
  function bind(id, fn) { const node = $(id); if (node) node.addEventListener('click', fn); }

  function welcome(recovered) {
    const continued = state.completed.length || state.time > 1;
    open('<p class="eyebrow">ORIGINAL VOXEL ADVENTURE</p><h1>Block Islands</h1><p class="lead">Explore hand-built island challenges: move, aim, mine, build and craft your way to the aurora summit.</p><div class="how-grid"><div><strong>1 · Move</strong>Use the arrows or WASD.</div><div><strong>2 · Aim + mine</strong>Tap a nearby block, then Mine.</div><div><strong>3 · Build</strong>Choose a hotbar block and Place.</div><div><strong>4 · Craft</strong>Turn gathered materials into tools.</div></div>' + button('startButton', continued ? 'Continue expedition' : 'Start expedition') + button('creativeButton', 'Creative sandbox', 'secondary') + '<p class="tiny">Campaign progress saves on this device. The menu can export a backup for another browser or Home Screen app.' + (recovered ? '<br><strong>' + escape(recovered) + '</strong>' : '') + '</p>');
    bind('startButton', close);
    bind('creativeButton', () => { state = R.createGame(); state.creative = true; state.unlocked = 11; for (const item of R.INVENTORY_KEYS) state.inventory[item] = 99; R.startStage(state, 9, false); previousStageComplete = false; state.message = 'Creative sandbox: unlimited building blocks and tools.'; world = R.makeWorld(state.stage, state.edits); durableSave(); updateUI(); close(); });
  }
  function menu() {
    const status = document.querySelector('[data-game-offline-status]')?.textContent || 'Offline status will appear after the game is cached.';
    open('<p class="eyebrow">BLOCK ISLANDS</p><h2>' + escape(R.STAGES[state.stage].name) + '</h2><p class="lead">Island ' + (state.stage + 1) + ' of 12 · ' + (state.creative ? 'Creative sandbox' : 'Campaign') + '<br>Autosaves after each action. Export before switching browser profiles or Home Screen apps.</p>' + button('resumeButton', 'Resume') + button('stagesButton', 'Choose unlocked island', 'secondary') + button('soundButton', 'Sound: ' + (prefs.sound ? 'On' : 'Off'), 'secondary') + button('exportButton', 'Export save', 'secondary') + button('importButton', 'Import save', 'secondary') + '<button data-install-game class="secondary" id="installButton">Install / offline help</button><a data-all-games href="../" class="button-link secondary" id="allGames">All games</a><p class="offline-status" data-game-offline-status>' + escape(status) + '</p>');
    bind('resumeButton', close); bind('stagesButton', stages); bind('soundButton', () => { prefs.sound = !prefs.sound; savePrefs(); menu(); }); bind('exportButton', downloadSave); bind('importButton', () => $('importInput').click());
    if (typeof window.GamesPWARefreshControls === 'function') window.GamesPWARefreshControls();
    else bind('installButton', () => { say('Safari: Share → Add to Home Screen → Add. Offline is ready only after the status confirms caching.'); close(); });
    const all = $('allGames'); if (all) all.addEventListener('click', event => { if (!durableSave()) { event.preventDefault(); say('Could not save. Export a backup before leaving.'); } });
  }
  function stages() {
    let cards = '';
    for (let i = 0; i <= state.unlocked; i++) cards += '<button class="recipe-card" data-stage="' + i + '"><strong>' + (i + 1) + '. ' + escape(R.STAGES[i].name) + '</strong><span>' + escape(R.STAGES[i].goalText) + (state.completed.includes(i) ? ' · Complete' : '') + '</span></button>';
    open('<p class="eyebrow">CAMPAIGN MAP</p><h2>Choose an unlocked island</h2><div class="recipe-grid">' + cards + '</div>' + button('backMenu', 'Back', 'secondary'));
    panel.querySelectorAll('[data-stage]').forEach(node => node.addEventListener('click', () => { const number = Number(node.dataset.stage); if (number <= state.unlocked) { R.startStage(state, number, false); previousStageComplete = false; world = R.makeWorld(state.stage, state.edits); target = null; durableSave(); updateUI(); close(); } }));
    bind('backMenu', menu);
  }
  function craftMenu() {
    let recipes = '';
    for (const [name, recipe] of Object.entries(R.RECIPES)) {
      const need = Object.entries(recipe.cost).map(([item, amount]) => amount + ' ' + item).join(' · ');
      const blocked = recipe.requires && !state.inventory[recipe.requires];
      recipes += '<button class="recipe-card" data-recipe="' + name + '"' + (blocked ? ' disabled' : '') + '><strong>' + escape(recipe.label) + '</strong><span>' + escape(need + (recipe.requires ? ' · needs ' + recipe.requires : '')) + '</span></button>';
    }
    open('<p class="eyebrow">FIELD CRAFTING</p><h2>Make what you need</h2><p class="lead">Crafting consumes only the listed resources. Tools stay in your pack after a stage retry.</p><div class="recipe-grid">' + recipes + '</div>' + button('closeCraft', 'Back to island', 'secondary'));
    panel.querySelectorAll('[data-recipe]').forEach(node => node.addEventListener('click', () => { const result = R.craft(state, node.dataset.recipe); say(result.ok ? state.message : result.reason); buzz(result.ok ? 'success' : 'danger'); if (result.ok) { durableSave(); updateUI(); handleCompletion(); } craftMenu(); }));
    bind('closeCraft', close);
  }
  function completion() {
    completionOpen = true; running = false;
    const final = state.stage === R.STAGES.length - 1;
    open('<div class="complete-mark">' + (final ? '✦' : '✓') + '</div><p class="eyebrow">' + (final ? 'AURORA RESTORED' : 'ISLAND COMPLETE') + '</p><h2>' + escape(R.STAGES[state.stage].name) + '</h2><p class="lead">' + escape(state.message) + '</p>' + (final ? button('finishButton', 'Explore the islands') : button('nextIsland', 'Travel to ' + escape(R.STAGES[state.stage + 1].name))) + button('mapButton', 'Campaign map', 'secondary'));
    if (final) bind('finishButton', close);
    else bind('nextIsland', () => { R.startStage(state, state.stage + 1, false); previousStageComplete = false; world = R.makeWorld(state.stage, state.edits); target = null; durableSave(); updateUI(); close(); });
    bind('mapButton', stages);
  }
  function downloadSave() {
    const blob = new Blob([JSON.stringify(window.GameApp.exportSave(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'block-islands-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); say('Save backup downloaded.');
  }
  function updateUI() {
    const stage = R.STAGES[state.stage];
    $('stageNumber').textContent = state.creative ? 'CREATIVE SANDBOX' : 'ISLAND ' + (state.stage + 1) + ' / 12';
    $('stageName').textContent = stage.name; $('goalText').textContent = stage.goalText;
    $('questProgress').textContent = state.stageComplete ? 'Complete — choose your next island.' : stage.goalText;
    $('healthText').textContent = Math.max(0, Math.ceil(state.player.health));
    const phase = Math.floor(state.time / 18) % 2; $('dayClock').textContent = phase ? 'NIGHT' : 'DAY';
    const bar = $('hotbar'); let html = '';
    for (const item of ['plank', 'dirt', 'stone', 'basalt', 'beacon']) {
      const count = state.creative ? '∞' : state.inventory[item] || 0;
      html += '<button class="slot ' + (selectedBlock === item ? 'selected' : '') + '" data-block="' + item + '"' + (!state.creative && !state.inventory[item] ? ' disabled' : '') + '>' + item + '<em>' + count + '</em></button>';
    }
    bar.innerHTML = html;
    bar.querySelectorAll('[data-block]').forEach(node => node.addEventListener('click', () => { selectedBlock = node.dataset.block; updateUI(); say('Selected ' + selectedBlock + '.'); }));
    if (target) { const cell = R.getCell(world, target.x, target.y); if (cell) { $('targetTag').hidden = false; $('targetTag').textContent = (cell.resource || cell.surface || 'block') + ' · ' + (R.topHeight(cell) || 1); } } else $('targetTag').hidden = true;
  }
  function action(name) {
    let result;
    if (name === 'mine') result = target ? R.mine(state, world, target.x, target.y) : { ok: false, reason: 'Aim at a nearby block first.' };
    else if (name === 'place') result = target ? R.place(state, world, target.x, target.y, selectedBlock) : { ok: false, reason: 'Aim at a nearby block first.' };
    else result = R.attack(state, target ? target.x : state.player.x, target ? target.y : state.player.y);
    say(result.ok ? state.message : result.reason); buzz(result.ok ? 'success' : 'danger');
    if (result.ok) { durableSave(); updateUI(); handleCompletion(); }
  }
  function moveBy(dx, dy) {
    if (!running) return;
    const result = R.move(state, world, dx, dy); if (!result.ok) say(result.reason); else if (result.water) say('Wading is slow. Build planks for a safe crossing.');
    updateUI(); handleCompletion();
  }
  function handleCompletion() { if (state.stageComplete && !previousStageComplete) { durableSave(); setTimeout(completion, 160); } previousStageComplete = state.stageComplete; }
  function retry() { R.retryStage(state); world = R.makeWorld(state.stage, state.edits); target = null; previousStageComplete = false; durableSave(); updateUI(); close(); say('Back at camp with most of your pack.'); }

  function resize() {
    const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = rect.width; view.height = rect.height; view.dpr = dpr; view.scale = Math.max(17, Math.min(39, Math.min(rect.width / 15.5, rect.height / 9.2)));
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    pickMap = new Array(R.SIZE * R.SIZE); renderOrder = new Array(R.SIZE * R.SIZE);
    let index = 0; for (let total = 0; total <= (R.SIZE - 1) * 2; total++) for (let y = 0; y < R.SIZE; y++) { const x = total - y; if (x >= 0 && x < R.SIZE) renderOrder[index++] = { x, y }; }
    for (let i = 0; i < pickMap.length; i++) pickMap[i] = { x: 0, y: 0, sx: 0, sy: 0 };
  }
  function raw(x, y, z) { return { x: (x - y) * view.scale * .78, y: (x + y) * view.scale * .4 - z * view.scale * .68 }; }
  function point(x, y, z) { const p = raw(x, y, z); return { x: view.centerX + p.x - view.cameraX, y: view.centerY + p.y - view.cameraY }; }
  function color(base, amount) { const num = parseInt(base.slice(1), 16); const r = clamp((num >> 16) + amount, 0, 255) | 0; const g = clamp(((num >> 8) & 255) + amount, 0, 255) | 0; const b = clamp((num & 255) + amount, 0, 255) | 0; return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0'); }
  const PALETTE = { dirt: '#8a6845', sand: '#d6b169', ice: '#a7dbe0', basalt: '#55606e', stone: '#7c8791', wood: '#77523c', ore: '#c77b4e', crystal: '#75e3df', berry: '#bf4e69', plank: '#a8794b', beacon: '#a6f0e4', relic: '#e4b85b' };
  function polygon(points, fill, stroke) { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
  function cube(x, y, z, material, size) {
    const s = size || 1; const a = point(x, y, z + s), b = point(x + s, y, z + s), c = point(x + s, y + s, z + s), d = point(x, y + s, z + s);
    const aa = point(x, y, z), bb = point(x + s, y, z), cc = point(x + s, y + s, z);
    const base = PALETTE[material] || PALETTE.dirt;
    polygon([a, b, c, d], color(base, 18), '#00000015'); polygon([d, c, cc, point(x, y + s, z)], color(base, -13), '#00000013'); polygon([b, c, cc, bb], color(base, -29), '#00000013');
  }
  function diamond(x, y, z, fill, outline) { polygon([point(x, y, z), point(x + 1, y, z), point(x + 1, y + 1, z), point(x, y + 1, z)], fill, outline); }
  function drawResource(cell, z) {
    const type = cell.resource; if (!type) return;
    if (type === 'wood') { cube(cell.x + .34, cell.y + .34, z, 'wood', .32); cube(cell.x + .14, cell.y + .14, z + .32, 'wood', .72); ctx.globalAlpha = .92; cube(cell.x + .02, cell.y + .02, z + .83, 'berry', .96); ctx.globalAlpha = 1; }
    else if (type === 'berry') { cube(cell.x + .2, cell.y + .2, z, 'berry', .6); }
    else if (type === 'crystal') { cube(cell.x + .3, cell.y + .3, z, 'crystal', .42); cube(cell.x + .56, cell.y + .44, z, 'crystal', .25); }
    else if (type === 'ore' || type === 'relic') { cube(cell.x + .24, cell.y + .24, z, type, .52); }
    else if (type === 'stone' || type === 'sand' || type === 'ice') { cube(cell.x + .2, cell.y + .2, z, type, .58); }
  }
  function render() {
    if (!ctx) return;
    const stage = R.STAGES[state.stage]; const night = (Math.sin(state.time / 18 * Math.PI) + 1) * .5;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.clearRect(0, 0, view.width, view.height);
    ctx.fillStyle = night < .18 ? '#152940' : '#7bcde0'; ctx.fillRect(0, 0, view.width, view.height);
    const current = R.getCell(world, Math.floor(state.player.x), Math.floor(state.player.y)); const camera = raw(state.player.x, state.player.y, current ? R.topHeight(current) : 1);
    view.centerX = view.width * .5; view.centerY = view.height * .51; view.cameraX = camera.x; view.cameraY = camera.y; view.cameraZ = 0;
    for (let n = 0; n < renderOrder.length; n++) {
      const cell = R.getCell(world, renderOrder[n].x, renderOrder[n].y); const projected = point(cell.x + .5, cell.y + .5, R.topHeight(cell));
      const pick = pickMap[cell.y * R.SIZE + cell.x]; pick.x = cell.x; pick.y = cell.y; pick.sx = projected.x; pick.sy = projected.y;
      if (projected.x < -view.scale * 4 || projected.x > view.width + view.scale * 4 || projected.y < -view.scale * 5 || projected.y > view.height + view.scale * 5) continue;
      if (cell.water || cell.lava) diamond(cell.x, cell.y, 0, cell.lava ? '#e35f3f' : '#55b7c4', '#ffffff35');
      for (let z = 0; z < cell.h; z++) cube(cell.x, cell.y, z, z === cell.h - 1 ? cell.surface : 'dirt');
      if (cell.bridge) cube(cell.x, cell.y, cell.h, 'plank');
      for (let z = 0; z < cell.extra.length; z++) cube(cell.x, cell.y, cell.h + (cell.bridge ? 1 : 0) + z, cell.extra[z]);
      drawResource(cell, R.topHeight(cell));
    }
    for (const enemy of state.enemies) if (enemy.alive) { const p = point(enemy.x - .24, enemy.y - .24, 1.1); ctx.fillStyle = '#2d324c'; ctx.beginPath(); ctx.ellipse(p.x, p.y, view.scale * .24, view.scale * .16, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffcc72'; ctx.fillRect(p.x - 2, p.y - 1, 3, 2); }
    const pp = point(state.player.x - .18, state.player.y - .18, 1.05); ctx.fillStyle = '#f6d7b4'; ctx.beginPath(); ctx.arc(pp.x, pp.y - view.scale * .24, view.scale * .15, 0, Math.PI * 2); ctx.fill(); cube(state.player.x - .28, state.player.y - .28, .45, state.creative ? 'crystal' : 'plank', .56);
    if (target) { const cell = R.getCell(world, target.x, target.y); if (cell) diamond(cell.x, cell.y, R.topHeight(cell) + .03, 'rgba(255,241,143,.23)', '#fff1a0'); }
    if (night < .3) { ctx.fillStyle = 'rgba(13,23,48,' + (.42 - night).toFixed(2) + ')'; ctx.fillRect(0, 0, view.width, view.height); }
  }
  function aim(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(); const x = clientX - rect.left, y = clientY - rect.top; let best = null; let closest = Infinity;
    for (const pick of pickMap) { const d = Math.hypot(x - pick.sx, y - pick.sy); if (d < closest) { closest = d; best = pick; } }
    if (best && closest < Math.max(54, view.scale * 1.7)) { target = { x: best.x, y: best.y }; const inRange = Math.hypot(state.player.x - best.x - .5, state.player.y - best.y - .5) <= 3.9; say(inRange ? 'Aimed at ' + (R.getCell(world, best.x, best.y).resource || 'block') + '.' : 'Aim set — move closer to interact.'); updateUI(); }
  }
  function loop(now) {
    const dt = Math.min(.08, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    if (running && !document.hidden) {
      const ticked = R.tick(state, world, dt);
      if (ticked.defeated) { durableSave(); open('<p class="eyebrow">RECOVERY</p><h2>Back at camp</h2><p class="lead">The island wildlife overwhelmed you. Retrying keeps tools and most materials, but resets this island’s terrain and foes.</p>' + button('retryButton', 'Retry island') + button('mapAfterLoss', 'Campaign map', 'secondary')); bind('retryButton', retry); bind('mapAfterLoss', stages); }
      else if (ticked.damaged) updateUI();
    }
    render(); requestAnimationFrame(loop);
  }

  $('menuButton').addEventListener('click', menu); $('mineButton').addEventListener('click', () => action('mine')); $('placeButton').addEventListener('click', () => action('place')); $('strikeButton').addEventListener('click', () => action('strike')); $('craftButton').addEventListener('click', craftMenu);
  canvas.addEventListener('pointerdown', event => { aim(event.clientX, event.clientY); });
  function startMove(direction) { const vectors = { up: [0, -.38], down: [0, .38], left: [-.38, 0], right: [.38, 0] }; const v = vectors[direction]; moveBy(v[0], v[1]); clearInterval(moveTimer); moveTimer = setInterval(() => moveBy(v[0], v[1]), 130); }
  document.querySelectorAll('[data-move]').forEach(node => { node.addEventListener('pointerdown', event => { event.preventDefault(); startMove(node.dataset.move); }); node.addEventListener('pointerup', () => clearInterval(moveTimer)); node.addEventListener('pointercancel', () => clearInterval(moveTimer)); node.addEventListener('pointerleave', () => clearInterval(moveTimer)); });
  window.addEventListener('pointerup', () => clearInterval(moveTimer));
  window.addEventListener('keydown', event => { if (event.repeat || !running) return; const key = event.key.toLowerCase(); const vectors = { w: [0, -.38], arrowup: [0, -.38], s: [0, .38], arrowdown: [0, .38], a: [-.38, 0], arrowleft: [-.38, 0], d: [.38, 0], arrowright: [.38, 0] }; if (vectors[key]) { event.preventDefault(); moveBy(...vectors[key]); } else if (key === 'e') action('mine'); else if (key === 'q') action('place'); else if (key === ' ') { event.preventDefault(); action('strike'); } else if (key === 'escape') menu(); });
  $('importInput').addEventListener('change', event => { const file = event.target.files && event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { importSave(JSON.parse(String(reader.result))); } catch (_) { say('That file is not valid JSON. Your current journey is unchanged.'); } close(); }; reader.readAsText(file); event.target.value = ''; });
  window.addEventListener('resize', resize); document.addEventListener('visibilitychange', () => { if (document.hidden) { durableSave(); clearInterval(moveTimer); } else lastTime = performance.now(); }); window.addEventListener('pagehide', durableSave);
  resize(); updateUI(); welcome(loaded.recovered); requestAnimationFrame(loop);
})();
