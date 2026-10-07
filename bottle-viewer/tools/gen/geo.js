import * as THREE from 'three';
import { SPEC, sampleProfile } from '../../src/spec.js';

/**
 * A closed glass solid: outer wall, rim, inner wall and inner floor, lathed.
 * `outer` is the outer silhouette [[y, r], ...] from the base edge up to the
 * neck top; `bottom` is the outer base from the axis to the base edge.
 * UVs: u around (0 = +Z front after lathe), v = y / SPEC.height so maps paint in
 * metric space.
 */
export function glassSolid({ outer, bottom, wall, baseT, radial, rimY }) {
  const pts = [];
  for (const [y, r] of bottom) pts.push(new THREE.Vector2(r, y));
  for (const [y, r] of outer) pts.push(new THREE.Vector2(r, y));
  const top = rimY;
  const rTop = outer[outer.length - 1][1];
  pts.push(new THREE.Vector2(rTop, top));
  pts.push(new THREE.Vector2(rTop - wall * 0.35, top + 0.0006)); // rounded rim
  pts.push(new THREE.Vector2(rTop - wall, top));
  // inner wall back down, following the outer shape offset by the wall
  const inner = outer.slice().reverse();
  for (const [y, r] of inner) {
    if (y < baseT + 0.002) continue;
    pts.push(new THREE.Vector2(Math.max(0.001, r - wall), y));
  }
  pts.push(new THREE.Vector2(outer[0][1] - wall * 1.2, baseT + 0.002));
  pts.push(new THREE.Vector2(0.0, baseT));
  const g = new THREE.LatheGeometry(pts, radial);
  cylindricalUV(g);
  return g;
}

/** Overwrite UVs with u = angle/2π (0 at +Z), v = y/height. */
export function cylindricalUV(g, h = SPEC.height) {
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let u = Math.atan2(x, z) / (Math.PI * 2);
    if (u < 0) u += 1;
    // keep the lathe seam consistent: lathe u already runs 0..1, reuse it
    const lu = uv.getX(i);
    uv.setXY(i, Number.isFinite(lu) ? lu : u, p.getY(i) / h);
  }
  uv.needsUpdate = true;
}

/** Label band: open cylinder, u = 0.5 faces +Z (the printed front). */
export function labelBand({ radial, hSegs = 1, radius = SPEC.label.radius, wobble = null }) {
  const L = SPEC.label;
  const g = new THREE.CylinderGeometry(radius, radius, L.y1 - L.y0, radial, hSegs, true);
  g.rotateY(Math.PI);
  g.translate(0, (L.y0 + L.y1) / 2, 0);
  if (wobble) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + wobble(Math.atan2(x, z), (y - L.y0) / (L.y1 - L.y0)) / radius;
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Inner (back) face of the label so the paper back reads through the glass. */
export function labelBack({ radial, radius = SPEC.label.radius - 0.00008 }) {
  const L = SPEC.label;
  const g = new THREE.CylinderGeometry(radius, radius, L.y1 - L.y0, radial, 1, true);
  g.rotateY(Math.PI);
  g.translate(0, (L.y0 + L.y1) / 2, 0);
  // flip to face inward
  const idx = g.getIndex();
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/** Cap: lathed skirt with optional knurl ridges, a top and an optional tamper ring. */
export function capGeo({ radial, ridges = 0, ridgeDepth = 0.0004, ridgeSharp = 1, profileExtra = [], tamper = null }) {
  const C = SPEC.cap;
  const R = C.radius;
  const pts = [
    [0.00055, C.y0 + 0.0006], // inner lip
    [R - 0.0012, C.y0],
    [R - 0.0003, C.y0 + 0.0003],
    [R, C.y0 + 0.0012],
    [R, C.y1 - 0.0022],
    [R - 0.0003, C.y1 - 0.0008],
    [R - 0.0011, C.y1 - 0.00005],
    ...profileExtra,
    [0, C.y1],
  ];
  const v2 = pts.map(([r, y]) => new THREE.Vector2(r, y));
  v2[0].x = R - 0.0016; // the skirt's inner wall starts here
  const g = new THREE.LatheGeometry([new THREE.Vector2(R - 0.0016, C.y0 + 0.006), ...v2], radial);
  if (ridges > 0) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < R - 0.0002 || y < C.y0 + 0.0016 || y > C.y1 - 0.0028) continue;
      const a = Math.atan2(x, z);
      const s = 0.5 + 0.5 * Math.cos(a * ridges);
      const shaped = Math.pow(s, ridgeSharp);
      const k = (r - ridgeDepth * (1 - shaped)) / r;
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
  }
  cylindricalUV(g);
  if (tamper) {
    const t = tamperRing(tamper);
    return mergeAll([g, t]);
  }
  return g;
}

function tamperRing({ radial, bridges = 12 }) {
  const C = SPEC.cap;
  const R = C.radius - 0.0002;
  const y1 = C.y0 - 0.0012, y0 = y1 - 0.0042;
  const pts = [
    new THREE.Vector2(R - 0.0012, y0 + 0.0003),
    new THREE.Vector2(R - 0.0002, y0),
    new THREE.Vector2(R, y0 + 0.0005),
    new THREE.Vector2(R, y1 - 0.0004),
    new THREE.Vector2(R - 0.0003, y1),
    new THREE.Vector2(R - 0.0013, y1),
  ];
  const ring = new THREE.LatheGeometry(pts, radial);
  cylindricalUV(ring);
  const parts = [ring];
  // bridges across the perforation gap
  for (let i = 0; i < bridges; i++) {
    const a = (i / bridges) * Math.PI * 2;
    const b = new THREE.BoxGeometry(0.0011, 0.0013, 0.0007);
    b.translate(0, (y1 + C.y0) / 2, R - 0.0004);
    b.rotateY(a);
    // box UVs are fine for a flat-black part; keep attribute layout uniform
    parts.push(b);
  }
  return mergeAll(parts);
}

/** Liquid: closed lathe of the inner wall up to the fill line, optional meniscus. */
export function liquidGeo({ radial, wall, baseT, profile, meniscus = 0 }) {
  const fill = SPEC.liquid.fill;
  const pts = [new THREE.Vector2(0, baseT + 0.0002)];
  for (const [y, r] of profile) {
    if (y < baseT + 0.0015) continue;
    if (y > fill) break;
    pts.push(new THREE.Vector2(r - wall - 0.0002, y));
  }
  const rTop = radiusAt(profile, fill) - wall - 0.0002;
  pts.push(new THREE.Vector2(rTop, fill + meniscus));
  if (meniscus > 0) {
    pts.push(new THREE.Vector2(rTop - 0.0012, fill + meniscus * 0.25));
    pts.push(new THREE.Vector2(rTop - 0.003, fill + 0.00002));
  }
  pts.push(new THREE.Vector2(0, fill));
  const g = new THREE.LatheGeometry(pts, radial);
  cylindricalUV(g);
  return g;
}

export function radiusAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [y0, r0] = profile[i], [y1, r1] = profile[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((y - y0) / Math.max(1e-6, y1 - y0)) * (r1 - r0);
  }
  return profile[profile.length - 1][1];
}

/** Merge indexed/non-indexed geometries with matching attribute sets (pos, normal, uv). */
export function mergeAll(list) {
  const prepared = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute('uv')) {
      ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
    }
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    return ng;
  });
  let n = 0;
  for (const g of prepared) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of prepared) {
    const c = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array, o * 3);
    nor.set(g.getAttribute('normal').array, o * 3);
    uv.set(g.getAttribute('uv').array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

export { sampleProfile };
