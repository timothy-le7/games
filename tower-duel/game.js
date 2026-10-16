(function () {
  'use strict';
  const E = window.TowerDuelEngine;
  if (!E) throw new Error('Tower Duel engine did not load');

  const SAVE_KEY = 'games:tower-duel:v1';
  const BACKUP_KEY = SAVE_KEY + ':backup';
  const PREFS_KEY = SAVE_KEY + ':prefs';
  const SAVE_FORMAT = 'tower-duel-save';
  const SAVE_VERSION = 1;
  const glyphs = { dashling:'➤', mossguard:'⬟', sunshot:'☀', nibblers:'✣', kitewing:'⌁', boltfinch:'ϟ', emberox:'◆', ripplefox:'≋', ironroot:'⬢', cloudrays:'⋈', comet:'☄', tailwind:'〰', gluebloom:'✿', lantern:'✦', ramblebee:'◉', twinbow:'⇶' };

  const els = Object.fromEntries(['home','collection','draft','battle','continue-button','collection-button','settings-button','arena-list','card-library','deck-count','draft-step','draft-bar','draft-choices','draft-deck','arena-name','mode-name','battle-clock','pause-button','game-canvas','canvas-shell','tutorial-tip','toast','energy-fill','energy-number','hand','modal','modal-kicker','modal-title','modal-body','modal-actions','import-file'].map((id) => [id, document.getElementById(id)]));
  const ctx = els['game-canvas'].getContext('2d', { alpha: false });
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
  let audioContext = null;
  let impactSeen = 0;

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
  function cardGlyph(card) { return '<span class="card-glyph" style="background:' + card.color + '">' + glyphs[card.id] + '</span>'; }
  function renderCollection() {
    els['arena-list'].innerHTML = E.arenas.map((arena,index) => {
      const unlocked = index <= profile.unlockedArena, current = index === profile.selectedArena;
      return '<div class="arena-row ' + (current?'current ':'') + (!unlocked?'locked':'') + '"><span class="arena-medal">' + (unlocked ? index+1 : '🔒') + '</span><div><b>' + arena.name + '</b><small>' + arena.blurb + '</small></div>' + (unlocked ? '<button data-arena="'+index+'" type="button">'+(current?'Chosen':'Choose')+'</button>' : '') + '</div>';
    }).join('');
    els['deck-count'].textContent = profile.deck.length + ' / 8';
    els['card-library'].innerHTML = E.cards.map((card) => {
      const unlocked = profile.unlockedCards.includes(card.id), selected = profile.deck.includes(card.id);
      return '<button type="button" data-card-library="'+card.id+'" class="library-card '+(selected?'selected ':'')+(!unlocked?'locked':'')+'" '+(!unlocked?'disabled':'')+'>'+cardGlyph(card)+'<span class="card-cost">'+card.cost+'</span><b>'+card.name+'</b><small>'+card.desc+'</small></button>';
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
    els['draft-choices'].innerHTML = choices.map((card) => '<button type="button" class="draft-card" data-draft-card="'+card.id+'">'+cardGlyph(card)+'<span class="card-cost">'+card.cost+'</span><b>'+card.name+'</b><small>'+card.desc+'</small></button>').join('');
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
      els.hand.innerHTML = match.hands.player.map((id,index) => { const card=E.cardMap[id]; return '<button type="button" class="hand-card" data-hand-card="'+id+'" aria-label="'+(index+1)+': '+card.name+', cost '+card.cost+', '+card.desc+'">'+cardGlyph(card)+'<span class="card-cost">'+card.cost+'</span><b>'+card.name+'</b></button>'; }).join('');
    }
    els.hand.querySelectorAll('[data-hand-card]').forEach((node) => {
      const id=node.dataset.handCard, affordable=match.energy.player+1e-6>=E.cardMap[id].cost;
      node.classList.toggle('selected',selectedCard===id);
      node.classList.toggle('unaffordable',!affordable);
      node.setAttribute('aria-pressed',String(selectedCard===id));
      node.setAttribute('aria-disabled',String(!affordable));
    });
  }
  function selectCard(id) { if (!match || !match.hands.player.includes(id)) return; selectedCard = selectedCard === id ? null : id; renderHand(true); if (selectedCard && !profile.tutorialDone) showTutorial(E.cardMap[id].kind === 'spell' ? 'Spells can land anywhere. Tap a useful target area.' : 'Now tap your blue half. Units enter through the nearest lane.'); }
  function canvasPoint(clientX, clientY) { const rect=els['game-canvas'].getBoundingClientRect(); return { x:(clientX-rect.left)/rect.width*E.WIDTH, y:(clientY-rect.top)/rect.height*E.HEIGHT }; }
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
    els['energy-fill'].style.width=(match.energy.player/E.MAX_ENERGY*100)+'%'; els['energy-number'].textContent=Math.floor(match.energy.player);
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
    const canvas=els['game-canvas']; const shell=els['canvas-shell'].getBoundingClientRect(); const scale=Math.min(shell.width/E.WIDTH,shell.height/E.HEIGHT);
    const cssWidth=Math.max(1,Math.floor(E.WIDTH*scale)),cssHeight=Math.max(1,Math.floor(E.HEIGHT*scale));
    if(canvas.style.width!==cssWidth+'px'||canvas.style.height!==cssHeight+'px'){canvas.style.width=cssWidth+'px';canvas.style.height=cssHeight+'px';}
    const pixelBudget=12000000;
    const dpr=Math.min(devicePixelRatio||1,Math.sqrt(pixelBudget/Math.max(1,displayArea(shell.width,shell.height))));
    const display=canvas.getBoundingClientRect(); const width=Math.max(1,Math.round(display.width*dpr)); const height=Math.max(1,Math.round(display.height*dpr));
    if (canvas.width!==width||canvas.height!==height) { canvas.width=width;canvas.height=height; }
    ctx.setTransform(width/E.WIDTH,0,0,height/E.HEIGHT,0,0);
    drawArena(); drawPlacement(); match.towers.forEach(drawTower); match.units.forEach(drawUnit); match.projectiles.forEach(drawProjectile); if (!prefs.reducedEffects) match.effects.forEach(drawEffect);
  }
  function displayArea(width,height){return Math.max(1,width*height);}
  function drawArena() {
    const g=ctx.createLinearGradient(0,0,0,E.HEIGHT); g.addColorStop(0,'#5b597e');g.addColorStop(.47,'#3f786f');g.addColorStop(.53,'#3a817b');g.addColorStop(1,'#32697d');ctx.fillStyle=g;ctx.fillRect(0,0,E.WIDTH,E.HEIGHT);
    ctx.fillStyle='#ffffff0c'; for(let y=170;y<E.HEIGHT;y+=160) for(let x=(y/160%2)*70;x<E.WIDTH;x+=140){ctx.beginPath();ctx.arc(x,y,36,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#193e62';ctx.fillRect(0,E.RIVER_TOP,E.WIDTH,E.RIVER_BOTTOM-E.RIVER_TOP);
    ctx.fillStyle='#62d8d833'; for(let y=E.RIVER_TOP+18;y<E.RIVER_BOTTOM;y+=26){ctx.fillRect(0,y,E.WIDTH,8);}
    [E.LANES[0],E.LANES[1]].forEach((x)=>{ctx.fillStyle='#d6b977';ctx.fillRect(x-74,E.RIVER_TOP-10,148,E.RIVER_BOTTOM-E.RIVER_TOP+20);ctx.fillStyle='#87683e';for(let y=E.RIVER_TOP;y<E.RIVER_BOTTOM;y+=25)ctx.fillRect(x-70,y,140,6);});
    ctx.strokeStyle='#ffffff24';ctx.setLineDash([12,16]);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(500,0);ctx.lineTo(500,E.RIVER_TOP-8);ctx.moveTo(500,E.RIVER_BOTTOM+8);ctx.lineTo(500,E.HEIGHT);ctx.stroke();ctx.setLineDash([]);
  }
  function drawPlacement(){ if(!selectedCard)return;const card=E.cardMap[selectedCard];ctx.fillStyle=card.kind==='spell'?'#ffd46d18':'#64e4d31f';ctx.fillRect(0,card.kind==='spell'?0:E.RIVER_BOTTOM,E.WIDTH,card.kind==='spell'?E.HEIGHT:E.HEIGHT-E.RIVER_BOTTOM);ctx.strokeStyle=card.color;ctx.lineWidth=6;ctx.setLineDash([16,12]);ctx.strokeRect(8,(card.kind==='spell'?8:E.RIVER_BOTTOM+8),E.WIDTH-16,(card.kind==='spell'?E.HEIGHT-16:E.HEIGHT-E.RIVER_BOTTOM-16));ctx.setLineDash([]);}
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function hpBar(item,width,yOffset){if(!item.alive)return;ctx.fillStyle='#10172baa';roundedRect(item.x-width/2,item.y-yOffset,width,9,5);ctx.fill();ctx.fillStyle=item.side==='player'?'#62e5d2':'#ff776b';roundedRect(item.x-width/2,item.y-yOffset,width*Math.max(0,item.hp/item.maxHp),9,5);ctx.fill();}
  function drawTower(t){ctx.save();ctx.globalAlpha=t.alive?1:.28;ctx.translate(t.x,t.y);ctx.fillStyle=t.side==='player'?'#3db7ca':'#c95269';ctx.strokeStyle='#f6e7bd';ctx.lineWidth=6;roundedRect(-t.radius,-t.radius*.72,t.radius*2,t.radius*1.45,18);ctx.fill();ctx.stroke();ctx.fillStyle=t.type==='base'?'#ffe06d':'#e9f4ff';ctx.beginPath();ctx.moveTo(-t.radius*.66,-t.radius*.58);ctx.lineTo(-t.radius*.32,-t.radius*1.05);ctx.lineTo(0,-t.radius*.58);ctx.lineTo(t.radius*.35,-t.radius*1.08);ctx.lineTo(t.radius*.7,-t.radius*.58);ctx.closePath();ctx.fill();if(!t.alive){ctx.strokeStyle='#182238';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-30,-25);ctx.lineTo(30,25);ctx.moveTo(30,-25);ctx.lineTo(-30,25);ctx.stroke();}ctx.restore();hpBar(t,t.type==='base'?130:105,t.radius+27);}
  function drawUnit(u){const card=E.cardMap[u.cardId];ctx.save();ctx.translate(u.x,u.y);if(u.flying){ctx.fillStyle='#07172c55';ctx.beginPath();ctx.ellipse(8,18,u.radius*1.1,u.radius*.45,0,0,Math.PI*2);ctx.fill();}ctx.fillStyle=card.color;ctx.strokeStyle=u.side==='player'?'#ddfffb':'#5e1530';ctx.lineWidth=5;ctx.beginPath();if(u.flying){ctx.moveTo(-u.radius*1.2,0);ctx.quadraticCurveTo(-u.radius*.4,-u.radius*1.2,0,-u.radius*.45);ctx.quadraticCurveTo(u.radius*.45,-u.radius*1.2,u.radius*1.2,0);ctx.quadraticCurveTo(0,u.radius*.7,-u.radius*1.2,0);}else{ctx.roundRect(-u.radius,-u.radius,u.radius*2,u.radius*2,u.radius*.65);}ctx.fill();ctx.stroke();ctx.fillStyle='#14213a';ctx.font='900 '+Math.max(18,u.radius)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(glyphs[u.cardId]||'•',0,1);if(u.slow>0){ctx.strokeStyle='#e69ae6';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,u.radius+8,0,Math.PI*2);ctx.stroke();}ctx.restore();hpBar(u,u.radius*2.2,u.radius+17);}
  function drawProjectile(p){ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=prefs.reducedEffects?0:16;ctx.beginPath();ctx.arc(p.x,p.y,p.splash?10:7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  function drawEffect(effect){ctx.save();ctx.globalAlpha=Math.max(0,effect.life/effect.maxLife);ctx.strokeStyle=effect.color;ctx.lineWidth=16*(1-effect.life/effect.maxLife)+4;ctx.beginPath();ctx.arc(effect.x,effect.y,effect.radius*(1-effect.life/effect.maxLife*.45),0,Math.PI*2);ctx.stroke();ctx.restore();}

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
  function downloadSave(){const blob=new Blob([JSON.stringify(exportSave(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tower-duel-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
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
  els.hand.addEventListener('pointerdown',(event)=>{const card=event.target.closest('[data-hand-card]');if(!card||event.button!==0)return;pointerDrag={id:card.dataset.handCard,x:event.clientX,y:event.clientY,moved:false,pointerId:event.pointerId};try{card.setPointerCapture?.(event.pointerId);}catch(_){/* Synthetic and interrupted pointers may have no active capture. */}});
  document.addEventListener('pointermove',(event)=>{if(pointerDrag&&event.pointerId===pointerDrag.pointerId&&Math.hypot(event.clientX-pointerDrag.x,event.clientY-pointerDrag.y)>8)pointerDrag.moved=true;});
  document.addEventListener('pointerup',(event)=>{if(!pointerDrag||event.pointerId!==pointerDrag.pointerId)return;const drag=pointerDrag;pointerDrag=null;if(drag.moved){suppressHandClickUntil=performance.now()+120;selectedCard=drag.id;renderHand(false);const rect=els['game-canvas'].getBoundingClientRect();if(event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom){suppressCanvasPointerUntil=performance.now()+100;deployAt(canvasPoint(event.clientX,event.clientY));}}});
  document.addEventListener('pointercancel',(event)=>{if(pointerDrag&&event.pointerId===pointerDrag.pointerId)pointerDrag=null;});
  els.hand.addEventListener('pointerleave',(event)=>{if(pointerDrag&&event.buttons===0)pointerDrag=null;});
  els['game-canvas'].addEventListener('pointerdown',(event)=>{if(event.button===0&&performance.now()>=suppressCanvasPointerUntil)deployAt(canvasPoint(event.clientX,event.clientY));});
  els['pause-button'].addEventListener('click',pauseBattle);
  els['import-file'].addEventListener('change',async()=>{const file=els['import-file'].files[0];if(!file)return;try{const value=JSON.parse(await file.text());if(!importSave(value))throw new Error('invalid');showModal('IMPORTED','Save restored','<p>Your validated Tower Duel progress is ready.</p>',[{label:'Continue',primary:true,action:closeModal}]);}catch(_){showModal('IMPORT STOPPED','That save is not valid','<p>Nothing was changed. Choose an unedited Tower Duel export file.</p>',[{label:'Okay',primary:true,action:closeModal}]);}finally{els['import-file'].value='';}});
  document.addEventListener('keydown',(event)=>{if(currentScreen()!=='battle'||els.modal.classList.contains('hidden')===false)return;if(['1','2','3','4'].includes(event.key)){selectCard(match.hands.player[Number(event.key)-1]);event.preventDefault();}else if(event.key===' '||event.key==='Escape'){pauseBattle();event.preventDefault();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&match&&match.phase==='playing'){paused=true;saveNow();}else{lastFrame=performance.now();if(match&&match.phase==='playing'&&currentScreen()==='battle'&&els.modal.classList.contains('hidden'))pauseBattle();}});
  window.addEventListener('pagehide',()=>{if(match&&match.phase==='playing')saveNow();});
  document.querySelector('[data-install-game]').addEventListener('click',()=>{if(!document.querySelector('link[rel="manifest"]'))showModal('INSTALL','Add to Home Screen','<p>In Safari, use <b>Share → Add to Home Screen → Add</b>. Offline installation status is available on the published site.</p>',[{label:'Got it',primary:true,action:closeModal}]);});

  window.GameApp={save:saveNow,exportSave,importSave,getSummary};
  window.dispatchEvent(new Event('game-ready'));
  showHome();
  requestAnimationFrame(frame);
})();
