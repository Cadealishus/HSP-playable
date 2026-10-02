import * as THREE from 'three';
import { slab, stairX, stairZ, rampX, rampZ, G } from '../airport/kit.js';
import { trs } from '../../util.js';

/**
 * VOID KIT: rooms carved out of solid, with the walls worked out for you.
 *
 * Interiors that are mostly corridors, rooms and shafts (a subway complex, a
 * house) are easier to author as the SPACES than as the walls between them.
 * Each void is an axis-aligned box of air: a floor rectangle, a floor height
 * (constant, or sloped along one axis for stairs and ramps) and a clear height.
 * `buildVoids()` then:
 *
 *   - lays every floor (collides) and every ceiling (never collides: the AI's
 *     nav grid takes the first floor a downward ray meets, see airport/kit.js);
 *   - walks every edge of every void and subtracts, in (along-edge, height)
 *     space, every neighbour that touches that edge. What is left is wall,
 *     built OUTWARD from the void so two rooms `WALL` apart get two skins back
 *     to back with nothing coplanar, and a door is simply a small void that
 *     bridges the gap (its jambs are the two rooms' own wall ends, its lintel
 *     is what is left of the wall above the door void's ceiling);
 *   - floors at different heights produce their own faces (a platform edge is
 *     the track bed's wall between the bed and the platform top), and ceilings
 *     at different heights produce downstands.
 *
 * Void spec (LEVEL metres, x east, z south):
 *   { id, x0, z0, x1, z1, y, h,
 *     floor, wall, ceil        palette keys (floor/ceil null = none)
 *     slope: { axis:'x'|'z', y0, y1, stairs:bool }   floor y0 at the min edge,
 *                                                    y1 at the max edge
 *     open: true               no ceiling, and it counts as open to the sky for
 *                              the walls it touches
 *     skip: ['n','s','e','w']  edges that get no wall at all
 *     windows: [{ side, a, b, y0, y1 }]  glazed openings (a/b along the edge
 *                              from its min corner, y absolute)
 *     t                        wall thickness (default WALL / 2 = 0.2)
 *     wallTop                  cap the generated walls at this absolute height
 *   }
 * Edges: n = z0, s = z1, w = x0, e = x1.
 */

export const WALL = 0.4;
const EPS = 1e-3;
const _m = new THREE.Matrix4();

/** Floor height of a void at a level point (clamped to the void). */
export function floorAt(v, x, z) {
  if (!v.slope) return v.y;
  const s = v.slope;
  const t = s.axis === 'x' ? (x - v.x0) / (v.x1 - v.x0) : (z - v.z0) / (v.z1 - v.z0);
  const k = Math.min(1, Math.max(0, t));
  return s.y0 + (s.y1 - s.y0) * k;
}

/** [floor, top] of a void along one of its edges (sloped edges take the envelope). */
function edgeSpan(v, side) {
  if (!v.slope) return [v.y, v.open ? Infinity : v.y + v.h];
  const s = v.slope;
  const lo = Math.min(s.y0, s.y1);
  const hi = Math.max(s.y0, s.y1);
  const across = (s.axis === 'x' && (side === 'w' || side === 'e')) || (s.axis === 'z' && (side === 'n' || side === 's'));
  if (across) {
    const y = side === 'w' || side === 'n' ? s.y0 : s.y1;
    return [y, v.open ? Infinity : y + v.h];
  }
  return [lo, v.open ? Infinity : hi + v.h];
}

/** Subtract rect b from each rect in list (rects are [s0, s1, y0, y1]). */
function subtract(list, b) {
  const out = [];
  for (const r of list) {
    const [s0, s1, y0, y1] = r;
    const bs0 = Math.max(s0, b[0]);
    const bs1 = Math.min(s1, b[1]);
    const by0 = Math.max(y0, b[2]);
    const by1 = Math.min(y1, b[3]);
    if (bs1 - bs0 < EPS || by1 - by0 < EPS) {
      out.push(r);
      continue;
    }
    if (bs0 - s0 > EPS) out.push([s0, bs0, y0, y1]);
    if (s1 - bs1 > EPS) out.push([bs1, s1, y0, y1]);
    if (by0 - y0 > EPS) out.push([bs0, bs1, y0, by0]);
    if (y1 - by1 > EPS) out.push([bs0, bs1, by1, y1]);
  }
  return out;
}

/**
 * The neighbours touching one edge of `v`, as coverage rects in that edge's
 * (along, height) space.
 */
