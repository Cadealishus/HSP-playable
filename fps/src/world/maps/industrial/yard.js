import * as THREE from 'three';
import {
  PLAY,
  CONTAINERS,
  CONTAINER_STAIR,
  TRAILERS,
  RACK,
  PUMPHOUSE,
  TANKS,
  BUND,
  PERCH,
  GANTRY,
  GATEHOUSE,
} from './layout.js';
import {
  slab,
  clip,
  boxAt,
  cylAt,
  G,
  wallO,
  flight,
  deck,
  rail,
  registerContainers,
  container,
  perimeterWall,
  forklift,
  trailer,
  tractor,
} from '../yardkit.js';
import { trs, patchGeometry } from '../../util.js';
import { palletStack } from './warehouse.js';

/**
 * INDUSTRIAL YARD — everything outside the two warehouses: the concrete yard
 * and its markings, the perimeter, the container stacks, the trailers on the
 * docks, the pipe racks and catwalks along both fences, the pump houses, the
 * tank farms and their loading-rack perches, the gantry crane over the middle,
 * the spawn-side truck parks, and the non-playable backdrop past the wall.
 *
 * Half of it is authored (the western half, plus the north lane) and every
 * piece is built twice through `half(s)`, the second time turned 180 degrees
 * about the origin. The gantry and the ground sit on the centre and are built
 * once.
 */

const _m = new THREE.Matrix4();
const COLOURS = ['red', 'blue', 'green', 'grey', 'orange', 'white', 'tan'];

export function buildYard(A, rng) {
  ground(A, rng);
  // the playable edge
  perimeterWall(A, PLAY.x0, PLAY.z0, PLAY.x1, PLAY.z0);
  perimeterWall(A, PLAY.x1, PLAY.z1, PLAY.x0, PLAY.z1);
  perimeterWall(A, PLAY.x0, PLAY.z1, PLAY.x0, PLAY.z0);
  perimeterWall(A, PLAY.x1, PLAY.z0, PLAY.x1, PLAY.z1);

  registerContainers(A, COLOURS);
  for (const s of [1, -1]) half(A, rng, s);
  gantry(A);
  backdrop(A, rng);
}

function ground(A, rng) {
  const { x0, x1, z0, z1 } = PLAY;
  slab(A, 'yard_concrete', x0 - 1, -0.3, z0 - 1, x1 + 1, 0, z1 + 1, { collide: true, masks: [0, 0.12, 0] });
  // the world past the wall
  slab(A, 'yard_asphalt', -260, -0.42, -260, 260, -0.12, 260);
  // expansion joints on a 6 m grid (dark sealant strips)
  for (let x = x0 + 3; x < x1; x += 6) slab(A, 'oil_stain', x - 0.025, 0, z0, x + 0.025, 0.003, z1);
  for (let z = z0 + 3; z < z1; z += 6) slab(A, 'oil_stain', x0, 0, z - 0.025, x1, 0.003, z + 0.025);
  // the haul road through the middle: an asphalt band with worn lane paint
  slab(A, 'yard_asphalt', x0, 0, -2.2, x1, 0.006, 2.2, { masks: [0, 0.3, 0] });
  for (let x = x0 + 2; x < x1 - 2; x += 5) slab(A, 'paint_white', x, 0.006, -0.08, x + 2.4, 0.009, 0.08);
  // yellow truck lanes in front of both docks, bay boxes under the containers
  for (const s of [1, -1]) {
    const zl = -22.5 * s;
    slab(A, 'paint_yellow', -34, 0.004, zl - 0.07, 34, 0.007, zl + 0.07);
  }
  // oil stains and tyre scuffs
  for (let i = 0; i < 40; i++) {
    const x = rng.range(x0 + 4, x1 - 4);
    const z = rng.range(z0 + 4, z1 - 4);
    const g = patchGeometry(rng, rng.range(0.5, 1.8), { lobes: 9, wobble: 0.5 });
    A.addOnce('oil_stain', g, trs(_m, x, 0.008 + i * 0.0001, z, rng.float() * 6.28, 1, 1, rng.range(0.5, 1)), { masks: [0.05, 0.9, 0.6] });
  }
}

