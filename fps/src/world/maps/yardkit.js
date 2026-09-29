import * as THREE from 'three';
import { Assembler } from '../builder.js';
import { PALETTE } from '../palette.js';
import { AIRPORT_PALETTE } from './airport/palette.js';
import { trs, chamferBox, fillMasks } from '../util.js';
import { slab, clip, boxAt, cylAt, G, part, merged, cylPart } from './airport/kit.js';

/**
 * WORLD — the shared kit for the open-air MP maps (INDUSTRIAL YARD, DESERT
 * OUTPOST).
 *
 * Builds on the airport kit (axis-aligned slabs from min/max corners, boxes,
 * cylinders, merged prototype parts) and adds the pieces an outdoor combat map
 * is made of: walls with door openings of a given head height, stairs whose
 * collision is ONE smooth ramp, steel railings, catwalk decks, shipping
 * containers (instanced), perimeter walls with blocking volumes, and a generic
 * collision / clearance self-test.
 *
 * NAV CONVENTIONS (src/ai/nav.js is a single-layer grid sampled from above,
 * 0.8 m cells, 0.45 m step limit):
 *  - Nothing overhead collides: roofs, canopies, crane girders, hanging loads.
 *    Anything that collides overhead becomes the floor of every cell under it.
 *  - Elevated walkways sit over ground that is blocked anyway (racks, pipes,
 *    tanks, vehicles), so they never cut a ground route.
 *  - Stairs: visual steps, one ramp collider at <= 0.53 rise per metre, so the
 *    climb over a nav cell is exact and under the step limit. Per-step boxes
 *    quantise to two or three risers per cell and the AI cannot climb them.
 *  - Doors: every walkable opening is at least 2.5 m clear (the capsule is
 *    1.78 m; the self-test demands 2.4 m and walks through standing).
 */

export { slab, clip, boxAt, cylAt, G, part, merged, cylPart };

const _m = new THREE.Matrix4();

/** An Assembler whose palette lookup is: the map's own, the airport's, the town's. */
export function makeAssembler(palette, name, args) {
  class MapAssembler extends Assembler {
    mat(key) {
      let m = this._mats.get(key);
      if (m) return m;
      const def = palette[key] ?? AIRPORT_PALETTE[key] ?? PALETTE[key];
      if (!def) {
        console.warn(`[${name}] unknown palette key "${key}"`);
        return this.mat('concrete');
      }
      m = this.materials.get(def.name, def.opts);
      this._mats.set(key, m);
      return m;
    }

    surfaceOf(key) {
      return palette[key]?.surface ?? AIRPORT_PALETTE[key]?.surface ?? PALETTE[key]?.surface ?? 'concrete';
    }
  }
  return new MapAssembler(args);
}

/**
 * An axis-aligned wall from (x0, z0) to (x1, z1) (one of the two must match),
 * `t` thick, standing from y0 to y1, with openings `[a, b, head]`: distances
 * along the wall from its start and the opening's head height ABOVE y0. A
 * lintel fills the head to the wall top (visual only unless `o.lintelCollide`).
 * `o.frame` adds a steel frame key.
 */
