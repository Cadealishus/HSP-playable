import * as THREE from 'three';
import { PLANE, ROUNDHOUSE, PLAY } from './layout.js';
import { slab, clip, boxAt, cylAt, G, part, merged, cylPart } from './kit.js';
import { trs } from '../../util.js';

/**
 * HOLDING PATTERN — the tarmac south and east of the terminal, the landside
 * kerb, the ground-service clutter (cart trains, ULD cans, the belt loader
 * lives with the aircraft), the Roundhouse, the playable-edge blocking, and the
 * non-playable backdrop past it.
 */

const _m = new THREE.Matrix4();

/** Outdoor walkable rectangles [x0, z0, x1, z1] (also `isOpen`). */
export const TARMAC = [
  [PLAY.x0, 27, PLAY.x1, PLAY.z1],
  [PLAY.x0, 11, -31, 27],
  [1, 12, PLAY.x1, 27],
  [29, -8, PLAY.x1, 12],
  [38, PLAY.eastZ0, PLAY.x1, -8],
];
export const KERB = [PLAY.kerb.x0, PLAY.kerb.z0, PLAY.kerb.x1, -26];

export function buildApron(A, rng) {
  // --------------------------------------------------------------- ground --
  for (const [x0, z0, x1, z1] of TARMAC) {
    slab(A, 'apron_concrete', x0, -0.3, z0, x1, 0, z1, { collide: true, masks: [0, 0.1, 0] });
  }
  slab(A, 'sandstone', KERB[0], -0.3, KERB[1], KERB[2], 0, KERB[3], { collide: true });
  // the landside road beyond the kerb (backdrop), and the world past the fence
  slab(A, 'apron_asphalt', -120, -0.36, -140, 200, -0.06, 180);
  slab(A, 'apron_asphalt', KERB[0] - 30, -0.3, KERB[1] - 14, KERB[2] + 60, -0.02, KERB[1]);
  // joint lines on the stands: a 5 m grid of dark tar strips
  for (let x = -35; x < PLAY.x1; x += 5) slab(A, 'apron_asphalt', x - 0.03, 0, 27.2, x + 0.03, 0.003, PLAY.z1 - 0.2);
  for (let z = 30; z < PLAY.z1; z += 5) slab(A, 'apron_asphalt', PLAY.x0 + 0.2, 0, z - 0.03, PLAY.x1 - 0.2, 0.003, z + 0.03);

  markings(A);

  // --------------------------------------------------- playable-edge fence --
  const fenceH = 4.2;
  const fence = (x0, z0, x1, z1) => {
    // blast fence: corrugated panels on a steel frame; the blocking volume is
    // taller than anything a player can mantle
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    boxAt(A, 'corrugated', cx, fenceH / 2, cz, len, fenceH, 0.12, ry);
    A.box('concrete', cx, 4, cz, len, 8, 0.6, ry);
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      boxAt(A, 'alu_dark', x0 + (x1 - x0) * t, fenceH / 2, z0 + (z1 - z0) * t, 0.18, fenceH + 0.2, 0.3, ry);
    }
  };
  fence(PLAY.x0, PLAY.z1, PLAY.x1, PLAY.z1);
  fence(PLAY.x0, 11, PLAY.x0, PLAY.z1);
  fence(PLAY.x1, PLAY.eastZ0, PLAY.x1, PLAY.z1);
  fence(38, PLAY.eastZ0, PLAY.x1, PLAY.eastZ0);
  fence(PLAY.x0, 11, -37, 11);
  // landside kerb: a railing and bollards on the road edge, clip above
  const K = PLAY.kerb;
  for (let x = K.x0 + 0.5; x < K.x1; x += 1.6) cylAt(A, 'steel', x, 0, K.z0 + 0.4, 0.11, 0.95, { collide: 'metal', seg: 10 });
  clip(A, K.x0, 0, K.z0 - 0.4, K.x1, 8, K.z0 + 0.1);
  clip(A, K.x0 - 0.5, 0, K.z0, K.x0, 8, -26);
  clip(A, K.x1, 0, K.z0, K.x1 + 0.5, 8, -26);
  clip(A, K.x0, 0, -26.4, -22, 8, -25.6);
  // the kerb canopy: a steel roof on posts along the façade (visual, no roof collision)
  slab(A, 'alu_dark', K.x0 + 1, 4.4, -32.6, K.x1 - 1, 4.7, -26);
  slab(A, 'ceiling', K.x0 + 1, 4.36, -32.6, K.x1 - 1, 4.4, -26);
  for (let x = K.x0 + 2; x < K.x1 - 1; x += 6) slab(A, 'alu_dark', x - 0.15, 0, -32.2, x + 0.15, 4.4, -31.9, { collide: 'metal' });

  // ------------------------------------------------------------ Roundhouse --
  roundhouse(A);

  // ------------------------------------------------- ground-service clutter --
  registerApronProtos(A);
  const fz = PLANE.fz;
  // the cart train shielding the slide's foot
  cartTrain(A, 11.0, 37.2, 0, 3);
  cartTrain(A, 30.5, 31.5, Math.PI, 2);
  // ULD cans: a stack by the cargo side, and a loose row
  for (const [x, z, ry, s] of [
    [2.0, 31.5, 0.05, 0],
    [3.8, 31.6, -0.04, 0],
    [2.9, 31.4, 0.1, 1],
    [22.5, 40.5, 0.4, 0],
    [24.3, 41.2, 0.35, 0],
    [40.0, 36.0, -0.2, 0],
    [41.9, 36.4, -0.25, 0],
    [41.0, 36.2, -0.2, 1],
    [58.0, 8.0, 0.1, 0],
    [59.8, 8.2, 0.1, 0],
  ]) uld(A, x, z, ry, s);
  // a stairs truck parked off the aft door (not functional)
  stairsTruck(A, 7.4, fz - 5.6, Math.PI / 2);
  // catering truck at the front right, box raised
  cateringTruck(A, 40.5, fz + 5.2, 0);
  // tug at the nose, fuel truck on the east apron
  tug(A, 54.2, fz, Math.PI / 2);
  fuelTruck(A, 62, 42, -Math.PI / 2);
  fuelTruck(A, 52, -16, Math.PI);
  // cones and chocks round the aircraft
  const cones = [
    [52.8, fz - 1.2],
    [52.8, fz + 1.2],
    [16.5, fz - 12.5],
    [16.5, fz + 12.5],
    [26.4, fz - 7],
    [26.4, fz + 7],
    [5.2, fz + 2],
    [5.2, fz - 2],
    [30, 30],
    [33, 45],
    [-6, 33],
    [-20, 30],
    [45, 5],
    [36.5, 5.5],
  ];
  for (const [x, z] of cones) A.put('ap_cone', x, 0, z, (x * 3.1 + z) % 6.28);
  for (const [x, z] of [
    [44.7, fz + 0.9],
    [21.5, fz + 2.9],
    [21.5, fz - 2.9],
  ]) A.put('ap_chock', x, 0, z, 0);
  // floodlight masts
  for (const [x, z] of [
    [-22, 48],
    [44, 56],
    [68, -6],
  ]) mast(A, x, z);

  // ------------------------------------------------------------- backdrop --
  backdrop(A, rng);
}

