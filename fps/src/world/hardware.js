import * as THREE from 'three';
import { chamferBox, fillMasks, paintMasks, fbm3, catenaryTube, trs } from './util.js';

/**
 * WORLD — heavy hardware: the vehicles, field fortifications and street
 * furniture the FLOP OPS town is dressed with.
 *
 * The truck, the saloon, the HESCO bastions and the power line are ports of the
 * procedural props an earlier ASHFALL pass modelled for this project, rebuilt on
 * this engine's world kit: every part is a chamfered box, tube or lathe merged
 * into the Assembler's static batch for its palette key (so a whole truck costs a
 * handful of draw calls shared with the rest of the street), weathered through
 * the same wear/grime/AO vertex masks as everything else, and given box
 * collision proxies authored from the same numbers that built it.
 *
 * Every builder works in a LOCAL frame — +Z forward, +X to the right-hand side
 * when looking down -Z, origin on the ground under the middle — and is placed
 * with (x, z, ry) in LEVEL space, exactly like `Assembler.put`.
 */

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

/** Level-space centre of a local offset under a yaw. */
function rot(x, z, ry, lx, lz) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [x + c * lx + s * lz, z - s * lx + c * lz];
}

/**
 * Part accumulator for one assembly, keyed by palette surface. `emit()` merges
 * every part into the Assembler's static batch under one placement matrix.
 */
export class Parts {
  constructor() {
    this.byKey = new Map();
  }

  _push(key, g, o) {
    if (!g.getAttribute('color')) fillMasks(g, 0.2, 0, 0);
    const wear = o.wear ?? 1;
    const grime = o.grime ?? 0;
    const ao = o.ao ?? 0;
    if (wear !== 1 || grime > 0 || ao > 0) {
      const c = g.getAttribute('color');
      for (let i = 0; i < c.count; i++) {
        c.setXYZ(
          i,
          Math.min(1, c.getX(i) * wear),
          Math.min(1, Math.max(c.getY(i), grime)),
          Math.min(1, Math.max(c.getZ(i), ao))
        );
      }
    }
    let list = this.byKey.get(key);
    if (!list) this.byKey.set(key, (list = []));
    list.push(g);
    return g;
  }

  /** Chamfered box centred at (x, y, z). */
  box(key, sx, sy, sz, x = 0, y = 0, z = 0, o = {}) {
    const g = chamferBox(sx, sy, sz, o.bevel ?? 0.01);
    g.applyMatrix4(trs(_m, x, y, z, o.ry ?? 0, 1, 1, 1, o.rx ?? 0, o.rz ?? 0));
    return this._push(key, g, o);
  }

  /** Box whose top face is scaled to (tx, tz) of the base — bonnets, cabs. */
  taper(key, sx, sy, sz, tx, tz, x = 0, y = 0, z = 0, o = {}) {
    const g = chamferBox(sx, sy, sz, o.bevel ?? 0.02);
    const pa = g.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const t = pa.getY(i) / sy + 0.5; // 0 at the base, 1 at the top
      const kx = 1 + (tx / sx - 1) * t;
      const kz = 1 + (tz / sz - 1) * t;
      pa.setXYZ(i, pa.getX(i) * kx, pa.getY(i), pa.getZ(i) * kz + (o.shiftTop ?? 0) * t);
    }
    g.computeVertexNormals();
    g.applyMatrix4(trs(_m, x, y, z, o.ry ?? 0, 1, 1, 1, o.rx ?? 0, o.rz ?? 0));
    return this._push(key, g, o);
  }

  /** Cylinder along +Y centred at (x, y, z), then rotated. */
  cyl(key, r, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.CylinderGeometry(r * (o.taper ?? 1), r, h, o.radial ?? 12, 1, o.open ?? false);
    g.applyMatrix4(trs(_m, x, y, z, o.ry ?? 0, 1, 1, 1, o.rx ?? 0, o.rz ?? 0));
    const c = this._push(key, g, o);
    // bright rims on the cap edges, where paint chips first
    paintMasks(c, (px, py, pz, nx, ny, nz, out) => {
      out[0] = Math.max(out[0], Math.abs(ny) > 0.5 ? 0.25 : 0.12);
    });
    return c;
  }

  /** Straight rod between two local points. */
  rod(key, a, b, r, o = {}) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = new THREE.CylinderGeometry(r * (o.taper ?? 1), r, len, o.radial ?? 6, 1, true);
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _q.setFromUnitVectors(_up, _v);
    _m.compose(
      new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
      _q,
      _one
    );
    g.applyMatrix4(_m);
    return this._push(key, g, o);
  }

  /** Arbitrary geometry, already in the local frame. */
  geo(key, g, o = {}) {
    return this._push(key, g, o);
  }

  /**
   * Merge into the static batch. `paint` gets WORLD-space vertices (the level
   * transform is a pure yaw, so y is the height above the street) and layers
   * road grime up the lower body the way a vehicle collects it.
   */
  emit(A, x, y, z, ry, o = {}) {
    trs(_m2, x, y, z, ry, 1, 1, 1, o.rx ?? 0, o.rz ?? 0);
    const base = y;
    const dustH = o.dustH ?? 0.9;
    const dust = o.dust ?? 0.6;
    const paint = (px, py, pz, nx, ny, nz, out) => {
      const t = Math.max(0, 1 - (py - base) / dustH);
      const n = fbm3(px * 2.3, py * 3.1, pz * 2.3, 2);
      out[1] = Math.min(1, out[1] + dust * t * t * (0.6 + 0.8 * n) + Math.max(0, ny) * 0.25 * dust * n);
      out[2] = Math.min(1, out[2] + Math.max(0, -ny) * 0.3);
    };
    for (const [key, list] of this.byKey) {
      for (const g of list) {
        A.add(key, g, _m2, { paint });
        g.dispose();
      }
    }
    this.byKey.clear();
  }
}