function coverage(v, side, voids) {
  const out = [];
  for (const o of voids) {
    if (o === v) continue;
    let touch = false;
    let a = 0;
    let b = 0;
    let oside = null;
    if (side === 'n' && Math.abs(o.z1 - v.z0) < EPS) (touch = true), (oside = 's');
    if (side === 's' && Math.abs(o.z0 - v.z1) < EPS) (touch = true), (oside = 'n');
    if (side === 'w' && Math.abs(o.x1 - v.x0) < EPS) (touch = true), (oside = 'e');
    if (side === 'e' && Math.abs(o.x0 - v.x1) < EPS) (touch = true), (oside = 'w');
    if (!touch) continue;
    if (side === 'n' || side === 's') {
      a = Math.max(v.x0, o.x0);
      b = Math.min(v.x1, o.x1);
    } else {
      a = Math.max(v.z0, o.z0);
      b = Math.min(v.z1, o.z1);
    }
    if (b - a < EPS) continue;
    const [fy, top] = edgeSpan(o, oside);
    const origin = side === 'n' || side === 's' ? v.x0 : v.z0;
    out.push([a - origin, b - origin, fy, top]);
  }
  return out;
}

/**
 * Build every void. Returns `{ walls }`, the list of generated wall pieces
 * (level space boxes) for tests and dressing.
 */