/** Stand markings: lead-in line, stop bars, stand boxes, service road. */
function markings(A) {
  const fz = PLANE.fz;
  const y = 0.004;
  // lead-in line down the centreline, with the stop bar under the nose gear
  slab(A, 'paint_yellow', -30, 0, fz - 0.1, 50, y, fz + 0.1);
  slab(A, 'paint_yellow', 44.4, 0, fz - 2.2, 45.0, y, fz + 2.2);
  slab(A, 'paint_white', 46.2, 0, fz - 1.4, 46.5, y, fz + 1.4);
  // stand safety box (red), leaving the bridge's wheel track clear
  const lines = [
    [0, 13.2, 52, 13.4],
    [0, 36.6, 52, 36.8],
    [0, 13.2, 0.2, 36.8],
    [51.8, 13.2, 52, 36.8],
  ];
  for (const [x0, z0, x1, z1] of lines) slab(A, 'paint_red', x0, 0, z0, x1, y, z1);
  // bridge wheel-track hatching
  for (let z = 10; z < 21; z += 1.2) slab(A, 'paint_red', 36.2, 0, z, 38.8, y, z + 0.4);
  // service road: two white edge lines and a dashed centre, across the south
  slab(A, 'paint_white', -38, 0, 43.8, 78, y, 44.0);
  slab(A, 'paint_white', -38, 0, 52.0, 78, y, 52.2);
  for (let x = -36; x < 76; x += 4) slab(A, 'paint_white', x, 0, 47.9, x + 2, y, 48.1);
  // equipment restraint line along the building
  slab(A, 'paint_yellow', -30, 0, 28.2, 1, y, 28.35);
  slab(A, 'paint_yellow', 1.5, 0, 12.8, 29, y, 12.95);
  // east apron lane
  slab(A, 'paint_white', 43.8, 0, -24, 44.0, y, 12);
  for (let z = -23; z < 11; z += 4) slab(A, 'paint_yellow', 55.9, 0, z, 56.1, y, z + 2);
}

