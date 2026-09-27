// Millimetre hard-surface kit for the carbine (models/carbine.js).
//
// Ported from the standalone weapon prototype. It complements geometry.js rather
// than replacing it: geometry.js authors in metres with three's stock primitives,
// this authors in millimetres from 2-D profiles with real filleted corners and
// smooth bevel normals, which is what a machined AR receiver needs. Everything it
// produces is handed to the engine's `Assembly` (see models/carbine.js `MM`), so
// the carbine goes through exactly the same material buckets, curvature-mask bake
// and draw-call merge as the other three guns.
//
// Procedural hard-surface geometry for the viewmodel weapons.
// All builders produce non-indexed BufferGeometry with `position` + `normal` (no UVs: the weapon
// materials are triplanar in object space). Corners are rounded with real arcs and bevels get
// smooth normals, so edges catch light and the material's curvature-driven edge wear finds them.
// Units are whatever the caller uses (the weapon models are authored in millimetres).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V2 = THREE.Vector2;
const V3 = THREE.Vector3;

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Round the corners of a 2D polygon. `pts` = [[x, y, r?], ...]; r = corner radius (default defR).
// Returns [{ p: Vector2, n: Vector2 | null }] where n is the smooth outward normal at arc points
// (null = sharp corner). Outer contours are made CCW, holes CW, so the "right-hand" normal of each
// edge always points away from the material.
export function roundContour(pts, defR = 0, { hole = false, open = false, maxSeg = Math.PI / 9 } = {}) {
  let P = pts.map((p) => [p[0], p[1], p[2] ?? defR]);
  if (!open) {
    const a = signedArea(P);
    if ((a < 0) !== hole) P = P.slice().reverse();
  }
  const n = P.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = P[i];
    const pv = new V2(p[0], p[1]);
    const r = p[2];
    if (open && (i === 0 || i === n - 1)) { out.push({ p: pv, n: null }); continue; }
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const d1 = new V2(p[0] - a[0], p[1] - a[1]);
    const l1 = d1.length();
    const d2 = new V2(b[0] - p[0], b[1] - p[1]);
    const l2 = d2.length();
    if (!r || l1 < 1e-9 || l2 < 1e-9) { out.push({ p: pv, n: null }); continue; }
    d1.divideScalar(l1); d2.divideScalar(l2);
    const theta = Math.acos(THREE.MathUtils.clamp(-d1.dot(d2), -1, 1)); // interior angle between edges
    if (theta > Math.PI - 1e-3) { out.push({ p: pv, n: null }); continue; }
    let t = r / Math.tan(theta / 2);
    const tmax = Math.min(l1, l2) * 0.499;
    let rr = r;
    if (t > tmax) { t = tmax; rr = t * Math.tan(theta / 2); }
    const p1 = pv.clone().addScaledVector(d1, -t);
    const p2 = pv.clone().addScaledVector(d2, t);
    const cross = d1.x * d2.y - d1.y * d2.x;
    const n1 = new V2(d1.y, -d1.x);
    const c = cross > 0 ? p1.clone().addScaledVector(n1, -rr) : p1.clone().addScaledVector(n1, rr);
    const a0 = Math.atan2(p1.y - c.y, p1.x - c.x);
    const a1 = Math.atan2(p2.y - c.y, p2.x - c.x);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const segs = Math.max(1, Math.ceil(Math.abs(da) / maxSeg));
    for (let s = 0; s <= segs; s++) {
      const ang = a0 + (da * s) / segs;
      const nn = new V2(Math.cos(ang), Math.sin(ang));
      const q = new V2(c.x + nn.x * rr, c.y + nn.y * rr);
      if (cross < 0) nn.negate();
      out.push({ p: q, n: nn });
    }
  }
  // drop consecutive duplicates
  const res = [];
  for (const o of out) {
    const last = res[res.length - 1];
    if (last && last.p.distanceToSquared(o.p) < 1e-10) { if (o.n) last.n = o.n; continue; }
    res.push(o);
  }
  if (!open && res.length > 2 && res[0].p.distanceToSquared(res[res.length - 1].p) < 1e-10) res.pop();
  return res;
}

// Rounded rectangle helper (centre cx,cy, size w,h, corner radius r) as a point list for roundContour.
export function rrect(cx, cy, w, h, r = 0) {
  return [
    [cx - w / 2, cy - h / 2, r], [cx + w / 2, cy - h / 2, r],
    [cx + w / 2, cy + h / 2, r], [cx - w / 2, cy + h / 2, r],
  ];
}

