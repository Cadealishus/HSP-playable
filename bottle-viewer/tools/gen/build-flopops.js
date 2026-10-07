import * as THREE from 'three';
import { SPEC } from '../../src/spec.js';
import { drawLabel } from './label.js';
import { canvas } from './tex.js';
// The game's own procedural material baker, imported read-only from the game source.
import { MaterialSystem } from '/fps/src/materials/index.js';

/**
 * BASELINE: the reference bottle built exactly the way FLOP OPS builds props.
 *
 * - Geometry: THREE.CylinderGeometry pieces merged like the game's PB builder
 *   (src/world/props.js `bottle()`: radial 10 body, radial 8 neck, 1 height seg,
 *   closed caps), no wall thickness.
 * - Glass: the game's `glass` library material (src/materials/library.js):
 *   MeshPhysicalMaterial, alpha-blended (opacity 0.22, depthWrite off), ior 1.52,
 *   double-sided, envMapIntensity 1.6, with the albedo / normal / ORM set baked
 *   by the game's own TextureForge at the default 'ultra' quality, mapped at the
 *   library's world scale (worldSize 2 m per tile).
 * - Cap: the game's `rubber` baked set (closest library surface to black plastic).
 * - Label: a canvas texture at the game's signage density (PX_PER_M = 300 in
 *   src/world/flopops.js → 0.23 m × 0.072 m ≈ 69 × 22 px, power-of-two 128 × 32).
 * - Liquid: a flat-colour standard material (props carry no liquid in the game).
 *
 * Not reproducible in a glTF: the game's runtime shader extension
 * (src/materials/shader.js: detail noise, macro variation, weathering) and the
 * per-vertex wear/grime masks. They add a small amount of variation on top of
 * the same baked maps; the maps, mesh density and material model are the game's.
 */