/** The Roundhouse: a drum-shaped ground-service building, hard cover mid-apron. */
function roundhouse(A) {
  const { x, z, r, h } = ROUNDHOUSE;
  const drum = cylPart(r, h, 0, h / 2, 0, 40);
  drum.applyMatrix4(trs(_m, x, 0, z));
  A.add('concrete_white', drum);
  drum.dispose();
  const band = cylPart(r + 0.06, 1.4, 0, h - 1.6, 0, 40);
  band.applyMatrix4(trs(_m, x, 0, z));
  A.add('window_dark', band);
  band.dispose();
  const base = cylPart(r + 0.1, 1.0, 0, 0.5, 0, 40);
  base.applyMatrix4(trs(_m, x, 0, z));
  A.add('sandstone', base);
  base.dispose();
  const cap = cylPart(r + 0.4, 0.5, 0, h + 0.25, 0, 40);
  cap.applyMatrix4(trs(_m, x, 0, z));
  A.add('alu_dark', cap);
  cap.dispose();
  // roof plant
  slab(A, 'alu', x - 2, h + 0.5, z - 1.5, x + 2.5, h + 2.1, z + 1.5);
  // roller doors round the drum (dark recesses) and collision as an octagon
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const cx = x + Math.cos(a) * r * 0.96;
    const cz = z + Math.sin(a) * r * 0.96;
    const side = 2 * r * Math.tan(Math.PI / 8) + 0.2;
    A.box('concrete', x + Math.cos(a) * (r - 0.4), h / 2, z + Math.sin(a) * (r - 0.4), side, h, 0.8, -a + Math.PI / 2);
    if (k % 2 === 0) boxAt(A, 'corrugated', cx + Math.cos(a) * 0.35, 1.9, cz + Math.sin(a) * 0.35, 3.4, 3.8, 0.12, -a + Math.PI / 2);
  }
}

// --------------------------------------------------------------- vehicles --
function registerApronProtos(A) {
  if (A.has('ap_cone')) return;
  const cone = merged([cylPart(0.16, 0.62, 0, 0.33, 0, 12, 0, 0, 0.02), part(0.38, 0.03, 0.38, 0, 0.015, 0)]);
  A.proto('ap_cone', { geo: cone, key: 'cone_orange' });
  A.proto('ap_chock', { geo: merged([part(0.25, 0.18, 0.9, 0, 0.09, 0)]), key: 'gse_yellow' });
}

function wheel(A, x, y, z, r, w, ry = 0) {
  const g = cylPart(r, w, 0, 0, 0, 12, Math.PI / 2, 0);
  g.applyMatrix4(trs(_m, x, y, z, ry));
  A.add('rubber', g);
  g.dispose();
}