// ================================================================ wheels ==
/** A lugged off-road tyre with a rim and hub, axle along local X. */
function wheel(P, key, x, y, z, r, w, o = {}) {
  const side = Math.sign(x) || 1;
  P.cyl('rubber', r, w, x, y, z, { radial: 18, rz: Math.PI / 2, grime: 0.45 });
  // tread lugs: chunky blocks proud of the carcass, alternating across the crown
  const lugs = o.lugs ?? 16;
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    const off = (i % 2 ? 0.12 : -0.12) * w;
    P.box(
      'rubber',
      w * 0.46,
      0.035,
      r * 0.26,
      x + off,
      y + Math.cos(a) * (r + 0.012),
      z + Math.sin(a) * (r + 0.012),
      { rx: -a, bevel: 0.008, grime: 0.5 }
    );
  }
  // rim disc, hub and wheel nuts on the outboard face
  const face = x + side * (w / 2);
  P.cyl(o.rimKey ?? 'truck_paint', r * 0.56, 0.05, face - side * 0.02, y, z, {
    radial: 16,
    rz: Math.PI / 2,
    wear: 1.2,
    grime: 0.4,
  });
  P.cyl('metal_dark', r * 0.2, 0.09, face, y, z, { radial: 10, rz: Math.PI / 2, grime: 0.3 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    P.cyl('steel', 0.02, 0.05, face + side * 0.01, y + Math.cos(a) * r * 0.33, z + Math.sin(a) * r * 0.33, {
      radial: 6,
      rz: Math.PI / 2,
    });
  }
}

// ================================================================= truck ==
/**
 * A Soviet-pattern 6x6 cargo truck (Ural-4320 class) under a canvas tilt.
 * 7.5 m long, 2.5 m wide, 3.2 m to the top of the tilt. Local +Z is the nose.
 */
