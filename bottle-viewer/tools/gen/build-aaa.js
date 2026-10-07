import * as THREE from 'three';
import { SPEC, sampleProfile } from '../../src/spec.js';
import { glassSolid, labelBand, labelBack, capGeo, liquidGeo } from './geo.js';
import { drawLabel } from './label.js';
import { Field, rng, normalCanvas, ormCanvas, canvas, hexRGB } from './tex.js';

/**
 * AAA (Call of Duty-inspired) bottle: what a modern military FPS ships for a
 * hero-ish clutter prop. Smooth lathed silhouette with real wall thickness and a
 * push-up base, transmissive glass with volume tint, a knurled cap with a
 * tamper ring, a 1K label with paper grain, 1K glass wear maps (conveyor scuff
 * rings, fine scratches). Budgeted to stay cheap enough to scatter.
 */
export async function build({ log }) {
  const textures = [];
  const tex = (name, role, cv, srgb, repeat = true) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    t.name = name;
    textures.push({ name, role, canvas: cv });
    return t;
  };

  // ---------------------------------------------------------------- glass
  const prof = sampleProfile(30);
  const outer = [...prof, [0.2045, 0.0147], [0.2135, 0.0147]];
  const bottom = [[0.0016, 0.0], [0.0013, 0.016], [0.0006, 0.027], [0.00015, 0.0318]];
  const glassGeo = glassSolid({ outer, bottom, wall: SPEC.glass.wall, baseT: SPEC.glass.base, radial: 64, rimY: 0.214 });

  const G = 1024;
  const r = rng(7);
  const rough = new Field(G, G, 0.035);
  rough.fbm({ cellsX: 4, cellsY: 4, octaves: 4, amp: 0.02, seed: 3 });
  const height = new Field(G, G, 0);
  height.fbm({ cellsX: 3, cellsY: 3, octaves: 3, amp: 0.35, seed: 9 }); // gentle glass waviness
  // conveyor contact rings: heel and the top of the body (where bottles touch)
  const ring = (vC, width, amount, seed) => {
    const band = new Field(G, G, 0).fbm({ cellsX: 48, cellsY: 16, octaves: 3, amp: 1, seed, ridged: true });
    for (let y = 0; y < G; y++) {
      const v = 1 - y / G;
      const k = Math.exp(-(((v - vC) / width) ** 2));
      if (k < 0.01) continue;
      for (let x = 0; x < G; x++) {
        const n = Math.max(0, band.a[y * G + x] + 0.15) * k * amount;
        rough.a[y * G + x] += n;
        height.a[y * G + x] -= n * 0.6;
      }
    }
  };
  ring(0.012 / SPEC.height, 0.012, 0.55, 21);
  ring(0.124 / SPEC.height, 0.008, 0.15, 22);
  // fine scratches, mostly around the circumference
  for (let i = 0; i < 260; i++) {
    const x = r() * G, y = r() * G * 0.95 + G * 0.05;
    const len = 6 + r() * 40, a = (r() - 0.5) * 0.9;
    rough.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.45, 0.22 + r() * 0.18, 'max');
    height.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.45, -0.25, 'add');
  }
  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'glass_aaa',
    color: 0xffffff,
    metalness: 0,
    roughness: 1,
    transmission: 1,
    thickness: 0.006,
    ior: SPEC.glass.ior,
    attenuationColor: new THREE.Color('#8fc583'),
    attenuationDistance: 0.012,
    specularIntensity: 1,
    normalMap: tex('glass_normal', 'normal (scratches, waviness)', normalCanvas(height, 2.2), false),
    side: THREE.FrontSide,
  });
  glassMat.roughnessMap = glassMat.metalnessMap = tex('glass_orm', 'ORM (scuff rings, scratches)', ormCanvas(null, rough, null), false);
  glassMat.metalness = 1; // factor; the ORM blue channel (0) makes it dielectric
  glassMat.normalScale.set(0.6, 0.6);
  // tint the glass itself a touch so thin rims still read green
  glassMat.color.set('#cfe7c9');

  // ---------------------------------------------------------------- label
  const LW = 1024, LH = 256;
  const labelCv = canvas(LW, LH);
  const paperH = new Field(LW, LH, 0).fbm({ cellsX: 64, cellsY: 16, octaves: 4, amp: 1, seed: 31 });
  const mott = new Field(LW, LH, 0).fbm({ cellsX: 8, cellsY: 2, octaves: 4, amp: 1, seed: 32 });
  const { inkMask } = drawLabel(labelCv, {
    paperFn: (g, W, H) => {
      const img = g.getImageData(0, 0, W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const edge = Math.min(y, H - 1 - y) / H;
        const wear = edge < 0.04 ? (0.04 - edge) * 1.8 : 0;
        const k = 1 + mott.a[i] * 0.06 + paperH.a[i] * 0.03 - wear;
        img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k * 0.995;
      }
      g.putImageData(img, 0, 0);
    },
    inkFn: (k, W, H) => {
      // ink sits on the paper grain: thinner on the high fibres
      const img = k.getImageData(0, 0, W, H);
      for (let i = 0; i < W * H; i++) {
        img.data[i * 4 + 3] *= Math.min(1, 0.93 + paperH.a[i] * -0.2 + mott.a[i] * 0.05);
      }
      k.putImageData(img, 0, 0);
    },
  });
  const inkA = inkMask.getContext('2d').getImageData(0, 0, LW, LH).data;
  const lRough = new Field(LW, LH, 0.8);
  lRough.map((v, x, y) => v + paperH.a[y * LW + x] * 0.06 - (inkA[(y * LW + x) * 4 + 3] / 255) * 0.3);
  const lHeight = new Field(LW, LH, 0).map((v, x, y) => paperH.a[y * LW + x] * 0.6 + (inkA[(y * LW + x) * 4 + 3] / 255) * 0.15);
  const labelMat = new THREE.MeshStandardMaterial({
    name: 'label_aaa',
    map: tex('label_albedo', 'baseColor (paper + print)', labelCv, true),
    normalMap: tex('label_normal', 'normal (paper grain, ink)', normalCanvas(lHeight, 1.4), false),
    roughness: 1,
    metalness: 1,
  });
  labelMat.roughnessMap = labelMat.metalnessMap = tex('label_orm', 'ORM (paper vs ink sheen)', ormCanvas(null, lRough, null), false);
  const labelBackMat = new THREE.MeshStandardMaterial({ name: 'label_back_aaa', color: '#d9d2bf', roughness: 0.9 });

  // ---------------------------------------------------------------- cap
  const CG = 512;
  const cRough = new Field(CG, CG, 0.42).fbm({ cellsX: 16, cellsY: 16, octaves: 4, amp: 0.08, seed: 41 });
  const cH = new Field(CG, CG, 0).fbm({ cellsX: 64, cellsY: 64, octaves: 2, amp: 0.4, seed: 42 });
  for (let i = 0; i < 40; i++) {
    const x = r() * CG, y = r() * CG;
    cRough.blob(x, y, 3 + r() * 8, 2 + r() * 4, -0.12, 'add'); // handled shine
  }
  const capMat = new THREE.MeshStandardMaterial({
    name: 'cap_aaa',
    color: SPEC.cap.color,
    roughness: 1,
    metalness: 1,
    normalMap: tex('cap_normal', 'normal (moulded plastic grain)', normalCanvas(cH, 0.8), false),
  });
  capMat.roughnessMap = capMat.metalnessMap = tex('cap_orm', 'ORM (plastic, handling shine)', ormCanvas(null, cRough, null), false);
  const capG = capGeo({ radial: 240, ridges: SPEC.cap.ridges, ridgeDepth: 0.00042, ridgeSharp: 1, tamper: { radial: 96, bridges: 12 } });

  // ---------------------------------------------------------------- liquid
  const liqGeo = liquidGeo({ radial: 64, wall: SPEC.glass.wall, baseT: SPEC.glass.base, profile: prof, meniscus: 0.0008 });
  const liqMat = new THREE.MeshPhysicalMaterial({ name: 'liquid_aaa', color: SPEC.liquid.color, roughness: 0.03, metalness: 0, ior: 1.33, specularIntensity: 0.6 });

  const root = new THREE.Group();
  root.name = 'bottle_aaa';
  const add = (name, g, m) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    root.add(mesh);
  };
  add('liquid', liqGeo, liqMat);
  add('label_back', labelBack({ radial: 64 }), labelBackMat);
  add('label', labelBand({ radial: 64 }), labelMat);
  add('cap', capG, capMat);
  add('glass', glassGeo, glassMat);
  log('aaa built');
  return {
    root,
    textures,
    notes: {
      method: 'Procedural: LatheGeometry glass solid with wall thickness (64 radial), knurled lathe cap + tamper ring, CylinderGeometry label band; textures generated in-browser with seeded fBm, scratch strokes and paper grain (1K).',
      material: 'glTF PBR + KHR_materials_transmission / volume / ior / specular',
    },
  };
}
