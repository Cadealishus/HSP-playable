import * as THREE from 'three';
import { slab, boxAt, cylAt, stairZ, stairX, G, part, merged, cylPart } from '../airport/kit.js';
import { rectMinus } from '../airport/terminal.js';
import { buildVoids } from '../shared/voids.js';
import { registerSharedProps, prop, desk } from '../shared/props.js';
import { trs, fillMasks } from '../../util.js';
import { VOIDS, V, Y, PERIM, OUTER, TERRACES, STAIRS, FOUNTAIN } from './layout.js';

/**
 * ESTATE: the build. Shell (voids), the podium the house stands on, the
 * terraces and stairs, the perimeter with its gates, the gardens, and the
 * furniture. Every piece of cover collides at its real size.
 */

const _m = new THREE.Matrix4();
const B = Y.base;
const GY = Y.ground;
const U = Y.upper;
const BALUSTRADE = 1.0;

export function buildEstate(A, rng) {
  registerSharedProps(A);
  registerEstateProps(A, rng);
  buildVoids(A, VOIDS);
  ground(A);
  podium(A);
  terraces(A);
  perimeter(A);
  gardens(A, rng);
  furnish(A, rng);
}

// ================================================================ protos ==

function registerEstateProps(A, rng) {
  if (A.has('es_bed')) return;
  A.proto('es_bed', {
    geo: merged([part(1.7, 0.35, 2.1, 0, 0.2, 0, 0, 0, 0, [0.3, 0.3, 0.2]), part(1.8, 1.0, 0.1, 0, 0.5, -1.05)]),
    key: 'dark_timber',
  });
  A.proto('es_bedding', { geo: merged([part(1.62, 0.2, 2.0, 0, 0.47, 0.02), part(0.6, 0.14, 0.4, -0.42, 0.62, -0.75), part(0.6, 0.14, 0.4, 0.42, 0.62, -0.75)]), key: 'bed_linen' });
  A.proto('es_sofa', {
    geo: merged([part(2.2, 0.42, 0.9, 0, 0.21, 0), part(2.2, 0.45, 0.2, 0, 0.62, -0.35), part(0.2, 0.3, 0.9, -1.0, 0.55, 0), part(0.2, 0.3, 0.9, 1.0, 0.55, 0)]),
    key: 'sofa_fabric',
  });
  const shelf = [part(1.8, 2.2, 0.06, 0, 1.1, -0.17)];
  for (const x of [-0.88, 0.88]) shelf.push(part(0.04, 2.2, 0.4, x, 1.1, 0));
  for (let k = 0; k < 6; k++) shelf.push(part(1.76, 0.03, 0.38, 0, 0.05 + k * 0.42, 0));
  A.proto('es_bookcase', { geo: merged(shelf), key: 'dark_timber' });
  const books = [];
  for (let k = 0; k < 5; k++) {
    let x = -0.82;
    while (x < 0.8) {
      const w = rng.range(0.03, 0.07);
      const h = rng.range(0.22, 0.34);
      books.push(part(w, h, 0.24, x + w / 2, 0.07 + k * 0.42 + h / 2, 0.02));
      x += w + 0.004;
    }
  }
  A.proto('es_books', { geo: merged(books), key: 'carpet_red', castShadow: false });
  A.proto('es_dining', {
    geo: merged([part(3.2, 0.06, 1.1, 0, 0.75, 0), part(0.1, 0.72, 0.1, -1.4, 0.36, -0.4), part(0.1, 0.72, 0.1, 1.4, 0.36, -0.4), part(0.1, 0.72, 0.1, -1.4, 0.36, 0.4), part(0.1, 0.72, 0.1, 1.4, 0.36, 0.4)]),
    key: 'dark_timber',
  });
  A.proto('es_chair', {
    geo: merged([part(0.45, 0.05, 0.45, 0, 0.46, 0), part(0.45, 0.55, 0.05, 0, 0.75, -0.2), part(0.04, 0.46, 0.04, -0.19, 0.23, -0.19), part(0.04, 0.46, 0.04, 0.19, 0.23, -0.19), part(0.04, 0.46, 0.04, -0.19, 0.23, 0.19), part(0.04, 0.46, 0.04, 0.19, 0.23, 0.19)]),
    key: 'dark_timber',
    tilt: 0.03,
  });
  const rack = [part(1.2, 2.0, 0.05, 0, 1.0, -0.2)];
  for (let k = 0; k < 7; k++) rack.push(part(1.2, 0.03, 0.4, 0, 0.1 + k * 0.28, 0));
  for (const x of [-0.58, 0.58]) rack.push(part(0.04, 2.0, 0.4, x, 1.0, 0));
  A.proto('es_winerack', { geo: merged(rack), key: 'dark_timber' });
  const bottles = [];
  for (let k = 0; k < 7; k++) for (let i = 0; i < 9; i++) bottles.push(cylPart(0.035, 0.3, -0.5 + i * 0.125, 0.16 + k * 0.28, 0.05, 6, Math.PI / 2, 0));
  A.proto('es_bottles', { geo: merged(bottles), key: 'train_glass', castShadow: false });
  // trees: trunk + three foliage masses
  const leaves = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.applyMatrix4(trs(new THREE.Matrix4(), rng.range(-0.8, 0.8), 3.6 + rng.range(-0.3, 0.9), rng.range(-0.8, 0.8), rng.float() * 3, rng.range(1.3, 1.9), rng.range(1.0, 1.4), rng.range(1.3, 1.9)));
    fillMasks(g, 0.1, 0.3, 0.3);
    leaves.push(g);
  }
  A.proto('es_tree_top', { geo: merged(leaves), key: 'tree_leaves' });
  A.proto('es_tree_trunk', { geo: merged([cylPart(0.16, 3.4, 0, 1.7, 0, 8, 0, 0, 0.22)]), key: 'bark' });
  // cypress: a tall narrow column of foliage
  A.proto('es_cypress', { geo: merged([cylPart(0.5, 4.2, 0, 2.4, 0, 10, 0, 0, 0.12)]), key: 'hedge' });
}