export function buildCargoTruck(A, rng, x, z, ry, opts = {}) {
  const P = new Parts();
  const M = 'truck_paint';
  const y0 = opts.y ?? 0;

  // ---- chassis --------------------------------------------------------
  for (const sx of [-0.46, 0.46]) P.box('metal_dark', 0.16, 0.26, 7.1, sx, 0.98, -0.2, { grime: 0.6 });
  for (const cz of [2.75, -1.65, -3.05]) P.cyl('metal_rust', 0.08, 2.0, 0, 0.6, cz, { rz: Math.PI / 2, radial: 8, grime: 0.7 });
  // differential pumpkins
  for (const cz of [2.75, -1.65, -3.05]) P.box('metal_dark', 0.34, 0.3, 0.34, 0, 0.62, cz, { bevel: 0.05, grime: 0.7 });
  // front bumper + towing eyes
  P.box('metal_dark', 2.36, 0.24, 0.2, 0, 0.98, 3.62, { bevel: 0.03, grime: 0.4, wear: 1.3 });
  for (const sx of [-0.7, 0.7]) P.box('metal_rust', 0.08, 0.14, 0.14, sx, 0.98, 3.76, { bevel: 0.02 });

  // ---- bonnet, grille, wings -------------------------------------------
  P.taper(M, 1.34, 0.78, 1.26, 1.14, 1.12, 0, 1.46, 2.95, { bevel: 0.035, wear: 1.2 });
  // grille: a recessed dark frame with vertical slats
  P.box('metal_dark', 1.02, 0.62, 0.05, 0, 1.42, 3.575, { bevel: 0.01, grime: 0.5 });
  for (let i = 0; i < 9; i++) P.box(M, 0.045, 0.6, 0.05, -0.44 + i * 0.11, 1.42, 3.6, { bevel: 0.006, wear: 1.3 });
  // wings over the front wheels, with the flared lip and a sloped nose
  for (const sx of [-1, 1]) {
    P.box(M, 0.56, 0.06, 1.34, sx * 0.98, 1.36, 2.72, { bevel: 0.02, wear: 1.2 });
    P.box(M, 0.56, 0.06, 0.42, sx * 0.98, 1.21, 3.52, { rx: 0.62, bevel: 0.02, wear: 1.2 });
    P.box(M, 0.05, 0.3, 1.3, sx * 1.25, 1.22, 2.72, { bevel: 0.015, wear: 1.2 });
    // headlamp pods on the wings
    P.cyl('metal_dark', 0.12, 0.16, sx * 0.9, 1.52, 3.28, { rx: Math.PI / 2, radial: 12 });
    P.cyl('window_glass', 0.1, 0.02, sx * 0.9, 1.52, 3.365, { rx: Math.PI / 2, radial: 12 });
    // blackout marker lamp
    P.box('lamp_red', 0.08, 0.05, 0.03, sx * 1.1, 1.42, 3.72, { bevel: 0.005 });
  }

  // ---- cab ----------------------------------------------------------------
  const cz = 1.6;
  P.box(M, 2.3, 1.1, 1.5, 0, 1.72, cz, { bevel: 0.05, wear: 1.15 });
  // upper cab (glasshouse) slightly narrower, raked windscreen
  P.taper(M, 2.26, 0.62, 1.46, 2.18, 1.3, 0, 2.58, cz - 0.02, { bevel: 0.04, shiftTop: -0.08 });
  P.box(M, 2.24, 0.07, 1.34, 0, 2.93, cz - 0.1, { bevel: 0.03, wear: 1.2 });
  // windscreen: split pane, dark cab behind glass
  for (const sx of [-1, 1]) {
    P.box('window_void', 0.9, 0.46, 0.02, sx * 0.53, 2.6, cz + 0.735 - 0.035, { rx: -0.13 });
    P.box('window_glass', 0.92, 0.48, 0.01, sx * 0.53, 2.6, cz + 0.745 - 0.035, { rx: -0.13 });
    // side windows + door skins + handle + mirror arm
    P.box('window_void', 0.02, 0.44, 0.78, sx * 1.105, 2.58, cz + 0.12);
    P.box('window_glass', 0.01, 0.46, 0.8, sx * 1.115, 2.58, cz + 0.12);
    P.box('metal_dark', 0.012, 0.9, 0.012, sx * 1.155, 1.78, cz - 0.5, { bevel: 0.002 });
    P.box('metal_dark', 0.012, 0.9, 0.012, sx * 1.155, 1.78, cz + 0.62, { bevel: 0.002 });
    P.box('steel', 0.03, 0.03, 0.16, sx * 1.17, 2.05, cz - 0.3, { bevel: 0.006 });
    P.rod('metal_dark', [sx * 1.12, 2.62, cz + 0.62], [sx * 1.46, 2.72, cz + 0.72], 0.014);
    P.box('metal_dark', 0.05, 0.34, 0.2, sx * 1.48, 2.7, cz + 0.72, { bevel: 0.01 });
    // cab step and the long fuel tank under the door
    P.box('metal_rust', 0.34, 0.04, 0.5, sx * 1.22, 0.78, cz + 0.15, { bevel: 0.01, grime: 0.6 });
    P.cyl(M, 0.28, 1.2, sx * 1.1, 0.98, cz - 1.2 + 0.05, { rx: Math.PI / 2, radial: 14, grime: 0.5 });
  }
  // roof marker lamps + a whip antenna
  for (const sx of [-0.8, 0, 0.8]) P.box('lamp_red', 0.1, 0.05, 0.05, sx, 2.98, cz + 0.52, { bevel: 0.01 });
  P.rod('metal_dark', [1.05, 2.95, cz - 0.6], [1.12, 4.9, cz - 0.75], 0.006);

  // ---- spare wheel standing behind the cab ---------------------------------
  P.cyl('rubber', 0.56, 0.36, 0, 1.78, 0.55, { rx: Math.PI / 2, radial: 18, grime: 0.4 });
  P.cyl(M, 0.3, 0.38, 0, 1.78, 0.55, { rx: Math.PI / 2, radial: 14 });

  // ---- cargo bed -------------------------------------------------------------
  const bz0 = -3.82;
  const bz1 = 0.3;
  const bl = bz1 - bz0;
  const bzc = (bz0 + bz1) / 2;
  P.box('wood_prop_dark', 2.46, 0.1, bl, 0, 1.3, bzc, { bevel: 0.01, grime: 0.5 });
  for (const sx of [-1, 1]) {
    // three planks per side board, with a dark seam between each
    for (let k = 0; k < 3; k++) {
      P.box(M, 0.06, 0.17, bl, sx * 1.21, 1.43 + k * 0.18, bzc, { bevel: 0.012, wear: 1.3 });
    }
    // stake pockets / vertical ribs
    for (let k = 0; k < 6; k++) {
      P.box('metal_dark', 0.05, 0.6, 0.07, sx * 1.245, 1.62, bz0 + 0.25 + (k * (bl - 0.5)) / 5, { bevel: 0.01 });
    }
    // rear mud flap + wing over the bogie
    P.box('rubber', 0.5, 0.42, 0.02, sx * 1.0, 0.42, -3.72, { grime: 0.6 });
    P.box('metal_dark', 0.56, 0.04, 2.3, sx * 1.0, 1.24, -2.35, { bevel: 0.01, grime: 0.5 });
    // tail lamp cluster
    P.box('lamp_red', 0.14, 0.08, 0.04, sx * 0.95, 1.18, -3.85, { bevel: 0.01 });
  }
  // front board + tailgate
  P.box(M, 2.46, 0.56, 0.06, 0, 1.62, bz1 - 0.03, { bevel: 0.012 });
  P.box(M, 2.46, 0.56, 0.06, 0, 1.62, bz0 + 0.03, { bevel: 0.012, wear: 1.3 });
  // toolbox and a jerry can clamped under the bed
  P.box('metal_dark', 0.5, 0.36, 0.9, -1.0, 1.0, -0.5, { bevel: 0.02, grime: 0.6 });
  P.box('truck_paint', 0.17, 0.46, 0.34, 1.06, 1.02, -0.4, { bevel: 0.02, grime: 0.5 });

  // ---- the canvas tilt ---------------------------------------------------------
  if (opts.tilt !== false) P.geo('tarp', tiltGeometry(rng, bz0, bz1), { grime: 0.2 });

  // ---- running gear --------------------------------------------------------------
  for (const wz of [2.75, -1.65, -3.05]) {
    for (const sx of [-1, 1]) wheel(P, M, sx * 1.0, 0.6, wz, 0.6, 0.42, { rimKey: M });
  }

  P.emit(A, x, y0, z, ry, { dustH: 1.4, dust: 0.75 });

  // ---- collision ---------------------------------------------------------------
  const boxes = [
    // [lx, ly, lz, sx, sy, sz]
    [0, 0.95, 2.95, 2.4, 1.9, 1.6], // bonnet + front wheels
    [0, 1.5, 1.45, 2.4, 3.0, 1.9], // cab + spare
    [0, 1.62, -1.76, 2.5, 3.24, 4.16], // bed + tilt + rear wheels
  ];
  for (const [lx, ly, lz, sx, sy, sz] of boxes) {
    const [px, pz] = rot(x, z, ry, lx, lz);
    A.box('metal', px, y0 + ly, pz, sx, sy, sz, ry);
  }
}