/** A baggage tractor pulling `n` dollies, heading `ry`, front at (x, z). */
function cartTrain(A, x, z, ry, n) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (d) => [x - c * d, z + s * d];
  // tractor
  const [tx, tz] = at(1.0);
  boxAt(A, 'gse_yellow', tx, 0.75, tz, 2.2, 0.9, 1.3, ry, { collide: 'metal', masks: [0.5, 0.5, 0.3] });
  boxAt(A, 'plastic_dark', tx - c * 0.35, 1.55, tz + s * 0.35, 0.9, 0.7, 1.1, ry);
  for (const [dx, dz] of [
    [0.7, 0.6],
    [0.7, -0.6],
    [-0.7, 0.6],
    [-0.7, -0.6],
  ]) wheel(A, tx + c * dx - s * dz, 0.33, tz - s * dx - c * dz, 0.33, 0.22, ry);
  for (let i = 0; i < n; i++) {
    const [dx, dz] = at(3.3 + i * 3.1);
    boxAt(A, 'alu', dx, 0.62, dz, 2.6, 0.1, 1.6, ry, { collide: 'metal' });
    // luggage and a canvas-sided can on alternate dollies
    if (i % 2 === 0) {
      boxAt(A, 'gse_white', dx, 1.4, dz, 2.3, 1.5, 1.5, ry, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
    } else {
      boxAt(A, 'luggage_blue', dx - c * 0.5, 0.95, dz + s * 0.5, 0.75, 0.55, 0.5, ry + 0.2);
      boxAt(A, 'luggage_red', dx + c * 0.4, 0.92, dz - s * 0.4, 0.7, 0.5, 0.45, ry - 0.1);
      boxAt(A, 'luggage_olive', dx, 1.35, dz, 0.8, 0.35, 0.55, ry + 0.4);
      A.box('fabric', dx, 1.0, dz, 2.4, 0.8, 1.4, ry);
    }
    for (const [ax, az] of [
      [0.9, 0.7],
      [0.9, -0.7],
      [-0.9, 0.7],
      [-0.9, -0.7],
    ]) wheel(A, dx + c * ax - s * az, 0.24, dz - s * ax - c * az, 0.24, 0.16, ry);
  }
}

/** A ULD (LD3) container: the slanted-shoulder aluminium can. */
function uld(A, x, z, ry, stack = 0) {
  const y0 = stack * 1.64;
  boxAt(A, 'alu', x, y0 + 0.82, z, 1.56, 1.62, 1.53, ry, { collide: 'metal', masks: [0.5, 0.6, 0.4] });
  boxAt(A, 'alu_dark', x, y0 + 0.05, z, 1.6, 0.1, 1.57, ry);
  boxAt(A, 'plastic_dark', x + Math.sin(ry) * 0.78, y0 + 0.85, z + Math.cos(ry) * 0.78, 1.2, 1.3, 0.02, ry);
}