export function wallO(A, key, x0, z0, x1, z1, y0, y1, t, openings = [], o = {}) {
  const alongX = Math.abs(z1 - z0) < 1e-6;
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const sgn = alongX ? Math.sign(x1 - x0) || 1 : Math.sign(z1 - z0) || 1;
  const surf = o.collide === false ? null : o.collide ?? A.surfaceOf(key);
  const at = (s) => (alongX ? [x0 + sgn * s, z0] : [x0, z0 + sgn * s]);
  const piece = (a, b, ya, yb, lintel = false) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    // Lintels over openings are visual only unless asked: a collider over a
    // doorway becomes the AI's floor for the cells inside the wall line.
    const cs = lintel && o.lintelCollide !== true ? false : surf ?? false;
    const [pa, qa] = at(a);
    const [pb, qb] = at(b);
    const xa = alongX ? Math.min(pa, pb) : x0 - t / 2;
    const xb = alongX ? Math.max(pa, pb) : x0 + t / 2;
    const za = alongX ? z0 - t / 2 : Math.min(qa, qb);
    const zb = alongX ? z0 + t / 2 : Math.max(qa, qb);
    slab(A, key, xa, ya, za, xb, yb, zb, { collide: cs, masks: o.masks });
  };
  const ops = [...openings].sort((p, q) => p[0] - q[0]);
  let s = 0;
  for (const [a, b, head] of ops) {
    piece(s, a, y0, y1);
    piece(a, b, y0 + head, y1, true);
    if (o.frame) {
      const fw = 0.1;
      const [ax, az] = at(a);
      const [bx, bz] = at(b);
      for (const [px, pz] of [[ax, az], [bx, bz]]) {
        if (alongX) slab(A, o.frame, px - fw / 2, y0, z0 - t / 2 - 0.03, px + fw / 2, y0 + head, z0 + t / 2 + 0.03);
        else slab(A, o.frame, x0 - t / 2 - 0.03, y0, pz - fw / 2, x0 + t / 2 + 0.03, y0 + head, pz + fw / 2);
      }
      if (alongX) slab(A, o.frame, Math.min(ax, bx), y0 + head - fw, z0 - t / 2 - 0.03, Math.max(ax, bx), y0 + head, z0 + t / 2 + 0.03);
      else slab(A, o.frame, x0 - t / 2 - 0.03, y0 + head - fw, Math.min(az, bz), x0 + t / 2 + 0.03, y0 + head, Math.max(az, bz));
    }
    s = b;
  }
  piece(s, len, y0, y1);
}

/**
 * A straight flight of steps along `axis` ('x' | 'z') centred on the other
 * axis at `c`, `w` wide, from coordinate `a` (floor y0) to `b` (floor y1).
 * Visual: solid steps to `base` (default: y0). Collision: one ramp slab plus a
 * fill under it. Keep |y1 - y0| / |b - a| <= 0.53 for the AI.
 */
export function flight(A, key, axis, c, w, a, b, y0, y1, o = {}) {
  const len = Math.abs(b - a);
  const dir = Math.sign(b - a) || 1;
  const H = y1 - y0;
  const steps = Math.max(1, Math.round(Math.abs(H) / (o.rise ?? 0.18)));
  const run = len / steps;
  const base = o.base ?? Math.min(y0, y1);
  const up = H >= 0;
  for (let i = 0; i < steps; i++) {
    const s0 = a + dir * i * run;
    const s1 = s0 + dir * run;
    // step i is the (i+1)th riser from the y0 end
    const top = up ? y0 + ((i + 1) * H) / steps : y0 + (i * H) / steps;
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    if (axis === 'x') slab(A, key, lo, base, c - w / 2, hi, top, c + w / 2, { masks: [0.6, 0.3, 0.2] });
    else slab(A, key, c - w / 2, base, lo, c + w / 2, top, hi, { masks: [0.6, 0.3, 0.2] });
  }
  // collision: the ramp across the nosings and a fill below it
  const sl = Math.hypot(len, H);
  const th = Math.atan2(H, len); // signed: + climbs toward b
  const thick = 0.3;
  const mid = (a + b) / 2;
  const midY = (y0 + y1) / 2;
  const unit = A.cache('yk:unit', () => new THREE.BoxGeometry(1, 1, 1));
  const surf = o.collide ?? A.surfaceOf(key);
  if (axis === 'x') {
    // rz = +phi lifts the +x end; the top face normal is (-sin phi, cos phi)
    const phi = dir * th;
    trs(_m, mid + (Math.sin(phi) * thick) / 2, midY - (Math.cos(phi) * thick) / 2, c, 0, sl, thick, w, 0, phi);
  } else {
    // rx = +psi drops the +z end; the top face normal is (0, cos psi, sin psi)
    const psi = -dir * th;
    trs(_m, c, midY - (Math.cos(psi) * thick) / 2, mid - (Math.sin(psi) * thick) / 2, 0, w, thick, sl, psi, 0);
  }
  A.collideGeo(surf, unit, _m);
  // A stepped fill under the ramp so nothing (not even a crouch) gets beneath
  // it: each segment's top sits just under the ramp at the segment's low end.
  const lowY = Math.min(y0, y1);
  const segs = Math.max(1, Math.ceil(Math.abs(H) / 0.6));
  for (let k = 0; k < segs; k++) {
    // parametrise from the low end (t = 0) to the high end (t = 1)
    const t0 = k / segs;
    const t1 = (k + 1) / segs;
    const top = lowY + Math.abs(H) * t0 - 0.12;
    if (top - base < 0.05) continue;
    const lowEnd = up ? a : b;
    const hiEnd = up ? b : a;
    const pa = lowEnd + (hiEnd - lowEnd) * t0;
    const pb = lowEnd + (hiEnd - lowEnd) * t1;
    const lo = Math.min(pa, pb);
    const hi = Math.max(pa, pb);
    if (axis === 'x') clip(A, lo, base, c - w / 2, hi, top, c + w / 2, surf);
    else clip(A, c - w / 2, base, lo, c + w / 2, top, hi, surf);
  }
  if (o.rails) {
    for (const side of o.rails === 'both' ? [-1, 1] : [o.rails]) {
      const rc = c + side * (w / 2 - 0.04);
      if (axis === 'x') railSlope(A, a, rc, b, rc, y0, y1);
      else railSlope(A, rc, a, rc, b, y0, y1);
    }
  }
}

