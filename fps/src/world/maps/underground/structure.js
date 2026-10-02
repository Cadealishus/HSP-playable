import * as THREE from 'three';
import { slab, boxAt, cylAt, stairZ, G, part, merged, cylPart } from '../airport/kit.js';
import { buildVoids } from '../shared/voids.js';
import { pipe, riser } from '../shared/props.js';
import { trs, rockGeometry, fillMasks } from '../../util.js';
import { VOIDS, V, Y, TRACK1_Z, TRACK2_Z } from './layout.js';

/**
 * UNDERGROUND: the shell. The void kit carves every room, corridor, stair and
 * tunnel; this file then adds what makes each one read as the thing it is:
 * platform edges, columns, the permanent way (ballast, sleepers, rails, the
 * third rail), tunnel ribs, cable trays and pipe runs, the rubble plug in the
 * west tunnel and the street above.
 */

const _m = new THREE.Matrix4();
const P = Y.plat;
const T = Y.track;

export function buildShell(A, rng) {
  const out = buildVoids(A, VOIDS);
  registerShellProtos(A, rng);
  station(A);
  permanentWay(A);
  tunnels(A, rng);
  street(A);
  return out;
}

function registerShellProtos(A, rng) {
  if (A.has('ug_sleeper')) return;
  A.proto('ug_sleeper', { geo: merged([part(2.4, 0.16, 0.26, 0, 0.08, 0, 0, 0, 0, [0.5, 0.6, 0.4])]), key: 'sleeper', castShadow: true });
  // chair plates + clips, a pair per sleeper (steel)
  A.proto('ug_chair', {
    geo: merged([part(0.34, 0.03, 0.2, -0.72, 0.175, 0), part(0.34, 0.03, 0.2, 0.72, 0.175, 0), part(0.04, 0.05, 0.12, -0.63, 0.2, 0), part(0.04, 0.05, 0.12, 0.81, 0.2, 0)]),
    key: 'rail_steel',
    castShadow: false,
  });
  // cable tray bracket (wall mounted, points +z)
  A.proto('ug_bracket', { geo: merged([part(0.05, 0.05, 0.5, 0, 0, 0.25), part(0.05, 0.3, 0.05, 0, -0.12, 0.02)]), key: 'gate_steel', castShadow: false });
  // rubble chunks
  const rocks = [];
  for (let i = 0; i < 3; i++) {
    const g = rockGeometry(rng, 0.45, 1, 0.65);
    fillMasks(g, 0.3, 0.5, 0.4);
    rocks.push(g);
  }
  A.proto('ug_rock', { geo: rocks[0], key: 'rubble', tilt: 0.4 });
  A.proto('ug_rock_b', { geo: rocks[1], key: 'rubble', tilt: 0.4 });
  A.proto('ug_rock_c', { geo: rocks[2], key: 'tunnel_concrete', tilt: 0.4 });
}

// ================================================================ station ==

