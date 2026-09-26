// Movement test course, built far from the level (around z = 3000) so it never interferes with
// the town. Stations (x relative to the course origin, lanes run towards −z):
//   mantle boxes 0.5 / 1.0 / 1.4 / 1.8 / 2.4 m, vault walls, stairs (0.18 m risers), ramps 20° /
//   35° / 58°, kerbs 0.15 / 0.3 / 0.5 m, a 0.9 m corridor with a 1.4 m crouch tunnel, a 4 cm thin
//   wall, 90° and 40° corners, drop platforms 3 / 6 / 12 m, and a marked sprint/slide track.
// Also registers the player-* screenshots.
import * as THREE from 'three';

export const COURSE_ORIGIN = new THREE.Vector3(0, 0, 3000);

// Station coordinates (relative to COURSE_ORIGIN) shared with movementTests.js.
export const STATIONS = {
  start: { pos: [0, 0, 26], yaw: 0 },
  mantle: [
    { h: 0.5, x: -26 },
    { h: 1.0, x: -22 },
    { h: 1.4, x: -18 },
    { h: 1.8, x: -14 },
    { h: 2.4, x: -10 },
  ],
  mantleFrontZ: -2, // front face z of the mantle boxes
  vault: { x: -4, z: -2, h: 1.0, t: 0.3 },
  stairs: { x: 4, z0: 0, riser: 0.18, tread: 0.3, n: 10, width: 2.2 },
  ramps: [
    { deg: 20, x: 10 },
    { deg: 35, x: 14 },
    { deg: 58, x: 18 },
  ],
  kerbs: { x: 23, z: -2, heights: [0.15, 0.3, 0.5] },
  corridor: { x: 30, z0: 0, len: 9, width: 0.9, tunnel: [-3, -6], tunnelH: 1.4 },
  thinWall: { x: 36, z: -4, t: 0.04 },
  corners: { x: 43, z: -4 },
  drops: [
    { h: 3, x: -34, z: 10 },
    { h: 6, x: -34, z: 2 },
    { h: 12, x: -34, z: -6 },
  ],
  track: { x: -4, z0: 24, z1: 6 },
};

export function coursePos(x, y, z) {
  return [COURSE_ORIGIN.x + x, COURSE_ORIGIN.y + y, COURSE_ORIGIN.z + z];
}

// Box geometry with UVs in metres (1 UV = 1 m) as the material library expects.
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [
    [d, h], [d, h], // ±x
    [w, d], [w, d], // ±y
    [w, h], [w, h], // ±z
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
    }
  }
  return g;
}

// Wedge (ramp) rising along −z: footprint w × len, height h at the far end.
function wedgeGeo(w, len, h) {
  const x0 = -w / 2, x1 = w / 2;
  const P = [
    [x0, 0, 0], [x1, 0, 0], [x1, h, -len], [x0, h, -len], // slope quad (top)
    [x0, 0, -len], [x1, 0, -len], // back bottom
  ];
  const pos = [], uvs = [];
  const slopeLen = Math.hypot(len, h);
  const quad = (a, b, c, d, ua, ub, uc, ud) => {
    for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) {
      pos.push(...P[p]);
      uvs.push(...u);
    }
  };
  const tri = (a, b, c, ua, ub, uc) => {
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]]) {
      pos.push(...P[p]);
      uvs.push(...u);
    }
  };
  quad(0, 1, 2, 3, [0, 0], [w, 0], [w, slopeLen], [0, slopeLen]); // slope
  quad(4, 5, 1, 0, [0, 0], [w, 0], [w, len], [0, len]); // bottom (facing down)
  quad(5, 4, 3, 2, [0, 0], [w, 0], [w, h], [0, h]); // back wall (−z)
  tri(0, 3, 4, [0, 0], [len, h], [len, 0]); // left side (−x)
  tri(1, 5, 2, [0, 0], [len, 0], [len, h]); // right side (+x)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Spray-paint wear: knock random holes out of whatever was drawn.