/** A sloped handrail (visual) between two plan points at floor heights y0 -> y1. */
export function railSlope(A, x0, z0, x1, z1, y0, y1, h = 1.0) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  const dy = y1 - y0;
  const ry = Math.atan2(-dz, dx);
  const pitch = Math.atan2(dy, L);
  A.add('steel_yellow', G.thin(A), trs(_m, (x0 + x1) / 2, (y0 + y1) / 2 + h, (z0 + z1) / 2, ry, Math.hypot(L, dy), 0.05, 0.05, 0, pitch));
  const n = Math.max(1, Math.round(L / 1.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + dy * t;
    A.add('steel_yellow', G.thin(A), trs(_m, x0 + dx * t, y + h / 2, z0 + dz * t, 0, 0.045, h, 0.045));
  }
}

/**
 * A level steel railing along a straight plan line at floor y: posts, top rail
 * and knee rail, with a thin collision slab (1.05 m) so nobody walks off.
 */
export function rail(A, x0, z0, x1, z1, y, o = {}) {
  const h = o.h ?? 1.05;
  const key = o.key ?? 'steel_yellow';
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  if (L < 0.05) return;
  const ry = Math.atan2(-dz, dx);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  A.add(key, G.thin(A), trs(_m, cx, y + h, cz, ry, L, 0.05, 0.05));
  A.add(key, G.thin(A), trs(_m, cx, y + h * 0.5, cz, ry, L, 0.04, 0.04));
  A.add(key, G.thin(A), trs(_m, cx, y + 0.06, cz, ry, L, 0.1, 0.012));
  const n = Math.max(1, Math.round(L / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    A.add(key, G.thin(A), trs(_m, x0 + dx * t, y + h / 2, z0 + dz * t, ry, 0.05, h, 0.05));
  }
  if (o.collide !== false) A.box('metal', cx, y + h / 2, cz, L, h, 0.08, ry);
}

/**
 * A grated steel deck (catwalk / platform) between min/max corners with its
 * top at `y`, on square posts to the ground at the corners and every ~4 m.
 * `o.rails` lists the edges to rail: 'N' (z0), 'S' (z1), 'W' (x0), 'E' (x1),
 * each optionally with gaps `{ N: [[a, b]] }` in plan coordinates.
 */
export function deck(A, x0, z0, x1, z1, y, o = {}) {
  slab(A, 'grating', x0, y - 0.08, z0, x1, y, z1, { collide: 'metal', masks: [0.5, 0.4, 0.2] });
  // edge channels
  slab(A, 'steel_grey', x0, y - 0.3, z0, x1, y - 0.08, z0 + 0.12);
  slab(A, 'steel_grey', x0, y - 0.3, z1 - 0.12, x1, y - 0.08, z1);
  slab(A, 'steel_grey', x0, y - 0.3, z0, x0 + 0.12, y - 0.08, z1);
  slab(A, 'steel_grey', x1 - 0.12, y - 0.3, z0, x1, y - 0.08, z1);
  if (o.posts !== false) {
    const nx = Math.max(1, Math.round((x1 - x0) / 4));
    const nz = Math.max(1, Math.round((z1 - z0) / 4));
    const pts = [];
    for (let i = 0; i <= nx; i++) for (const z of [z0 + 0.1, z1 - 0.1]) pts.push([x0 + 0.1 + ((x1 - x0 - 0.2) * i) / nx, z]);
    for (let j = 1; j < nz; j++) for (const x of [x0 + 0.1, x1 - 0.1]) pts.push([x, z0 + 0.1 + ((z1 - z0 - 0.2) * j) / nz]);
    for (const [px, pz] of pts) slab(A, 'steel_grey', px - 0.1, 0, pz - 0.1, px + 0.1, y - 0.3, pz + 0.1, { collide: 'metal' });
  }
  const r = o.rails ?? {};
  const edge = (side, ax, az, bx, bz) => {
    const gaps = r[side];
    if (gaps === undefined) return;
    const alongX = az === bz;
    const lo = alongX ? ax : az;
    const hi = alongX ? bx : bz;
    let u = lo;
    const segs = [];
    for (const [ga, gb] of (Array.isArray(gaps) ? gaps : []).slice().sort((p, q) => p[0] - q[0])) {
      if (ga > u) segs.push([u, ga]);
      u = Math.max(u, gb);
    }
    if (u < hi) segs.push([u, hi]);
    for (const [sa, sb] of segs) {
      if (alongX) rail(A, sa, az, sb, az, y);
      else rail(A, ax, sa, ax, sb, y);
    }
  };
  edge('N', x0, z0 + 0.05, x1, z0 + 0.05);
  edge('S', x0, z1 - 0.05, x1, z1 - 0.05);
  edge('W', x0 + 0.05, z0, x0 + 0.05, z1);
  edge('E', x1 - 0.05, z0, x1 - 0.05, z1);
}

// ------------------------------------------------------------- containers --
export const CONTAINER = { w: 2.44, h: 2.59, l20: 6.06, l40: 12.19 };

/** Register the container prototypes: one per colour and length. */
export function registerContainers(A, colours) {
  for (const len of [20, 40]) {
    const L = len === 40 ? CONTAINER.l40 : CONTAINER.l20;
    for (const c of colours) {
      const id = `ct${len}_${c}`;
      if (A.has(id)) continue;
      const W = CONTAINER.w;
      const H = CONTAINER.h;
      const parts = [
        // the corrugated box, local x along the length, floor at 0
        part(L - 0.1, H - 0.14, W - 0.06, 0, H / 2, 0, 0, 0, 0, [0.5, 0.35, 0.2]),
      ];
      // corner posts and top / bottom rails (the frame reads darker through wear)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(0.16, H, 0.16, sx * (L / 2 - 0.08), H / 2, sz * (W / 2 - 0.08), 0, 0, 0, [0.9, 0.6, 0.3]));
      for (const sy of [0.06, H - 0.06]) for (const sz of [-1, 1]) parts.push(part(L, 0.14, 0.12, 0, sy, sz * (W / 2 - 0.06), 0, 0, 0, [0.9, 0.7, 0.4]));
      for (const sy of [0.06, H - 0.06]) for (const sx of [-1, 1]) parts.push(part(0.12, 0.14, W, sx * (L / 2 - 0.06), sy, 0, 0, 0, 0, [0.9, 0.7, 0.4]));
      // door end (+x): two leaves, four locking bars, hinges
      parts.push(part(0.04, H - 0.3, W - 0.3, L / 2 - 0.02, H / 2, 0, 0, 0, 0, [0.7, 0.4, 0.2]));
      for (const zz of [-0.85, -0.35, 0.35, 0.85]) parts.push(cylPart(0.022, H - 0.4, L / 2 + 0.03, H / 2, zz, 6));
      A.proto(id, { geo: merged(parts), key: `ct_${c}`, skirt: 0 });
    }
  }
}

/**
 * One container: centre (x, z), `len` 20 | 40, yaw `ry` (0 = long axis on x),
 * `tier` 0 on the ground, 1 on top of another. Box collision.
 */
export function container(A, x, z, len, ry, tier, colour, o = {}) {
  const L = len === 40 ? CONTAINER.l40 : CONTAINER.l20;
  const y = tier * CONTAINER.h;
  A.put(`ct${len}_${colour}`, x, y, z, ry, 1, o.masks ?? [1, 1 + (tier === 0 ? 0.3 : 0), 1]);
  if (o.collide !== false) A.box('metal', x, y + CONTAINER.h / 2, z, L, CONTAINER.h, CONTAINER.w, ry);
}

// -------------------------------------------------------------- perimeter --
/**
 * The playable edge: a precast concrete panel wall (with posts, a coping and a
 * run of razor coil on top) and a blocking volume taller than anything a
 * player can mantle, on the line (x0, z0) -> (x1, z1).
 */
export function perimeterWall(A, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 3.2;
  const key = o.key ?? 'precast';
  const L = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const n = Math.max(1, Math.round(L / 4));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    const hh = h + ((i * 7) % 3) * 0.03;
    boxAt(A, key, px, hh / 2, pz, L / n - 0.04, hh, 0.22, ry, { masks: [0.5, 0.6, 0.3] });
    boxAt(A, 'concrete_prop', x0 + (x1 - x0) * (i / n), (h + 0.2) / 2, z0 + (z1 - z0) * (i / n), 0.36, h + 0.2, 0.36, ry);
  }
  boxAt(A, 'concrete_prop', (x0 + x1) / 2, h + 0.05, (z0 + z1) / 2, L, 0.1, 0.3, ry);
  if (o.wire !== false) {
    const coil = A.cache('yk:coil', () => {
      const g = new THREE.TorusGeometry(0.28, 0.012, 4, 14);
      return fillMasks(g, 0.3, 0.2, 0);
    });
    const m = Math.round(L / 0.35);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m;
      A.add('steel', coil, trs(_m, x0 + (x1 - x0) * t, h + 0.36, z0 + (z1 - z0) * t, ry + Math.PI / 2 + ((i % 5) - 2) * 0.12, 1, 1, 1));
    }
  }
  A.box('concrete', (x0 + x1) / 2, 5, (z0 + z1) / 2, L, 10, 0.6, ry);
}