export async function build({ renderer, log }) {
  const materials = new MaterialSystem({ renderer });
  await materials.init({ config: { quality: 'ultra', q: { anisotropy: 16 } } });
  const glassSet = materials.getTextureSet('glass');
  const rubberSet = materials.getTextureSet('rubber');
  log(`baked glass ${glassSet.size}² (world ${glassSet.worldSize} m), rubber ${rubberSet.size}²`);

  // Read the baked render targets back into canvases (exportable PNGs).
  const owned = materials._forge._owned;
  const rtOf = (tex) => owned.find((rt) => rt.texture === tex);
  const readRT = (tex) => {
    const rt = rtOf(tex);
    const w = rt.width, h = rt.height;
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    const cv = canvas(w, h);
    const g = cv.getContext('2d');
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(img, 0, 0);
    return cv;
  };
  const textures = [];
  const tex = (name, role, cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.name = name;
    textures.push({ name, role, canvas: cv });
    return t;
  };

  // --- glass: merged cylinders, game style -------------------------------
  const R = SPEC.profile[3][1]; // body radius
  const body = new THREE.CylinderGeometry(R, R, 0.128, 10, 1);
  body.translate(0, 0.064, 0);
  const shoulder = new THREE.CylinderGeometry(0.0152, R, 0.056, 10, 1);
  shoulder.translate(0, 0.128 + 0.028, 0);
  const neck = new THREE.CylinderGeometry(0.0138, 0.0138, 0.03, 8, 1);
  neck.translate(0, 0.184 + 0.015, 0);
  const glassGeo = mergeGeos([body, shoulder, neck]);
  worldUV(glassGeo, glassSet.worldSize);

  const glassMat = new THREE.MeshPhysicalMaterial({
    name: 'glass (game library)',
    // The game's glass albedo bake is a uniform dark grey (window glass, sRGB ~39);
    // the comparison requires the shared bottle green, so the colour comes from the
    // spec and only the game's normal + ORM bakes are used.
    color: new THREE.Color(SPEC.glass.color),
    normalMap: tex('glass_normal', 'normal (game bake)', readRT(glassSet.normal), false),
    roughness: 1,
    metalness: 1,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    ior: 1.52,
    specularIntensity: 1,
    depthWrite: false,
  });
  glassMat.normalScale.set(0.35, 0.35); // library normalStrength
  glassMat.roughnessMap = glassMat.metalnessMap = tex('glass_orm', 'ORM (game bake)', readRT(glassSet.orm), false);
  glassMat.userData.envMapIntensity = 1.6;

  // --- cap -----------------------------------------------------------------
  const C = SPEC.cap;
  const capGeo = new THREE.CylinderGeometry(C.radius, C.radius, C.y1 - C.y0, 8, 1);
  capGeo.translate(0, (C.y0 + C.y1) / 2, 0);
  worldUV(capGeo, rubberSet.worldSize);
  const capAlbedo = readRT(rubberSet.albedo);
  // scale so the bake's mean lands on the shared cap colour
  const mean = meanLinear(capAlbedo);
  const capColor = new THREE.Color(SPEC.cap.color);
  capColor.setRGB(capColor.r / mean, capColor.g / mean, capColor.b / mean).clampScalar?.(0, 1);
  const capMat = new THREE.MeshStandardMaterial({
    name: 'cap (game rubber)',
    color: new THREE.Color(Math.min(1, capColor.r), Math.min(1, capColor.g), Math.min(1, capColor.b)),
    map: tex('cap_albedo', 'baseColor (game bake)', capAlbedo, true),
    normalMap: tex('cap_normal', 'normal (game bake)', readRT(rubberSet.normal), false),
    roughness: 1,
    metalness: 1,
  });
  capMat.roughnessMap = capMat.metalnessMap = tex('cap_orm', 'ORM (game bake)', readRT(rubberSet.orm), false);

  // --- label: 300 px/m canvas, like the game's signage --------------------
  const L = SPEC.label;
  const labelCv = canvas(128, 32);
  drawLabel(labelCv);
  const labelGeo = new THREE.CylinderGeometry(L.radius, L.radius, L.y1 - L.y0, 10, 1, true);
  labelGeo.rotateY(Math.PI);
  labelGeo.translate(0, (L.y0 + L.y1) / 2, 0);
  const labelMat = new THREE.MeshStandardMaterial({
    name: 'label (canvas)',
    map: tex('label_albedo', 'baseColor (canvas, 300 px/m)', labelCv, true),
    roughness: 0.9,
    metalness: 0,
  });

  // --- liquid ----------------------------------------------------------------
  const fill = SPEC.liquid.fill;
  const liqGeo = new THREE.CylinderGeometry(R - 0.003, R - 0.003, fill - 0.004, 10, 1);
  liqGeo.translate(0, 0.004 + (fill - 0.004) / 2, 0);
  const liqMat = new THREE.MeshStandardMaterial({ name: 'liquid', color: SPEC.liquid.color, roughness: 0.35, metalness: 0 });

  const root = new THREE.Group();
  root.name = 'bottle_flopops';
  const add = (name, g, m, order = 0) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.renderOrder = order;
    root.add(mesh);
  };
  add('liquid', liqGeo, liqMat);
  add('label', labelGeo, labelMat);
  add('cap', capGeo, capMat);
  add('glass', glassGeo, glassMat, 1);
  materials.dispose?.();

  return {
    root,
    textures,
    notes: {
      method: 'Procedural geometry (THREE.CylinderGeometry, game PB style) + the game\'s own TextureForge bakes (glass, rubber) read back to PNG; canvas label at game signage density.',
      bakeSizes: { glass: glassSet.size, rubber: rubberSet.size },
      glassAlbedo: 'Game glass albedo bake (uniform dark grey) replaced by the shared bottle green so colours match; normal + ORM are the game bakes.',
      notReproduced: 'Game runtime shader extension (detail/macro/weather noise) and per-vertex wear/grime masks.',
    },
  };
}

function meanLinear(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  const srgb = s / (d.length / 4) / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/** World-space mapping like the game's library materials: one tile = worldSize metres. */
function worldUV(g, worldSize) {
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    const ang = Math.atan2(x, z);
    // side faces: arc length around; cap faces (flat): planar xz
    const isCapFace = Math.abs(g.getAttribute('normal').getY(i)) > 0.9;
    if (isCapFace) uv.setXY(i, x / worldSize + 0.5, z / worldSize + 0.5);
    else uv.setXY(i, (ang * Math.max(r, 0.01)) / worldSize, y / worldSize);
  }
  uv.needsUpdate = true;
}

function mergeGeos(list) {
  const geos = list.map((g) => g.toNonIndexed());
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of geos) { arr.set(g.getAttribute(k).array, o); o += g.getAttribute(k).array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
