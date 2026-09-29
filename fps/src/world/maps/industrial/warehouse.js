import * as THREE from 'three';
import { WAREHOUSE, DOCK_Y } from './layout.js';
import { slab, clip, boxAt, wallO, flight, deck, rail, forklift, G } from '../yardkit.js';
import { rampX } from '../airport/kit.js';
import { trs } from '../../util.js';

/**
 * INDUSTRIAL YARD — a warehouse with a real interior: dock-height floor, three
 * dock doors onto a raised apron, a personnel door and stair on the spawn-side
 * end, a drive-in door and forklift ramp on the far end, a mezzanine along the
 * back wall with a stair at each end (two ways up, so it is never a one-door
 * trap), pallet racking in rows that turn the floor into close-range aisles,
 * and a site office in the corner.
 *
 * Authored once as warehouse A; `s = -1` builds warehouse B, the same building
 * turned 180 degrees about the map origin. Every coordinate goes through the
 * mirror helpers below, which keep min/max slabs, flights and ramps correct.
 *
 * Collision follows the kit's nav conventions: the roof, the lintels over the
 * doors, the office ceiling and the light fittings do NOT collide (anything
 * overhead would become the AI's floor); walls, floor, mezzanine, stairs,
 * racks and furniture do.
 */

const _m = new THREE.Matrix4();