// ---------------------------------------------------------------- vehicles --
/** A counterbalance forklift (visual + collision), local +z forward. */
export function forklift(A, x, z, ry, o = {}) {
  const P = [];
  const k = o.key ?? 'steel_yellow';
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const put = (key, sx, sy, sz, lx, ly, lz) => {
    const [px, pz] = at(lx, lz);
    boxAt(A, key, px, ly, pz, sx, sy, sz, ry, { masks: [0.6, 0.6, 0.3] });
  };
  put(k, 1.15, 0.9, 2.2, 0, 0.75, -0.2); // body
  put('steel_grey', 1.1, 0.7, 0.6, 0, 1.2, -1.15); // counterweight
  put('rubber', 0.9, 0.08, 0.9, 0, 1.25, -0.2); // seat pad
  for (const sx of [-0.5, 0.5]) {
    put('steel_grey', 0.07, 2.1, 0.07, sx, 1.05 + 1.0, 0.1); // overhead guard posts
    put('steel_grey', 0.12, 2.9, 0.12, sx * 0.7, 1.45, 0.95); // mast
    put('steel_grey', 0.1, 0.05, 1.1, sx * 0.3, o.fork ?? 0.12, 1.5); // tines
  }
  put('steel_grey', 1.1, 0.06, 1.2, 0, 3.1, -0.05);
  for (const [lx, lz] of [[-0.55, 0.7], [0.55, 0.7], [-0.55, -1.0], [0.55, -1.0]]) {
    const [px, pz] = at(lx, lz);
    const g = cylPart(0.3, 0.25, 0, 0, 0, 12, 0, Math.PI / 2);
    g.applyMatrix4(trs(_m, px, 0.3, pz, ry));
    A.addOnce('rubber', g);
  }
  const [cx, cz] = at(0, 0);
  A.box('metal', cx, 0.9, cz, 1.2, 1.8, 2.9, ry);
  void P;
}