/** One half of the yard. `s = -1` turns everything 180 degrees about the origin. */
function half(A, rng, s) {
  const X = (x) => s * x;
  const Z = (z) => s * z;
  const R = (ry) => ry + (s < 0 ? Math.PI : 0);
  const S = (key, x0, y0, z0, x1, y1, z1, o) =>
    slab(A, key, Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), o);
  const FL = (key, axis, c, w, a, b, y0, y1, o) => flight(A, key, axis, axis === 'x' ? Z(c) : X(c), w, axis === 'x' ? X(a) : Z(a), axis === 'x' ? X(b) : Z(b), y0, y1, o);
  const edge = (e) => (s > 0 ? e : { N: 'S', S: 'N', W: 'E', E: 'W' }[e]);

  // ------------------------------------------------------------ containers --
  for (const [x, z, len, ry, tier, col] of CONTAINERS) {
    container(A, X(x), Z(z), len, R(ry), tier, s > 0 ? col : COLOURS[(COLOURS.indexOf(col) + 3) % COLOURS.length]);
  }
  {
    const cs = CONTAINER_STAIR;
    FL('steel_yellow', 'x', cs.z, cs.w, cs.xGround, cs.xTop, 0, 2.59, { rails: 'both' });
  }
  for (const [x, z] of TRAILERS) trailer(A, X(x), Z(z), R(Math.PI), { key: s > 0 ? 'trailer_white' : 'truck_red' });
  // a tractor unit waiting on the haul road, nose to the spawn
  tractor(A, X(-30), Z(1.2), R(-Math.PI / 2), { key: s > 0 ? 'truck_blue' : 'truck_red' });

  // -------------------------------------------------- pipe rack + catwalk --
  const K = RACK;
  const zc = (K.zFence + K.zAlley) / 2;
  for (let x = K.x0; x <= K.x1 + 0.01; x += 6) {
    for (const z of [K.zFence, K.zAlley]) S('steel_grey', x - 0.13, 0, z - 0.13, x + 0.13, K.top, z + 0.13, { collide: 'metal' });
    S('steel_grey', x - 0.1, K.top - 0.3, K.zFence, x + 0.1, K.top, K.zAlley);
    S('steel_grey', x - 0.1, K.tier - 0.45, K.zFence, x + 0.1, K.tier - 0.3, K.zAlley);
  }
  S('steel_grey', K.x0, K.top - 0.3, K.zFence - 0.1, K.x1, K.top - 0.1, K.zFence + 0.1);
  S('steel_grey', K.x0, K.top - 0.3, K.zAlley - 0.1, K.x1, K.top - 0.1, K.zAlley + 0.1);
  // the pipes on the top tier (visual: nothing overhead collides)
  const pipes = [
    [K.zFence + 0.35, 0.3, 'pipe_silver'],
    [K.zFence + 0.95, 0.22, 'pipe_green'],
    [K.zFence + 1.55, 0.35, 'pipe_ochre'],
    [K.zAlley - 0.3, 0.16, 'pipe_red'],
  ];
  for (const [pz, r, key] of pipes) hpipe(A, key, X(K.x0), X(K.x1), K.top + r, Z(pz), r);
  // the catwalk on the lower tier, over ground-level pipe runs
  const cw = K.walk;
  const dz0 = K.zFence + 0.2;
  const dz1 = K.zAlley - 0.2;
  deck(
    A,
    Math.min(X(cw.x0), X(cw.x1)),
    Math.min(Z(dz0), Z(dz1)),
    Math.max(X(cw.x0), X(cw.x1)),
    Math.max(Z(dz0), Z(dz1)),
    K.tier,
    { rails: { N: [], S: [] }, posts: true }
  );
  FL('grating', 'x', (dz0 + dz1) / 2, dz1 - dz0, cw.x0, cw.x0 - 6.6, K.tier, 0, { rails: 'both', collide: 'metal' });
  FL('grating', 'x', (dz0 + dz1) / 2, dz1 - dz0, cw.x1, cw.x1 + 6.6, K.tier, 0, { rails: 'both', collide: 'metal' });
  // ground pipes on sleepers under the walk (solid: the strip is not a route)
  for (const [pz, r, key] of [
    [K.zFence + 0.5, 0.28, 'pipe_green'],
    [K.zAlley - 0.7, 0.22, 'pipe_silver'],
  ]) hpipe(A, key, X(cw.x0 + 0.5), X(cw.x1 - 0.5), 0.55, Z(pz), r);
  for (let x = cw.x0 + 1; x < cw.x1; x += 3) S('concrete_prop', x - 0.2, 0, K.zFence + 0.1, x + 0.2, 0.3, K.zAlley - 0.1);
  S(null, cw.x0 + 0.5, 0, K.zFence, cw.x1 - 0.5, 0.9, K.zAlley, { collide: 'metal' });
  void zc;

  // ------------------------------------------------------------- pump house --
  const P = PUMPHOUSE;
  S('brick_yard', P.x0, 0, P.z0, P.x1, P.h, P.z1, { collide: true, masks: [0.5, 0.6, 0.3] });
  S('steel_dark', P.x0 - 0.1, P.h, P.z0 - 0.1, P.x1 + 0.1, P.h + 0.2, P.z1 + 0.1);
  S('shutter', P.x1 - 0.02, 0, -51.4, P.x1 + 0.05, 2.5, -49.6);
  S('steel_grey', P.x0 + 1, P.h + 0.2, P.z0 + 1, P.x0 + 2.5, P.h + 1.1, P.z0 + 2.4); // roof fan
  hpipe(A, 'pipe_green', X(P.x0 - 3), X(P.x0), 1.1, Z(-49), 0.2);

  // --------------------------------------------------------------- tank farm --
  for (const [x, z, r, h] of TANKS) {
    cylAt(A, 'tank_white', X(x), 0, Z(z), r, h, { collide: 'metal', seg: 28 });
    cylAt(A, 'steel_grey', X(x), h, Z(z), r + 0.1, 0.25, { seg: 28 });
    cylAt(A, 'tank_white', X(x), h + 0.25, Z(z), r * 0.5, 0.6, { seg: 20 });
    // ladder cage up the side
    S('steel_yellow', x - 0.35, 1.0, z + r, x + 0.35, h, z + r + 0.08);
    for (let y = 2.5; y < h; y += 1.2) S('steel_yellow', x - 0.4, y, z + r + 0.05, x + 0.4, y + 0.06, z + r + 0.7);
  }
  const B = BUND;
  const bw = (ax, az, bx, bz, ops) => wallO(A, 'dock_concrete', X(ax), Z(az), X(bx), Z(bz), 0, B.h, 0.3, ops, { masks: [0.5, 0.6, 0.3] });
  bw(B.x0, B.z0, B.x1, B.z0, []);
  bw(B.x0, B.z1, B.x1, B.z1, B.gaps.map(([a, b]) => [a - B.x0, b - B.x0, 9]));
  bw(B.x0, B.z0, B.x0, B.z1, [[5, 7, 9]]);
  bw(B.x1, B.z0, B.x1, B.z1, []);
  // manifold between the tanks
  hpipe(A, 'pipe_ochre', X(TANKS[0][0] + 4), X(TANKS[1][0] - 4), 0.9, Z(-44), 0.25);
  S('steel_grey', 25.2, 0, -44.6, 26.8, 1.6, -43.4, { collide: 'metal' });

  // ------------------------------------------------ loading-rack perch (5 m) --
  const Pc = PERCH;
  const stairW = 1.4;
  const gap = [Pc.stairZ - stairW / 2, Pc.stairZ + stairW / 2].map(Z).sort((p, q) => p - q);
  deck(A, Math.min(X(Pc.x0), X(Pc.x1)), Math.min(Z(Pc.z0), Z(Pc.z1)), Math.max(X(Pc.x0), X(Pc.x1)), Math.max(Z(Pc.z0), Z(Pc.z1)), Pc.y, {
    rails: { N: [], S: [], [edge('W')]: [], [edge('E')]: [gap] },
  });
  // a waist-high steel plate on the yard-facing side: crouch cover, not a bunker
  S('steel_grey', Pc.x0 + 0.05, Pc.y, Pc.z0 + 0.3, Pc.x0 + 0.12, Pc.y + 1.0, Pc.z1 - 0.3, { collide: 'metal' });
  FL('steel_yellow', 'x', Pc.stairZ, stairW, Pc.x1, Pc.stairX, Pc.y, 0, { rails: 'both' });
  // the road tanker parked under it, loading arms down into its hatches
  const tk = new THREE.CylinderGeometry(1.2, 1.2, 5.4, 18);
  tk.rotateZ(Math.PI / 2);
  tk.translate(X((Pc.x0 + Pc.x1) / 2), 2.0, Z(Pc.stairZ + 0.2));
  A.addOnce('tank_white', tk);
  S('steel_dark', Pc.x0 + 0.2, 0.4, Pc.stairZ - 0.9, Pc.x1 - 0.2, 0.9, Pc.stairZ + 1.3);
  clip(A, Math.min(X(Pc.x0 + 0.2), X(Pc.x1 - 0.2)), 0, Math.min(Z(Pc.stairZ - 1.1), Z(Pc.stairZ + 1.5)), Math.max(X(Pc.x0 + 0.2), X(Pc.x1 - 0.2)), 3.2, Math.max(Z(Pc.stairZ - 1.1), Z(Pc.stairZ + 1.5)), 'metal');
  for (const ax of [37.5, 40.5]) S('steel_yellow', ax - 0.08, 3.2, Pc.stairZ - 0.08, ax + 0.08, Pc.y - 0.3, Pc.stairZ + 0.08);

  // ------------------------------------------------------ spawn truck park --
  const Gh = GATEHOUSE;
  S('brick_yard', Gh.x0, 0, Gh.z0, Gh.x1, Gh.h, Gh.z1, { collide: true, masks: [0.5, 0.6, 0.3] });
  S('steel_dark', Gh.x0 - 0.3, Gh.h, Gh.z0 - 0.3, Gh.x1 + 0.3, Gh.h + 0.25, Gh.z1 + 0.3);
  S('window_dark', Gh.x1 - 0.02, 1.2, Gh.z0 + 1, Gh.x1 + 0.03, 2.3, Gh.z1 - 1);
  // barrier arm across the gate lane (visual) and its post
  S('steel_dark', -60.5, 0, 45.2, -59.9, 1.1, 45.8, { collide: 'metal' });
  S('paint_red', -59.9, 0.95, 45.35, -52.5, 1.05, 45.65);
  tractor(A, X(-62), Z(-36), R(0), { key: s > 0 ? 'truck_blue' : 'truck_red' });
  tractor(A, X(-65.5), Z(-20), R(0.05), { key: 'trailer_white' });
  trailer(A, X(-62.5), Z(22), R(Math.PI / 2 + 0.02), { key: 'trailer_white' });
  // concrete blocks: spawn cover facing the yard
  for (const [bx, bz, br] of [
    [-57.5, -30, 1.57],
    [-57.5, -27.5, 1.6],
    [-58.0, 28, 1.55],
    [-58.0, 30.5, 1.6],
    [-56.8, -40, 1.5],
  ]) {
    A.put('block_big', X(bx), 0, Z(bz), R(br), 1, [1, 1.2, 1]);
    A.box('concrete', X(bx), 0.48, Z(bz), 1.25, 0.95, 0.85, R(br));
  }

  // ------------------------------------------------------ yard clutter/cover --
  for (const [x, z, ry] of [
    [-30.5, -22.4, 0.5],
    [-44.0, 18.5, -1.2],
  ]) forklift(A, X(x), Z(z), R(ry));
  for (const [x, z, n] of [
    [-42.0, -23.0, 3],
    [-40.6, -23.2, 2],
    [-20.5, 3.5, 2],
    [-33.5, 20.5, 3],
    [-6.5, 3.8, 2],
    [-48, -35, 2],
    [-40, -40, 3],
  ]) palletStack(A, rng, X(x), 0, Z(z), n);
  // drum clusters
  for (const [x, z] of [
    [-44.5, -30.5],
    [-21.5, -20.8],
    [-31.0, -3.0],
    [-8.5, 16.0],
  ]) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rng.range(-0.3, 0.3);
      const r = i === 0 ? 0 : 0.62;
      A.put(rng.pick(['barrel_blue', 'barrel_rust', 'barrel_blue']), X(x) + Math.cos(a) * r, 0, Z(z) + Math.sin(a) * r, rng.float() * 6.28, 1, [1, 1.3, 1]);
    }
    A.box('metal', X(x), 0.45, Z(z), 1.9, 0.9, 1.9);
  }
  // jersey barriers forming a chicane on the haul road near each spawn
  for (const [x, z, ry] of [
    [-44.5, 1.8, 0.1],
    [-41.5, -1.5, -0.1],
  ]) {
    A.put('jersey', X(x), 0, Z(z), R(ry), 1, [1, 1.2, 1]);
    A.box('concrete', X(x), 0.46, Z(z), 0.62, 0.92, 1.9, R(ry) + Math.PI / 2);
  }
  // floodlight masts
  for (const [x, z] of [
    [-46, -23.6],
    [-12, 23.6],
    [-62, 50],
  ]) mast(A, X(x), Z(z));
}

