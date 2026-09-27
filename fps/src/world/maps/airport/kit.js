import * as THREE from 'three';
import { Assembler } from '../../builder.js';
import { PALETTE } from '../../palette.js';
import { trs, chamferBox, plainBox, fillMasks, weatherProp } from '../../util.js';
import { mergeSimple } from '../../kit.js';
import { AIRPORT_PALETTE } from './palette.js';

/**
 * HOLDING PATTERN — the airport's building kit.
 *
 * A thin layer over the world's Assembler: the same merge-by-material static
 * batches, instanced prototypes and box collision proxies, with helpers shaped
 * for an airport (axis-aligned slabs given by min/max corners, walls with door
 * gaps, glazed curtain walls, ramps and stairs) instead of for a street of
 * facades. Everything is authored in LEVEL metres; the Assembler bakes the
 * level->world yaw into every vertex, proxy and light.
 *
 * COLLISION CONVENTION. The AI's navigation grid (src/ai/nav.js) is a single
 * layer: one downward ray per cell from above the level takes the FIRST floor
 * it meets. So nothing overhead gets a collision proxy — roofs, ceilings,
 * soffits, hanging signs, the fuselage crown, the wings — or the grid would
 * read the roof as the floor. Walkable decks (the overlook, the cabin floor,
 * the bridge) do collide, and simply own the cells beneath them.
 */

const _m = new THREE.Matrix4();

export class AirportAssembler extends Assembler {
  mat(key) {
    let m = this._mats.get(key);
    if (m) return m;
    const def = AIRPORT_PALETTE[key] ?? PALETTE[key];
    if (!def) {
      console.warn(`[airport] unknown palette key "${key}"`);
      return this.mat('concrete_white');
    }
    m = this.materials.get(def.name, def.opts);
    this._mats.set(key, m);
    return m;
  }

  surfaceOf(key) {
    return AIRPORT_PALETTE[key]?.surface ?? PALETTE[key]?.surface ?? 'concrete';
  }
}

// ------------------------------------------------------------ geometry --
export const G = {
  box: (A) => A.cache('ap:box', () => chamferBox(1, 1, 1, 0.012)),
  soft: (A) => A.cache('ap:soft', () => chamferBox(1, 1, 1, 0.04)),
  thin: (A) => A.cache('ap:thin', () => plainBox()),
  unit: (A) => A.cache('ap:unit', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (A, seg = 16) =>
    A.cache(`ap:cyl${seg}`, () => {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1, false);
      return weatherProp(fillMasks(g, 0.1, 0.1, 0), { base: 0.3 });
    }),
  pane: (A) =>
    A.cache('ap:pane', () => {
      const g = new THREE.PlaneGeometry(1, 1);
      return fillMasks(g, 0, 0, 0);
    }),
};

/**
 * An axis-aligned slab from its min/max corners. `o.collide` is a surface tag
 * (or true for the key's own surface) to add a matching collision proxy.
 */
export function slab(A, key, x0, y0, z0, x1, y1, z1, o = {}) {
  const sx = Math.abs(x1 - x0);
  const sy = Math.abs(y1 - y0);
  const sz = Math.abs(z1 - z0);
  if (sx < 1e-4 || sy < 1e-4 || sz < 1e-4) return;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  if (key) {
    const geo = o.geo ? o.geo(A) : Math.min(sx, sy, sz) < 0.06 ? G.thin(A) : G.box(A);
    A.add(key, geo, trs(_m, cx, cy, cz, 0, sx, sy, sz), o.masks ? { masks: o.masks } : null);
  }
  if (o.collide) {
    const surf = o.collide === true ? A.surfaceOf(key) : o.collide;
    A.box(surf, cx, cy, cz, sx, sy, sz);
  }
}

