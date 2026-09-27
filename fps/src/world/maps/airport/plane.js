import * as THREE from 'three';
import { PLANE, BRIDGE } from './layout.js';
import { slab, rampX, rampZ, stairX, boxAt, G, part, merged, cylPart } from './kit.js';
import { rectMinus, paneMatrix } from './terminal.js';
import { trs, fillMasks } from '../../util.js';

/**
 * HOLDING PATTERN — Fine Air flight 612, the playable airliner, and the jet
 * bridge that reaches it.
 *
 * Parked alongside the terminal's south-east edge, nose east. Three ways in,
 * on three decks:
 *   BRIDGE  gate level -> rotunda -> door L1 into the front galley (fast)
 *   SLIDE   the deployed evacuation slide at the aft overwing door (safe)
 *   CARGO   belt loader -> aft hold -> floor hatch up into the aft galley (flank)
 *
 * The cabin is 2 + 2 either side of a 1.0 m aisle. Seat backs are 1.05 m micro
 * cover (fabric surface, so rounds go through them). No overhead bins below
 * 1.9 m. The cockpit is a hold with no cover of its own.
 *
 * Blockout first: every walkable surface and wall below has a collision proxy
 * built from the same numbers; the hull, wings and tail are visual only.
 */

const P = PLANE;
const _m = new THREE.Matrix4();

// ================================================================== hull ==

/** Section scale/offset along the fuselage: tail cone and nose taper. */
function section(x) {
  if (x < 14) {
    const t = Math.max(0, (x - P.x0) / (14 - P.x0));
    const s = 0.2 + 0.8 * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    // the belly sweeps up, the crown stays roughly level
    const cyo = (P.ry - 0.35) - P.ry * s - 0 * t;
    return { sy: s, sz: s, cyo: Math.max(0, cyo) };
  }
  if (x > 44) {
    const t = Math.min(1, (x - 44) / (P.x1 - 44));
    const s = Math.max(0.03, Math.sqrt(Math.max(0, 1 - t * t)));
    return { sy: s, sz: s, cyo: -0.55 * t * t };
  }
  return { sy: 1, sz: 1, cyo: 0 };
}

/** Superellipse ring point at angle th for a section. */
function ringPoint(th, sec, out) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const e = 2 / P.n;
  out[0] = P.rz * sec.sz * Math.sign(c) * Math.pow(Math.abs(c), e);
  out[1] = (s >= 0 ? P.ry : P.ryLow) * sec.sy * Math.sign(s) * Math.pow(Math.abs(s), e);
  return out;
}

/** Hull half-width at height y in the constant section (for placing things). */
export function hullHalfWidth(y) {
  const dy = y - P.cy;
  const r = dy >= 0 ? P.ry : P.ryLow;
  const k = Math.min(1, Math.abs(dy) / r);
  return P.rz * Math.pow(Math.max(0, 1 - Math.pow(k, P.n)), 1 / P.n);
}

/**
 * The fuselage skin as three index sets over one shared vertex grid (white
 * upper body, blue cheatline, grey belly), with the open doors cut out.
 */
function hullGeometries(cuts) {
  const xs = new Set();
  for (let x = P.x0; x <= 14; x += 0.4) xs.add(+x.toFixed(3));
  for (let x = 14; x <= 44; x += 0.6) xs.add(+x.toFixed(3));
  for (let x = 44; x <= P.x1; x += 0.3) xs.add(+x.toFixed(3));
  xs.add(P.x1);
  for (const c of cuts) {
    xs.add(c.x0);
    xs.add(c.x1);
  }
  const X = [...xs].sort((a, b) => a - b);
  const N = 64;
  const pos = [];
  const col = [];
  const pt = [0, 0];
  for (const x of X) {
    const sec = section(x);
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * Math.PI * 2;
      ringPoint(th, sec, pt);
      const y = P.cy + sec.cyo + pt[1];
      const z = P.fz + pt[0];
      pos.push(x, y, z);
      // grime toward the belly and the tail cone, a little wear everywhere
      const belly = Math.max(0, Math.min(1, (P.cy - 1.2 - y) / 1.5));
      col.push(0.08, 0.1 + belly * 0.45, belly * 0.3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  const all = [];
  const white = [];
  const blue = [];
  const grey = [];
  const W = N + 1;
  const p = g.getAttribute('position');
  for (let j = 0; j < X.length - 1; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * W + i;
      const b = (j + 1) * W + i;
      const c = (j + 1) * W + i + 1;
      const d = j * W + i + 1;
      const xc = (p.getX(a) + p.getX(c)) / 2;
      const yc = (p.getY(a) + p.getY(c)) / 2;
      const zc = (p.getZ(a) + p.getZ(c)) / 2;
      all.push(a, d, b, b, d, c);
      let cut = false;
      for (const k of cuts) {
        if (xc > k.x0 && xc < k.x1 && yc > k.y0 && yc < k.y1 && (zc - P.fz) * k.side > 0.5) cut = true;
      }
      if (cut) continue;
      const cy = P.cy + section(xc).cyo;
      const list = yc > cy - 0.28 ? white : yc > cy - 0.62 ? blue : grey;
      list.push(a, d, b, b, d, c);
    }
  }
  g.setIndex(all);
  g.computeVertexNormals();
  const make = (idx) => {
    const h = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) h.setAttribute(k, g.getAttribute(k));
    h.setIndex(idx);
    return h;
  };
  const out = { white: make(white), blue: make(blue), grey: make(grey) };
  return { out, dispose: () => g.dispose() };
}