// ================================================================ ground ==

function ground(A) {
  const holes = [];
  for (const v of VOIDS) {
    if (!v.floor || v.slope || Math.abs(v.y) > 0.01) continue;
    holes.push([v.x0, v.z0, v.x1 - v.x0, v.z1 - v.z0]);
  }
  for (const [x0, z0, x1, z1] of rectMinus([OUTER.x0, OUTER.z0, OUTER.x1, OUTER.z1], holes)) {
    slab(A, 'paving_stone', x0, -0.3, z0, x1, 0, z1, { collide: 'concrete' });
  }
  // the road outside the gate and the lanes round the wall
  slab(A, 'road_lane', OUTER.x0, 0, PERIM.z1 + 0.6, OUTER.x1, 0.01, OUTER.z1);
  slab(A, 'road_lane', OUTER.x0, 0, OUTER.z0, PERIM.x0 - 0.4, 0.01, PERIM.z1 + 0.6);
  slab(A, 'road_lane', PERIM.x1 + 0.4, 0, OUTER.z0, OUTER.x1, 0.01, PERIM.z1 + 0.6);
  // outer boundary: the neighbours' walls
  const t = 0.5;
  const h = 4.2;
  slab(A, 'perimeter_wall', OUTER.x0 - t, 0, OUTER.z0 - t, OUTER.x0, h, OUTER.z1 + t, { collide: 'concrete' });
  slab(A, 'perimeter_wall', OUTER.x1, 0, OUTER.z0 - t, OUTER.x1 + t, h, OUTER.z1 + t, { collide: 'concrete' });
  slab(A, 'perimeter_wall', OUTER.x0, 0, OUTER.z1, OUTER.x1, h, OUTER.z1 + t, { collide: 'concrete' });
  slab(A, 'villa_stone', OUTER.x0, 0, OUTER.z0 - t, OUTER.x1, h + 3, OUTER.z0, { collide: 'concrete' });
}

// ================================================================ podium ==

