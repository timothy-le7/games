/* Block Islands' self-contained first-person voxel view.
 * World coordinates are [x, y, z] with Y up; yaw 0 looks toward -Z.
 * The module is deliberately independent of the rules/controller layer.
 */
(function universalVoxelView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BlockIslandsVoxel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildVoxelView() {
  'use strict';

  // All scenery is procedural and local. These small material variants give
  // grassland, trees, and interaction feedback readable depth without an
  // external texture pack or a per-frame canvas upload.
  const MATERIALS = ['grass', 'dirt', 'stone', 'sand', 'wood', 'leaves', 'plank', 'ore', 'ice', 'crystal', 'basalt', 'beacon', 'water', 'lava', 'shadow', 'fern', 'flower', 'moss', 'skin', 'cloth', 'scarf', 'leather'];
  const MATERIAL_INDEX = Object.freeze(MATERIALS.reduce((all, name, index) => { all[name] = index; return all; }, Object.create(null)));
  const MAX_RENDER_PIXELS = 5_500_000;
  const EPSILON = 1e-9;
  const FACE_INFO = [
    { normal: [0, 1, 0], offset: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
    { normal: [0, -1, 0], offset: [0, -1, 0], corners: [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]] },
    { normal: [1, 0, 0], offset: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
    { normal: [-1, 0, 0], offset: [-1, 0, 0], corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
    { normal: [0, 0, 1], offset: [0, 0, 1], corners: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
    { normal: [0, 0, -1], offset: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] }
  ];
  const QUAD_ORDER = [0, 1, 2, 0, 2, 3];

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const cellKey = (x, y, z) => x + ',' + y + ',' + z;
  const length = vector => Math.hypot(vector[0], vector[1], vector[2]);
  const normalize = vector => {
    const size = length(vector);
    return size > EPSILON ? [vector[0] / size, vector[1] / size, vector[2] / size] : [0, 0, 0];
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  /** Returns a normalized camera-forward vector. Yaw 0 faces -Z, positive pitch looks up. */
  function forward(yaw, pitch) {
    const safeYaw = Number.isFinite(yaw) ? yaw : 0;
    const safePitch = clamp(Number.isFinite(pitch) ? pitch : 0, -Math.PI / 2, Math.PI / 2);
    const flat = Math.cos(safePitch);
    return [-Math.sin(safeYaw) * flat, Math.sin(safePitch), -Math.cos(safeYaw) * flat];
  }

  /**
   * Exact bounded voxel DDA. Cubes are half-open [n,n+1); a ray leaving an
   * integer boundary steps into the cell in its travel direction at distance 0.
   */
  function raycast(getBlock, origin, direction, maxDistance = 5) {
    if (typeof getBlock !== 'function' || !Array.isArray(origin) || !Array.isArray(direction)) return null;
    const limit = Number.isFinite(maxDistance) ? Math.max(0, maxDistance) : 5;
    const finiteNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const dir = normalize([finiteNumber(direction[0]), finiteNumber(direction[1]), finiteNumber(direction[2])]);
    if (length(dir) < EPSILON) return null;
    const point = [finiteNumber(origin[0]), finiteNumber(origin[1]), finiteNumber(origin[2])];
    const block = [Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2])];
    const initial = getBlock(block[0], block[1], block[2]);
    if (initial) return { block, normal: [0, 0, 0], adjacent: block.slice(), distance: 0, material: initial };

    const step = dir.map(component => component > EPSILON ? 1 : component < -EPSILON ? -1 : 0);
    const tDelta = dir.map(component => Math.abs(component) > EPSILON ? Math.abs(1 / component) : Infinity);
    const tMax = dir.map((component, axis) => {
      if (!step[axis]) return Infinity;
      const boundary = step[axis] > 0 ? Math.floor(point[axis]) + 1 : Math.floor(point[axis]);
      return (boundary - point[axis]) / component;
    });

    while (true) {
      const nextDistance = Math.min(tMax[0], tMax[1], tMax[2]);
      if (!Number.isFinite(nextDistance) || nextDistance > limit + EPSILON) return null;
      const axes = [];
      for (let axis = 0; axis < 3; axis++) if (Math.abs(tMax[axis] - nextDistance) <= EPSILON) axes.push(axis);
      const adjacent = block.slice();
      for (const axis of axes) { block[axis] += step[axis]; tMax[axis] += tDelta[axis]; }
      const material = getBlock(block[0], block[1], block[2]);
      if (material) {
        const normal = [0, 0, 0];
        normal[axes[0]] = -step[axes[0]];
        return { block: block.slice(), normal, adjacent, distance: Math.max(0, nextDistance), material };
      }
    }
  }

  /**
   * Pull a following camera toward its subject before the camera volume can
   * enter terrain.  The five rays are a deliberately small, deterministic
   * approximation of a padded camera sweep: center plus horizontal and
   * vertical shoulders.  It is useful outside the renderer too, so controller
   * tests can qualify collision without needing a WebGL context.
   */
  function retractCamera(getBlock, target, desired, padding = .18) {
    if (typeof getBlock !== 'function' || !Array.isArray(target) || !Array.isArray(desired)) return null;
    const start = target.map(Number), end = desired.map(Number);
    if (!start.every(Number.isFinite) || !end.every(Number.isFinite)) return null;
    const delta = end.map((value, axis) => value - start[axis]), total = length(delta);
    if (total < EPSILON) return { position: start.slice(), distance: 0, collision: false };
    const direction = normalize(delta), safePadding = clamp(Number(padding) || 0, 0, .45);
    let right = normalize(cross(direction, [0, 1, 0]));
    if (length(right) < EPSILON) right = [1, 0, 0];
    const up = normalize(cross(right, direction));
    const offsets = [[0, 0, 0], right.map(value => value * safePadding), right.map(value => -value * safePadding), up.map(value => value * safePadding), up.map(value => -value * safePadding)];
    let travel = total, collision = false;
    for (const offset of offsets) {
      const hit = raycast(getBlock, start.map((value, axis) => value + offset[axis]), direction, total);
      if (hit && hit.distance < travel + EPSILON) { travel = Math.max(.055, hit.distance - safePadding); collision = true; }
    }
    return { position: start.map((value, axis) => value + direction[axis] * travel), distance: travel, collision };
  }

  function identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function multiply(a, b) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
      result[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
    }
    return result;
  }
  function perspective(fov, aspect, near, far) {
    const factor = 1 / Math.tan(fov / 2), range = 1 / (near - far);
    return new Float32Array([factor / aspect, 0, 0, 0, 0, factor, 0, 0, 0, 0, (near + far) * range, -1, 0, 0, near * far * range * 2, 0]);
  }
  function cameraView(position, yaw, pitch) {
    const look = forward(yaw, pitch);
    const right = normalize(cross(look, [0, 1, 0]));
    const up = normalize(cross(right, look));
    return new Float32Array([
      right[0], up[0], -look[0], 0,
      right[1], up[1], -look[1], 0,
      right[2], up[2], -look[2], 0,
      -dot(right, position), -dot(up, position), dot(look, position), 1
    ]);
  }
  /** Projects a world point into normalized device coordinates for camera tests. */
  function projectPoint(camera, point, aspect = 1) {
    if (!camera || !Array.isArray(camera.position) || !Array.isArray(point)) return null;
    const position = camera.position.map(Number), world = point.map(Number);
    if (position.length !== 3 || world.length !== 3 || !position.every(Number.isFinite) || !world.every(Number.isFinite)) return null;
    const look = forward(Number(camera.yaw) || 0, Number(camera.pitch) || 0), right = normalize(cross(look, [0, 1, 0])), up = normalize(cross(right, look));
    const relative = world.map((value, axis) => value - position[axis]), depth = dot(relative, look);
    if (depth <= EPSILON) return null;
    const fov = clamp(Number(camera.fov) || 70, 45, 95) * Math.PI / 180, focal = 1 / Math.tan(fov / 2), safeAspect = Math.max(.1, Number(aspect) || 1);
    return { x: dot(relative, right) * focal / safeAspect / depth, y: dot(relative, up) * focal / depth, depth };
  }
  function modelBox(x, y, z, width, height, depth, yaw) {
    const angle = Number.isFinite(yaw) ? yaw : 0, cosine = Math.cos(angle), sine = Math.sin(angle);
    return new Float32Array([
      cosine * width, 0, -sine * width, 0,
      0, height, 0, 0,
      sine * depth, 0, cosine * depth, 0,
      x, y, z, 1
    ]);
  }
  function modelBasis(position, right, up, front, scale) {
    return new Float32Array([
      right[0] * scale[0], right[1] * scale[0], right[2] * scale[0], 0,
      up[0] * scale[1], up[1] * scale[1], up[2] * scale[1], 0,
      front[0] * scale[2], front[1] * scale[2], front[2] * scale[2], 0,
      position[0], position[1], position[2], 1
    ]);
  }
  function materialIndex(material) { return Object.hasOwn(MATERIAL_INDEX, material) ? MATERIAL_INDEX[material] : MATERIAL_INDEX.stone; }

  function appendFace(target, x, y, z, face, material) {
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const index of QUAD_ORDER) {
      const corner = face.corners[index];
      target.push(x + corner[0], y + corner[1], z + corner[2], face.normal[0], face.normal[1], face.normal[2], material, uv[index][0], uv[index][1]);
    }
  }
  function cubeVertices() {
    const vertices = [];
    for (const face of FACE_INFO) appendFace(vertices, 0, 0, 0, face, 0);
    return new Float32Array(vertices);
  }
  function edgeVertices() {
    const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    return new Float32Array(edges.flatMap(([a, b]) => [...corners[a], ...corners[b]]));
  }

  function shaderSources() {
    const atlasColumns = MATERIALS.length + '.0';
    const vertex = `
      attribute vec3 aPosition; attribute vec3 aNormal; attribute float aMaterial; attribute vec2 aUv;
      uniform mat4 uMvp; uniform mat4 uModel; uniform float uMaterialOverride;
      varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv; varying float vMaterial;
      void main(){ vec4 world=uModel*vec4(aPosition,1.0); vWorld=world.xyz; vNormal=normalize(mat3(uModel)*aNormal); vUv=aUv; vMaterial=uMaterialOverride>=0.0?uMaterialOverride:aMaterial; gl_Position=uMvp*world; }
    `;
    const fragment = `
      precision mediump float;
      uniform sampler2D uAtlas; uniform vec3 uCamera; uniform float uDaylight; uniform float uTime; uniform float uOverlay;
      varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv; varying float vMaterial;
      vec3 sampleMaterial(float material, vec2 uv){ return texture2D(uAtlas,vec2((material+clamp(uv.x,.02,.98))/${atlasColumns},clamp(uv.y,.02,.98))).rgb; }
      void main(){
        float material=floor(vMaterial+.5); vec3 color=sampleMaterial(material,vUv); vec3 normal=normalize(vNormal);
        if(material<.5 && abs(normal.y)<.5){ vec3 soil=sampleMaterial(1.0,vUv); color=mix(soil,color,smoothstep(.76,.98,vUv.y)); }
        if(abs(material-4.0)<.5 && normal.y>.5){ float ring=max(abs(vUv.x-.5),abs(vUv.y-.5)); color+=vec3(mod(floor(ring*17.0),2.0)*.09-.045); }
        if(abs(material-5.0)<.5){ float gaps=mod(floor(vUv.x*8.0)+floor(vUv.y*8.0)*3.0,9.0); if(gaps<1.0 && abs(normal.y)<.5) discard; color+=vec3(.012,.045,.006); }
        if(abs(material-12.0)<.5) color+=vec3(.015,.09,.12)*sin((vUv.x+uTime*.34)*19.0);
        vec3 sun=normalize(vec3(-.45,.82,.36)); float diffuse=max(0.0,dot(normal,sun)); float upward=max(.0,normal.y); float side=max(.0,normal.z)*.06+max(.0,normal.x)*.035; float light=.20+uDaylight*(.20+.70*diffuse+upward*.11+side);
        color*=light; float fog=smoothstep(42.0,104.0,length(vWorld-uCamera)); color=mix(color,mix(vec3(.055,.11,.18),vec3(.47,.76,.83),uDaylight),fog);
        float alpha=1.0;
        if(uOverlay>0.0){ float crack=max(step(.94,fract(vUv.x*13.0+vUv.y*5.0)),step(.96,fract(vUv.y*17.0-vUv.x*7.0))); color=mix(color,vec3(.06,.08,.10),crack*uOverlay); alpha=.12+.36*uOverlay; }
        gl_FragColor=vec4(color,alpha);
      }
    `;
    const skyVertex = 'attribute vec2 aPosition; varying vec2 vUv; void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}';
    const skyFragment = `
      precision mediump float; varying vec2 vUv; uniform float uDaylight; uniform float uTime;
      float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return max(d.x,d.y);}
      void main(){
        vec3 dusk=vec3(.045,.09,.17), horizon=vec3(.26,.43,.58), day=vec3(.34,.72,.88);
        vec3 color=mix(dusk,mix(horizon,day,uDaylight),smoothstep(.02,.96,vUv.y));
        vec2 sunPos=vec2(.78,mix(.30,.74,uDaylight)); float sun=smoothstep(.055,.035,length(vUv-sunPos));
        color=mix(color,vec3(1.0,.86,.48),sun*max(.18,uDaylight));
        vec2 cloud=vec2(fract(vUv.x+.035*uTime)-.5,vUv.y-.76); float band=step(box(cloud,vec2(.17,.018)),0.0)+step(box(cloud-vec2(.18,.035),vec2(.11,.014)),0.0);
        color=mix(color,mix(vec3(.24,.31,.40),vec3(.92,.95,.91),uDaylight),band*.42);
        gl_FragColor=vec4(color,1.0);
      }`;
    const lineVertex = 'attribute vec3 aPosition; uniform mat4 uMvp; uniform mat4 uModel; void main(){gl_Position=uMvp*uModel*vec4(aPosition,1.);}';
    const lineFragment = 'precision mediump float; uniform vec4 uColor; void main(){gl_FragColor=uColor;}';
    return { vertex, fragment, skyVertex, skyFragment, lineVertex, lineFragment };
  }
  function makeShader(gl, type, source, name) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader) || 'unknown shader error'; gl.deleteShader(shader); throw new Error('Block Islands voxel ' + name + ' shader failed: ' + message); }
    return shader;
  }
  function makeProgram(gl, vertex, fragment, name) {
    const program = gl.createProgram(), vs = makeShader(gl, gl.VERTEX_SHADER, vertex, name), fs = makeShader(gl, gl.FRAGMENT_SHADER, fragment, name);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const message = gl.getProgramInfoLog(program) || 'unknown link error'; gl.deleteProgram(program); throw new Error('Block Islands voxel ' + name + ' program failed: ' + message); }
    return program;
  }
  function texturePixels() {
    // A tiny authored pixel atlas: every pattern is local, deterministic, and
    // deliberately orthogonal so close terrain does not turn into diagonal
    // moiré stripes on a phone display.
    const colors = [[92, 171, 76], [126, 82, 48], [116, 126, 134], [218, 190, 121], [128, 79, 39], [57, 131, 67], [179, 121, 65], [105, 112, 117], [151, 210, 234], [143, 95, 203], [61, 65, 72], [224, 190, 75], [48, 157, 198], [208, 76, 38], [17, 25, 31], [43, 121, 62], [238, 120, 88], [75, 144, 77], [224, 177, 132], [55, 101, 137], [191, 81, 58], [83, 60, 43]];
    const side = 16, bytes = new Uint8Array(side * side * MATERIALS.length * 4);
    const noise = (x, y, material) => ((x * 73) ^ (y * 151) ^ (material * 197)) & 15;
    for (let material = 0; material < MATERIALS.length; material++) for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const offset = ((y * side * MATERIALS.length) + material * side + x) * 4, base = colors[material];
      let pattern = noise(x, y, material) < 3 ? -9 : noise(x, y, material) > 13 ? 8 : 0;
      if (material === 0) pattern += (y < 3 && (x === 2 || x === 11) ? 15 : 0) + (y > 10 && x % 5 === 0 ? -8 : 0);
      if (material === 1) pattern += ((x === 3 || x === 12) && y % 5 < 3 ? 13 : 0) + (y === 8 ? -6 : 0);
      if (material === 2) pattern += ((x > 3 && x < 7 && y > 3 && y < 7) || (x > 10 && y > 9) ? 15 : 0) + ((x === 8 || y === 12) ? -8 : 0);
      if (material === 3) pattern += (x % 6 === 1 && y % 5 === 2 ? 13 : 0);
      if (material === 4) pattern += (x % 5 < 2 ? -18 : x % 5 === 3 ? 12 : 0);
      if (material === 5) pattern += ((x > 2 && x < 6 && y > 2 && y < 7) || (x > 9 && y > 8) ? 13 : -4);
      if (material === 6) pattern += (y === 3 || y === 11 ? 15 : 0) + (x === 2 || x === 13 ? -10 : 0);
      if (material === 7) pattern += ((x - 7) * (x - 7) + (y - 7) * (y - 7) < 17 ? 49 : 0);
      if (material === 8) pattern += (x === y || x + y === 15 ? 18 : 0);
      if (material === 9 || material === 11) pattern += (x === 7 || y === 7 ? 31 : 0);
      if (material === 10) pattern += ((x === 5 || x === 11) && y % 4 ? -18 : 0);
      if (material === 12) pattern += (y === 4 || y === 11 ? 17 : -3);
      if (material === 13) pattern += (x === 5 || x === 10 ? 25 : -4);
      if (material === 15) pattern += (x === 7 && y < 12 ? 31 : -4);
      if (material === 16) pattern += ((x > 4 && x < 11 && y > 4 && y < 11) ? 34 : -7);
      if (material === 18) pattern += (y < 5 ? 12 : 0);
      if (material === 19) pattern += (x === 2 || x === 13 ? 18 : 0);
      if (material === 20) pattern += (x === 6 || y === 4 ? 26 : 0);
      if (material === 21) pattern += (x % 4 === 0 ? -17 : 0);
      bytes[offset] = clamp(base[0] + pattern, 0, 255); bytes[offset + 1] = clamp(base[1] + pattern, 0, 255); bytes[offset + 2] = clamp(base[2] + pattern, 0, 255); bytes[offset + 3] = 255;
    }
    return { pixels: bytes, width: side * MATERIALS.length, height: side };
  }

  function createRenderer(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('Block Islands 3D renderer needs a canvas element. A compatibility view can be used instead.');
    let gl, programs, locations, worldBuffer, cubeBuffer, edgeBuffer, skyBuffer, atlas;
    let destroyed = false, contextLost = false, hasWorld = false, worldRevision = Symbol('no world'), cachedBlocks = [], blockMap = new Map(), dimensions = { width: 0, height: 0, dpr: 1 };
    const stats = { capability: 'WebGL pending', meshRevision: null, blocks: 0, faces: 0, vertices: 0, drawCalls: 0, frames: 0, contextLost: false, width: 0, height: 0, dpr: 1, pixelBudget: MAX_RENDER_PIXELS, bounds: null };

    function initialize() {
      gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: false, premultipliedAlpha: false }) || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('Block Islands 3D renderer could not start because WebGL is unavailable. Use the compatibility view or update this browser.');
      const source = shaderSources();
      programs = { world: makeProgram(gl, source.vertex, source.fragment, 'world'), sky: makeProgram(gl, source.skyVertex, source.skyFragment, 'sky'), line: makeProgram(gl, source.lineVertex, source.lineFragment, 'line') };
      locations = {
        world: { position: gl.getAttribLocation(programs.world, 'aPosition'), normal: gl.getAttribLocation(programs.world, 'aNormal'), material: gl.getAttribLocation(programs.world, 'aMaterial'), uv: gl.getAttribLocation(programs.world, 'aUv'), mvp: gl.getUniformLocation(programs.world, 'uMvp'), model: gl.getUniformLocation(programs.world, 'uModel'), materialOverride: gl.getUniformLocation(programs.world, 'uMaterialOverride'), camera: gl.getUniformLocation(programs.world, 'uCamera'), daylight: gl.getUniformLocation(programs.world, 'uDaylight'), time: gl.getUniformLocation(programs.world, 'uTime'), overlay: gl.getUniformLocation(programs.world, 'uOverlay'), atlas: gl.getUniformLocation(programs.world, 'uAtlas') },
        sky: { position: gl.getAttribLocation(programs.sky, 'aPosition'), daylight: gl.getUniformLocation(programs.sky, 'uDaylight'), time: gl.getUniformLocation(programs.sky, 'uTime') },
        line: { position: gl.getAttribLocation(programs.line, 'aPosition'), mvp: gl.getUniformLocation(programs.line, 'uMvp'), model: gl.getUniformLocation(programs.line, 'uModel'), color: gl.getUniformLocation(programs.line, 'uColor') }
      };
      worldBuffer = gl.createBuffer(); cubeBuffer = gl.createBuffer(); edgeBuffer = gl.createBuffer(); skyBuffer = gl.createBuffer(); atlas = gl.createTexture();
      gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer); gl.bufferData(gl.ARRAY_BUFFER, cubeVertices(), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer); gl.bufferData(gl.ARRAY_BUFFER, edgeVertices(), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const pixels = texturePixels(); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pixels.width, pixels.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels.pixels);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.clearDepth(1); stats.capability = gl.getParameter(gl.VERSION) || 'WebGL';
    }
    function bindWorldAttributes(buffer) {
      const location = locations.world, stride = 9 * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location.position); gl.vertexAttribPointer(location.position, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(location.normal); gl.vertexAttribPointer(location.normal, 3, gl.FLOAT, false, stride, 3 * 4);
      gl.enableVertexAttribArray(location.material); gl.vertexAttribPointer(location.material, 1, gl.FLOAT, false, stride, 6 * 4);
      gl.enableVertexAttribArray(location.uv); gl.vertexAttribPointer(location.uv, 2, gl.FLOAT, false, stride, 7 * 4);
    }
    function rebuildMesh() {
      const vertices = [], values = [...blockMap.values()];
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const block of values) {
        minX = Math.min(minX, block.x); minY = Math.min(minY, block.y); minZ = Math.min(minZ, block.z); maxX = Math.max(maxX, block.x + 1); maxY = Math.max(maxY, block.y + 1); maxZ = Math.max(maxZ, block.z + 1);
        for (const face of FACE_INFO) if (!blockMap.has(cellKey(block.x + face.offset[0], block.y + face.offset[1], block.z + face.offset[2]))) appendFace(vertices, block.x, block.y, block.z, face, materialIndex(block.material));
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, worldBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      stats.blocks = values.length; stats.vertices = vertices.length / 9; stats.faces = stats.vertices / 6; stats.bounds = values.length ? { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] } : null;
    }
    function setWorld(blocks, revision) {
      if (destroyed) throw new Error('Block Islands 3D renderer was destroyed. Create a new renderer before setting a world.');
      if (!Array.isArray(blocks)) throw new Error('Block Islands 3D renderer expected a flat array of unit blocks.');
      // A caller that does not provide a revision receives the safe behaviour:
      // rebuild rather than accidentally retaining a stale sparse world.
      if (hasWorld && revision !== undefined && revision === worldRevision) return false;
      const next = new Map();
      for (const source of blocks) {
        if (!source || !Number.isInteger(source.x) || !Number.isInteger(source.y) || !Number.isInteger(source.z) || typeof source.material !== 'string') continue;
        next.set(cellKey(source.x, source.y, source.z), { x: source.x, y: source.y, z: source.z, material: source.material });
      }
      cachedBlocks = [...next.values()].map(block => ({ ...block })); blockMap = next; worldRevision = revision; hasWorld = true; stats.meshRevision = revision;
      if (!contextLost) rebuildMesh();
      return true;
    }
    function resize(cssWidth, cssHeight, dpr) {
      if (destroyed) return false;
      const width = Math.max(1, Math.round(Number(cssWidth) || canvas.clientWidth || 1)), height = Math.max(1, Math.round(Number(cssHeight) || canvas.clientHeight || 1));
      const requested = clamp(Number(dpr) || 1, 1, 3), capped = Math.min(requested, Math.sqrt(MAX_RENDER_PIXELS / (width * height)));
      const pixelWidth = Math.max(1, Math.round(width * capped)), pixelHeight = Math.max(1, Math.round(height * capped));
      dimensions = { width, height, dpr: capped };
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      if (!contextLost) gl.viewport(0, 0, pixelWidth, pixelHeight);
      stats.width = pixelWidth; stats.height = pixelHeight; stats.dpr = capped;
      return { width: pixelWidth, height: pixelHeight, dpr: capped, capped: capped < requested };
    }
    function useWorld(mvp, camera, daylight, time) {
      const location = locations.world; gl.useProgram(programs.world); bindWorldAttributes(worldBuffer); gl.uniformMatrix4fv(location.mvp, false, mvp); gl.uniform3fv(location.camera, camera); gl.uniform1f(location.daylight, daylight); gl.uniform1f(location.time, time); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(location.atlas, 0);
    }
    function drawCube(mvp, camera, daylight, time, model, material, overlay) {
      const location = locations.world; bindWorldAttributes(cubeBuffer); gl.uniformMatrix4fv(location.model, false, model); gl.uniform1f(location.materialOverride, materialIndex(material)); gl.uniform1f(location.overlay, overlay || 0); gl.drawArrays(gl.TRIANGLES, 0, 36); stats.drawCalls++;
    }
    function drawEntity(mvp, camera, daylight, time, entity) {
      if (!entity || !Number.isFinite(entity.x) || !Number.isFinite(entity.y) || !Number.isFinite(entity.z)) return;
      const yaw = Number(entity.heading) || 0, stride = Math.sin((Number(entity.walk) || 0) * Math.PI * 2) * .08, attack = clamp(Number(entity.attack) || 0, 0, 1), team = entity.team === 'enemy' ? ['basalt', 'lava', 'crystal'] : entity.team === 'friendly' ? ['wood', 'leaves', 'beacon'] : ['plank', 'grass', 'crystal'];
      const x = entity.x, y = entity.y, z = entity.z;
      drawCube(mvp, camera, daylight, time, modelBox(x - .35, y + .012, z - .35, .7, .025, .7, 0), 'shadow', 0);
      drawCube(mvp, camera, daylight, time, modelBox(x - .12, y + stride, z - .12, .24, .50, .24, yaw), team[0], 0);
      drawCube(mvp, camera, daylight, time, modelBox(x + .14, y - stride, z - .12, .24, .50, .24, yaw), team[0], 0);
      drawCube(mvp, camera, daylight, time, modelBox(x - .34, y + .45, z - .27, .68, .60, .54, yaw), team[1], 0);
      // Two articulated arms and a crest make the original dusk skitter read
      // as a creature at a phone distance, not a single animated cube.
      const arm = Math.sin((Number(entity.walk) || 0) * Math.PI * 2) * .16 + attack * .20;
      drawCube(mvp, camera, daylight, time, modelBox(x - .46, y + .57 + arm, z - .17, .16, .42, .17, yaw), team[0], 0);
      drawCube(mvp, camera, daylight, time, modelBox(x + .30, y + .57 - arm, z - .17, .16, .42, .17, yaw), team[0], 0);
      drawCube(mvp, camera, daylight, time, modelBox(x - .29, y + 1.02, z - .25, .58, .52, .50, yaw), team[0], 0);
      drawCube(mvp, camera, daylight, time, modelBox(x - .08, y + 1.53, z - .10, .16, .18, .18, yaw), team[2], 0);
      const gaze = forward(yaw, 0), side = normalize(cross(gaze, [0, 1, 0])), eye = [x + gaze[0] * .29, y + 1.25, z + gaze[2] * .29];
      drawCube(mvp, camera, daylight, time, modelBox(eye[0] + side[0] * .15, eye[1], eye[2] + side[2] * .15, .12, .12, .08, yaw), team[2], attack * .16);
      drawCube(mvp, camera, daylight, time, modelBox(eye[0] - side[0] * .15, eye[1], eye[2] - side[2] * .15, .12, .12, .08, yaw), team[2], attack * .16);
    }
    function drawHeld(mvp, camera, daylight, time, frame, right, up, look) {
      const held = frame.held; if (!held || !held.material) return;
      // Keep the camera-relative model inside a portrait phone's narrower
      // horizontal field of view. This is a real 3D object, never a HUD decal.
      const swing = clamp(Number(held.swing) || 0, 0, 1), position = [camera[0] + look[0] * (1.45 - swing * .12) + right[0] * .18 - up[0] * (.62 + swing * .07), camera[1] + look[1] * (1.45 - swing * .12) + right[1] * .18 - up[1] * (.62 + swing * .07), camera[2] + look[2] * (1.45 - swing * .12) + right[2] * .18 - up[2] * (.62 + swing * .07)];
      const model = modelBasis(position, right, up, [-look[0], -look[1], -look[2]], [held.material === 'tool' ? .09 : .33, held.material === 'tool' ? .55 : .33, held.material === 'tool' ? .09 : .33]);
      drawCube(mvp, camera, daylight, time, model, held.material === 'tool' ? 'wood' : held.material, 0);
      if (held.material === 'tool') {
        // A compact explorer glove makes the tool a held object rather than
        // a floating HUD prop, while keeping the target and phone actions clear.
        drawCube(mvp, camera, daylight, time, modelBasis([position[0] - up[0] * .10 - right[0] * .10, position[1] - up[1] * .10 - right[1] * .10, position[2] - up[2] * .10 - right[2] * .10], right, up, [-look[0], -look[1], -look[2]], [.20, .18, .20]), 'skin', 0);
        drawCube(mvp, camera, daylight, time, modelBasis([position[0] + up[0] * .43, position[1] + up[1] * .43, position[2] + up[2] * .43], right, up, [-look[0], -look[1], -look[2]], [.30, .14, .16]), 'stone', 0);
        drawCube(mvp, camera, daylight, time, modelBasis([position[0] + up[0] * .38 + right[0] * .19, position[1] + up[1] * .38 + right[1] * .19, position[2] + up[2] * .38 + right[2] * .19], right, up, [-look[0], -look[1], -look[2]], [.10, .10, .22]), 'stone', 0);
      }
    }
    function drawPlayer(mvp, camera, daylight, time, player) {
      if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.z)) return;
      const x = player.x, y = player.y, z = player.z, yaw = Number(player.heading) || 0, stride = player.walk ? Math.sin(player.walk * Math.PI * 2) * .42 : 0, swing = clamp(Number(player.swing) || 0, 0, 1), gaze = forward(yaw, 0), side = normalize(cross(gaze, [0, 1, 0])), up = [0, 1, 0];
      const offset = (origin, vector, amount) => [origin[0] + vector[0] * amount, origin[1] + vector[1] * amount, origin[2] + vector[2] * amount];
      const box = (center, right, vertical, front, scale, material) => {
        const base = [center[0] - right[0] * scale[0] / 2 - vertical[0] * scale[1] / 2 - front[0] * scale[2] / 2, center[1] - right[1] * scale[0] / 2 - vertical[1] * scale[1] / 2 - front[1] * scale[2] / 2, center[2] - right[2] * scale[0] / 2 - vertical[2] * scale[1] / 2 - front[2] * scale[2] / 2];
        drawCube(mvp, camera, daylight, time, modelBasis(base, right, vertical, front, scale), material, 0);
      };
      const limb = (pivot, angle, length, width, material) => {
        const vertical = normalize([up[0] * Math.cos(angle) + gaze[0] * Math.sin(angle), Math.cos(angle), up[2] * Math.cos(angle) + gaze[2] * Math.sin(angle)]), front = normalize(cross(vertical, side));
        box(offset(pivot, vertical, -length / 2), side, vertical, front, [width, length, .20], material);
        return { hand: offset(pivot, vertical, -length - .045), vertical, front };
      };
      // Original field explorer: a planted contact shadow, navy work clothes,
      // rust scarf and leather pack. Limbs pivot from the actual player body.
      drawCube(mvp, camera, daylight, time, modelBox(x - .32, y + .01, z - .32, .64, .025, .64, 0), 'shadow', 0);
      const leftHip = offset([x, y + .50, z], side, -.10), rightHip = offset([x, y + .50, z], side, .10);
      limb(leftHip, stride, .50, .18, 'leather'); limb(rightHip, -stride, .50, .18, 'leather');
      box([x, y + .77, z], side, up, gaze, [.54, .54, .40], 'cloth');
      box(offset([x, y + .96, z], gaze, -.23), side, up, gaze, [.37, .34, .12], 'leather');
      const leftArm = limb(offset([x, y + 1.00, z], side, -.34), -stride * .72, .47, .14, 'cloth');
      const rightArm = limb(offset([x, y + 1.00, z], side, .34), stride * .72 - swing * 1.10, .47, .14, 'cloth');
      const head = [x, y + 1.28, z], headGaze = forward(yaw, clamp(Number(player.look) || 0, -.55, .55) * .45), headUp = normalize(cross(side, headGaze));
      box(head, side, headUp, headGaze, [.44, .43, .36], 'skin');
      const face = offset(head, headGaze, .205);
      box(offset(face, side, .10), side, headUp, headGaze, [.07, .07, .04], 'leather'); box(offset(face, side, -.10), side, headUp, headGaze, [.07, .07, .04], 'leather');
      box(offset(head, headUp, .22), side, headUp, headGaze, [.46, .13, .40], 'leather');
      box(offset(head, headUp, -.15), side, headUp, headGaze, [.46, .08, .40], 'scarf');
      const glove = rightArm.hand;
      box(glove, side, up, gaze, [.16, .16, .16], 'skin');
      if (player.held === 'tool') {
        const shaftCenter = offset(glove, rightArm.vertical, .22);
        box(shaftCenter, side, rightArm.vertical, rightArm.front, [.10, .54, .10], 'wood');
        box(offset(glove, rightArm.vertical, .48), side, rightArm.vertical, rightArm.front, [.30, .14, .18], 'stone');
      } else if (player.held) box(offset(glove, gaze, .14), side, up, gaze, [.27, .27, .27], player.held);
    }
    function drawEffects(mvp, camera, daylight, time, effects) {
      for (const effect of effects || []) {
        if (!effect || !Number.isFinite(effect.x) || !Number.isFinite(effect.age)) continue;
        const age = clamp(effect.age, 0, 1), count = effect.kind === 'place' ? 3 : 5;
        for (let i = 0; i < count; i++) {
          const angle = i * 2.399 + (effect.x + effect.z) * .31;
          const rise = age * (effect.kind === 'place' ? .34 : .70);
          const radius = age * (.15 + i * .045);
          drawCube(mvp, camera, daylight, time, modelBox(effect.x + Math.cos(angle) * radius - .055, effect.y + rise + Math.sin(angle * 1.7) * .07 - .055, effect.z + Math.sin(angle) * radius - .055, .11, .11, .11, 0), effect.material || 'stone', age * .4);
        }
      }
    }
    function render(frame) {
      if (destroyed || contextLost) return false;
      const input = frame || {}, cameraInput = input.camera || {}, camera = Array.isArray(cameraInput.position) ? cameraInput.position : [0, 2, 0];
      const position = [Number(camera[0]) || 0, Number(camera[1]) || 2, Number(camera[2]) || 0], yaw = Number(cameraInput.yaw) || 0, pitch = clamp(Number(cameraInput.pitch) || 0, -1.53, 1.53), fov = clamp(Number(cameraInput.fov) || 70, 45, 95) * Math.PI / 180, daylight = clamp(Number.isFinite(input.daylight) ? input.daylight : .78, 0, 1), time = (Number(input.time) || 0) * .001;
      if (!dimensions.width || !dimensions.height) resize(canvas.clientWidth || 1, canvas.clientHeight || 1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
      const aspect = Math.max(.1, dimensions.width / dimensions.height), look = forward(yaw, pitch), right = normalize(cross(look, [0, 1, 0])), up = normalize(cross(right, look)), mvp = multiply(perspective(fov, aspect, .05, 108), cameraView(position, yaw, pitch));
      stats.drawCalls = 0; gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.useProgram(programs.sky); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuffer); gl.enableVertexAttribArray(locations.sky.position); gl.vertexAttribPointer(locations.sky.position, 2, gl.FLOAT, false, 0, 0); gl.uniform1f(locations.sky.daylight, daylight); gl.uniform1f(locations.sky.time, time); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.drawCalls++;
      gl.enable(gl.DEPTH_TEST); useWorld(mvp, position, daylight, time); const location = locations.world; gl.uniformMatrix4fv(location.model, false, identity()); gl.uniform1f(location.materialOverride, -1); gl.uniform1f(location.overlay, 0); if (stats.vertices) { gl.drawArrays(gl.TRIANGLES, 0, stats.vertices); stats.drawCalls++; }
      for (const entity of Array.isArray(input.entities) ? input.entities : []) drawEntity(mvp, position, daylight, time, entity);
      drawPlayer(mvp, position, daylight, time, input.player);
      drawEffects(mvp, position, daylight, time, Array.isArray(input.effects) ? input.effects : []);
      if (input.target && Array.isArray(input.target.block)) {
        const block = input.target.block, progress = clamp(Number(input.target.progress) || 0, 0, 1), scale = 1.008, model = modelBox(block[0] - (scale - 1) / 2, block[1] - (scale - 1) / 2, block[2] - (scale - 1) / 2, scale, scale, scale, 0), material = blockMap.get(cellKey(block[0], block[1], block[2]))?.material || 'stone';
        // A resting crosshair gets a thin outline.  Tint the whole cube only
        // while mining so a nearby ground block never hides the scene.
        if (progress > 0) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); drawCube(mvp, position, daylight, time, model, material, progress); gl.depthMask(true); gl.disable(gl.BLEND); }
        gl.useProgram(programs.line); gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer); gl.enableVertexAttribArray(locations.line.position); gl.vertexAttribPointer(locations.line.position, 3, gl.FLOAT, false, 0, 0); gl.uniformMatrix4fv(locations.line.mvp, false, mvp); gl.uniformMatrix4fv(locations.line.model, false, model); gl.uniform4f(locations.line.color, 1, .88 - progress * .35, .38, 1); gl.drawArrays(gl.LINES, 0, 24); stats.drawCalls++;
        useWorld(mvp, position, daylight, time);
      }
      drawHeld(mvp, position, daylight, time, input, right, up, look); stats.frames++; return true;
    }
    function destroy() {
      if (destroyed) return; destroyed = true; canvas.removeEventListener('webglcontextlost', onContextLost); canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (!gl) return; for (const buffer of [worldBuffer, cubeBuffer, edgeBuffer, skyBuffer]) if (buffer) gl.deleteBuffer(buffer); if (atlas) gl.deleteTexture(atlas); if (programs) for (const program of Object.values(programs)) gl.deleteProgram(program);
    }
    function getStats() { return { ...stats, bounds: stats.bounds ? { min: stats.bounds.min.slice(), max: stats.bounds.max.slice() } : null, destroyed, contextLost }; }
    function onContextLost(event) { event.preventDefault(); contextLost = true; stats.contextLost = true; }
    function onContextRestored() { contextLost = false; stats.contextLost = false; initialize(); rebuildMesh(); resize(dimensions.width || canvas.clientWidth || 1, dimensions.height || canvas.clientHeight || 1, dimensions.dpr || 1); }

    initialize(); canvas.addEventListener('webglcontextlost', onContextLost, false); canvas.addEventListener('webglcontextrestored', onContextRestored, false);
    return { setWorld, resize, render, destroy, getStats };
  }

  return Object.freeze({ createRenderer, forward, raycast, retractCamera, projectPoint, MATERIALS: MATERIALS.slice(), MAX_RENDER_PIXELS });
}));