function stairsTruck(A, x, z, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  boxAt(A, 'gse_white', x, 0.8, z, 5.5, 0.9, 2.0, ry, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  boxAt(A, 'window_dark', x + c * 2.2, 1.7, z - s * 2.2, 1.2, 1.0, 1.9, ry, { collide: 'metal' });
  // the stair flight, rising toward the aircraft (cosmetic)
  for (let i = 0; i < 12; i++) {
    const d = -2.4 + i * 0.36;
    boxAt(A, 'steel', x + c * d, 1.3 + i * 0.2, z - s * d, 0.34, 0.06, 1.2, ry);
  }
  boxAt(A, 'steel', x - c * 0.1, 2.5, z - s * 0.1, 4.6, 0.06, 0.06, ry, { rz: 0.5 });
  for (const d of [-2, 2]) for (const e of [-0.9, 0.9]) wheel(A, x + c * d - s * e, 0.4, z - s * d - c * e, 0.4, 0.28, ry);
}

function cateringTruck(A, x, z, ry) {
  boxAt(A, 'gse_white', x - 1.8, 1.3, z, 2.0, 2.2, 2.3, ry, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  boxAt(A, 'window_dark', x - 2.75, 1.8, z, 0.1, 0.8, 2.0, ry);
  boxAt(A, 'alu_dark', x + 1.2, 0.8, z, 4.4, 0.5, 2.3, ry, { collide: 'metal' });
  // scissor lift and the raised box
  for (const k of [-1, 1]) boxAt(A, 'steel', x + 1.2, 2.0, z + k * 0.8, 3.6, 0.1, 0.1, ry, { rz: k * 0.45 });
  boxAt(A, 'gse_white', x + 1.2, 3.8, z, 4.2, 2.2, 2.3, ry, { masks: [0.4, 0.5, 0.3] });
  for (const d of [-1.8, 2.4]) for (const e of [-1, 1]) wheel(A, x + d, 0.45, z + e, 0.45, 0.3, ry);
}

function tug(A, x, z, ry) {
  boxAt(A, 'gse_yellow', x, 0.75, z, 4.2, 1.1, 2.4, ry, { collide: 'metal', masks: [0.5, 0.5, 0.3] });
  boxAt(A, 'window_dark', x + Math.sin(ry) * 1.2, 1.65, z + Math.cos(ry) * 1.2, 1.4, 0.8, 1.2, ry);
  for (const d of [-1.4, 1.4]) for (const e of [-1.1, 1.1]) wheel(A, x + Math.sin(ry) * d + Math.cos(ry) * e, 0.5, z + Math.cos(ry) * d - Math.sin(ry) * e, 0.5, 0.4, ry + Math.PI / 2);
}

function fuelTruck(A, x, z, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  boxAt(A, 'gse_white', x + c * 3.2, 1.4, z - s * 3.2, 2.0, 2.2, 2.4, ry, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  const tank = cylPart(1.15, 6.2, 0, 0, 0, 20, 0, Math.PI / 2);
  tank.applyMatrix4(trs(_m, x - c * 1.0, 1.85, z + s * 1.0, ry));
  A.add('gse_white', tank);
  tank.dispose();
  A.box('metal', x - c * 1.0, 1.4, z + s * 1.0, 6.2, 2.8, 2.3, ry);
  boxAt(A, 'alu_dark', x, 0.6, z, 8.2, 0.4, 2.2, ry);
  for (const d of [-3.4, -2.2, 3.2]) for (const e of [-1.05, 1.05]) wheel(A, x + c * d - s * e, 0.5, z - s * d - c * e, 0.5, 0.35, ry);
}

function mast(A, x, z) {
  cylAt(A, 'alu_dark', x, 0, z, 0.3, 22, { collide: 'metal', seg: 10 });
  slab(A, 'alu_dark', x - 2, 21.6, z - 0.4, x + 2, 22.8, z + 0.4);
  for (let i = 0; i < 4; i++) slab(A, 'light_warm', x - 1.8 + i * 0.95, 21.5, z - 0.3, x - 1.1 + i * 0.95, 21.6, z + 0.3);
  slab(A, 'concrete_white', x - 0.7, 0, z - 0.7, x + 0.7, 0.5, z + 0.7, { collide: 'concrete' });
}

/** The non-playable world past the fence: hangars, a tower, the next terminal. */
function backdrop(A, rng) {
  // hangars south, beyond the blast fence
  for (const [x, z, w, d, h] of [
    [-30, 92, 44, 30, 18],
    [34, 96, 52, 34, 22],
    [96, 90, 30, 26, 14],
  ]) {
    slab(A, 'corrugated', x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, { masks: [0.3, 0.5, 0.3] });
    slab(A, 'roof_membrane', x - w / 2 - 0.5, h, z - d / 2 - 0.5, x + w / 2 + 0.5, h + 0.8, z + d / 2 + 0.5);
    slab(A, 'alu_dark', x - w / 2 + 3, 0, z - d / 2 - 0.1, x + w / 2 - 3, h - 3, z - d / 2);
  }
  // control tower
  cylAt(A, 'concrete_white', 8, 0, 128, 3.2, 38, { seg: 20 });
  cylAt(A, 'window_dark', 8, 38, 128, 6.2, 4, { seg: 20 });
  cylAt(A, 'alu_dark', 8, 42, 128, 6.8, 1.2, { seg: 20 });
  cylAt(A, 'steel', 8, 43.2, 128, 0.2, 8, { seg: 8 });
  // the next pier east, and a parked tail beyond it
  slab(A, 'concrete_white', 100, 0, -30, 150, 12, 10);
  slab(A, 'window_dark', 99.8, 3, -28, 100, 10, 8);
  slab(A, 'livery_white', 118, 4, 24, 150, 8, 28);
  boxAt(A, 'livery_white', 120, 12, 26, 8, 8, 0.4, 0);
  // landside: a parking structure and a hotel slab north of the kerb
  slab(A, 'concrete_white', -40, 0, -90, 20, 14, -58, { masks: [0.3, 0.5, 0.3] });
  for (let y = 3; y < 14; y += 3.5) slab(A, 'window_dark', -39.8, y, -58.1, 19.8, y + 1.2, -57.9);
  slab(A, 'wall_grey', 40, 0, -80, 70, 34, -60);
  // the terminal's own roof edges beyond the play space (west of the wing)
  slab(A, 'roof_membrane', -60, 0, -30, -37.4, 9, 10.6);
  slab(A, 'roof_membrane', -60, 0, -40, -24.6, 11, -26.4);
  void rng;
}