export function buildWarehouse(A, rng, s = 1) {
  const W = WAREHOUSE;
  const Y = DOCK_Y;
  const X = (x) => s * x;
  const Z = (z) => s * z;
  const S = (key, x0, y0, z0, x1, y1, z1, o) =>
    slab(A, key, Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), o);
  const C = (x0, y0, z0, x1, y1, z1, surf) =>
    clip(A, Math.min(X(x0), X(x1)), y0, Math.min(Z(z0), Z(z1)), Math.max(X(x0), X(x1)), y1, Math.max(Z(z0), Z(z1)), surf);
  const WALL = (key, x0, z0, x1, z1, y0, y1, t, ops, o) => wallO(A, key, X(x0), Z(z0), X(x1), Z(z1), y0, y1, t, ops, o);
  const FL = (key, axis, c, w, a, b, y0, y1, o) => flight(A, key, axis, axis === 'x' ? Z(c) : X(c), w, axis === 'x' ? X(a) : Z(a), axis === 'x' ? X(b) : Z(b), y0, y1, o);
  const ry0 = s < 0 ? Math.PI : 0;

  const { x0, x1, z0, z1, t, eave } = W;
  const top = eave + 0.8; // parapet line hiding the low-pitch roof

  // ----------------------------------------------------------- floor + apron --
  S('dock_concrete', x0 - t / 2, 0, z0 - t / 2, x1 + t / 2, Y - 0.12, W.apronZ, { masks: [0.4, 0.7, 0.4] });
  S('wh_floor', x0, Y - 0.12, z0, x1, Y, z1, { masks: [0.2, 0.5, 0.2] });
  S('dock_concrete', x0, Y - 0.12, z1, x1, Y, W.apronZ, { masks: [0.5, 0.6, 0.3] });
  C(x0 - t / 2, 0, z0 - t / 2, x1 + t / 2, Y, W.apronZ, 'concrete');
  // dock face: steel edge angle, bumpers either side of each dock door
  S('steel_dark', x0, Y - 0.2, W.apronZ - 0.02, x1, Y + 0.01, W.apronZ + 0.06);
  for (const [dx, dw] of W.dockDoors) {
    for (const e of [-1, 1]) {
      const bx = dx + e * (dw / 2 + 0.35);
      S('rubber', bx - 0.14, 0.35, W.apronZ, bx + 0.14, 1.0, W.apronZ + 0.2, { collide: 'rubber' });
    }
    // dock leveller plate
    S('steel_grey', dx - 1.0, Y - 0.005, W.apronZ - 2.2, dx + 1.0, Y + 0.012, W.apronZ);
  }
  // yellow safety edge painted along the dock
  S('paint_yellow', x0, Y + 0.001, W.apronZ - 0.25, x1, Y + 0.004, W.apronZ - 0.02);

  // ------------------------------------------------------------------ walls --
  const dockOps = (head) => {
    const out = [];
    const p = W.personnel;
    out.push([p[0] - p[1] / 2 - x0, p[0] + p[1] / 2 - x0, head(p[2])]);
    for (const [dx, dw, h] of W.dockDoors) out.push([dx - dw / 2 - x0, dx + dw / 2 - x0, head(h)]);
    return out;
  };
  const westOps = (head) => [[W.westDoor[0] - W.westDoor[1] / 2 - z0, W.westDoor[0] + W.westDoor[1] / 2 - z0, head(W.westDoor[2])]];
  const eastOps = (head) => [[W.eastDoor[0] - W.eastDoor[1] / 2 - z0, W.eastDoor[0] + W.eastDoor[1] / 2 - z0, head(W.eastDoor[2])]];
  const dadoTop = Y + 1.4;
  const walls = [
    [x0, z1, x1, z1, dockOps],
    [x0, z0, x1, z0, () => []],
    [x0, z0, x0, z1, westOps],
    [x1, z0, x1, z1, eastOps],
  ];
  for (const [ax, az, bx, bz, ops] of walls) {
    // precast dado to 1.4 m above the floor, cladding above, parapet to `top`
    WALL('precast', ax, az, bx, bz, Y, dadoTop, t + 0.04, ops((h) => h), { frame: 'steel_dark', masks: [0.5, 0.6, 0.3] });
    WALL(s > 0 ? 'cladding' : 'cladding_blue', ax, az, bx, bz, dadoTop, top, t, ops((h) => h - 1.4), {
      masks: [0.4, 0.5, 0.2],
      lintel: false,
    });
    // the base course below the floor line (the slab edge already collides)
    WALL('dock_concrete', ax, az, bx, bz, 0, Y, t + 0.06, [], { collide: false });
    // coping on the parapet
    WALL('steel_dark', ax, az, bx, bz, top, top + 0.12, t + 0.1, [], { collide: false });
  }
  // the shutter half down in the middle dock door (visual; the head is 2.6 m)
  for (const [dx, dw, h] of W.dockDoors) {
    if (h >= 3.4) {
      S('shutter', dx - dw / 2, Y + h, z1 - 0.2, dx + dw / 2, Y + h + 0.3, z1 - 0.1); // rolled-up drum
      continue;
    }
    S('shutter', dx - dw / 2, Y + h, z1 - 0.12, dx + dw / 2, Y + 3.4, z1 - 0.06);
  }

  // ------------------------------------------------------------------- roof --
  // Visual only. A low-pitch sheet roof behind the parapet, with roof-light
  // strips every 6 m so the late sun lands on the floor in bars.
  const strips = [];
  for (let x = x0 + 4.5; x < x1 - 2; x += 6) strips.push([x, x + 1.4]);
  let u = x0;
  for (const [a, b] of strips) {
    S('roof_sheet', u, eave, z0, a, eave + 0.12, z1, { masks: [0.3, 0.6, 0.3] });
    S('glazing', a, eave + 0.02, z0, b, eave + 0.06, z1);
    u = b;
  }
  S('roof_sheet', u, eave, z0, x1, eave + 0.12, z1, { masks: [0.3, 0.6, 0.3] });
  // portal frames (visual) and two interior columns (collide)
  for (let x = x0 + 6; x < x1 - 1; x += 6) {
    S('steel_grey', x - 0.12, eave - 0.6, z0, x + 0.12, eave, z1);
  }
  for (const [cx, cz] of [
    [-22.75, -40],
    [-9.75, -40],
  ]) S('steel_grey', cx - 0.2, Y, cz - 0.2, cx + 0.2, eave, cz + 0.2, { collide: 'metal' });
  // high-bay lights (the world adds a point light for each anchor)
  for (const [lx, lz] of [
    [-24, -41],
    [-10, -41],
    [-22, -33],
    [-8, -34],
  ]) {
    S('light_panel', lx - 0.6, eave - 0.9, lz - 0.25, lx + 0.6, eave - 0.8, lz + 0.25);
    A.interiorLights.push({ x: X(lx), y: eave - 1.1, z: Z(lz) });
  }

  // -------------------------------------------------------------- mezzanine --
  const M = W.mezz;
  const [mzA, mzB] = [Math.min(Z(M.z0), Z(M.z1)), Math.max(Z(M.z0), Z(M.z1))];
  const [mxA, mxB] = [Math.min(X(M.x0), X(M.x1)), Math.max(X(M.x0), X(M.x1))];
  // rail the open (atrium-side) edge, gapped at the stair heads, and the end
  const gapsLocal = W.mezzStairs.map((c) => [c - 0.75, c + 0.75]);
  const gapsWorld = gapsLocal.map(([a, b]) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))]);
  const openEdge = s > 0 ? 'S' : 'N';
  const endEdge = s > 0 ? 'E' : 'W';
  deck(A, mxA, mzA, mxB, mzB, M.y, { rails: { [openEdge]: gapsWorld, [endEdge]: [] }, posts: true });
  for (const c of W.mezzStairs) {
    FL('steel_grey', 'z', c, 1.3, -38.0, M.z1, Y, M.y, { base: Y, rails: 'both' });
  }
  // racking under the mezzanine: solid storage, fills the ground under the deck
  racks(A, S, C, M.x0 + 1.4, M.z0 + 0.2, M.x1 - 1.6, M.z1 - 0.3, Y, M.y - 0.45, 'x', rng);

  // ---------------------------------------------------------- floor racking --
  for (const rx of W.racks) racks(A, S, C, rx - 0.55, -43, rx + 0.55, -36, Y, Y + 3.3, 'z', rng);

  // ---------------------------------------------------------------- office --
  const O = W.office;
  const ox0 = -3.0;
  WALL('office_panel', ox0, O.z0, ox0, z1 - t / 2, Y, Y + 2.9, 0.12, [[O.door[0] - O.door[1] / 2 - O.z0, O.door[0] + O.door[1] / 2 - O.z0, 2.6]], {
    frame: 'steel_dark',
    lintel: false,
  });
  WALL('office_panel', ox0, O.z0, x1 - t / 2, O.z0, Y, Y + 2.9, 0.12, [], {});
  // window in the north wall (visual) and a ceiling (visual)
  S('glazing', ox0 + 1.0, Y + 1.1, O.z0 - 0.08, ox0 + 3.6, Y + 2.2, O.z0 + 0.08);
  S('office_panel', ox0, Y + 2.9, O.z0, x1 - t / 2, Y + 3.0, z1 - t / 2);
  // desk, cabinets
  S('laminate', 0.0, Y, -35.2, 1.6, Y + 0.76, -33.6, { collide: 'wood' });
  S('steel_grey', 0.9, Y, -31.2, 1.7, Y + 1.3, -30.5, { collide: 'metal' });
  S('steel_grey', -0.2, Y, -31.2, 0.6, Y + 1.3, -30.5, { collide: 'metal' });
  A.interiorLights.push({ x: X(-0.6), y: Y + 2.6, z: Z(-34) });

  // ---------------------------------------------------- loading-area clutter --
  const pal = [
    [-30.8, -32.2],
    [-12.8, -31.6],
    [-8.2, -37.0],
    [-29.8, -37.6],
  ];
  for (const [px, pz] of pal) palletStack(A, rng, X(px), Y, Z(pz), rng.int(2, 4));
  forklift(A, X(-21.5), Z(-32.4), ry0 + 1.4);
  // crates stacked against the west wall
  S('wood_prop_dark', -33.6, Y, -32.8, -32.0, Y + 1.6, -31.0, { collide: 'wood' });

  // ------------------------------------------------------- outside the doors --
  // West personnel door: a landing and a stair down toward the spawn side.
  const wd = W.westDoor;
  S('dock_concrete', x0 - 1.6, 0, wd[0] - 0.9, x0 - t / 2, Y, wd[0] + 0.9, { collide: true });
  FL('dock_concrete', 'x', wd[0], 1.6, x0 - 1.6, x0 - 4.0, Y, 0, { rails: 'both' });
  // Apron: a stair off its west end, a forklift ramp off its east end.
  const azc = (z1 + W.apronZ) / 2;
  FL('dock_concrete', 'x', azc, 3.0, x0, x0 - 2.4, Y, 0, {});
  const ramp = (zc, w) => {
    rampX(A, 'dock_concrete', Z(zc), w, X(x1), Y, X(x1 + 8), 0, 0.3, { collide: 'concrete' });
    // solid fill under the high half, and kerbs
    C(x1, 0, zc - w / 2, x1 + 4, 0.55, zc + w / 2, 'concrete');
    S('steel_yellow', x1, 0, zc - w / 2 - 0.1, x1 + 8, 0.25, zc - w / 2);
    S('steel_yellow', x1, 0, zc + w / 2, x1 + 8, 0.25, zc + w / 2 + 0.1);
  };
  ramp(azc, 3.4);
  ramp(W.eastDoor[0], W.eastDoor[1]);
  // east drive door landing inside: nothing, the floor meets the ramp head
  void G;
  void boxAt;
  void rail;
  void _m;
  void trs;
}

