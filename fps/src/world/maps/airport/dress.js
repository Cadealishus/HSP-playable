import * as THREE from 'three';
import { ROOF_Y, DECK, GATE, LOW_CEIL } from './layout.js';
import { slab, wall, curtainWall, boxAt, cylAt, G, part, merged, cylPart } from './kit.js';
import { trs, fillMasks } from '../../util.js';

/**
 * HOLDING PATTERN — the cover pass and the interior dressing.
 *
 * Cover first (the doc's blockout step 4): check-in islands, security lanes,
 * kiosks, seat clusters, the gate desk, carousels, café tables. Every piece of
 * cover gets a collision proxy at its real height, so the sight lines the AI
 * and the player share are the ones you see. Loose dressing (luggage, bins,
 * trolleys) sits at the edges of paths, never in the middle of a lane.
 */

const _m = new THREE.Matrix4();

// ================================================================= protos ==

function registerProtos(A, rng) {
  if (A.has('ap_seat_frame')) return;
  // 4-seat beam: local x along the beam, seats face +z, floor at 0
  const fr = [];
  const pad = [];
  const n = 4;
  const pitch = 0.6;
  fr.push(part(n * pitch + 0.1, 0.08, 0.1, 0, 0.36, -0.05, 0, 0, 0, [0.4, 0.3, 0.2]));
  for (const x of [-(n * pitch) / 2 + 0.2, (n * pitch) / 2 - 0.2]) {
    fr.push(part(0.06, 0.36, 0.06, x, 0.18, -0.05, 0, 0, 0, [0.6, 0.4, 0.3]));
    fr.push(part(0.08, 0.04, 0.6, x, 0.02, -0.05, 0, 0, 0, [0.6, 0.5, 0.4]));
  }
  for (let i = 0; i < n; i++) {
    const x = -(n * pitch) / 2 + pitch * (i + 0.5);
    fr.push(part(0.5, 0.05, 0.5, x, 0.43, 0.02, 0, 0, 0, [0.3, 0.2, 0.1]));
    fr.push(part(0.5, 0.5, 0.05, x, 0.7, -0.27, 0, -0.12, 0, [0.3, 0.2, 0.1]));
    pad.push(part(0.46, 0.06, 0.44, x, 0.48, 0.03, 0, 0, 0, [0.1, 0.3, 0.1]));
    pad.push(part(0.46, 0.4, 0.05, x, 0.72, -0.235, 0, -0.12, 0, [0.1, 0.3, 0.1]));
  }
  for (let i = 0; i <= n; i++) {
    const x = -(n * pitch) / 2 + pitch * i;
    fr.push(part(0.05, 0.05, 0.46, x, 0.64, 0.0, 0, 0, 0, [0.6, 0.3, 0.1]));
    fr.push(part(0.04, 0.2, 0.04, x, 0.55, 0.18, 0, 0, 0, [0.6, 0.3, 0.1]));
  }
  A.proto('ap_seat_frame', { geo: merged(fr), key: 'alu_dark' });
  A.proto('ap_seat_pad', { geo: merged(pad), key: 'upholstery' });

  // queue stanchion: post, weighted base, belt head
  A.proto('ap_stanchion', {
    geo: merged([cylPart(0.03, 0.95, 0, 0.475, 0, 10), cylPart(0.17, 0.04, 0, 0.02, 0, 16), cylPart(0.045, 0.08, 0, 0.95, 0, 10)]),
    key: 'steel',
  });
  // suitcases: hard-shell, three sizes share a geometry via scale
  const case_ = merged([
    part(0.45, 0.66, 0.26, 0, 0.36, 0, 0, 0, 0, [0.3, 0.3, 0.2]),
    part(0.3, 0.03, 0.03, 0, 0.72, 0, 0, 0, 0, [0.5, 0.3, 0.1]),
    part(0.05, 0.05, 0.05, -0.17, 0.02, 0.1, 0, 0, 0, [0.5, 0.5, 0.3]),
    part(0.05, 0.05, 0.05, 0.17, 0.02, 0.1, 0, 0, 0, [0.5, 0.5, 0.3]),
  ]);
  A.proto('ap_case_red', { geo: case_, key: 'luggage_red', tilt: 0.05, sink: 0.01 });
  A.proto('ap_case_blue', { geo: case_.clone(), key: 'luggage_blue', tilt: 0.05, sink: 0.01 });
  A.proto('ap_case_olive', { geo: case_.clone(), key: 'luggage_olive', tilt: 0.05, sink: 0.01 });
  // luggage trolley
  const tr = [
    part(1.0, 0.04, 0.55, 0.05, 0.28, 0, 0, 0, 0, [0.6, 0.4, 0.2]),
    part(0.04, 0.9, 0.55, -0.45, 0.72, 0, 0, 0, -0.1, [0.6, 0.4, 0.2]),
    part(0.05, 0.05, 0.6, -0.52, 1.18, 0, 0, 0, 0, [0.7, 0.4, 0.2]),
  ];
  for (const [x, z] of [
    [0.45, 0.22],
    [0.45, -0.22],
    [-0.4, 0.22],
    [-0.4, -0.22],
  ]) tr.push(cylPart(0.09, 0.04, x, 0.09, z, 10, Math.PI / 2, 0));
  A.proto('ap_trolley', { geo: merged(tr), key: 'steel' });
  // bin
  A.proto('ap_bin', { geo: merged([cylPart(0.25, 0.9, 0, 0.45, 0, 14), cylPart(0.27, 0.06, 0, 0.93, 0, 14)]), key: 'steel' });
  // shrub for the planters (foliage cards)
  const leaves = [];
  for (let i = 0; i < 9; i++) {
    const q = new THREE.PlaneGeometry(rng.range(0.6, 1.0), rng.range(0.5, 0.9), 1, 1);
    q.applyMatrix4(trs(new THREE.Matrix4(), rng.range(-0.25, 0.25), rng.range(0.3, 0.75), rng.range(-0.25, 0.25), rng.float() * Math.PI, 1, 1, 1, rng.range(-0.4, 0.4), rng.range(-0.3, 0.3)));
    fillMasks(q, 0.2, 0.3, 0.2);
    leaves.push(q);
  }
  A.proto('ap_shrub', { geo: merged(leaves), key: 'leaves', castShadow: true });
}