/** Extrude a 2D outline (x, y) by depth along z, masks filled. */
function extrude(pts, depth) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  fillMasks(g, 0.15, 0.2, 0);
  return g;
}

// ============================================================ the airliner ==

export function buildPlane(A, rng) {
  const fz = P.fz;
  const zN = P.cabinZ0; // north (building side) inner cabin face
  const zS = P.cabinZ1; // south (apron side) inner cabin face
  const doorH = 1.95;

  // ---------------------------------------------------------------- skin --
  const cuts = [
    { x0: P.doorL1[0], x1: P.doorL1[1], y0: P.floorY - 0.05, y1: P.floorY + doorH, side: -1 },
    { x0: P.doorSlide[0], x1: P.doorSlide[1], y0: P.floorY - 0.05, y1: P.floorY + doorH, side: 1 },
    { x0: P.cargoDoor[0], x1: P.cargoDoor[1], y0: P.holdY - 0.1, y1: P.floorY - 0.2, side: 1 },
  ];
  const hull = hullGeometries(cuts);
  A.add('livery_white', hull.out.white);
  A.add('livery_blue', hull.out.blue);
  A.add('airframe_grey', hull.out.grey);
  hull.dispose();
  // door surrounds (cover the ring facets at the cut edges)
  for (const c of cuts) {
    const hw = hullHalfWidth((c.y0 + c.y1) / 2);
    const z = fz + c.side * (hw + 0.02);
    const zi = fz + c.side * (hw - 0.14);
    const z0 = Math.min(z, zi);
    const z1 = Math.max(z, zi);
    slab(A, 'airframe_grey', c.x0 - 0.12, c.y0, z0, c.x0, c.y1 + 0.1, z1);
    slab(A, 'airframe_grey', c.x1, c.y0, z0, c.x1 + 0.12, c.y1 + 0.1, z1);
    slab(A, 'airframe_grey', c.x0 - 0.12, c.y1, z0, c.x1 + 0.12, c.y1 + 0.14, z1);
    slab(A, 'airframe_grey', c.x0 - 0.12, c.y0 - 0.1, z0, c.x1 + 0.12, c.y0, z1);
  }
  // L1 door leaf, swung open forward against the hull
  const l1z = fz - hullHalfWidth(P.floorY + 1) - 0.12;
  slab(A, 'livery_white', P.doorL1[1] + 0.15, P.floorY, l1z - 0.12, P.doorL1[1] + 1.25, P.floorY + doorH, l1z);
  // cabin windows (outside: dark tinted, opaque — no tarmac-to-cabin crossfire)
  const winY = P.floorY + 0.95;
  const hwWin = hullHalfWidth(winY);
  for (let x = 11.9; x < 44; x += P.rowsMain.pitch) {
    for (const side of [-1, 1]) {
      const d = side < 0 ? P.doorL1 : P.doorSlide;
      if (x > d[0] - 0.3 && x < d[1] + 0.3) continue;
      boxAt(A, 'window_dark', x, winY, fz + side * (hwWin + 0.005), 0.26, 0.36, 0.05, 0, { geo: G.soft });
    }
  }
  // cockpit glazing
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = 48.3 + k * 0.55;
      const sec = section(x);
      const y = P.cy + sec.cyo + 0.55;
      const hw = P.rz * sec.sz * 0.93;
      boxAt(A, 'window_dark', x, y, fz + side * hw, 0.5, 0.42, 0.06, side * (0.35 + k * 0.28), { geo: G.soft });
    }
  }

  // --------------------------------------------------- tail, wings, engines --
  const crown = P.cy + P.ry - 0.35;
  const fin = extrude([[3.2, crown - 0.4], [12.2, crown - 0.4], [5.6, crown + 6.8], [2.7, crown + 6.8]], 0.36);
  fin.translate(0, 0, fz);
  A.add('livery_white', fin);
  fin.dispose();
  const finTop = extrude([[3.9, crown + 4.6], [7.8, crown + 4.6], [5.6, crown + 6.84], [2.7, crown + 6.84]], 0.4);
  finTop.translate(0, 0, fz);
  A.add('livery_red', finTop);
  finTop.dispose();
  for (const side of [-1, 1]) {
    const st = extrude([[4.6, 0], [8.8, 0], [4.4, 6.2], [2.6, 6.2]], 0.2);
    // shape y -> world z (outboard), extrusion -> world y
    st.applyMatrix4(trs(_m, 0, crown - 0.8, fz + side * 0.8, 0, 1, 1, 1, side * Math.PI / 2 - 0.06 * side));
    A.add('airframe_grey', st);
    st.dispose();
  }
  const w = P.wing;
  for (const side of [-1, 1]) {
    const root = hullHalfWidth(w.y + 0.2) - 0.25;
    const wing = extrude([[w.rootX0, 0], [w.rootX1, 0], [w.tipX1, w.span], [w.tipX0, w.span]], 0.42);
    wing.applyMatrix4(trs(_m, 0, w.y + 0.2, fz + side * root, 0, 1, 1, 1, side * Math.PI / 2 - side * w.dihedral));
    A.add('airframe_grey', wing);
    wing.dispose();
    // wing-body fairing
    boxAt(A, 'airframe_grey', (w.rootX0 + w.rootX1) / 2, w.y + 0.1, fz + side * (root - 0.2), w.rootX1 - w.rootX0 + 1, 0.9, 1.0, 0, { geo: G.soft });
    // engine: nacelle, intake lip, pylon, exhaust cone
    const ez = fz + side * 5.4;
    const ey = 1.8;
    const nac = cylPart(1.05, 4.2, 0, 0, 0, 20, 0, Math.PI / 2, 0.92);
    nac.applyMatrix4(trs(_m, 23.6, ey, ez));
    A.add('airframe_grey', nac);
    nac.dispose();
    const lip = cylPart(1.08, 0.3, 0, 0, 0, 20, 0, Math.PI / 2);
    lip.applyMatrix4(trs(_m, 25.75, ey, ez));
    A.add('steel', lip);
    lip.dispose();
    const fan = cylPart(0.95, 0.05, 0, 0, 0, 20, 0, Math.PI / 2);
    fan.applyMatrix4(trs(_m, 25.5, ey, ez));
    A.add('plastic_dark', fan);
    fan.dispose();
    boxAt(A, 'airframe_grey', 23.4, ey + 1.05, ez, 3.2, 0.9, 0.3, 0, { geo: G.soft });
    A.box('metal', 23.6, ey, ez, 4.2, 2.1, 2.1);
    // main gear: strut, two wheels
    const gz = fz + side * 2.1;
    slab(A, 'steel', 21.4, 0.5, gz - 0.12, 21.64, w.y + 0.2, gz + 0.12);
    for (const dx of [-0.55, 0.55]) {
      const wh = cylPart(0.55, 0.36, 0, 0, 0, 16, Math.PI / 2, 0);
      wh.applyMatrix4(trs(_m, 21.52 + dx, 0.55, gz));
      A.add('rubber', wh);
      wh.dispose();
    }
    A.box('rubber', 21.52, 0.9, gz, 2.3, 1.8, 0.6);
  }
  // nose gear
  slab(A, 'steel', 44.6, 0.4, fz - 0.1, 44.8, 2.2, fz + 0.1);
  for (const dz of [-0.28, 0.28]) {
    const wh = cylPart(0.42, 0.24, 0, 0, 0, 14, Math.PI / 2, 0);
    wh.applyMatrix4(trs(_m, 44.7, 0.42, fz + dz));
    A.add('rubber', wh);
    wh.dispose();
  }
  A.box('rubber', 44.7, 1.0, fz, 1.0, 2.0, 0.8);
  // belly: keeps walkers out from under the lower hull (crouch still fits
  // where the belly is highest)
  A.box('metal', (18.2 + 44) / 2, 2.55, fz, 44 - 18.2, 1.6, 2.6);

  // ---------------------------------------------------------- the cabin --
  const fy = P.floorY;
  const holes = [[P.hatch.x0, P.hatch.z0, P.hatch.x1 - P.hatch.x0, P.hatch.z1 - P.hatch.z0]];
  for (const [a, b, c, d] of rectMinus([P.aftBulkhead, zN, P.cockpitX, zS], holes)) {
    slab(A, 'carpet', a, fy - 0.15, b, c, fy, d, { collide: 'fabric' });
  }
  // aisle runner and floor-path strips
  slab(A, 'upholstery', P.hatch.x1 + 0.2, fy, fz - 0.45, P.cockpitX - 0.1, fy + 0.004, fz + 0.45);
  slab(A, 'steel', P.hatch.x1 + 0.2, fy, fz - 0.52, P.cockpitX - 0.1, fy + 0.008, fz - 0.49);
  slab(A, 'steel', P.hatch.x1 + 0.2, fy, fz + 0.49, P.cockpitX - 0.1, fy + 0.008, fz + 0.52);
  // door sills that bridge the lining to the hull
  slab(A, 'steel', P.doorL1[0], fy - 0.15, zN - 0.75, P.doorL1[1], fy, zN, { collide: 'metal' });
  slab(A, 'steel', P.doorSlide[0], fy - 0.15, zS, P.doorSlide[1], fy, zS + 0.7, { collide: 'metal' });

  // sidewalls: collision full height, with the two open doors
  const wallT = 0.35;
  const sideRuns = (d) => [
    [P.aftBulkhead, d[0]],
    [d[1], P.cockpitX],
  ];
  for (const [a, b] of sideRuns(P.doorL1)) {
    A.box('plaster', (a + b) / 2, fy + 1.5, zN - wallT / 2, b - a, 3.0, wallT);
  }
  for (const [a, b] of sideRuns(P.doorSlide)) {
    A.box('plaster', (a + b) / 2, fy + 1.5, zS + wallT / 2, b - a, 3.0, wallT);
  }
  for (const d of [P.doorL1, P.doorSlide]) {
    const zz = d === P.doorL1 ? zN - wallT / 2 : zS + wallT / 2;
    A.box('plaster', (d[0] + d[1]) / 2, fy + doorH + 0.6, zz, d[1] - d[0], 1.2, wallT);
  }
  // aft bulkhead
  A.box('plaster', P.aftBulkhead - 0.1, fy + 1.5, fz, 0.2, 3.0, zS - zN + 0.8);

  // lining: lower sidewall, window reveals, bins, ceiling
  const binY = fy + 1.9;
  const ceilY = fy + 2.3;
  for (const [zi, sgn, door] of [
    [zN, -1, P.doorL1],
    [zS, 1, P.doorSlide],
  ]) {
    for (const [a, b] of sideRuns(door)) {
      const z0 = sgn < 0 ? zi - 0.05 : zi;
      const z1 = sgn < 0 ? zi : zi + 0.05;
      slab(A, 'plastic_light', a, fy, z0, b, binY, z1, { masks: [0.1, 0.2, 0.1] });
      // dado and kick strip
      slab(A, 'plastic_dark', a, fy, zi - 0.03 * sgn - 0.02, b, fy + 0.12, zi - 0.03 * sgn + 0.02);
    }
    // over the door: the header panel
    slab(A, 'plastic_light', door[0], fy + doorH, Math.min(zi, zi + sgn * 0.05), door[1], binY, Math.max(zi, zi + sgn * 0.05));
    // overhead bins: a continuous run, lip at 1.9 m, curved door face
    const zb0 = sgn < 0 ? zi : zi - 0.62;
    const zb1 = sgn < 0 ? zi + 0.62 : zi;
    slab(A, 'plastic_light', P.hatch.x1 + 0.8, binY, zb0, P.cockpitX - 1.2, ceilY, zb1, { geo: G.soft, masks: [0.15, 0.1, 0.25] });
    slab(A, 'plastic_dark', P.hatch.x1 + 0.8, binY - 0.03, sgn < 0 ? zb1 - 0.04 : zb0, P.cockpitX - 1.2, binY + 0.04, sgn < 0 ? zb1 : zb0 + 0.04);
    // window light: an emissive pane in each reveal, one per row
    for (let x = 11.9; x < 44; x += P.rowsMain.pitch) {
      if (x > door[0] - 0.3 && x < door[1] + 0.3) continue;
      const zw = zi - sgn * 0.055;
      A.add('cabin_window', G.pane(A), paneMatrix(x, winY, zw, 0.24, 0.34, sgn < 0 ? 0 : Math.PI));
    }
  }
  // ceiling panel with a central light cove
  slab(A, 'plastic_light', P.aftBulkhead, ceilY, zN + 0.6, P.cockpitX, ceilY + 0.06, zS - 0.6);
  slab(A, 'light_strip', P.hatch.x1 + 0.8, ceilY - 0.02, zN + 0.62, P.cockpitX - 1.2, ceilY, zN + 0.7);
  slab(A, 'light_strip', P.hatch.x1 + 0.8, ceilY - 0.02, zS - 0.7, P.cockpitX - 1.2, ceilY, zS - 0.62);
  for (let x = 12; x < 44; x += 2.4) slab(A, 'plastic_dark', x, ceilY - 0.01, fz - 0.4, x + 0.5, ceilY, fz - 0.1);

  // ------------------------------------------------------------ seating --
  registerSeatProtos(A);
  const rows = [...P.rowsAft];
  for (let x = P.rowsMain.from; x <= P.rowsMain.to + 1e-6; x += P.rowsMain.pitch) rows.push(x);
  const pairN = fz - P.aisle / 2 - 0.55;
  const pairS = fz + P.aisle / 2 + 0.55;
  for (const x of rows) {
    for (const z of [pairN, pairS]) {
      A.put('cseat_frame', x, fy, z, 0);
      A.put('cseat_pad', x, fy, z, 0);
      A.box('fabric', x - 0.06, fy + 0.52, z, 0.62, 1.04, 1.04);
    }
  }
  // forward cabin: two rows of wider seats
  for (const x of [40.5, 41.7]) {
    for (const z of [fz - P.aisle / 2 - 0.62, fz + P.aisle / 2 + 0.62]) {
      A.putS('cseat_frame', x, fy, z, 0, 1.15, 1.05, 1.18);
      A.putS('cseat_pad', x, fy, z, 0, 1.15, 1.05, 1.18);
      A.box('fabric', x - 0.08, fy + 0.55, z, 0.72, 1.1, 1.22);
    }
  }

  // ---------------------------------------------------- galleys and lavs --
  // aft galley: carts and ovens against the bulkhead
  slab(A, 'steel', P.aftBulkhead, fy, zN, P.aftBulkhead + 0.6, fy + 1.0, zS, { collide: 'metal', masks: [0.5, 0.3, 0.2] });
  slab(A, 'steel', P.aftBulkhead, fy + 1.45, zN, P.aftBulkhead + 0.45, fy + 2.2, zS, { masks: [0.4, 0.3, 0.2] });
  for (let z = zN + 0.3; z < zS - 0.2; z += 0.42) slab(A, 'plastic_dark', P.aftBulkhead + 0.58, fy + 0.08, z, P.aftBulkhead + 0.62, fy + 0.95, z + 0.36);
  // aft lavatories either side of the hatch
  for (const [z0, z1] of [
    [zN, fz - 1.15],
    [fz + 1.15, zS],
  ]) {
    slab(A, 'plastic_light', P.aftBulkhead + 0.6, fy, z0, 11.9, ceilY, z1, { collide: 'plaster', masks: [0.2, 0.3, 0.2] });
    slab(A, 'plastic_dark', 11.88, fy + 0.1, (z0 + z1) / 2 - 0.3, 11.92, fy + 1.9, (z0 + z1) / 2 + 0.3);
  }
  // front galley: units on the forward wall, leaving a passage down the middle
  const fg = P.frontGalley;
  for (const [z0, z1] of [
    [zN, fz - 0.7],
    [fz + 0.7, zS],
  ]) {
    slab(A, 'steel', fg[1] - 0.6, fy, z0, fg[1], fy + 1.0, z1, { collide: 'metal', masks: [0.5, 0.3, 0.2] });
    slab(A, 'steel', fg[1] - 0.45, fy + 1.45, z0, fg[1], ceilY, z1, { masks: [0.4, 0.3, 0.2] });
    slab(A, 'plastic_dark', fg[1] - 0.62, fy + 0.08, z0 + 0.1, fg[1] - 0.58, fy + 0.95, z1 - 0.1);
  }
  // R1 (sealed) door outline on the apron side
  slab(A, 'plastic_dark', P.doorL1[0], fy + 0.02, zS - 0.02, P.doorL1[1], fy + doorH, zS + 0.005);
  slab(A, 'livery_red', (P.doorL1[0] + P.doorL1[1]) / 2 - 0.25, fy + 1.0, zS - 0.03, (P.doorL1[0] + P.doorL1[1]) / 2 + 0.25, fy + 1.1, zS - 0.02);
  // forward lavs / closets, then the cockpit bulkhead with its door
  for (const [z0, z1] of [
    [zN, fz - 0.6],
    [fz + 0.6, zS],
  ]) {
    slab(A, 'plastic_light', 43.0, fy, z0, P.cockpitX, ceilY, z1, { collide: 'plaster', masks: [0.2, 0.3, 0.2] });
  }
  slab(A, 'plastic_light', P.cockpitX - 0.1, fy, zN, P.cockpitX + 0.1, ceilY, fz - 0.55, { collide: 'plaster' });
  slab(A, 'plastic_light', P.cockpitX - 0.1, fy, fz + 0.55, P.cockpitX + 0.1, ceilY, zS, { collide: 'plaster' });
  slab(A, 'plastic_light', P.cockpitX - 0.1, fy + 2.0, fz - 0.55, P.cockpitX + 0.1, ceilY, fz + 0.55);
  // the cockpit door, jammed open against the bulkhead
  slab(A, 'plastic_dark', P.cockpitX + 0.12, fy, fz + 0.52, P.cockpitX + 0.92, fy + 1.98, fz + 0.56);

  // ------------------------------------------------------------ cockpit --
  const cz0 = fz - 1.55;
  const cz1 = fz + 1.55;
  slab(A, 'carpet', P.cockpitX, fy - 0.15, cz0, P.noseWallX, fy, cz1, { collide: 'fabric' });
  A.box('plaster', (P.cockpitX + P.noseWallX) / 2, fy + 1.5, cz0 - 0.15, P.noseWallX - P.cockpitX, 3, 0.3);
  A.box('plaster', (P.cockpitX + P.noseWallX) / 2, fy + 1.5, cz1 + 0.15, P.noseWallX - P.cockpitX, 3, 0.3);
  A.box('plaster', P.noseWallX + 0.15, fy + 1.5, fz, 0.3, 3, cz1 - cz0 + 0.6);
  slab(A, 'plastic_dark', P.cockpitX, fy, cz0 - 0.05, P.noseWallX, ceilY - 0.2, cz0);
  slab(A, 'plastic_dark', P.cockpitX, fy, cz1, P.noseWallX, ceilY - 0.2, cz1 + 0.05);
  slab(A, 'plastic_dark', P.cockpitX, ceilY - 0.25, cz0, P.noseWallX + 0.3, ceilY - 0.15, cz1);
  // instrument panel, glareshield, pedestal, overhead panel
  slab(A, 'plastic_dark', 48.7, fy, cz0 + 0.1, P.noseWallX, fy + 1.1, cz1 - 0.1, { collide: 'metal', masks: [0.3, 0.3, 0.3] });
  slab(A, 'plastic_dark', 48.5, fy + 1.1, cz0 + 0.2, 49.3, fy + 1.22, cz1 - 0.2);
  for (const z of [fz - 0.75, fz + 0.75]) {
    for (let k = 0; k < 2; k++) boxAt(A, 'screen', 48.69, fy + 0.8, z - 0.2 + k * 0.4, 0.02, 0.26, 0.3);
  }
  slab(A, 'plastic_dark', 47.2, fy, fz - 0.22, 48.7, fy + 0.72, fz + 0.22, { collide: 'metal' });
  slab(A, 'plastic_dark', 46.2, ceilY - 0.45, fz - 0.6, 48.6, ceilY - 0.25, fz + 0.6);
  // windscreen light (the view out is the brightest thing in the cabin shot)
  A.add('cabin_window', G.pane(A), paneMatrix(49.55, fy + 1.55, fz - 0.62, 0.9, 0.5, -Math.PI / 2 + 0.25));
  A.add('cabin_window', G.pane(A), paneMatrix(49.55, fy + 1.55, fz + 0.62, 0.9, 0.5, -Math.PI / 2 - 0.25));
  // two pilot seats
  for (const z of [fz - 0.75, fz + 0.75]) {
    A.putS('cseat_frame', 47.6, fy, z, 0, 0.62, 1.1, 1.1);
    A.putS('cseat_pad', 47.6, fy, z, 0, 0.62, 1.1, 1.1);
  }

  // --------------------------------------------------- hold and hatch --
  const H = P.hold;
  const hz0 = fz - 1.3;
  const hz1 = fz + 1.3;
  slab(A, 'alu', H.x0, P.holdY - 0.15, hz0, H.x1, P.holdY, hz1, { collide: 'metal', masks: [0.4, 0.4, 0.3] });
  // roller tracks
  for (let z = hz0 + 0.4; z < hz1 - 0.2; z += 0.6) slab(A, 'steel', H.x0, P.holdY, z, H.x1, P.holdY + 0.03, z + 0.05);
  // hold walls (north, south with the cargo door, ends)
  slab(A, 'alu', H.x0, P.holdY, hz0 - 0.1, H.x1, fy - 0.15, hz0, { collide: 'metal' });
  for (const [a, b] of [
    [H.x0, P.cargoDoor[0]],
    [P.cargoDoor[1], H.x1],
  ]) {
    slab(A, 'alu', a, P.holdY, hz1, b, fy - 0.15, hz1 + 0.1, { collide: 'metal' });
  }
  slab(A, 'alu', H.x0 - 0.1, P.holdY, hz0, H.x0, fy - 0.15, hz1, { collide: 'metal' });
  slab(A, 'alu', H.x1, P.holdY, hz0, H.x1 + 0.1, fy - 0.15, hz1, { collide: 'metal' });
  // cargo door sill out to the hull line
  slab(A, 'steel', P.cargoDoor[0], P.holdY - 0.15, hz1, P.cargoDoor[1], P.holdY, fz + hullHalfWidth(P.holdY) + 0.3, { collide: 'metal' });
  // hold ceiling (the cabin floor's underside), netted cargo wall, ULD cans
  slab(A, 'alu_dark', H.x0, fy - 0.2, hz0, H.x1, fy - 0.15, hz1);
  slab(A, 'plastic_dark', 16.9, P.holdY, hz0, 17.0, fy - 0.2, hz1, { collide: 'fabric' });
  for (const [x, z] of [
    [14.2, hz0 + 0.55],
    [15.6, hz0 + 0.55],
    [15.6, hz1 - 0.55],
  ]) {
    slab(A, 'alu', x - 0.6, P.holdY, z - 0.5, x + 0.6, P.holdY + 1.05, z + 0.5, { collide: 'metal', masks: [0.5, 0.5, 0.3] });
  }
  // the hatch: a stair of five treads climbing east under the opening
  stairX(A, 'steel', (P.hatch.z0 + P.hatch.z1) / 2, P.hatch.z1 - P.hatch.z0 - 0.02, P.hatch.x0 + 0.1, P.holdY, 5, (fy - P.holdY) / 5, 0.36, 1);
  // hatch lid, thrown open against the aisle
  boxAt(A, 'alu', P.hatch.x0 + 0.95, fy + 0.5, P.hatch.z0 - 0.08, 1.0, 1.0, 0.05, 0, { rx: 0.1 });
  slab(A, 'livery_red', P.hatch.x0 - 0.04, fy, P.hatch.z0 - 0.04, P.hatch.x1 + 0.04, fy + 0.01, P.hatch.z0);
  slab(A, 'livery_red', P.hatch.x0 - 0.04, fy, P.hatch.z1, P.hatch.x1 + 0.04, fy + 0.01, P.hatch.z1 + 0.04);

  // ------------------------------------------------------------- slide --
  const sx = (P.doorSlide[0] + P.doorSlide[1]) / 2;
  const sTop = zS + 0.2;
  const sBot = sTop + 7.2;
  rampZ(A, 'slide_yellow', sx, 1.5, sTop, fy, sBot, 0.02, 0.3, { collide: 'rubber', masks: [0.2, 0.3, 0.1] });
  for (const side of [-1, 1]) {
    rampZ(A, 'slide_yellow', sx + side * 0.85, 0.36, sTop, fy + 0.45, sBot, 0.4, 0.36, { collide: false, geo: G.soft });
  }
  // the inflated head arch round the door
  slab(A, 'slide_yellow', sx - 1.05, fy - 0.2, sTop - 0.1, sx + 1.05, fy + 0.35, sTop + 0.6, { geo: G.soft });
  slab(A, 'slide_yellow', sx - 1.0, 0, sBot - 0.3, sx + 1.0, 0.35, sBot + 0.3, { geo: G.soft, collide: 'rubber' });

  // ------------------------------------------------------- belt loader --
  const bx = (P.cargoDoor[0] + P.cargoDoor[1]) / 2;
  const bTop = fz + hullHalfWidth(P.holdY) + 0.25;
  const bBot = bTop + 6.8;
  rampZ(A, 'rubber', bx, 1.1, bTop, P.holdY + 0.02, bBot, 0.35, 0.25, { collide: 'rubber' });
  for (const side of [-1, 1]) {
    rampZ(A, 'gse_yellow', bx + side * 0.62, 0.12, bTop, P.holdY + 0.25, bBot, 0.6, 0.35, { collide: 'metal' });
    rampZ(A, 'steel', bx + side * 0.62, 0.05, bTop + 0.3, P.holdY + 1.0, bBot, 1.2, 0.05, { collide: false });
  }
  // chassis and cab
  slab(A, 'gse_yellow', bx - 0.9, 0.35, bBot - 3.6, bx + 0.9, 1.0, bBot + 0.4, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  slab(A, 'gse_white', bx + 0.95, 0.35, bBot - 2.2, bx + 2.0, 2.1, bBot - 0.4, { collide: 'metal', masks: [0.4, 0.5, 0.3] });
  slab(A, 'window_dark', bx + 1.2, 1.35, bBot - 2.25, bx + 1.95, 1.95, bBot - 2.18);
  for (const dz of [-3.1, 0]) {
    for (const s2 of [-1, 1]) {
      const wh = cylPart(0.34, 0.24, 0, 0, 0, 12, 0, Math.PI / 2);
      wh.applyMatrix4(trs(_m, bx + s2 * 0.95, 0.34, bBot + dz));
      A.add('rubber', wh);
      wh.dispose();
    }
  }

  // ------------------------------------------------------------- lights --
  for (const x of [13.2, 22.0, 30.5, 38.0]) A.interiorLights.push({ x, y: ceilY - 0.2, z: fz });
  A.interiorLights.push({ x: 47.4, y: ceilY - 0.3, z: fz });
  A.interiorLights.push({ x: 13.5, y: fy - 0.5, z: fz });
  void rng;
}

