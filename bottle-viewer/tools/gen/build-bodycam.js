import * as THREE from 'three';
import { SPEC, sampleProfile } from '../../src/spec.js';
import { glassSolid, labelBand, labelBack, capGeo, liquidGeo } from './geo.js';
import { drawLabel } from './label.js';
import { Field, rng, fingerprint, normalCanvas, ormCanvas, greyCanvas, canvas, clamp01 } from './tex.js';

/**
 * BODYCAM (photoreal) bottle. Realism comes from materials and small physical
 * truths, not polygon count:
 *  - glass: wall thickening toward the base, a deep push-up punt, two mould
 *    seams, a stippled bearing ring, waviness from the mould; transmission with
 *    volume attenuation, a thickness map, dispersion
 *  - surface: fingerprints, an oily smudge, settled dust on the shoulder, scuff
 *    rings and scratches. Fingerprints and smudges live in roughness only, so
 *    they appear in reflections the way they do on real glass
 *  - label: paper fibres, ink sitting in the grain with slight
 *    misregistration, worn edges, a torn corner (alpha cutout), a moisture
 *    stain, a lifted seam, gentle wrinkles in the geometry
 *  - cap: sharp knurling with dust in the valleys, a tamper ring with bridges,
 *    injection-moulding rings and a gate mark on the top
 */