/** Collision only (blocking volumes, clip). */
export function clip(A, x0, y0, z0, x1, y1, z1, surface = 'concrete') {
  A.box(surface, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
}

/** A box at a centre with a yaw. */
export function boxAt(A, key, cx, cy, cz, sx, sy, sz, ry = 0, o = {}) {
  const geo = o.geo ? o.geo(A) : G.box(A);
  A.add(key, geo, trs(_m, cx, cy, cz, ry, sx, sy, sz, o.rx ?? 0, o.rz ?? 0), o.masks ? { masks: o.masks } : null);
  if (o.collide) A.box(o.collide === true ? A.surfaceOf(key) : o.collide, cx, cy, cz, sx, sy, sz, ry);
}

/** A vertical cylinder standing on y0. */
export function cylAt(A, key, x, y0, z, r, h, o = {}) {
  A.add(key, G.cyl(A, o.seg ?? 16), trs(_m, x, y0 + h / 2, z, o.ry ?? 0, r * 2, h, r * 2), o.masks ? { masks: o.masks } : null);
  if (o.collide) A.box(o.collide === true ? A.surfaceOf(key) : o.collide, x, y0 + h / 2, z, r * 1.6, h, r * 1.6);
}

/**
 * Split [0, len] around door gaps. Returns [[a, b, solid]] runs, where a door
 * run is solid above its head height.
 */
function runs(len, openings) {
  const out = [];
  let t = 0;
  const ops = [...openings].sort((p, q) => p[0] - q[0]);
  for (const [a, b] of ops) {
    if (a > t) out.push([t, a, true]);
    out.push([a, b, false]);
    t = b;
  }
  if (t < len) out.push([t, len, true]);
  return out;
}

/**
 * A straight wall along (x0,z0)->(x1,z1), `t` thick, from y0 to y1, with door
 * gaps. A gap wider than 3 m is open full height (a colonnade / arch); a
 * narrower one gets a lintel at `door` metres. Axis-aligned or diagonal.
 */
export function wall(A, key, x0, z0, x1, z1, y0, y1, t, openings = [], o = {}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const ry = Math.atan2(-dz, dx); // local +x along the wall
  const door = o.door ?? 2.6;
  const doorY = o.doorY ?? y0 + door;
  const surf = o.collide === false ? null : o.collide ?? A.surfaceOf(key);
  for (const [a, b, solid] of runs(len, openings)) {
    const w = b - a;
    const m = (a + b) / 2;
    const cx = x0 + ux * m;
    const cz = z0 + uz * m;
    const pieces = solid ? [[y0, y1]] : w > 3 ? [] : [[Math.max(y0, doorY), y1]];
    for (const [ya, yb] of pieces) {
      if (yb - ya < 0.02) continue;
      A.add(key, G.box(A), trs(_m, cx, (ya + yb) / 2, cz, ry, w, yb - ya, t), o.masks ? { masks: o.masks } : null);
      if (surf && ya < (o.collideTop ?? 99)) A.box(surf, cx, (ya + yb) / 2, cz, w, yb - ya, t, ry);
    }
    if (!solid && o.frame && doorY > y0) {
      // a steel door frame: two jambs and a head
      const fw = 0.08;
      const fh = Math.min(doorY, y1) - y0;
      for (const s of [a + fw / 2, b - fw / 2]) {
        A.add(o.frame, G.box(A), trs(_m, x0 + ux * s, y0 + fh / 2, z0 + uz * s, ry, fw, fh, t + 0.04));
      }
      if (w <= 3 && doorY < y1) A.add(o.frame, G.box(A), trs(_m, cx, doorY - fw / 2, cz, ry, w, fw, t + 0.04));
    }
  }
}

/**
 * A glazed curtain wall: solid upstand, glass to `y1`, mullions every `bay`
 * metres and transoms at `transoms` heights. Collides full height (glass stops
 * players, bullets and sight lines are the physics layer's call).
 */
export function curtainWall(A, x0, z0, x1, z1, y0, y1, openings = [], o = {}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const ry = Math.atan2(-dz, dx);
  const up = o.upstand ?? 0.6;
  const bay = o.bay ?? 3;
  const door = o.door ?? 2.6;
  const transoms = o.transoms ?? [3.4, 6.4];
  const mk = o.mullionKey ?? 'alu_dark';
  const at = (s) => [x0 + ux * s, z0 + uz * s];

  for (const [a, b, solid] of runs(len, openings)) {
    const w = b - a;
    const [cx, cz] = at((a + b) / 2);
    const gy0 = solid ? y0 + up : y0 + door;
    if (solid && up > 0) {
      A.add('sandstone', G.box(A), trs(_m, cx, y0 + up / 2, cz, ry, w, up, 0.3), { masks: [0.2, 0.3, 0.1] });
    }
    // glass pane, one quad per run (both faces lit through DoubleSide)
    A.add('glazing', G.pane(A), trs(_m, cx, (gy0 + y1) / 2, cz, ry, w, y1 - gy0, 1));
    A.box('glass', cx, (y0 + y1) / 2, cz, w, y1 - y0, 0.2, ry);
    if (!solid) {
      // door head transom
      A.add(mk, G.box(A), trs(_m, cx, y0 + door, cz, ry, w, 0.12, 0.16));
      A.box('glass', cx, (y0 + door + y1) / 2, cz, w, y1 - y0 - door, 0.2, ry);
    }
  }
  // mullions, full height, on the bay grid (skipping door gaps' interiors)
  const n = Math.max(1, Math.round(len / bay));
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    let inDoor = false;
    for (const [a, b] of openings) if (s > a + 0.05 && s < b - 0.05) inDoor = true;
    if (inDoor) continue;
    const [mx, mz] = at(s);
    A.add(mk, G.box(A), trs(_m, mx, (y0 + y1) / 2, mz, ry, 0.09, y1 - y0, 0.22), { masks: [0.4, 0.2, 0] });
  }
  for (const ty of transoms) {
    if (ty >= y1 - 0.1) continue;
    for (const [a, b, solid] of runs(len, openings)) {
      if (!solid && ty < door) continue;
      const [cx, cz] = at((a + b) / 2);
      A.add(mk, G.box(A), trs(_m, cx, y0 + ty, cz, ry, b - a, 0.07, 0.14));
    }
  }
  // sill and head
  const [hx, hz] = at(len / 2);
  A.add(mk, G.box(A), trs(_m, hx, y1 - 0.08, hz, ry, len, 0.16, 0.3));
}