/** A seat beam at (x, z) facing `ry` (0 = +z). Micro cover. */
function seats(A, x, z, ry, collide = true) {
  A.put('ap_seat_frame', x, 0, z, ry);
  A.put('ap_seat_pad', x, 0, z, ry);
  if (collide) A.box('fabric', x - Math.sin(ry) * 0.05, 0.45, z - Math.cos(ry) * 0.05, 2.45, 0.9, 0.62, ry);
}

/** Back-to-back seat pair along x. */
function seatPair(A, x, z) {
  seats(A, x, z - 0.36, Math.PI, false);
  seats(A, x, z + 0.36, 0, false);
  A.box('fabric', x, 0.45, z, 2.45, 0.9, 1.3);
}

/** A run of stanchions with belts between them. */
function stanchions(A, pts) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    A.put('ap_stanchion', x, 0, z, 0);
    A.box('metal', x, 0.48, z, 0.12, 0.96, 0.12);
    if (i > 0) {
      const [px, pz] = pts[i - 1];
      const len = Math.hypot(x - px, z - pz);
      const ry = Math.atan2(-(z - pz), x - px);
      boxAt(A, 'upholstery', (x + px) / 2, 0.9, (z + pz) / 2, len - 0.08, 0.05, 0.012, ry, { geo: G.thin });
    }
  }
}