export async function build({ log }) {
  const textures = [];
  const tex = (name, role, cv, srgb, { jpeg = false, repeatS = true } = {}) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 16;
    t.name = name;
    if (jpeg) t.userData.mimeType = 'image/jpeg';
    textures.push({ name, role, canvas: cv });
    return t;
  };
  const r = rng(1234);
  const H = SPEC.height;

  // ================================================================= glass
  const prof = sampleProfile(64);
  const outer = [...prof, [0.2042, 0.0147], [0.2088, 0.0149], [0.2135, 0.0147]];
  // deep punt: base rises 7 mm at the centre, then the bearing ring
  const bottom = [[0.0072, 0.0], [0.0068, 0.006], [0.0052, 0.013], [0.003, 0.019], [0.0012, 0.0245], [0.0003, 0.0285], [0.0, 0.0312]];
  let glassGeo = glassSolid({ outer, bottom, wall: SPEC.glass.wall, baseT: SPEC.glass.base + 0.006, radial: 128, rimY: 0.214 });
  // wall thickening toward the base (glass sags in the mould): push the inner wall in
  {
    const p = glassGeo.getAttribute('position');
    const n = glassGeo.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const rr = Math.hypot(x, z);
      const isInner = n.getX(i) * x + n.getZ(i) * z < 0 && y > 0.01 && y < 0.2;
      if (!isInner || rr < 0.005) continue;
      const extra = 0.0012 * Math.max(0, 1 - (y - 0.012) / 0.06);
      const k = (rr - extra) / rr;
      p.setXYZ(i, x * k, y, z * k);
    }
    glassGeo.computeVertexNormals();
  }

  const G = 2048;
  const roughG = new Field(G, G, 0.018);
  roughG.fbm({ cellsX: 4, cellsY: 4, octaves: 5, amp: 0.012, seed: 101 });
  const hG = new Field(G, G, 0);
  hG.fbm({ cellsX: 6, cellsY: 6, octaves: 4, amp: 0.5, seed: 102 }); // mould waviness ("orange peel")
  const vOf = (y) => y / H; // texture v from height (canvas row = (1 - v) * G)
  const rowOf = (y) => Math.round((1 - vOf(y)) * G);
  // mould seams at u = 0.25 and 0.75, full height, a raised hairline
  for (const u of [0.25, 0.75]) {
    const x = u * G;
    hG.line(x, rowOf(0.212), x, rowOf(0.002), 1.1, 1.8, 'add');
    roughG.line(x, rowOf(0.212), x, rowOf(0.002), 1.2, 0.05, 'add');
  }
  // stippled bearing ring near the heel
  for (let y = rowOf(0.0035); y < rowOf(0.0005); y += 7) {
    for (let x = 0; x < G; x += 7) hG.blob(x + ((y / 7) % 2) * 3.5, y, 1.6, 1.6, 0.9, 'add');
  }
  // conveyor scuff rings (heel + body shoulder contact) with real micro-abrasion
  const ring = (y, width, amount, seed) => {
    const band = new Field(G, G, 0).fbm({ cellsX: 96, cellsY: 24, octaves: 4, amp: 1, seed, ridged: true });
    for (let row = 0; row < G; row++) {
      const v = 1 - row / G;
      const k = Math.exp(-(((v - vOf(y)) / (width / H)) ** 2));
      if (k < 0.01) continue;
      for (let x = 0; x < G; x++) {
        const n = Math.max(0, band.a[row * G + x] + 0.12) * k * amount;
        roughG.a[row * G + x] += n;
        hG.a[row * G + x] -= n * 0.8;
      }
    }
  };
  ring(0.004, 0.0035, 0.6, 111);
  ring(0.127, 0.002, 0.15, 112);
  // scratches, mostly circumferential, a few long ones
  for (let i = 0; i < 520; i++) {
    const x = r() * G, y = rowOf(0.005 + r() * 0.2);
    const len = 4 + Math.pow(r(), 3) * 120, a = (r() - 0.5) * 0.7 + (r() < 0.15 ? Math.PI / 2 : 0);
    const depth = 0.15 + r() * 0.35;
    roughG.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35 + r() * 0.4, depth, 'max');
    hG.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35, -depth * 0.8, 'add');
  }
  // fingerprints where a hand holds it (thumb on the front shoulder, fingers on the back body)
  const prints = new Field(G, G, 0);
  fingerprint(prints, 0.47 * G, rowOf(0.152), 60, 0.4, 0.55, 201); // thumb
  fingerprint(prints, 0.04 * G, rowOf(0.105), 44, -0.2, 0.45, 202);
  fingerprint(prints, 0.96 * G, rowOf(0.078), 46, 0.15, 0.45, 203);
  fingerprint(prints, 0.9 * G, rowOf(0.135), 40, -0.5, 0.4, 204);
  fingerprint(prints, 0.6 * G, rowOf(0.035), 38, 0.9, 0.35, 205); // partial print near the base
  // oily smudge, sheared sideways
  const smudge = new Field(G, G, 0).fbm({ cellsX: 8, cellsY: 8, octaves: 4, amp: 1, seed: 210 });
  for (let row = 0; row < G; row++) for (let x = 0; x < G; x++) {
    const dx = (x - 0.4 * G) / (0.13 * G), dy = (row - rowOf(0.16)) / (0.06 * G);
    const k = Math.exp(-(dx * dx + dy * dy));
    const i = row * G + x;
    roughG.a[i] += Math.max(0, smudge.a[i] + 0.2) * k * 0.35 + prints.a[i] * 0.42;
  }
  // settled dust: shoulder (upward-facing), a little everywhere; also a faint base colour
  const dust = new Field(G, G, 0);
  for (let i = 0; i < 9000; i++) {
    const y = r() < 0.6 ? 0.14 + r() * 0.05 : r() * 0.21;
    const shoulder = y > 0.14 && y < 0.19 ? 1 : 0.35;
    dust.blob(r() * G, rowOf(y), 0.6 + r() * 1.4, 0.6 + r() * 1.4, (0.3 + r() * 0.7) * shoulder, 'max');
  }
  const albedoG = canvas(G, G);
  {
    const g = albedoG.getContext('2d');
    const img = g.createImageData(G, G);
    for (let i = 0; i < G * G; i++) {
      const d = clamp01(dust.a[i]);
      // glass base colour stays white (tint is in the volume); dust greys it
      const c = 255 - d * 95;
      img.data[i * 4] = c; img.data[i * 4 + 1] = c * 0.99; img.data[i * 4 + 2] = c * 0.96; img.data[i * 4 + 3] = 255;
      roughG.a[i] = Math.max(roughG.a[i], d * 0.75);
    }
    g.putImageData(img, 0, 0);
  }
  // thickness map (glTF reads G): thicker toward the base and through the shoulder
  const T = 512;
  const thick = new Field(T, T, 0).map((v, x, y) => {
    const yy = (1 - y / T) * H;
    return clamp01(0.42 + 0.58 * Math.exp(-(((yy - 0.0) / 0.03) ** 2)) + 0.18 * Math.exp(-(((yy - 0.165) / 0.02) ** 2)));
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'glass_bodycam',
    color: '#d3e8cd',
    map: tex('glass_albedo', 'baseColor (dust)', albedoG, true, { jpeg: true }),
    metalness: 1,
    roughness: 1,
    transmission: 1,
    thickness: 0.009,
    thicknessMap: tex('glass_thickness', 'thickness (KHR_materials_volume, G)', greyCanvas(thick), false),
    ior: SPEC.glass.ior,
    dispersion: 0.18,
    attenuationColor: new THREE.Color('#8fc583'),
    attenuationDistance: 0.014,
    specularIntensity: 1,
    normalMap: tex('glass_normal', 'normal (seams, stipple, waviness, scratches)', normalCanvas(hG, 2.6), false),
  });
  glassMat.normalScale.set(0.55, 0.55);
  glassMat.roughnessMap = glassMat.metalnessMap = tex('glass_orm', 'ORM (prints, smudge, dust, scuffs, scratches)', ormCanvas(null, roughG, null), false);
  log('glass done');

  // ================================================================= label
  const LW = 2048, LH = 512;
  const labelCv = canvas(LW, LH);
  const fibre = new Field(LW, LH, 0);
  fibre.fbm({ cellsX: 128, cellsY: 32, octaves: 3, amp: 0.4, seed: 301 });
  for (let i = 0; i < 26000; i++) {
    const x = r() * LW, y = r() * LH, len = 3 + r() * 14, a = r() * Math.PI;
    fibre.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.35, 0.18 + r() * 0.25, 'add');
  }
  const mott = new Field(LW, LH, 0).fbm({ cellsX: 12, cellsY: 3, octaves: 5, amp: 1, seed: 302 });
  const wear = new Field(LW, LH, 0).fbm({ cellsX: 64, cellsY: 16, octaves: 4, amp: 1, seed: 303 });
  // edge wear mask (top + bottom), stronger at the front where it is handled
  const edgeWear = (x, y) => {
    const e = Math.min(y, LH - 1 - y) / LH;
    const front = 0.6 + 0.4 * Math.cos(((x / LW) - 0.5) * Math.PI * 2);
    return clamp01((0.05 - e) / 0.05 + wear.a[y * LW + x] * 0.9) * front;
  };
  const stain = (x, y) => {
    const dx = (x - 0.62 * LW) / (0.07 * LW), dy = (y - 0.86 * LH) / (0.22 * LH);
    const d = Math.sqrt(dx * dx + dy * dy);
    return d < 1 ? (1 - d) * 0.6 + (Math.abs(d - 0.92) < 0.06 ? 0.5 : 0) : 0; // tide-mark rim
  };
  const { inkMask } = drawLabel(labelCv, {
    paperFn: (g, W, Hh) => {
      const img = g.getImageData(0, 0, W, Hh);
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ew = edgeWear(x, y), st = stain(x, y);
        let k = 1 + mott.a[i] * 0.07 + fibre.a[i] * 0.05 - ew * 0.08;
        img.data[i * 4] = img.data[i * 4] * k * (1 - st * 0.12);
        img.data[i * 4 + 1] = img.data[i * 4 + 1] * k * (1 - st * 0.17);
        img.data[i * 4 + 2] = img.data[i * 4 + 2] * k * (1 - st * 0.3);
      }
      g.putImageData(img, 0, 0);
    },
    inkFn: (k, W, Hh) => {
      // misregistration ghost, then ink starved on fibre peaks and rubbed off at worn edges
      const ghost = document.createElement('canvas');
      ghost.width = W; ghost.height = Hh;
      ghost.getContext('2d').drawImage(k.canvas, 0, 0);
      k.globalAlpha = 0.18;
      k.drawImage(ghost, 2.2, -1.4);
      k.globalAlpha = 1;
      const img = k.getImageData(0, 0, W, Hh);
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const starve = clamp01(0.95 - fibre.a[i] * 0.35 + mott.a[i] * 0.04 - edgeWear(x, y) * 0.8);
        img.data[i * 4 + 3] *= starve;
      }
      k.putImageData(img, 0, 0);
    },
  });
  // torn corner at the seam (u ~ 0, bottom) and the lifted seam edge: alpha cutout
  {
    const g = labelCv.getContext('2d');
    const img = g.getImageData(0, 0, LW, LH);
    const tearN = new Field(LW, LH, 0).fbm({ cellsX: 256, cellsY: 64, octaves: 3, amp: 1, seed: 304 });
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const i = y * LW + x;
      const dx = x / LW, dy = 1 - y / LH;
      const inTear = dx < 0.035 && dy < 0.22 + tearN.a[i] * 0.06 - dx * 4;
      const inEdge = Math.min(y, LH - 1 - y) < 1.5 + Math.max(0, tearN.a[i]) * 3;
      if (inTear || inEdge) img.data[i * 4 + 3] = 0;
      else {
        // paper whitening at the torn fibre edge
        const near = dx < 0.045 && dy < 0.3 ? 1 - Math.min(1, (dx - 0.035) / 0.01) : 0;
        if (near > 0) for (let c = 0; c < 3; c++) img.data[i * 4 + c] = Math.min(255, img.data[i * 4 + c] + near * 25);
      }
    }
    g.putImageData(img, 0, 0);
  }
  const inkA = inkMask.getContext('2d').getImageData(0, 0, LW, LH).data;
  const lRough = new Field(LW, LH, 0.86).map((v, x, y) => {
    const i = y * LW + x;
    const ink = inkA[i * 4 + 3] / 255;
    return v + fibre.a[i] * 0.05 - ink * 0.34 + edgeWear(x, y) * 0.08 - stain(x, y) * 0.15;
  });
  const lH = new Field(LW, LH, 0).map((v, x, y) => {
    const i = y * LW + x;
    return fibre.a[i] * 0.9 + mott.a[i] * 0.4 + (inkA[i * 4 + 3] / 255) * 0.25 - edgeWear(x, y) * 0.5;
  });
  // the seam: the overlapping end sits proud
  for (let y = 0; y < LH; y++) for (let x = 0; x < 6; x++) lH.a[y * LW + x] += 1.2;
  const labelMat = new THREE.MeshStandardMaterial({
    name: 'label_bodycam',
    map: tex('label_albedo', 'baseColor + alpha (paper, print, stain, tear)', labelCv, true),
    alphaTest: 0.5,
    normalMap: tex('label_normal', 'normal (fibres, ink, seam, worn edges)', normalCanvas(lH, 1.8), false),
    roughness: 1,
    metalness: 1,
    side: THREE.FrontSide,
  });
  labelMat.roughnessMap = labelMat.metalnessMap = tex('label_orm', 'ORM (paper vs ink, stain, wear)', ormCanvas(null, lRough, null), false);
  const wob = new Field(64, 16, 0).fbm({ cellsX: 4, cellsY: 2, octaves: 3, amp: 1, seed: 305 });
  const labelG = labelBand({
    radial: 128, hSegs: 24,
    wobble: (ang, t) => {
      const u = ((ang / (Math.PI * 2)) + 1.5) % 1;
      const w = wob.get(u * 64, t * 15) * 0.00028;
      const lift = u < 0.02 ? (0.02 - u) / 0.02 * 0.00025 : 0; // seam lifts slightly
      return w + lift;
    },
  });
  const labelBackMat = new THREE.MeshStandardMaterial({ name: 'label_back_bodycam', color: '#d6cfbc', roughness: 0.92 });

  // =================================================================== cap
  const CG = 1024;
  const C = SPEC.cap;
  const capG = capGeo({
    radial: 360, ridges: C.ridges, ridgeDepth: 0.0005, ridgeSharp: 2.2,
    profileExtra: [[0.0136, C.y1 - 0.0001], [0.0128, C.y1 - 0.00045]], // shallow top dish
    tamper: { radial: 180, bridges: 16 },
  });
  planarTop(capG, C.y1 - 0.0012);
  const cRough = new Field(CG, CG, 0.36).fbm({ cellsX: 32, cellsY: 32, octaves: 4, amp: 0.07, seed: 401 });
  const cH = new Field(CG, CG, 0).fbm({ cellsX: 128, cellsY: 128, octaves: 2, amp: 0.35, seed: 402 });
  const cAlb = canvas(CG, CG);
  {
    // UV layout: skirt uses cylindrical u/v (v ~ y/H, the top 10% of the texture),
    // the top face uses a planar disc in the lower-left square (see planarTop)
    const g = cAlb.getContext('2d');
    const img = g.createImageData(CG, CG);
    const dn = new Field(CG, CG, 0).fbm({ cellsX: 64, cellsY: 64, octaves: 3, amp: 1, seed: 403 });
    for (let y = 0; y < CG; y++) for (let x = 0; x < CG; x++) {
      const i = y * CG + x;
      const u = x / CG;
      const valley = Math.pow(0.5 - 0.5 * Math.cos(u * Math.PI * 2 * C.ridges), 6); // ridge valleys
      const dust = clamp01(valley * (0.6 + dn.a[i]) * 0.9);
      // top disc region (planar UVs): injection rings + gate mark
      const tx = (x / CG - 0.25) / 0.22, ty = (y / CG - 0.75) / 0.22;
      const rr = Math.hypot(tx, ty);
      let ringH = 0;
      if (rr < 1) {
        ringH = Math.sin(rr * 90) * 0.15 * (1 - rr) + (rr < 0.06 ? 0.9 : 0);
        cRough.a[i] = 0.3 + Math.abs(Math.sin(rr * 90)) * 0.05 + (rr < 0.06 ? 0.2 : 0);
      }
      cH.a[i] += ringH;
      cRough.a[i] = Math.max(cRough.a[i] - valley * 0.0, cRough.a[i]) + dust * 0.4;
      const base = 18;
      const c = base + dust * 120;
      img.data[i * 4] = c; img.data[i * 4 + 1] = c * 0.98; img.data[i * 4 + 2] = c * 0.94; img.data[i * 4 + 3] = 255;
    }
    for (let i = 0; i < 60; i++) cRough.blob(r() * CG, r() * CG * 0.2 + CG * 0.0, 2 + r() * 6, 1 + r() * 3, -0.1, 'add');
    g.putImageData(img, 0, 0);
  }
  const capMat = new THREE.MeshStandardMaterial({
    name: 'cap_bodycam',
    map: tex('cap_albedo', 'baseColor (dust in knurl valleys)', cAlb, true, { jpeg: true }),
    normalMap: tex('cap_normal', 'normal (plastic grain, moulding rings, gate)', normalCanvas(cH, 1.1), false),
    roughness: 1,
    metalness: 1,
  });
  capMat.roughnessMap = capMat.metalnessMap = tex('cap_orm', 'ORM (plastic, dusty valleys, handling shine)', ormCanvas(null, cRough, null), false);

  // ================================================================ liquid
  const innerProf = prof.map(([y, rr]) => [y, rr - 0.0012 * Math.max(0, 1 - (y - 0.012) / 0.06)]);
  const liqGeo = liquidGeo({ radial: 128, wall: SPEC.glass.wall, baseT: SPEC.glass.base + 0.006, profile: innerProf, meniscus: 0.0012 });
  const liqMat = new THREE.MeshPhysicalMaterial({ name: 'liquid_bodycam', color: SPEC.liquid.color, roughness: 0.01, metalness: 0, ior: 1.33, specularIntensity: 0.7 });

  const root = new THREE.Group();
  root.name = 'bottle_bodycam';
  const add = (name, g, m) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
  };
  add('liquid', liqGeo, liqMat);
  add('label_back', labelBack({ radial: 128 }), labelBackMat);
  add('label', labelG, labelMat);
  add('cap', capG, capMat);
  add('glass', glassGeo, glassMat);
  log('bodycam built');
  return {
    root,
    textures,
    notes: {
      method: 'Procedural: LatheGeometry glass solid (128 radial) with wall thickening, deep punt; wrinkled label band (128×24); 360-segment knurled cap with tamper bridges; textures generated in-browser (2K glass/label, 1K cap) with seeded noise, fingerprint whorls, scratch strokes, fibre strokes and an alpha-cut tear.',
      material: 'glTF PBR + KHR_materials_transmission / volume (thickness map, attenuation) / ior / dispersion / specular; alphaMode MASK on the label',
    },
  };
}

/** Planar UVs for the cap top (y > yMin), packed into the lower-left square of the texture. */
function planarTop(g, yMin) {
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const R = SPEC.cap.radius;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < yMin) continue;
    const x = p.getX(i), z = p.getZ(i);
    // canvas region centred (0.25, 0.75) radius 0.22 → glTF v flips: v = 1 - 0.75
    uv.setXY(i, 0.25 + (x / R) * 0.22, 0.25 + (z / R) * 0.22);
  }
  uv.needsUpdate = true;
}