export function buildVoids(A, voids, opts = {}) {
  const walls = [];
  const collideWalls = opts.collideWalls !== false;
  for (const v of voids) {
    const w = v.x1 - v.x0;
    const d = v.z1 - v.z0;
    const cx = (v.x0 + v.x1) / 2;
    const cz = (v.z0 + v.z1) / 2;
    // ------------------------------------------------------------ floor --
    if (v.floor) {
      if (!v.slope) {
        slab(A, v.floor, v.x0, v.y - (v.floorT ?? 0.3), v.z0, v.x1, v.y, v.z1, { collide: v.floorSurface ?? true });
      } else if (v.slope.stairs) {
        const s = v.slope;
        const rise = Math.abs(s.y1 - s.y0);
        const len = s.axis === 'x' ? w : d;
        const steps = Math.max(1, Math.round(rise / 0.17));
        const run = len / steps;
        const r = rise / steps;
        const lo = Math.min(s.y0, s.y1);
        // climb from the low end toward the high end
        if (s.axis === 'z') {
          const up = s.y1 > s.y0 ? 1 : -1; // +1 climbs toward +z
          const zStart = up > 0 ? v.z0 : v.z1;
          stairZ(A, v.floor, cx, w, zStart, lo, steps, r, run, up, { base: lo - 0.3 });
        } else {
          const up = s.y1 > s.y0 ? 1 : -1;
          const xStart = up > 0 ? v.x0 : v.x1;
          stairX(A, v.floor, cz, d, xStart, lo, steps, r, run, up, { base: lo - 0.3 });
        }
      } else {
        const s = v.slope;
        if (s.axis === 'z') rampZ(A, v.floor, cx, w, v.z0, s.y0, v.z1, s.y1, 0.3);
        else rampX(A, v.floor, cz, d, v.x0, s.y0, v.x1, s.y1, 0.3);
      }
    }
    // ---------------------------------------------------------- ceiling --
    if (v.ceil && !v.open) {
      const ct = v.ceilT ?? 0.25;
      if (!v.slope) {
        slab(A, v.ceil, v.x0, v.y + v.h, v.z0, v.x1, v.y + v.h + ct, v.z1);
      } else {
        const s = v.slope;
        // sloped soffit, offset up by the clear height; never collides
        if (s.axis === 'z') rampZ(A, v.ceil, cx, w, v.z0, s.y0 + v.h + ct, v.z1, s.y1 + v.h + ct, ct, { collide: false });
        else rampX(A, v.ceil, cz, d, v.x0, s.y0 + v.h + ct, v.x1, s.y1 + v.h + ct, ct, { collide: false });
      }
    }
    // ------------------------------------------------------------ walls --
    if (!v.wall) continue;
    const t = v.t ?? WALL / 2;
    for (const side of ['n', 's', 'w', 'e']) {
      if (v.skip?.includes(side)) continue;
      const len = side === 'n' || side === 's' ? w : d;
      let [fy, top] = edgeSpan(v, side);
      if (top === Infinity) top = fy + (v.wallH ?? 4);
      if (v.wallTop !== undefined) top = Math.min(top, v.wallTop);
      let pieces = [[0, len, fy, top]];
      for (const c of coverage(v, side, voids)) pieces = subtract(pieces, c);
      const wins = (v.windows ?? []).filter((q) => q.side === side);
      for (const q of wins) pieces = subtract(pieces, [q.a, q.b, q.y0, q.y1]);
      for (const [s0, s1, y0, y1] of pieces) {
        if (s1 - s0 < EPS || y1 - y0 < EPS) continue;
        let bx0;
        let bx1;
        let bz0;
        let bz1;
        if (side === 'n') (bx0 = v.x0 + s0), (bx1 = v.x0 + s1), (bz0 = v.z0 - t), (bz1 = v.z0);
        if (side === 's') (bx0 = v.x0 + s0), (bx1 = v.x0 + s1), (bz0 = v.z1), (bz1 = v.z1 + t);
        if (side === 'w') (bx0 = v.x0 - t), (bx1 = v.x0), (bz0 = v.z0 + s0), (bz1 = v.z0 + s1);
        if (side === 'e') (bx0 = v.x1), (bx1 = v.x1 + t), (bz0 = v.z0 + s0), (bz1 = v.z0 + s1);
        slab(A, v.wall, bx0, y0, bz0, bx1, y1, bz1, { collide: collideWalls ? v.wallSurface ?? true : false, masks: [0.4, 0.5, 0.3] });
        walls.push({ void: v.id, side, box: [bx0, y0, bz0, bx1, y1, bz1] });
      }
      // windows: a glass pane in the middle of the wall thickness + frame
      for (const q of wins) {
        const g = v.glass ?? 'glass';
        const fk = v.frame ?? 'metal_dark';
        const mid = side === 'n' ? v.z0 - t / 2 : side === 's' ? v.z1 + t / 2 : side === 'w' ? v.x0 - t / 2 : v.x1 + t / 2;
        const along = side === 'n' || side === 's';
        const a0 = (along ? v.x0 : v.z0) + q.a;
        const a1 = (along ? v.x0 : v.z0) + q.b;
        const ry = along ? 0 : Math.PI / 2;
        const ac = (a0 + a1) / 2;
        const px = along ? ac : mid;
        const pz = along ? mid : ac;
        A.add(q.key ?? g, G.pane(A), trs(_m, px, (q.y0 + q.y1) / 2, pz, ry, a1 - a0, q.y1 - q.y0, 1));
        if (along) A.box('glass', ac, (q.y0 + q.y1) / 2, mid, a1 - a0, q.y1 - q.y0, 0.06);
        else A.box('glass', mid, (q.y0 + q.y1) / 2, ac, 0.06, q.y1 - q.y0, a1 - a0);
        // frame: sill, head and two jambs
        const fw = 0.06;
        const ft = t + 0.02;
        const fr = (x0, y0, z0, x1, y1, z1) => slab(A, fk, x0, y0, z0, x1, y1, z1);
        if (along) {
          fr(a0, q.y0 - fw, mid - ft / 2, a1, q.y0, mid + ft / 2);
          fr(a0, q.y1, mid - ft / 2, a1, q.y1 + fw, mid + ft / 2);
          fr(a0, q.y0, mid - ft / 2, a0 + fw, q.y1, mid + ft / 2);
          fr(a1 - fw, q.y0, mid - ft / 2, a1, q.y1, mid + ft / 2);
        } else {
          fr(mid - ft / 2, q.y0 - fw, a0, mid + ft / 2, q.y0, a1);
          fr(mid - ft / 2, q.y1, a0, mid + ft / 2, q.y1 + fw, a1);
          fr(mid - ft / 2, q.y0, a0, mid + ft / 2, q.y1, a0 + fw);
          fr(mid - ft / 2, q.y0, a1 - fw, mid + ft / 2, q.y1, a1);
        }
      }
    }
  }
  return { walls };
}

/**
 * A door void between two rooms `WALL` apart. `side` is where it sits:
 * 'z' spans z0..z0+WALL at x in [a, b]; 'x' spans x0..x0+WALL at z in [a, b].
 */
export function door(id, axis, at, a, b, y, h = 2.6, o = {}) {
  if (axis === 'z') return { id, x0: a, x1: b, z0: at, z1: at + (o.depth ?? WALL), y, h, floor: o.floor ?? 'threshold', wall: null, ceil: o.ceil ?? null, door: true, ...o };
  return { id, z0: a, z1: b, x0: at, x1: at + (o.depth ?? WALL), y, h, floor: o.floor ?? 'threshold', wall: null, ceil: o.ceil ?? null, door: true, ...o };
}

/** The void containing a level point (first match; sloped voids included). */
export function voidAt(voids, x, z, yHint = null) {
  let best = null;
  for (const v of voids) {
    if (x < v.x0 - EPS || x > v.x1 + EPS || z < v.z0 - EPS || z > v.z1 + EPS) continue;
    if (yHint === null) return v;
    const f = floorAt(v, x, z);
    if (!best || Math.abs(f - yHint) < Math.abs(floorAt(best, x, z) - yHint)) best = v;
  }
  return best;
}