function station(A) {
  const pa = V.platA;
  const pb = V.platB;
  // platform edges: coping stone lip and the yellow line
  slab(A, 'stair_tread', pa.x0, P - 0.12, -8.0, pa.x1, P + 0.004, -7.88);
  slab(A, 'edge_yellow', pa.x0, P, -8.55, pa.x1, P + 0.006, -8.0);
  slab(A, 'stair_tread', pb.x0, P - 0.12, 1.88, pb.x1, P + 0.004, 2.0);
  slab(A, 'edge_yellow', pb.x0, P, 2.0, pb.x1, P + 0.006, 2.55);
  // walkway kerb in the east tunnel
  slab(A, 'edge_yellow', 40, P, -8.3, 84, P + 0.006, -8.0);

  // the dado band on the platform back walls, broken at the doors
  const band = (z0, z1, gaps) => {
    let x = -20;
    for (const [a, b] of [...gaps, [40, 40]]) {
      if (a > x) slab(A, 'wall_tile_band', x, P + 1.1, z0, a, P + 1.45, z1);
      x = b;
    }
  };
  band(-14.0, -13.97, [[-4, -1.8], [27, 29.2]]);
  band(7.97, 8.0, [[-7.4, -5.2], [21, 23.2]]);
  // same band round the ticket hall
  const h = V.hall;
  slab(A, 'wall_tile_band', h.x0, h.y + 1.1, h.z0, h.x1, h.y + 1.45, h.z0 + 0.03);
  slab(A, 'wall_tile_band', h.x0, h.y + 1.1, h.z0, h.x0 + 0.03, h.y + 1.45, h.z1);

  // columns between the tracks (collide: cover for anyone on the bed)
  for (let x = -14; x <= 36; x += 6) {
    slab(A, 'wall_tile', x - 0.3, T, -3.4, x + 0.3, 9.6, -2.8, { collide: 'concrete', masks: [0.5, 0.6, 0.4] });
    slab(A, 'tunnel_concrete', x - 0.34, T, -3.44, x + 0.34, T + 0.5, -2.76);
  }
  // platform columns: tile clad, a stop darker at the base
  for (const z of [-11.0, 5.0]) {
    for (let x = -12; x <= 36; x += 12) {
      slab(A, 'wall_tile', x - 0.35, P, z - 0.35, x + 0.35, 9.6, z + 0.35, { collide: 'concrete', masks: [0.5, 0.6, 0.4] });
      slab(A, 'wall_tile_band', x - 0.37, P, z - 0.37, x + 0.37, P + 1.2, z + 0.37);
    }
  }
  // track access steps at both ends of both platforms (4 x 0.275 m)
  for (const xc of [-17.5, 36.5]) {
    stairZ(A, 'stair_tread', xc, 2.0, -8 + 4 * 0.3, T, 4, (P - T) / 4, 0.3, -1, { base: T - 0.1 });
    stairZ(A, 'stair_tread', xc, 2.0, 2 - 4 * 0.3, T, 4, (P - T) / 4, 0.3, 1, { base: T - 0.1 });
    // handrail posts beside each flight (visual)
    for (const [z0, z1] of [[-8, -6.8], [0.8, 2]]) {
      for (const s of [-1.05, 1.05]) cylAt(A, 'edge_yellow', xc + s, T, (z0 + z1) / 2, 0.025, 1.1);
    }
  }
  // tunnel mouths: a concrete portal frame at each end of the station box
  for (const x of [-20, 40]) {
    slab(A, 'tunnel_concrete', x - 0.25, 9.0, -8, x + 0.25, 9.6, 2);
  }
  // ceiling beams across the station, every 6 m
  for (let x = -17; x <= 37; x += 6) slab(A, 'ceiling_ug', x - 0.2, 9.0, -14, x + 0.2, 9.6, 8);
  // cable trays along the station's track-side ceiling
  slab(A, 'gate_steel', -20, 8.55, -6.9, 40, 8.6, -6.3);
  slab(A, 'gate_steel', -20, 8.55, 0.3, 40, 8.6, 0.9);
}

// ========================================================= permanent way ==

/** Ballast, sleepers, chairs, rails and a boarded third rail along a track. */
function track(A, x0, x1, zc, thirdSide) {
  slab(A, 'ballast', x0, T, zc - 1.45, x1, T + 0.1, zc + 1.45);
  for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.7) {
    A.put('ug_sleeper', x, T + 0.06, zc, Math.PI / 2 + ((x * 13.7) % 0.04) - 0.02);
    A.put('ug_chair', x, T + 0.06, zc, Math.PI / 2);
  }
  for (const s of [-0.72, 0.72]) {
    slab(A, 'rail_steel', x0, T + 0.22, zc + s - 0.035, x1, T + 0.38, zc + s + 0.035);
    slab(A, 'rail_steel', x0, T + 0.22, zc + s - 0.07, x1, T + 0.25, zc + s + 0.07);
  }
  // third rail on insulators, with its timber cover board
  const z3 = zc + thirdSide * 1.2;
  slab(A, 'rail_steel', x0, T + 0.3, z3 - 0.04, x1, T + 0.38, z3 + 0.04);
  slab(A, 'wood_bench', x0, T + 0.46, z3 - 0.12, x1, T + 0.49, z3 + 0.12);
}

function permanentWay(A) {
  track(A, -44, 84, TRACK1_Z, 1);
  track(A, -44, 84, TRACK2_Z, -1);
}

// =============================================================== tunnels ==