/** The seat pair prototypes: frame (shell, legs, armrests) and cushions. */
function registerSeatProtos(A) {
  if (A.has('cseat_frame')) return;
  // local frame: seat faces +x, pair centred on z, floor at y = 0
  const fr = [];
  const pad = [];
  for (const dz of [-0.26, 0.26]) {
    fr.push(part(0.08, 0.95, 0.5, -0.29, 0.62, dz, 0, 0, 0.12, [0.3, 0.2, 0.1])); // back shell
    pad.push(part(0.12, 0.62, 0.46, -0.21, 0.78, dz, 0, 0, 0.12, [0.1, 0.3, 0.1])); // back cushion
    pad.push(part(0.46, 0.12, 0.46, 0.0, 0.46, dz, 0, 0, 0.04, [0.1, 0.25, 0.1])); // seat cushion
    fr.push(part(0.12, 0.22, 0.46, -0.33, 1.06, dz, 0, 0, 0.12, [0.2, 0.2, 0.1])); // headrest cap
  }
  for (const dz of [-0.52, 0, 0.52]) fr.push(part(0.48, 0.06, 0.05, 0.0, 0.66, dz, 0, 0, 0, [0.5, 0.3, 0.1])); // armrests
  fr.push(part(0.5, 0.08, 1.02, 0.0, 0.37, 0, 0, 0, 0, [0.4, 0.3, 0.2])); // pan beam
  for (const dz of [-0.4, 0.4]) {
    fr.push(part(0.05, 0.36, 0.05, 0.14, 0.18, dz, 0, 0, 0.15, [0.6, 0.4, 0.3]));
    fr.push(part(0.05, 0.36, 0.05, -0.18, 0.18, dz, 0, 0, -0.15, [0.6, 0.4, 0.3]));
  }
  A.proto('cseat_frame', { geo: merged(fr), key: 'plastic_light' });
  A.proto('cseat_pad', { geo: merged(pad), key: 'upholstery' });
}

