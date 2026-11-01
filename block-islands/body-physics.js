/* Voxel body collision, shared by the running controller and deterministic tests.
 * Body Y is the feet; touching a voxel face is contact, not penetration.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BlockIslandsBody = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EPSILON = 1e-7, RADIUS = .28, HEIGHT = 1.68;
  function overlaps(getSolid, body) {
    const found = [];
    for (let x = Math.floor(body.x - RADIUS + EPSILON); x <= Math.floor(body.x + RADIUS - EPSILON); x++)
      for (let y = Math.floor(body.y + EPSILON); y <= Math.floor(body.y + HEIGHT - EPSILON); y++)
        for (let z = Math.floor(body.z - RADIUS + EPSILON); z <= Math.floor(body.z + RADIUS - EPSILON); z++)
          if (getSolid(x, y, z)) found.push({ x, y, z });
    return found;
  }
  function collides(getSolid, body) { return overlaps(getSolid, body).length > 0; }
  function supported(getSolid, body) { return collides(getSolid, { ...body, y: body.y - .001 }); }
  // Subdivide long moves so a solid cube cannot be skipped, then stop exactly
  // at its face. No repeated sinking/ejection or frame-dependent .03 nudges.
  function move(getSolid, body, axis, distance) {
    if (!['x', 'y', 'z'].includes(axis) || !Number.isFinite(distance)) return { blocked: false, moved: 0 };
    const start = body[axis], steps = Math.max(1, Math.ceil(Math.abs(distance) / .25)), increment = distance / steps;
    for (let step = 0; step < steps; step++) {
      const candidate = { ...body, [axis]: body[axis] + increment }, hits = overlaps(getSolid, candidate);
      if (hits.length) {
        const extent = axis === 'y' ? (distance > 0 ? HEIGHT : 0) : RADIUS;
        body[axis] = distance > 0 ? Math.min(...hits.map(block => block[axis] - extent)) : Math.max(...hits.map(block => block[axis] + 1 + extent));
        return { blocked: true, moved: body[axis] - start };
      }
      body[axis] = candidate[axis];
    }
    return { blocked: false, moved: body[axis] - start };
  }
  // Repair an already intersecting imported/legacy pose using the actual body
  // footprint. Only intersected layers are crossed, not a distant tree canopy.
  function recover(getSolid, body) {
    let hits = overlaps(getSolid, body), repaired = false;
    while (hits.length) {
      const top = Math.max(...hits.map(block => block.y + 1));
      if (top <= body.y + EPSILON) break;
      body.y = top; repaired = true; hits = overlaps(getSolid, body);
    }
    return repaired;
  }
  return { RADIUS, HEIGHT, collides, supported, move, recover };
}));