function tunnels(A, rng) {
  // east tunnel ribs: pilasters on the south wall and beams across the roof
  for (let x = 44; x <= 82; x += 6) {
    if (x > 70 && x < 78) continue; // the ramp mouth
    slab(A, 'tunnel_concrete', x - 0.3, T, 1.7, x + 0.3, 9.0, 2.0, { collide: 'concrete', masks: [0.6, 0.7, 0.5] });
    slab(A, 'tunnel_concrete', x - 0.3, 8.6, -9.2, x + 0.3, 9.0, 2.0);
  }
  for (let x = -40; x <= -22; x += 6) {
    slab(A, 'tunnel_concrete', x - 0.3, T, 1.7, x + 0.3, 9.0, 2.0, { collide: 'concrete', masks: [0.6, 0.7, 0.5] });
    slab(A, 'tunnel_concrete', x - 0.3, T, -8.0, x + 0.3, 9.0, -7.7, { collide: 'concrete', masks: [0.6, 0.7, 0.5] });
    slab(A, 'tunnel_concrete', x - 0.3, 8.6, -8, x + 0.3, 9.0, 2.0);
  }
  // cable trays (south walls) and pipes (walkway wall)
  for (const [x0, x1] of [[40, 71.5], [76.5, 84], [-44, -20]]) {
    slab(A, 'gate_steel', x0, 7.2, 1.35, x1, 7.25, 1.95);
    slab(A, 'cable_black', x0, 7.25, 1.45, x1, 7.36, 1.9);
    for (let x = x0 + 0.5; x < x1; x += 2.0) A.put('ug_bracket', x, 7.2, 2.0, Math.PI);
  }
  pipe(A, 'pipe_paint', 'x', 40, 84, -9.0, 8.1, 0.14);
  pipe(A, 'pipe_red', 'x', 40, 84, -9.0, 7.7, 0.09);
  pipe(A, 'pipe_paint', 'x', -20, 40, -13.75, 8.9, 0.12);
  pipe(A, 'pipe_paint', 'x', -20, 40, 7.75, 8.9, 0.12);
  // deep tunnel: pipes both sides, a tray over the north wall
  pipe(A, 'pipe_paint', 'x', 24, 76, 21.3, 3.2, 0.16);
  pipe(A, 'pipe_red', 'x', 24, 76, 24.7, 3.3, 0.1);
  slab(A, 'gate_steel', 24, 2.7, 21.0, 76, 2.75, 21.6);
  // corridors: pipe runs under the ceiling
  pipe(A, 'pipe_paint', 'x', -16, 36, 11.1, 7.9, 0.1);
  pipe(A, 'pipe_red', 'x', -16, 36, 10.85, 8.05, 0.06);
  pipe(A, 'pipe_paint', 'x', -10, 36, -17.1, 7.9, 0.1);
  // ramp R1: pipe down its west wall, hazard stripe at the top
  slab(A, 'edge_yellow', 72, T, 2.0, 76, T + 0.006, 2.4);
  for (let z = 4; z <= 20; z += 4) riser(A, 'pipe_paint', 72.2, z, 0, 8.5, 0.07);

  // west tunnel: the rubble plug where the roof came in
  const rocks = ['ug_rock', 'ug_rock_b', 'ug_rock_c'];
  for (let i = 0; i < 70; i++) {
    const u = rng.float();
    const x = -44 + u * u * 7.5;
    const z = rng.range(-7.7, 1.7);
    const hgt = (1 - u) * 3.8;
    const y = T + rng.range(0, Math.max(0.1, hgt));
    const s = rng.range(0.9, 2.4) * (1.2 - u * 0.5);
    A.put(rocks[i % 3], x, y, z, rng.float() * 6.28, s, null, rng.range(-0.6, 0.6), rng.range(-0.6, 0.6));
  }
  // the plug collides as a stepped mass (players cannot climb it)
  slab(A, null, -44, T, -8, -40.5, T + 3.6, 2, { collide: 'concrete' });
  slab(A, null, -40.5, T, -8, -38.5, T + 1.6, 2, { collide: 'concrete' });
  slab(A, 'tunnel_concrete', -44, 7.8, -8, -41, 9.0, 2);
  // a fallen roof segment leaning against the pile
  boxAt(A, 'tunnel_concrete', -37.6, T + 0.9, -3.0, 0.5, 3.4, 4.2, 0, { rz: 0.9 });
  slab(A, null, -38.8, T, -5.1, -36.6, T + 1.3, -0.9, { collide: 'concrete' });
}