/** A box semi-trailer on its landing legs (bed at 1.2 m), local +z toward the rear doors. */
export function trailer(A, x, z, ry, o = {}) {
  const L = o.len ?? 10.5;
  const key = o.key ?? 'trailer_white';
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const [cx, cz] = at(0, 0);
  boxAt(A, key, cx, 1.2 + 1.35, cz, 2.5, 2.7, L, ry, { masks: [0.4, 0.6, 0.3] });
  boxAt(A, 'steel_grey', cx, 1.05, cz, 2.3, 0.3, L, ry, { masks: [0.6, 0.8, 0.5] });
  // rear frame and doors
  const [rx, rz] = at(0, L / 2 + 0.03);
  boxAt(A, 'steel_grey', rx, 2.55, rz, 2.52, 2.72, 0.08, ry);
  // bogie and wheels at the rear, landing legs at the front
  for (const lz of [L / 2 - 1.6, L / 2 - 2.9]) {
    for (const sx of [-1, 1]) {
      const [wx, wz] = at(sx * 0.95, lz);
      const g = cylPart(0.5, 0.5, 0, 0, 0, 14, 0, Math.PI / 2);
      g.applyMatrix4(trs(_m, wx, 0.5, wz, ry));
      A.addOnce('rubber', g);
    }
  }
  for (const sx of [-1, 1]) {
    const [lx, lz] = at(sx * 0.8, -L / 2 + 2.2);
    boxAt(A, 'steel_grey', lx, 0.5, lz, 0.14, 1.0, 0.14, ry);
  }
  A.box('metal', cx, 2.0, cz, 2.5, 4.0, L, ry);
}

