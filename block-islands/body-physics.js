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
  // Sneaking can overhang an edge, but cannot move the entire footprint off
  // its current support. Substeps also protect long/diagonal moves at corners.
  function sneakMove(getSolid, body, dx, dz) {
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.1));
    for(let i=0;i<steps;i++)for(const [axis,delta]of [['x',dx/steps],['z',dz/steps]]){
      if(!delta)continue;const candidate={...body};move(getSolid,candidate,axis,delta);
      if(supported(getSolid,candidate)){body[axis]=candidate[axis];continue;}
      const distance=candidate[axis]-body[axis];let lo=0,hi=1;
      for(let n=0;n<22;n++){const t=(lo+hi)/2;if(supported(getSolid,{...body,[axis]:body[axis]+distance*t}))lo=t;else hi=t;}
      body[axis]+=distance*lo;
    }
    return body;
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
  return { RADIUS, HEIGHT, collides, supported, move, sneakMove, recover };
}));