// ================================================================ street ==

function street(A) {
  const s = V.street;
  const y = Y.street;
  // the road along the north side, kerb, pavement
  slab(A, 'street_asphalt', s.x0, y, s.z0, s.x1, y + 0.01, -52.5);
  slab(A, 'stair_tread', s.x0, y, -52.5, s.x1, y + 0.14, -52.2, { collide: 'concrete' });
  // facades: plinth course and a cornice line on the south block, window
  // reveals (dark voids with a lit one or two) on the others
  slab(A, 'stair_tread', s.x0, y, -44.2, -52, y + 0.6, -44, { collide: 'concrete' });
  slab(A, 'stair_tread', -47, y, -44.2, s.x1, y + 0.6, -44, { collide: 'concrete' });
  slab(A, 'stair_tread', s.x0, y + 7.6, -44.25, s.x1, y + 7.9, -44);
  for (let x = s.x0 + 2.5; x < s.x1 - 1; x += 4.5) {
    for (const wy of [y + 3.9, y + 8.6]) {
      if (wy < y + 5 && x > -53.5 && x < -45.5) continue; // over the entrance
      slab(A, 'window_void', x - 0.7, wy, -44.05, x + 0.7, wy + 1.9, -44.0);
    }
  }
  for (let z = s.z0 + 2.5; z < s.z1 - 1; z += 4.5) {
    for (const wy of [y + 3.9, y + 8.6]) {
      slab(A, 'window_void', s.x0, wy, z - 0.7, s.x0 + 0.05, wy + 1.9, z + 0.7);
      slab(A, 'window_void', s.x1 - 0.05, wy, z - 0.7, s.x1, wy + 1.9, z + 0.7);
    }
  }
  for (let x = s.x0 + 2.5; x < s.x1 - 1; x += 4.5) {
    for (const wy of [y + 3.9, y + 8.6]) slab(A, 'window_void', x - 0.7, wy, s.z0, x + 0.7, wy + 1.9, s.z0 + 0.05);
  }
  // the entrance: canopy, roller-shutter box, railings either side
  slab(A, 'gate_steel', -53, y + 3.5, -44.9, -46, y + 3.7, -43.6);
  slab(A, 'gate_steel', -52.2, y + 3.0, -44.2, -46.8, y + 3.5, -43.7);
  for (const x of [-52.4, -46.6]) {
    for (let z = -46.5; z <= -44.3; z += 0.55) cylAt(A, 'gate_steel', x, y, z, 0.022, 1.05);
    slab(A, 'gate_steel', x - 0.03, y + 1.02, -46.5, x + 0.03, y + 1.08, -44.2);
    slab(A, null, x - 0.05, y, -46.5, x + 0.05, y + 1.1, -44.2, { collide: 'metal' });
  }
  slab(A, 'gate_steel', -52.4, y + 1.02, -46.53, -46.6, y + 1.08, -46.47);
  // the lamp standard (the head is an emissive batch; see lights.js)
  cylAt(A, 'metal_dark', -58, y, -50.5, 0.08, 6.2, { collide: 'metal' });
  boxAt(A, 'metal_dark', -57.3, y + 6.15, -50.5, 1.5, 0.1, 0.12);
  // a car parked on the road, nose east (cover)
  carBody(A, -44.5, -55.2, 0);
  carBody(A, -61.0, -55.0, Math.PI + 0.05);
}

/** A plain hatchback: body, glasshouse, wheels. Collides as two boxes. */
function carBody(A, x, z, ry) {
  const y = Y.street;
  boxAt(A, 'sedan_paint', x, y + 0.62, z, 4.1, 0.75, 1.75, ry, { collide: 'metal' });
  boxAt(A, 'train_glass', x - 0.2 * Math.cos(ry), y + 1.22, z + 0.2 * Math.sin(ry), 2.3, 0.5, 1.55, ry, { collide: 'glass' });
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  for (const [lx, lz] of [[1.35, 0.8], [1.35, -0.8], [-1.35, 0.8], [-1.35, -0.8]]) {
    A.add('rubber', G.cyl(A, 14), trs(_m, x + lx * c + lz * sn, y + 0.32, z - lx * sn + lz * c, ry, 0.64, 0.22, 0.64, Math.PI / 2, 0));
  }
}

export { cylPart };