/** A tractor unit (cab), local +z forward. */
export function tractor(A, x, z, ry, o = {}) {
  const key = o.key ?? 'truck_blue';
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const [cx, cz] = at(0, 1.2);
  boxAt(A, key, cx, 2.0, cz, 2.45, 2.2, 2.3, ry, { masks: [0.4, 0.5, 0.3] });
  const [wx, wz] = at(0, 2.37);
  boxAt(A, 'window_dark', wx, 2.4, wz, 2.2, 0.9, 0.04, ry);
  const [bx, bz] = at(0, -0.8);
  boxAt(A, 'steel_grey', bx, 1.0, bz, 2.3, 0.35, 5.6, ry);
  for (const lz of [1.9, -1.4, -2.7]) {
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * 1.0, lz);
      const g = cylPart(0.52, 0.45, 0, 0, 0, 14, 0, Math.PI / 2);
      g.applyMatrix4(trs(_m, px, 0.52, pz, ry));
      A.addOnce('rubber', g);
    }
  }
  const [kx, kz] = at(0, 0.1);
  A.box('metal', kx, 1.55, kz, 2.5, 3.1, 6.6, ry);
}

// --------------------------------------------------------------- self-test --
/**
 * Generic collision / clearance self-test, in the spirit of the airport's.
 * All inputs are LEVEL space; directions are level-space unit-ish vectors.
 *
 *   floors:   [name, x, z, y]                  a downward ray lands at y
 *   walls:    [name, x, y, z, dx, dz, max]     a ray hits within max metres
 *   doors:    [name, x, z, floorY, nx, nz]     >= 2.4 m clear, walked standing
 *   routes:   [name, [x, y, z], [[dx, dz, seconds]...], okFn(levelPos)]
 *   blocked:  [name, [x, y, z], [dx, dz]]      walking 1.5 s moves < 1.5 m
 *   nav:      [name, [x, y, z], [x, y, z]]     an AI nav path exists
 *
 * It moves the player: a dev tool, run from a capture eval
 * (`window.__ENGINE__.ctx.peek('world').selfTest()`).
 */