// Circle as a (sharp-cornered but finely sampled) contour with smooth normals.
export function circleContour(cx, cy, r, seg = 24, hole = false) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2 * (hole ? -1 : 1);
    const n = new V2(Math.cos(a), Math.sin(a));
    out.push({ p: new V2(cx + n.x * r, cy + n.y * r), n: hole ? n.clone().negate() : n });
  }
  return out;
}

// Per-point data for a contour: segment normals + miter vectors for insetting.
function contourData(c) {
  const n = c.length;
  const segN = [];
  for (let i = 0; i < n; i++) {
    const a = c[i].p, b = c[(i + 1) % n].p;
    const d = new V2(b.x - a.x, b.y - a.y).normalize();
    segN.push(new V2(d.y, -d.x));
  }
  const miter = [];
  for (let i = 0; i < n; i++) {
    const nPrev = segN[(i - 1 + n) % n], nNext = segN[i];
    if (c[i].n) { miter.push(c[i].n.clone()); continue; }
    const m = nPrev.clone().add(nNext);
    const d = 1 + nPrev.dot(nNext);
    if (d < 0.05) miter.push(nNext.clone());
    else miter.push(m.divideScalar(d));
  }
  return { segN, miter };
}

class GeoWriter {
  constructor() { this.pos = []; this.nor = []; }
  tri(a, b, c, na, nb, nc) {
    // orient so the geometric normal agrees with the supplied vertex normals
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
    const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    const sx = na.x + nb.x + nc.x, sy = na.y + nb.y + nc.y, sz = na.z + nb.z + nc.z;
    if (gx * gx + gy * gy + gz * gz < 1e-18) return;
    if (gx * sx + gy * sy + gz * sz < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; }
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.nor.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
  }
  quad(a, b, c, d, na, nb, nc, nd) {
    this.tri(a, b, c, na, nb, nc);
    this.tri(a, c, d, na, nc, nd);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    return g;
  }
}

// Extrude rounded contours (outer + holes, in the XY plane) along +Z from z0 to z1, with a rounded
// bevel of radius `bevel` on both caps. contours: result(s) of roundContour().
// bevel: number, [front, back] pair, or { outer, holes } (numbers or pairs) for per-contour control.
export function extrude(contours, z0, z1, { bevel = 0.5, bevelSeg = 2, caps = [true, true] } = {}) {
  if (!Array.isArray(contours[0])) contours = [contours];
  const w = new GeoWriter();
  const pair = (b) => (Array.isArray(b) ? b : [b, b]).map((x) => Math.min(x, (z1 - z0) * 0.49));
  const bevOf = (ci) => (typeof bevel === 'object' && !Array.isArray(bevel) ? pair(ci === 0 ? bevel.outer : bevel.holes) : pair(bevel));
  const makeRings = ([b0, b1]) => {
    const rings = [];
    const s0 = b0 > 0 ? bevelSeg : 0, s1 = b1 > 0 ? bevelSeg : 0;
    for (let k = s0; k >= 0; k--) {
      const th = s0 ? (k / s0) * Math.PI / 2 : 0;
      rings.push({ z: z0 + b0 - b0 * Math.sin(th), inset: b0 - b0 * Math.cos(th), nz: -Math.sin(th), nc: Math.cos(th) });
    }
    for (let k = 0; k <= s1; k++) {
      const th = s1 ? (k / s1) * Math.PI / 2 : 0;
      rings.push({ z: z1 - b1 + b1 * Math.sin(th), inset: b1 - b1 * Math.cos(th), nz: Math.sin(th), nc: Math.cos(th) });
    }
    return rings;
  };
  const insetCache = [];
  for (let ci = 0; ci < contours.length; ci++) {
    const c = contours[ci];
    const rings = makeRings(bevOf(ci));
    const { segN, miter } = contourData(c);
    const n = c.length;
    insetCache.push({ c, miter, rings });
    const P = (i, ring) => new V3(c[i].p.x - miter[i].x * ring.inset, c[i].p.y - miter[i].y * ring.inset, ring.z);
    const N = (i, seg, ring) => {
      const on = c[i].n || segN[seg];
      return new V3(on.x * ring.nc, on.y * ring.nc, ring.nz).normalize();
    };
    for (let r = 0; r < rings.length - 1; r++) {
      const ra = rings[r], rb = rings[r + 1];
      if (Math.abs(ra.z - rb.z) < 1e-9 && Math.abs(ra.inset - rb.inset) < 1e-9) continue;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        w.quad(P(i, ra), P(j, ra), P(j, rb), P(i, rb), N(i, i, ra), N(j, i, ra), N(j, i, rb), N(i, i, rb));
      }
    }
  }
  // caps
  const capAt = (end, sign) => {
    const pts = (cc) => {
      const ring = end ? cc.rings[cc.rings.length - 1] : cc.rings[0];
      return cc.c.map((o, i) => new V2(o.p.x - cc.miter[i].x * ring.inset, o.p.y - cc.miter[i].y * ring.inset));
    };
    const z = end ? z1 : z0;
    const contour = pts(insetCache[0]);
    const holes = insetCache.slice(1).map(pts);
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    const nn = new V3(0, 0, sign);
    for (const f of faces) {
      const a = all[f[0]], bb = all[f[1]], cc = all[f[2]];
      w.tri(new V3(a.x, a.y, z), new V3(bb.x, bb.y, z), new V3(cc.x, cc.y, z), nn, nn, nn);
    }
  };
  if (caps[0]) capAt(false, -1);
  if (caps[1]) capAt(true, 1);
  return w.geometry();
}

