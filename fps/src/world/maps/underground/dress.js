import * as THREE from 'three';
import { slab, boxAt, cylAt, G } from '../airport/kit.js';
import { registerSharedProps, prop, pipe, riser, desk } from '../shared/props.js';
import { trs } from '../../util.js';
import { V, Y, CF } from './layout.js';

/**
 * UNDERGROUND: cover and dressing. The ticket hall (fare gates, booth,
 * machines), the platforms (benches, bins), the service rooms (cabinets,
 * lockers, pumps, stores), the deep tunnel, and the command facility the
 * whole mission is walking towards: racks, desks, the comms console on its
 * dais, the glass office, the generator, sandbagged positions at both doors.
 * Every piece that could stop a round has a collision proxy at its real size.
 */

const _m = new THREE.Matrix4();
const P = Y.plat;
const H = Y.hall;
const D = Y.deep;

export function dressUnderground(A, rng) {
  registerSharedProps(A);
  hall(A, rng);
  platforms(A, rng);
  serviceRooms(A, rng);
  tunnelsDress(A, rng);
  facility(A, rng);
  puddles(A, rng);
}

// ================================================================== hall ==

function hall(A, rng) {
  // columns
  for (const [x, z] of [[-54, -27], [-38, -27], [-54, -16], [-38, -16]]) {
    slab(A, 'wall_tile', x - 0.4, H, z - 0.4, x + 0.4, H + 4.6, z + 0.4, { collide: 'concrete' });
    slab(A, 'wall_tile_band', x - 0.42, H, z - 0.42, x + 0.42, H + 1.2, z + 0.42);
  }
  // the fare-gate line across the hall at z -22: cabinets with 1.0 m lanes,
  // two wide gates (one with its paddles torn out), a steel barrier at the ends
  const z = -22;
  const cab = (x) => {
    slab(A, 'gate_steel', x - 0.14, H, z - 0.8, x + 0.14, H + 1.02, z + 0.8, { collide: 'metal', masks: [0.5, 0.5, 0.4] });
    slab(A, 'steel', x - 0.15, H + 1.02, z - 0.82, x + 0.15, H + 1.06, z + 0.82);
    slab(A, 'screen_cf', x - 0.1, H + 1.061, z - 0.7, x + 0.1, H + 1.07, z - 0.5);
  };
  let x = -61.7;
  const lanes = [];
  const pattern = [1.0, 1.0, 1.0, 1.8, 1.0, 1.0, 1.0, 1.0, 1.8, 1.0, 1.0, 1.0];
  cab(x);
  for (const w of pattern) {
    const nx = x + 0.28 + w;
    lanes.push([(x + nx) / 2, w]);
    cab(nx);
    x = nx;
  }
  // barrier from the last cabinet to the east wall
  slab(A, 'gate_steel', x + 0.14, H, z - 0.05, -30, H + 1.1, z + 0.05, { collide: 'metal' });
  for (let bx = x + 1; bx < -30; bx += 1.2) cylAt(A, 'gate_steel', bx, H, z, 0.03, 1.1);
  // paddles on the narrow lanes (glass, knee high), some snapped off
  lanes.forEach(([lx, w], i) => {
    if (w > 1.2 || i % 3 === 2) return;
    for (const s of [-1, 1]) {
      A.add('glazing', G.pane(A), trs(_m, lx + s * (w / 2 - 0.2), H + 0.65, z, Math.PI / 2, 0.02, 0.5, 1));
      A.add('glazing', G.pane(A), trs(_m, lx + s * (w / 2 - 0.2), H + 0.65, z, 0, 0.36, 0.5, 1));
    }
  });
  // ticket booth in the south-west corner: counter, glass screen, back office
  slab(A, 'blockwork', -62, H, -14.2, -55, H + 1.1, -14.0, { collide: 'concrete' });
  slab(A, 'blockwork', -55.2, H, -14.2, -55, H + 3.0, -12, { collide: 'concrete' });
  slab(A, 'wood_bench', -62, H + 1.1, -14.4, -55, H + 1.16, -13.9);
  A.add('glazing', G.pane(A), trs(_m, -58.5, H + 2.0, -14.1, 0, 7, 1.7, 1));
  A.box('glass', -58.5, H + 2.0, -14.1, 7, 1.7, 0.05);
  slab(A, 'gate_steel', -62, H + 2.85, -14.3, -55, H + 3.05, -13.9);
  // machines on the north wall, one kicked over
  for (let i = 0; i < 4; i++) {
    const mx = -60 + i * 2.1;
    if (i === 2) {
      boxAt(A, 'cabinet_grey', mx, H + 0.4, -30.4, 0.9, 0.8, 1.8, 0.2, { collide: 'metal' });
      continue;
    }
    slab(A, 'cabinet_grey', mx - 0.45, H, -32, mx + 0.45, H + 1.8, -31.3, { collide: 'metal', masks: [0.5, 0.6, 0.4] });
    slab(A, 'screen', mx - 0.25, H + 1.15, -31.31, mx + 0.25, H + 1.5, -31.28);
  }
  // benches, bins, loose debris
  for (const [bx, bz, ry] of [[-44, -30.6, 0], [-36, -30.6, 0], [-60.5, -24, Math.PI / 2]]) bench(A, bx, H, bz, ry);
  prop(A, 'mp_bin', -41, H, -30.8);
  prop(A, 'mp_bin', -32, H, -14.5);
  prop(A, 'mp_cone', -48.6, H, -20.5, 0.3, 1, false);
  prop(A, 'mp_cone', -47.2, H, -20.8, 1.1, 1, false);
  // a fallen ceiling panel and its hangers
  boxAt(A, 'ceiling_ug', -44.5, H + 0.08, -18.5, 2.4, 0.06, 1.2, 0.4, { rz: 0.06 });
  slab(A, 'gate_steel', -45.5, H + 3.2, -18.6, -45.48, H + 4.6, -18.58);
}

