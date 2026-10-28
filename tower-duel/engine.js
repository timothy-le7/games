(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TowerDuelEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 1000;
  const HEIGHT = 1400;
  const RIVER_TOP = 650;
  const RIVER_BOTTOM = 750;
  const VERSION = 1;
  const STEP = 1 / 30;
  const MAX_ENERGY = 10;
  const LANES = [280, 720];

  const cards = [
    { id: 'dashling', name: 'Dashling', cost: 2, kind: 'unit', role: 'melee', hp: 190, damage: 48, speed: 104, range: 42, cooldown: .72, target: 'ground', size: 25, color: '#ffcc66', desc: 'Quick ground duelist' },
    { id: 'mossguard', name: 'Mossguard', cost: 4, kind: 'unit', role: 'tank', hp: 760, damage: 44, speed: 45, range: 46, cooldown: 1.1, target: 'ground', size: 39, color: '#62c789', desc: 'Tough tower-seeking tank', buildingsOnly: true },
    { id: 'sunshot', name: 'Sunshot', cost: 3, kind: 'unit', role: 'ranged', hp: 245, damage: 58, speed: 65, range: 215, cooldown: 1.05, target: 'both', projectile: 500, size: 25, color: '#ff8d5c', desc: 'Long range, hits air' },
    { id: 'nibblers', name: 'Nibblers', cost: 3, kind: 'unit', role: 'swarm', hp: 90, damage: 25, speed: 93, range: 36, cooldown: .58, target: 'ground', size: 16, count: 4, color: '#bde65e', desc: 'Four fast little fighters' },
    { id: 'kitewing', name: 'Kitewing', cost: 3, kind: 'unit', role: 'flying', hp: 250, damage: 55, speed: 78, range: 125, cooldown: .92, target: 'both', projectile: 440, flying: true, size: 27, color: '#73ddf2', desc: 'Flying lane skirmisher' },
    { id: 'boltfinch', name: 'Bolt Finch', cost: 2, kind: 'unit', role: 'anti-air', hp: 180, damage: 74, speed: 62, range: 185, cooldown: 1.15, target: 'air', projectile: 620, size: 22, color: '#b99cff', desc: 'Cheap specialist vs air' },
    { id: 'emberox', name: 'Ember Ox', cost: 6, kind: 'unit', role: 'bruiser', hp: 920, damage: 126, speed: 48, range: 48, cooldown: 1.25, target: 'ground', size: 43, color: '#e86154', desc: 'Heavy push leader' },
    { id: 'ripplefox', name: 'Ripple Fox', cost: 4, kind: 'unit', role: 'splash', hp: 330, damage: 62, speed: 66, range: 170, cooldown: 1.12, target: 'both', projectile: 430, splash: 80, size: 28, color: '#57bad8', desc: 'Ranged splash attacker' },
    { id: 'ironroot', name: 'Ironroot', cost: 5, kind: 'unit', role: 'guardian', hp: 680, damage: 80, speed: 50, range: 50, cooldown: .95, target: 'ground', size: 36, color: '#9b825f', desc: 'Reliable armored defender' },
    { id: 'cloudrays', name: 'Cloud Rays', cost: 5, kind: 'unit', role: 'air-swarm', hp: 125, damage: 35, speed: 91, range: 80, cooldown: .66, target: 'both', flying: true, size: 19, count: 3, color: '#7ce4df', desc: 'Three swift flying hunters' },
    { id: 'comet', name: 'Pocket Comet', cost: 4, kind: 'spell', role: 'damage', damage: 245, radius: 125, knockback: 58, color: '#ff745c', desc: 'Area damage and knockback' },
    { id: 'tailwind', name: 'Tailwind', cost: 3, kind: 'spell', role: 'support', radius: 150, color: '#65e6c4', desc: 'Heal and hasten allies', heal: 145, haste: 5 },
    { id: 'gluebloom', name: 'Glue Bloom', cost: 3, kind: 'spell', role: 'control', radius: 140, color: '#e69ae6', desc: 'Damage and slow enemies', damage: 85, slow: 4 },
    { id: 'lantern', name: 'Lantern Crew', cost: 4, kind: 'unit', role: 'support', hp: 310, damage: 35, speed: 58, range: 155, cooldown: .9, target: 'both', projectile: 420, aura: 1.14, size: 28, color: '#ffe88b', desc: 'Boosts nearby allies' },
    { id: 'ramblebee', name: 'Ramblebee', cost: 4, kind: 'unit', role: 'flying-tank', hp: 510, damage: 65, speed: 57, range: 46, cooldown: .9, target: 'ground', flying: true, buildingsOnly: true, size: 34, color: '#efb84f', desc: 'Airborne tower chaser' },
    { id: 'twinbow', name: 'Twinbow', cost: 5, kind: 'unit', role: 'marksman', hp: 305, damage: 93, speed: 55, range: 245, cooldown: 1.15, target: 'both', projectile: 650, size: 27, color: '#f49acf', desc: 'Precise two-target volley', multi: 2 }
  ];
  const cardMap = Object.fromEntries(cards.map((card) => [card.id, card]));

  const arenas = [
    { name: 'Rooftop Rally', ai: 'balanced', deck: ['dashling','mossguard','sunshot','nibblers','kitewing','comet','tailwind','ironroot'], unlock: 'ripplefox', blurb: 'Learn clean counters.' },
    { name: 'Breezeway Bend', ai: 'rush', deck: ['dashling','nibblers','kitewing','boltfinch','gluebloom','tailwind','sunshot','mossguard'], unlock: 'boltfinch', blurb: 'Stops quick split pushes.' },
    { name: 'Copper Canopy', ai: 'defend', deck: ['ironroot','sunshot','ripplefox','mossguard','comet','tailwind','dashling','boltfinch'], unlock: 'emberox', blurb: 'Patient defense becomes a counterpush.' },
    { name: 'Cloudrail Crossing', ai: 'air', deck: ['kitewing','cloudrays','ramblebee','sunshot','boltfinch','tailwind','gluebloom','mossguard'], unlock: 'cloudrays', blurb: 'Air attacks demand flexible answers.' },
    { name: 'Emberworks', ai: 'heavy', deck: ['emberox','ironroot','mossguard','sunshot','ripplefox','comet','gluebloom','dashling'], unlock: 'lantern', blurb: 'Save energy for a powerful push.' },
    { name: 'Lantern Loop', ai: 'support', deck: ['lantern','twinbow','mossguard','kitewing','tailwind','nibblers','comet','ironroot'], unlock: 'ramblebee', blurb: 'Break apart boosted formations.' },
    { name: 'Prism Causeway', ai: 'control', deck: ['gluebloom','ripplefox','twinbow','ironroot','cloudrays','comet','dashling','tailwind'], unlock: 'twinbow', blurb: 'Avoid clumping into control spells.' },
    { name: 'The Sky Foundry', ai: 'champion', deck: ['emberox','twinbow','lantern','ramblebee','ripplefox','cloudrays','comet','gluebloom'], unlock: 'gluebloom', blurb: 'The champion reads both lanes.' }
  ];

  const starterDeck = ['dashling','mossguard','sunshot','nibblers','kitewing','comet','tailwind','ironroot'];

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function random(state) {
    let x = state.rng >>> 0 || 0x9e3779b9;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.rng = x >>> 0;
    return state.rng / 4294967296;
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function laneFor(x) { return x < WIDTH / 2 ? 0 : 1; }
  function sideDirection(side) { return side === 'player' ? -1 : 1; }
  function other(side) { return side === 'player' ? 'enemy' : 'player'; }

  function makeTower(side, type, lane, x, y) {
    const base = type === 'base';
    const maxHp = base ? 2400 : 1500;
    return { id: side + '-' + type + '-' + lane, side, type, lane, x, y, hp: maxHp, maxHp, radius: base ? 62 : 48, range: base ? 235 : 210, damage: base ? 72 : 58, cooldown: base ? .8 : .9, attackTimer: 0, recoil: 0, hit: 0, active: !base, heading: side === 'player' ? -Math.PI / 2 : Math.PI / 2, alive: true };
  }

  function makeTowers() {
    return [
      makeTower('enemy','base',-1,500,92), makeTower('enemy','lane',0,280,300), makeTower('enemy','lane',1,720,300),
      makeTower('player','lane',0,280,1100), makeTower('player','lane',1,720,1100), makeTower('player','base',-1,500,1308)
    ];
  }

  function shuffledDeck(state, deck) {
    const result = deck.slice();
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }

  function createMatch(options) {
    options = options || {};
    const mode = ['classic','frenzy','draft'].includes(options.mode) ? options.mode : 'classic';
    const arena = clamp(Number.isInteger(options.arena) ? options.arena : 0, 0, arenas.length - 1);
    const state = {
      version: VERSION, rulesVersion: 2, mode, arena, phase: 'playing', result: null, time: 180, overtime: false, overtimeCrowns: null,
      rng: (options.seed >>> 0) || 19870621, nextId: 1, accumulator: 0, energy: { player: 5, enemy: 5 },
      units: [], projectiles: [], effects: [], towers: makeTowers(),
      decks: { player: [], enemy: [] }, hands: { player: [], enemy: [] }, queues: { player: [], enemy: [] },
      aiTimer: .7, events: [], stats: { playerPlayed: 0, enemyPlayed: 0, playerDamage: 0, enemyDamage: 0 }
    };
    const playerDeck = Array.isArray(options.deck) && options.deck.length === 8 && options.deck.every((id) => cardMap[id]) ? options.deck : starterDeck;
    state.decks.player = playerDeck.slice();
    state.decks.enemy = arenas[arena].deck.slice();
    ['player','enemy'].forEach((side) => {
      state.queues[side] = shuffledDeck(state, state.decks[side]);
      state.hands[side] = state.queues[side].splice(0, 4);
    });
    return state;
  }

  function pushEvent(state, type, data) {
    state.events.push(Object.assign({ type, at: 180 - state.time }, data || {}));
    if (state.events.length > 36) state.events.shift();
  }

  function rotateHand(state, side, cardId) {
    const index = state.hands[side].indexOf(cardId);
    if (index < 0) return;
    const next = state.queues[side].shift();
    state.hands[side].splice(index, 1, next);
    state.queues[side].push(cardId);
  }

  function legalPlacement(state, side, card, x, y) {
    if (!card || state.phase !== 'playing') return { ok: false, reason: 'Match is not active' };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'Choose a spot on the arena' };
    if (!state.hands[side].includes(card.id)) return { ok: false, reason: 'Card is not in hand' };
    if (state.energy[side] + 1e-6 < card.cost) return { ok: false, reason: 'Not enough spark' };
    if (x < 45 || x > WIDTH - 45 || y < 45 || y > HEIGHT - 45) return { ok: false, reason: 'Too close to the edge' };
    if (card.kind === 'unit') {
      const lane=laneFor(x),opponent=other(side),laneTower=state.towers.find((tower)=>tower.side===opponent&&tower.type==='lane'&&tower.lane===lane);
      const forwardPocket=laneTower&&!laneTower.alive&&(side==='player'?y>=360&&y<=RIVER_TOP-12:y<=1040&&y>=RIVER_BOTTOM+12);
      const homeTerritory=side==='player'?y>=RIVER_BOTTOM+12:y<=RIVER_TOP-12;
      if (!homeTerritory&&!forwardPocket) return { ok: false, reason: forwardPocket === false && laneTower && laneTower.alive ? 'Topple that lane tower to deploy ahead' : 'Deploy units on your side' };
      if (Math.abs(y - 700) < 90) return { ok: false, reason: 'Units cannot start in the current' };
      if(state.towers.some((tower)=>tower.alive&&distance(tower,{x,y})<tower.radius+38))return{ok:false,reason:'That spot is occupied by a tower'};
    }
    return { ok: true, reason: '' };
  }

  function spawnUnit(state, side, card, x, y, offset) {
    const ox = offset ? offset.x : 0, oy = offset ? offset.y : 0;
    state.units.push({
      id: 'u' + state.nextId++, side, cardId: card.id, name: card.name, role: card.role,
      x: clamp(x + ox, 35, WIDTH - 35), y: clamp(y + oy, 35, HEIGHT - 35), lane: laneFor(x),
      hp: card.hp, maxHp: card.hp,
      damage: card.damage, speed: card.speed, range: card.range,
      cooldown: card.cooldown, attackTimer: random(state) * .12, targetType: card.target, projectile: card.projectile || 0,
      flying: !!card.flying, buildingsOnly: !!card.buildingsOnly, splash: card.splash || 0, aura: card.aura || 0,
      multi: card.multi || 1, radius: card.size, slow: 0, haste: 0, deploy: state.rulesVersion === 2 ? 1 : .58, heading: side === 'player' ? -Math.PI / 2 : Math.PI / 2,
      walk: 0, attackAnim: 0, hit: 0, alive: true
    });
  }

  function playCard(state, side, cardId, x, y) {
    const card = cardMap[cardId];
    const legal = legalPlacement(state, side, card, x, y);
    if (!legal.ok) { if (side === 'player') pushEvent(state, 'invalid', { reason: legal.reason }); return legal; }
    state.energy[side] = clamp(state.energy[side] - card.cost, 0, MAX_ENERGY);
    rotateHand(state, side, cardId);
    state.stats[side + 'Played']++;
    if (card.kind === 'spell') applySpell(state, side, card, x, y);
    else {
      const count = card.count || 1;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i / count) + random(state) * .25;
        const spread = count > 1 ? 34 : 0;
        spawnUnit(state, side, card, x, y, { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread });
      }
    }
    pushEvent(state, 'played', { side, cardId, x, y });
    return { ok: true, reason: '' };
  }

  function applyDamage(state, target, amount, sourceSide) {
    if (!target.alive || amount <= 0) return;
    if (target.type === 'base') target.active = true;
    target.hp -= amount; target.hit = .18;
    state.stats[sourceSide + 'Damage'] += amount;
    if (target.hp <= 0) {
      target.hp = 0; target.alive = false;
      state.effects.push({ id: 'e' + state.nextId++, kind: target.type ? 'rubble' : 'defeat', x: target.x, y: target.y, radius: target.radius || 30, color: target.side === 'player' ? '#61e5d2' : '#ff8067', life: target.type ? 1.5 : .62, maxLife: target.type ? 1.5 : .62, cardId: target.cardId || '' });
      pushEvent(state, target.type ? 'towerDown' : 'unitDown', { side: target.side, id: target.id });
      if (target.type === 'lane') {
        const base=state.towers.find((tower)=>tower.side===target.side&&tower.type==='base');
        if(base)base.active=true;
      }
    }
  }

  function applySpell(state, side, card, x, y) {
    const targets = state.units.filter((u) => u.alive && distance(u, {x,y}) <= card.radius);
    if (card.damage) {
      targets.filter((u) => u.side !== side).forEach((u) => {
        applyDamage(state, u, card.damage, side);
        if (card.slow) u.slow = Math.max(u.slow, card.slow);
        if (card.knockback && u.alive) {
          const dx=u.x-x,dy=u.y-y,length=Math.max(1,Math.hypot(dx,dy)),direction=side==='player'?-1:1;
          u.x=clamp(u.x+dx/length*card.knockback,35,WIDTH-35);
          u.y=clamp(u.y+(Math.abs(dy)>1?dy/length:direction)*card.knockback,35,HEIGHT-35);
          u.lane=laneFor(u.x);
        }
      });
      state.towers.filter((t) => t.alive && t.side !== side && distance(t, {x,y}) <= card.radius).forEach((t) => applyDamage(state, t, card.damage * .55, side));
    }
    if (card.heal) targets.filter((u) => u.side === side).forEach((u) => { u.hp = Math.min(u.maxHp, u.hp + card.heal); u.haste = Math.max(u.haste, card.haste || 0); });
    state.effects.push({ id: 'e' + state.nextId++, kind: card.role, x, y, radius: card.radius, color: card.color, life: .65, maxLife: .65 });
  }

  function canTarget(attacker, target) {
    if (!target.alive || target.side === attacker.side) return false;
    if (target.type) return attacker.targetType !== 'air';
    if (attacker.buildingsOnly) return false;
    if (attacker.targetType === 'air') return target.flying;
    if (attacker.targetType === 'ground') return !target.flying;
    return true;
  }

  function nearestTarget(state, unit) {
    let candidates = [];
    if (!unit.buildingsOnly) candidates = state.units.filter((otherUnit) => canTarget(unit, otherUnit));
    const aggro = candidates.filter((target) => distance(unit, target) <= Math.max(245, unit.range + 75));
    if (aggro.length) candidates = aggro;
    else {
      const enemyTowers = state.towers.filter((tower) => tower.alive && tower.side !== unit.side);
      const laneTower = enemyTowers.find((tower) => tower.type === 'lane' && tower.lane === unit.lane);
      const base = enemyTowers.find((tower) => tower.type === 'base');
      candidates = laneTower ? [laneTower] : base ? [base] : enemyTowers;
    }
    candidates.sort((a, b) => distance(unit, a) - distance(unit, b));
    return candidates[0] || null;
  }

  function launchProjectile(state, attacker, target, damage, splash) {
    state.projectiles.push({ id: 'p' + state.nextId++, side: attacker.side, x: attacker.x, y: attacker.y, targetId: target.id, speed: attacker.projectile || 500, damage, splash: splash || 0, life: 2.5, color: cardMap[attacker.cardId] ? cardMap[attacker.cardId].color : '#fff' });
  }

  function attack(state, unit, target) {
    unit.attackAnim = .24;
    let boost = 1;
    for (const ally of state.units) if (ally.alive && ally.side === unit.side && ally.aura && distance(ally, unit) < 145) boost = Math.max(boost, ally.aura);
    if (unit.projectile) {
      const targets = [target];
      if (unit.multi > 1) {
        const extra = state.units.filter((u) => canTarget(unit, u) && u.id !== target.id && distance(unit, u) <= unit.range + u.radius).sort((a,b) => distance(unit,a)-distance(unit,b))[0];
        if (extra) targets.push(extra);
      }
      targets.forEach((chosen) => launchProjectile(state, unit, chosen, unit.damage * boost, unit.splash));
    } else {
      applyDamage(state, target, unit.damage * boost, unit.side);
      if (unit.splash) state.units.filter((u) => u.side !== unit.side && u.id !== target.id && distance(u, target) <= unit.splash).forEach((u) => applyDamage(state, u, unit.damage * .6 * boost, unit.side));
    }
  }

  function movementGoal(unit, target) {
    if (unit.flying) return target;
    const crossingUp = unit.y > RIVER_BOTTOM && target.y < RIVER_TOP;
    const crossingDown = unit.y < RIVER_TOP && target.y > RIVER_BOTTOM;
    if (!crossingUp && !crossingDown && !(unit.y > RIVER_TOP && unit.y < RIVER_BOTTOM)) return target;
    const bridgeX = LANES[unit.lane];
    if (crossingUp && unit.y > RIVER_BOTTOM + 18) return { x: bridgeX, y: RIVER_BOTTOM + 8 };
    if (crossingDown && unit.y < RIVER_TOP - 18) return { x: bridgeX, y: RIVER_TOP - 8 };
    return { x: bridgeX, y: target.y };
  }

  function separateUnits(state, dt) {
    for (let i = 0; i < state.units.length; i++) for (let j = i + 1; j < state.units.length; j++) {
      const a = state.units[i], b = state.units[j];
      if (!a.alive || !b.alive || a.side !== b.side || a.flying !== b.flying) continue;
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d < .001) { const angle = (i * 2.17 + j * 1.31) % (Math.PI * 2); dx = Math.cos(angle); dy = Math.sin(angle); d = 1; }
      const desired = (a.radius + b.radius) * .7;
      if (d >= desired) continue;
      const push = Math.min(28 * dt, (desired - d) * .5), nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
    for (const unit of state.units) if (!unit.flying && unit.y > RIVER_TOP && unit.y < RIVER_BOTTOM) {
      const bridgeX = LANES[unit.lane];
      unit.x = clamp(unit.x, bridgeX - 56 + unit.radius * .25, bridgeX + 56 - unit.radius * .25);
    }
  }

  function updateUnits(state, dt) {
    for (const unit of state.units) {
      if (!unit.alive) continue;
      unit.deploy = Math.max(0, Number(unit.deploy) || 0);
      unit.heading = Number.isFinite(unit.heading) ? unit.heading : (unit.side === 'player' ? -Math.PI / 2 : Math.PI / 2);
      unit.walk = Number(unit.walk) || 0; unit.attackAnim = Math.max(0, (Number(unit.attackAnim) || 0) - dt); unit.hit = Math.max(0, (Number(unit.hit) || 0) - dt);
      if (unit.deploy > 0) { unit.deploy = Math.max(0, unit.deploy - dt); continue; }
      unit.attackTimer = Math.max(0, unit.attackTimer - dt);
      unit.slow = Math.max(0, unit.slow - dt); unit.haste = Math.max(0, unit.haste - dt);
      const target = nearestTarget(state, unit);
      if (!target) continue;
      const gap = distance(unit, target) - (target.radius || 20) - unit.radius;
      if (gap <= unit.range) {
        if (unit.attackTimer <= 0) { attack(state, unit, target); unit.attackTimer = unit.cooldown; }
      } else {
        const goal = movementGoal(unit, target);
        const dx = goal.x - unit.x, dy = goal.y - unit.y, length = Math.max(.001, Math.hypot(dx,dy));
        const modifier = (unit.slow > 0 ? .53 : 1) * (unit.haste > 0 ? 1.34 : 1);
        const stride = Math.min(length, unit.speed * modifier * dt);
        unit.x += dx / length * stride; unit.y += dy / length * stride;
        unit.heading = Math.atan2(dy, dx); unit.walk = (unit.walk + stride * .055) % (Math.PI * 2);
        unit.lane = laneFor(unit.x);
      }
    }
    separateUnits(state, dt);
    state.units = state.units.filter((u) => u.alive);
  }

  function findTargetById(state, id) { return state.units.find((u) => u.id === id) || state.towers.find((t) => t.id === id); }
  function updateProjectiles(state, dt) {
    for (const shot of state.projectiles) {
      shot.life -= dt;
      const target = findTargetById(state, shot.targetId);
      if (!target || !target.alive) { shot.life = 0; continue; }
      const d = distance(shot, target);
      const stride = shot.speed * dt;
      if (d <= stride + (target.radius || 15)) {
        applyDamage(state, target, shot.damage, shot.side);
        if (shot.splash) state.units.filter((u) => u.alive && u.side !== shot.side && u.id !== target.id && distance(u, target) <= shot.splash).forEach((u) => applyDamage(state, u, shot.damage * .6, shot.side));
        shot.life = 0;
      } else { shot.x += (target.x - shot.x) / d * stride; shot.y += (target.y - shot.y) / d * stride; }
    }
    state.projectiles = state.projectiles.filter((p) => p.life > 0);
  }

  function updateTowers(state, dt) {
    for (const tower of state.towers) {
      if (!tower.alive) continue;
      tower.recoil = Math.max(0, (Number(tower.recoil) || 0) - dt); tower.hit = Math.max(0, (Number(tower.hit) || 0) - dt);
      if (tower.type === 'base' && !tower.active) continue;
      tower.attackTimer = Math.max(0, tower.attackTimer - dt);
      const targets = state.units.filter((u) => u.alive && u.side !== tower.side && distance(tower,u) <= tower.range + u.radius).sort((a,b) => distance(tower,a)-distance(tower,b));
      if (targets[0]) tower.heading = Math.atan2(targets[0].y - tower.y, targets[0].x - tower.x);
      if (targets[0] && tower.attackTimer <= 0) { launchProjectile(state, Object.assign({ projectile: 620, cardId: '' }, tower), targets[0], tower.damage, 0); tower.attackTimer = tower.cooldown; tower.recoil = .2; }
    }
  }

  function threatScore(state, side, lane) {
    const towerY = side === 'enemy' ? 300 : 1100;
    return state.units.filter((u) => u.alive && u.side !== side && u.lane === lane).reduce((sum,u) => sum + (u.maxHp + u.damage * 4) / (1 + Math.abs(u.y - towerY) / 240), 0);
  }

  function aiStep(state) {
    if (state.phase !== 'playing') return false;
    const profile = arenas[state.arena].ai;
    const affordable = state.hands.enemy.map((id) => cardMap[id]).filter((c) => c.cost <= state.energy.enemy + 1e-6);
    if (!affordable.length) return false;
    const threats = [threatScore(state,'enemy',0), threatScore(state,'enemy',1)];
    const defendLane = threats[0] > threats[1] ? 0 : 1;
    const pressured = threats[defendLane] > (profile === 'champion' ? 170 : 260);
    const laneThreats = state.units.filter((unit) => unit.alive && unit.side === 'player' && unit.lane === defendLane);
    const airThreat = laneThreats.some((unit) => unit.flying);
    const swarmThreat = laneThreats.length >= 3;
    let scored = affordable.map((card) => {
      let score = random(state) * 1.4 + card.cost * .12;
      if (pressured && card.kind === 'unit' && !card.buildingsOnly) score += card.role === 'splash' || card.role === 'tank' || card.role === 'guardian' ? 4 : 2;
      if (pressured && card.kind === 'spell' && card.damage) score += 3.5;
      if (pressured && airThreat && (card.target === 'air' || card.target === 'both')) score += 2.4;
      if (pressured && swarmThreat && (card.splash || card.role === 'damage' || card.role === 'control')) score += 2.5;
      if (profile === 'rush' && card.cost <= 3) score += 2;
      if (profile === 'air' && card.flying) score += 2.8;
      if (profile === 'heavy' && (card.role === 'tank' || card.role === 'bruiser')) score += 3;
      if (profile === 'support' && (card.role === 'support' || card.role === 'marksman')) score += 3;
      if ((profile === 'control' || profile === 'champion') && card.kind === 'spell') score += 2.5;
      return { card, score };
    }).sort((a,b) => b.score-a.score);
    const card = scored[0].card;
    let lane = pressured ? defendLane : (random(state) < .5 ? 0 : 1);
    let x = LANES[lane] + (random(state)-.5) * 150;
    let y = pressured ? 390 + random(state)*170 : 460 + random(state)*120;
    const pocketTower=state.towers.find((tower)=>tower.side==='player'&&tower.type==='lane'&&tower.lane===lane);
    if(!pressured&&card.kind==='unit'&&pocketTower&&!pocketTower.alive&&random(state)<.42)y=820+random(state)*150;
    if (card.kind === 'spell') {
      const targets = state.units.filter((u) => u.alive && u.side === 'player');
      const chosen = targets.sort((a,b) => (b.maxHp+b.damage*3)-(a.maxHp+a.damage*3))[0];
      if (chosen) { x = chosen.x; y = chosen.y; }
      else if (card.heal) { const ally = state.units.find((u) => u.alive && u.side === 'enemy'); if (ally) { x=ally.x; y=ally.y; } }
    }
    return playCard(state,'enemy',card.id,x,y).ok;
  }

  function scoreSide(state, side) {
    const opponent = other(side);
    const destroyed = state.towers.filter((t) => t.side === opponent && !t.alive).reduce((n,t) => n + (t.type === 'base' ? 3 : 1), 0);
    const remaining = state.towers.filter((t) => t.side === side && t.alive).reduce((n,t) => n + t.hp / t.maxHp, 0);
    return { destroyed, remaining };
  }

  function conclude(state, reason) {
    if (state.phase !== 'playing') return;
    const playerBase = state.towers.find((t) => t.side === 'player' && t.type === 'base');
    const enemyBase = state.towers.find((t) => t.side === 'enemy' && t.type === 'base');
    let result;
    if (!playerBase.alive && !enemyBase.alive) result = 'tie';
    else if (!enemyBase.alive) result = 'win';
    else if (!playerBase.alive) result = 'loss';
    else {
      const p = scoreSide(state,'player'), e = scoreSide(state,'enemy');
      if (p.destroyed !== e.destroyed) result = p.destroyed > e.destroyed ? 'win' : 'loss';
      else if (Math.abs(p.remaining-e.remaining) > .001) result = p.remaining > e.remaining ? 'win' : 'loss';
      else result = 'tie';
    }
    state.phase = 'ended'; state.result = result; state.endReason = reason;
    pushEvent(state,'ended',{ result, reason });
  }

  function updateClockAndEnd(state, dt) {
    const pBase = state.towers.find((t) => t.side === 'player' && t.type === 'base');
    const eBase = state.towers.find((t) => t.side === 'enemy' && t.type === 'base');
    if (!pBase.alive || !eBase.alive) { conclude(state,'base'); return; }
    if (state.overtime && state.overtimeCrowns) {
      const p=scoreSide(state,'player'),e=scoreSide(state,'enemy');
      if(p.destroyed!==state.overtimeCrowns.player||e.destroyed!==state.overtimeCrowns.enemy){conclude(state,'sudden-death');return;}
    }
    state.time -= dt;
    if (state.time <= 0) {
      const p = scoreSide(state,'player'), e = scoreSide(state,'enemy');
      if (!state.overtime && p.destroyed === e.destroyed) { state.overtime = true; state.time = state.rulesVersion === 2 ? 120 : 60; state.overtimeCrowns={player:p.destroyed,enemy:e.destroyed};pushEvent(state,'overtime'); }
      else conclude(state, state.overtime ? 'tiebreak' : 'time');
    }
  }

  // Persist the ruleset with the match: an installed update must not alter an
  // interrupted battle's economy or remaining overtime.
  function energyMultiplier(state) {
    if (state.overtime) return state.rulesVersion === 2 && state.time <= 60 ? 3 : 2;
    return Math.max(state.mode === 'frenzy' ? 2 : 1, state.rulesVersion === 2 && state.time <= 60 ? 2 : 1);
  }
  function fixedUpdate(state, dt) {
    const regen = state.rulesVersion === 2 ? energyMultiplier(state) / 2.8 : energyMultiplier(state) * .82;
    state.energy.player = clamp(state.energy.player + regen * dt, 0, MAX_ENERGY);
    state.energy.enemy = clamp(state.energy.enemy + regen * dt, 0, MAX_ENERGY);
    updateUnits(state,dt); updateTowers(state,dt); updateProjectiles(state,dt);
    for (const effect of state.effects) effect.life -= dt;
    state.effects = state.effects.filter((effect) => effect.life > 0);
    state.aiTimer -= dt;
    if (state.aiTimer <= 0) {
      aiStep(state);
      const intelligence = .95 - state.arena * .055;
      state.aiTimer = Math.max(.42, intelligence + random(state) * .65);
    }
    updateClockAndEnd(state,dt);
  }

  function tick(state, elapsed) {
    if (!state || state.phase !== 'playing') return state;
    state.accumulator = clamp((state.accumulator || 0) + clamp(elapsed, 0, .25), 0, .3);
    while (state.accumulator >= STEP && state.phase === 'playing') { fixedUpdate(state,STEP); state.accumulator -= STEP; }
    return state;
  }

  function validateSnapshot(value) {
    if (!value || typeof value !== 'object' || value.version !== VERSION) return false;
    if (value.rulesVersion != null && ![1,2].includes(value.rulesVersion)) return false;
    if (!['classic','frenzy','draft'].includes(value.mode) || !Number.isInteger(value.arena) || value.arena < 0 || value.arena >= arenas.length) return false;
    if (!['playing','ended'].includes(value.phase) || !Number.isFinite(value.time) || value.time < -1 || value.time > 181) return false;
    if (value.overtimeCrowns != null && (!value.overtimeCrowns || !['player','enemy'].every((side)=>Number.isInteger(value.overtimeCrowns[side])&&value.overtimeCrowns[side]>=0&&value.overtimeCrowns[side]<=5))) return false;
    if (!Number.isInteger(value.rng) || !Number.isInteger(value.nextId) || value.nextId < 1) return false;
    if (!value.energy || !['player','enemy'].every((side) => Number.isFinite(value.energy[side]) && value.energy[side] >= 0 && value.energy[side] <= MAX_ENERGY + .01)) return false;
    if (!value.hands || !value.decks || !value.queues || !['player','enemy'].every((side) => {
      const known = (list) => Array.isArray(list) && list.every((id) => !!cardMap[id]);
      return known(value.hands[side]) && value.hands[side].length === 4 && known(value.decks[side]) && value.decks[side].length === 8 && new Set(value.decks[side]).size === 8 && known(value.queues[side]) && value.queues[side].length === 4;
    })) return false;
    if (!Array.isArray(value.units) || value.units.length > 250 || !value.units.every((unit) => unit && typeof unit.id === 'string' && ['player','enemy'].includes(unit.side) && !!cardMap[unit.cardId] && [unit.x,unit.y,unit.hp,unit.maxHp,unit.damage,unit.speed,unit.range,unit.cooldown,unit.attackTimer,unit.radius].every(Number.isFinite) && unit.x >= -100 && unit.x <= WIDTH + 100 && unit.y >= -100 && unit.y <= HEIGHT + 100 && unit.maxHp > 0 && unit.hp >= 0 && unit.hp <= unit.maxHp * 1.01)) return false;
    if (!Array.isArray(value.towers) || value.towers.length !== 6 || !value.towers.every((tower) => tower && typeof tower.id === 'string' && ['player','enemy'].includes(tower.side) && ['base','lane'].includes(tower.type) && (tower.active == null || typeof tower.active === 'boolean') && [tower.x,tower.y,tower.hp,tower.maxHp,tower.range,tower.damage].every(Number.isFinite) && tower.maxHp > 0 && tower.hp >= 0 && tower.hp <= tower.maxHp)) return false;
    if (!Array.isArray(value.projectiles) || value.projectiles.length > 500 || !value.projectiles.every((shot) => shot && typeof shot.id === 'string' && ['player','enemy'].includes(shot.side) && [shot.x,shot.y,shot.speed,shot.damage,shot.life].every(Number.isFinite))) return false;
    if (!Array.isArray(value.effects) || value.effects.length > 100 || !Array.isArray(value.events) || value.events.length > 36) return false;
    if (!value.stats || !['playerPlayed','enemyPlayed','playerDamage','enemyDamage'].every((key) => Number.isFinite(value.stats[key]) && value.stats[key] >= 0)) return false;
    if (value.phase === 'ended' && !['win','loss','tie'].includes(value.result)) return false;
    return true;
  }

  function snapshot(state) { const value = copy(state); value.accumulator = 0; return value; }
  function restore(value) {
    if (!validateSnapshot(value)) throw new Error('Invalid Pennant Duel match snapshot');
    const state = copy(value);
    state.rulesVersion = value.rulesVersion || 1;
    for (const tower of state.towers) {
      tower.recoil = Number.isFinite(tower.recoil) ? tower.recoil : 0;
      tower.hit = Number.isFinite(tower.hit) ? tower.hit : 0;
      tower.heading = Number.isFinite(tower.heading) ? tower.heading : (tower.side === 'player' ? -Math.PI / 2 : Math.PI / 2);
      tower.active = typeof tower.active === 'boolean' ? tower.active : tower.type !== 'base' || tower.hp < tower.maxHp || state.towers.some((otherTower)=>otherTower.side===tower.side&&otherTower.type==='lane'&&!otherTower.alive);
    }
    if(state.overtime&&!state.overtimeCrowns){const p=scoreSide(state,'player'),e=scoreSide(state,'enemy');state.overtimeCrowns={player:p.destroyed,enemy:e.destroyed};}
    for (const unit of state.units) {
      unit.deploy = Number.isFinite(unit.deploy) ? unit.deploy : 0;
      unit.heading = Number.isFinite(unit.heading) ? unit.heading : (unit.side === 'player' ? -Math.PI / 2 : Math.PI / 2);
      unit.walk = Number.isFinite(unit.walk) ? unit.walk : 0;
      unit.attackAnim = Number.isFinite(unit.attackAnim) ? unit.attackAnim : 0;
      unit.hit = Number.isFinite(unit.hit) ? unit.hit : 0;
    }
    return state;
  }

  return { VERSION, WIDTH, HEIGHT, RIVER_TOP, RIVER_BOTTOM, STEP, MAX_ENERGY, LANES, cards, cardMap, arenas, starterDeck, createMatch, playCard, legalPlacement, tick, energyMultiplier, aiStep, scoreSide, snapshot, restore, validateSnapshot };
});
