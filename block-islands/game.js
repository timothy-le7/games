/* Block Islands first-person controller. Rendering is supplied by voxel-view.js. */
(function () {
  'use strict';
  const R = window.BlockIslandsRules;
  const V = window.BlockIslandsVoxel;
  const KEY = 'games:block-islands:v1';
  const PREF_KEY = KEY + ':prefs';
  const $ = id => document.getElementById(id);
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const clone = value => JSON.parse(JSON.stringify(value));
  const canvas = $('world'), overlay = $('overlay'), panel = $('panel');
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const EYE = 1.58, RADIUS = .28, BODY = 1.68;
  let state, world, profiles, activeMode = 'campaign', selectedBlock = 'plank';
  let renderer = null, blocks = new Map(), renderBlocks = [], worldRevision = 0;
  let pose = { x: 2.5, y: 3.5, z: 3.5, yaw: 0, pitch: -.08, vy: 0, grounded: false };
  let target = null, running = true, previousStageComplete = false, completionOpen = false, lastRenderCamera = { mode: 'third', distance: 0, collision: false };
  let saveTimer = 0, lastSavedAt = performance.now(), lastTime = performance.now(), lastTargetAt = 0;
  let mineHold = null, mining = 0, audioContext = null, lastDamage = 0, toolSwingUntil = 0;
  const effects = [];
  const input = { joy: { x: 0, y: 0, pointer: null }, look: null, keys: new Set() };
  let prefs = readPrefs();
  const worldSize = () => world && Number.isInteger(world.size) ? world.size : R.sizeForWorldVersion(state && state.worldVersion);

  function readPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return { sound: raw.sound !== false, motion: raw.motion !== false, sensitivity: clamp(Number(raw.sensitivity) || 1, .45, 2.1), buttonSize: clamp(Number(raw.buttonSize) || 1, .8, 1.28), handedness: raw.handedness === 'left' ? 'left' : 'right', camera: raw.camera === 'first' ? 'first' : 'third' };
    } catch (_) { return { sound: true, motion: true, sensitivity: 1, buttonSize: 1, handedness: 'right', camera: 'third' }; }
  }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {} }
  function applyPrefs() {
    document.documentElement.style.setProperty('--action-scale', String(prefs.buttonSize));
    const actions = document.querySelector('.action-cluster'), move = document.querySelector('.move-zone');
    actions.style.right = prefs.handedness === 'left' ? 'auto' : ''; actions.style.left = prefs.handedness === 'left' ? 'max(12px, env(safe-area-inset-left))' : '';
    actions.style.transform = 'scale(' + prefs.buttonSize + ')'; actions.style.transformOrigin = prefs.handedness === 'left' ? 'bottom left' : 'bottom right';
    move.style.left = prefs.handedness === 'left' ? 'auto' : ''; move.style.right = prefs.handedness === 'left' ? 'max(12px, env(safe-area-inset-right))' : '';
    const cameraButton = $('cameraButton');
    if (cameraButton) {
      const first = prefs.camera === 'first';
      cameraButton.textContent = first ? '1P' : '3P';
      cameraButton.setAttribute('aria-label', first ? 'Switch to third-person view' : 'Switch to first-person view');
    }
  }
  function makeCreative() {
    const next = R.createGame(R.DEFAULT_SEED ^ 0x51f15e);
    next.creative = true; next.unlocked = R.STAGES.length - 1;
    for (const item of R.INVENTORY_KEYS) next.inventory[item] = 99;
    R.startStage(next, 9, false);
    next.message = 'Creative sandbox: unlimited building blocks and tools.';
    return next;
  }
  function syncProfile() { if (state && profiles) profiles[activeMode] = clone(state); }
  function packed() { syncProfile(); return { format: 'block-islands-save', version: R.SAVE_VERSION, payload: { activeMode, camera: prefs.camera, campaign: profiles.campaign, creative: profiles.creative } }; }
  function validPacked(value) {
    if (!value || value.format !== 'block-islands-save' || value.version !== R.SAVE_VERSION) return null;
    const source = value.payload;
    if (source && source.campaign) {
      const campaign = R.sanitizeState(source.campaign), creative = source.creative ? R.sanitizeState(source.creative) : null;
      if (!campaign || source.creative && !creative || creative && !creative.creative) return null;
      campaign.creative = false;
      return { activeMode: source.activeMode === 'creative' && creative ? 'creative' : 'campaign', camera: source.camera === 'first' || source.camera === 'third' ? source.camera : null, campaign, creative, legacy: false };
    }
    const legacy = R.sanitizeState(source);
    if (!legacy) return null;
    return { activeMode: legacy.creative ? 'creative' : 'campaign', camera: null, campaign: legacy.creative ? null : legacy, creative: legacy.creative ? legacy : null, legacy: true };
  }
  function readStored(name) { try { return validPacked(JSON.parse(localStorage.getItem(name) || 'null')); } catch (_) { return null; } }
  function loadGame() {
    const primary = readStored(KEY), backup = readStored(KEY + ':backup'), loaded = primary || backup;
    if (!loaded) return { session: { activeMode: 'campaign', camera: null, campaign: R.createGame(), creative: null }, recovered: '' };
    if (loaded.legacy) {
      const other = backup && backup.legacy && backup.activeMode !== loaded.activeMode ? backup : null;
      loaded.campaign = loaded.campaign || other?.campaign || R.createGame();
      loaded.creative = loaded.creative || other?.creative || null;
    }
    return { session: loaded, recovered: primary ? (loaded.legacy ? 'Your earlier save was brought into the first-person world.' : '') : 'Recovered the last valid backup.' };
  }
  function durableWrite(name, text) {
    let old;
    try { old = localStorage.getItem(name); localStorage.setItem(name, text); if (localStorage.getItem(name) !== text) throw Error('verify'); return true; }
    catch (_) { try { if (old === null) localStorage.removeItem(name); else localStorage.setItem(name, old); } catch (_) {} return false; }
  }
  function durableSave() {
    clearTimeout(saveTimer); saveTimer = 0; persistPose();
    const text = JSON.stringify(packed());
    try {
      const currentText = localStorage.getItem(KEY), current = currentText && validPacked(JSON.parse(currentText)), backup = readStored(KEY + ':backup');
      if (current && !durableWrite(KEY + ':backup', currentText)) throw Error('backup');
      if (!current && !backup && !durableWrite(KEY + ':backup', text)) throw Error('seed backup');
      if (!durableWrite(KEY, text)) throw Error('primary');
      lastSavedAt = performance.now(); return true;
    } catch (_) { lastSavedAt = performance.now(); say('Autosave needs browser storage. Export a backup before leaving.'); return false; }
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(durableSave, 700); }
  function persistPose() {
    const size = worldSize();
    state.player.x = clamp(pose.x, .2, size - .2); state.player.y = clamp(pose.z, .2, size - .2);
    state.pose = { x: state.player.x, y: clamp(pose.y, .2, 28), z: state.player.y, yaw: pose.yaw, pitch: pose.pitch };
  }
  function importSave(value) {
    const next = validPacked(value);
    if (!next) { say('That save is not valid. Your current journey is unchanged.'); return false; }
    const old = { profiles: clone(profiles), mode: activeMode, state: clone(state), prefs: clone(prefs) };
    if (next.legacy) { syncProfile(); if (next.activeMode === 'creative') profiles.creative = next.creative; else profiles.campaign = next.campaign; }
    else profiles = { campaign: next.campaign, creative: next.creative };
    activeMode = next.activeMode; state = clone(profiles[activeMode]); if (next.camera) prefs.camera = next.camera; loadStage();
    if (!durableSave()) { profiles = old.profiles; activeMode = old.mode; state = old.state; prefs = old.prefs; savePrefs(); loadStage(); say('Import stopped because browser storage is unavailable.'); return false; }
    savePrefs(); applyPrefs();
    updateUI(); return true;
  }
  function getSummary() {
    const render = renderer && renderer.getStats ? renderer.getStats() : null;
    return Object.assign({ mode: activeMode, hasCampaign: !!profiles.campaign, hasCreative: !!profiles.creative, firstPerson: prefs.camera === 'first', camera: prefs.camera, cameraDistance: lastRenderCamera.distance, cameraCollision: lastRenderCamera.collision, target: target && target.material, targetBlock: target && [target.x, target.y, target.z], pose: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, pitch: pose.pitch }, render: render && { blocks: render.blocks, faces: render.faces, drawCalls: render.drawCalls, frames: render.frames, width: render.width, height: render.height, dpr: render.dpr, pixelBudget: render.pixelBudget } }, R.summary(state));
  }

  const loaded = loadGame();
  profiles = { campaign: loaded.session.campaign || R.createGame(), creative: loaded.session.creative || null };
  activeMode = loaded.session.activeMode === 'creative' && profiles.creative ? 'creative' : 'campaign';
  if (loaded.session.camera) prefs.camera = loaded.session.camera;
  state = clone(profiles[activeMode]);
  window.GameApp = { save: durableSave, exportSave: () => clone(packed()), importSave, getSummary };
  window.dispatchEvent(new Event('game-ready'));

  function say(text) {
    const node = $('statusLine'); node.textContent = text; node.classList.remove('toast'); void node.offsetWidth; node.classList.add('toast');
  }
  function buzz(kind) {
    if (!prefs.sound || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.frequency.value = kind === 'danger' ? 145 : kind === 'mine' ? 235 : 580;
      gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .1);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .11);
    } catch (_) {}
  }
  function escape(text) { return String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function button(id, text, cls) { return '<button id="' + id + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</button>'; }
  function bind(id, fn) { const node = $(id); if (node) node.addEventListener('click', fn); }
  function open(html) { clearInputs(); panel.innerHTML = html; overlay.classList.add('open'); running = false; }
  function close() { overlay.classList.remove('open'); running = true; completionOpen = false; lastTime = performance.now(); }

  function welcome(recovered) {
    const continued = profiles.campaign.completed.length || profiles.campaign.time > 1;
    const rendererNote = V ? '' : '<p class="tiny"><strong>3D view is loading.</strong> This build needs its local voxel renderer before play can begin.</p>';
    open('<p class="eyebrow">ORIGINAL VOXEL EXPEDITION</p><h1>Block Islands</h1><p class="lead">Explore twelve hand-built islands as a field explorer. Gather, craft, build bridges and make it to the aurora summit.</p><div class="how-grid"><div><strong>1 · Move</strong>Drag the left joystick or use WASD.</div><div><strong>2 · Look</strong>Drag the open right side of the view.</div><div><strong>3 · Mine</strong>Hold Mine on a block in the crosshair.</div><div><strong>4 · Build</strong>Choose a hotbar block, then tap Place.</div></div>' + button('startButton', continued ? 'Continue expedition' : 'Start expedition') + button('creativeButton', profiles.creative ? 'Continue creative sandbox' : 'Start creative sandbox', 'secondary') + rendererNote + '<p class="tiny">You begin in rear view. Tap 3P / 1P beside Jump to switch views. Campaign and Creative saves stay separate; export from pause before moving to another browser or Home Screen app.' + (recovered ? '<br><strong>' + escape(recovered) + '</strong>' : '') + '</p>');
    bind('startButton', () => activateMode('campaign')); bind('creativeButton', () => activateMode('creative'));
  }
  function activateMode(mode) {
    syncProfile(); if (mode === 'creative' && !profiles.creative) profiles.creative = makeCreative();
    activeMode = mode; state = clone(profiles[mode]); loadStage(); durableSave(); updateUI(); close();
  }
  function menu() {
    const offline = document.querySelector('[data-game-offline-status]')?.textContent || 'Offline status will appear after the local game is cached.';
    open('<p class="eyebrow">BLOCK ISLANDS</p><h2>' + escape(R.STAGES[state.stage].name) + '</h2><p class="lead">Island ' + (state.stage + 1) + ' of 12 · ' + (state.creative ? 'Creative sandbox' : 'Campaign') + '<br>' + (prefs.camera === 'first' ? 'First-person' : 'Rear third-person') + ' view · meaningful actions save automatically.</p>' + button('resumeButton', 'Resume') + button('stagesButton', 'Choose unlocked island', 'secondary') + button('modeButton', state.creative ? 'Return to campaign' : profiles.creative ? 'Open creative sandbox' : 'Start creative sandbox', 'secondary') + button('settingsButton', 'Controls and accessibility', 'secondary') + button('exportButton', 'Export both saves', 'secondary') + button('importButton', 'Import save', 'secondary') + '<button data-install-game class="secondary" id="installButton">Install / offline help</button><a data-all-games href="../" class="button-link secondary" id="allGames">All games</a><p class="offline-status" data-game-offline-status>' + escape(offline) + '</p>');
    bind('resumeButton', close); bind('stagesButton', stages); bind('modeButton', () => activateMode(state.creative ? 'campaign' : 'creative')); bind('settingsButton', settings); bind('exportButton', downloadSave); bind('importButton', () => $('importInput').click());
    if (typeof window.GamesPWARefreshControls === 'function') window.GamesPWARefreshControls();
    else bind('installButton', () => { say('Safari: Share → Add to Home Screen → Add. Offline is ready only after caching finishes.'); close(); });
    const all = $('allGames'); if (all) all.addEventListener('click', event => { if (!durableSave()) { event.preventDefault(); say('Could not save. Export a backup before leaving.'); } });
  }
  function settings() {
    open('<p class="eyebrow">CONTROLS</p><h2>Make it comfortable</h2><p class="lead">These controls are kept only in this game’s preferences.</p><div class="settings-grid"><button class="recipe-card" id="sensitivityButton"><strong>Look sensitivity</strong><span>' + Math.round(prefs.sensitivity * 100) + '% · tap to cycle</span></button><button class="recipe-card" id="handButton"><strong>Action hand</strong><span>' + (prefs.handedness === 'right' ? 'Right actions' : 'Left actions') + '</span></button><button class="recipe-card" id="sizeButton"><strong>Button size</strong><span>' + Math.round(prefs.buttonSize * 100) + '% · tap to cycle</span></button><button class="recipe-card" id="soundButton"><strong>Sound</strong><span>' + (prefs.sound ? 'On' : 'Off') + '</span></button></div>' + button('backMenu', 'Back', 'secondary'));
    bind('sensitivityButton', () => { prefs.sensitivity = prefs.sensitivity >= 1.9 ? .7 : +(prefs.sensitivity + .25).toFixed(2); savePrefs(); settings(); });
    bind('handButton', () => { prefs.handedness = prefs.handedness === 'right' ? 'left' : 'right'; savePrefs(); applyPrefs(); settings(); });
    bind('sizeButton', () => { prefs.buttonSize = prefs.buttonSize >= 1.2 ? .9 : +(prefs.buttonSize + .1).toFixed(2); savePrefs(); settings(); });
    bind('soundButton', () => { prefs.sound = !prefs.sound; savePrefs(); settings(); }); bind('backMenu', menu);
  }
  function stages() {
    let cards = '';
    for (let i = 0; i <= state.unlocked; i++) cards += '<button class="recipe-card" data-stage="' + i + '"><strong>' + (i + 1) + '. ' + escape(R.STAGES[i].name) + '</strong><span>' + escape(R.STAGES[i].goalText) + (state.completed.includes(i) ? ' · Complete' : '') + '</span></button>';
    open('<p class="eyebrow">CAMPAIGN MAP</p><h2>Choose an unlocked island</h2><div class="recipe-grid">' + cards + '</div>' + button('backMenu', 'Back', 'secondary'));
    panel.querySelectorAll('[data-stage]').forEach(node => node.addEventListener('click', () => { const stage = Number(node.dataset.stage); if (stage <= state.unlocked) { R.startStage(state, stage, false); loadStage(); durableSave(); updateUI(); close(); } }));
    bind('backMenu', menu);
  }
  function craftMenu() {
    let recipes = '';
    for (const [name, recipe] of Object.entries(R.RECIPES)) {
      const need = Object.entries(recipe.cost).map(([item, amount]) => amount + ' ' + item).join(' · ');
      recipes += '<button class="recipe-card" data-recipe="' + name + '"' + (recipe.requires && !state.inventory[recipe.requires] ? ' disabled' : '') + '><strong>' + escape(recipe.label) + '</strong><span>' + escape(need + (recipe.requires ? ' · needs ' + recipe.requires : '')) + '</span></button>';
    }
    open('<p class="eyebrow">FIELD CRAFTING</p><h2>Make what you need</h2><p class="lead">Recipes consume exactly the listed resources. Better tools unlock tougher materials.</p><div class="recipe-grid">' + recipes + '</div>' + button('closeCraft', 'Back to island', 'secondary'));
    panel.querySelectorAll('[data-recipe]').forEach(node => node.addEventListener('click', () => { const result = R.craft(state, node.dataset.recipe); say(result.ok ? state.message : result.reason); buzz(result.ok ? 'success' : 'danger'); if (result.ok) { durableSave(); updateUI(); handleCompletion(); } craftMenu(); }));
    bind('closeCraft', close);
  }
  function completion() {
    completionOpen = true; const final = state.stage === R.STAGES.length - 1;
    open('<div class="complete-mark">' + (final ? '✦' : '✓') + '</div><p class="eyebrow">' + (final ? 'AURORA RESTORED' : 'ISLAND COMPLETE') + '</p><h2>' + escape(R.STAGES[state.stage].name) + '</h2><p class="lead">' + escape(state.message) + '</p>' + (final ? button('finishButton', 'Explore the islands') : button('nextIsland', 'Travel to ' + escape(R.STAGES[state.stage + 1].name))) + button('mapButton', 'Campaign map', 'secondary'));
    if (final) bind('finishButton', close);
    else bind('nextIsland', () => { R.startStage(state, state.stage + 1, false); loadStage(); durableSave(); updateUI(); close(); });
    bind('mapButton', stages);
  }
  function retry() { R.retryStage(state); loadStage(); durableSave(); updateUI(); close(); say('Back at camp with most of your pack.'); }
  function handleCompletion() { if (state.stageComplete && !previousStageComplete) { previousStageComplete = true; durableSave(); setTimeout(completion, 120); } }
  function downloadSave() { const blob = new Blob([JSON.stringify(window.GameApp.exportSave(), null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'block-islands-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); say('Save backup downloaded.'); }

  function setBlock(x, y, z, material, source) {
    const size = worldSize();
    if (x < 0 || z < 0 || x >= size || z >= size || y < 0 || y > 24) return;
    blocks.set(R.voxelKey(x, y, z), { x, y, z, material, source: source || 'terrain' });
  }
  function groundMaterial(cell, y) {
    // Keep legacy campaigns visually stable. New expeditions expose more
    // stone in hills, with soil only under the grassy surface instead of a
    // checkerboard of identical blocks.
    if (world.worldVersion >= 3 && y < cell.h - 1) return y < cell.h - 3 ? 'stone' : 'dirt';
    if (y < cell.h - 1) return y === 0 ? 'stone' : 'dirt';
    if (cell.surface === 'sand' || cell.surface === 'ice' || cell.surface === 'basalt') return cell.surface;
    return cell.h > 1 ? 'stone' : 'grass';
  }
  function visibleMaterial(material) {
    return ({ berry: 'flower', relic: 'beacon', leaf: 'leaves' })[material] || material;
  }
  function sceneryRoll(cell, salt) { return R.hash(state.seed ^ (R.STAGES[state.stage].seed >>> 0) ^ salt, cell.x, cell.y); }
  function addTree(cell, harvestable) {
    const h = cell.h;
    // The harvestable root is the actual resource block used by the rules;
    // the visible trunk, limbs, and canopy are local scenery around it.
    setBlock(cell.x, h, cell.y, 'wood', harvestable ? 'resource' : 'decor');
    setBlock(cell.x, h + 1, cell.y, 'wood', 'decor');
    setBlock(cell.x, h + 2, cell.y, 'wood', 'decor');
    const turn = sceneryRoll(cell, 0x4d3); const axisX = turn % 2 === 0;
    for (const sign of [-1, 1]) setBlock(cell.x + (axisX ? sign : 0), h + 2, cell.y + (axisX ? 0 : sign), 'wood', 'decor');
    for (let level = 0; level < 2; level++) {
      const radius = level === 0 ? 2 : 1;
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > radius + 1 || (!dx && !dz && level === 0)) continue;
        setBlock(cell.x + dx, h + 3 + level, cell.y + dz, 'leaves', 'decor');
      }
    }
    setBlock(cell.x, h + 5, cell.y, 'leaves', 'decor');
  }
  function addPlant(cell, material) {
    // A slim block makes grassland legible at first-person scale while
    // remaining non-solid to movement and ray targeting.
    setBlock(cell.x, cell.h, cell.y, material, 'decor');
  }
  function addLandmarks(stage) {
    if (world.worldVersion < 3) return;
    // A real overhang rather than a painted horizon. It makes quarry, cave,
    // forge, and expedition routes recognisable when the player reaches them.
    const cave = stage.biome === 'quarry' || stage.biome === 'forge' || stage.biome === 'aurora';
    if (cave) {
      const start = stage.biome === 'aurora' ? 26 : 20;
      for (let x = start; x < start + 7; x++) for (let z = 18; z < 22; z++) {
        if ((x + z) % 3 !== 0) setBlock(x, 7 + ((x + z) % 2), z, stage.biome === 'aurora' ? 'crystal' : 'stone', 'landmark');
      }
      for (let x = start; x < start + 7; x += 3) { setBlock(x, 3, 18, 'stone', 'landmark'); setBlock(x, 4, 18, 'stone', 'landmark'); setBlock(x, 5, 18, 'stone', 'landmark'); }
    }
    if (state.stage === 0) {
      // The first clearing has a small, original field shelter and fire ring:
      // an immediately readable route marker, not a menu-only objective.
      for (const [x, z] of [[14, 10], [15, 10], [14, 11], [15, 11]]) setBlock(x, 3, z, 'plank', 'landmark');
      setBlock(14, 4, 10, 'wood', 'landmark'); setBlock(15, 4, 11, 'wood', 'landmark');
      setBlock(14, 5, 11, 'beacon', 'landmark');
      const campOak = R.getCell(world, 14, 8);
      if (campOak && !campOak.resource) addTree(campOak, false);
    }
    if (stage.biome === 'settlement') for (let x = 12; x < 19; x++) {
      setBlock(x, 3, 13, 'plank', 'landmark'); setBlock(x, 4, 13, 'leaves', 'landmark');
      if (x % 3 === 0) { setBlock(x, 4, 13, 'wood', 'landmark'); setBlock(x, 5, 13, 'beacon', 'landmark'); }
    }
    if (stage.biome === 'forge') { setBlock(10, 4, 10, 'basalt', 'landmark'); setBlock(10, 5, 10, 'ore', 'landmark'); }
    if (stage.biome === 'aurora') { setBlock(14, 5, 14, 'crystal', 'landmark'); setBlock(14, 6, 14, 'crystal', 'landmark'); }
  }
  function populateTerrain() {
    blocks = new Map();
    for (const cell of world.cells) {
      for (let y = 0; y < cell.h; y++) setBlock(cell.x, y, cell.y, groundMaterial(cell, y), 'base');
      if (cell.water) setBlock(cell.x, 0, cell.y, 'water', 'fluid');
      if (cell.lava) setBlock(cell.x, 0, cell.y, 'lava', 'fluid');
      const rich = world.worldVersion >= 3;
      const treeBiome = ['forest', 'meadow', 'settlement', 'frost'].includes(R.STAGES[state.stage].biome);
      // The nearest tutorial logs remain low so an opening player is not
      // spawned inside a trunk; the harvestable grove begins beyond the
      // clearing, with its oak visible down the initial sightline.
      const openingClearing = state.stage === 0 && cell.x < 12 && cell.y < 10;
      const harvestableTree = cell.resource === 'wood' && !openingClearing;
      // Deterministic grove scenery fills out new worlds without changing
      // rule resources. The starter clearing stays open for first-time aim.
      const scenicTree = rich && treeBiome && !openingClearing && !cell.resource && !cell.water && !cell.lava && cell.x + cell.y > 16 && sceneryRoll(cell, 0x1af) % 29 === 0;
      if (harvestableTree && rich) addTree(cell, true);
      else if (scenicTree) addTree(cell, false);
      else if (cell.resource) setBlock(cell.x, cell.h, cell.y, visibleMaterial(cell.resource), 'resource');
      else if (cell.bridge) setBlock(cell.x, cell.h, cell.y, 'plank', 'bridge');
      else for (let i = 0; i < cell.extra.length; i++) setBlock(cell.x, cell.h + i, cell.y, cell.extra[i], 'extra');
      if (rich && !cell.resource && !cell.water && !cell.lava && cell.surface === 'grass' && !scenicTree) {
        const roll = sceneryRoll(cell, 0x7c9) % 47;
        if (roll === 0) addPlant(cell, 'flower'); else if (roll < 4) addPlant(cell, 'fern');
      }
    }
    addLandmarks(R.STAGES[state.stage]);
    for (const [name, material] of Object.entries(state.voxelEdits || {})) {
      const [x, y, z] = name.split(',').map(Number);
      if (material === null) blocks.delete(name); else setBlock(x, y, z, material, 'custom');
    }
    renderBlocks = Array.from(blocks.values()).map(({ x, y, z, material }) => ({ x, y, z, material }));
  }
  function topAt(x, z) { let top = -1; for (let y = 0; y <= 24; y++) { const block = getBlock(x, y, z); if (block && !fluid(block) && !['leaves', 'fern', 'flower'].includes(block.material)) top = y; } return top; }
  function footingTopAt(x, z) {
    let top = -1;
    for (let y = 0; y <= 24; y++) {
      const block = getBlock(x, y, z);
      if (block && !fluid(block) && block.material !== 'leaves' && block.source !== 'decor') top = y;
    }
    return top;
  }
  function getBlock(x, y, z) { return blocks.get(R.voxelKey(x, y, z)); }
  // Foliage remains visible and casts body shadows, but it is not an invisible
  // interaction wall in front of a tree trunk.
  function rayBlock(x, y, z) { const block = getBlock(x, y, z); return block && !['leaves', 'fern', 'flower'].includes(block.material) ? block : null; }
  function fluid(block) { return block && (block.material === 'water' || block.material === 'lava'); }
  function rebuildWorld() {
    populateTerrain(); worldRevision++;
    if (renderer) renderer.setWorld(renderBlocks, worldRevision);
    updateTarget();
  }
  function derivePose() {
    const stored = state.pose;
    if (stored) pose = { x: stored.x, y: stored.y, z: stored.z, yaw: stored.yaw, pitch: stored.pitch, vy: 0, grounded: false };
    else {
      // Begin in an open part of the clearing, framing the authored logs and
      // pale rock rather than spawning the camera inside a landmark.
      const camp = state.stage === 0 && !state.creative;
      // The southern edge of the clearing keeps every starter resource within
      // the normal five-block reach, but faces an open grove rather than
      // spawning the camera amid the tutorial logs.
      const size = worldSize(), x = camp ? 1.5 : clamp(state.player.x, .5, size - .5), z = camp ? 5.8 : clamp(state.player.y, .5, size - .5);
      pose = { x, z, y: Math.max(1, footingTopAt(Math.floor(x), Math.floor(z)) + 1) + EYE + .02, yaw: camp ? -1.70 : .15, pitch: camp ? -.14 : -.28, vy: 0, grounded: true };
    }
    if (collides(pose.x, pose.y - EYE)) pose.y = Math.max(1, footingTopAt(Math.floor(pose.x), Math.floor(pose.z)) + 1) + EYE + .03;
  }
  function loadStage() {
    world = R.makeWorld(state.stage, state.edits, state.seed, state.worldVersion); target = null; previousStageComplete = !!state.stageComplete; populateTerrain(); derivePose(); rebuildWorld();
    if (renderer) renderer.setWorld(renderBlocks, worldRevision);
  }
  function ensureRenderer() {
    if (renderer || !V || typeof V.createRenderer !== 'function') return !!renderer;
    try { renderer = V.createRenderer(canvas); resize(); renderer.setWorld(renderBlocks, worldRevision); return true; }
    catch (_) { say('This browser could not start the 3D island view. Try a current browser with WebGL enabled.'); return false; }
  }
  function resize() {
    const landscape = window.innerWidth > window.innerHeight && window.innerHeight < 500;
    $('statusLine').style.top = landscape ? '108px' : '142px';
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  }

  function collides(x, feet, z) {
    const x0 = Math.floor(x - RADIUS + .001), x1 = Math.floor(x + RADIUS - .001);
    const z0 = Math.floor(z - RADIUS + .001), z1 = Math.floor(z + RADIUS - .001);
    const y0 = Math.floor(feet + .03), y1 = Math.floor(feet + BODY - .03);
    for (let bx = x0; bx <= x1; bx++) for (let bz = z0; bz <= z1; bz++) for (let by = y0; by <= y1; by++) { const block = getBlock(bx, by, bz); if (block && !fluid(block) && !['leaves', 'fern', 'flower'].includes(block.material)) return true; }
    return false;
  }
  function tryHorizontal(dx, dz) {
    const feet = pose.y - EYE, beforeX = pose.x, beforeZ = pose.z;
    const size = worldSize();
    pose.x = clamp(pose.x + dx, .2, size - .2);
    if (collides(pose.x, feet, pose.z)) {
      pose.y += .62;
      if (collides(pose.x, pose.y - EYE, pose.z)) { pose.x = beforeX; pose.y -= .62; } else pose.grounded = true;
    }
    pose.z = clamp(pose.z + dz, .2, size - .2);
    if (collides(pose.x, pose.y - EYE, pose.z)) {
      pose.y += .62;
      if (collides(pose.x, pose.y - EYE, pose.z)) { pose.z = beforeZ; pose.y -= .62; } else pose.grounded = true;
    }
  }
  function isInWater() {
    const block = getBlock(Math.floor(pose.x), Math.floor(pose.y - EYE + .2), Math.floor(pose.z));
    return block && block.material === 'water';
  }
  function updatePhysics(dt) {
    const forward = (input.keys.has('w') || input.keys.has('arrowup') ? 1 : 0) - (input.keys.has('s') || input.keys.has('arrowdown') ? 1 : 0) - input.joy.y;
    const sideways = (input.keys.has('d') || input.keys.has('arrowright') ? 1 : 0) - (input.keys.has('a') || input.keys.has('arrowleft') ? 1 : 0) + input.joy.x;
    const length = Math.hypot(forward, sideways) || 1, speed = isInWater() ? 2 : 3.55;
    if (forward || sideways) {
      const f = forward / length * speed * dt, s = sideways / length * speed * dt;
      // The renderer's contract is yaw 0 → -Z and positive yaw → -X.
      // Keep movement on exactly the same axes as the camera.
      tryHorizontal(-Math.sin(pose.yaw) * f + Math.cos(pose.yaw) * s, -Math.cos(pose.yaw) * f - Math.sin(pose.yaw) * s);
    }
    const feet = pose.y - EYE;
    pose.vy += (isInWater() ? -7 : -17) * dt;
    pose.vy = Math.max(pose.vy, -11);
    pose.y += pose.vy * dt;
    if (collides(pose.x, pose.y - EYE, pose.z)) {
      if (pose.vy < 0) { let safe = pose.y; while (collides(pose.x, safe - EYE, pose.z) && safe < 28) safe += .03; pose.y = safe; pose.grounded = true; }
      else pose.y = feet + EYE;
      pose.vy = 0;
    } else pose.grounded = false;
    if (pose.y < -3) { pose.y = Math.max(1, topAt(Math.floor(pose.x), Math.floor(pose.z)) + 1) + EYE; pose.vy = 0; say('The current carried you back to solid ground.'); }
    const cell = R.getCell(world, Math.floor(pose.x), Math.floor(pose.z));
    if (cell && cell.lava && performance.now() - lastDamage > 900) { state.player.health = Math.max(0, state.player.health - .7); lastDamage = performance.now(); buzz('danger'); }
    // Campaign enemies and spatial objectives retain the published rule model;
    // continuously mirror the physical body into its legacy x/z coordinates.
    state.player.x = pose.x; state.player.y = pose.z; R.checkGoal(state);
  }
  function jump() {
    if (!running) return;
    if (pose.grounded || isInWater()) { pose.vy = isInWater() ? 4 : 5.6; pose.grounded = false; buzz('mine'); scheduleSave(); }
  }

  function fallbackRaycast(origin, direction, maxDistance) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    if (rayBlock(x, y, z)) return { x, y, z, normal: { x: 0, y: 0, z: 0 }, block: rayBlock(x, y, z) };
    const dx = direction.x || 1e-9, dy = direction.y || 1e-9, dz = direction.z || 1e-9;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    let tx = ((dx > 0 ? x + 1 - origin.x : origin.x - x) / Math.abs(dx)), ty = ((dy > 0 ? y + 1 - origin.y : origin.y - y) / Math.abs(dy)), tz = ((dz > 0 ? z + 1 - origin.z : origin.z - z) / Math.abs(dz));
    const ddx = 1 / Math.abs(dx), ddy = 1 / Math.abs(dy), ddz = 1 / Math.abs(dz); let distance = 0, normal = { x: 0, y: 0, z: 0 };
    while (distance <= maxDistance) {
      if (tx < ty && tx < tz) { x += stepX; distance = tx; tx += ddx; normal = { x: -stepX, y: 0, z: 0 }; }
      else if (ty < tz) { y += stepY; distance = ty; ty += ddy; normal = { x: 0, y: -stepY, z: 0 }; }
      else { z += stepZ; distance = tz; tz += ddz; normal = { x: 0, y: 0, z: -stepZ }; }
      const block = rayBlock(x, y, z); if (block) return { x, y, z, normal, block, distance };
    }
    return null;
  }
  function direction() {
    const vector = V && typeof V.forward === 'function' ? V.forward(pose.yaw, pose.pitch) : [-Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), -Math.cos(pose.yaw) * Math.cos(pose.pitch)];
    return { x: vector[0], y: vector[1], z: vector[2] };
  }
  function renderCamera() {
    if (prefs.camera === 'first') return { position: [pose.x, pose.y, pose.z], yaw: pose.yaw, pitch: pose.pitch, fov: 82, third: false, distance: 0, collision: false };
    const look = direction(), feet = pose.y - EYE, targetPoint = [pose.x, feet + 1.03, pose.z], desired = [pose.x - look.x * 4.25, feet + 2.02 - look.y * 4.25, pose.z - look.z * 4.25];
    let follow = { position: desired, distance: Math.hypot(desired[0] - targetPoint[0], desired[1] - targetPoint[1], desired[2] - targetPoint[2]), collision: false };
    try { if (V && typeof V.retractCamera === 'function') follow = V.retractCamera((x, y, z) => rayBlock(x, y, z), targetPoint, desired, .20) || follow; } catch (_) {}
    const dx = targetPoint[0] - follow.position[0], dy = targetPoint[1] - follow.position[1], dz = targetPoint[2] - follow.position[2], length = Math.hypot(dx, dy, dz) || 1;
    return { position: follow.position, yaw: Math.atan2(-dx, -dz), pitch: Math.asin(dy / length), fov: 78, third: true, distance: follow.distance, collision: follow.collision };
  }
  function normalizeRay(ray) {
    if (!ray) return null;
    const coordinates = Array.isArray(ray.block) ? ray.block : [ray.x, ray.y, ray.z];
    const [x, y, z] = coordinates;
    const block = getBlock(x, y, z) || (!Array.isArray(ray.block) && ray.block);
    const sourceNormal = ray.normal || ray.face || [0, 0, 0];
    const normal = Array.isArray(sourceNormal) ? { x: sourceNormal[0], y: sourceNormal[1], z: sourceNormal[2] } : sourceNormal;
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && block ? { x, y, z, normal, block, material: block.material || ray.material || block } : null;
  }
  function updateTarget() {
    const now = performance.now(); if (now - lastTargetAt < 20) return; lastTargetAt = now;
    const origin = { x: pose.x, y: pose.y, z: pose.z }, dir = direction();
    let ray = null;
    try { if (V && typeof V.raycast === 'function') ray = V.raycast((x, y, z) => rayBlock(x, y, z), [origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], 5); } catch (_) {}
    target = normalizeRay(ray) || fallbackRaycast(origin, dir, 5);
    const tag = $('targetTag');
    if (target && target.block && !fluid(target.block)) { tag.hidden = false; tag.textContent = String(target.material).replace(/^./, m => m.toUpperCase()) + ' · ' + (target.block.source === 'resource' ? 'hold Mine' : 'mine / build'); }
    else tag.hidden = true;
  }
  function bodyWouldOverlap(x, y, z) {
    const foot = pose.y - EYE;
    return x + 1 > pose.x - RADIUS && x < pose.x + RADIUS && z + 1 > pose.z - RADIUS && z < pose.z + RADIUS && y + 1 > foot && y < foot + BODY;
  }
  function emitEffect(x, y, z, material, kind) {
    effects.push({ x, y, z, material: visibleMaterial(material), kind: kind || 'chip', at: performance.now() });
    if (effects.length > 12) effects.splice(0, effects.length - 12);
  }
  function swingTool() { toolSwingUntil = performance.now() + 220; }
  function mineTarget(hit) {
    if (!hit || !hit.block) return { ok: false, reason: 'Aim at a block within reach first.' };
    const block = hit.block;
    if (block.source === 'decor' || block.source === 'landmark') {
      if (!R.setVoxelEdit(state, hit.x, hit.y, hit.z, null)) return { ok: false, reason: 'That foliage cannot be cleared here.' };
      rebuildWorld(); emitEffect(hit.x + .5, hit.y + .5, hit.z + .5, block.material, 'leaf'); swingTool(); state.message = 'Cleared foliage.'; return { ok: true };
    }
    if (block.source === 'custom') {
      const material = block.material;
      R.setVoxelEdit(state, hit.x, hit.y, hit.z, null);
      if (!state.creative && R.INVENTORY_KEYS.includes(material)) state.inventory[material] = (state.inventory[material] || 0) + 1;
      state.mined[material] = (state.mined[material] || 0) + 1; rebuildWorld(); emitEffect(hit.x + .5, hit.y + .5, hit.z + .5, material); swingTool(); state.message = '+1 ' + material + '.'; return { ok: true };
    }
    const cell = R.getCell(world, hit.x, hit.z);
    if (!cell) return { ok: false, reason: 'That block is beyond the island.' };
    const expected = block.source === 'resource' ? cell.h : block.source === 'bridge' ? cell.h : block.source === 'extra' ? cell.h + cell.extra.length - 1 : cell.h - 1;
    if (hit.y !== expected) return { ok: false, reason: 'Mine the exposed top layer, not through the rock.' };
    state.player.x = pose.x; state.player.y = pose.z;
    const result = R.mine(state, world, hit.x, hit.z);
    if (result.ok) { rebuildWorld(); emitEffect(hit.x + .5, hit.y + .5, hit.z + .5, block.material); swingTool(); }
    return result;
  }
  function genericPlace(x, y, z, item) {
    if (!state.creative && !(state.inventory[item] > 0)) return { ok: false, reason: 'You do not have that block.' };
    if (!R.setVoxelEdit(state, x, y, z, item)) return { ok: false, reason: 'That spot is outside the build boundary.' };
    if (!state.creative) state.inventory[item]--;
    state.placed[item] = (state.placed[item] || 0) + 1;
    state.message = 'Placed ' + item + '.'; R.checkGoal(state); rebuildWorld(); emitEffect(x + .5, y + .5, z + .5, item, 'place'); swingTool(); return { ok: true };
  }
  function placeTarget() {
    if (!target) return say('Aim at a nearby face before placing.');
    const normal = target.normal || {}, x = target.x + (normal.x || 0), y = target.y + (normal.y || 0), z = target.z + (normal.z || 0);
    const size = worldSize();
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || x < 0 || z < 0 || x >= size || z >= size || y < 0 || y > 24) return say('That face is outside the island build boundary.');
    if (getBlock(x, y, z) || bodyWouldOverlap(x, y, z)) return say('There is no room to place a block there.');
    const columnTop = topAt(x, z), cell = R.getCell(world, x, z);
    let result;
    if (cell && y === columnTop + 1) { state.player.x = pose.x; state.player.y = pose.z; result = R.place(state, world, x, z, selectedBlock); if (result.ok) { rebuildWorld(); emitEffect(x + .5, y + .5, z + .5, selectedBlock, 'place'); swingTool(); } }
    else result = genericPlace(x, y, z, selectedBlock);
    say(result.ok ? state.message : result.reason); buzz(result.ok ? 'success' : 'danger');
    if (result.ok) { swingTool(); durableSave(); updateUI(); handleCompletion(); }
  }
  function attack() {
    let chosen = null, best = Infinity, dir = direction();
    for (const enemy of state.enemies) if (enemy.alive) {
      const dx = enemy.x - pose.x, dz = enemy.y - pose.z, distance = Math.hypot(dx, dz);
      if (distance > 3.3) continue;
      const facing = (dx * dir.x + dz * dir.z) / Math.max(distance, .01);
      if (facing > .3 && distance < best) { best = distance; chosen = enemy; }
    }
    const result = chosen ? R.attack(state, chosen.x, chosen.y) : { ok: false, reason: 'Aim at a nearby skitter to strike.' };
    say(result.ok ? state.message : result.reason); buzz(result.ok ? 'success' : 'danger');
    if (result.ok) { durableSave(); updateUI(); handleCompletion(); }
  }
  function beginMine(event) {
    event.preventDefault(); event.stopPropagation();
    if (!running || !target || fluid(target.block)) { say('Aim at a solid block first.'); return; }
    mineHold = { x: target.x, y: target.y, z: target.z, source: target.block.source, pointer: event.pointerId }; mining = 0;
    $('mineProgress').removeAttribute('aria-hidden'); event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function endMine(event) {
    if (event) event.stopPropagation();
    mineHold = null; mining = 0; $('mineProgress').setAttribute('aria-hidden', 'true'); $('mineProgress').firstElementChild.style.width = '0%';
  }
  function updateMine(dt) {
    if (!mineHold || !target || target.x !== mineHold.x || target.y !== mineHold.y || target.z !== mineHold.z || target.block.source !== mineHold.source) return endMine();
    const block = target.block, duration = state.creative ? .08 : block.material === 'ore' || block.material === 'ice' ? .85 : block.material === 'crystal' || block.material === 'basalt' ? 1.15 : .48;
    mining = Math.min(1, mining + dt / duration); $('mineProgress').firstElementChild.style.width = Math.round(mining * 100) + '%';
    if (mining >= 1) {
      const result = mineTarget(target); say(result.ok ? state.message : result.reason); buzz(result.ok ? 'mine' : 'danger');
      endMine(); if (result.ok) { durableSave(); updateUI(); handleCompletion(); }
    }
  }
  function updateUI() {
    const stage = R.STAGES[state.stage];
    $('stageNumber').textContent = state.creative ? 'CREATIVE SANDBOX' : 'ISLAND ' + (state.stage + 1) + ' / 12';
    $('stageName').textContent = stage.name; $('questProgress').textContent = state.stageComplete ? 'Complete — choose your next island.' : stage.goalText;
    $('healthText').textContent = Math.max(0, Math.ceil(state.player.health)); $('dayClock').textContent = Math.floor(state.time / 18) % 2 ? 'NIGHT' : 'DAY';
    $('heldReadout').textContent = (selectedBlock === 'plank' && state.inventory.stonePick ? 'Stone pick' : selectedBlock) + ' · ' + (state.creative ? '∞' : state.inventory[selectedBlock] || 0);
    const colors = { plank: '#b77b49', dirt: '#8e6745', stone: '#8997a0', basalt: '#59616b', beacon: '#91e4d6' };
    $('hotbar').innerHTML = ['plank', 'dirt', 'stone', 'basalt', 'beacon'].map(item => '<button class="slot ' + (selectedBlock === item ? 'selected' : '') + '" data-block="' + item + '"' + (!state.creative && !state.inventory[item] ? ' disabled' : '') + '><span style="background:' + colors[item] + '"></span>' + item + '<em>' + (state.creative ? '∞' : state.inventory[item] || 0) + '</em></button>').join('');
    $('hotbar').querySelectorAll('[data-block]').forEach(node => node.addEventListener('click', event => { event.stopPropagation(); selectedBlock = node.dataset.block; updateUI(); say('Selected ' + selectedBlock + '.'); }));
  }

  function clearInputs() {
    input.joy.x = input.joy.y = 0; input.joy.pointer = null; input.look = null; input.keys.clear(); endMine();
    const knob = $('joyKnob'); knob.style.transform = 'translate(-50%,-50%)';
  }
  function moveStart(event) {
    if (!running) return; event.preventDefault(); event.stopPropagation(); input.joy.pointer = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); updateJoy(event);
  }
  function updateJoy(event) {
    if (event.pointerId !== input.joy.pointer) return;
    const rect = $('moveZone').getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, max = Math.min(rect.width, rect.height) * .29;
    let dx = event.clientX - cx, dy = event.clientY - cy, length = Math.hypot(dx, dy) || 1;
    if (length > max) { dx *= max / length; dy *= max / length; }
    input.joy.x = dx / max; input.joy.y = dy / max; $('joyKnob').style.transform = 'translate(calc(-50% + ' + dx + 'px),calc(-50% + ' + dy + 'px))';
  }
  function lookStart(event) {
    if (!running || event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); input.look = { pointer: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function lookMove(event) {
    if (!input.look || event.pointerId !== input.look.pointer) return;
    event.preventDefault(); const factor = .006 * prefs.sensitivity; pose.yaw -= (event.clientX - input.look.x) * factor; pose.pitch = clamp(pose.pitch - (event.clientY - input.look.y) * factor, -1.42, 1.42); input.look.x = event.clientX; input.look.y = event.clientY;
  }
  function keyboard(event, down) {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === ' ') { if (down && !event.repeat) jump(); return; }
    if (key === 'e' && down && !event.repeat) { beginMine({ preventDefault() {}, stopPropagation() {}, pointerId: -1, currentTarget: $('mineButton') }); return; }
    if (key === 'q' && down && !event.repeat) { placeTarget(); return; }
    if (key === 'f' && down && !event.repeat) { attack(); return; }
    if (key === 'escape' && down && !event.repeat) { overlay.classList.contains('open') ? close() : menu(); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) down ? input.keys.add(key) : input.keys.delete(key);
  }
  function entities() {
    return state.enemies.filter(e => e.alive).map(e => ({
      x: e.x, y: Math.max(topAt(Math.floor(e.x), Math.floor(e.y)) + 1, 1), z: e.y,
      team: 'enemy', heading: Math.atan2(pose.x - e.x, pose.z - e.y), walk: state.time * .6, attack: e.cooldown > .7 ? 1 : 0
    }));
  }
  function loop(now) {
    const rawDt = Math.max(0, (now - lastTime) / 1000), dt = Math.min(.05, rawDt); lastTime = now;
    if (running && !document.hidden) {
      updatePhysics(dt); handleCompletion(); updateTarget();
      // Rendering may be slower in a software-emulated browser than it is on
      // a phone GPU. Mining is an intentional held action, so let its visible
      // progress track bounded real time while physics remains fixed-step.
      updateMine(Math.min(.16, rawDt));
      const ticked = R.tick(state, world, dt);
      if (ticked.defeated) { durableSave(); open('<p class="eyebrow">RECOVERY</p><h2>Back at camp</h2><p class="lead">The island wildlife overwhelmed you. Retrying keeps tools and most materials, but resets this island’s terrain and foes.</p>' + button('retryButton', 'Retry island') + button('mapAfterLoss', 'Campaign map', 'secondary')); bind('retryButton', retry); bind('mapAfterLoss', stages); }
      else if (ticked.damaged) { buzz('danger'); updateUI(); }
      if (!saveTimer && now - lastSavedAt > 5000) durableSave();
    }
    while (effects.length && now - effects[0].at > 680) effects.shift();
    if (ensureRenderer()) {
      try {
        const camera = renderCamera(); lastRenderCamera = { mode: camera.third ? 'third' : 'first', distance: camera.distance, collision: !!camera.collision };
        renderer.render({
          camera, time: state.time,
          daylight: clamp(.7 + Math.sin(state.time / 18 * Math.PI) * .24, .34, .94),
          target: target && { block: [target.x, target.y, target.z], normal: [target.normal.x || 0, target.normal.y || 0, target.normal.z || 0], progress: mining },
          entities: entities(), effects: effects.map(effect => Object.assign({}, effect, { age: clamp((now - effect.at) / 680, 0, 1) })),
          player: camera.third && (!camera.collision || camera.distance > 2.15) ? { x: pose.x, y: pose.y - EYE, z: pose.z, heading: pose.yaw, look: pose.pitch, walk: Math.hypot(input.joy.x, input.joy.y) + input.keys.size ? state.time * .9 : 0, airborne: !pose.grounded, held: mining ? 'tool' : (state.inventory[selectedBlock] > 0 ? selectedBlock : null), swing: Math.max(mining, clamp((toolSwingUntil - now) / 220, 0, 1)) } : null,
          held: camera.third ? null : { material: mining ? 'tool' : (state.inventory[selectedBlock] > 0 ? selectedBlock : null), swing: Math.max(mining, clamp((toolSwingUntil - now) / 220, 0, 1)) }
        });
      } catch (_) {}
    }
    requestAnimationFrame(loop);
  }

  $('menuButton').addEventListener('click', event => { event.stopPropagation(); menu(); });
  $('objectiveButton').addEventListener('click', event => { event.stopPropagation(); const node = event.currentTarget; node.setAttribute('aria-expanded', node.getAttribute('aria-expanded') !== 'true'); });
  $('jumpButton').addEventListener('click', event => { event.stopPropagation(); jump(); });
  $('cameraButton').addEventListener('click', event => { event.stopPropagation(); prefs.camera = prefs.camera === 'first' ? 'third' : 'first'; savePrefs(); applyPrefs(); say(prefs.camera === 'first' ? 'First-person view.' : 'Rear third-person view.'); });
  $('placeButton').addEventListener('click', event => { event.stopPropagation(); placeTarget(); });
  $('strikeButton').addEventListener('click', event => { event.stopPropagation(); attack(); });
  $('craftButton').addEventListener('click', event => { event.stopPropagation(); craftMenu(); });
  $('mineButton').addEventListener('pointerdown', beginMine); $('mineButton').addEventListener('pointerup', endMine); $('mineButton').addEventListener('pointercancel', endMine); $('mineButton').addEventListener('lostpointercapture', endMine);
  $('moveZone').addEventListener('pointerdown', moveStart); $('moveZone').addEventListener('pointermove', updateJoy); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => $('moveZone').addEventListener(type, event => { if (event.pointerId === input.joy.pointer) clearInputs(); }));
  $('lookZone').addEventListener('pointerdown', lookStart); $('lookZone').addEventListener('pointermove', lookMove); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => $('lookZone').addEventListener(type, event => { if (input.look && event.pointerId === input.look.pointer) input.look = null; }));
  canvas.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' && running) lookStart(event); }); canvas.addEventListener('pointermove', lookMove); canvas.addEventListener('pointerup', () => { input.look = null; });
  window.addEventListener('keydown', event => keyboard(event, true)); window.addEventListener('keyup', event => keyboard(event, false));
  $('importInput').addEventListener('change', event => { const file = event.target.files && event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { importSave(JSON.parse(String(reader.result))); } catch (_) { say('That file is not valid JSON. Your current journey is unchanged.'); } close(); }; reader.readAsText(file); event.target.value = ''; });
  window.addEventListener('resize', () => { clearInputs(); resize(); }); window.addEventListener('orientationchange', clearInputs); window.addEventListener('blur', clearInputs);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInputs(); durableSave(); } else lastTime = performance.now(); }); window.addEventListener('pagehide', durableSave);
  applyPrefs(); loadStage(); updateUI(); welcome(loaded.recovered); requestAnimationFrame(loop);
})();