// ============================================================ jet bridge ==

export function buildBridge(A) {
  const B = BRIDGE;
  const w = B.inner;
  const h = B.wallH;
  const t = 0.12;
  // --- segment 1: from the gate door, east, rising to the rotunda
  const s1 = B.seg1;
  rampX(A, 'carpet', s1.z, w + 2 * t, s1.x0, s1.y0 + 0.005, s1.x1, s1.y1, 0.3, { collide: 'fabric' });
  for (const side of [-1, 1]) {
    const zc = s1.z + side * (w / 2 + t / 2);
    tubeWallX(A, zc, s1.x0 + 0.25, s1.y0, s1.x1, s1.y1, h, t);
  }
  rampX(A, 'alu', s1.z, w + 2 * t + 0.1, s1.x0 + 0.25, s1.y0 + h + 0.15, s1.x1, s1.y1 + h + 0.15, 0.15, { collide: false });
  // --- rotunda: a drum on a column
  const R = B.rot;
  slab(A, 'carpet', R.x - R.r, R.y - 0.3, R.z - R.r, R.x + R.r, R.y, R.z + R.r, { collide: 'fabric' });
  slab(A, 'alu', R.x - R.r - 0.1, R.y, R.z - R.r - 0.1, R.x + R.r + 0.1, R.y + h + 0.3, R.z - R.r + 0.02, { collide: 'metal' }); // north
  slab(A, 'alu', R.x + R.r - 0.02, R.y, R.z - R.r, R.x + R.r + 0.1, R.y + h + 0.3, R.z + R.r, { collide: 'metal' }); // east
  slab(A, 'alu', R.x - R.r - 0.1, R.y, R.z + R.r - 0.02, R.x - w / 2, R.y + h + 0.3, R.z + R.r + 0.1, { collide: 'metal' }); // south-west stub
  slab(A, 'alu', R.x + w / 2, R.y, R.z + R.r - 0.02, R.x + R.r + 0.1, R.y + h + 0.3, R.z + R.r + 0.1, { collide: 'metal' }); // south-east stub
  slab(A, 'alu', R.x - R.r - 0.1, R.y + h, R.z - w / 2, R.x - R.r + 0.02, R.y + h + 0.3, R.z + w / 2); // west lintel
  slab(A, 'alu', R.x - R.r - 0.1, R.y + h + 0.3, R.z - R.r - 0.1, R.x + R.r + 0.1, R.y + h + 0.45, R.z + R.r + 0.1);
  slab(A, 'alu_dark', R.x - 0.35, 0, R.z - 0.35, R.x + 0.35, R.y - 0.3, R.z + 0.35, { collide: 'metal' });
  // --- segment 2: south to the aircraft, rising to the sill
  const s2 = B.seg2;
  rampZ(A, 'carpet', s2.x, w + 2 * t, s2.z0, s2.y0 + 0.005, s2.z1, s2.y1, 0.3, { collide: 'fabric' });
  for (const side of [-1, 1]) {
    const xc = s2.x + side * (w / 2 + t / 2);
    tubeWallZ(A, xc, s2.z0, s2.y0, s2.z1, s2.y1, h, t);
  }
  rampZ(A, 'alu', s2.x, w + 2 * t + 0.1, s2.z0, s2.y0 + h + 0.15, s2.z1, s2.y1 + h + 0.15, 0.15, { collide: false });
  // --- the cab: flat floor into the door, bellows against the hull
  const cabZ1 = P.cabinZ0 - 0.2;
  slab(A, 'carpet', s2.x - w / 2 - t, s2.y1 - 0.3, s2.z1, s2.x + w / 2 + t, s2.y1, cabZ1, { collide: 'fabric' });
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? s2.x - w / 2 - t : s2.x + w / 2;
    slab(A, 'alu', x0, s2.y1, s2.z1, x0 + t, s2.y1 + h, cabZ1 - 0.6, { collide: 'metal' });
    slab(A, 'plastic_dark', x0 - 0.05 * side, s2.y1, cabZ1 - 0.6, x0 + t + 0.05 * side, s2.y1 + h, cabZ1 - 0.05, { collide: 'fabric', geo: G.soft });
  }
  slab(A, 'alu', s2.x - w / 2 - t, s2.y1 + h, s2.z1, s2.x + w / 2 + t, s2.y1 + h + 0.3, cabZ1 - 0.05);
  // drive column and bogie
  const dz = s2.z0 + (s2.z1 - s2.z0) * 0.72;
  const dy = s2.y0 + (s2.y1 - s2.y0) * 0.72 - 0.3;
  for (const side of [-1, 1]) {
    slab(A, 'alu_dark', s2.x + side * 0.7 - 0.12, 0.5, dz - 0.12, s2.x + side * 0.7 + 0.12, dy, dz + 0.12, { collide: 'metal' });
  }
  slab(A, 'gse_yellow', s2.x - 1.1, 0.3, dz - 0.45, s2.x + 1.1, 0.75, dz + 0.45, { collide: 'metal', masks: [0.5, 0.5, 0.3] });
  for (const side of [-1, 1]) {
    const wh = cylPart(0.32, 0.3, 0, 0, 0, 12, Math.PI / 2, 0);
    wh.applyMatrix4(trs(_m, s2.x + side * 0.8, 0.32, dz));
    A.add('rubber', wh);
    wh.dispose();
  }
  // lights inside the tube
  A.interiorLights.push({ x: (s1.x0 + s1.x1) / 2, y: 2.9, z: s1.z });
  A.interiorLights.push({ x: s2.x, y: s2.y1 + 1.9, z: (s2.z0 + s2.z1) / 2 + 3 });
}

/** A bridge wall along x following the floor slope: solid dado, glass band, solid head. */
function tubeWallX(A, zc, xA, yA, xB, yB, h, t) {
  rampX(A, 'alu', zc, t, xA, yA + 1.0, xB, yB + 1.0, 1.0, { collide: 'metal' });
  rampX(A, 'window_dark', zc, t * 0.5, xA, yA + 2.05, xB, yB + 2.05, 1.05, { collide: 'glass' });
  rampX(A, 'alu', zc, t, xA, yA + h, xB, yB + h, h - 2.05, { collide: 'metal' });
}

function tubeWallZ(A, xc, zA, yA, zB, yB, h, t) {
  rampZ(A, 'alu', xc, t, zA, yA + 1.0, zB, yB + 1.0, 1.0, { collide: 'metal' });
  rampZ(A, 'window_dark', xc, t * 0.5, zA, yA + 2.05, zB, yB + 2.05, 1.05, { collide: 'glass' });
  rampZ(A, 'alu', xc, t, zA, yA + h, zB, yB + h, h - 2.05, { collide: 'metal' });
}
