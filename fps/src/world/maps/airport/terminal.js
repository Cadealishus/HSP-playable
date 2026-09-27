import * as THREE from 'three';
import {
  ROOF_Y,
  DECK_Y,
  LOW_CEIL,
  WALL_T,
  OUTLINE,
  PARTITIONS,
  DECK,
  ESCALATORS,
  EAST_STAIR,
  SKYLIGHTS,
  GATE,
  PLANE,
} from './layout.js';
import { slab, wall, curtainWall, rampZ, stairZ, boxAt, cylAt, G } from './kit.js';

/**
 * HOLDING PATTERN — the terminal shell: floors, the exterior envelope and the
 * glazing, partitions, the roof with its skylights, the overlook deck, the
 * escalator bank and the structural columns. Cover and dressing live in
 * dress.js; this file is the blockout that has to be walkable first.
 */

/** Floor rectangles [x0, z0, x1, z1, key]. */
export const FLOORS = [
  [-22, -26, 27, -8, 'terrazzo'],
  [27, -26, 38, -8, 'floor_sealed'],
  [-22, -8, 29, 11, 'terrazzo'],
  [1, 11, 29, 12, 'terrazzo'],
  [-37, -6, -22, 11, 'terrazzo'],
  [-31, 11, -21, 27, 'floor_sealed'],
  [-21, 11, 1, 27, 'terrazzo'],
];

/** Axis-aligned rect minus holes -> list of rects (grid split). */
export function rectMinus(r, holes) {
  const [x0, z0, x1, z1] = r;
  const xs = new Set([x0, x1]);
  const zs = new Set([z0, z1]);
  const hs = [];
  for (const [hx, hz, hw, hd] of holes) {
    const a = Math.max(x0, hx);
    const b = Math.min(x1, hx + hw);
    const c = Math.max(z0, hz);
    const d = Math.min(z1, hz + hd);
    if (a >= b || c >= d) continue;
    xs.add(a).add(b);
    zs.add(c).add(d);
    hs.push([a, c, b, d]);
  }
  const X = [...xs].sort((p, q) => p - q);
  const Z = [...zs].sort((p, q) => p - q);
  const out = [];
  for (let j = 0; j < Z.length - 1; j++) {
    let run = null;
    for (let i = 0; i < X.length - 1; i++) {
      const cx = (X[i] + X[i + 1]) / 2;
      const cz = (Z[j] + Z[j + 1]) / 2;
      let hole = false;
      for (const h of hs) if (cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3]) hole = true;
      if (!hole) {
        if (run) run[2] = X[i + 1];
        else run = [X[i], Z[j], X[i + 1], Z[j + 1]];
      } else if (run) {
        out.push(run);
        run = null;
      }
    }
    if (run) out.push(run);
  }
  return out;
}

/** Structural columns [x, z]: 1.1 m square, full height, hard cover. */
export const COLUMNS = [
  [-16, -20],
  [-8.5, -20],
  [-16, -9],
  [-14.2, 2.5],
  [-12.2, -2.2],
  [-1.6, -2.2],
  [-1.6, 9.2],
  [1.8, 4.2],
  [14.2, 4.2],
  [14.2, -5.5],
  [16.4, -9.0],
  [28.0, 3.0],
  [19.5, 5.2],
  [-10, 15.2],
  [-18.5, 23.5],
  [-28.7, 4.6],
];