// Side-profile helper for the weapon models: profile points in (u = forward, v = up), extruded
// across the width along X (centred on x0..x1). Returns geometry in model space where
// forward = -Z, up = +Y, right = +X.
export function profileX(pts, x0, x1, { r = 0, holes = [], bevel = 0.6, bevelSeg = 2, maxSeg } = {}) {
  const cs = [roundContour(pts, r, { maxSeg })].concat(holes.map((h) => (h[0] && h[0].p ? h : roundContour(h, r, { hole: true, maxSeg }))));
  // canonical (a=u, b=v, z) -> rotateY(+90deg) -> (x=z, y=v, z=-u)
  const g = extrude(cs, x0, x1, { bevel, bevelSeg });
  g.rotateY(Math.PI / 2);
  return g;
}

// Cross-section helper: section points in (x, y), extruded along the weapon's forward axis from
// u0 to u1 (i.e. z from -u0 to -u1).
export function sectionZ(pts, u0, u1, { r = 0, holes = [], bevel = 0.6, bevelSeg = 2, maxSeg } = {}) {
  const cs = [pts[0] && pts[0].p ? pts : roundContour(pts, r, { maxSeg })].concat(holes.map((h) => (h[0] && h[0].p ? h : roundContour(h, r, { hole: true, maxSeg }))));
  const g = extrude(cs, -u1, -u0, { bevel, bevelSeg });
  return g;
}

// Top-view helper: plan points in (x, u) extruded vertically from v0 to v1.
export function planY(pts, v0, v1, { r = 0, holes = [], bevel = 0.6, bevelSeg = 2, maxSeg } = {}) {
  // canonical (a=x, b=u, z) -> rotateX(-90deg): (x, y=z, z=-b)... rotateX(-90): y' = z, z' = -y
  const cs = [roundContour(pts, r, { maxSeg })].concat(holes.map((h) => (h[0] && h[0].p ? h : roundContour(h, r, { hole: true, maxSeg }))));
  const g = extrude(cs, v0, v1, { bevel, bevelSeg });
  g.rotateX(-Math.PI / 2);
  return g;
}

