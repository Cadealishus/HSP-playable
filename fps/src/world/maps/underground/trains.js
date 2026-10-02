import * as THREE from 'three';
import { slab, cylAt, G } from '../airport/kit.js';
import { trs } from '../../util.js';
import { CAR, TRAINS, Y } from './layout.js';

/**
 * UNDERGROUND: the abandoned trains. Walk-through cars: a collidable floor at
 * platform height, side walls with open (or shut) sliding doors, gangways
 * between cars, longitudinal benches, poles and grab rails. The roof never
 * collides (see the nav-grid note in airport/kit.js), so the car floor owns
 * the nav cells above the track bed and the AI walks the aisle like a corridor.
 *
 * Returns `[{ id, train, index, x0, x1, z, doors:[{x, side, open}], gangways }]`
 * in LEVEL space, which index.js publishes as `anchors.trainCars`.
 */

const _m = new THREE.Matrix4();
const DOOR_S = [2.6, 8.0, 13.4]; // door centres from the car's west end

export function buildTrains(A) {
  const cars = [];
  for (const t of TRAINS) {
    for (let i = 0; i < t.cars; i++) {
      const x0 = t.x + i * (CAR.len + CAR.gap);
      const car = buildCar(A, t, i, x0);
      cars.push(car);
      if (i < t.cars - 1) gangway(A, x0 + CAR.len, t.z);
    }
  }
  return cars;
}

