(function () {
  'use strict';
  const E = window.TowerDuelEngine;
  if (!E) throw new Error('Pennant Duel engine did not load');

  const SAVE_KEY = 'games:tower-duel:v1';
  const BACKUP_KEY = SAVE_KEY + ':backup';
  const PREFS_KEY = SAVE_KEY + ':prefs';
  const SAVE_FORMAT = 'tower-duel-save';
  const SAVE_VERSION = 1;
  const els = Object.fromEntries(['home','collection','draft','battle','continue-button','collection-button','settings-button','arena-list','card-library','deck-count','draft-step','draft-bar','draft-choices','draft-deck','arena-name','mode-name','battle-clock','pause-button','game-canvas','canvas-shell','tutorial-tip','toast','energy-track','energy-number','next-card','next-card-art','hand','modal','modal-kicker','modal-title','modal-body','modal-actions','import-file'].map((id) => [id, document.getElementById(id)]));
  if (!window.TowerDuelRenderer3D) throw new Error('Pennant Duel 3D renderer did not load');
  const renderer3d = new window.TowerDuelRenderer3D(els['game-canvas'], E);
  const ctx = null;
  let storageLoadKnown = true;
  let storageConflict = false;
  let profile = loadProfile();
  let prefs = loadPrefs();
  let match = profile.activeMatch ? safeRestore(profile.activeMatch) : null;
  let selectedCard = null;
  let paused = true;
  let lastFrame = performance.now();
  let saveDueAt = 0;
  let lastPersistedAt = performance.now();
  let toastTimer = 0;
  let draftState = null;
  let pointerDrag = null;
  let suppressCanvasPointerUntil = 0;
  let suppressHandClickUntil = 0;
  let dragPreview = null;
  let audioContext = null;
  let impactSeen = 0;
  els['energy-track'].innerHTML = Array.from({length:E.MAX_ENERGY},()=>'<i></i>').join('');

  function defaultProfile() {
    return {
      version: SAVE_VERSION,
      unlockedArena: 0,
      selectedArena: 0,
      unlockedCards: E.starterDeck.slice(),
      deck: E.starterDeck.slice(),
      wins: 0,
      losses: 0,
      bestArena: 0,
      tutorialDone: false,
      activeMatch: null,
      lastMode: 'classic'
    };
  }
  function defaultPrefs() { return { audio: true, reducedEffects: matchMedia('(prefers-reduced-motion: reduce)').matches }; }
  function isCardList(value, length) { return Array.isArray(value) && value.length === length && new Set(value).size === length && value.every((id) => !!E.cardMap[id]); }
  function validateProfile(value) {
    if (!value || typeof value !== 'object' || value.version !== SAVE_VERSION) return false;
    if (!Number.isInteger(value.unlockedArena) || value.unlockedArena < 0 || value.unlockedArena >= E.arenas.length) return false;
    if (!Number.isInteger(value.selectedArena) || value.selectedArena < 0 || value.selectedArena > value.unlockedArena) return false;
    if (!isCardList(value.deck, 8) || !Array.isArray(value.unlockedCards) || value.unlockedCards.some((id) => !E.cardMap[id])) return false;
    if (!value.deck.every((id) => value.unlockedCards.includes(id))) return false;
    if (![value.wins,value.losses,value.bestArena].every((n) => Number.isInteger(n) && n >= 0)) return false;
    if (typeof value.tutorialDone !== 'boolean' || !['classic','frenzy','draft'].includes(value.lastMode)) return false;
    if (value.activeMatch !== null && !E.validateSnapshot(value.activeMatch)) return false;
    return true;
  }
  function validatePrefs(value) { return value && typeof value.audio === 'boolean' && typeof value.reducedEffects === 'boolean'; }
  function safeParse(raw) { try { return JSON.parse(raw); } catch (_) { return null; } }
  function storageRead(key) {
    try { return { ok: true, value: localStorage.getItem(key) }; }
    catch (_) { return { ok: false, value: null }; }
  }
  function loadProfile() {
    const primaryRead = storageRead(SAVE_KEY);
    const backupRead = storageRead(BACKUP_KEY);
    const primary = safeParse(primaryRead.value);
    if (validateProfile(primary)) return primary;
    const backup = safeParse(backupRead.value);
    if (validateProfile(backup)) return backup;
    if (!primaryRead.ok || !backupRead.ok) storageLoadKnown = false;
    return defaultProfile();
  }
  function loadPrefs() {
    const read = storageRead(PREFS_KEY);
    const loaded = safeParse(read.value);
    return validatePrefs(loaded) ? loaded : defaultPrefs();
  }
  function safeRestore(value) { try { return E.restore(value); } catch (_) { return null; } }
  function durableWrite(key, value) {
    const previous = storageRead(key);
    if (!previous.ok) return false;
    const old = previous.value;
    try {
      const text = JSON.stringify(value);
      localStorage.setItem(key, text);
      if (localStorage.getItem(key) !== text) throw new Error('Storage verification failed');
      return true;
    } catch (_) {
      try { if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old); } catch (_) {}
      return false;
    }
  }
  function saveNow() {
    const next = JSON.parse(JSON.stringify(profile));
    next.activeMatch = match && match.phase === 'playing' ? E.snapshot(match) : null;
    if (storageConflict) return false;
    const currentRead = storageRead(SAVE_KEY), backupRead = storageRead(BACKUP_KEY);
    if (!currentRead.ok || !backupRead.ok) return false;
    const current = safeParse(currentRead.value);
    const backup = safeParse(backupRead.value);
    if (!storageLoadKnown) {
      storageLoadKnown = true;
      if (validateProfile(current) || validateProfile(backup)) {
        storageConflict = true;
        toast('Stored progress became available. Reload to use it; this unsaved session was not written.');
        return false;
      }
    }
    // Keep the last known-good primary as recovery data before replacing it.
    // The very first save seeds that backup with the new valid profile.
    if (validateProfile(current)) {
      if (!durableWrite(BACKUP_KEY, current)) return false;
    } else if (!validateProfile(backup) && !durableWrite(BACKUP_KEY, next)) return false;
    if (!durableWrite(SAVE_KEY, next)) return false;
    profile = next;
    lastPersistedAt = performance.now(); saveDueAt = 0;
    return true;
  }
  function savePrefs() { return durableWrite(PREFS_KEY, prefs); }
  function scheduleSave() { saveDueAt = performance.now() + 900; }

  function exportSave() { return { format: SAVE_FORMAT, version: SAVE_VERSION, payload: JSON.parse(JSON.stringify(Object.assign({}, profile, { activeMatch: match && match.phase === 'playing' ? E.snapshot(match) : null }))) }; }
  function importSave(value) {
    if (!value || value.format !== SAVE_FORMAT || value.version !== SAVE_VERSION || !validateProfile(value.payload)) return false;
    const candidate = JSON.parse(JSON.stringify(value.payload));
    const candidateMatch = candidate.activeMatch ? safeRestore(candidate.activeMatch) : null;
    if (candidate.activeMatch && !candidateMatch) return false;
    const oldProfile = profile, oldMatch = match, oldConflict = storageConflict;
    storageConflict = false;
    profile = candidate; match = candidateMatch;
    if (!saveNow()) { profile = oldProfile; match = oldMatch; storageConflict = oldConflict; return false; }
    selectedCard = null; paused = true; showHome();
    return true;
  }
  function getSummary() {
    return {
      screen: currentScreen(), arena: profile.selectedArena, unlockedArena: profile.unlockedArena,
      deck: profile.deck.slice(), wins: profile.wins, losses: profile.losses,
      activeMatch: match ? { mode: match.mode, phase: match.phase, result: match.result, time: Math.max(0,match.time), energy: match.energy.player, units: match.units.length, playerUnits: match.units.filter((unit)=>unit.side==='player').length, enemyUnits: match.units.filter((unit)=>unit.side==='enemy').length, hand: match.hands.player.slice(), battleDeck: match.decks.player.slice() } : null
    };
  }

  function currentScreen() { return ['home','collection','draft','battle'].find((name) => !els[name].classList.contains('hidden')) || 'home'; }
  function showScreen(name) { ['home','collection','draft','battle'].forEach((id) => els[id].classList.toggle('hidden', id !== name)); }
  function showHome() {
    paused = true; closeModal(); showScreen('home');
    const active = match && match.phase === 'playing';
    els['continue-button'].textContent = active ? 'Continue battle' : 'Start a duel';
    renderHomeModes();
  }
  function renderHomeModes() {
    document.querySelectorAll('[data-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === profile.lastMode)));
  }
  function showCollection() { renderCollection(); showScreen('collection'); }
  function cardPortrait(card) {
    const team='#61e5d2', dark='#17233d', light='#fff0c2', color=card.color;
    if (card.kind === 'spell') {
      const spell = card.id === 'comet'
        ? '<path d="M18 58 47 29" stroke="#fff0b0" stroke-width="12" stroke-linecap="round"/><path d="M12 53 39 26" stroke="#ff754f" stroke-width="7" stroke-linecap="round"/><circle cx="51" cy="23" r="15" fill="#ffcb55"/><path d="m43 15 17 16M59 15 43 31" stroke="#fff3b8" stroke-width="4"/>'
        : card.id === 'tailwind'
          ? '<path d="M10 28c18-16 28 10 45-2 11-8 16 1 13 8-4 10-19 8-29 8-15 0-18 10-7 16 10 6 23-2 29-9" fill="none" stroke="#d9fff4" stroke-width="7" stroke-linecap="round"/><path d="m55 47 8 2-5 7" fill="none" stroke="#fff0a8" stroke-width="4"/>'
          : '<path d="M40 13c9 10 13 16 12 25 12-3 20 4 18 13-3 14-23 16-33 8-12 9-29 2-28-10 1-10 11-15 20-12-2-10 3-17 11-24Z" fill="#e89ce8" stroke="#ffe0ff" stroke-width="4"/><circle cx="39" cy="45" r="9" fill="#704071"/>';
      return '<svg class="card-art" viewBox="0 0 80 72" aria-hidden="true"><rect width="80" height="72" rx="14" fill="#20385a"/><path d="M0 56 80 39v33H0Z" fill="#102442"/>'+spell+'</svg>';
    }
    const flying=['kitewing','boltfinch','cloudrays','ramblebee'].includes(card.id);
    const beast=['nibblers','emberox','ripplefox'].includes(card.id);
    const golem=['mossguard','ironroot'].includes(card.id);
    let figure='';
    if (flying) figure='<ellipse cx="40" cy="61" rx="23" ry="5" fill="#07142666"/><path d="M38 39C23 18 8 21 8 34c0 10 16 15 28 12M42 39c15-21 30-18 30-5 0 10-16 15-28 12" fill="'+color+'" stroke="'+light+'" stroke-width="3"/><ellipse cx="40" cy="39" rx="15" ry="19" fill="'+color+'" stroke="'+dark+'" stroke-width="4"/><circle cx="35" cy="34" r="3" fill="'+dark+'"/><circle cx="45" cy="34" r="3" fill="'+dark+'"/><path d="m36 44 4 4 5-5" fill="none" stroke="'+light+'" stroke-width="3"/>'+(card.id==='ramblebee'?'<path d="M28 35h24M28 43h24" stroke="#473622" stroke-width="5"/><path d="m29 23-6-7m28 7 6-7" stroke="#fff0a8" stroke-width="3"/>':'');
    else if (beast) figure='<ellipse cx="40" cy="63" rx="25" ry="5" fill="#07142666"/><path d="M20 48c0-16 11-26 27-24 13 1 20 10 19 25l-7 9H27Z" fill="'+color+'" stroke="'+dark+'" stroke-width="4"/><path d="M27 54v10m25-10v10" stroke="'+dark+'" stroke-width="7" stroke-linecap="round"/><path d="M24 29 15 20m39 5 10-9" stroke="'+light+'" stroke-width="6" stroke-linecap="round"/><circle cx="34" cy="35" r="3" fill="'+dark+'"/><circle cx="48" cy="35" r="3" fill="'+dark+'"/><path d="M60 43q15-2 11-14" fill="none" stroke="'+color+'" stroke-width="6" stroke-linecap="round"/>';
    else if (golem) figure='<ellipse cx="40" cy="65" rx="24" ry="5" fill="#07142666"/><path d="M25 28 32 15h17l8 13 9 8-5 25H20l-5-25Z" fill="'+color+'" stroke="'+dark+'" stroke-width="4"/><path d="M27 21h26v22H27Z" fill="'+(card.id==='ironroot'?'#88745c':'#406e51')+'"/><circle cx="34" cy="32" r="3" fill="'+team+'"/><circle cx="47" cy="32" r="3" fill="'+team+'"/><path d="M20 39 10 55m51-16 9 16M29 60l-3 7m26-7 3 7" stroke="'+dark+'" stroke-width="8" stroke-linecap="round"/>';
    else figure='<ellipse cx="40" cy="65" rx="22" ry="5" fill="#07142666"/><path d="M28 30c0-11 6-17 12-17s13 6 13 17v7H28Z" fill="'+color+'" stroke="'+dark+'" stroke-width="4"/><path d="M22 39c5-7 31-7 37 0l-4 24H26Z" fill="'+color+'" stroke="'+dark+'" stroke-width="4"/><circle cx="35" cy="30" r="3" fill="'+dark+'"/><circle cx="46" cy="30" r="3" fill="'+dark+'"/><path d="M24 44 13 58m43-14 11 14M32 61l-3 7m20-7 3 7" stroke="'+dark+'" stroke-width="7" stroke-linecap="round"/>'+(card.id==='sunshot'||card.id==='twinbow'?'<path d="M11 55q10-12 20 0M49 55q10-12 20 0" fill="none" stroke="'+light+'" stroke-width="3"/>':'<path d="M12 56h18v-18H12Z" fill="#47658b" stroke="'+light+'" stroke-width="3"/>');
    return '<svg class="card-art" viewBox="0 0 80 72" aria-hidden="true"><rect width="80" height="72" rx="14" fill="#294566"/><circle cx="64" cy="12" r="20" fill="'+color+'" opacity=".2"/><path d="M0 56 80 39v33H0Z" fill="#102442"/>'+figure+'</svg>';
  }
  function renderCollection() {
    els['arena-list'].innerHTML = E.arenas.map((arena,index) => {
      const unlocked = index <= profile.unlockedArena, current = index === profile.selectedArena;
      return '<div class="arena-row ' + (current?'current ':'') + (!unlocked?'locked':'') + '"><span class="arena-medal">' + (unlocked ? index+1 : '—') + '</span><div><b>' + arena.name + '</b><small>' + (unlocked?arena.blurb:'Win the previous arena to unlock.') + '</small></div>' + (unlocked ? '<button data-arena="'+index+'" type="button">'+(current?'Chosen':'Choose')+'</button>' : '') + '</div>';
    }).join('');
    els['deck-count'].textContent = profile.deck.length + ' / 8';
    els['card-library'].innerHTML = E.cards.map((card) => {
      const unlocked = profile.unlockedCards.includes(card.id), selected = profile.deck.includes(card.id);
      return '<button type="button" data-card-library="'+card.id+'" class="library-card '+(selected?'selected ':'')+(!unlocked?'locked':'')+'" '+(!unlocked?'disabled':'')+'>'+cardPortrait(card)+'<span class="card-cost">'+card.cost+'</span><b>'+card.name+'</b><small>'+card.desc+'</small></button>';
    }).join('');
  }

  function startMode(mode) {
    if (match && match.phase === 'playing') {
      showConfirm('Abandon current battle?', 'Starting another duel replaces the saved battle.', 'Start new duel', () => actuallyStartMode(mode));
      return;
    }
    actuallyStartMode(mode);
  }
  function actuallyStartMode(mode) {
    closeModal();
    profile.lastMode = mode;
    if (mode === 'draft') return beginDraft();
    launchMatch(mode, profile.deck);
  }
  function launchMatch(mode, deck) {
    const seed = ((Date.now() & 0xffffffff) ^ ((profile.wins+1)*2654435761)) >>> 0;
    match = E.createMatch({ mode, arena: profile.selectedArena, deck, seed });
    profile.activeMatch = E.snapshot(match); selectedCard = null; paused = false; impactSeen = 0;
    saveNow(); showScreen('battle'); setupBattleHeader(); renderHand(true); lastFrame = performance.now();
    if (!profile.tutorialDone) showTutorial('Pick a card below, then tap or drag it onto your half of the arena.');
    els['game-canvas'].focus({ preventScroll: true });
    chirp(420,.08,'triangle');
  }
  function resumeMatch() {
    if (!match || match.phase !== 'playing') return launchMatch(profile.lastMode === 'draft' ? 'classic' : profile.lastMode, profile.deck);
    paused = false; showScreen('battle'); setupBattleHeader(); renderHand(true); lastFrame = performance.now();
  }
  function setupBattleHeader() { els['arena-name'].textContent = E.arenas[match.arena].name; els['mode-name'].textContent = match.mode === 'frenzy' ? 'Frenzy · double spark' : match.mode === 'draft' ? 'Draft Challenge' : 'Classic'; }

  function beginDraft() {
    const seedState = E.createMatch({ seed: (Date.now()&0xffffffff)>>>0 });
    const pool = E.cards.slice();
    for (let i=pool.length-1;i>0;i--) { seedState.rng ^= seedState.rng << 13; seedState.rng ^= seedState.rng >>> 17; seedState.rng ^= seedState.rng << 5; const j=(seedState.rng>>>0)%(i+1); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    draftState = { picks: [], pool, round: 0 };
    showScreen('draft'); renderDraft();
  }
  function renderDraft() {
    const round = draftState.round;
    els['draft-step'].textContent = 'Pick ' + (round+1) + ' of 8'; els['draft-bar'].style.width = (round/8*100)+'%';
    const choices = draftState.pool.slice(round*2,round*2+2);
    els['draft-choices'].innerHTML = choices.map((card) => '<button type="button" class="draft-card" data-draft-card="'+card.id+'">'+cardPortrait(card)+'<span class="card-cost">'+card.cost+'</span><b>'+card.name+'</b><small>'+card.desc+'</small></button>').join('');
    els['draft-deck'].innerHTML = Array.from({length:8},(_,i) => draftState.picks[i] ? '<span style="background:'+E.cardMap[draftState.picks[i]].color+'" title="'+E.cardMap[draftState.picks[i]].name+'"></span>' : '<span></span>').join('');
  }
  function draftPick(cardId) {
    if (!draftState || !draftState.pool.slice(draftState.round*2,draftState.round*2+2).some((c)=>c.id===cardId)) return;
    draftState.picks.push(cardId); draftState.round++;
    chirp(520+draftState.round*35,.06,'sine');
    if (draftState.round >= 8) { const deck=draftState.picks.slice(); draftState=null; launchMatch('draft',deck); }
    else renderDraft();
  }

  function renderHand(force) {
    if (!match) return;
    const signature = match.hands.player.join('|');
    if (els.hand.dataset.signature !== signature) {
      els.hand.dataset.signature = signature;
      els.hand.innerHTML = match.hands.player.map((id,index) => { const card=E.cardMap[id]; return '<button type="button" class="hand-card" data-hand-card="'+id+'" aria-label="'+(index+1)+': '+card.name+', cost '+card.cost+', '+card.desc+'">'+cardPortrait(card)+'<span class="card-cost">'+card.cost+'</span><b>'+card.name+'</b></button>'; }).join('');
    }
    els.hand.querySelectorAll('[data-hand-card]').forEach((node) => {
      const id=node.dataset.handCard, affordable=match.energy.player+1e-6>=E.cardMap[id].cost;
      node.classList.toggle('selected',selectedCard===id);
      node.classList.toggle('unaffordable',!affordable);
      node.setAttribute('aria-pressed',String(selectedCard===id));
      node.setAttribute('aria-disabled',String(!affordable));
    });
    const nextId=match.queues.player[0];
    if (els['next-card'].dataset.card !== nextId) { els['next-card'].dataset.card=nextId; els['next-card-art'].innerHTML=cardPortrait(E.cardMap[nextId]); els['next-card'].setAttribute('aria-label','Next card: '+E.cardMap[nextId].name); }
  }
  function selectCard(id) { if (!match || !match.hands.player.includes(id)) return; selectedCard = selectedCard === id ? null : id; renderHand(true); if (selectedCard && !profile.tutorialDone) showTutorial(E.cardMap[id].kind === 'spell' ? 'Spells can land anywhere. Tap a useful target area.' : 'Now tap your blue half. Units enter through the nearest lane.'); }
  function canvasPoint(clientX, clientY) { return renderer3d.screenToWorld(clientX,clientY); }
  function previewAt(clientX,clientY,id){const rect=els['game-canvas'].getBoundingClientRect(),inside=clientX>=rect.left&&clientX<=rect.right&&clientY>=rect.top&&clientY<=rect.bottom;dragPreview={id,inside,world:canvasPoint(clientX,clientY)};}
  function cancelDrag(pointerId){if(pointerDrag&&(pointerId==null||pointerDrag.pointerId===pointerId)){pointerDrag=null;dragPreview=null;renderHand(false);}}
  function deployAt(point) {
    if (!selectedCard || !match || paused) { if (!selectedCard) toast('Choose a card first'); return; }
    const result=E.playCard(match,'player',selectedCard,point.x,point.y);
    if (!result.ok) { toast(result.reason); chirp(150,.08,'square'); return; }
    selectedCard=null; renderHand(true); scheduleSave(); chirp(340,.06,'triangle');
    if (!profile.tutorialDone) { profile.tutorialDone=true; hideTutorial(); scheduleSave(); }
  }

  function frame(now) {
    const elapsed=Math.min(.25,(now-lastFrame)/1000); lastFrame=now;
    if (match && currentScreen()==='battle') {
      if (!paused && !document.hidden && match.phase==='playing') E.tick(match,elapsed);
      updateBattleUI(); draw();
      if (match.phase==='ended' && !paused) finishMatch();
      if (saveDueAt && now >= saveDueAt) { saveDueAt=0; lastPersistedAt=now; saveNow(); }
      else if (!saveDueAt && now-lastPersistedAt >= 5000) { lastPersistedAt=now; saveNow(); }
    }
    requestAnimationFrame(frame);
  }
  function updateBattleUI() {
    const seconds=Math.max(0,Math.ceil(match.time)); els['battle-clock'].textContent=(match.overtime?'OT ':'')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const energy=match.energy.player; els['energy-number'].textContent=Math.floor(energy); els['energy-track'].setAttribute('aria-label','Energy: '+energy.toFixed(1)+' of '+E.MAX_ENERGY);
    Array.from(els['energy-track'].children).forEach((segment,index)=>{segment.classList.toggle('full',energy>=index+1);segment.classList.toggle('partial',energy>index&&energy<index+1);segment.style.setProperty('--fill',Math.max(0,Math.min(1,energy-index))*100+'%');});
    renderHand(false);
    const impacts=match.events.filter((event)=>event.type==='towerDown').length;
    if (impacts>impactSeen) { impactSeen=impacts; chirp(95,.16,'sawtooth'); }
  }
  function finishMatch() {
    paused=true; profile.activeMatch=null;
    const result=match.result;
    if (result==='win') {
      profile.wins++;
      if (match.arena===profile.unlockedArena) {
        const unlock=E.arenas[match.arena].unlock;
        if (unlock && !profile.unlockedCards.includes(unlock)) profile.unlockedCards.push(unlock);
        if (profile.unlockedArena<E.arenas.length-1) profile.unlockedArena++;
        profile.bestArena=Math.max(profile.bestArena,profile.unlockedArena);
      }
      chirp(620,.15,'triangle'); setTimeout(()=>chirp(820,.2,'triangle'),120);
    } else if (result==='loss') { profile.losses++; chirp(180,.25,'sine'); }
    saveNow();
    const title=result==='win'?'Beacon toppled!':result==='loss'?'Good fight!':'Perfect tie!';
    const copy=result==='win'?'Your lane choices broke through.':result==='loss'?'The rival held this one. Adjust your deck or answer its strongest lane.':'Neither beacon gave in—even through overtime.';
    showModal(result==='win'?'VICTORY':result==='loss'?'DEFEAT':'DRAW',title,'<p>'+copy+'</p><p><b>'+Math.round(match.stats.playerDamage)+' damage</b> · '+match.stats.playerPlayed+' cards played</p>',[
      {label:'Replay',primary:true,action:()=>{const mode=match.mode,deck=match.decks.player.slice();closeModal();launchMatch(mode,deck);}},
      {label:'Deck & arenas',action:()=>{match=null;closeModal();showCollection();}},
      {label:'Main menu',action:()=>{match=null;closeModal();showHome();}}
    ]);
  }

  function draw() {
    const canvas=els['game-canvas']; const shell=els['canvas-shell'].getBoundingClientRect(); const portrait=shell.height>shell.width;
    const scale=portrait?0:Math.min(shell.width/E.WIDTH,shell.height/E.HEIGHT);
    const cssWidth=Math.max(1,Math.floor(portrait?shell.width:E.WIDTH*scale)),cssHeight=Math.max(1,Math.floor(portrait?shell.height:E.HEIGHT*scale));
    if(canvas.style.width!==cssWidth+'px'||canvas.style.height!==cssHeight+'px'){canvas.style.width=cssWidth+'px';canvas.style.height=cssHeight+'px';}
    renderer3d.render(match,{selectedCard,dragPreview,reducedEffects:prefs.reducedEffects});
  }
  function displayArea(width,height){return Math.max(1,width*height);}
  function drawArena() {
    const sky=ctx.createLinearGradient(0,0,0,E.HEIGHT);sky.addColorStop(0,'#6d6a82');sky.addColorStop(.49,'#47766b');sky.addColorStop(.51,'#39796f');sky.addColorStop(1,'#236473');ctx.fillStyle=sky;ctx.fillRect(0,0,E.WIDTH,E.HEIGHT);
    ctx.fillStyle='#24394b55';for(let y=70;y<E.HEIGHT;y+=92)for(let x=((y/92)&1)*50;x<E.WIDTH;x+=100){ctx.beginPath();ctx.arc(x,y,4+(x+y)%7,0,Math.PI*2);ctx.fill();}
    for(const lane of E.LANES){const path=ctx.createLinearGradient(lane-118,0,lane+118,0);path.addColorStop(0,'#9aa28122');path.addColorStop(.5,'#d3c9953f');path.addColorStop(1,'#9aa28122');ctx.fillStyle=path;ctx.beginPath();ctx.roundRect(lane-105,0,210,E.HEIGHT,44);ctx.fill();ctx.strokeStyle='#e8dfad24';ctx.lineWidth=4;ctx.setLineDash([20,24]);ctx.beginPath();ctx.moveTo(lane,0);ctx.lineTo(lane,E.HEIGHT);ctx.stroke();ctx.setLineDash([]);}
    const water=ctx.createLinearGradient(0,E.RIVER_TOP,0,E.RIVER_BOTTOM);water.addColorStop(0,'#163a67');water.addColorStop(.5,'#247ba0');water.addColorStop(1,'#102f5d');ctx.fillStyle=water;ctx.fillRect(0,E.RIVER_TOP,E.WIDTH,E.RIVER_BOTTOM-E.RIVER_TOP);
    ctx.strokeStyle='#6ee5e9aa';ctx.lineWidth=5;for(let y=E.RIVER_TOP+20;y<E.RIVER_BOTTOM;y+=28){ctx.beginPath();for(let x=0;x<=E.WIDTH;x+=40)ctx.lineTo(x,y+Math.sin(x*.025+match.time)*5);ctx.stroke();}
    E.LANES.forEach((x)=>drawBridge(x));
    ctx.fillStyle='#101b31aa';ctx.fillRect(0,0,E.WIDTH,12);ctx.fillRect(0,E.HEIGHT-12,E.WIDTH,12);
  }
  function drawBridge(x){ctx.save();ctx.shadowColor='#07172c99';ctx.shadowBlur=18;ctx.shadowOffsetY=10;ctx.fillStyle='#6b4934';ctx.fillRect(x-82,E.RIVER_TOP-14,164,E.RIVER_BOTTOM-E.RIVER_TOP+28);ctx.shadowColor='transparent';for(let y=E.RIVER_TOP-10;y<E.RIVER_BOTTOM+12;y+=24){const g=ctx.createLinearGradient(x-76,y,x+76,y);g.addColorStop(0,'#a66f40');g.addColorStop(.5,'#e2b56d');g.addColorStop(1,'#8d5b36');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(x-76,y,152,19,4);ctx.fill();ctx.strokeStyle='#593b2c';ctx.lineWidth=3;ctx.stroke();}ctx.fillStyle='#dbc07b';ctx.fillRect(x-88,E.RIVER_TOP-13,9,E.RIVER_BOTTOM-E.RIVER_TOP+26);ctx.fillRect(x+79,E.RIVER_TOP-13,9,E.RIVER_BOTTOM-E.RIVER_TOP+26);ctx.restore();}
  function drawPlacement(){if(!selectedCard&&!dragPreview)return;const id=dragPreview?dragPreview.id:selectedCard,card=E.cardMap[id];ctx.fillStyle=card.kind==='spell'?'#ffd46d14':'#64e4d31c';ctx.fillRect(0,card.kind==='spell'?0:E.RIVER_BOTTOM,E.WIDTH,card.kind==='spell'?E.HEIGHT:E.HEIGHT-E.RIVER_BOTTOM);ctx.strokeStyle=card.color;ctx.lineWidth=5;ctx.setLineDash([18,13]);ctx.strokeRect(7,(card.kind==='spell'?7:E.RIVER_BOTTOM+7),E.WIDTH-14,(card.kind==='spell'?E.HEIGHT-14:E.HEIGHT-E.RIVER_BOTTOM-14));ctx.setLineDash([]);if(dragPreview&&dragPreview.inside){const legal=E.legalPlacement(match,'player',card,dragPreview.world.x,dragPreview.world.y);ctx.fillStyle=legal.ok?'#64e4d326':'#ff6f672e';ctx.beginPath();ctx.arc(dragPreview.world.x,dragPreview.world.y,card.kind==='spell'?card.radius:Math.max(48,card.size*1.8),0,Math.PI*2);ctx.fill();ctx.strokeStyle=legal.ok?'#b8fff2':'#ff9b91';ctx.lineWidth=6;ctx.stroke();}}
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function hpBar(item,width,yOffset){if(!item.alive)return;ctx.fillStyle='#071326cc';roundedRect(item.x-width/2,item.y-yOffset,width,11,6);ctx.fill();ctx.fillStyle=item.side==='player'?'#66ead7':'#ff746e';roundedRect(item.x-width/2+2,item.y-yOffset+2,(width-4)*Math.max(0,item.hp/item.maxHp),7,4);ctx.fill();}
  function drawTower(t){
    ctx.save();ctx.translate(t.x,t.y+(t.recoil||0)*18);
    if(!t.alive){ctx.fillStyle='#11192b77';ctx.beginPath();ctx.ellipse(0,22,t.radius*1.25,t.radius*.48,0,0,Math.PI*2);ctx.fill();for(let i=0;i<7;i++){ctx.fillStyle=i%2?'#5a5360':'#8b755f';ctx.save();ctx.translate((i%4-1.5)*24,(i%3-1)*13);ctx.rotate(i*.7);ctx.fillRect(-15,-10,30,20);ctx.restore();}ctx.restore();return;}
    const team=t.side==='player'?'#35b9c9':'#d34f68',trim=t.side==='player'?'#bffcff':'#ffd0ca',w=t.type==='base'?t.radius*2.25:t.radius*2,h=t.type==='base'?t.radius*1.7:t.radius*1.55;
    ctx.fillStyle='#06132466';ctx.beginPath();ctx.ellipse(7,34,t.radius*1.35,t.radius*.56,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=t.hit>0?'#fff':team;ctx.strokeStyle='#f5dfae';ctx.lineWidth=6;roundedRect(-w/2,-h/2,w,h,12);ctx.fill();ctx.stroke();
    ctx.fillStyle='#25354d';roundedRect(-w*.22,h*.05,w*.44,h*.48,8);ctx.fill();ctx.fillStyle=trim;for(const bx of [-w*.42,-w*.14,w*.14])ctx.fillRect(bx,-h*.72,w*.25,h*.25);
    ctx.fillStyle='#17243b';ctx.beginPath();ctx.arc(0,-h*.18,t.type==='base'?20:15,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(0,-h*.18);ctx.rotate((t.heading||-Math.PI/2)+Math.PI/2);ctx.strokeStyle=trim;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-h*.54+(t.recoil||0)*28);ctx.stroke();ctx.restore();
    if(t.hp/t.maxHp<.62){ctx.strokeStyle='#612d3e';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-w*.35,-h*.2);ctx.lineTo(-w*.2,-h*.05);ctx.lineTo(-w*.3,h*.16);ctx.moveTo(w*.3,-h*.35);ctx.lineTo(w*.18,-h*.18);ctx.lineTo(w*.32,-h*.02);ctx.stroke();}
    ctx.fillStyle='#ffe06d';ctx.beginPath();ctx.moveTo(-20,-h*.78);ctx.lineTo(-9,-h*1.05);ctx.lineTo(0,-h*.8);ctx.lineTo(11,-h*1.06);ctx.lineTo(22,-h*.78);ctx.closePath();ctx.fill();ctx.restore();hpBar(t,t.type==='base'?155:122,t.radius+50);
  }
  function limb(x1,y1,x2,y2,width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function drawUnitModel(card,side,u,alpha){const r=card.size*1.28,team=side==='player'?'#9dfff0':'#ffb0a9',dark='#17223a',bob=Math.sin((u.walk||0))*3,attack=(u.attackAnim||0)>0?8:0;ctx.globalAlpha=alpha==null?1:alpha;ctx.fillStyle='#06132655';ctx.beginPath();ctx.ellipse(5,r*.65,r*1.05,r*.4,0,0,Math.PI*2);ctx.fill();ctx.translate(0,bob-(u.flying?12+Math.sin(match.time*4+u.id.length)*5:0));const flying=['kitewing','boltfinch','cloudrays','ramblebee'].includes(card.id),beast=['nibblers','emberox','ripplefox'].includes(card.id),golem=['mossguard','ironroot'].includes(card.id);if(flying){ctx.fillStyle=card.color;ctx.strokeStyle=team;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-r*.12,0);ctx.quadraticCurveTo(-r*1.5,-r*1.2,-r*1.65,-.1*r);ctx.quadraticCurveTo(-r*.8,r*.55,0,r*.35);ctx.quadraticCurveTo(r*.8,r*.55,r*1.65,-.1*r);ctx.quadraticCurveTo(r*1.5,-r*1.2,r*.12,0);ctx.fill();ctx.stroke();ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(0,0,r*.55,r*.75,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=card.color;ctx.beginPath();ctx.ellipse(0,-r*.12,r*.44,r*.56,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=team;ctx.beginPath();ctx.arc(-r*.15,-r*.24,3.5,0,Math.PI*2);ctx.arc(r*.15,-r*.24,3.5,0,Math.PI*2);ctx.fill();if(card.id==='ramblebee'){ctx.strokeStyle='#46351f';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-r*.42,0);ctx.lineTo(r*.42,0);ctx.moveTo(-r*.38,r*.24);ctx.lineTo(r*.38,r*.24);ctx.stroke();}}
    else if(beast){limb(-r*.42,r*.25,-r*.55,r*.82,9,dark);limb(r*.38,r*.25,r*.5,r*.82,9,dark);ctx.fillStyle=card.color;ctx.strokeStyle=team;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,r*.9,r*.68,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(0,-r*.35,r*.53,r*.43,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=card.color;ctx.beginPath();ctx.ellipse(0,-r*.42,r*.42,r*.34,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff4cc';ctx.beginPath();ctx.arc(-r*.16,-r*.47,3.5,0,Math.PI*2);ctx.arc(r*.16,-r*.47,3.5,0,Math.PI*2);ctx.fill();if(card.id==='emberox'){limb(-r*.28,-r*.62,-r*.7,-r*.94,7,'#ffe2a0');limb(r*.28,-r*.62,r*.7,-r*.94,7,'#ffe2a0');}if(card.id==='ripplefox'){ctx.strokeStyle=card.color;ctx.lineWidth=13;ctx.beginPath();ctx.arc(r*.75,r*.15,r*.65,-1.3,1.8);ctx.stroke();}}
    else if(golem){limb(-r*.52,.1,-r*.72,r*.72,12,dark);limb(r*.52,.1,r*.72,r*.72,12,dark);limb(-r*.25,r*.48,-r*.35,r*.95,13,dark);limb(r*.25,r*.48,r*.35,r*.95,13,dark);ctx.fillStyle=card.color;ctx.strokeStyle=team;ctx.lineWidth=5;roundedRect(-r*.7,-r*.55,r*1.4,r*1.3,r*.22);ctx.fill();ctx.stroke();ctx.fillStyle=card.id==='ironroot'?'#665743':'#365d45';roundedRect(-r*.42,-r*.72,r*.84,r*.62,r*.15);ctx.fill();ctx.fillStyle=team;ctx.fillRect(-r*.25,-r*.46,r*.15,6);ctx.fillRect(r*.1,-r*.46,r*.15,6);}
    else{const stride=Math.sin(u.walk||0)*r*.18;limb(-r*.25,r*.25,-r*.32+stride,r*.9,10,dark);limb(r*.25,r*.25,r*.32-stride,r*.9,10,dark);limb(-r*.48,-.05,-r*.7,r*.42,9,dark);limb(r*.48,-.05,r*.72+attack,r*.3-attack,9,dark);ctx.fillStyle=card.color;ctx.strokeStyle=team;ctx.lineWidth=4;roundedRect(-r*.55,-r*.35,r*1.1,r*.95,r*.24);ctx.fill();ctx.stroke();ctx.fillStyle=dark;ctx.beginPath();ctx.arc(0,-r*.54,r*.48,0,Math.PI*2);ctx.fill();ctx.fillStyle=card.color;ctx.beginPath();ctx.arc(0,-r*.58,r*.38,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff3c6';ctx.beginPath();ctx.arc(-r*.14,-r*.62,3.5,0,Math.PI*2);ctx.arc(r*.14,-r*.62,3.5,0,Math.PI*2);ctx.fill();if(card.id==='sunshot'||card.id==='twinbow'){ctx.strokeStyle='#ffe9ad';ctx.lineWidth=4;ctx.beginPath();ctx.arc(r*.78,r*.1,r*.35,1.8,4.5);ctx.stroke();}else{ctx.fillStyle='#496786';ctx.strokeStyle='#e7f7ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(-r*.74,r*.12,r*.35,0,Math.PI*2);ctx.fill();ctx.stroke();}}
    if(u.hit>0){ctx.globalAlpha=Math.min(1,u.hit*5);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,r*.75,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function drawUnit(u){const card=E.cardMap[u.cardId];ctx.save();ctx.translate(u.x,u.y);ctx.rotate((u.heading||-Math.PI/2)+Math.PI/2);drawUnitModel(card,u.side,u,u.deploy>0?.62:1);ctx.restore();if(u.deploy>0){ctx.strokeStyle=u.side==='player'?'#9dfff0':'#ffb0a9';ctx.lineWidth=5;ctx.beginPath();ctx.arc(u.x,u.y,u.radius*1.8,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-u.deploy/.58));ctx.stroke();}if(u.slow>0){ctx.strokeStyle='#f2a4f2';ctx.lineWidth=5;ctx.beginPath();ctx.arc(u.x,u.y,u.radius+12,0,Math.PI*2);ctx.stroke();}hpBar(u,u.radius*2.6,u.radius+27);}
  function drawProjectile(p){ctx.save();ctx.strokeStyle=p.color;ctx.lineWidth=p.splash?8:5;ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(p.x,p.y+18);ctx.lineTo(p.x,p.y-18);ctx.stroke();ctx.globalAlpha=1;ctx.fillStyle='#fff6cf';ctx.shadowColor=p.color;ctx.shadowBlur=prefs.reducedEffects?0:22;ctx.beginPath();ctx.arc(p.x,p.y,p.splash?11:8,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawEffect(effect){ctx.save();const life=Math.max(0,effect.life/effect.maxLife);ctx.globalAlpha=life;if(effect.kind==='rubble'){ctx.fillStyle=effect.color;for(let i=0;i<9;i++){const a=i*2.39,d=(1-life)*effect.radius*1.8;ctx.save();ctx.translate(effect.x+Math.cos(a)*d,effect.y+Math.sin(a)*d);ctx.rotate(a);ctx.fillRect(-10,-8,20,16);ctx.restore();}}else if(effect.kind==='defeat'){ctx.fillStyle=effect.color;for(let i=0;i<7;i++){const a=i*.9;ctx.beginPath();ctx.arc(effect.x+Math.cos(a)*(1-life)*45,effect.y+Math.sin(a)*(1-life)*45,5+life*5,0,Math.PI*2);ctx.fill();}}else{ctx.strokeStyle=effect.color;ctx.lineWidth=18*(1-life)+4;ctx.beginPath();ctx.arc(effect.x,effect.y,effect.radius*(1-life*.4),0,Math.PI*2);ctx.stroke();}ctx.restore();}
  function drawDragGhost(){const card=E.cardMap[dragPreview.id],p=dragPreview.world;ctx.save();ctx.translate(p.x,p.y-(card.kind==='unit'?70:0));if(card.kind==='unit')drawUnitModel(card,'player',{walk:match.time*5,flying:card.flying,id:'ghost'},.78);else{ctx.strokeStyle=card.color;ctx.lineWidth=12;ctx.beginPath();ctx.arc(0,0,card.radius*.55,0,Math.PI*2);ctx.stroke();}ctx.restore();}

  function pauseBattle() { if (!match || match.phase!=='playing') return; paused=true; saveNow(); showModal('PAUSED','Take a breather','<p>Your match is saved on this browser. Leaving safely keeps this exact battle.</p>',[
    {label:'Resume',primary:true,action:()=>{closeModal();paused=false;lastFrame=performance.now();}},
    {label:'Settings',action:showSettings},
    {label:'Main menu',action:()=>{closeModal();showHome();}}
  ]); }
  function showSettings() {
    const wasBattle=currentScreen()==='battle';
    showModal('SETTINGS','Sound & save','<div class="settings-grid"><label>Sound effects <input id="audio-setting" type="checkbox" '+(prefs.audio?'checked':'')+'></label><label>Reduced effects <input id="effects-setting" type="checkbox" '+(prefs.reducedEffects?'checked':'')+'></label><button id="export-setting" type="button">Export save file</button><button id="import-setting" type="button">Import save file</button></div><p>Progress is local to this browser or Home Screen app. Export a backup before switching between them.</p>',[
      {label:wasBattle?'Back to pause':'Done',primary:true,action:()=>{prefs.audio=document.getElementById('audio-setting').checked;prefs.reducedEffects=document.getElementById('effects-setting').checked;savePrefs();closeModal();if(wasBattle)pauseBattle();}}
    ]);
    document.getElementById('export-setting').onclick=downloadSave;
    document.getElementById('import-setting').onclick=()=>els['import-file'].click();
  }
  function downloadSave(){const blob=new Blob([JSON.stringify(exportSave(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='pennant-duel-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function showConfirm(title,body,confirm,action){showModal('CONFIRM',title,'<p>'+body+'</p>',[{label:confirm,primary:true,action},{label:'Keep current battle',action:closeModal}]);}
  function showModal(kicker,title,body,actions){els['modal-kicker'].textContent=kicker;els['modal-title'].textContent=title;els['modal-body'].innerHTML=body;els['modal-actions'].innerHTML='';actions.forEach((item)=>{const button=document.createElement('button');button.type='button';button.textContent=item.label;if(item.primary)button.className='primary';button.onclick=item.action;els['modal-actions'].append(button);});els.modal.classList.remove('hidden');setTimeout(()=>els['modal-actions'].querySelector('button')?.focus(),0);}
  function closeModal(){els.modal.classList.add('hidden');}
  function toast(message){els.toast.textContent=message;els.toast.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.classList.add('hidden'),1500);}
  function showTutorial(message){els['tutorial-tip'].textContent=message;els['tutorial-tip'].classList.remove('hidden');}
  function hideTutorial(){els['tutorial-tip'].classList.add('hidden');}
  function chirp(frequency,duration,type){if(!prefs.audio)return;try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.frequency.value=frequency;oscillator.type=type||'sine';gain.gain.setValueAtTime(.055,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);oscillator.connect(gain).connect(audioContext.destination);oscillator.start();oscillator.stop(audioContext.currentTime+duration);}catch(_){}}

  els['continue-button'].addEventListener('click',()=>match&&match.phase==='playing'?resumeMatch():startMode(profile.lastMode));
  els['collection-button'].addEventListener('click',showCollection);
  els['settings-button'].addEventListener('click',showSettings);
  document.querySelectorAll('[data-mode]').forEach((button)=>button.addEventListener('click',()=>startMode(button.dataset.mode)));
  document.querySelectorAll('[data-back]').forEach((button)=>button.addEventListener('click',showHome));
  els['arena-list'].addEventListener('click',(event)=>{const button=event.target.closest('[data-arena]');if(!button)return;profile.selectedArena=Number(button.dataset.arena);saveNow();renderCollection();});
  els['card-library'].addEventListener('click',(event)=>{const button=event.target.closest('[data-card-library]');if(!button)return;const id=button.dataset.cardLibrary,index=profile.deck.indexOf(id);if(index>=0){if(profile.deck.length<=8){toast('Choose a replacement: deck must stay at eight');return;}profile.deck.splice(index,1);}else if(profile.deck.length<8)profile.deck.push(id);else{profile.deck.shift();profile.deck.push(id);toast('Replaced the oldest deck card');}saveNow();renderCollection();});
  els['draft-choices'].addEventListener('click',(event)=>{const card=event.target.closest('[data-draft-card]');if(card)draftPick(card.dataset.draftCard);});
  els.hand.addEventListener('click',(event)=>{const card=event.target.closest('[data-hand-card]');if(card&&!pointerDrag&&performance.now()>=suppressHandClickUntil)selectCard(card.dataset.handCard);});
  els.hand.addEventListener('pointerdown',(event)=>{const card=event.target.closest('[data-hand-card]');if(!card||event.button!==0||pointerDrag)return;pointerDrag={id:card.dataset.handCard,x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId,node:card};try{card.setPointerCapture?.(event.pointerId);}catch(_){/* Synthetic and interrupted pointers may have no active capture. */}});
  document.addEventListener('pointermove',(event)=>{if(!pointerDrag||event.pointerId!==pointerDrag.pointerId)return;if(Math.hypot(event.clientX-pointerDrag.x,event.clientY-pointerDrag.y)>8){pointerDrag.moved=true;previewAt(event.clientX,event.clientY,pointerDrag.id);}});
  document.addEventListener('pointerup',(event)=>{if(!pointerDrag||event.pointerId!==pointerDrag.pointerId)return;const drag=pointerDrag,wasMoved=drag.moved;pointerDrag=null;dragPreview=null;if(wasMoved){suppressHandClickUntil=performance.now()+160;const rect=els['game-canvas'].getBoundingClientRect();if(event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom){selectedCard=drag.id;renderHand(false);suppressCanvasPointerUntil=performance.now()+120;deployAt(canvasPoint(event.clientX,event.clientY));}else{selectedCard=null;renderHand(false);}}});
  document.addEventListener('pointercancel',(event)=>cancelDrag(event.pointerId));
  els.hand.addEventListener('lostpointercapture',(event)=>{if(pointerDrag&&pointerDrag.pointerId===event.pointerId&&event.buttons===0)cancelDrag(event.pointerId);});
  els.hand.addEventListener('pointerleave',(event)=>{if(pointerDrag&&event.buttons===0)cancelDrag(event.pointerId);});
  els['game-canvas'].addEventListener('pointerdown',(event)=>{if(event.button===0&&performance.now()>=suppressCanvasPointerUntil)deployAt(canvasPoint(event.clientX,event.clientY));});
  els['pause-button'].addEventListener('click',pauseBattle);
  els['import-file'].addEventListener('change',async()=>{const file=els['import-file'].files[0];if(!file)return;try{const value=JSON.parse(await file.text());if(!importSave(value))throw new Error('invalid');showModal('IMPORTED','Save restored','<p>Your validated Pennant Duel progress is ready.</p>',[{label:'Continue',primary:true,action:closeModal}]);}catch(_){showModal('IMPORT STOPPED','That save is not valid','<p>Nothing was changed. Choose an unedited Pennant Duel export file.</p>',[{label:'Okay',primary:true,action:closeModal}]);}finally{els['import-file'].value='';}});
  document.addEventListener('keydown',(event)=>{if(currentScreen()!=='battle'||els.modal.classList.contains('hidden')===false)return;if(['1','2','3','4'].includes(event.key)){selectCard(match.hands.player[Number(event.key)-1]);event.preventDefault();}else if(event.key===' '||event.key==='Escape'){pauseBattle();event.preventDefault();}});
  document.addEventListener('visibilitychange',()=>{cancelDrag();if(document.hidden&&match&&match.phase==='playing'){paused=true;saveNow();}else{lastFrame=performance.now();if(match&&match.phase==='playing'&&currentScreen()==='battle'&&els.modal.classList.contains('hidden'))pauseBattle();}});
  window.addEventListener('blur',()=>cancelDrag());
  window.addEventListener('orientationchange',()=>{cancelDrag();lastFrame=performance.now();});
  window.addEventListener('pagehide',()=>{if(match&&match.phase==='playing')saveNow();});
  document.querySelector('[data-install-game]').addEventListener('click',()=>{if(!document.querySelector('link[rel="manifest"]'))showModal('INSTALL','Add to Home Screen','<p>In Safari, use <b>Share → Add to Home Screen → Add</b>. Offline installation status is available on the published site.</p>',[{label:'Got it',primary:true,action:closeModal}]);});

  window.GameApp={save:saveNow,exportSave,importSave,getSummary};
  window.TowerDuelRenderDebug=()=>renderer3d.debug();
  window.TowerDuelScreenToWorld=(x,y)=>renderer3d.screenToWorld(x,y);
  window.TowerDuelWorldToScreen=(x,y)=>renderer3d.worldToScreen(x,y);
  window.dispatchEvent(new Event('game-ready'));
  showHome();
  requestAnimationFrame(frame);
})();
