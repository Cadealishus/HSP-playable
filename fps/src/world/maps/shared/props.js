import * as THREE from 'three';
import { part, merged, cylPart, slab, boxAt, G } from '../airport/kit.js';
import { trs } from '../../util.js';

/**
 * Instanced prop prototypes shared by the mission maps (UNDERGROUND, ESTATE).
 * Every prototype stands on y = 0 in its own space, faces +z, and is placed
 * through `A.put(id, x, y, z, ry, s)`. Collision is added by the placing helper
 * (`prop()` below) at the prop's real footprint, so cover reads the way it looks.
 */

const _m = new THREE.Matrix4();

/** Footprints [w, h, d] used for collision; keyed by prototype id. */
export const FOOT = {};

function def(A, id, parts, key, foot, o = {}) {
  if (A.has(id)) return;
  A.proto(id, { geo: merged(parts), key, castShadow: o.shadow !== false, tilt: o.tilt ?? 0, sink: o.sink ?? 0 });
  if (foot) FOOT[id] = foot;
}

export function registerSharedProps(A) {
  if (A.has('mp_crate')) return;
  // military crate, lid battens and handles
  def(
    A,
    'mp_crate',
    [
      part(1.2, 0.62, 0.72, 0, 0.31, 0, 0, 0, 0, [0.3, 0.4, 0.3]),
      part(1.24, 0.05, 0.1, 0, 0.64, -0.24),
      part(1.24, 0.05, 0.1, 0, 0.64, 0.24),
      part(0.16, 0.05, 0.04, -0.62, 0.42, 0, Math.PI / 2),
      part(0.16, 0.05, 0.04, 0.62, 0.42, 0, Math.PI / 2),
    ],
    'crate_green',
    [1.24, 0.66, 0.74],
    { tilt: 0.02 }
  );
  // steel drum
  def(A, 'mp_drum', [cylPart(0.29, 0.88, 0, 0.44, 0, 16), cylPart(0.3, 0.03, 0, 0.3, 0, 16), cylPart(0.3, 0.03, 0, 0.6, 0, 16)], 'metal_rust', [0.6, 0.9, 0.6], { tilt: 0.03 });
  // electrical cabinet: body, plinth, door seams, handle
  def(
    A,
    'mp_cabinet',
    [
      part(0.8, 1.9, 0.45, 0, 1.0, 0, 0, 0, 0, [0.3, 0.5, 0.3]),
      part(0.82, 0.1, 0.47, 0, 0.05, 0, 0, 0, 0, [0.6, 0.6, 0.4]),
      part(0.012, 1.7, 0.01, 0, 1.0, 0.227),
      part(0.03, 0.2, 0.03, 0.1, 1.1, 0.24),
      part(0.3, 0.2, 0.01, -0.2, 1.6, 0.227),
    ],
    'cabinet_grey',
    [0.82, 2.0, 0.47]
  );
  // lockers: a bank of three
  const lk = [];
  for (let i = 0; i < 3; i++) {
    lk.push(part(0.38, 1.85, 0.5, (i - 1) * 0.4, 0.95, 0, 0, 0, 0, [0.4, 0.4, 0.3]));
    for (let k = 0; k < 4; k++) lk.push(part(0.2, 0.012, 0.01, (i - 1) * 0.4, 1.6 + k * 0.035, 0.253));
    lk.push(part(0.03, 0.12, 0.03, (i - 1) * 0.4 + 0.12, 1.05, 0.26));
  }
  def(A, 'mp_lockers', lk, 'cabinet_olive', [1.22, 1.9, 0.52]);
  // folding table + legs
  def(
    A,
    'mp_table',
    [
      part(1.8, 0.04, 0.8, 0, 0.74, 0, 0, 0, 0, [0.3, 0.3, 0.2]),
      part(0.04, 0.72, 0.04, -0.82, 0.36, -0.34),
      part(0.04, 0.72, 0.04, 0.82, 0.36, -0.34),
      part(0.04, 0.72, 0.04, -0.82, 0.36, 0.34),
      part(0.04, 0.72, 0.04, 0.82, 0.36, 0.34),
    ],
    'gate_steel',
    [1.8, 0.78, 0.8]
  );
  // office chair
  def(
    A,
    'mp_chair',
    [
      part(0.46, 0.07, 0.46, 0, 0.47, 0),
      part(0.44, 0.5, 0.06, 0, 0.78, -0.21, 0, -0.1),
      cylPart(0.03, 0.4, 0, 0.24, 0, 8),
      part(0.56, 0.03, 0.06, 0, 0.04, 0),
      part(0.06, 0.03, 0.56, 0, 0.04, 0),
    ],
    'plastic_dark',
    null,
    { tilt: 0.05 }
  );
  // gas bottles, a pair chained together
  def(A, 'mp_bottles', [cylPart(0.12, 1.3, -0.14, 0.65, 0, 12), cylPart(0.12, 1.3, 0.14, 0.65, 0, 12), cylPart(0.05, 0.12, -0.14, 1.36, 0, 8), cylPart(0.05, 0.12, 0.14, 1.36, 0, 8)], 'pipe_red', [0.56, 1.4, 0.3]);
  // cable drum on its side (axis x)
  def(
    A,
    'mp_cabledrum',
    [cylPart(0.55, 0.08, -0.34, 0.55, 0, 18, 0, Math.PI / 2), cylPart(0.55, 0.08, 0.34, 0.55, 0, 18, 0, Math.PI / 2), cylPart(0.36, 0.6, 0, 0.55, 0, 18, 0, Math.PI / 2)],
    'wood_bench',
    [0.8, 1.1, 1.1]
  );
  // sandbag course (six bags, 1.5 m)
  const sb = [];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 3 - (r === 2 ? 1 : 0); i++) {
      const off = r === 1 ? 0.25 : r === 2 ? 0.25 : 0;
      sb.push(part(0.5, 0.17, 0.32, -0.5 + off + i * 0.5, 0.085 + r * 0.16, 0, (i * 0.37 + r) * 0.08, 0, 0, [0.2, 0.4, 0.3]));
    }
  }
  def(A, 'mp_sandbags', sb, 'sandbag', [1.5, 0.5, 0.36]);
  // work light: tripod and a lamp head (the lens is a separate emissive batch)
  def(
    A,
    'mp_tripod',
    [
      cylPart(0.02, 1.7, 0, 0.9, 0, 6),
      cylPart(0.015, 1.0, 0.22, 0.45, 0, 6, 0, -0.45),
      cylPart(0.015, 1.0, -0.11, 0.45, 0.19, 6, 0.45 * 0.87, 0.45 * 0.5),
      cylPart(0.015, 1.0, -0.11, 0.45, -0.19, 6, -0.45 * 0.87, 0.45 * 0.5),
      part(0.34, 0.26, 0.14, 0, 1.8, 0.04, 0, -0.3),
    ],
    'metal_dark',
    [0.5, 1.9, 0.5]
  );
  // server / comms rack
  const rk = [part(0.62, 2.0, 1.0, 0, 1.0, 0, 0, 0, 0, [0.3, 0.5, 0.3])];
  for (let k = 0; k < 9; k++) rk.push(part(0.56, 0.012, 0.01, 0, 0.3 + k * 0.18, 0.503));
  rk.push(part(0.02, 1.8, 0.02, 0.26, 1.0, 0.51));
  def(A, 'mp_rack', rk, 'metal_dark', [0.62, 2.0, 1.0]);
  // generator: skid, housing, exhaust
  def(
    A,
    'mp_generator',
    [
      part(2.6, 0.16, 1.2, 0, 0.08, 0, 0, 0, 0, [0.6, 0.6, 0.4]),
      part(2.3, 1.3, 1.1, 0, 0.81, 0, 0, 0, 0, [0.3, 0.5, 0.3]),
      part(0.5, 0.4, 0.02, 0.7, 0.9, 0.56),
      cylPart(0.07, 0.6, -0.9, 1.7, 0.3, 10),
    ],
    'cabinet_olive',
    [2.6, 1.5, 1.2]
  );
  // plastic chair (stacking)
  def(A, 'mp_plastic_chair', [part(0.44, 0.04, 0.42, 0, 0.44, 0), part(0.44, 0.42, 0.04, 0, 0.67, -0.2, 0, -0.12), part(0.03, 0.44, 0.03, -0.19, 0.22, -0.17), part(0.03, 0.44, 0.03, 0.19, 0.22, -0.17), part(0.03, 0.44, 0.03, -0.19, 0.22, 0.17), part(0.03, 0.44, 0.03, 0.19, 0.22, 0.17)], 'plastic_light', null, { tilt: 0.1 });
  // monitor on a stand (screen face is a separate emissive batch)
  def(A, 'mp_monitor', [part(0.56, 0.36, 0.05, 0, 0.3, 0), part(0.06, 0.12, 0.06, 0, 0.07, -0.02), part(0.22, 0.015, 0.16, 0, 0.008, -0.02)], 'plastic_dark', null);
  // bin
  def(A, 'mp_bin', [cylPart(0.22, 0.75, 0, 0.375, 0, 12), cylPart(0.235, 0.05, 0, 0.76, 0, 12)], 'gate_steel', [0.45, 0.8, 0.45]);
  // traffic cone
  def(A, 'mp_cone', [cylPart(0.16, 0.6, 0, 0.3, 0, 10, 0, 0, 0.03), part(0.36, 0.03, 0.36, 0, 0.015, 0)], 'cone_orange', null, { tilt: 0.05 });
}