function buildCar(A, t, index, x0) {
  const L = CAR.len;
  const x1 = x0 + L;
  const zc = t.z;
  const P = CAR.floor;
  const T = Y.track;
  const H = CAR.h;
  const zN = zc - CAR.w / 2;
  const zS = zc + CAR.w / 2;
  const first = index === 0;
  const last = index === t.cars - 1;
  const doors = [];

  // floor, underframe, bogies
  slab(A, 'train_floor', x0, P - 0.12, zN + 0.05, x1, P, zS - 0.05, { collide: 'rubber' });
  slab(A, 'metal_dark', x0 + 0.6, T + 0.5, zc - 1.3, x1 - 0.6, P - 0.12, zc + 1.3, { collide: 'metal', masks: [0.5, 0.8, 0.6] });
  for (const bx of [x0 + 2.4, x1 - 2.4]) {
    slab(A, 'metal_dark', bx - 1.3, T + 0.3, zc - 1.1, bx + 1.3, T + 0.75, zc + 1.1, { masks: [0.5, 0.9, 0.6] });
    for (const dx of [-0.9, 0.9]) {
      for (const dz of [-0.72, 0.72]) {
        A.add('rail_steel', G.cyl(A, 16), trs(_m, bx + dx, T + 0.42, zc + dz, 0, 0.84, 0.12, 0.84, Math.PI / 2, 0));
      }
    }
  }

  // ------------------------------------------------------------- sides --
  for (const side of ['north', 'south']) {
    const zo = side === 'north' ? zN : zS; // outer face
    const dir = side === 'north' ? 1 : -1; // inward
    const zSkin0 = zo;
    const zSkin1 = zo + dir * 0.05;
    const zIn0 = zo + dir * 0.05;
    const zIn1 = zo + dir * 0.09;
    const zA = Math.min(zSkin0, zSkin1);
    const zB = Math.max(zSkin0, zSkin1);
    const zIa = Math.min(zIn0, zIn1);
    const zIb = Math.max(zIn0, zIn1);
    const zColl0 = Math.min(zo, zo + dir * 0.1);
    const zColl1 = Math.max(zo, zo + dir * 0.1);
    // the doors on this side: open towards the platform, and on the station
    // car one door on the track side too (the only way across without steps)
    const openHere = (k) => (side === 'north' && t.doors === 'north') || (side === 'south' && t.id === 'station' && k === 1 && index === 0);
    const cuts = DOOR_S.map((s) => [x0 + s - CAR.doorW / 2, x0 + s + CAR.doorW / 2]);
    let xa = x0;
    const runs = [];
    for (const [a, b] of cuts) {
      runs.push([xa, a]);
      xa = b;
    }
    runs.push([xa, x1]);
    for (const [a, b] of runs) {
      // outer skin: lower panel, upper panel, pillar stubs at the run ends
      slab(A, 'train_body', a, P - 0.25, zA, b, P + 0.95, zB);
      slab(A, 'train_body', a, P + 2.0, zA, b, P + H, zB);
      slab(A, 'train_band', a, P + 0.68, zA - 0.006, b, P + 0.84, zB + 0.006);
      slab(A, 'train_panel', a, P, zIa, b, P + 0.95, zIb);
      slab(A, 'train_panel', a, P + 2.0, zIa, b, P + H, zIb);
      // window band: glass with a pillar every ~1.9 m
      const n = Math.max(1, Math.round((b - a) / 1.9));
      for (let k = 0; k <= n; k++) {
        const px = a + ((b - a) * k) / n;
        slab(A, 'train_body', px - 0.06, P + 0.95, zA, px + 0.06, P + 2.0, zIb);
      }
      A.add('glazing', G.pane(A), trs(_m, (a + b) / 2, P + 1.475, (zA + zIb) / 2, 0, b - a, 1.05, 1));
      A.box('metal', (a + b) / 2, P + H / 2, (zColl0 + zColl1) / 2, b - a, H, zColl1 - zColl0);
    }
    DOOR_S.forEach((s, k) => {
      const a = x0 + s - CAR.doorW / 2;
      const b = x0 + s + CAR.doorW / 2;
      const open = openHere(k);
      doors.push({ x: (a + b) / 2, side, open });
      // header over the door, frame jambs
      slab(A, 'train_body', a, P + CAR.doorH, zA, b, P + H, zIb);
      slab(A, 'gate_steel', a - 0.04, P, zA - 0.01, a + 0.02, P + CAR.doorH, zIb + 0.01);
      slab(A, 'gate_steel', b - 0.02, P, zA - 0.01, b + 0.04, P + CAR.doorH, zIb + 0.01);
      A.box('metal', (a + b) / 2, P + CAR.doorH + (H - CAR.doorH) / 2, (zColl0 + zColl1) / 2, b - a, H - CAR.doorH, zColl1 - zColl0);
      if (open) {
        // leaves slid back into the pockets: visible as a double skin either side
        slab(A, 'gate_steel', a - 0.7, P + 0.05, zIb, a, P + CAR.doorH - 0.05, zIb + dir * 0.03);
        slab(A, 'gate_steel', b, P + 0.05, zIb, b + 0.7, P + CAR.doorH - 0.05, zIb + dir * 0.03);
        // gap filler to the platform edge
        if (side === 'north') slab(A, 'threshold', a, P - 0.06, -8.0, b, P, zN, { collide: 'metal' });
        slab(A, 'edge_yellow', a, P, zA, b, P + 0.004, zIb);
      } else {
        // shut leaves: two panels with windows, meeting in the middle
        const m = (a + b) / 2;
        for (const [la, lb] of [[a, m - 0.005], [m + 0.005, b]]) {
          slab(A, 'train_body', la, P, zA, lb, P + 1.0, zB);
          slab(A, 'train_body', la, P + 1.9, zA, lb, P + CAR.doorH, zB);
          slab(A, 'train_body', la, P + 1.0, zA, la + 0.08, P + 1.9, zB);
          slab(A, 'train_body', lb - 0.08, P + 1.0, zA, lb, P + 1.9, zB);
        }
        A.add('glazing', G.pane(A), trs(_m, m, P + 1.45, (zA + zB) / 2, 0, b - a - 0.2, 0.9, 1));
        A.box('metal', m, P + CAR.doorH / 2, (zColl0 + zColl1) / 2, b - a, CAR.doorH, zColl1 - zColl0);
      }
    });
  }

  // -------------------------------------------------------------- ends --
  const gangs = [];
  for (const [xe, inner] of [[x0, !first], [x1, !last]]) {
    const xa = xe === x0 ? x0 : x1 - 0.1;
    const xb = xa + 0.1;
    if (inner) {
      // end wall with a gangway opening 1.2 m wide
      slab(A, 'train_panel', xa, P, zN, xb, P + H, zc - 0.6, { collide: 'metal' });
      slab(A, 'train_panel', xa, P, zc + 0.6, xb, P + H, zS, { collide: 'metal' });
      slab(A, 'train_panel', xa, P + CAR.doorH, zc - 0.6, xb, P + H, zc + 0.6, { collide: 'metal' });
      gangs.push(xe);
    } else {
      // cab end: solid with a wide front window and a route blind
      slab(A, 'train_body', xa, P - 0.25, zN, xb, P + 1.0, zS, { collide: 'metal' });
      slab(A, 'train_body', xa, P + 2.1, zN, xb, P + H, zS, { collide: 'metal' });
      slab(A, 'train_body', xa, P + 1.0, zN, xb, P + 2.1, zN + 0.2);
      slab(A, 'train_body', xa, P + 1.0, zS - 0.2, xb, P + 2.1, zS);
      slab(A, 'train_body', xa, P + 1.0, zc - 0.08, xb, P + 2.1, zc + 0.08);
      A.add('glazing', G.pane(A), trs(_m, (xa + xb) / 2, P + 1.55, zc, Math.PI / 2, CAR.w - 0.4, 1.1, 1));
      A.box('glass', (xa + xb) / 2, P + 1.55, zc, 0.1, 1.1, CAR.w);
      // headlamp housings and the coupler
      const xo = xe === x0 ? xa - 0.02 : xb + 0.02;
      slab(A, 'metal_dark', xo - 0.03, P + 0.2, zN + 0.25, xo + 0.03, P + 0.45, zN + 0.6);
      slab(A, 'metal_dark', xo - 0.03, P + 0.2, zS - 0.6, xo + 0.03, P + 0.45, zS - 0.25);
      slab(A, 'metal_dark', Math.min(xo, xo + (xe === x0 ? -0.5 : 0.5)), P - 0.55, zc - 0.15, Math.max(xo, xo + (xe === x0 ? -0.5 : 0.5)), P - 0.3, zc + 0.15);
    }
  }

  // -------------------------------------------------------------- roof --
  slab(A, 'train_body', x0 - 0.02, P + H, zN - 0.02, x1 + 0.02, P + H + 0.18, zS + 0.02);
  slab(A, 'train_body', x0 + 0.3, P + H + 0.18, zN + 0.35, x1 - 0.3, P + H + 0.3, zS - 0.35);
  slab(A, 'metal_dark', x0 + 5.5, P + H + 0.3, zc - 0.8, x0 + 8.5, P + H + 0.62, zc + 0.8);
  slab(A, 'train_panel', x0 + 0.1, P + H - 0.06, zN + 0.1, x1 - 0.1, P + H, zS - 0.1);

  // ---------------------------------------------------------- interior --
  const benchRuns = [];
  let s0 = 0.25;
  for (const s of DOOR_S) {
    benchRuns.push([s0, s - CAR.doorW / 2 - 0.1]);
    s0 = s + CAR.doorW / 2 + 0.1;
  }
  benchRuns.push([s0, L - 0.25]);
  for (const [a, b] of benchRuns) {
    if (b - a < 0.6) continue;
    for (const dir of [1, -1]) {
      const zw = dir > 0 ? zN + 0.09 : zS - 0.09;
      const zf = zw + dir * 0.5;
      const za = Math.min(zw, zf);
      const zb = Math.max(zw, zf);
      slab(A, 'train_panel', x0 + a, P, za, x0 + b, P + 0.4, zb);
      slab(A, 'train_seat', x0 + a, P + 0.4, za, x0 + b, P + 0.5, zb);
      const zr = zw + dir * 0.1;
      slab(A, 'train_seat', x0 + a, P + 0.5, Math.min(zw, zr), x0 + b, P + 0.95, Math.max(zw, zr));
      A.box('fabric', x0 + (a + b) / 2, P + 0.25, (za + zb) / 2, b - a, 0.5, zb - za);
    }
  }
  // poles at every door, grab rails along the ceiling
  for (const s of DOOR_S) cylAt(A, 'steel', x0 + s, P, zc, 0.02, H);
  for (const dz of [-0.75, 0.75]) {
    A.add('steel', G.cyl(A, 10), trs(_m, (x0 + x1) / 2, P + 2.15, zc + dz, 0, 0.04, L - 0.4, 0.04, 0, Math.PI / 2));
  }
  // the light strips: dead in the station car, one live (failing) in the tunnel
  for (let k = 0; k < 4; k++) {
    const cx = x0 + 2 + k * 4;
    const key = t.id === 'tunnel' && index === 0 && k === 1 ? 'tube_flicker_b' : 'train_panel';
    slab(A, key, cx - 1.4, P + H - 0.1, zc - 0.12, cx + 1.4, P + H - 0.06, zc + 0.12);
  }
  // a route blind in the cab-end window
  return { id: `${t.id}${index + 1}`, train: t.id, index, x0, x1, z: zc, doors, gangways: gangs };
}

/** The flexible gangway between two cars. */
function gangway(A, xa, zc) {
  const xb = xa + CAR.gap;
  const P = CAR.floor;
  slab(A, 'threshold', xa - 0.1, P - 0.06, zc - 0.6, xb + 0.1, P, zc + 0.6, { collide: 'metal' });
  for (const s of [-1, 1]) {
    const z0 = zc + s * 0.6;
    const z1 = zc + s * 0.72;
    slab(A, 'rubber', xa, P, Math.min(z0, z1), xb, P + 2.6, Math.max(z0, z1), { collide: 'rubber' });
  }
  slab(A, 'rubber', xa, P + 2.6, zc - 0.72, xb, P + 2.72, zc + 0.72);
}