/**
 * The tilt over the cargo bed: vertical side sheets from the top of the boards
 * up to the eaves, then an arched roof over five hoops, with the canvas sagging
 * between hoops and wrinkling. One grid, so the creases run continuously over
 * the eaves. The rear end is rolled half up to show the dark load space.
 */
function tiltGeometry(rng, bz0, bz1) {
  // cross-section, left eave -> right eave (x, y), sampled densely enough that
  // the arch is smooth
  const prof = [];
  const W = 1.23;
  prof.push([-W, 1.9]);
  prof.push([-W, 2.35]);
  prof.push([-W, 2.78]);
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI - (i / N) * Math.PI;
    prof.push([Math.cos(a) * W, 2.78 + Math.sin(a) * 0.46]);
  }
  prof.push([W, 2.35]);
  prof.push([W, 1.9]);

  const segZ = 32;
  const hoops = 4; // bays between hoops
  const cols = prof.length;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= segZ; j++) {
    const v = j / segZ;
    const zz = bz0 + (bz1 - bz0) * v;
    // droop between hoops: 0 on a hoop, 1 mid-bay
    const bay = (v * hoops) % 1;
    const droop = Math.sin(bay * Math.PI);
    for (let i = 0; i < cols; i++) {
      const [px, py] = prof[i];
      const onRoof = py > 2.7 ? Math.min(1, (py - 2.7) / 0.2) : 0;
      const n = fbm3(px * 3.1 + 1.7, zz * 2.3, py * 2.9, 3) - 0.5;
      const sag = droop * (0.05 * onRoof + 0.02) + n * 0.03;
      // side sheets belly outward a little under wind load
      const belly = py < 2.7 ? droop * 0.025 * Math.sign(px) : 0;
      pos.push(px + belly + n * 0.015 * Math.sign(px), py - sag * (onRoof > 0 ? 1 : 0.3), zz);
    }
  }
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + cols;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // front end cap (a fan over the arch) closes the tilt against the cab
  const capBase = pos.length / 3;
  pos.push(0, 2.3, bz1);
  for (let i = 0; i < cols; i++) pos.push(prof[i][0], prof[i][1], bz1);
  for (let i = 0; i < cols - 1; i++) idx.push(capBase, capBase + 1 + i, capBase + 2 + i);
  // rear flap: rolled up to the eave line, leaving the load space open
  const flapBase = pos.length / 3;
  const flapCols = [];
  for (let i = 0; i < cols; i++) if (prof[i][1] >= 2.55) flapCols.push(prof[i]);
  pos.push(0, 2.62, bz0 - 0.005);
  for (const [px, py] of flapCols) pos.push(px, py, bz0 - 0.005);
  for (let i = 0; i < flapCols.length - 1; i++) idx.push(flapBase, flapBase + 1 + i, flapBase + 2 + i);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the rolled flap itself
  const roll = new THREE.CylinderGeometry(0.1, 0.1, 2.4, 10, 1);
  roll.applyMatrix4(trs(_m, 0, 2.58, bz0 - 0.08, 0, 1, 1, 1, 0, Math.PI / 2));
  const merged = mergeTwo(g, roll);
  paintMasks(merged, (px, py, pz, nx, ny, nz, out) => {
    const n = fbm3(px * 4, py * 4, pz * 4, 2);
    out[0] = 0.15 + n * 0.3;
    out[1] = Math.min(1, 0.2 + Math.max(0, ny) * 0.35 * n + Math.max(0, 1 - (py - 1.9) / 0.5) * 0.4);
    out[2] = Math.max(0, -ny) * 0.4;
  });
  return merged;
}