function podium(A) {
  // under the ground floor (the service stair cuts through it)
  for (const [x0, z0, x1, z1] of rectMinus([-25.8, -16.2, 21.8, 0], [[V.SB.x0 - 0.2, V.SB.z0, V.SB.x1 - V.SB.x0 + 0.4, V.SB.z1 - V.SB.z0]])) {
    slab(A, 'villa_stone', x0, 0, z0, x1, GY - 0.02, z1, { collide: 'concrete', masks: [0.3, 0.5, 0.3] });
  }
  // under the upper floor (the main stair's top flight cuts its south strip)
  for (const [x0, z0, x1, z1] of rectMinus([-25.8, -32.2, 21.8, -16.2], [[V.SU.x0 - 0.2, -17.0, V.SU.x1 - V.SU.x0 + 0.4, 0.8]])) {
    slab(A, 'villa_stone', x0, 0, z0, x1, U - 0.02, z1, { collide: 'concrete', masks: [0.3, 0.5, 0.3] });
  }
  // a plinth course where the stone meets the render
  slab(A, 'villa_stone', -26.3, GY - 0.02, -16.3, 21.9, GY + 0.25, -16.2);
  // ground-floor roof: flat, parapeted, never walkable (no collision)
  const hg = V.hallG;
  for (const [x0, z0, x1, z1] of rectMinus([-25.8, -16.2, 21.8, 0.2], [[hg.x0 - 0.2, hg.z0 - 0.2, hg.x1 - hg.x0 + 0.4, hg.z1 - hg.z0 + 0.4], [V.SU.x0 - 0.2, V.SU.z0, 4.4, 7]])) {
    slab(A, 'roof_flat', x0, GY + 3.45, z0, x1, GY + 3.55, z1);
  }
  slab(A, 'roof_flat', hg.x0 - 0.2, GY + 4.45, hg.z0 - 0.2, hg.x1 + 0.2, GY + 4.55, hg.z1 + 0.2);
  slab(A, 'villa_plaster', -25.8, GY + 3.2, 0.0, 21.8, GY + 4.1, 0.25);
  slab(A, 'villa_stone', -25.9, GY + 4.1, -0.05, 21.9, GY + 4.2, 0.3);
  // upper roof: tiled, low pitched halves (visual)
  const zc = -24.6;
  boxAt(A, 'roof_tile', -2, U + 3.95, zc - 3.9, 46.8, 0.14, 8.2, 0, { rx: -0.2 });
  boxAt(A, 'roof_tile', -2, U + 3.95, zc + 3.9, 46.8, 0.14, 8.2, 0, { rx: 0.2 });
  slab(A, 'villa_plaster', -24.4, U + 3.0, -32.4, 20.4, U + 3.25, -16.6);
  slab(A, 'dark_timber', -24.6, U + 3.2, -32.6, 20.6, U + 3.32, -16.4);
}

// ============================================================== terraces ==

function balustradeX(A, x0, x1, z, y) {
  if (x1 - x0 < 0.05) return;
  slab(A, 'villa_stone', x0, y, z - 0.15, x1, y + BALUSTRADE - 0.1, z + 0.15, { collide: 'concrete', masks: [0.3, 0.4, 0.2] });
  slab(A, 'villa_stone', x0 - 0.02, y + BALUSTRADE - 0.1, z - 0.2, x1 + 0.02, y + BALUSTRADE, z + 0.2);
}
function balustradeZ(A, z0, z1, x, y) {
  if (z1 - z0 < 0.05) return;
  slab(A, 'villa_stone', x - 0.15, y, z0, x + 0.15, y + BALUSTRADE - 0.1, z1, { collide: 'concrete', masks: [0.3, 0.4, 0.2] });
  slab(A, 'villa_stone', x - 0.2, y + BALUSTRADE - 0.1, z0 - 0.02, x + 0.2, y + BALUSTRADE, z1 + 0.02);
}

function terraces(A) {
  for (const [x0, z0, x1, z1, y, key] of TERRACES) {
    if (key === 'lawn') {
      // raised garden: a solid retaining block, a soil top, lawn over it
      slab(A, 'villa_stone', x0, 0, z0, x1, y - 0.05, z1, { collide: 'concrete', masks: [0.3, 0.6, 0.3] });
      slab(A, 'lawn', x0, y - 0.05, z0, x1, y, z1, { collide: 'foliage' });
    } else {
      slab(A, key, x0, y - 0.3, z0, x1, y, z1, { collide: 'concrete' });
    }
  }
  // front terrace edges
  balustradeX(A, -26.2, -4.3, 10.05, GY);
  balustradeX(A, 4.3, 32, 10.05, GY);
  balustradeZ(A, -0.2, 0.9, 31.85, GY);
  balustradeZ(A, 3.6, 10.2, 31.85, GY);
  balustradeX(A, 22.0, 31.7, -0.05, GY);
  // the garage roof overhang stands on three steel posts
  for (const z of [0.3, 5, 9.8]) slab(A, 'gate_black', 30.6, 0, z - 0.12, 30.84, GY - 0.3, z + 0.12, { collide: 'metal' });
  // west garden edges (it is a retaining wall: 3.4 m down to the rear yard)
  balustradeX(A, -44, -40.2, 10.05, GY);
  balustradeX(A, -35.8, -26.2, 10.05, GY);
  balustradeX(A, -43.8, -25.8, -15.85, GY);
  balustradeZ(A, -16, 10.2, -43.85, GY);

  // --- the grand stair: court up to the terrace, cheek walls stepping
  const g = STAIRS.grand;
  const n = Math.round(GY / 0.17);
  stairZ(A, 'paving_stone', g.x, g.w, g.zLow, B, n, GY / n, (g.zLow - 10.2) / n, -1, { base: -0.3 });
  for (const s of [-1, 1]) {
    const x = g.x + s * (g.w / 2 + 0.15);
    for (let k = 0; k < 4; k++) {
      const za = 10.2 + (k * (g.zLow - 10.2)) / 4;
      const zb = 10.2 + ((k + 1) * (g.zLow - 10.2)) / 4;
      const top = GY * (1 - k / 4) + BALUSTRADE * 0.9;
      slab(A, 'villa_stone', x - 0.15, 0, za, x + 0.15, top, zb, { collide: 'concrete' });
    }
  }
  // --- west garden stair
  const w = STAIRS.west;
  stairZ(A, 'paving_stone', w.x, w.w, w.zLow, B, n, GY / n, (w.zLow - 0) / n, -1, { base: -0.3 });
  for (const s of [-1, 1]) slab(A, 'villa_stone', w.x + s * (w.w / 2 + 0.1) - 0.1, 0, 0, w.x + s * (w.w / 2 + 0.1) + 0.1, GY + 0.9, w.zLow, { collide: 'concrete' });
  // --- the roof stair: steel flights from the east yard up to the garage roof
  const r = STAIRS.roof;
  stairX(A, 'gate_black', r.z, r.w, r.xLow, B, n, GY / n, (r.xLow - 32) / n, -1, { base: -0.05 });
  for (const s of [-1, 1]) {
    const z = r.z + s * (r.w / 2 + 0.05);
    for (let x = 32.5; x <= r.xLow; x += 1.9) {
      const y = GY * (1 - (x - 32) / (r.xLow - 32));
      cylAt(A, 'gate_black', x, y, z, 0.03, 1.0);
    }
    A.add('gate_black', G.cyl(A, 8), trs(_m, (32 + r.xLow) / 2, GY / 2 + 1.0, z, 0, 0.05, Math.hypot(r.xLow - 32, GY), 0.05, 0, Math.PI / 2 - Math.atan2(GY, r.xLow - 32)));
  }
}