export function buildTerminal(A) {
  // ------------------------------------------------------------- floors --
  for (const [x0, z0, x1, z1, key] of FLOORS) {
    slab(A, key, x0, -0.3, z0, x1, 0, z1, { collide: true, masks: [0, 0.05, 0] });
  }
  // the "+" inlay in the entry hall, and border bands along the lanes
  slab(A, 'terrazzo_dark', -20, 0, -20.6, -4, 0.006, -19.4);
  slab(A, 'terrazzo_dark', -12.6, 0, -25, -11.4, 0.006, -14);
  slab(A, 'terrazzo_dark', -21, 0, -1.9, 28, 0.006, -1.5);
  slab(A, 'terrazzo_dark', 0.2, 0, -12.5, 0.6, 0.006, 10.5);

  // ---------------------------------------------------- exterior envelope --
  const top = ROOF_Y + 0.6;
  for (const [x0, z0, x1, z1, kind, openings] of OUTLINE) {
    if (kind === 'glass') {
      curtainWall(A, x0, z0, x1, z1, 0, ROOF_Y, openings, { transoms: [3.4, 6.7] });
      // solid spandrel to the roof edge
      wall(A, 'concrete_white', x0, z0, x1, z1, ROOF_Y, top, 0.45, [], { collide: false });
    } else {
      wall(A, 'sandstone', x0, z0, x1, z1, 0, 1.2, WALL_T + 0.08, openings, { doorY: 2.6, masks: [0.3, 0.35, 0.2] });
      wall(A, 'concrete_white', x0, z0, x1, z1, 1.2, top, WALL_T, openings, { doorY: 2.6, frame: 'alu_dark' });
    }
  }

  // --------------------------------------------------------- partitions --
  for (const [x0, z0, x1, z1, h, openings, key] of PARTITIONS) {
    wall(A, key, x0, z0, x1, z1, 0, h, 0.3, openings, { doorY: 2.6, frame: 'alu_dark' });
  }

  // ------------------------------------------------------ roof + ceilings --
  // Visual only (see kit.js COLLISION CONVENTION).
  const roofRects = [
    [-22, -26, 38, -8],
    [-22, -8, 29, 12],
    [-37, -6, -22, 11],
    [-31, 11, 1, 27],
  ];
  for (const r of roofRects) {
    for (const [a, b, c, d] of rectMinus(r, SKYLIGHTS)) {
      slab(A, 'ceiling', a, ROOF_Y, b, c, ROOF_Y + 0.12, d);
      slab(A, 'roof_membrane', a, ROOF_Y + 0.12, b, c, ROOF_Y + 0.6, d);
    }
  }
  for (const [sx, sz, sw, sd] of SKYLIGHTS) {
    // a glazed lantern: upstands, glass lid, a ridge of steel glazing bars
    const y = ROOF_Y + 0.6;
    slab(A, 'alu_dark', sx, ROOF_Y, sz - 0.1, sx + sw, y + 0.5, sz + 0.1);
    slab(A, 'alu_dark', sx, ROOF_Y, sz + sd - 0.1, sx + sw, y + 0.5, sz + sd + 0.1);
    slab(A, 'alu_dark', sx - 0.1, ROOF_Y, sz, sx + 0.1, y + 0.5, sz + sd);
    slab(A, 'alu_dark', sx + sw - 0.1, ROOF_Y, sz, sx + sw + 0.1, y + 0.5, sz + sd);
    A.add('glazing', G.pane(A), _flat(sx + sw / 2, y + 0.5, sz + sd / 2, sw, sd));
    const n = Math.max(1, Math.round(sw / 1.5));
    for (let i = 1; i < n; i++) {
      const x = sx + (i / n) * sw;
      slab(A, 'alu_dark', x - 0.04, y + 0.42, sz, x + 0.04, y + 0.52, sz + sd);
    }
    // deep reveal under the opening so the light well reads from the floor
    slab(A, 'ceiling', sx - 0.12, ROOF_Y - 0.9, sz - 0.12, sx + sw + 0.12, ROOF_Y, sz);
    slab(A, 'ceiling', sx - 0.12, ROOF_Y - 0.9, sz + sd, sx + sw + 0.12, ROOF_Y, sz + sd + 0.12);
    slab(A, 'ceiling', sx - 0.12, ROOF_Y - 0.9, sz, sx, ROOF_Y, sz + sd);
    slab(A, 'ceiling', sx + sw, ROOF_Y - 0.9, sz, sx + sw + 0.12, ROOF_Y, sz + sd);
  }
  // back-of-house ceilings
  slab(A, 'ceiling', 27.2, LOW_CEIL, -26, 38, LOW_CEIL + 0.15, -8);
  slab(A, 'ceiling', -31, LOW_CEIL, 11.2, -21.2, LOW_CEIL + 0.15, 27);
  slab(A, 'ceiling', 7.2, DECK_Y - DECK.t, -26, 26.9, DECK_Y - DECK.t + 0.1, -16);
  // the solid band above the back-of-house partitions, up to the roof
  wall(A, 'concrete_white', 27, -26, 27, -8, LOW_CEIL, ROOF_Y, 0.3, [], { collide: false });

  // --------------------------------------------------------------- deck --
  buildDeck(A);
  buildEscalators(A);

  // ------------------------------------------------------------ columns --
  for (const [x, z] of COLUMNS) column(A, x, z);
  // slimmer steel posts carrying the deck edge
  for (const x of [8.2, 14.2, 20.2]) {
    slab(A, 'alu_dark', x - 0.18, 0, -10.48, x + 0.18, DECK_Y - DECK.t, -10.12, { collide: 'metal' });
  }
}