/** Merge two geometries (position/normal only, then masks). */
function mergeTwo(a, b) {
  const ga = a.index ? a.toNonIndexed() : a;
  const gb = b.index ? b.toNonIndexed() : b;
  const pa = ga.getAttribute('position').array;
  const pb = gb.getAttribute('position').array;
  const na = ga.getAttribute('normal').array;
  const nb = gb.getAttribute('normal').array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa, 0);
  pos.set(pb, pa.length);
  const nrm = new Float32Array(na.length + nb.length);
  nrm.set(na, 0);
  nrm.set(nb, na.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (ga !== a) ga.dispose();
  if (gb !== b) gb.dispose();
  a.dispose();
  b.dispose();
  return g;
}

// ================================================================= sedan ==
/**
 * A boxy 1980s Eastern-bloc saloon, parked and abandoned: dust on every top
 * face, one tyre flat, a door ding or two. 4.1 m x 1.62 m x 1.42 m.
 */
export function buildSedan(A, rng, x, z, ry, opts = {}) {
  const P = new Parts();
  const B = opts.paint ?? 'sedan_paint';
  const L = 4.12;
  const W = 1.62;
  const ride = 0.2;
  // lower body: sills to beltline, flat sides, sharp crease
  P.box(B, W, 0.5, L - 0.06, 0, ride + 0.3, 0, { bevel: 0.05, wear: 1.1 });
  // bonnet and boot decks, slightly lower than the beltline at the ends
  P.taper(B, W - 0.04, 0.12, 1.2, W - 0.12, 1.12, 0, ride + 0.6, 1.38, { bevel: 0.03, skip: true });
  P.taper(B, W - 0.04, 0.12, 0.9, W - 0.12, 0.84, 0, ride + 0.6, -1.58, { bevel: 0.03 });
  // glasshouse: a tapered block of dark void with glass on it, and pillars
  const cy = ride + 0.92;
  P.taper('window_void', W - 0.12, 0.54, 1.86, W - 0.3, 1.3, 0, cy, -0.16, { bevel: 0.03, shiftTop: -0.06 });
  P.taper('window_glass', W - 0.1, 0.52, 1.9, W - 0.28, 1.34, 0, cy, -0.16, { bevel: 0.03, shiftTop: -0.06 });
  P.box(B, W - 0.28, 0.05, 1.32, 0, cy + 0.29, -0.22, { bevel: 0.02, wear: 1.2 });
  for (const sx of [-1, 1]) {
    // A, B and C pillars
    P.box(B, 0.06, 0.58, 0.07, sx * (W / 2 - 0.1), cy, 0.62, { rx: 0.5 });
    P.box(B, 0.06, 0.54, 0.08, sx * (W / 2 - 0.1), cy, -0.18);
    P.box(B, 0.06, 0.58, 0.14, sx * (W / 2 - 0.1), cy, -0.93, { rx: -0.42 });
    // door shut lines and handles
    P.box('metal_dark', 0.008, 0.46, 0.008, sx * (W / 2 + 0.001), ride + 0.34, 0.66, { bevel: 0.002 });
    P.box('metal_dark', 0.008, 0.46, 0.008, sx * (W / 2 + 0.001), ride + 0.34, -0.2, { bevel: 0.002 });
    P.box('metal_dark', 0.008, 0.46, 0.008, sx * (W / 2 + 0.001), ride + 0.34, -1.02, { bevel: 0.002 });
    P.box('steel', 0.02, 0.025, 0.12, sx * (W / 2 + 0.01), ride + 0.47, 0.42, { bevel: 0.005 });
    P.box('steel', 0.02, 0.025, 0.12, sx * (W / 2 + 0.01), ride + 0.47, -0.42, { bevel: 0.005 });
    // rubbing strip
    P.box('rubber', 0.02, 0.04, L - 0.5, sx * (W / 2 + 0.008), ride + 0.28, 0, { bevel: 0.006 });
    // wing mirror
    P.box('metal_dark', 0.12, 0.08, 0.05, sx * (W / 2 + 0.06), cy - 0.08, 0.66, { bevel: 0.01 });
    // lamps
    P.box('window_glass', 0.36, 0.14, 0.02, sx * (W / 2 - 0.26), ride + 0.46, L / 2 - 0.01, { bevel: 0.01 });
    P.box('plaster_white', 0.34, 0.12, 0.01, sx * (W / 2 - 0.26), ride + 0.46, L / 2 - 0.02);
    P.box('lamp_red', 0.4, 0.13, 0.03, sx * (W / 2 - 0.26), ride + 0.5, -L / 2 + 0.01, { bevel: 0.01 });
  }
  // grille, bumpers, plate
  P.box('metal_dark', W - 0.9, 0.14, 0.02, 0, ride + 0.46, L / 2 - 0.005, { bevel: 0.005 });
  P.box('steel', W + 0.02, 0.1, 0.09, 0, ride + 0.2, L / 2 + 0.02, { bevel: 0.03, wear: 1.3 });
  P.box('steel', W + 0.02, 0.1, 0.09, 0, ride + 0.2, -L / 2 - 0.02, { bevel: 0.03, wear: 1.3 });
  P.box('plaster_white', 0.52, 0.11, 0.01, 0, ride + 0.3, -L / 2 - 0.04);
  // under-tray shadow block so the car does not float over daylight
  P.box('metal_dark', W - 0.2, 0.12, L - 0.7, 0, ride + 0.02, 0, { grime: 0.8, ao: 0.8 });
  // wheels (one flat: sits lower and the car leans onto it)
  const flat = opts.flat ?? 2;
  const wp = [
    [W / 2 - 0.14, 1.28],
    [-(W / 2 - 0.14), 1.28],
    [W / 2 - 0.14, -1.24],
    [-(W / 2 - 0.14), -1.24],
  ];
  for (let i = 0; i < 4; i++) {
    const [wx, wz] = wp[i];
    const r = i === flat ? 0.27 : 0.3;
    P.cyl('rubber', r, 0.18, wx, r, wz, { radial: 18, rz: Math.PI / 2, grime: 0.5 });
    P.cyl('steel', 0.17, 0.02, wx + Math.sign(wx) * 0.09, r, wz, { radial: 14, rz: Math.PI / 2, wear: 1.2 });
    // wheel arch darkness
    P.box('metal_dark', 0.2, 0.36, 0.72, wx - Math.sign(wx) * 0.02, ride + 0.3, wz, { grime: 0.9, ao: 0.9 });
  }
  // lean onto the flat tyre
  const roll = flat === 0 || flat === 2 ? -0.02 : 0.02;
  const pitch = flat < 2 ? -0.012 : 0.012;
  P.emit(A, x, opts.y ?? 0, z, ry, { dustH: 0.8, dust: 0.9, rz: roll, rx: pitch });

  const [px, pz] = rot(x, z, ry, 0, 0);
  A.box('metal', px, (opts.y ?? 0) + 0.66, pz, W + 0.06, 1.32, L + 0.1, ry);
}

