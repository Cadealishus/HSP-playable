import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { Parts } from './hardware.js';
import { BOX, BOX_THIN, IDENT, LL } from './kit.js';
import { patchGeometry } from './util.js';
import { BUILDINGS } from './layout.js';

/**
 * WORLD — URBAN PLAZA additions for multiplayer.
 *
 * Two things the street needed once it became an MP map:
 *  - burnt-out buses in the open lots on either flank. The ring round the back
 *    blocks was 18 m of bare sand with nothing to fight from.
 *  - a roof route: a masonry exterior stair up the north wall of W1 in the west
 *    alley, landing on the roof through a gap in the parapet (layout.js
 *    `parapetGaps`). The roof looks over the square and the north street; its
 *    counterplay is E1's windows across the street and the open stair itself.
 *
 * Runs after every other pass with its own RNG stream, so nothing it places
 * moves the street it sits on. Every step block runs to the ground: nothing to
 * walk under, and the AI's single-layer nav grid reads the flight as a slope.
 */

/** The W1 roof stair, level metres. Climbs west along W1's north face. */
export const ROOF_STAIR = {
  z0: 20.15, // against the wall
  z1: 21.65, // open side
  xBottom: -7.0, // front of the first step (at the pavement edge)
  steps: 34,
  run: 0.355, // 0.43 m of climb per 0.8 m nav cell: under the AI step limit
  top: 6.5, // W1 roof (3.45 ground storey + 3.05)
  landing: [-20.35, -18.44], // x range of the top landing (matches the parapet gap)
};

/** Burnt-out buses: [x, z, ry]. Local +Z is the nose. */
export const BUSES = [
  [-47.0, 12.0, 0.18],
  [46.5, -9.0, -0.24],
];

export function dressPlaza(A) {
  const rng = new Rng(0x9_1a2a);
  roofStair(A, rng);
  for (const [x, z, ry] of BUSES) buildBurntBus(A, rng, x, z, ry);
}