export function runChecks(ctx, world, spec) {
  const phys = ctx.peek('physics');
  const player = ctx.peek('player');
  const V = ctx.camera.position.constructor;
  const W = (x, y, z) => world.levelToWorld(x, y, z, new V());
  const o0 = W(0, 0, 0);
  const WD = (dx, dz) => {
    const p = W(dx, 0, dz);
    return [p.x - o0.x, p.z - o0.z];
  };
  const toLevel = (p) => world.worldToLevel(p.x, p.y, p.z, new V());
  const MASK = phys.MASK.CHARACTER;
  const results = [];
  const rec = (kind, name, ok, info) => results.push({ kind, name, ok, info });

  for (const [name, x, z, y] of spec.floors ?? []) {
    const o = W(x, y + 1.2, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, -1, 0, 3, MASK);
    const got = h.hit ? toLevel(h.point).y : null;
    rec('floor', name, h.hit && Math.abs(got - y) < 0.15, got === null ? 'miss' : `y=${got.toFixed(2)} want ${y.toFixed(2)}`);
  }
  for (const [name, x, y, z, dx, dz, max] of spec.walls ?? []) {
    const o = W(x, y, z);
    const [wx, wz] = WD(dx, dz);
    const h = phys.raycast(o.x, o.y, o.z, wx, 0, wz, max + 1, MASK);
    rec('wall', name, h.hit && h.distance <= max, h.hit ? `d=${h.distance.toFixed(2)} max ${max}` : 'miss');
  }
  const findFloor = (x, z, yHint) => {
    const o = W(x, yHint + 1.0, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, -1, 0, 2.5, MASK);
    return h.hit ? toLevel(h.point).y : null;
  };
  for (const [name, x, z, y] of spec.doors ?? []) {
    const f = findFloor(x, z, y) ?? y;
    const o = W(x, f + 0.1, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, 1, 0, 6, MASK);
    const clear = h.hit ? h.distance + 0.1 : 99;
    rec('headroom', name, clear >= 2.4, clear >= 99 ? 'open' : `${clear.toFixed(2)} m`);
  }
  const m = player?.movement;
  if (m) {
    const prevCtl = player.controlEnabled;
    player.setControlEnabled?.(true);
    const walk = (start, legs) => {
      player.teleport(W(start[0], start[1] + 1.66 + 0.04, start[2]), 0);
      m.velocity.set(0, 0, 0);
      let crouched = false;
      for (const [dx, dz, seconds] of legs) {
        const [wx, wz] = WD(dx, dz);
        m.yaw = Math.atan2(-wx, -wz);
        m.stanceWant = 'stand';
        const n = Math.round(seconds * 120);
        for (let i = 0; i < n; i++) {
          m._cmdFrame = ctx.time.frame;
          m.cmd.moveX = 0;
          m.cmd.moveY = 1;
          m.cmd.sprintHeld = false;
          m.cmd.crouchPressed = false;
          m.cmd.jump = false;
          m.step(1 / 120);
          if (m.stance !== 'stand') crouched = true;
        }
      }
      return { p: toLevel(m.position), crouched };
    };
    for (const [name, x, z, y, nx, nz] of spec.doors ?? []) {
      const f = findFloor(x - nx * 1.4, z - nz * 1.4, y) ?? y;
      const r = walk([x - nx * 1.4, f, z - nz * 1.4], [[nx, nz, 1.0]]);
      const crossed = (r.p.x - x) * nx + (r.p.z - z) * nz;
      rec('door', name, crossed > 0.6 && !r.crouched, `past=${crossed.toFixed(2)}${r.crouched ? ' CROUCHED' : ''}`);
    }
    for (const [name, start, legs, ok] of spec.routes ?? []) {
      const r = walk(start, legs);
      rec('route', name, ok(r.p) && !r.crouched, `end ${r.p.x.toFixed(1)},${r.p.y.toFixed(2)},${r.p.z.toFixed(1)}${r.crouched ? ' CROUCHED' : ''}`);
    }
    for (const [name, start, [dx, dz]] of spec.blocked ?? []) {
      const r = walk(start, [[dx, dz, 1.5]]);
      const moved = (r.p.x - start[0]) * dx + (r.p.z - start[2]) * dz;
      rec('blocked', name, moved < 1.5, `moved ${moved.toFixed(2)}`);
    }
    player.setControlEnabled?.(prevCtl ?? false);
    player.respawn?.(world.playerSpawnIndex ?? 0);
  } else {
    rec('walk', 'player', false, 'no player movement');
  }
  const grid = ctx.peek('ai')?.grid;
  for (const [name, a, b] of spec.nav ?? []) {
    if (!grid) {
      rec('nav', name, false, 'no nav grid');
      continue;
    }
    const pts = [];
    const pa = W(...a);
    const pb = W(...b);
    const n = grid.findPath(pa, pb, pts, { maxNodes: 400000 });
    const gi = grid.nearest(pb.x, pb.z, pb.y);
    const near = gi >= 0 && Math.hypot(grid.worldX(gi % grid.nx) - pb.x, grid.worldZ((gi / grid.nx) | 0) - pb.z) < 1.3 && Math.abs(grid.floor[gi] - pb.y) < 0.6;
    rec('nav', name, n > 0 && near, n > 0 ? `${n} waypoints${near ? '' : ' (goal cell off target)'}` : 'no path');
  }
  const fail = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - fail.length, failed: fail, results };
}