const _fm = new THREE.Matrix4();
const _fe = new THREE.Euler();
const _fq = new THREE.Quaternion();
const _fp = new THREE.Vector3();
const _fs = new THREE.Vector3();
/** A horizontal pane (the unit quad laid flat). */
export function _flat(x, y, z, w, d) {
  _fe.set(-Math.PI / 2, 0, 0);
  _fq.setFromEuler(_fe);
  _fp.set(x, y, z);
  _fs.set(w, d, 1);
  return _fm.compose(_fp, _fq, _fs);
}

/** A 1.1 m concrete column with a sandstone plinth and a steel capital ring. */
export function column(A, x, z, h = ROOF_Y) {
  slab(A, 'concrete_white', x - 0.55, 1.3, z - 0.55, x + 0.55, h, z + 0.55, { masks: [0.4, 0.2, 0.1] });
  slab(A, 'sandstone', x - 0.6, 0, z - 0.6, x + 0.6, 1.3, z + 0.6, { masks: [0.5, 0.4, 0.3] });
  slab(A, 'alu_dark', x - 0.62, 1.28, z - 0.62, x + 0.62, 1.34, z + 0.62);
  A.box('concrete', x, h / 2, z, 1.2, h, 1.2);
}

function buildDeck(A) {
  const { x0, z0, x1, z1, y, t } = DECK;
  // the walkable deck
  slab(A, 'terrazzo', x0, y - t, z0, x1, y, z1, { collide: true });
  // soffit and the fascia band on the atrium edge
  slab(A, 'ceiling', x0, y - t - 0.05, z0, x1, y - t, z1);
  slab(A, 'concrete_white', x0, y - 0.95, z1 - 0.02, x1, y + 0.05, z1 + 0.28, { masks: [0.3, 0.3, 0.1] });
  slab(A, 'concrete_white', x0 - 0.28, y - 0.95, z0, x0, y + 0.05, z1 + 0.28);
  // glass balustrade with a steel handrail: the south edge (gaps for the
  // escalator heads and the east stair) and the open west end
  const gaps = [
    [ESCALATORS.lanes[0][0] - 0.75, ESCALATORS.lanes[ESCALATORS.lanes.length - 1][0] + 0.75],
    [EAST_STAIR.x - EAST_STAIR.w / 2 - 0.05, EAST_STAIR.x + EAST_STAIR.w / 2 + 0.05],
  ];
  const segs = [];
  let s = x0;
  for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) {
    if (a > s) segs.push([s, a]);
    s = b;
  }
  if (s < x1) segs.push([s, x1]);
  for (const [a, b] of segs) balustradeX(A, a, b, z1 + 0.12, y);
  balustradeZ(A, x0 + 0.1, z0, z1 + 0.12, y);
}