function planter(A, x, z, w = 1.6, d = 1.6) {
  slab(A, 'concrete_white', x - w / 2, 0, z - d / 2, x + w / 2, 0.75, z + d / 2, { collide: 'concrete', masks: [0.5, 0.4, 0.3] });
  slab(A, 'planter_soil', x - w / 2 + 0.08, 0.75, z - d / 2 + 0.08, x + w / 2 - 0.08, 0.7, z + d / 2 - 0.08);
  const nx = Math.max(1, Math.round(w / 0.9));
  const nz = Math.max(1, Math.round(d / 0.9));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const px = x - w / 2 + (w * (i + 0.5)) / nx;
      const pz = z - d / 2 + (d * (j + 0.5)) / nz;
      A.put('ap_shrub', px, 0.7, pz, (px * 7.1 + pz * 3.3) % 6.28, 1.1 + ((i + j) % 2) * 0.3);
    }
  }
}

function suitcase(A, rng, x, z, ry) {
  const k = ['ap_case_red', 'ap_case_blue', 'ap_case_olive'][Math.floor(rng.float() * 3) % 3];
  const s = rng.range(0.8, 1.15);
  A.put(k, x, 0, z, ry, s);
}

/** A counter: laminate front, steel top, collides at its height. */
function counter(A, x0, z0, x1, z1, h = 1.1, front = 'laminate') {
  slab(A, front, x0, 0, z0, x1, h - 0.05, z1, { collide: 'wood', masks: [0.3, 0.3, 0.3] });
  slab(A, 'steel', x0 - 0.03, h - 0.05, z0 - 0.03, x1 + 0.03, h, z1 + 0.03);
  slab(A, 'plastic_dark', x0 + 0.02, 0, z0 + 0.02, x1 - 0.02, 0.1, z1 - 0.02);
}

/** Hanging linear light fixture along x at height y. */
function strip(A, x0, x1, z, y = 7.6) {
  slab(A, 'alu_dark', x0, y, z - 0.09, x1, y + 0.1, z + 0.09);
  slab(A, 'light_strip', x0 + 0.05, y - 0.015, z - 0.06, x1 - 0.05, y, z + 0.06);
  for (const x of [x0 + 0.3, x1 - 0.3]) slab(A, 'steel', x - 0.006, y + 0.1, z - 0.006, x + 0.006, ROOF_Y, z + 0.006, { geo: G.thin });
}

// ================================================================ dressing ==