/** Rectangles helper: true when (x, z) is inside [x0, z0, x1, z1] shrunk by m. */
export const inRect = (x, z, r, m = 0) => x > r[0] + m && x < r[2] - m && z > r[1] + m && z < r[3] - m;

/** A chamfered prototype-box helper for local prop geometry. */
export const cbox = (sx, sy, sz, b = 0.012) => chamferBox(sx, sy, sz, b);

// ---------------------------------------------------------------- palette --
const painted = (tint, o = {}) => ({
  name: 'metal_painted',
  surface: 'metal',
  opts: { vertexMasks: true, tint, scale: o.scale ?? 1.2, weather: o.weather ?? [0.35, 0.45, 0.4, 0.45], roughness: [0.85, 0, 0.25] },
});
const ribbed = (tint) => ({
  name: 'corrugated',
  surface: 'metal',
  opts: { vertexMasks: true, tint, scale: 2.4, weather: [0.4, 0.55, 0.45, 0.5] },
});

/** Surfaces both yard maps share (the kit's own keys). */
export const YARD_PALETTE = {
  grating: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x5d6064, scale: 0.6, roughness: [0.8, 0, 0.3] } },
  steel_grey: painted(0x6a6e71),
  steel_yellow: painted(0xc49a2c),
  steel_dark: painted(0x34383b),
  trailer_white: painted(0xc9c6bd, { scale: 2 }),
  truck_blue: painted(0x2d4b6b),
  truck_red: painted(0x7f2a22),
  precast: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xa9a397, scale: 2.2, weather: [0.35, 0.45, 0.4, 0.45] },
  },
  ct_red: ribbed(0x8a3a2c),
  ct_blue: ribbed(0x2f4f72),
  ct_green: ribbed(0x3d5a3b),
  ct_grey: ribbed(0x8b8d89),
  ct_orange: ribbed(0xa4602f),
  ct_white: ribbed(0xbcb8ad),
  ct_tan: ribbed(0xa08a62),
};
export { painted, ribbed };