/**
 * Pallet racking between plan corners (local), with loads. `along` is the
 * axis the bays run on. Visual uprights and beams, a solid collision block.
 */
function racks(A, S, C, x0, z0, x1, z1, y0, y1, along, rng) {
  const bays = along === 'x' ? Math.max(1, Math.round((x1 - x0) / 2.7)) : Math.max(1, Math.round((z1 - z0) / 2.7));
  const levels = Math.max(1, Math.round((y1 - y0) / 1.5));
  for (let i = 0; i <= bays; i++) {
    const f = i / bays;
    if (along === 'x') {
      const x = x0 + (x1 - x0) * f;
      S('rack_blue', x - 0.05, y0, z0, x + 0.05, y1, z0 + 0.1);
      S('rack_blue', x - 0.05, y0, z1 - 0.1, x + 0.05, y1, z1);
    } else {
      const z = z0 + (z1 - z0) * f;
      S('rack_blue', x0, y0, z - 0.05, x0 + 0.1, y1, z + 0.05);
      S('rack_blue', x1 - 0.1, y0, z - 0.05, x1, y1, z + 0.05);
    }
  }
  for (let l = 1; l <= levels; l++) {
    const y = y0 + ((y1 - y0) * l) / levels - 0.1;
    S('rack_orange', x0, y - 0.1, z0, x1, y, z0 + 0.08);
    S('rack_orange', x0, y - 0.1, z1 - 0.08, x1, y, z1);
  }
  // loads: a wrapped pallet in most bay-levels
  for (let i = 0; i < bays; i++) {
    for (let l = 0; l < levels; l++) {
      if (rng.float() < 0.18) continue;
      const lo = y0 + ((y1 - y0) * l) / levels;
      const h = Math.min((y1 - y0) / levels - 0.25, rng.range(0.8, 1.25));
      const key = rng.pick(['wood_pale', 'wood_prop', 'fabric_cream', 'wood_pale']);
      if (along === 'x') {
        const a = x0 + ((x1 - x0) * i) / bays + 0.15;
        const b = x0 + ((x1 - x0) * (i + 1)) / bays - 0.15;
        S(key, a, lo + 0.14, z0 + 0.15, b, lo + 0.14 + h, z1 - 0.15);
      } else {
        const a = z0 + ((z1 - z0) * i) / bays + 0.15;
        const b = z0 + ((z1 - z0) * (i + 1)) / bays - 0.15;
        S(key, x0 + 0.15, lo + 0.14, a, x1 - 0.15, lo + 0.14 + h, b);
      }
    }
  }
  C(x0, y0, z0, x1, y1, z1, 'metal');
}

/** A stack of wrapped pallets (instanced pallets + a load block), collision box. */
export function palletStack(A, rng, x, y, z, n) {
  const ry = rng.range(-0.2, 0.2);
  for (let i = 0; i < n; i++) {
    A.put('pallet', x, y + i * 0.62, z, ry + rng.range(-0.05, 0.05), 1, [1, 1.2, 1]);
    boxAt(A, rng.pick(['wood_pale', 'fabric_cream', 'wood_prop']), x, y + i * 0.62 + 0.36, z, 1.05, 0.46, 0.85, ry);
  }
  A.box('wood', x, y + (n * 0.62) / 2, z, 1.2, n * 0.62, 1.0, ry);
}