/**
 * A slab ramp between two points on the z axis (xc centre, width w), top
 * surface on the line (zA,yA)->(zB,yB). Collides.
 */
export function rampZ(A, key, xc, w, zA, yA, zB, yB, thick = 0.3, o = {}) {
  const dz = zB - zA;
  const dy = yB - yA;
  const L = Math.hypot(dz, dy);
  const th = Math.atan2(-dy, dz);
  const ny = Math.cos(th);
  const nz = Math.sin(th);
  const cy = (yA + yB) / 2 - (ny * thick) / 2;
  const cz = (zA + zB) / 2 - (nz * thick) / 2;
  trs(_m, xc, cy, cz, 0, w, thick, L, th, 0);
  if (key) A.add(key, o.geo ? o.geo(A) : G.box(A), _m, o.masks ? { masks: o.masks } : null);
  if (o.collide !== false) {
    trs(_m, xc, cy, cz, 0, w, thick, L, th, 0);
    A.collideGeo(o.collide ?? A.surfaceOf(key ?? 'concrete_white'), G.unit(A), _m);
  }
}

/** Same along the x axis (zc centre, width w). */
export function rampX(A, key, zc, w, xA, yA, xB, yB, thick = 0.3, o = {}) {
  const dx = xB - xA;
  const dy = yB - yA;
  const L = Math.hypot(dx, dy);
  const ph = Math.atan2(dy, dx);
  const nx = -Math.sin(ph);
  const ny = Math.cos(ph);
  const cx = (xA + xB) / 2 - (nx * thick) / 2;
  const cy = (yA + yB) / 2 - (ny * thick) / 2;
  trs(_m, cx, cy, zc, 0, L, thick, w, 0, ph);
  if (key) A.add(key, o.geo ? o.geo(A) : G.box(A), _m, o.masks ? { masks: o.masks } : null);
  if (o.collide !== false) {
    trs(_m, cx, cy, zc, 0, L, thick, w, 0, ph);
    A.collideGeo(o.collide ?? A.surfaceOf(key ?? 'concrete_white'), G.unit(A), _m);
  }
}

/**
 * A straight stair of solid blocks along z (dir -1 climbs toward -z) starting
 * at zStart on y0. Each block runs to the floor, so there is nothing to walk
 * under and the nav grid reads it as a slope.
 */
export function stairZ(A, key, xc, w, zStart, y0, steps, rise, run, dir = -1, o = {}) {
  for (let i = 0; i < steps; i++) {
    const za = zStart + dir * i * run;
    const zb = za + dir * run;
    const top = y0 + (i + 1) * rise;
    slab(A, key, xc - w / 2, o.base ?? y0, Math.min(za, zb), xc + w / 2, top, Math.max(za, zb), { collide: true, masks: [0.5, 0.2, 0.1] });
  }
}

/** Same along x (dir +1 climbs toward +x). */
export function stairX(A, key, zc, w, xStart, y0, steps, rise, run, dir = 1, o = {}) {
  for (let i = 0; i < steps; i++) {
    const xa = xStart + dir * i * run;
    const xb = xa + dir * run;
    const top = y0 + (i + 1) * rise;
    slab(A, key, Math.min(xa, xb), o.base ?? y0, zc - w / 2, Math.max(xa, xb), top, zc + w / 2, { collide: true, masks: [0.5, 0.2, 0.1] });
  }
}

/** Merge a list of geometries into one prototype geometry and free the parts. */
export function merged(list) {
  const g = mergeSimple(list);
  for (const q of list) q.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A local-space chamfer box piece for building prototype geometry. */
export function part(sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0, masks = null) {
  const g = chamferBox(sx, sy, sz, Math.min(0.01, Math.min(sx, sy, sz) * 0.2));
  g.applyMatrix4(trs(new THREE.Matrix4(), x, y, z, ry, 1, 1, 1, rx, rz));
  if (masks) fillMasks(g, masks[0], masks[1], masks[2]);
  return g;
}

/** A local-space cylinder piece (axis y unless rotated). */
export function cylPart(r, h, x, y, z, seg = 12, rx = 0, rz = 0, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, seg, 1, false);
  g.applyMatrix4(trs(new THREE.Matrix4(), x, y, z, 0, 1, 1, 1, rx, rz));
  fillMasks(g, 0.2, 0.15, 0);
  return g;
}