function bench(A, x, y, z, ry) {
  boxAt(A, 'wood_bench', x, y + 0.45, z, 1.9, 0.06, 0.42, ry);
  boxAt(A, 'wood_bench', x - Math.sin(ry) * 0.2, y + 0.75, z - Math.cos(ry) * 0.2, 1.9, 0.35, 0.04, ry);
  for (const s of [-0.8, 0.8]) boxAt(A, 'gate_steel', x + s * Math.cos(ry), y + 0.22, z - s * Math.sin(ry), 0.05, 0.44, 0.4, ry);
  A.box('wood', x, y + 0.3, z, 1.9, 0.6, 0.45, ry);
}

// ============================================================== platforms ==

function platforms(A, rng) {
  for (const x of [-8, 20]) bench(A, x, P, -13.5, 0);
  for (const x of [-8, 14, 30]) bench(A, x, P, 7.5, Math.PI);
  prop(A, 'mp_bin', 0.5, P, -13.6);
  prop(A, 'mp_bin', 25.5, P, 7.6);
  // a works barrier left on platform B, a tarp over something
  prop(A, 'mp_crate', 24, P, 4.2, 0.2);
  prop(A, 'mp_crate', 24.2, P + 0.66, 4.3, 0.35, 0.95);
  boxAt(A, 'tarp_blue', 24.1, P + 1.36, 4.25, 1.4, 0.06, 0.95, 0.3, { rz: 0.05 });
  prop(A, 'mp_cabledrum', 31, P, 4.6, 0.4);
  prop(A, 'mp_crate', -11, P, -9.8, 1.3);
  prop(A, 'mp_drum', 38.8, P, -13.2);
  prop(A, 'mp_drum', 38.2, P, -12.5);
  // a trolley of rail sections on track 2 in the station (cover on the bed)
  trolley(A, 12, Y.track, -0.1);
}

