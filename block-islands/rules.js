/* Block Islands deterministic campaign rules. Browser and Node compatible. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BlockIslandsRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // v4 gives new expeditions a broader, denser landscape. v1–v3 saves keep
  // their exact generated terrain so an existing camp is never regenerated
  // under a player or silently given a new objective route.
  const LEGACY_SIZE = 18;
  const V3_SIZE = 48;
  const SIZE = 64;
  // Keep the public save envelope at v1.  The phone renderer adds optional,
  // bounded fields below, so existing v1 exports remain valid rather than
  // forcing players to abandon a campaign or Creative profile.
  const SAVE_VERSION = 1;
  const DEFAULT_SEED = 861733;
  const WORLD_VERSION = 4;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const key = (x, y) => x + ',' + y;
  const hash = (seed, x, y) => {
    let n = (seed ^ Math.imul(x + 71, 374761393) ^ Math.imul(y + 29, 668265263)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return (n ^ (n >>> 16)) >>> 0;
  };
  const distance = (a, b, x, y) => Math.hypot(a - x, b - y);
  const sizeForWorldVersion = version => version >= 4 ? SIZE : version === 3 ? V3_SIZE : LEGACY_SIZE;

  const STAGES = [
    { name: 'Mosslight Camp', biome: 'forest', seed: 1147, goal: 'craft-campfire', goalText: 'Mine wood + stone; craft campfire.', hint: 'Mine the marked logs and pale rocks. Open Craft when you have 3 wood and 2 stone.', enemies: 0 },
    { name: 'Quarry Span', biome: 'quarry', seed: 2281, goal: 'bridge', goalText: 'Build four plank bridge tiles across the quarry stream.', hint: 'Mine trees, craft Planks, aim at water beside solid ground, then Place.', enemies: 0 },
    { name: 'Echo Hollow', biome: 'cave', seed: 3413, goal: 'ore-and-pick', goalText: 'Craft a stone pick, then mine four copper ore veins.', hint: 'A stone pick breaks copper. Use the Craft shelf before entering the hollow.', enemies: 1 },
    { name: 'Hearthfield', biome: 'meadow', seed: 4579, goal: 'shelter', goalText: 'Raise six plank blocks for a storm shelter.', hint: 'Place planks one block at a time on solid ground. Keep an eye on the dusk meter.', enemies: 1 },
    { name: 'Floodglass Crossing', biome: 'flood', seed: 5699, goal: 'crossing', goalText: 'Cross the flooded channel and reach the beacon shore.', hint: 'Build a connected plank route; deep water slows you, but the bridge stays in place.', enemies: 2 },
    { name: 'Frostfern Ridge', biome: 'frost', seed: 6827, goal: 'tonic', goalText: 'Make a warming tonic from berries and frost ice.', hint: 'Frost ice needs a stone pick. Drink a tonic from Craft to restore your heart.', enemies: 2 },
    { name: 'Sunken Amber', biome: 'desert', seed: 7949, goal: 'relic', goalText: 'Unearth the amber relic beyond the three sandstone seals.', hint: 'Mine the gold sandstone at the ruin. The relic is an exploration find, not a menu reward.', enemies: 2 },
    { name: 'Deepforge', biome: 'forge', seed: 8089, goal: 'iron-pick', goalText: 'Assemble a forge and an iron pick.', hint: 'Copper and stone make a forge; its heat lets an iron pick cut crystal.', enemies: 3 },
    { name: 'Cinder Watch', biome: 'ember', seed: 9199, goal: 'outpost', goalText: 'Build five basalt blocks beside the lava watch.', hint: 'Craft Basalt from stone and copper. Lava hurts, so build from the safe rim.', enemies: 3 },
    { name: 'Cloudstep Works', biome: 'sky', seed: 10301, goal: 'sky-tower', goalText: 'Build a seven-block sky marker.', hint: 'Stack blocks on the marked stone plinth. You can climb one height at a time.', enemies: 3 },
    { name: 'Willow Ward', biome: 'settlement', seed: 11519, goal: 'defense', goalText: 'Defeat four dusk skitters before they reach the settlement.', hint: 'Aim at a nearby skitter and use Strike. Retreat to high ground between swings.', enemies: 5 },
    { name: 'Aurora Expedition', biome: 'aurora', seed: 12781, goal: 'beacon', goalText: 'Mine three aurora crystals, craft a beacon, and place it on the summit.', hint: 'Only an iron pick frees aurora crystal. A completed beacon ends the expedition.', enemies: 5 }
  ];

  const RECIPES = {
    planks: { label: 'Planks ×3', cost: { wood: 1 }, gives: { plank: 3 } },
    campfire: { label: 'Campfire', cost: { wood: 3, stone: 2 }, gives: { campfire: 1 } },
    stonePick: { label: 'Stone pick', cost: { wood: 2, stone: 4 }, gives: { stonePick: 1 } },
    tonic: { label: 'Warming tonic', cost: { berry: 2, ice: 1 }, gives: { tonic: 1 } },
    forge: { label: 'Deepforge', cost: { ore: 3, stone: 6 }, gives: { forge: 1 } },
    ironPick: { label: 'Iron pick', cost: { ore: 4, wood: 2 }, requires: 'forge', gives: { ironPick: 1 } },
    basalt: { label: 'Basalt ×3', cost: { stone: 2, ore: 1 }, gives: { basalt: 3 } },
    beacon: { label: 'Aurora beacon', cost: { crystal: 3, ore: 2 }, requires: 'ironPick', gives: { beacon: 1 } }
  };

  const MATERIALS = {
    wood: { tool: 0, item: 'wood' }, berry: { tool: 0, item: 'berry' }, dirt: { tool: 0, item: 'dirt' }, sand: { tool: 0, item: 'sand' },
    stone: { tool: 0, item: 'stone' }, ore: { tool: 1, item: 'ore' }, ice: { tool: 1, item: 'ice' },
    crystal: { tool: 2, item: 'crystal' }, basalt: { tool: 2, item: 'basalt' }, relic: { tool: 0, item: 'relic' },
    plank: { tool: 0, item: 'plank' }, beacon: { tool: 0, item: 'beacon' }
  };
  const INVENTORY_KEYS = ['wood', 'stone', 'dirt', 'sand', 'ore', 'ice', 'crystal', 'berry', 'plank', 'basalt', 'beacon', 'tonic', 'campfire', 'stonePick', 'ironPick', 'forge', 'relic'];

  const SPECIAL = {
    0: { '3,4': 'wood', '4,3': 'wood', '5,3': 'wood', '4,5': 'stone', '5,5': 'stone' },
    1: { '4,3': 'wood', '5,3': 'wood', '6,4': 'wood', '7,4': 'wood', '8,5': 'wood' },
    2: { '4,3': 'wood', '5,4': 'wood', '4,5': 'stone', '5,5': 'stone', '6,5': 'stone', '7,5': 'stone', '10,7': 'ore', '11,7': 'ore', '12,8': 'ore', '12,9': 'ore' },
    3: { '4,3': 'wood', '5,3': 'wood', '6,4': 'wood', '7,4': 'wood' },
    4: { '4,3': 'wood', '5,4': 'wood', '6,4': 'wood', '7,5': 'wood', '15,14': 'crystal' },
    5: { '4,3': 'berry', '5,3': 'berry', '7,5': 'ice', '8,5': 'ice' },
    6: { '5,3': 'sand', '6,3': 'sand', '7,3': 'sand', '14,13': 'relic' },
    7: { '4,3': 'wood', '5,4': 'wood', '6,5': 'stone', '7,5': 'stone', '8,5': 'stone', '7,6': 'stone', '8,6': 'stone', '9,6': 'stone', '9,7': 'ore', '10,8': 'ore', '11,8': 'ore', '12,9': 'ore', '13,9': 'ore', '12,10': 'ore', '13,10': 'ore' },
    8: { '4,3': 'stone', '5,3': 'stone', '6,4': 'stone', '7,4': 'stone', '8,5': 'ore', '9,5': 'ore' },
    9: { '4,3': 'wood', '5,3': 'wood', '6,3': 'wood', '7,4': 'wood', '8,4': 'wood', '10,10': 'stone' },
    10: { '7,7': 'wood', '9,8': 'wood', '12,10': 'wood' },
    11: { '5,3': 'crystal', '6,4': 'crystal', '7,4': 'crystal', '8,5': 'ore', '9,5': 'ore', '14,14': 'crystal' }
  };
  // v4 starts further into the wide Mosslight meadow. The original authored
  // sites above remain intact for old journeys; these extra visible logs and
  // pale rocks provide new players a central, legal tutorial route.
  const V4_STARTER = { '8,12': 'wood', '10,11': 'wood', '12,12': 'wood', '8,8': 'stone', '9,8': 'stone' };
  const GOAL_SITES = {
    6: { type: 'seals', cells: [[5, 3], [6, 3], [7, 3]], relic: [14, 13] },
    9: { type: 'marker', cell: [10, 10], blocks: 7 },
    11: { type: 'summit', cell: [14, 14] }
  };

  function terrainFor(stageIndex, x, y, chosenSeed, worldVersion) {
    const stage = STAGES[stageIndex];
    const seedOffset = Number.isInteger(chosenSeed) ? (chosenSeed ^ DEFAULT_SEED) : 0;
    const n = hash(stage.seed ^ seedOffset, x, y);
    let h = 1 + (n % 2);
    // Version two keeps the established seed/resources but gives new
    // first-person journeys a navigable camp and sparse elevation.  Missing
    // version fields are deliberately v1 so released saves never regenerate
    // beneath their existing edits.
    if (worldVersion >= 2 && worldVersion < 3) {
      h = 1 + ((n >>> 4) % 11 === 0 ? 1 : 0);
      if (stageIndex === 0 && x <= 7 && y <= 7) h = 1;
      if (stageIndex >= 5 && n % 13 === 0) h = Math.min(3, h + 1);
    }
    let surface = stage.biome === 'desert' ? 'sand' : stage.biome === 'frost' ? 'ice' : stage.biome === 'ember' ? 'basalt' : 'dirt';
    let water = false;
    let lava = false;
    if (stage.biome === 'quarry' && x === 9 && y > 1 && y < 16) { h = 0; water = true; }
    if (stage.biome === 'flood' && x >= 8 && x <= 11 && y > 0 && y < 17) { h = 0; water = true; }
    if (stage.biome === 'ember' && x >= 9 && x <= 11 && y >= 6 && y <= 14) { h = 0; lava = true; }
    if (stage.biome === 'sky' && (x < 4 || y > 14) && n % 3 === 0) { h = 0; water = true; }
    const fixed = SPECIAL[stageIndex] && SPECIAL[stageIndex][key(x, y)];
    let resource = fixed || null;
    if (!resource && !water && !lava) {
      const roll = n % 31;
      if (roll === 0) resource = 'wood';
      else if (roll === 1) resource = 'stone';
      else if (roll === 2 && stageIndex >= 2) resource = 'ore';
      else if (roll === 3 && stageIndex >= 5) resource = stageIndex >= 11 ? 'crystal' : 'berry';
    }
    if (stage.biome === 'settlement' && x > 11 && y > 11) resource = null;
    if (worldVersion >= 3) {
      // Wide, coherent terrain uses deterministic low-frequency ridges plus
      // small local variation. The authored sites above remain the campaign's
      // legal starting and goal resources.
      const ridge = Math.sin((x + (stage.seed & 15)) * .19) * 1.05 + Math.cos((y - (stage.seed & 11)) * .16) * .85 + Math.sin((x + y) * .095) * .7;
      const coarse = ((hash(stage.seed ^ seedOffset, Math.floor(x / 3), Math.floor(y / 3)) >>> 6) % 5 - 2) * .42;
      h = clamp(3 + Math.round(ridge + coarse), 1, 7);
      surface = stage.biome === 'desert' ? 'sand' : stage.biome === 'frost' ? 'ice' : stage.biome === 'ember' ? 'basalt' : 'grass';
      // The opening frames real harvestable trees and stone beyond an open
      // clearing, instead of a camera pointed at a wall of foliage.
      if (stageIndex === 0 && x <= 9 && y <= 9) h = 2;
      // A quiet pond gives Mosslight its first visible water landmark; it is
      // beyond the starter objectives so it never replaces a required block.
      if (stage.biome === 'forest' && ((x - 28) * (x - 28) + (y - 17) * (y - 17) < 16 || (x > 27 && x < 34 && y === 17))) { h = 0; water = true; }
      if (stage.biome === 'quarry' && (x === 9 || x === 28) && y > 1 && y < 46) { h = 0; water = true; }
      if (stage.biome === 'flood' && ((x >= 8 && x <= 11) || (x >= 27 && x <= 31)) && y > 0 && y < 47) { h = 0; water = true; }
      if (stage.biome === 'ember' && ((x >= 9 && x <= 11 && y >= 6 && y <= 14) || (x >= 29 && x <= 33 && y >= 9 && y <= 39))) { h = 0; lava = true; }
      if (stage.biome === 'sky' && ((x < 4 || y > 42) && n % 3 === 0)) { h = 0; water = true; }
      if (water || lava) resource = null;
      if (stage.biome === 'forest' || stage.biome === 'meadow' || stage.biome === 'settlement') {
        const grove = hash(stage.seed ^ seedOffset ^ 0x7f4a7c15, x, y) % 23;
        if (!water && !lava && !resource && grove === 0) resource = 'wood';
        else if (!water && !lava && !resource && grove === 1) resource = 'berry';
      }
      if (!water && !lava && !resource && stageIndex >= 2 && hash(stage.seed ^ 0x9e3779b9, x, y) % 97 === 0) resource = 'ore';
      if (stage.biome === 'settlement' && x > 34 && y > 34) resource = null;
      // Mosslight's first clearing deliberately contains only the authored
      // starter nodes. This prevents a seeded stray log from occluding the
      // short tutorial route while the surrounding wide forest stays varied.
      if (stageIndex === 0 && x < 12 && y < 10 && !fixed) resource = null;
    }
    if (worldVersion >= 4) {
      // The fourth generator is intentionally a new world version: broad
      // low-frequency terrain gives a real horizon and distinct landmarks,
      // while v1–v3 worlds retain their exact terrain and sparse edits.
      const broad = Math.sin((x + (stage.seed & 31)) * .115) * 1.45 + Math.cos((y - (stage.seed & 23)) * .10) * 1.2;
      const rolling = Math.sin((x + y) * .052) * .85 + Math.cos((x - y) * .071) * .55;
      const patch = ((hash(stage.seed ^ seedOffset ^ 0x5a1d43, Math.floor(x / 4), Math.floor(y / 4)) >>> 5) % 5 - 2) * .35;
      h = clamp(3 + Math.round(broad + rolling + patch), 1, 8);
      surface = stage.biome === 'desert' ? 'sand' : stage.biome === 'frost' ? 'ice' : stage.biome === 'ember' ? 'basalt' : 'grass';
      water = false; lava = false;
      // A protected opening meadow preserves the same five legal starter
      // sites, but opens a sightline to the forest and water landmark.
      if (stageIndex === 0 && x < 22 && y < 16) h = 2;
      // A small distant plateau gives the first island a visible shelter
      // landmark without putting its roof or canopy in the opening camera.
      if (stageIndex === 0 && x >= 22 && x <= 27 && y >= 9 && y <= 14) h = 3;
      if (stage.biome === 'forest') {
        const pond = ((x - 31) * (x - 31)) / 54 + ((y - 19) * (y - 19)) / 22 < 1;
        const creek = x > 33 && y > 17 && y < 21;
        if (pond || creek) { h = 0; water = true; }
      }
      if (stage.biome === 'quarry' && ((x >= 10 && x <= 12) || (x >= 38 && x <= 40)) && y > 1 && y < 62) { h = 0; water = true; }
      if (stage.biome === 'flood' && ((x >= 9 && x <= 14) || (x >= 36 && x <= 42)) && y > 0 && y < 63) { h = 0; water = true; }
      if (stage.biome === 'ember' && ((x >= 9 && x <= 13 && y >= 5 && y <= 18) || (x >= 36 && x <= 41 && y >= 10 && y <= 52))) { h = 0; lava = true; }
      if (stage.biome === 'sky' && ((x < 5 || y > 58) && n % 3 === 0)) { h = 0; water = true; }
      if (water || lava) resource = null;
      if (stage.biome === 'forest' || stage.biome === 'meadow' || stage.biome === 'settlement' || stage.biome === 'frost') {
        const grove = hash(stage.seed ^ seedOffset ^ 0x7f4a7c15, x, y) % 19;
        if (!water && !lava && !resource && grove === 0) resource = 'wood';
        else if (!water && !lava && !resource && grove === 1) resource = 'berry';
      }
      if (!water && !lava && !resource && stageIndex >= 2 && hash(stage.seed ^ 0x9e3779b9, x, y) % 79 === 0) resource = 'ore';
      if (stage.biome === 'settlement' && x > 46 && y > 46) resource = null;
      if (stageIndex === 0 && x < 22 && y < 16 && !fixed) resource = V4_STARTER[key(x, y)] || null;
      if (stageIndex === 0 && x >= 22 && x <= 27 && y >= 9 && y <= 14) resource = null;
    }
    return { x, y, h, surface, resource, water, lava, bridge: false, extra: [] };
  }

  function makeWorld(stageIndex, edits, chosenSeed, worldVersion) {
    const version = worldVersion || 1, size = sizeForWorldVersion(version), cells = new Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const cell = terrainFor(stageIndex, x, y, chosenSeed, version);
      const edit = edits && edits[key(x, y)];
      if (edit) {
        if (Number.isInteger(edit.h)) cell.h = clamp(edit.h, 0, 12);
        if (typeof edit.resource === 'string' || edit.resource === null) cell.resource = edit.resource;
        if (Array.isArray(edit.extra)) cell.extra = edit.extra.filter(v => ['dirt', 'plank', 'stone', 'basalt', 'beacon'].includes(v)).slice(0, 12);
        cell.bridge = !!edit.bridge;
      }
      cells[y * size + x] = cell;
    }
    return { stageIndex, size, worldVersion: version, cells };
  }
  function getCell(world, x, y) { const size = world && Number.isInteger(world.size) ? world.size : LEGACY_SIZE; return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size ? world.cells[y * size + x] : null; }
  function topHeight(cell) { return cell.h + cell.extra.length + (cell.bridge ? 1 : 0); }
  function cellMaterial(cell) {
    if (cell.resource) return cell.resource;
    if (cell.extra.length) return cell.extra[cell.extra.length - 1];
    if (cell.bridge) return 'plank';
    return cell.surface === 'sand' ? 'sand' : cell.surface === 'ice' ? 'ice' : cell.surface === 'basalt' ? 'basalt' : cell.h > 1 ? 'stone' : 'dirt';
  }
  function persistCell(state, cell) {
    state.edits[key(cell.x, cell.y)] = { h: cell.h, resource: cell.resource, bridge: cell.bridge, extra: cell.extra.slice() };
  }
  function emptyInventory() { const inventory = {}; for (const name of INVENTORY_KEYS) inventory[name] = 0; return inventory; }
  function createGame(seed) {
    const state = {
      version: SAVE_VERSION, worldVersion: WORLD_VERSION, seed: Number.isInteger(seed) ? seed : DEFAULT_SEED, stage: 0, unlocked: 0, completed: [], stageComplete: false,
      inventory: emptyInventory(), crafted: {}, placed: {}, mined: {}, bridgeBuilt: 0, tallest: 0, enemiesDefeated: 0,
      minedSites: {}, siteStacks: {}, placedSites: {}, player: { x: 2.5, y: 3.5, health: 8, maxHealth: 8 }, edits: {},
      // `pose` and `voxelEdits` are deliberately optional v1 additions.  The
      // first-person controller derives a safe pose for old saves and stores
      // only changed sparse cubes, never a per-frame terrain snapshot.
      pose: null, voxelEdits: {}, time: 0, enemies: [], creative: false, message: 'Welcome to Mosslight Camp.'
    };
    startStage(state, 0, false);
    return state;
  }
  function startStage(state, stageIndex, preserveEdits) {
    if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= STAGES.length) return false;
    state.stage = stageIndex;
    state.stageComplete = false;
    state.edits = preserveEdits ? state.edits || {} : {};
    state.placed = {};
    state.mined = {};
    state.bridgeBuilt = 0;
    state.tallest = 0;
    state.enemiesDefeated = 0;
    state.minedSites = {};
    state.siteStacks = {};
    state.placedSites = {};
    state.player = { x: 2.5, y: 3.5, health: 8, maxHealth: 8 };
    state.pose = null;
    state.voxelEdits = {};
    state.enemies = [];
    const count = STAGES[stageIndex].enemies;
    for (let i = 0; i < count; i++) state.enemies.push({ id: stageIndex + '-' + i, x: 13 + (i % 3), y: 12 + Math.floor(i / 3), health: 3 + Math.floor(stageIndex / 4), cooldown: 0, alive: true });
    state.message = STAGES[stageIndex].hint;
    return true;
  }
  function toolLevel(state) { return state.creative || state.inventory.ironPick > 0 ? 2 : state.inventory.stonePick > 0 ? 1 : 0; }
  function has(state, item, count) { return state.creative || (state.inventory[item] || 0) >= count; }
  function change(state, item, amount) { state.inventory[item] = Math.max(0, (state.inventory[item] || 0) + amount); }
  // The first-person ray is bounded at five blocks. Keep rule reach aligned
  // with that visible target range so a player never holds Mine on a valid
  // crosshair block only to be told it is out of reach.
  function inReach(state, x, y, reach) { return distance(state.player.x, state.player.y, x + .5, y + .5) <= (reach || 4.8); }

  function mine(state, world, x, y) {
    state.minedSites = state.minedSites && typeof state.minedSites === 'object' ? state.minedSites : {};
    state.siteStacks = state.siteStacks && typeof state.siteStacks === 'object' ? state.siteStacks : {};
    state.placedSites = state.placedSites && typeof state.placedSites === 'object' ? state.placedSites : {};
    state.placed = state.placed && typeof state.placed === 'object' ? state.placed : {};
    const cell = getCell(world, x, y);
    if (!cell) return { ok: false, reason: 'That is beyond the island.' };
    if (!inReach(state, x, y)) return { ok: false, reason: 'Move closer to mine that block.' };
    const material = cellMaterial(cell);
    const definition = MATERIALS[material];
    if (!definition) return { ok: false, reason: 'Nothing useful to mine there.' };
    if (toolLevel(state) < definition.tool) return { ok: false, reason: definition.tool === 1 ? 'A stone pick is needed here.' : 'An iron pick is needed here.' };
    const siteKey = key(x, y);
    if (cell.resource) {
      cell.resource = null;
      state.minedSites[siteKey] = material;
    } else if (cell.extra.length) {
      cell.extra.pop();
      state.placed[material] = Math.max(0, (state.placed[material] || 0) - 1);
      if (material === 'beacon' && state.placedSites.beacon === siteKey) delete state.placedSites.beacon;
    } else if (cell.bridge) {
      cell.bridge = false;
      state.bridgeBuilt = Math.max(0, state.bridgeBuilt - 1);
      state.placed.plank = Math.max(0, (state.placed.plank || 0) - 1);
    } else if (cell.h > 0) cell.h--;
    else return { ok: false, reason: 'Water and lava cannot be mined.' };
    state.siteStacks[siteKey] = cell.extra.length;
    state.tallest = world.cells.reduce((highest, candidate) => Math.max(highest, topHeight(candidate)), 0);
    change(state, definition.item, 1);
    state.mined[definition.item] = (state.mined[definition.item] || 0) + 1;
    persistCell(state, cell);
    state.message = '+1 ' + definition.item + '.';
    checkGoal(state);
    return { ok: true, item: definition.item };
  }
  function hasBridgeSupport(world, cell) {
    for (const pair of [[cell.x - 1, cell.y], [cell.x + 1, cell.y], [cell.x, cell.y - 1], [cell.x, cell.y + 1]]) {
      const nearby = getCell(world, pair[0], pair[1]);
      if (nearby && (nearby.h > 0 || nearby.bridge)) return true;
    }
    return false;
  }
  function place(state, world, x, y, item) {
    state.siteStacks = state.siteStacks && typeof state.siteStacks === 'object' ? state.siteStacks : {};
    state.placedSites = state.placedSites && typeof state.placedSites === 'object' ? state.placedSites : {};
    state.placed = state.placed && typeof state.placed === 'object' ? state.placed : {};
    const cell = getCell(world, x, y);
    const allowed = ['dirt', 'plank', 'stone', 'basalt', 'beacon'];
    if (!allowed.includes(item)) return { ok: false, reason: 'Select a building block first.' };
    if (!cell || !inReach(state, x, y)) return { ok: false, reason: 'Move closer to place there.' };
    if (!has(state, item, 1)) return { ok: false, reason: 'You do not have that block.' };
    if (item === 'plank' && cell.water && !cell.bridge) {
      if (!hasBridgeSupport(world, cell)) return { ok: false, reason: 'A bridge needs a solid bank or another bridge.' };
      cell.bridge = true;
      state.bridgeBuilt++;
    } else {
      if ((cell.water || cell.lava) && !cell.bridge) return { ok: false, reason: cell.lava ? 'Lava needs a safe bridge first.' : 'Use planks to bridge water.' };
      if (cell.extra.length >= 12) return { ok: false, reason: 'That stack is already as high as it can be.' };
      cell.extra.push(item);
      state.tallest = Math.max(state.tallest, topHeight(cell));
    }
    if (!state.creative) change(state, item, -1);
    state.placed[item] = (state.placed[item] || 0) + 1;
    const siteKey = key(x, y);
    state.siteStacks[siteKey] = cell.extra.length;
    if (item === 'beacon') state.placedSites.beacon = siteKey;
    persistCell(state, cell);
    state.message = item === 'beacon' ? 'The beacon hums with aurora light.' : 'Placed ' + item + '.';
    checkGoal(state);
    return { ok: true };
  }
  function craft(state, recipeName) {
    const recipe = RECIPES[recipeName];
    if (!recipe) return { ok: false, reason: 'Unknown recipe.' };
    if (recipe.requires && !has(state, recipe.requires, 1)) return { ok: false, reason: 'Craft a ' + recipe.requires + ' first.' };
    for (const item in recipe.cost) if (!has(state, item, recipe.cost[item])) return { ok: false, reason: 'Need more ' + item + '.' };
    if (!state.creative) for (const item in recipe.cost) change(state, item, -recipe.cost[item]);
    for (const item in recipe.gives) change(state, item, recipe.gives[item]);
    state.crafted[recipeName] = (state.crafted[recipeName] || 0) + 1;
    if (recipeName === 'tonic') { change(state, 'tonic', -1); state.player.health = Math.min(state.player.maxHealth, state.player.health + 4); }
    state.message = 'Crafted ' + recipe.label + '.';
    checkGoal(state);
    return { ok: true, recipe: recipeName };
  }
  function move(state, world, dx, dy) {
    const size = world && Number.isInteger(world.size) ? world.size : sizeForWorldVersion(state.worldVersion);
    const nextX = clamp(state.player.x + dx, .15, size - .15);
    const nextY = clamp(state.player.y + dy, .15, size - .15);
    const here = getCell(world, Math.floor(state.player.x), Math.floor(state.player.y));
    const next = getCell(world, Math.floor(nextX), Math.floor(nextY));
    if (!next) return { ok: false, reason: 'Island edge.' };
    if (Math.abs(topHeight(next) - topHeight(here)) > 1) return { ok: false, reason: 'That ledge is too high. Build a step.' };
    state.player.x = nextX; state.player.y = nextY;
    if (next.lava && !next.bridge) state.player.health = Math.max(0, state.player.health - .65);
    if (next.water && !next.bridge) state.player.health = Math.max(0, state.player.health - .05);
    checkGoal(state);
    return { ok: true, water: next.water && !next.bridge };
  }
  function attack(state, x, y) {
    let victim = null;
    for (const enemy of state.enemies) if (enemy.alive && distance(state.player.x, state.player.y, enemy.x, enemy.y) < 3.1 && (!victim || distance(enemy.x, enemy.y, x, y) < distance(victim.x, victim.y, x, y))) victim = enemy;
    if (!victim) return { ok: false, reason: 'No skitter is within striking reach.' };
    victim.health -= toolLevel(state) === 2 ? 3 : toolLevel(state) === 1 ? 2 : 1;
    if (victim.health <= 0) { victim.alive = false; state.enemiesDefeated++; state.message = 'Skitter dispersed.'; checkGoal(state); return { ok: true, defeated: true }; }
    state.message = 'Skitter staggered.';
    return { ok: true };
  }
  function tick(state, world, seconds) {
    const dt = clamp(seconds || 0, 0, .2);
    state.time += dt;
    let damaged = false;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const dx = state.player.x - enemy.x, dy = state.player.y - enemy.y, d = Math.hypot(dx, dy) || 1;
      if (d > 1.1) { enemy.x += dx / d * dt * .38; enemy.y += dy / d * dt * .38; }
      else { enemy.cooldown -= dt; if (enemy.cooldown <= 0) { state.player.health = Math.max(0, state.player.health - .55); enemy.cooldown = 1.1; damaged = true; } }
    }
    if (state.player.health <= 0) { state.message = 'You were carried back to camp. Try the stage again.'; return { defeated: true, damaged }; }
    return { defeated: false, damaged };
  }
  function retryStage(state) {
    const retained = emptyInventory();
    for (const name of INVENTORY_KEYS) retained[name] = name === 'stonePick' || name === 'ironPick' || name === 'forge' ? state.inventory[name] : Math.floor(state.inventory[name] * .7);
    state.inventory = retained;
    startStage(state, state.stage, false);
  }
  function goalComplete(state) {
    switch (STAGES[state.stage].goal) {
      case 'craft-campfire': return (state.crafted.campfire || 0) >= 1;
      case 'bridge': return state.bridgeBuilt >= 4;
      case 'ore-and-pick': return (state.crafted.stonePick || 0) >= 1 && (state.mined.ore || 0) >= 4;
      case 'shelter': return (state.placed.plank || 0) >= 6;
      case 'crossing': return state.bridgeBuilt >= 4 && state.player.x >= 14 && state.player.y >= 12;
      case 'tonic': return (state.crafted.tonic || 0) >= 1;
      case 'relic': return (state.inventory.relic || 0) >= 1 && GOAL_SITES[6].cells.every(pair => (state.minedSites || {})[key(pair[0], pair[1])] === 'sand');
      case 'iron-pick': return (state.crafted.forge || 0) >= 1 && (state.crafted.ironPick || 0) >= 1;
      case 'outpost': return (state.placed.basalt || 0) >= 5;
      case 'sky-tower': return ((state.siteStacks || {})[key(GOAL_SITES[9].cell[0], GOAL_SITES[9].cell[1])] || 0) >= GOAL_SITES[9].blocks;
      case 'defense': return state.enemiesDefeated >= 4;
      case 'beacon': return (state.mined.crystal || 0) >= 3 && (state.crafted.beacon || 0) >= 1 && (state.placed.beacon || 0) >= 1 && (state.placedSites || {}).beacon === key(GOAL_SITES[11].cell[0], GOAL_SITES[11].cell[1]);
      default: return false;
    }
  }
  function checkGoal(state) {
    if (state.stageComplete || !goalComplete(state)) return false;
    state.stageComplete = true;
    if (!state.completed.includes(state.stage)) state.completed.push(state.stage);
    state.unlocked = Math.max(state.unlocked, Math.min(STAGES.length - 1, state.stage + 1));
    state.message = state.stage === STAGES.length - 1 ? 'Aurora Expedition complete!' : 'Stage complete! The next island is unlocked.';
    return true;
  }
  function isValidState(value) {
    if (!value || typeof value !== 'object' || value.version !== SAVE_VERSION || !Number.isInteger(value.stage) || value.stage < 0 || value.stage >= STAGES.length) return false;
    if (!value.player || !Number.isFinite(value.player.x) || !Number.isFinite(value.player.y) || !Number.isFinite(value.player.health)) return false;
    if (!value.inventory || typeof value.inventory !== 'object' || !value.edits || typeof value.edits !== 'object') return false;
    for (const item of INVENTORY_KEYS) if (!Number.isFinite(value.inventory[item] || 0) || (value.inventory[item] || 0) < 0 || (value.inventory[item] || 0) > 9999) return false;
    return true;
  }
  function voxelKey(x, y, z) { return x + ',' + y + ',' + z; }
  function validVoxel(value, size) {
    if (!value || typeof value !== 'object') return false;
    const limit = Number.isInteger(size) ? size : SIZE;
    return Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.z) && value.x >= 0 && value.x < limit && value.z >= 0 && value.z < limit && value.y >= 0 && value.y <= 24 && (value.material === null || ['dirt', 'plank', 'stone', 'basalt', 'beacon'].includes(value.material));
  }
  function setVoxelEdit(state, x, y, z, material) {
    const value = { x, y, z, material };
    if (!validVoxel(value, sizeForWorldVersion(state && state.worldVersion))) return false;
    state.voxelEdits = state.voxelEdits && typeof state.voxelEdits === 'object' ? state.voxelEdits : {};
    const keys = Object.keys(state.voxelEdits);
    const name = voxelKey(x, y, z);
    if (!Object.prototype.hasOwnProperty.call(state.voxelEdits, name) && keys.length >= 768) return false;
    state.voxelEdits[name] = material;
    return true;
  }
  function sanitizeState(value) {
    if (!isValidState(value)) return null;
    const state = JSON.parse(JSON.stringify(value));
    state.worldVersion = [1, 2, 3, WORLD_VERSION].includes(state.worldVersion) ? state.worldVersion : 1;
    const size = sizeForWorldVersion(state.worldVersion);
    state.stage = clamp(state.stage, 0, STAGES.length - 1);
    state.unlocked = clamp(Number.isInteger(state.unlocked) ? state.unlocked : 0, 0, STAGES.length - 1);
    state.completed = Array.isArray(state.completed) ? [...new Set(state.completed.filter(n => Number.isInteger(n) && n >= 0 && n < STAGES.length))] : [];
    state.enemies = Array.isArray(state.enemies) ? state.enemies.slice(0, 10).filter(e => e && Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.health)).map(e => ({ id: String(e.id || 'enemy').slice(0, 30), x: clamp(e.x, 0, size), y: clamp(e.y, 0, size), health: clamp(e.health, 0, 20), cooldown: clamp(Number(e.cooldown) || 0, 0, 10), alive: e.alive !== false })) : [];
    state.player.x = clamp(state.player.x, .15, size - .15); state.player.y = clamp(state.player.y, .15, size - .15); state.player.health = clamp(state.player.health, 0, 20); state.player.maxHealth = clamp(Number(state.player.maxHealth) || 8, 1, 20);
    state.time = clamp(Number(state.time) || 0, 0, 10000000);
    state.seed = Number.isInteger(state.seed) ? state.seed : DEFAULT_SEED;
    state.creative = state.creative === true;
    state.stageComplete = state.stageComplete === true;
    state.bridgeBuilt = clamp(Math.floor(Number(state.bridgeBuilt) || 0), 0, size * size);
    state.tallest = clamp(Math.floor(Number(state.tallest) || 0), 0, 24);
    state.enemiesDefeated = clamp(Math.floor(Number(state.enemiesDefeated) || 0), 0, 99);
    state.message = typeof state.message === 'string' ? state.message.slice(0, 240) : STAGES[state.stage].hint;
    for (const item of INVENTORY_KEYS) state.inventory[item] = clamp(Math.floor(Number(state.inventory[item]) || 0), 0, 9999);
    const cleanedEdits = {};
    for (const k of Object.keys(state.edits).slice(0, size * size)) if (/^\d+,\d+$/.test(k)) {
      const [x, y] = k.split(',').map(Number); const edit = state.edits[k];
      if (x >= 0 && x < size && y >= 0 && y < size && edit && typeof edit === 'object') cleanedEdits[k] = { h: clamp(Math.floor(Number(edit.h) || 0), 0, 12), resource: typeof edit.resource === 'string' && MATERIALS[edit.resource] ? edit.resource : null, bridge: !!edit.bridge, extra: Array.isArray(edit.extra) ? edit.extra.filter(v => ['dirt', 'plank', 'stone', 'basalt', 'beacon'].includes(v)).slice(0, 12) : [] };
    }
    state.edits = cleanedEdits;
    const cleanVoxelEdits = {};
    if (state.voxelEdits && typeof state.voxelEdits === 'object') {
      for (const name of Object.keys(state.voxelEdits).slice(0, 768)) {
        const parts = name.split(',').map(Number);
        const value = { x: parts[0], y: parts[1], z: parts[2], material: state.voxelEdits[name] };
        if (parts.length === 3 && validVoxel(value, size)) cleanVoxelEdits[voxelKey(value.x, value.y, value.z)] = value.material;
      }
    }
    state.voxelEdits = cleanVoxelEdits;
    if (state.pose && typeof state.pose === 'object' && Number.isFinite(state.pose.x) && Number.isFinite(state.pose.y) && Number.isFinite(state.pose.z) && Number.isFinite(state.pose.yaw) && Number.isFinite(state.pose.pitch)) {
      state.pose = { x: clamp(Number(state.pose.x), .2, size - .2), y: clamp(Number(state.pose.y), .2, 28), z: clamp(Number(state.pose.z), .2, size - .2), yaw: clamp(Number(state.pose.yaw), -Math.PI * 8, Math.PI * 8), pitch: clamp(Number(state.pose.pitch), -1.48, 1.48) };
    } else state.pose = null;
    const cleanCounts = (source, allowed) => {
      const result = {};
      if (!source || typeof source !== 'object') return result;
      for (const name of allowed) if (Number.isFinite(source[name]) && source[name] >= 0) result[name] = clamp(Math.floor(source[name]), 0, 9999);
      return result;
    };
    state.crafted = cleanCounts(state.crafted, Object.keys(RECIPES));
    state.placed = cleanCounts(state.placed, ['dirt', 'plank', 'stone', 'basalt', 'beacon']);
    state.mined = cleanCounts(state.mined, INVENTORY_KEYS);
    const validSite = site => /^\d+,\d+$/.test(site) && site.split(',').map(Number).every(n => n >= 0 && n < size);
    const minedSites = {};
    if (state.minedSites && typeof state.minedSites === 'object') for (const site of Object.keys(state.minedSites).slice(0, size * size)) if (validSite(site) && MATERIALS[state.minedSites[site]]) minedSites[site] = state.minedSites[site];
    state.minedSites = minedSites;
    const siteStacks = {};
    if (state.siteStacks && typeof state.siteStacks === 'object') for (const site of Object.keys(state.siteStacks).slice(0, size * size)) if (validSite(site) && Number.isFinite(state.siteStacks[site])) siteStacks[site] = clamp(Math.floor(state.siteStacks[site]), 0, 12);
    state.siteStacks = siteStacks;
    state.placedSites = state.placedSites && validSite(state.placedSites.beacon) ? { beacon: state.placedSites.beacon } : {};
    return state;
  }
  function summary(state) { return { stage: state.stage, stageName: STAGES[state.stage].name, unlocked: state.unlocked, complete: !!state.stageComplete, health: Math.ceil(state.player.health), inventory: Object.assign({}, state.inventory), enemies: state.enemies.filter(e => e.alive).length }; }

  return { SIZE, V3_SIZE, LEGACY_SIZE, SAVE_VERSION, WORLD_VERSION, DEFAULT_SEED, STAGES, RECIPES, INVENTORY_KEYS, GOAL_SITES, createGame, startStage, makeWorld, getCell, topHeight, cellMaterial, toolLevel, mine, place, craft, move, attack, tick, retryStage, goalComplete, checkGoal, isValidState, sanitizeState, setVoxelEdit, validVoxel, voxelKey, summary, hash, sizeForWorldVersion };
});