/** A horizontal pipe along x from xa to xb at height y (centre), plan z. */
function hpipe(A, key, xa, xb, y, z, r) {
  const L = Math.abs(xb - xa);
  if (L < 0.05) return;
  A.add(key, G.cyl(A, 14), trs(_m, (xa + xb) / 2, y, z, 0, r * 2, L, r * 2, 0, Math.PI / 2), { masks: [0.3, 0.5, 0.2] });
  // flanges every 6 m
  for (let x = Math.min(xa, xb) + 3; x < Math.max(xa, xb); x += 6) {
    A.add('steel_grey', G.cyl(A, 14), trs(_m, x, y, z, 0, r * 2 + 0.1, 0.08, r * 2 + 0.1, 0, Math.PI / 2));
  }
}

function mast(A, x, z) {
  cylAt(A, 'steel_grey', x, 0, z, 0.22, 18, { collide: 'metal', seg: 10 });
  slab(A, 'steel_grey', x - 1.6, 17.6, z - 0.3, x + 1.6, 18.4, z + 0.3);
  for (let i = 0; i < 3; i++) slab(A, 'light_warm', x - 1.4 + i * 1.0, 17.5, z - 0.25, x - 0.7 + i * 1.0, 17.6, z + 0.25);
  slab(A, 'concrete_prop', x - 0.6, 0, z - 0.6, x + 0.6, 0.45, z + 0.6, { collide: 'concrete' });
}