function trolley(A, x, y, z) {
  slab(A, 'cabinet_olive', x - 1.3, y + 0.35, z - 0.9, x + 1.3, y + 0.55, z + 0.9, { collide: 'metal' });
  for (const dx of [-0.9, 0.9]) {
    for (const dz of [-0.72, 0.72]) {
      A.add('rail_steel', G.cyl(A, 12), trs(_m, x + dx, y + 0.4, z + dz, 0, 0.36, 0.1, 0.36, Math.PI / 2, 0));
    }
  }
  for (let i = 0; i < 4; i++) slab(A, 'rail_steel', x - 1.2, y + 0.55 + i * 0.14, z - 0.6 + i * 0.3, x + 1.2, y + 0.68 + i * 0.14, z - 0.5 + i * 0.3);
  A.box('metal', x, y + 0.75, z, 2.6, 0.8, 1.8);
}

// =========================================================== service rooms ==

function cabinets(A, x0, x1, zWall, y, faceZ) {
  // a run of electrical cabinets against a wall, facing +z (faceZ 1) or -z
  const ry = faceZ > 0 ? 0 : Math.PI;
  for (let x = x0 + 0.45; x <= x1 - 0.45; x += 0.9) prop(A, 'mp_cabinet', x, y, zWall + faceZ * 0.25, ry);
  slab(A, 'led_amber', x0 + 0.3, y + 1.62, zWall + faceZ * 0.49 - 0.005, x0 + 0.34, y + 1.66, zWall + faceZ * 0.49 + 0.005);
}