function wear(ctx, w, h, rnd, amount = 0.35) {
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.004 * amount; i++) {
    ctx.globalAlpha = 0.2 + rnd() * 0.6;
    const r = 0.5 + rnd() * rnd() * 4;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function buildCourse(game, player) {
  const THREEm = game.materials;
  const mat = (n) => THREEm?.get?.(n) || new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
  const rnd = game.random;
  const root = new THREE.Group();
  root.name = 'player-test-course';
  root.position.copy(COURSE_ORIGIN);
  game.scene.add(root);
  const O = COURSE_ORIGIN;
  const colliders = [];

  const addBox = (x, y, z, w, h, d, material, surface, { collide = true, rotY = 0, cast = true } = {}) => {
    const m = new THREE.Mesh(boxGeo(w, h, d), typeof material === 'string' ? mat(material) : material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
    if (collide) {
      const q = rotY ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY) : null;
      colliders.push(
        game.physics.addStaticBox(new THREE.Vector3(O.x + x, O.y + y + h / 2, O.z + z), new THREE.Vector3(w / 2, h / 2, d / 2), q, {
          type: 'world',
          surface: surface || THREEm?.surfaceOf?.(m.material) || 'concrete',
        }),
      );
    }
    return m;
  };

  // --- decal materials -------------------------------------------------------------------
  const stencil = (text, color = '#e8e2d2') =>
    new THREE.MeshStandardMaterial({
      map: canvasTex(512, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.font = 'bold 150px "DejaVu Sans Condensed", "Arial Narrow", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, h / 2 + 6);
        wear(ctx, w, h, rnd, 0.9);
      }),
      transparent: true,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: canvasTex(512, 64, (ctx, w, h) => {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1b1a18';
      for (let x = -h; x < w + h; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + 32, h);
        ctx.lineTo(x + 32 + h, 0);
        ctx.lineTo(x + h, 0);
        ctx.fill();
      }
      wear(ctx, w, h, rnd, 1.5);
    }),
    roughness: 0.7,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    depthWrite: false,
  });
  hazardMat.map.wrapS = THREE.RepeatWrapping;
  const lineMat = new THREE.MeshStandardMaterial({
    map: canvasTex(256, 32, (ctx, w, h) => {
      ctx.fillStyle = '#d8c690';
      ctx.fillRect(0, 0, w, h);
      wear(ctx, w, h, rnd, 3);
    }),
    transparent: true,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    depthWrite: false,
  });
  lineMat.map.wrapS = THREE.RepeatWrapping;

  // Decal quad on a face. normal: 'z+' | 'x-' | 'y+' ...
  const decal = (material, x, y, z, w, h, face = 'z+', repeat = 1) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (repeat !== 1) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
    }
    const m = new THREE.Mesh(g, material);
    const e = 0.006;
    if (face === 'z+') m.position.set(x, y, z + e);
    else if (face === 'z-') {
      m.position.set(x, y, z - e);
      m.rotation.y = Math.PI;
    } else if (face === 'x+') {
      m.position.set(x + e, y, z);
      m.rotation.y = Math.PI / 2;
    } else if (face === 'x-') {
      m.position.set(x - e, y, z);
      m.rotation.y = -Math.PI / 2;
    } else if (face === 'y+') {
      m.position.set(x, y + e, z);
      m.rotation.x = -Math.PI / 2;
    }
    m.receiveShadow = true;
    m.userData.noCollide = true;
    root.add(m);
    return m;
  };

  // --- ground slab + perimeter ------------------------------------------------------------
  const W = 96, D = 84, CX = 4, CZ = 2;
  addBox(CX, -0.6, CZ, W, 0.6, D, 'concrete', 'concrete');
  // Expansion joints (dark seams) every 6 m.
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x2b2926, roughness: 1 });
  for (let x = CX - W / 2 + 6; x < CX + W / 2; x += 6) decal(seamMat, x, 0, CZ, 0.03, D, 'y+');
  for (let z = CZ - D / 2 + 6; z < CZ + D / 2; z += 6) decal(seamMat, CX, 0, z, W, 0.03, 'y+');
  // Perimeter T-walls (concrete blast walls) with gaps.
  for (let x = CX - W / 2 + 1.5; x < CX + W / 2; x += 3.05) {
    addBox(x, 0, CZ - D / 2 + 0.5, 3, 3.6, 0.35, 'concrete_dirty', 'concrete');
    addBox(x, 0, CZ + D / 2 - 0.5, 3, 3.6, 0.35, 'concrete_dirty', 'concrete');
  }
  for (let z = CZ - D / 2 + 1.5; z < CZ + D / 2; z += 3.05) {
    addBox(CX - W / 2 + 0.5, 0, z, 0.35, 3.6, 3, 'concrete_dirty', 'concrete');
    addBox(CX + W / 2 - 0.5, 0, z, 0.35, 3.6, 3, 'concrete_dirty', 'concrete');
  }

  // --- mantle boxes -----------------------------------------------------------------------
  const MZ = STATIONS.mantleFrontZ;
  for (const b of STATIONS.mantle) {
    const depth = 2.4, w = 2.6;
    const cz = MZ - depth / 2;
    const material = b.h >= 1.8 ? 'concrete' : 'wood';
    addBox(b.x, 0, cz, w, b.h, depth, material, b.h >= 1.8 ? 'concrete' : 'wood');
    decal(hazardMat, b.x, b.h - 0.05, MZ, w, 0.1, 'z+', w * 2);
    decal(stencil(b.h.toFixed(1) + ' M'), b.x, Math.min(b.h * 0.5, 1.2), MZ, Math.min(1.4, b.h * 1.8), Math.min(0.7, b.h * 0.9), 'z+');
  }

  // --- vault walls (low wall + jersey barrier) ---------------------------------------------
  const V = STATIONS.vault;
  addBox(V.x, 0, V.z - V.t / 2, 3.2, V.h, V.t, 'brick', 'brick');
  addBox(V.x, V.h, V.z - V.t / 2, 3.3, 0.05, V.t + 0.06, 'concrete', 'concrete');
  decal(stencil('VAULT'), V.x, 0.5, V.z, 1.2, 0.5, 'z+');
  addBox(V.x, 0, V.z - 8, 3.4, 1.15, 0.45, 'concrete', 'concrete');

  // --- stairs to a 1.8 m platform ----------------------------------------------------------
  const S = STATIONS.stairs;
  for (let i = 0; i < S.n; i++) {
    const top = S.riser * (i + 1);
    addBox(S.x, 0, S.z0 - S.tread * (i + 0.5), S.width, top, S.tread, 'concrete', 'concrete');
    decal(hazardMat, S.x, top - 0.02, S.z0 - S.tread * i, S.width, 0.04, 'z+', 4);
  }
  const platZ0 = S.z0 - S.tread * S.n;
  addBox(S.x, 0, platZ0 - 2, S.width + 0.6, S.riser * S.n, 4, 'concrete', 'concrete');
  // railings
  for (const side of [-1, 1]) {
    const rx = S.x + side * (S.width / 2 + 0.03);
    const rail = new THREE.Mesh(boxGeo(0.05, 0.05, Math.hypot(S.tread * S.n, S.riser * S.n) + 0.1), mat('metal_painted'));
    rail.position.set(rx, S.riser * S.n * 0.5 + 0.95, S.z0 - (S.tread * S.n) / 2);
    rail.rotation.x = Math.atan2(S.riser, S.tread);
    root.add(rail);
    for (let i = 0; i <= S.n; i += 3) {
      const post = new THREE.Mesh(boxGeo(0.045, 0.95, 0.045), mat('metal_painted'));
      post.position.set(rx, S.riser * i + 0.475, S.z0 - S.tread * i);
      root.add(post);
    }
  }

  // --- ramps ------------------------------------------------------------------------------
  for (const r of STATIONS.ramps) {
    const h = r.deg === 58 ? 3.2 : 2.2;
    const len = h / Math.tan((r.deg * Math.PI) / 180);
    const g = wedgeGeo(2.6, len, h);
    const m = new THREE.Mesh(g, mat(r.deg === 58 ? 'metal_rusty' : 'concrete'));
    m.position.set(r.x, 0, 0);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    colliders.push(...game.physics.addStaticMesh(m, { type: 'world', surface: r.deg === 58 ? 'metal' : 'concrete' }));
    addBox(r.x, 0, -len - 1.5, 2.6, h, 3, 'concrete', 'concrete');
    decal(stencil(r.deg + '°'), r.x - 1.301, 0.55, -len * 0.3, 0.9, 0.45, 'x-');
  }

  // --- kerbs ------------------------------------------------------------------------------
  const K = STATIONS.kerbs;
  K.heights.forEach((h, i) => {
    const x = K.x + i * 1.6 - 1.6;
    addBox(x, 0, K.z - 1.5, 1.2, h, 3, 'concrete', 'concrete');
    decal(stencil(Math.round(h * 100) + ''), x, h * 0.5, K.z, 0.5, Math.max(0.12, h * 0.8), 'z+');
  });

  // --- corridor with crouch tunnel ----------------------------------------------------------
  const C = STATIONS.corridor;
  for (const side of [-1, 1]) {
    addBox(C.x + side * (C.width / 2 + 0.15), 0, C.z0 - C.len / 2, 0.3, 2.6, C.len, 'plaster', 'plaster');
  }
  const [t0, t1] = C.tunnel;
  addBox(C.x, C.tunnelH, (t0 + t1) / 2, C.width + 0.6, 2.6 - C.tunnelH, t0 - t1, 'wood', 'wood');
  decal(hazardMat, C.x, C.tunnelH + 0.05, t0, C.width, 0.1, 'z+', 2);

  // --- thin wall --------------------------------------------------------------------------
  const TW = STATIONS.thinWall;
  addBox(TW.x, 0, TW.z, 4, 3, TW.t, 'metal_corrugated', 'metal');

  // --- corners: 90° and 40° ---------------------------------------------------------------
  const CO = STATIONS.corners;
  addBox(CO.x, 0, CO.z - 2, 4, 2.6, 0.3, 'concrete_dirty', 'concrete');
  addBox(CO.x - 2 + 0.15, 0, CO.z, 0.3, 2.6, 4, 'concrete_dirty', 'concrete');
  const vx = CO.x + 5, vz = CO.z - 2;
  const half = (20 * Math.PI) / 180;
  for (const s of [-1, 1]) {
    const len = 4;
    const ang = s * half;
    const cx = vx + Math.sin(ang) * len * 0.5 + s * 0.15;
    const cz = vz + Math.cos(ang) * len * 0.5;
    addBox(cx, 0, cz, 0.3, 2.6, len, 'concrete_dirty', 'concrete', { rotY: ang });
  }

  // --- drop platforms ---------------------------------------------------------------------
  for (const d of STATIONS.drops) {
    addBox(d.x, d.h - 0.3, d.z, 3, 0.3, 3, 'metal_painted', 'metal');
    for (const [ox, oz] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) {
      addBox(d.x + ox, 0, d.z + oz, 0.18, d.h - 0.3, 0.18, 'metal_steel', 'metal', { collide: ox < 0 });
    }
    decal(stencil(d.h + ' M', '#f0c43a'), d.x + 1.51, d.h - 0.15, d.z, 0.5, 0.25, 'x+');
  }

  // --- sprint / slide track with metre marks -----------------------------------------------
  const TR = STATIONS.track;
  for (let z = TR.z1; z <= TR.z0; z += 1) {
    const major = (TR.z0 - z) % 5 === 0;
    decal(lineMat, TR.x, 0, z, major ? 2.4 : 1.2, major ? 0.08 : 0.05, 'y+');
  }
  decal(lineMat, TR.x - 1.3, 0, (TR.z0 + TR.z1) / 2, 0.08, TR.z0 - TR.z1, 'y+');
  decal(lineMat, TR.x + 1.3, 0, (TR.z0 + TR.z1) / 2, 0.08, TR.z0 - TR.z1, 'y+');

  // --- dressing: sandbags + crates near the start ------------------------------------------
  for (let i = 0; i < 7; i++) {
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 4, 8), mat('fabric_sandbag'));
    bag.rotation.z = Math.PI / 2;
    bag.scale.set(1, 1, 0.62);
    bag.position.set(8 + (i % 4) * 0.62 + (i >= 4 ? 0.31 : 0), 0.12 + (i >= 4 ? 0.2 : 0), 20);
    bag.castShadow = bag.receiveShadow = true;
    root.add(bag);
  }
  addBox(-12, 0, 18, 1.2, 1.2, 1.2, 'wood', 'wood', { rotY: 0.3 });
  addBox(-10.6, 0, 18.4, 1.0, 0.8, 1.0, 'wood', 'wood', { rotY: -0.15 });

  game.render?.prepare?.(root);

  // Course bounds: the player may leave world.bounds while inside the course.
  const box = new THREE.Box3(
    new THREE.Vector3(O.x + CX - W / 2, O.y - 20, O.z + CZ - D / 2),
    new THREE.Vector3(O.x + CX + W / 2, O.y + 80, O.z + CZ + D / 2),
  );
  player.extraBounds.push({ box, fallback: { pos: new THREE.Vector3(...coursePos(...STATIONS.start.pos)), yaw: 0 } });

  registerShots(game, player);
  return { root, colliders, box };
}