/** The rubber-tyred gantry crane straddling the middle of the yard. */
function gantry(A) {
  const { lx, lz, h } = GANTRY;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * lx;
      const z = sz * lz;
      slab(A, 'crane_yellow', x - 0.5, 1.2, z - 0.5, x + 0.5, h, z + 0.5, { collide: 'metal', masks: [0.5, 0.5, 0.2] });
      // bogie: a beam along x with two wheel pairs
      slab(A, 'steel_dark', x - 2.0, 0.55, z - 0.6, x + 2.0, 1.25, z + 0.6, { collide: 'metal', masks: [0.6, 0.7, 0.4] });
      for (const wx of [-1.4, 1.4]) {
        for (const wz of [-0.45, 0.45]) {
          A.add('rubber', G.cyl(A, 16), trs(_m, x + wx, 0.55, z + wz, 0, 1.1, 0.4, 1.1, Math.PI / 2, 0));
        }
      }
    }
    // girder along z on each leg line, and a knee brace per leg
    slab(A, 'crane_yellow', sx * lx - 0.6, h, -lz - 1.2, sx * lx + 0.6, h + 1.5, lz + 1.2, { masks: [0.5, 0.5, 0.2] });
  }
  for (const sz of [-1, 1]) {
    slab(A, 'crane_yellow', -lx - 0.6, h - 0.4, sz * lz - 0.5, lx + 0.6, h + 1.2, sz * lz + 0.5, { masks: [0.5, 0.5, 0.2] });
  }
  // machinery house and the operator cab
  slab(A, 'crane_yellow', -2.8, h + 1.5, -lz - 0.8, 2.8, h + 3.8, -lz + 3.0, { masks: [0.4, 0.5, 0.2] });
  slab(A, 'window_dark', lx + 0.6, h - 2.6, -1.2, lx + 2.4, h - 0.2, 1.2);
  slab(A, 'crane_yellow', lx + 0.55, h - 2.8, -1.3, lx + 2.5, h - 2.6, 1.3);
  // trolley, ropes, spreader and the container that has been hanging there since March
  slab(A, 'steel_dark', -lx - 0.2, h + 1.5, -1.8, lx + 0.2, h + 2.4, 1.8);
  for (const [rx, rz] of [
    [-1.2, -0.6],
    [1.2, -0.6],
    [-1.2, 0.6],
    [1.2, 0.6],
  ]) A.add('steel', G.cyl(A, 6), trs(_m, rx, (h + 10.6) / 2, rz, 0, 0.04, h - 10.6, 0.04));
  slab(A, 'steel_yellow', -6.2, 10.3, -1.3, 6.2, 10.7, 1.3);
  A.put('ct40_red', 0, 10.3 - 2.59 - 0.02, 0, 0, 1, [1, 1.2, 1]);
  // the ground under it is blocked off with two concrete blocks, as if that helped
  for (const [cx, cz] of [
    [-6.8, -1.4],
    [6.8, 1.4],
  ]) {
    A.put('block_big', cx, 0, cz, 0.3, 1, [1, 1.2, 1]);
    A.box('concrete', cx, 0.48, cz, 1.25, 0.95, 0.85, 0.3);
  }
}