function serviceRooms(A, rng) {
  // --- north electrical room: two runs of cabinets and a transformer
  const en = V.elecNorth;
  cabinets(A, en.x0 + 0.2, en.x1 - 0.2, en.z0, P, 1);
  cabinets(A, 9.2, en.x1 - 0.2, en.z1, P, -1); // clear of the door at x 6-8.2
  slab(A, 'cabinet_olive', en.x0 + 0.3, P, en.z0 + 2.4, en.x0 + 1.8, P + 1.6, en.z0 + 4.4, { collide: 'metal', masks: [0.5, 0.6, 0.4] });
  for (let k = 0; k < 5; k++) slab(A, 'metal_dark', en.x0 + 1.8, P + 0.2 + k * 0.28, en.z0 + 2.5, en.x0 + 1.95, P + 0.3 + k * 0.28, en.z0 + 4.3);
  slab(A, 'gate_steel', en.x0, P + 2.6, en.z0 + 0.2, en.x1, P + 2.65, en.z0 + 0.7);
  // --- pump room: two pump sets, a sump, pipes everywhere
  const pr = V.pumpRoom;
  for (const [px, pz] of [[22, -23.5], [28, -23.5]]) {
    slab(A, 'tunnel_concrete', px - 1.3, P, pz - 0.8, px + 1.3, P + 0.3, pz + 0.8, { collide: 'concrete' });
    A.add('pipe_paint', G.cyl(A, 18), trs(_m, px - 0.3, P + 0.85, pz, 0, 1.0, 1.4, 1.0, 0, Math.PI / 2));
    cylAt(A, 'pipe_red', px + 0.8, P + 0.3, pz, 0.35, 0.9);
    A.box('metal', px, P + 0.8, pz, 2.4, 1.1, 1.3);
    riser(A, 'pipe_paint', px - 0.3, pz - 0.6, P + 0.8, P + 4.2, 0.14);
  }
  pipe(A, 'pipe_paint', 'x', pr.x0, pr.x1, -26.4, P + 3.6, 0.2);
  pipe(A, 'pipe_red', 'x', pr.x0, pr.x1, -26.7, P + 3.0, 0.12);
  slab(A, 'gate_steel', 30, P + 0.02, -20.5, 32.5, P + 0.06, -18.4);
  // --- south electrical room: switchboard, a dead panel open on its hinges
  const es = V.elecSouth;
  cabinets(A, es.x0 + 0.2, es.x1 - 0.2, es.z1, P, -1);
  cabinets(A, es.x0 + 0.2, es.x0 + 3.6, es.z0, P, 1);
  slab(A, 'cabinet_grey', es.x1 - 0.7, P, es.z0 + 1.0, es.x1 - 0.2, P + 2.0, es.z0 + 3.4, { collide: 'metal' });
  boxAt(A, 'cabinet_grey', es.x1 - 1.1, P + 1.0, es.z0 + 3.9, 0.04, 1.8, 0.8, 0.9);
  prop(A, 'mp_cabledrum', es.x0 + 6, P, es.z0 + 3.0, 1.3);
  // --- staff room: lockers, a table and chairs, a kettle nobody cleaned
  const sr = V.staffRoom;
  prop(A, 'mp_lockers', sr.x0 + 1.0, P, sr.z1 - 0.3, Math.PI);
  prop(A, 'mp_lockers', sr.x0 + 2.3, P, sr.z1 - 0.3, Math.PI);
  prop(A, 'mp_lockers', sr.x1 - 0.3, P, sr.z0 + 3.0, -Math.PI / 2);
  prop(A, 'mp_table', sr.x0 + 5, P, sr.z0 + 3.4, 0.1);
  for (const [cx, cz, ry] of [[-0.7, -0.7, 0.2], [0.8, -0.7, -0.1], [0, 0.8, 3.0]]) A.put('mp_plastic_chair', sr.x0 + 5 + cx, P, sr.z0 + 3.4 + cz, ry);
  slab(A, 'laminate', sr.x0 + 0.2, P, sr.z0 + 0.2, sr.x0 + 3.6, P + 0.9, sr.z0 + 0.8, { collide: 'wood' });
  cylAt(A, 'steel', sr.x0 + 1.0, P + 0.9, sr.z0 + 0.5, 0.09, 0.22);
  // --- store room: racking of crates and drums, wet floor from the leak
  const st = V.storeRoom;
  for (const z of [st.z0 + 1.3, st.z0 + 4.2]) {
    for (let k = 0; k < 3; k++) {
      const x = st.x0 + 1.5 + k * 3.0;
      shelving(A, x, P, z);
    }
  }
  prop(A, 'mp_drum', st.x1 - 0.8, P, st.z1 - 0.8);
  prop(A, 'mp_drum', st.x1 - 1.5, P, st.z1 - 0.7);
  prop(A, 'mp_bottles', st.x1 - 0.5, P, st.z0 + 1.2, -Math.PI / 2);
  // --- side room off the west tunnel: a workbench, lockers, a trolley
  const sd = V.sideRoom;
  slab(A, 'wood_bench', sd.x0 + 0.3, Y.track, sd.z1 - 1.0, sd.x0 + 4.0, Y.track + 0.9, sd.z1 - 0.3, { collide: 'wood' });
  prop(A, 'mp_lockers', sd.x1 - 0.3, Y.track, sd.z0 + 2.2, -Math.PI / 2);
  prop(A, 'mp_generator', sd.x0 + 5.8, Y.track, sd.z1 - 1.0, 0);
  prop(A, 'mp_cabledrum', sd.x0 + 1.2, Y.track, sd.z0 + 2.4, 0.4);
  // corridor clutter (kept against the walls)
  prop(A, 'mp_drum', -14.8, P, 10.9);
  prop(A, 'mp_crate', 12, P, 10.95, 0);
  prop(A, 'mp_bottles', 35.5, P, -16.9, Math.PI);
  prop(A, 'mp_crate', -8.5, P, -16.8, 0);
}

function shelving(A, x, y, z) {
  for (const s of [-1.2, 1.2]) for (const t of [-0.4, 0.4]) slab(A, 'gate_steel', x + s - 0.03, y, z + t - 0.03, x + s + 0.03, y + 2.2, z + t + 0.03);
  for (const h of [0.1, 1.0, 1.9]) slab(A, 'gate_steel', x - 1.25, y + h, z - 0.45, x + 1.25, y + h + 0.04, z + 0.45);
  A.put('mp_crate', x - 0.55, y + 1.04, z, 0, 0.8);
  A.put('mp_crate', x + 0.6, y + 0.14, z, 0.1, 0.85);
  A.put('mp_drum', x + 0.7, y + 1.04, z, 0, 0.9);
  A.box('metal', x, y + 1.1, z, 2.5, 2.2, 0.9);
}