// ============================================================= perimeter ==

function perimeter(A) {
  const P = PERIM;
  const t = 0.4;
  const run = (side, a0, a1, cut) => {
    let a = a0;
    for (const [ga, gb] of [...cut, [a1, a1]].sort((p, q) => p[0] - q[0])) {
      if (ga > a) {
        if (side === 's') wallSeg(A, a, P.z1, ga, P.z1 + t);
        if (side === 'n') wallSeg(A, a, P.z0 - t, ga, P.z0);
        if (side === 'w') wallSeg(A, P.x0 - t, a, P.x0, ga);
        if (side === 'e') wallSeg(A, P.x1, a, P.x1 + t, ga);
      }
      a = Math.max(a, gb);
    }
  };
  run('s', P.x0 - t, P.x1 + t, P.gates.s);
  run('n', P.x0 - t, P.x1 + t, []);
  run('w', P.z0, P.z1, P.gates.w);
  run('e', P.z0, P.z1, P.gates.e);
  // gate piers and the security gate: sliding leaf half across, on its track
  for (const x of [-3.3, 3.3, 6.1]) {
    slab(A, 'villa_stone', x - 0.35, 0, P.z1 - 0.15, x + 0.35, 3.6, P.z1 + 0.55, { collide: 'concrete' });
    slab(A, 'villa_stone', x - 0.42, 3.6, P.z1 - 0.22, x + 0.42, 3.75, P.z1 + 0.62);
  }
  slab(A, 'gate_black', -3.0, 0.05, P.z1 + 0.35, 0.2, 2.5, P.z1 + 0.43, { collide: 'metal' });
  for (let x = -2.8; x <= 0.1; x += 0.22) slab(A, 'gate_black', x - 0.015, 0.05, P.z1 + 0.33, x + 0.015, 2.6, P.z1 + 0.45);
  slab(A, 'gate_black', -6.8, 0.0, P.z1 + 0.34, -3.6, 0.06, P.z1 + 0.44);
  // pedestrian gate leaf swung open against the wall
  slab(A, 'gate_black', 4.45, 0.05, P.z1 - 1.3, 4.53, 2.2, P.z1);
  // the west pedestrian gate and the east service gate: leaves open
  slab(A, 'gate_black', P.x0 + 0.05, 0.05, 20, P.x0 + 1.5, 2.2, 20.08);
  slab(A, 'gate_black', P.x1 - 3.8, 0.05, -12.1, P.x1, 2.4, -12.02, { collide: 'metal' });
  for (const [x, z] of [[P.x0 - 0.2, 17.7], [P.x0 - 0.2, 20.3], [P.x1 + 0.2, -12.3], [P.x1 + 0.2, -7.7]]) {
    slab(A, 'villa_stone', x - 0.35, 0, z - 0.3, x + 0.35, 3.4, z + 0.3, { collide: 'concrete' });
  }
}