/**
 * Place a registered prop and give it a collision box at its footprint.
 * `collide` false skips the proxy (small clutter).
 */
export function prop(A, id, x, y, z, ry = 0, s = 1, collide = true) {
  A.put(id, x, y, z, ry, s);
  const f = FOOT[id];
  if (collide && f) A.box(A.surfaceOf(A._protos.get(id)?.key ?? 'concrete'), x, y + (f[1] * s) / 2, z, f[0] * s, f[1] * s, f[2] * s, ry);
}

/** A horizontal pipe run along x or z (axis 'x'|'z'), radius r, centre height y. */
export function pipe(A, key, axis, a0, a1, c, y, r) {
  const len = Math.abs(a1 - a0);
  const m = (a0 + a1) / 2;
  if (axis === 'x') A.add(key, G.cyl(A, 12), trs(_m, m, y, c, 0, r * 2, len, r * 2, 0, Math.PI / 2));
  else A.add(key, G.cyl(A, 12), trs(_m, c, y, m, 0, r * 2, len, r * 2, Math.PI / 2, 0));
}

/** A vertical pipe. */
export function riser(A, key, x, z, y0, y1, r) {
  A.add(key, G.cyl(A, 12), trs(_m, x, (y0 + y1) / 2, z, 0, r * 2, y1 - y0, r * 2));
}

/** A boxy desk with collision. */
export function desk(A, key, x, y, z, ry, w = 1.6, d = 0.75, h = 0.76) {
  boxAt(A, key, x, y + h - 0.02, z, w, 0.04, d, ry);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const sx of [-1, 1]) {
    const lx = (sx * (w / 2 - 0.05));
    boxAt(A, 'gate_steel', x + lx * c, y + (h - 0.04) / 2, z - lx * s, 0.05, h - 0.04, d - 0.1, ry);
  }
  boxAt(A, key, x - (d / 2 - 0.03) * s, y + h * 0.55, z - (d / 2 - 0.03) * c, w - 0.1, h * 0.5, 0.03, ry);
  A.box('metal', x, y + h / 2, z, w, h, d, ry);
}

export { slab };