/** A 1.1 m glass balustrade along x at `z`, standing on `y`. Collides. */
export function balustradeX(A, xa, xb, z, y, h = 1.1) {
  A.add('glazing', G.pane(A), paneMatrix((xa + xb) / 2, y + h / 2, z, xb - xa, h, 0));
  slab(A, 'steel', xa, y + h - 0.02, z - 0.05, xb, y + h + 0.05, z + 0.05);
  slab(A, 'alu_dark', xa, y, z - 0.06, xb, y + 0.08, z + 0.06);
  A.box('glass', (xa + xb) / 2, y + h / 2, z, xb - xa, h, 0.14);
  const n = Math.max(1, Math.round((xb - xa) / 1.6));
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    slab(A, 'steel', x - 0.025, y, z - 0.03, x + 0.025, y + h, z + 0.03);
  }
}

export function balustradeZ(A, x, za, zb, y, h = 1.1) {
  A.add('glazing', G.pane(A), paneMatrix(x, y + h / 2, (za + zb) / 2, zb - za, h, Math.PI / 2));
  slab(A, 'steel', x - 0.05, y + h - 0.02, za, x + 0.05, y + h + 0.05, zb);
  slab(A, 'alu_dark', x - 0.06, y, za, x + 0.06, y + 0.08, zb);
  A.box('glass', x, y + h / 2, (za + zb) / 2, 0.14, h, zb - za);
}

const _pm = new THREE.Matrix4();
const _pq = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
export function paneMatrix(x, y, z, w, h, ry) {
  _pq.setFromAxisAngle(_UP, ry);
  _pp.set(x, y, z);
  _ps.set(w, h, 1);
  return _pm.compose(_pp, _pq, _ps);
}

function buildEscalators(A) {
  const { zTop, y, slope, lanes } = ESCALATORS;
  const run = y / Math.tan(slope);
  const zBot = zTop + run;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [xc, w, kind] of lanes) {
    minX = Math.min(minX, xc - w / 2);
    maxX = Math.max(maxX, xc + w / 2);
    if (kind === 'stair') {
      const steps = 15;
      stairZ(A, 'terrazzo', xc, w, zBot, 0, steps, y / steps, run / steps, -1);
      continue;
    }
    // tread ramp + comb plates at both ends
    rampZ(A, 'alu', xc, w, zBot, 0, zTop, y, 0.35, { collide: 'metal', masks: [0.6, 0.3, 0.1] });
    slab(A, 'steel', xc - w / 2, 0, zBot, xc + w / 2, 0.02, zBot + 1.2);
    slab(A, 'steel', xc - w / 2, y, zTop - 1.2, xc + w / 2, y + 0.02, zTop);
    // the truss under it: a solid dark wedge, cladded both sides
    rampZ(A, 'alu_dark', xc, w + 0.06, zBot + 0.9, -0.5, zTop + 0.4, y - 0.9, 0.9, { collide: false });
  }
  // balustrades between and outside the lanes: glass on a steel skirt, with
  // the black handrail belt on top, following the slope
  const edges = [minX - 0.12];
  for (let i = 0; i < lanes.length - 1; i++) edges.push((lanes[i][0] + lanes[i][1] / 2 + lanes[i + 1][0] - lanes[i + 1][1] / 2) / 2);
  edges.push(maxX + 0.12);
  for (let i = 0; i < edges.length; i++) {
    const x = edges[i];
    const outer = i === 0 || i === edges.length - 1;
    rampZ(A, 'steel', x, 0.14, zBot, 0.95, zTop, y + 0.95, 0.12, { collide: outer ? 'metal' : false });
    rampZ(A, 'plastic_dark', x, 0.1, zBot - 0.3, 1.0, zTop - 0.3, y + 1.0, 0.07, { collide: false });
    // glass panel below the rail (visual), and the skirt that stops the walk-off
    rampZ(A, 'steel', x, 0.1, zBot, 0.2, zTop, y + 0.2, 0.25, { collide: false });
    if (outer) {
      // solid side cladding down to the floor, so nobody walks under the X
      rampZ(A, 'alu_dark', x, 0.14, zBot + 0.4, 0.2, zTop + 0.1, y - 0.3, 1.4, { collide: 'metal' });
    }
  }
  void cylAt;
  void boxAt;
}

/** Gate 12 geometry the objective and the minimap read. */
export const GATE_DESK = GATE.desk;
export const PLANE_FZ = PLANE.fz;