function wallSeg(A, x0, z0, x1, z1) {
  const h = PERIM.h;
  slab(A, 'perimeter_wall', x0, 0, z0, x1, h, z1, { collide: 'concrete', masks: [0.4, 0.6, 0.4] });
  slab(A, 'villa_stone', x0 - 0.05, h, z0 - 0.05, x1 + 0.05, h + 0.14, z1 + 0.05);
  // anti-climb spikes along the top
  const along = x1 - x0 > z1 - z0;
  const len = along ? x1 - x0 : z1 - z0;
  slab(A, 'gate_black', along ? x0 : (x0 + x1) / 2 - 0.02, h + 0.14, along ? (z0 + z1) / 2 - 0.02 : z0, along ? x1 : (x0 + x1) / 2 + 0.02, h + 0.5, along ? (z0 + z1) / 2 + 0.02 : z1, { masks: [0.4, 0.3, 0.2] });
  void len;
}

// =============================================================== gardens ==

function hedge(A, x0, z0, x1, z1, h = 1.3) {
  slab(A, 'hedge', x0, 0, z0, x1, h, z1, { collide: 'foliage', masks: [0.1, 0.4, 0.5] });
}
function lowWall(A, x0, z0, x1, z1, h = 0.9) {
  slab(A, 'villa_stone', x0, 0, z0, x1, h, z1, { collide: 'concrete', masks: [0.4, 0.5, 0.3] });
  slab(A, 'villa_stone', x0 - 0.04, h, z0 - 0.04, x1 + 0.04, h + 0.08, z1 + 0.04);
}
function tree(A, x, y, z, s = 1) {
  A.put('es_tree_trunk', x, y, z, (x * 3.1 + z) % 6.28, s);
  A.put('es_tree_top', x, y, z, (x * 1.7 + z * 2.3) % 6.28, s);
  A.box('wood', x, y + 1.5 * s, z, 0.4 * s, 3 * s, 0.4 * s);
}

function gardens(A, rng) {
  // the drive: gravel from the gate round the fountain to the forecourt
  slab(A, 'gravel_drive', -4, 0, 17, 4, 0.02, PERIM.z1);
  slab(A, 'gravel_drive', -8, 0, 24, 8, 0.02, 38);
  slab(A, 'gravel_drive', 4.3, 0, 10.2, 31, 0.02, 17);
  slab(A, 'gravel_drive', -26, 0, 10.2, -4.3, 0.02, 14);
  // lawns either side
  slab(A, 'lawn', -43.6, 0, 14.4, -9, 0.025, 47.6);
  slab(A, 'lawn', 9, 0, 17.4, 43.6, 0.025, 47.6);
  // the fountain: octagonal basin, water, a two-tier bowl on a column
  const f = FOUNTAIN;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = 2 * f.r * Math.tan(Math.PI / 8) + 0.1;
    boxAt(A, 'villa_stone', f.x + Math.cos(a) * f.r, 0.3, f.z + Math.sin(a) * f.r, 0.4, 0.6, len, -a, { collide: 'concrete' });
  }
  cylAt(A, 'water_pool', f.x, 0, f.z, f.r - 0.1, 0.42, { seg: 24 });
  cylAt(A, 'villa_stone', f.x, 0, f.z, 0.35, 1.6, { collide: 'concrete' });
  A.add('villa_stone', G.cyl(A, 20), trs(_m, f.x, 1.6, f.z, 0, 2.2, 0.25, 2.2));
  cylAt(A, 'water_pool', f.x, 1.72, f.z, 1.0, 0.02, { seg: 20 });
  cylAt(A, 'villa_stone', f.x, 1.72, f.z, 0.18, 0.9);
  A.add('villa_stone', G.cyl(A, 16), trs(_m, f.x, 2.6, f.z, 0, 1.1, 0.18, 1.1));

  // hedges along the drive (gaps for the cross paths), low walls, parterre
  hedge(A, -5.2, 40, -4.4, 47.2);
  hedge(A, 4.4, 40, 5.2, 46.8);
  hedge(A, -12, 17.4, -11.2, 28);
  hedge(A, -12, 32, -11.2, 44);
  hedge(A, 11.2, 20, 12, 30);
  hedge(A, 11.2, 34, 12, 38);
  lowWall(A, -40, 44.2, -14, 44.6);
  lowWall(A, -40.4, 16.4, -40, 44.2);
  // parterre in the west lawn: four hedge beds round a sundial
  for (const [cx, cz] of [[-30, 24], [-22, 24], [-30, 34], [-22, 34]]) {
    hedge(A, cx - 2.8, cz - 2.8, cx + 2.8, cz - 2.3, 0.8);
    hedge(A, cx - 2.8, cz + 2.3, cx + 2.8, cz + 2.8, 0.8);
    hedge(A, cx - 2.8, cz - 2.3, cx - 2.3, cz + 2.3, 0.8);
    slab(A, 'soil_bed', cx - 2.3, 0, cz - 2.3, cx + 2.8, 0.05, cz + 2.3);
  }
  cylAt(A, 'villa_stone', -26, 0, 29, 0.3, 1.0, { collide: 'concrete' });
  // east lawn: a garden pavilion's worth of cover (low walls, benches)
  lowWall(A, 24, 26, 34, 26.4);
  lowWall(A, 24, 36, 34, 36.4);
  // trees and cypresses
  for (const [x, z, s] of [[-36, 18, 1.1], [-16, 40, 1.0], [18, 42, 1.2], [36, 20, 1.05], [38, 40, 0.9], [-40, -28, 1.1], [30, -26, 1.2], [-8, -38, 0.8]]) tree(A, x, 0, z, s);
  for (let z = 12; z < 46; z += 4) {
    A.put('es_cypress', -42.8, 0, z, 0, 1 + ((z * 7) % 3) * 0.08);
    A.box('foliage', -42.8, 2.2, z, 0.8, 4.4, 0.8);
  }
  for (let z = -12; z < -1; z += 3.5) A.put('es_cypress', -42.6, GY, z, 0, 0.9);
  // parked cars: a black saloon on the forecourt, another in bay 2
  saloon(A, 22.5, 13.8, 0.05);
  saloon(A, 22.1, 5.4, 0.02);
  // guard post interior and the barrier kiosk
  const gp = V.guardPost;
  desk(A, 'laminate', gp.x0 + 2.4, B, gp.z1 - 0.9, Math.PI);
  A.put('mp_chair', gp.x0 + 2.4, B, gp.z1 - 1.8, 0.2);
  for (let k = 0; k < 2; k++) {
    A.put('mp_monitor', gp.x0 + 2.0 + k * 0.8, B + 0.76, gp.z1 - 0.8, Math.PI);
    slab(A, 'screen_sec', gp.x0 + 1.74 + k * 0.8, B + 0.9, gp.z1 - 0.83, gp.x0 + 2.26 + k * 0.8, B + 1.22, gp.z1 - 0.826);
  }
  slab(A, 'roof_flat', gp.x0 - 0.5, 3.05, gp.z0 - 0.5, gp.x1 + 0.5, 3.25, gp.z1 + 0.5);
  // the rear yard: plant and bins against the podium
  prop(A, 'mp_generator', 10, B, -34.2, 0);
  prop(A, 'mp_crate', -12, B, -34.6, 0.1);
  prop(A, 'mp_drum', 30, B, -2.6);
  prop(A, 'mp_drum', 30.7, B, -2.2);
  prop(A, 'mp_bin', 34, B, -1.2);
}