// ------------------------------------------------------------------------------------ shots
function registerShots(game, player) {
  const P = (x, y, z) => coursePos(x, y, z);
  const hold = (actions, s) => window.__fps.hold(actions, s);

  game.registerShot('player-course', {
    description: 'Player movement test course (boxes, vault walls, stairs, ramps, corridor, corners, drops)',
    settle: 0.3,
    setup: () => {
      player.setPose({ pos: P(0, 0, 26), yaw: 0, pitch: 0 });
      player.debugView = {
        pos: new THREE.Vector3(...P(22, 17, 30)),
        target: new THREE.Vector3(...P(2, 0, -2)),
        fov: 62,
      };
    },
  });

  game.registerShot('player-crouch', {
    description: 'Crouched behind the 1.0 m low wall, looking over it at the course',
    settle: 0.6,
    setup: () => {
      const V = STATIONS.vault;
      player.setPose({ pos: P(V.x - 0.3, 0, V.z + 0.62), yaw: 8, pitch: -3 });
      hold(['crouch'], 0.1);
    },
  });

  game.registerShot('player-slide', {
    description: 'Mid-slide out of a tactical sprint: low eye, camera roll, FOV kick',
    settle: 0.28,
    renderFrames: 1,
    setup: () => {
      const T = STATIONS.track;
      player.setPose({ pos: P(T.x, 0, T.z0 + 1), yaw: 0, pitch: -4 });
      hold(['forward', 'sprint'], 0.1);
      hold(['forward'], 0.05);
      hold(['forward', 'sprint'], 0.9);
      game.input.setVirtual(['forward', 'crouch']);
    },
  });

  game.registerShot('player-mantle', {
    description: 'Mid-mantle onto the 1.8 m box: camera dip as the player pulls over the ledge',
    settle: 0.3,
    renderFrames: 1,
    setup: () => {
      const b = STATIONS.mantle.find((m) => m.h === 1.8);
      player.setPose({ pos: P(b.x, 0, STATIONS.mantleFrontZ + 1.2), yaw: 0, pitch: 8 });
      hold(['forward'], 0.25);
      game.input.setVirtual(['forward', 'jump']);
    },
  });

  game.registerShot('player-dead', {
    description: 'Death camera: collapsed on the ground, tipped onto one side',
    settle: 1.4,
    setup: () => {
      player.setPose({ pos: P(-2, 0, 8), yaw: 200, pitch: 0 });
      game.advance(0.1, 0);
      const src = new THREE.Vector3(...P(-8, 1.5, 4));
      player.takeDamage(1000, { source: { position: src } });
    },
  });
}