// =============================================================== tunnels ==

function tunnelsDress(A, rng) {
  // the east tunnel: a maintenance trolley on track 2, sandbag lip near the ramp
  trolley(A, 54, Y.track, -0.1);
  prop(A, 'mp_sandbags', 70.6, Y.track, 0.9, 0);
  prop(A, 'mp_sandbags', 78.0, Y.track, 0.9, 0);
  prop(A, 'mp_crate', 81.5, Y.track, -1.0, 0.3);
  prop(A, 'mp_cabledrum', 44.5, Y.track, 0.4, 1.2);
  // the bulkhead at the end: a steel door that has not opened since the 90s
  slab(A, 'gate_steel', 83.7, Y.track, -6.5, 84, Y.track + 3.2, -3.5);
  slab(A, 'edge_yellow', 83.68, Y.track + 3.2, -6.6, 83.72, Y.track + 3.4, -3.4);
  // deep tunnel: crates stacked on the dry side, a pump hose
  prop(A, 'mp_crate', 36, D, 24.3, 0.1);
  prop(A, 'mp_crate', 37.3, D, 24.3, -0.1);
  prop(A, 'mp_crate', 36.6, D + 0.66, 24.3, 0.05, 0.95);
  prop(A, 'mp_drum', 44, D, 21.5);
  prop(A, 'mp_crate', 62, D, 21.5, 1.57);
  prop(A, 'mp_sandbags', 60.0, D, 23.0, 0.1);
  // ramp: a handrail on the east side
  for (let z = 3; z <= 20; z += 2.5) cylAt(A, 'edge_yellow', 75.7, D + 4 * (1 - (z - 2) / 19), z, 0.025, 1.0);
}

// ============================================================== facility ==