function saloon(A, x, z, ry) {
  boxAt(A, 'car_black', x, 0.62, z, 1.9, 0.72, 4.9, ry, { collide: 'metal' });
  boxAt(A, 'train_glass', x, 1.2, z + 0.2 * Math.cos(ry), 1.7, 0.48, 2.5, ry, { collide: 'glass' });
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const [lx, lz] of [[0.85, 1.6], [-0.85, 1.6], [0.85, -1.5], [-0.85, -1.5]]) {
    A.add('rubber', G.cyl(A, 14), trs(_m, x + lx * c + lz * s, 0.34, z - lx * s + lz * c, ry, 0.68, 0.24, 0.68, 0, Math.PI / 2));
  }
}

// ================================================================ rooms ==

function furnish(A, rng) {
  const g = GY;
  // entrance hall: a round table under the stair, two benches, rugs
  cylAt(A, 'dark_timber', 0, g, -5, 0.8, 0.8, { collide: 'wood' });
  cylAt(A, 'brass', 0, g + 0.8, -5, 0.2, 0.5);
  slab(A, 'carpet_red', -3, g, -8.8, 3, g + 0.01, -2);
  // office: two desks and a bookcase wall
  const of = V.office;
  desk(A, 'dark_timber', of.x0 + 3, g, of.z0 + 2.2, 0, 2.0, 0.9);
  desk(A, 'dark_timber', of.x0 + 7, g, of.z0 + 2.2, 0, 2.0, 0.9);
  for (const dx of [3, 7]) {
    A.put('mp_chair', of.x0 + dx, g, of.z0 + 3.2, 0.1);
    A.put('mp_monitor', of.x0 + dx, g + 0.76, of.z0 + 1.9, 0);
  }
  for (let k = 0; k < 4; k++) bookcase(A, of.x0 + 1.2 + k * 1.9, g, of.z0 + 0.25, 0);
  // library: shelves on three walls, armchairs
  const lb = V.library;
  for (let k = 0; k < 4; k++) bookcase(A, lb.x0 + 1.4 + k * 2.0, g, lb.z0 + 0.25, 0);
  bookcase(A, lb.x1 - 0.25, g, lb.z0 + 2.4, -Math.PI / 2);
  A.put('es_sofa', lb.x0 + 4.5, g, lb.z1 - 1.6, Math.PI);
  A.box('fabric', lb.x0 + 4.5, g + 0.4, lb.z1 - 1.6, 2.2, 0.8, 0.9);
  // dining room: the long table and its chairs
  const dn = V.dining;
  const dcx = (dn.x0 + dn.x1) / 2;
  const dcz = (dn.z0 + dn.z1) / 2;
  A.put('es_dining', dcx, g, dcz, 0);
  A.box('wood', dcx, g + 0.4, dcz, 3.2, 0.8, 1.1);
  for (let k = 0; k < 4; k++) {
    A.put('es_chair', dcx - 1.2 + k * 0.8, g, dcz - 0.85, 0);
    A.put('es_chair', dcx - 1.2 + k * 0.8, g, dcz + 0.85, Math.PI);
  }
  // lounge: sofas round a low table
  const ln = V.lounge;
  const lcx = (ln.x0 + ln.x1) / 2;
  const lcz = (ln.z0 + ln.z1) / 2;
  A.put('es_sofa', lcx, g, lcz - 1.8, 0);
  A.put('es_sofa', lcx, g, lcz + 1.8, Math.PI);
  A.box('fabric', lcx, g + 0.4, lcz - 1.8, 2.2, 0.8, 0.9);
  A.box('fabric', lcx, g + 0.4, lcz + 1.8, 2.2, 0.8, 0.9);
  slab(A, 'dark_timber', lcx - 0.8, g, lcz - 0.5, lcx + 0.8, g + 0.42, lcz + 0.5, { collide: 'wood' });
  // security room: the monitor wall, a desk, the alarm panel (see index.js)
  const sc = V.security;
  slab(A, 'metal_dark', sc.x0 + 0.1, g, sc.z0 + 0.1, sc.x1 - 0.1, g + 0.8, sc.z0 + 0.8, { collide: 'metal' });
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 3; k++) {
      const x = sc.x0 + 0.55 + k * 1.05;
      slab(A, 'metal_dark', x - 0.48, g + 1.1 + r * 0.62, sc.z0 + 0.05, x + 0.48, g + 1.66 + r * 0.62, sc.z0 + 0.12);
      slab(A, 'screen_sec', x - 0.44, g + 1.14 + r * 0.62, sc.z0 + 0.121, x + 0.44, g + 1.62 + r * 0.62, sc.z0 + 0.126);
    }
  }
  A.put('mp_chair', sc.x0 + 1.6, g, sc.z0 + 1.6, Math.PI + 0.2);
  prop(A, 'mp_lockers', sc.x1 - 0.3, g, sc.z1 - 1.2, -Math.PI / 2);
  // the alarm panel on the east wall by the door
  slab(A, 'cabinet_grey', sc.x1 - 0.08, g + 1.1, sc.z0 + 1.2, sc.x1, g + 1.7, sc.z0 + 1.8);
  slab(A, 'alarm_led', sc.x1 - 0.1, g + 1.55, sc.z0 + 1.3, sc.x1 - 0.08, g + 1.62, sc.z0 + 1.38);
  // kitchen: counters on three sides, an island
  const kt = V.kitchen;
  slab(A, 'laminate', kt.x0 + 0.1, g, kt.z0 + 0.1, kt.x1 - 0.1, g + 0.9, kt.z0 + 0.75, { collide: 'wood' });
  slab(A, 'laminate', kt.x1 - 0.75, g, kt.z0 + 0.75, kt.x1 - 0.1, g + 0.9, kt.z1 - 1.6, { collide: 'wood' });
  slab(A, 'steel', kt.x0 + 2.4, g, kt.z0 + 2.4, kt.x0 + 5.4, g + 0.92, kt.z0 + 3.4, { collide: 'metal' });
  // pantry: shelving, crates, the service trolley
  const pn = V.pantry;
  for (let k = 0; k < 3; k++) A.put('es_winerack', pn.x0 + 1.2 + k * 1.4, g, pn.z0 + 0.3, 0);
  A.box('wood', pn.x0 + 2.6, g + 1.0, pn.z0 + 0.3, 4.2, 2.0, 0.45);
  prop(A, 'mp_crate', pn.x1 - 1.2, g, pn.z1 - 1.0, 0.2);
  prop(A, 'mp_crate', pn.x1 - 1.1, g + 0.66, pn.z1 - 1.0, 0.4, 0.95);
  // cloakroom
  prop(A, 'mp_lockers', V.cloak.x0 + 0.3, g, V.cloak.z0 + 2.0, Math.PI / 2);

  // ---- upper floor
  const u = U;
  for (const id of ['bed1', 'bed2', 'master']) {
    const r = V[id];
    const cx = (r.x0 + r.x1) / 2;
    A.put('es_bed', cx, u, r.z0 + 1.3, Math.PI);
    A.put('es_bedding', cx, u, r.z0 + 1.3, Math.PI);
    A.box('fabric', cx, u + 0.35, r.z0 + 1.3, 1.8, 0.7, 2.2);
    slab(A, 'dark_timber', r.x0 + 0.2, u, r.z1 - 0.8, r.x0 + 2.0, u + 2.0, r.z1 - 0.2, { collide: 'wood' });
  }
  const ms = V.master;
  A.put('es_sofa', ms.x1 - 3, u, ms.z1 - 1.6, Math.PI);
  A.box('fabric', ms.x1 - 3, u + 0.4, ms.z1 - 1.6, 2.2, 0.8, 0.9);
  const st = V.study;
  desk(A, 'dark_timber', (st.x0 + st.x1) / 2, u, st.z0 + 2.5, 0, 2.2, 1.0);
  A.put('mp_chair', (st.x0 + st.x1) / 2, u, st.z0 + 3.5, 0);
  for (let k = 0; k < 3; k++) bookcase(A, st.x0 + 1.3 + k * 2.0, u, st.z1 - 0.25, Math.PI);

  // ---- basement
  const b = B;
  const cl = V.cellar;
  for (let k = 0; k < 6; k++) {
    A.put('es_winerack', cl.x0 + 1.0 + k * 1.4, b, cl.z0 + 0.3, 0);
    A.put('es_bottles', cl.x0 + 1.0 + k * 1.4, b, cl.z0 + 0.3, 0);
  }
  A.box('wood', (cl.x0 + cl.x1) / 2, b + 1.0, cl.z0 + 0.3, 8.4, 2.0, 0.45);
  prop(A, 'mp_table', cl.x0 + 4, b, cl.z0 + 3.4, 0);
  A.put('mp_plastic_chair', cl.x0 + 4, b, cl.z0 + 4.4, 3.2);
  const la = V.laundry;
  for (let k = 0; k < 4; k++) slab(A, 'gate_steel', la.x0 + 0.5 + k * 0.8, b, la.z0 + 0.2, la.x0 + 1.2 + k * 0.8, b + 0.9, la.z0 + 0.85, { collide: 'metal' });
  const pr = V.plantRoom;
  prop(A, 'mp_generator', pr.x0 + 3, b, pr.z0 + 1.2, 0);
  for (let k = 0; k < 4; k++) prop(A, 'mp_cabinet', pr.x1 - 0.5 - k * 0.9, b, pr.z1 - 0.3, Math.PI);
  cylAt(A, 'pipe_red', pr.x0 + 7, b, pr.z0 + 1.2, 0.6, 2.2, { collide: 'metal' });
  const so = V.store;
  prop(A, 'mp_crate', so.x0 + 1, b, so.z0 + 1, 0.1);
  prop(A, 'mp_crate', so.x0 + 1.1, b + 0.66, so.z0 + 1, 0.3, 0.95);
  prop(A, 'mp_drum', so.x1 - 0.8, b, so.z0 + 0.8);
  const ga = V.garage;
  for (let k = 0; k < 3; k++) prop(A, 'mp_lockers', ga.x0 + 2 + k * 1.3, b, ga.z0 + 0.3, 0);
  prop(A, 'mp_bottles', ga.x1 - 0.5, b, ga.z0 + 1.2, -Math.PI / 2);
  // garage doors: bay 1 rolled up (the box over it), bays 2 and 3 shut
  for (const [x0, x1, open] of [[15.6, 18.6, true], [20.6, 23.6, false], [25.6, 28.6, false]]) {
    slab(A, 'garage_door', x0, 2.72, 10.0, x1, 3.05, 10.35);
    if (!open) slab(A, 'garage_door', x0, 0, 10.05, x1, 2.72, 10.15, { collide: 'metal' });
  }
  // service entrance canopy and the kitchen roof-door canopy
  slab(A, 'gate_black', -19.6, 2.8, 10.2, -16.8, 2.9, 11.2);
  // the service hall: shelving and bins along the back wall
  prop(A, 'mp_bin', -24, b, 6.9);
  prop(A, 'mp_crate', 2.5, b, 6.95, 0);
}

function bookcase(A, x, y, z, ry) {
  A.put('es_bookcase', x, y, z, ry);
  A.put('es_books', x, y, z, ry);
  A.box('wood', x - Math.sin(ry) * 0.0, y + 1.1, z, 1.8, 2.2, 0.42, ry);
}