function roofStair(A, rng) {
  const S = ROOF_STAIR;
  const w1 = BUILDINGS.find((b) => b.id === 'W1');
  const top = S.top ?? (w1 ? 6.5 : 6.5);
  const rise = top / S.steps;
  const zc = (S.z0 + S.z1) / 2;
  const zw = S.z1 - S.z0;
  const box = BOX(A);
  // steps: solid blocks to the ground, climbing toward -x
  for (let i = 0; i < S.steps; i++) {
    const xa = S.xBottom - i * S.run;
    const xb = xa - S.run;
    const yTop = (i + 1) * rise;
    // tread (a concrete nosing over a rendered riser block)
    A.add('plaster_cream', box, LL(IDENT, (xa + xb) / 2, (yTop - 0.04) / 2, zc, 0, S.run + 0.004, yTop - 0.04, zw), {
      masks: [0.55, 0.65, 0.35],
    });
    A.add('concrete', box, LL(IDENT, (xa + xb) / 2 + 0.01, yTop - 0.025, zc, 0, S.run + 0.03, 0.05, zw + 0.04), {
      masks: [0.8, 0.4, 0.2],
    });
    // fill below the ramp line (one riser down), so nothing is walkable under it
    if (yTop - rise > 0.02) A.box('concrete', (xa + xb) / 2, (yTop - rise) / 2, zc, S.run, yTop - rise, zw);
  }
  // Collision for the flight is ONE smooth ramp across the nosings. Per-step
  // boxes quantise the climb over a 0.8 m nav cell to 2 or 3 risers (0.57 m),
  // over the AI's 0.45 m step limit; the ramp gives an exact 0.43 m.
  {
    const run = S.steps * S.run;
    const th = Math.atan2(top, run);
    const len = Math.hypot(top, run);
    const thick = 0.3;
    const nx = Math.sin(th);
    const ny = Math.cos(th);
    const mx = S.xBottom - run / 2 - (nx * thick) / 2;
    const my = top / 2 - (ny * thick) / 2;
    const unit = A.cache('plaza:unit', () => new THREE.BoxGeometry(1, 1, 1));
    A.collideGeo('concrete', unit, LL(IDENT, mx, my, zc, 0, len, thick, zw, 0, -th));
  }
  // top landing, flush with the roof
  const [lx0, lx1] = S.landing;
  const stairEnd = S.xBottom - S.steps * S.run;
  const la = Math.min(lx0, stairEnd);
  const lb = stairEnd; // the landing starts where the flight ends, never over it
  A.add('plaster_cream', box, LL(IDENT, (la + lb) / 2, (top - 0.04) / 2, zc, 0, lb - la, top - 0.04, zw), {
    masks: [0.55, 0.65, 0.35],
  });
  A.add('concrete', box, LL(IDENT, (la + lb) / 2, top - 0.025, zc, 0, lb - la + 0.03, 0.05, zw + 0.04), {
    masks: [0.8, 0.4, 0.2],
  });
  A.box('concrete', (la + lb) / 2, top / 2, zc, lb - la, top, zw);
  // bridge the gap between the landing and the roof slab over the wall head
  A.add('concrete', box, LL(IDENT, (lx0 + lx1) / 2, top - 0.1, 19.95, 0, lx1 - lx0, 0.2, 0.5), { masks: [0.7, 0.5, 0.3] });
  A.box('concrete', (lx0 + lx1) / 2, top - 0.1, 19.95, lx1 - lx0, 0.2, 0.5);
  // landing parapet on the west end and the open side
  A.add('plaster_cream', box, LL(IDENT, la - 0.1, top + 0.45, zc, 0, 0.2, 0.9, zw + 0.02), { masks: [0.5, 0.5, 0.2] });
  A.box('concrete', la - 0.1, top + 0.45, zc, 0.2, 0.9, zw + 0.02);
  A.add('plaster_cream', box, LL(IDENT, (la + lb) / 2, top + 0.45, S.z1 - 0.1, 0, lb - la, 0.9, 0.2), { masks: [0.5, 0.5, 0.2] });
  A.box('concrete', (la + lb) / 2, top + 0.45, S.z1 - 0.1, lb - la, 0.9, 0.2);
  // steel handrail on the open side, following the pitch
  const bar = BOX_THIN(A);
  const run = S.steps * S.run;
  const ang = Math.atan2(top, run);
  const len = Math.hypot(top, run);
  const midX = S.xBottom - run / 2;
  const m = LL(IDENT, midX, top / 2 + 0.95, S.z1 - 0.05, 0, len, 0.045, 0.045, 0, -ang);
  A.add('metal_rust', bar, m, { masks: [0.9, 0.5, 0] });
  for (let i = 0; i <= S.steps; i += 4) {
    const x = S.xBottom - (i + 0.5) * S.run;
    const y = (i + 1) * rise;
    A.add('metal_rust', bar, LL(IDENT, x, y + 0.48, S.z1 - 0.05, 0, 0.035, 0.95, 0.035), { masks: [0.9, 0.5, 0] });
  }
  // grime and a dust fan at the foot of the flight
  const g = patchGeometry(rng, 1.4, { lobes: 9, wobble: 0.5 });
  A.addOnce('dirt', g, LL(IDENT, S.xBottom + 0.6, 0.02, zc + 0.3, rng.float() * 6.28, 1, 1, 0.7), {
    masks: [0.08, 0.9, 0.5],
  });
}

/**
 * A burnt-out single-deck bus, 11.4 m x 2.5 m x 3.0 m: gutted, glassless,
 * soot-black over the last of its livery, sitting on its rims. Hard cover
 * below the waist line, the window band open between the pillars (shoot
 * through, cannot climb through), roof sagging mid-length.
 */