// ================================================================= HESCO ==
/** One bastion's fill: a subdivided box bulging through the mesh. */
function hescoFill(rng, s, h) {
  const g = new THREE.BoxGeometry(s, h, s, 6, 8, 6);
  const pa = g.getAttribute('position');
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const y = pa.getY(i);
    const zz = pa.getZ(i);
    const t = y / h + 0.5;
    // belly outward between the mesh panels, most at mid-height
    const bulge = Math.sin(t * Math.PI) * 0.035;
    const n = fbm3(x * 5 + 3.1, y * 5, zz * 5, 2) - 0.5;
    const kx = Math.abs(x) > s * 0.49 ? 1 + (bulge + n * 0.02) / (s / 2) : 1;
    const kz = Math.abs(zz) > s * 0.49 ? 1 + (bulge + n * 0.02) / (s / 2) : 1;
    // the top settles and slumps
    const dy = y > h * 0.49 ? -0.04 - Math.abs(n) * 0.06 : 0;
    pa.setXYZ(i, x * kx, y + dy, zz * kz);
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  paintMasks(g, (x, y, z, nx, ny, nz, out) => {
    const n = fbm3(x * 3, y * 3, z * 3, 2);
    out[0] = 0.1;
    out[1] = Math.min(1, 0.25 + Math.max(0, 1 - y / 0.5) * 0.5 + n * 0.25 + Math.max(0, -ny) * 0.3);
    out[2] = Math.min(1, Math.max(0, 1 - y / 0.3) * 0.5);
  });
  return g;
}

/**
 * A run of `n` HESCO bastions (1.05 m cells, 1.35 m tall) along local X,
 * centred on (x, z): geotextile fill, welded mesh with coil-hinge corners,
 * dirt settling on top. One sand collision proxy for the run.
 */
export function buildHesco(A, rng, x, z, ry, n = 3, opts = {}) {
  const P = new Parts();
  const s = 1.05;
  const h = opts.h ?? 1.35;
  const y0 = opts.y ?? 0;
  for (let i = 0; i < n; i++) {
    const cx = -((n - 1) * s) / 2 + i * s;
    const hh = h * (1 + (rng.float() - 0.5) * 0.04);
    const fill = hescoFill(rng, s - 0.05, hh);
    fill.translate(cx, 0, 0);
    P.geo('hesco_fill', fill);
    // dirt heaped on top
    P.box('dirt', s - 0.14, 0.06, s - 0.14, cx, hh - 0.06, 0, { bevel: 0.03, grime: 0.6 });
    // welded mesh: verticals every ~0.2 m on each face, horizontals every ~0.26 m
    const g = 5;
    for (let k = 0; k <= g; k++) {
      const f = -s / 2 + (k / g) * s;
      for (const side of [-1, 1]) {
        P.box('steel', 0.012, hh, 0.012, cx + f, hh / 2, side * (s / 2 + 0.005), { bevel: 0.002, wear: 0.6, grime: 0.3 });
        if (k > 0 && k < g) P.box('steel', 0.012, hh, 0.012, cx + side * (s / 2 + 0.005), hh / 2, f, { bevel: 0.002, grime: 0.3 });
      }
    }
    for (let k = 1; k <= 5; k++) {
      const yy = (k / 5.3) * hh;
      for (const side of [-1, 1]) {
        P.box('steel', s, 0.012, 0.012, cx, yy, side * (s / 2 + 0.006), { bevel: 0.002, grime: 0.3 });
        P.box('steel', 0.012, 0.012, s, cx + side * (s / 2 + 0.006), yy, 0, { bevel: 0.002, grime: 0.3 });
      }
    }
    // coil hinges at the four corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P.cyl('steel', 0.022, hh, cx + sx * (s / 2 + 0.01), hh / 2, sz * (s / 2 + 0.01), { radial: 6, grime: 0.4 });
    }
  }
  P.emit(A, x, y0, z, ry, { dustH: 0.6, dust: 0.7 });
  const [px, pz] = rot(x, z, ry, 0, 0);
  A.box('sand', px, y0 + h / 2, pz, n * s + 0.04, h, s + 0.04, ry);
  return { length: n * s, height: h };
}