// Revolve a profile [[r, y, cornerR?], ...] (ordered bottom -> out -> top so the outward normal
// is on the right) around the Y axis. closed=true treats the profile as a closed ring section.
export function lathe(profile, segments = 32, { closed = false, phi0 = 0, phiLen = Math.PI * 2, r = 0, maxSeg, sideCaps = true } = {}) {
  const c = roundContour(profile, r, { open: !closed, maxSeg });
  const w = new GeoWriter();
  const n = c.length;
  const segN = [];
  for (let i = 0; i < n; i++) {
    const a = c[i].p, b = c[(i + 1) % n].p;
    const d = new V2(b.x - a.x, b.y - a.y);
    if (d.lengthSq() < 1e-14) { segN.push(segN[segN.length - 1] || new V2(1, 0)); continue; }
    d.normalize();
    segN.push(new V2(d.y, -d.x));
  }
  const full = Math.abs(phiLen - Math.PI * 2) < 1e-6;
  const P = (i, phi) => new V3(c[i].p.x * Math.sin(phi), c[i].p.y, c[i].p.x * Math.cos(phi));
  const N = (i, seg, phi) => {
    const on = c[i].n || segN[seg];
    return new V3(on.x * Math.sin(phi), on.y, on.x * Math.cos(phi)).normalize();
  };
  const segCount = closed ? n : n - 1;
  for (let s = 0; s < segments; s++) {
    const pa = phi0 + (phiLen * s) / segments, pb = phi0 + (phiLen * (s + 1)) / segments;
    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % n;
      const A = P(i, pa), B = P(j, pa), C = P(j, pb), D = P(i, pb);
      const nA = N(i, i, pa), nB = N(j, i, pa), nC = N(j, i, pb), nD = N(i, i, pb);
      if (c[i].p.x < 1e-9) w.tri(A, B, C, nA, nB, nC);
      else if (c[j].p.x < 1e-9) w.tri(A, B, D, nA, nB, nD);
      else w.quad(A, B, C, D, nA, nB, nC, nD);
    }
  }
  if (!full && sideCaps && closed) {
    const pts = c.map((o) => o.p);
    const faces = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const phi of [phi0, phi0 + phiLen]) {
      const sgn = phi === phi0 ? -1 : 1;
      const nn = new V3(Math.cos(phi) * sgn, 0, -Math.sin(phi) * sgn);
      for (const f of faces) {
        const a = P(f[0], phi), bb = P(f[1], phi), cc = P(f[2], phi);
        w.tri(a, bb, cc, nn, nn, nn);
      }
    }
  }
  return w.geometry();
}

// Lathe oriented along the weapon's forward axis: profile in (r, u), u forward.
export function latheZ(profile, segments = 32, opts = {}) {
  const g = lathe(profile, segments, opts);
  g.rotateX(-Math.PI / 2); // y (u) -> -z
  return g;
}

// Lathe along X (lateral).
export function latheX(profile, segments = 24, opts = {}) {
  const g = lathe(profile, segments, opts);
  g.rotateZ(-Math.PI / 2); // y -> +x
  return g;
}

// Simple cylinder (with rounded edges) along an axis, via lathe.
export function cyl(radius, length, { seg = 20, bevel = 0.3, axis = 'z', r0 = 0 } = {}) {
  const b = Math.min(bevel, radius * 0.4, length * 0.3);
  const prof = r0 > 0
    ? [[r0, 0, 0], [radius, 0, b], [radius, length, b], [r0, length, 0]]
    : [[0, 0, 0], [radius, 0, b], [radius, length, b], [0, length, 0]];
  const g = lathe(prof, seg, { closed: r0 > 0 });
  if (axis === 'z') g.rotateX(-Math.PI / 2);
  else if (axis === 'x') g.rotateZ(-Math.PI / 2);
  return g;
}

// Rounded box (smooth-normal edges) centred at origin.
export function rbox(w, h, d, r = 0.5, bevelSeg = 2) {
  const rr = Math.min(r, w * 0.45, h * 0.45);
  const g = extrude([roundContour(rrect(0, 0, w, h, rr), 0)], -d / 2, d / 2, { bevel: Math.min(r, d * 0.45), bevelSeg });
  return g;
}

// Apply a transform: p = [x,y,z] translation, r = [rx,ry,rz] Euler radians (XYZ), s = scale.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3();
export function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _e.set(r[0], r[1], r[2], 'XYZ');
  _q.setFromEuler(_e);
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

// Place geometry at a gun-space side-profile coordinate (u forward, v up, x lateral).
export function at(g, u, v, x = 0, r = [0, 0, 0]) {
  return xf(g, [x, v, -u], r);
}

// Merge geometries keeping only position + normal (+ color if all have it).
export function merge(list) {
  const gs = list.filter(Boolean).map((g) => {
    const k = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(k.attributes)) if (name !== 'position' && name !== 'normal') k.deleteAttribute(name);
    return k;
  });
  if (!gs.length) return null;
  return mergeGeometries(gs, false);
}

// Collects geometry per material key, then builds one mesh per key.
export class Parts {
  constructor() { this.map = new Map(); }
  add(mat, g) {
    if (!g) return g;
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return g;
  }
  build(materials, name = 'part', scale = 1) {
    const grp = new THREE.Group();
    grp.name = name;
    for (const [key, list] of this.map) {
      const geo = merge(list);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mat = materials[key];
      if (!mat) throw new Error('weapons: missing material ' + key);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
    }
    if (scale !== 1) grp.scale.setScalar(scale);
    return grp;
  }
}