export function buildBurntBus(A, rng, x, z, ry) {
  const P = new Parts();
  const L = 11.4;
  const W = 2.5;
  const body = 'metal_rust';
  const soot = 'metal_dark';
  // floor pan + lower body skirts
  P.box(soot, W - 0.1, 0.12, L - 0.3, 0, 0.55, 0, { grime: 0.8 });
  for (const sx of [-1, 1]) {
    P.box(body, 0.06, 0.95, L, sx * (W / 2 - 0.03), 0.95, 0, { bevel: 0.02, wear: 1.2, grime: 0.6 });
    // rubbing strip and the ghost of the livery band
    P.box('truck_paint', 0.07, 0.16, L * 0.9, sx * (W / 2 - 0.02), 1.25, -0.2, { wear: 1.6, grime: 0.7 });
  }
  // front and rear ends
  P.box(body, W, 2.0, 0.08, 0, 1.45, L / 2 - 0.04, { grime: 0.7 });
  P.box(body, W, 1.0, 0.08, 0, 0.95, -L / 2 + 0.04, { grime: 0.7 });
  P.box(soot, W * 0.96, 0.25, 0.2, 0, 0.45, L / 2 + 0.05, { grime: 0.8 }); // bumper
  P.box(soot, W * 0.96, 0.25, 0.2, 0, 0.45, -L / 2 - 0.05, { grime: 0.8 });
  // window pillars
  const nP = 9;
  for (let i = 0; i <= nP; i++) {
    const pz = -L / 2 + 0.15 + (i / nP) * (L - 0.3);
    for (const sx of [-1, 1]) P.box(soot, 0.09, 1.05, 0.12, sx * (W / 2 - 0.05), 1.95, pz, { grime: 0.8 });
  }
  // roof: two panels that sag toward the middle
  for (const s of [-1, 1]) {
    P.box(body, W, 0.08, L / 2, 0, 2.55 - 0.1, (s * L) / 4, { rx: s * 0.035, grime: 0.9, wear: 1.3 });
  }
  // gutted interior: seat frames, a few surviving
  for (let i = 0; i < 8; i++) {
    const pz = -L / 2 + 1.6 + i * 1.1;
    for (const sx of [-1, 1]) {
      if (rng.float() < 0.3) continue;
      P.box(soot, 0.9, 0.06, 0.45, sx * 0.62, 0.95, pz, { grime: 0.9 });
      P.box(soot, 0.9, 0.55, 0.05, sx * 0.62, 1.2, pz - 0.22, { rx: -0.15, grime: 0.9 });
    }
  }
  // wheels: rims on the ground, the rubber burnt away
  for (const wz of [L / 2 - 2.2, -L / 2 + 2.6]) {
    for (const sx of [-1, 1]) {
      P.cyl('rubber', 0.46, 0.28, sx * (W / 2 - 0.2), 0.42, wz, { rz: Math.PI / 2, radial: 14, grime: 0.9 });
      P.cyl('steel', 0.3, 0.3, sx * (W / 2 - 0.19), 0.42, wz, { rz: Math.PI / 2, radial: 12, grime: 0.8, wear: 0.6 });
    }
  }
  P.emit(A, x, 0.0, z, ry, { dustH: 1.4, dust: 0.9, rz: 0.02 });

  // collision: hard lower body, pillars, the ends, the roof slab
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  const [cx, cz] = at(0, 0);
  A.box('metal', cx, 0.72, cz, W, 1.44, L, ry);
  for (let i = 0; i <= nP; i++) {
    const pz = -L / 2 + 0.15 + (i / nP) * (L - 0.3);
    for (const sx of [-1, 1]) {
      const [px, pzw] = at(sx * (W / 2 - 0.05), pz);
      A.box('metal', px, 1.95, pzw, 0.12, 1.05, 0.14, ry);
    }
  }
  const [fx, fz] = at(0, L / 2 - 0.05);
  A.box('metal', fx, 1.95, fz, W, 1.05, 0.12, ry);
  A.box('metal', cx, 2.47, cz, W, 0.16, L, ry);

  // scorch on the sand and a debris fan
  const scorch = patchGeometry(rng, 5.2, { lobes: 12, wobble: 0.45 });
  A.addOnce('dirt', scorch, LL(IDENT, x, 0.035, z, ry, 1, 1, 0.55), { masks: [0.05, 1.0, 0.9] });
  for (let i = 0; i < 14; i++) {
    const a = rng.float() * 6.28;
    const r = rng.range(2.0, 6.5);
    A.put(
      rng.pick(['brick_b', 'rock_b', 'litter', 'plank_b', 'can', 'tyre_small']),
      x + Math.cos(a) * r,
      0.05,
      z + Math.sin(a) * r,
      rng.float() * 6.28,
      rng.range(0.6, 1.1),
      [1, 1.4, 1]
    );
  }
}