/** Warehouses, cranes and stacks past the wall. Visual only. */
function backdrop(A, rng) {
  for (const [x0, z0, x1, z1, h, key] of [
    [-90, -120, -20, -72, 14, 'cladding'],
    [-10, -110, 60, -70, 17, 'cladding_blue'],
    [80, -90, 130, -30, 12, 'cladding'],
    [-130, 20, -80, 90, 15, 'cladding_blue'],
    [20, 72, 100, 120, 13, 'cladding'],
    [-70, 80, -10, 130, 18, 'brick_yard'],
  ]) {
    slab(A, key, x0, 0, z0, x1, h, z1, { masks: [0.3, 0.6, 0.3] });
    slab(A, 'roof_sheet', x0 - 0.4, h, z0 - 0.4, x1 + 0.4, h + 0.6, z1 + 0.4);
  }
  // stacks of containers across the fence, three and four high
  const cols = COLOURS;
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * rng.range(76, 96);
    const z = rng.range(-50, 50);
    const n = rng.int(2, 5);
    for (let k = 0; k < n; k++) container(A, x, z, 40, Math.PI / 2, k, rng.pick(cols), { collide: false });
  }
  // a tower crane over the north warehouses
  const tx = 18;
  const tz = -86;
  for (const [ox, oz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) slab(A, 'crane_yellow', tx + ox * 1.1 - 0.12, 17, tz + oz * 1.1 - 0.12, tx + ox * 1.1 + 0.12, 58, tz + oz * 1.1 + 0.12);
  for (let y = 18; y < 58; y += 2.2) slab(A, 'crane_yellow', tx - 1.2, y, tz - 1.2, tx + 1.2, y + 0.12, tz + 1.2);
  slab(A, 'crane_yellow', tx - 12, 58, tz - 0.7, tx + 42, 59.4, tz + 0.7);
  slab(A, 'concrete_prop', tx - 10, 55.5, tz - 1.2, tx - 3, 58, tz + 1.2);
  slab(A, 'window_dark', tx + 1.3, 55.6, tz - 1.0, tx + 3.2, 57.8, tz + 1.0);
  // chimney and silos to the south-west
  cylAt(A, 'brick_yard', -95, 0, 70, 2.4, 42, { seg: 18 });
  for (const [x, z] of [
    [-110, 40],
    [-110, 50],
    [-120, 45],
  ]) cylAt(A, 'tank_white', x, 0, z, 4.5, 24, { seg: 24 });
}