// ============================================================ hedgehog ==
/**
 * A Czech hedgehog: three steel angle-irons welded at the middle, mutually
 * perpendicular, stood on three of their ends. `L` is the length of each
 * beam; the finished obstacle is L / sqrt(3) tall. Origin on the ground.
 */
export function hedgehogGeometry(L = 1.9, t = 0.12) {
  // rotation taking (1,1,1)/sqrt3 to +Y: the three beams then splay evenly
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 1, 1).normalize(),
    new THREE.Vector3(0, 1, 0)
  );
  const rotM = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const parts = [];
  // [sx, sy, sz] of the two flanges of each beam: a cross-section of two
  // perpendicular flats, which reads as rolled angle at any distance
  const w = t * 0.16;
  const dims = [
    [L, t, w], [L, w, t], // along X
    [w, L, t], [t, L, w], // along Y
    [t, w, L], [w, t, L], // along Z
  ];
  for (const [sx, sy, sz] of dims) parts.push(chamferBox(sx, sy, sz, 0.006));
  const out = mergeList(parts);
  out.applyMatrix4(rotM);
  out.computeBoundingBox();
  out.translate(0, -out.boundingBox.min.y, 0);
  paintMasks(out, (x, y, z, nx, ny, nz, o) => {
    const n = fbm3(x * 4, y * 4, z * 4, 2);
    o[0] = Math.min(1, o[0] + n * 0.4);
    o[1] = Math.min(1, 0.3 + Math.max(0, 1 - y / 0.3) * 0.5 + n * 0.3);
  });
  return out;
}

function mergeList(list) {
  let nPos = 0;
  let nIdx = 0;
  for (const g of list) {
    nPos += g.getAttribute('position').count;
    nIdx += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(nPos * 3);
  const nrm = new Float32Array(nPos * 3);
  const col = new Float32Array(nPos * 3);
  const idx = new Uint32Array(nIdx);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const nn = g.getAttribute('normal');
    const c = g.getAttribute('color');
    pos.set(p.array, vo * 3);
    nrm.set(nn.array, vo * 3);
    if (c) col.set(c.array, vo * 3);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    }
    vo += p.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nPos * 2), 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ============================================================ power line ==
/**
 * A line of timber power poles with crossarms, insulators and sagging
 * conductors, plus a service drop from each pole to the nearest facade. The
 * silhouette the street's skyline was missing: verticals and catenaries against
 * the sky. `poles` are [x, z] in level space; `drops` are optional facade
 * anchor points [x, y, z] per pole (or null).
 */