function facility(A, rng) {
  const f = V.facility;
  // blast door: the leaf rolled into its pocket on the west side, a massive frame
  slab(A, 'gate_steel', 47.6, D, 28.6, 50, D + 3.0, 29.0, { collide: 'metal' });
  slab(A, 'edge_yellow', 49.9, D, 28.5, 50.05, D + 3.0, 29.05);
  slab(A, 'edge_yellow', 53.95, D, 28.5, 54.1, D + 3.0, 29.05);
  // sandbagged positions inside both doors (chokepoints)
  prop(A, 'mp_sandbags', 49.5, D, 31.4, 0);
  prop(A, 'mp_sandbags', 54.8, D, 31.4, 0);
  prop(A, 'mp_sandbags', 66.2, D, 31.0, 0.2);
  prop(A, 'mp_sandbags', 71.4, D, 31.2, -0.15);
  // the comms dais and console
  const d = CF.dais;
  slab(A, 'gate_steel', d.x0, D, d.z0, d.x1, D + d.h, d.z1, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  slab(A, 'edge_yellow', d.x0, D + d.h, d.z0, d.x1, D + d.h + 0.004, d.z0 + 0.12);
  for (const x of [d.x0 + 1.5, d.x1 - 1.5]) {
    // two steps up at the front (0.225 each)
    slab(A, 'gate_steel', x - 0.8, D, d.z0 - 0.6, x + 0.8, D + 0.225, d.z0, { collide: 'metal' });
  }
  const c = CF.console;
  const y = D + d.h;
  slab(A, 'cabinet_grey', c.x - 2.4, y, c.z - 0.5, c.x + 2.4, y + 0.95, c.z + 0.5, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  boxAt(A, 'metal_dark', c.x, y + 1.05, c.z + 0.1, 4.8, 0.08, 0.9, 0, { rx: -0.25 });
  for (let k = -1; k <= 1; k++) {
    boxAt(A, 'metal_dark', c.x + k * 1.5, y + 1.55, c.z + 0.4, 1.3, 0.8, 0.08);
    slab(A, 'screen_cf', c.x + k * 1.5 - 0.6, y + 1.2, c.z + 0.35, c.x + k * 1.5 + 0.6, y + 1.9, c.z + 0.355);
  }
  for (let k = 0; k < 12; k++) slab(A, 'led_amber', c.x - 2.2 + k * 0.38, y + 0.97, c.z - 0.3, c.x - 2.13 + k * 0.38, y + 0.99, c.z - 0.25);
  A.put('mp_chair', c.x - 0.8, y, c.z - 1.3, Math.PI + 0.3);
  A.put('mp_chair', c.x + 1.0, y, c.z - 1.2, Math.PI - 0.2);
  // rack rows in the east bay
  for (const rz of [33, 36.5, 40]) {
    for (let k = 0; k < 8; k++) {
      const rx = 64.5 + k * 0.64;
      A.put('mp_rack', rx, D, rz, 0);
      slab(A, 'led_amber', rx - 0.2, D + 1.7 - (k % 3) * 0.3, rz + 0.505, rx - 0.16, D + 1.73 - (k % 3) * 0.3, rz + 0.51);
    }
    A.box('metal', 64.5 + 3.5 * 0.64, D + 1.0, rz, 8 * 0.64, 2.0, 1.0);
  }
  // cable trays over the racks, bundles dropping to the console
  slab(A, 'gate_steel', 60, 5.2, 36, 76, 5.25, 37);
  slab(A, 'cable_black', 60, 5.25, 36.2, 76, 5.4, 36.8);
  slab(A, 'cable_black', 58.5, D, 44.3, 59.0, 5.3, 44.7);
  slab(A, 'cable_black', 59, D + 0.02, 37.5, 59.4, D + 0.14, 44.3);
  // the glass office in the north-west corner
  const o = CF.office;
  slab(A, 'blockwork', o.x0, D, o.z1 - 0.1, o.x1 - 2.6, D + 1.0, o.z1, { collide: 'concrete' });
  slab(A, 'blockwork', o.x1 - 0.1, D, o.z0, o.x1, D + 1.0, o.z1 - 3.0, { collide: 'concrete' });
  A.add('glazing', G.pane(A), trs(_m, (o.x0 + o.x1 - 2.6) / 2, D + 1.9, o.z1 - 0.05, 0, o.x1 - 2.6 - o.x0, 1.8, 1));
  A.add('glazing', G.pane(A), trs(_m, o.x1 - 0.05, D + 1.9, (o.z0 + o.z1 - 3.0) / 2, Math.PI / 2, o.z1 - 3.0 - o.z0, 1.8, 1));
  A.box('glass', (o.x0 + o.x1 - 2.6) / 2, D + 1.9, o.z1 - 0.05, o.x1 - 2.6 - o.x0, 1.8, 0.06);
  A.box('glass', o.x1 - 0.05, D + 1.9, (o.z0 + o.z1 - 3.0) / 2, 0.06, 1.8, o.z1 - 3.0 - o.z0);
  slab(A, 'gate_steel', o.x0, D + 2.8, o.z1 - 0.12, o.x1, D + 2.9, o.z1);
  slab(A, 'gate_steel', o.x1 - 0.12, D + 2.8, o.z0, o.x1, D + 2.9, o.z1);
  desk(A, 'laminate', o.x0 + 2.5, D, o.z0 + 1.4, 0);
  desk(A, 'laminate', o.x0 + 6.0, D, o.z0 + 1.4, 0);
  for (const dx of [2.5, 6.0]) {
    A.put('mp_monitor', o.x0 + dx, D + 0.76, o.z0 + 1.2, 0);
    slab(A, 'screen_cf', o.x0 + dx - 0.26, D + 0.76 + 0.14, o.z0 + 1.226, o.x0 + dx + 0.26, D + 0.76 + 0.46, o.z0 + 1.23);
    A.put('mp_chair', o.x0 + dx, D, o.z0 + 2.2, 0.2);
  }
  prop(A, 'mp_lockers', o.x0 + 0.3, D, o.z0 + 5.5, Math.PI / 2);
  // the map table in the middle of the floor
  slab(A, 'cabinet_olive', 53.5, D, 35.5, 58.5, D + 0.9, 38.5, { collide: 'metal' });
  slab(A, 'screen_cf', 53.7, D + 0.905, 35.7, 58.3, D + 0.91, 38.3);
  // the generator bay
  prop(A, 'mp_generator', CF.generator.x, D, CF.generator.z, Math.PI / 2);
  prop(A, 'mp_generator', CF.generator.x + 3.0, D, CF.generator.z, Math.PI / 2);
  prop(A, 'mp_drum', 76.8, D, 54.8);
  prop(A, 'mp_drum', 76.0, D, 55.1);
  prop(A, 'mp_drum', 77.2, D, 53.9);
  slab(A, 'cable_black', 58, D + 0.02, 49.6, CF.generator.x - 0.6, D + 0.12, 50.0);
  // crate stacks as cover through the floor
  for (const [x, z, ry, n] of [[42, 46, 0.1, 2], [45.5, 52, -0.2, 1], [64, 47, 0.4, 2], [48, 40.5, 0, 1], [70, 45, 0.1, 1], [38.5, 51, 0.3, 2]]) {
    prop(A, 'mp_crate', x, D, z, ry);
    if (n > 1) prop(A, 'mp_crate', x + 0.1, D + 0.66, z, ry + 0.2, 0.95);
  }
  // wall screens on the north wall
  for (let k = 0; k < 3; k++) {
    const sx = 57 + k * 3.6;
    slab(A, 'metal_dark', sx - 1.6, 2.6, f.z0, sx + 1.6, 4.6, f.z0 + 0.12);
    slab(A, 'screen_cf', sx - 1.5, 2.7, f.z0 + 0.121, sx + 1.5, 4.5, f.z0 + 0.13);
  }
  // exit shaft: a ladder up the wall, a grating landing, the hatch far above
  const sh = V.exitShaft;
  for (const lx of [sh.x1 - 0.5, sh.x1 - 1.1]) slab(A, 'gate_steel', lx - 0.03, D, 41.2, lx + 0.03, 13.5, 41.3);
  for (let ly = 0.3; ly < 13.5; ly += 0.3) slab(A, 'gate_steel', sh.x1 - 1.13, ly, 41.22, sh.x1 - 0.47, ly + 0.03, 41.28);
  slab(A, 'gate_steel', sh.x0, 12.8, sh.z0, sh.x1, 12.9, sh.z1);
  prop(A, 'mp_crate', sh.x0 + 1.0, D, sh.z0 + 1.0, 0.2);
}

// ================================================================ puddles ==

/** Standing water where the leaks are: dark mirror patches just over the floor. */
function puddles(A, rng) {
  const spots = [
    [-45, H, -24, 2.2, 1.4],
    [-33, H, -13.8, 1.3, 0.9],
    [6, P, -12.3, 2.4, 1.2],
    [26, P, 5.5, 3.0, 1.6],
    [-12, P, 9.8, 2.0, 1.0],
    [30, P, 10.4, 1.5, 0.8],
    [58, Y.track, -2.0, 3.5, 1.8],
    [-30, Y.track, -3.0, 2.5, 2.0],
    [74, 2.2, 14, 1.6, 2.5],
    [45, D, 22.6, 3.2, 1.6],
    [66, D, 23.6, 2.4, 1.2],
    [40, D, 44, 2.6, 1.8],
  ];
  for (const [x, y, z, w, d] of spots) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const px = x + rng.range(-w * 0.3, w * 0.3);
      const pz = z + rng.range(-d * 0.3, d * 0.3);
      const s = rng.range(0.5, 1.0);
      A.add('puddle', G.pane(A), trs(_m, px, y + 0.008 + i * 0.001, pz, rng.float() * 3, w * s, d * s, 1, -Math.PI / 2, 0));
    }
  }
}