export function dressTerminal(A, rng) {
  registerProtos(A, rng);

  // ------------------------------------------------ main terminal (NW) --
  // information desk at the "+" crossing
  counter(A, -13.4, -18.2, -10.6, -16.8);
  slab(A, 'alu_dark', -12.6, 1.1, -17.9, -11.4, 2.3, -17.7, { collide: false });
  // west hall seat clusters facing the check-in islands
  for (const z of [-5.5, -1.0, 3.5, 7.5]) {
    seatPair(A, -19.3, z);
    seatPair(A, -16.6, z);
  }
  planter(A, -20.3, -12.5, 3.2, 1.2);
  planter(A, -6.5, -24.2, 4.0, 1.2);
  planter(A, -20.3, 9.9, 2.4, 1.2);
  for (const [x, z] of [
    [-8.4, -15],
    [-21.2, -15],
    [-3, -14.2],
  ]) A.put('ap_bin', x, 0, z, 0);
  // abandoned trolleys and luggage along the edges of the entry hall
  for (const [x, z, ry] of [
    [-20.6, -24.4, 0.4],
    [-4.5, -18.5, 2.2],
    [-13.8, -9.4, -0.8],
  ]) {
    A.put('ap_trolley', x, 0, z, ry);
    suitcase(A, rng, x + 0.1, z + 0.1, ry + 0.2);
  }
  for (let i = 0; i < 10; i++) suitcase(A, rng, rng.range(-21, -3), rng.range(-25, -13), rng.float() * 6.28);

  // ------------------------------------------------------------ security --
  for (const x of [0.4, 3.0, 5.6]) {
    counter(A, x - 0.42, -24.5, x + 0.42, -18.6, 0.82, 'alu_dark');
    // x-ray tunnel
    slab(A, 'gse_white', x - 0.6, 0, -22.4, x + 0.6, 1.55, -20.4, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
    slab(A, 'plastic_dark', x - 0.5, 0.82, -22.42, x + 0.5, 1.3, -22.38);
    slab(A, 'plastic_dark', x - 0.5, 0.82, -20.42, x + 0.5, 1.3, -20.38);
    // body-scanner arch (posts collide, the gap does not)
    for (const s of [-1, 1]) slab(A, 'gse_white', x + s * 0.55 - 0.12, 0, -16.9, x + s * 0.55 + 0.12, 2.2, -16.3, { collide: 'metal' });
    slab(A, 'gse_white', x - 0.67, 2.2, -16.9, x + 0.67, 2.45, -16.3);
    // trays
    for (let k = 0; k < 3; k++) slab(A, 'plastic_dark', x - 0.3, 0.82 + k * 0.07, -23.8 + k * 0.02, x + 0.3, 0.88 + k * 0.07, -23.4 + k * 0.02);
  }
  // officer podium
  slab(A, 'laminate', -1.5, 0, -15.2, 0.0, 1.2, -13.8, { collide: 'wood', masks: [0.4, 0.4, 0.3] });
  slab(A, 'steel', -1.55, 1.2, -15.25, 0.05, 1.25, -13.75);
  stanchions(A, [
    [-1.4, -25.2],
    [-1.4, -19.5],
    [-0.6, -19.5],
  ]);

  // --------------------------------------------- retail (under the deck) --
  const dy = DECK.y - DECK.t;
  curtainWall(A, 7, -10.45, 27, -10.45, 0, dy, [
    [2.3, 4.3],
    [9.2, 11.2],
    [16.2, 18.2],
  ], { upstand: 0.3, transoms: [2.8], bay: 2.5, door: 2.6 });
  wall(A, 'wall_paint', 13.4, -10.6, 11.3, -16, 0, dy, 0.2, [], {});
  wall(A, 'wall_paint', 21.0, -10.6, 18.9, -16, 0, dy, 0.2, [], {});
  // shop 1: gondola shelving
  for (const z of [-14.4, -12.6]) {
    slab(A, 'alu', 7.6, 0, z - 0.3, 10.8, 1.55, z + 0.3, { collide: 'metal', masks: [0.4, 0.4, 0.3] });
  }
  // shop 2: duty-free display tables
  for (const [x, z] of [
    [14.6, -13.2],
    [17.0, -12.4],
  ]) {
    slab(A, 'oak', x - 0.8, 0, z - 0.6, x + 0.8, 0.9, z + 0.6, { collide: 'wood', masks: [0.3, 0.3, 0.3] });
    for (let k = 0; k < 6; k++) slab(A, ['luggage_red', 'luggage_blue', 'luggage_olive'][k % 3], x - 0.6 + (k % 3) * 0.45, 0.9, z - 0.35 + Math.floor(k / 3) * 0.45, x - 0.35 + (k % 3) * 0.45, 1.15, z - 0.15 + Math.floor(k / 3) * 0.45);
  }
  // shop 3: book walls and a counter
  slab(A, 'oak', 21.5, 0, -15.9, 26.8, 2.2, -15.4, { collide: 'wood' });
  counter(A, 23.8, -13.2, 26.2, -12.4);
  // retail north (stock rooms behind the shops)
  for (const x of [9, 13, 17, 21, 25]) slab(A, 'alu_dark', x - 0.8, 0, -25.6, x + 0.8, 2.2, -25.0, { collide: 'metal' });
  for (const [x, z] of [
    [11, -20],
    [19.5, -21],
    [23.5, -19],
  ]) slab(A, 'wood_prop', x - 0.6, 0, z - 0.5, x + 0.6, 1.0, z + 0.5, { collide: 'wood' });

  // ------------------------------------------------ service rooms (NE) --
  for (let z = -25.4; z < -9; z += 1.2) slab(A, 'wall_grey', 29.9, 0, z, 30.45, 1.9, z + 1.0, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  for (const [x, z, w, d] of [
    [34.5, -23.8, 3.4, 0.7],
    [36.8, -18.0, 0.7, 3.0],
    [34.0, -10.0, 3.0, 0.9],
  ]) slab(A, 'alu_dark', x - w / 2, 0, z - d / 2, x + w / 2, 1.8, z + d / 2, { collide: 'metal' });
  counter(A, 32.0, -17.0, 34.2, -16.2, 0.8, 'wall_grey');

  // ------------------------------------------------- food court (W wing) --
  counter(A, -35.8, -5.4, -26.0, -4.2);
  slab(A, 'oak', -36.6, 0, -5.95, -25.4, 2.4, -5.6, { collide: 'wood' });
  slab(A, 'steel', -36.6, 1.5, -5.6, -25.4, 1.56, -5.2);
  for (const x of [-35, -32, -29, -26.5]) slab(A, 'light_warm', x - 0.15, 3.0, -4.95, x + 0.15, 3.08, -4.65);
  for (const z of [-0.8, 2.8, 6.4]) {
    for (const x of [-34.4, -30.6, -26.8]) {
      slab(A, 'oak', x - 0.9, 0.72, z - 0.45, x + 0.9, 0.76, z + 0.45, { collide: 'wood' });
      slab(A, 'alu_dark', x - 0.05, 0, z - 0.05, x + 0.05, 0.72, z + 0.05);
      A.box('wood', x, 0.38, z, 1.8, 0.76, 0.9);
      for (const s of [-1, 1]) {
        for (const dx of [-0.5, 0.5]) boxAt(A, 'alu_dark', x + dx, 0.45, z + s * 0.72, 0.42, 0.9, 0.42, 0, { geo: G.soft });
      }
    }
  }
  // oak slat ceiling
  for (let x = -36.6; x < -22.4; x += 0.35) slab(A, 'oak', x, 6.2, -5.8, x + 0.12, 6.32, 10.8);
  planter(A, -23.2, 1.0, 1.2, 4.0);

  // ------------------------------------------------------ kitchen (SW) --
  counter(A, -30.6, 12.0, -21.6, 12.8, 0.95, 'steel');
  counter(A, -30.6, 25.6, -24.0, 26.6, 0.95, 'steel');
  counter(A, -27.4, 17.0, -24.0, 20.0, 0.95, 'steel');
  for (const z of [14.5, 16.2, 21.5, 23.2]) slab(A, 'steel', -30.7, 0, z, -29.8, 2.1, z + 1.5, { collide: 'metal', masks: [0.4, 0.4, 0.3] });
  slab(A, 'steel', -26.2, 2.3, 17.4, -25.2, 3.2, 19.6);

  // ----------------------------------------------------------- check-in --
  for (const x of [-9.2, -4.2]) {
    for (const [z0, z1] of [
      [-11.2, -3.1],
      [-0.6, 9.4],
    ]) {
      // desks facing west, bag belt behind, a back panel with screens
      counter(A, x - 0.9, z0, x - 0.1, z1, 1.08);
      slab(A, 'rubber', x - 0.1, 0, z0, x + 0.6, 0.5, z1, { collide: 'rubber' });
      slab(A, 'steel', x - 0.12, 0.48, z0, x + 0.62, 0.52, z1);
      slab(A, 'sandstone', x + 0.6, 0, z0, x + 0.9, 2.6, z1, { collide: 'concrete', masks: [0.3, 0.3, 0.3] });
      for (let z = z0 + 1; z < z1 - 0.5; z += 2.0) {
        boxAt(A, 'screen', x + 0.58, 2.1, z, 0.04, 0.5, 0.9);
        boxAt(A, 'plastic_dark', x - 0.55, 1.35, z, 0.05, 0.3, 0.42, 0, { collide: false });
      }
    }
    // queue lanes in front of each island
    stanchions(A, [
      [x - 2.4, -10.5],
      [x - 2.4, -4.0],
    ]);
    stanchions(A, [
      [x - 2.4, 0.2],
      [x - 2.4, 8.6],
    ]);
  }
  for (let i = 0; i < 8; i++) suitcase(A, rng, rng.range(-11.5, -2), rng.range(-12, 10), rng.float() * 6.28);
  A.put('ap_trolley', -7.2, 0, 10.2, 1.2);
  A.put('ap_trolley', -1.9, 0, -11.8, -0.5);

  // ------------------------------------------------------------ concourse --
  kiosk(A, 5.6, 6.2, 0);
  kiosk(A, 11.4, 9.4, Math.PI / 2);
  planter(A, 8.3, 2.3, 1.4, 1.4);
  planter(A, 3.2, 10.6, 2.6, 1.0);
  planter(A, 13.6, 0.4, 1.2, 1.2);
  seatPair(A, 9.0, 11.0);
  A.put('ap_bin', 1.6, 0, 1.2, 0);
  A.put('ap_bin', 15.5, 0, 9.4, 0);
  for (let i = 0; i < 6; i++) suitcase(A, rng, rng.range(2, 15), rng.range(0, 11), rng.float() * 6.28);

  // ----------------------------------------------------------- Gate 12 --
  const d = GATE.desk;
  for (const dx of [-1.1, 1.1]) {
    counter(A, d.x + dx - 0.85, d.z - 0.4, d.x + dx + 0.85, d.z + 0.4, 1.1, 'laminate');
    boxAt(A, 'screen', d.x + dx, 1.3, d.z + 0.2, 0.5, 0.32, 0.04, 0);
  }
  // the gate's back panel: a stone pylon between the podiums
  slab(A, 'sandstone', d.x - 0.35, 0, d.z + 0.5, d.x + 0.35, 3.2, d.z + 1.0, { collide: 'concrete', masks: [0.3, 0.3, 0.3] });
  // waiting-area seating: back-to-back pairs, then a row on the glass
  for (const x of [17.9, 20.6, 23.3, 26.0]) {
    seatPair(A, x, -7.0);
    seatPair(A, x, -4.2);
  }
  for (const x of [17.9, 25.6]) seatPair(A, x, 2.6);
  for (const x of [16.8, 19.5, 22.2]) seats(A, x, 11.0, 0);
  // charging pillars
  for (const [x, z] of [
    [16.6, -0.8],
    [27.8, -1.0],
    [21.9, 4.6],
  ]) {
    slab(A, 'alu_dark', x - 0.2, 0, z - 0.2, x + 0.2, 1.4, z + 0.2, { collide: 'metal' });
    slab(A, 'light_strip', x - 0.21, 1.2, z - 0.21, x + 0.21, 1.25, z + 0.21);
  }
  // boarding lane: tensa barriers from the desk to the bridge door
  const L = GATE.lane;
  const ln = [];
  const ls = [];
  for (let x = L.x0; x <= L.x1 - 0.4; x += 1.6) {
    ln.push([x, L.z - L.w / 2]);
    ls.push([x, L.z + L.w / 2]);
  }
  stanchions(A, ln);
  stanchions(A, ls);
  planter(A, 28.0, -8.8, 1.4, 1.4);
  for (let i = 0; i < 7; i++) suitcase(A, rng, rng.range(16.5, 28.5), rng.range(-9.5, 10.5), rng.float() * 6.28);
  A.put('ap_trolley', 28.2, 5.2, 0, 2.0);

  // ------------------------------------------------ arrivals (south hall) --
  for (const x of [-14, -6]) carousel(A, rng, x, 19.5);
  seatPair(A, -18.6, 25.0);
  seatPair(A, -2.4, 24.2);
  for (const [x, z, ry] of [
    [-19.8, 13, 0.3],
    [-18.8, 13.2, 0.25],
    [-1.8, 14.0, -1.2],
  ]) A.put('ap_trolley', x, 0, z, ry);
  planter(A, -10, 12.4, 2.4, 1.0);

  // ------------------------------------------------------ ceiling lights --
  for (const z of [-24, -18, -10, -4, 2, 8]) strip(A, -20.5, -14.5, z);
  for (const z of [-22, -18]) strip(A, -1, 6, z, 6.4);
  for (const z of [-3.2, 5.5]) strip(A, -11.5, -1.5, z);
  for (const z of [2.2, 5.2, 8.6]) strip(A, 2, 15, z, 8.2);
  for (const z of [-8, -3, 2, 7]) strip(A, 16.5, 28.5, z);
  for (const z of [14, 18, 22, 26]) strip(A, -20.5, 0, z, 6.8);
  // back-of-house fluorescent battens
  for (const z of [-24, -19, -14, -10]) slab(A, 'light_strip', 28.2, LOW_CEIL - 0.04, z, 29.4, LOW_CEIL, z + 0.12);
  for (const z of [14, 19, 24]) slab(A, 'light_strip', -28, LOW_CEIL - 0.04, z, -24, LOW_CEIL, z + 0.12);

  // point-light anchors (warm practicals; the world owns the light budget)
  for (const [x, y, z] of [
    [-30.6, 3.2, 2.4],
    [-26.6, 3.4, 18.0],
    [29.0, 3.4, -20.0],
    [34.0, 3.4, -12.0],
    [11.0, 3.6, -13.4],
    [18.2, 3.6, -13.4],
    [24.2, 3.6, -13.4],
    [2.5, 5.5, -20.0],
    [-10.0, 6.0, 19.5],
    [-12.0, 7.0, -18.0],
    [-6.5, 7.0, 3.0],
    [22.0, 7.0, -2.0],
  ]) A.interiorLights.push({ x, y, z });
}

/** A concourse kiosk: counter ring with a canopy (canopy has no collision). */
function kiosk(A, x, z, ry) {
  const w = 2.4;
  const d = 1.6;
  boxAt(A, 'laminate', x, 0.55, z, w, 1.1, d, ry, { collide: 'wood', masks: [0.3, 0.3, 0.3] });
  boxAt(A, 'steel', x, 1.12, z, w + 0.08, 0.05, d + 0.08, ry);
  boxAt(A, 'alu_dark', x, 2.75, z, w + 0.4, 0.3, d + 0.4, ry);
  boxAt(A, 'light_warm', x, 2.59, z, w, 0.02, d, ry);
  for (const s of [-1, 1]) boxAt(A, 'alu_dark', x + Math.cos(ry) * s * (w / 2 - 0.1), 1.9, z - Math.sin(ry) * s * (w / 2 - 0.1), 0.08, 1.6, 0.08, ry);
}

/** A baggage carousel: a low oval plinth with a rubber slat belt and bags. */
function carousel(A, rng, x, z) {
  const len = 5.6;
  const r = 1.1;
  slab(A, 'steel', x - len / 2, 0, z - r, x + len / 2, 0.5, z + r, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  for (const s of [-1, 1]) {
    const end = cylPart(r, 0.5, 0, 0.25, 0, 20);
    end.applyMatrix4(trs(_m, x + s * (len / 2), 0, z));
    A.add('steel', end);
    end.dispose();
    A.box('metal', x + s * (len / 2 + r * 0.5), 0.25, z, r, 0.5, r * 1.8);
  }
  slab(A, 'rubber', x - len / 2, 0.5, z - r + 0.05, x + len / 2, 0.54, z + r - 0.05);
  slab(A, 'steel', x - len / 2 + 0.3, 0.5, z - 0.35, x + len / 2 - 0.3, 0.9, z + 0.35, { collide: 'metal' });
  // the suitcase that goes round forever, and friends
  for (let i = 0; i < 4; i++) {
    const a = rng.range(-len / 2, len / 2);
    A.put(['ap_case_red', 'ap_case_blue', 'ap_case_olive'][i % 3], x + a, 0.54, z + (i % 2 ? -0.8 : 0.8), Math.PI / 2 + rng.range(-0.3, 0.3), 1, null, Math.PI / 2 - 0.2);
  }
  void cylAt;
}