export function buildPowerLine(A, rng, poles, opts = {}) {
  const H = opts.height ?? 8.4;
  const arm = opts.arm ?? 1.5;
  const tops = []; // per pole: 4 conductor attach points [x, y, z]
  for (let p = 0; p < poles.length; p++) {
    const [x, z, drop, transformer] = poles[p];
    const y = opts.groundY ? opts.groundY(x, z) : 0;
    const lean = (rng.float() - 0.5) * 0.035;
    const leanZ = (rng.float() - 0.5) * 0.035;
    const P = new Parts();
    // pole: tapered, slightly bent, a tar-dark base where it enters the ground
    P.cyl('timber_pole', 0.13, H, 0, H / 2, 0, { taper: 0.72, radial: 10, grime: 0.3 });
    P.cyl('timber_pole', 0.145, 0.9, 0, 0.45, 0, { radial: 10, grime: 0.9, ao: 0.5 });
    // crossarms (across the street, i.e. along level X) with steel braces
    P.box('timber_pole', arm, 0.1, 0.1, 0, H - 0.35, 0, { bevel: 0.01, wear: 1.2 });
    P.box('timber_pole', arm * 0.7, 0.09, 0.09, 0, H - 1.05, 0, { bevel: 0.01, wear: 1.2 });
    for (const s of [-1, 1]) {
      P.rod('metal_rust', [s * arm * 0.33, H - 0.36, 0.06], [0, H - 0.85, 0.06], 0.012);
    }
    // insulators: ceramic bells on steel pins
    const pins = [-arm * 0.45, -arm * 0.15, arm * 0.15, arm * 0.45];
    const att = [];
    for (const px of pins) {
      P.cyl('plaster_white', 0.045, 0.1, px, H - 0.24, 0, { taper: 0.6, radial: 8 });
      att.push([px, H - 0.17]);
    }
    for (const px of [-arm * 0.3, arm * 0.3]) {
      P.cyl('plaster_white', 0.04, 0.09, px, H - 0.95, 0, { taper: 0.6, radial: 8 });
    }
    if (transformer) {
      // pole-mounted transformer on a bracket, with its bushings
      P.box('metal_dark', 0.5, 0.08, 0.5, 0, H - 2.7, 0.32, { bevel: 0.01 });
      P.cyl('metal_green', 0.26, 0.85, 0, H - 2.22, 0.36, { radial: 14, grime: 0.4 });
      for (const bx of [-0.12, 0, 0.12]) P.cyl('plaster_white', 0.03, 0.14, bx, H - 1.72, 0.36, { radial: 6 });
      P.rod('metal_dark', [-0.12, H - 1.66, 0.36], [-arm * 0.15, H - 0.2, 0], 0.008);
      P.rod('metal_dark', [0.12, H - 1.66, 0.36], [arm * 0.15, H - 0.2, 0], 0.008);
    }
    // a street number plate and a rusted climbing step or two
    P.box('metal_blue', 0.02, 0.14, 0.1, -0.135, 2.4, 0, { bevel: 0.003 });
    for (let k = 0; k < 3; k++) {
      P.rod('metal_rust', [0.1, 3.2 + k * 0.45, (k % 2 ? 1 : -1) * 0.05], [0.28, 3.2 + k * 0.45, (k % 2 ? 1 : -1) * 0.05], 0.012);
    }
    P.emit(A, x, y, z, 0, { dustH: 1.2, dust: 0.4, rx: leanZ, rz: lean });
    A.box('wood', x, y + H / 2, z, 0.28, H, 0.28);
    tops.push(att.map(([ax, ay]) => [x + ax + lean * ay * -1, y + ay, z + leanZ * ay]));

    // service drop to a facade
    if (drop) {
      const from = [x + (drop[0] > x ? arm * 0.45 : -arm * 0.45), y + H - 0.17, z];
      const t = catenaryTube(from, drop, 0.35, 0.009, { seg: 12, radial: 4, jitter: 0.03 });
      A.addOnce('metal_dark', t, null, { masks: [0.3, 0.6, 0.2] });
      A.addBox('metal_dark', chamferBox(0.08, 0.1, 0.08, 0.01), drop[0], drop[1] - 0.02, drop[2], 0, 1, 1, 1, {
        masks: [0.6, 0.5, 0.2],
      });
    }
  }
  // conductors between consecutive poles; slightly different sag per wire so
  // they never read as one ruled bundle
  for (let p = 0; p + 1 < tops.length; p++) {
    const a = tops[p];
    const b = tops[p + 1];
    const span = Math.hypot(b[0][0] - a[0][0], b[0][2] - a[0][2]);
    for (let w = 0; w < a.length; w++) {
      const sag = span * (0.028 + rng.float() * 0.012);
      const t = catenaryTube(a[w], b[w], sag, w === 0 ? 0.014 : 0.01, { seg: 16, radial: 4 });
      A.addOnce('metal_dark', t, null, { masks: [0.3, 0.6, 0.2] });
    }
  }
  // the lines run on past the ends of the street
  const ext = opts.extend ?? 12;
  for (const [end, prev] of [
    [tops[0], tops[1]],
    [tops[tops.length - 1], tops[tops.length - 2]],
  ]) {
    if (!end || !prev) continue;
    const dx = end[0][0] - prev[0][0];
    const dz = end[0][2] - prev[0][2];
    const k = ext / Math.max(1e-3, Math.hypot(dx, dz));
    for (let w = 0; w < end.length; w++) {
      const to = [end[w][0] + dx * k, end[w][1] - 0.4, end[w][2] + dz * k];
      const t = catenaryTube(end[w], to, ext * 0.03, 0.01, { seg: 12, radial: 4 });
      A.addOnce('metal_dark', t, null, { masks: [0.3, 0.6, 0.2] });
    }
  }
}

// ============================================================ concertina ==
/** A coil of concertina wire along local X, on low pickets. */
export function buildConcertina(A, rng, x, z, ry, len, opts = {}) {
  const P = new Parts();
  const r = opts.r ?? 0.42;
  const pitch = 0.2;
  const turns = Math.floor(len / pitch);
  const seg = 10;
  let prev = null;
  for (let i = 0; i <= turns * seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const wob = (fbm3(i * 0.37, 1.3, 2.1, 2) - 0.5) * 0.06;
    const p = [-len / 2 + (i / seg) * pitch, r + Math.sin(a) * (r * 0.95 + wob), Math.cos(a) * (r + wob)];
    if (prev) P.rod('steel', prev, p, 0.0045, { radial: 3, wear: 0.5 });
    prev = p;
  }
  for (let i = 0; i <= Math.floor(len / 2.4); i++) {
    const px = -len / 2 + 0.2 + i * 2.4;
    P.rod('metal_rust', [px, 0, 0], [px, 1.0, 0.02], 0.018, { radial: 5 });
  }
  P.emit(A, x, opts.y ?? 0, z, ry, { dustH: 0.3, dust: 0.3 });
  // wire is an obstacle, not cover: a low proxy so nothing walks through it
  const [px, pz] = rot(x, z, ry, 0, 0);
  A.box('metal', px, (opts.y ?? 0) + r, pz, len, r * 2, r * 2, ry);
}
