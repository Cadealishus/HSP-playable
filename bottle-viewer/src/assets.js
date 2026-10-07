import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const assetURL = (id) => `assets/${id}/bottle.glb`;

/**
 * Load one bottle into `renderer`'s context and MEASURE it:
 *   download (fetch, cache: no-store) -> parse (GLTFLoader) -> GPU upload
 *   (renderer.compile + initTexture) -> first rendered frame (caller).
 * Returns the scene plus static stats read from the asset itself.
 */
export async function loadBottle(id, renderer, scene, camera) {
  const t0 = performance.now();
  let res = await fetch(assetURL(id) + `?t=${Date.now()}`, { cache: 'no-store' });
  // the claude.ai artifact host does not serve .glb; the hosted copy carries the
  // same bytes as bottle.glb.wasm (a served binary type)
  if (!res.ok) res = await fetch(assetURL(id) + `.wasm?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const tFetched = performance.now();
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const tParsed = performance.now();
  const root = gltf.scene;
  root.name = id;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.userData?.envMapIntensity) m.envMapIntensity = m.userData.envMapIntensity;
    // uniform shadow policy for every version: glass does not cast (three has no
    // caustics, a black glass shadow is wrong); opaque parts cast and receive.
    const glassy = m.transmission > 0 || m.transparent;
    o.castShadow = !glassy;
    o.receiveShadow = true;
  });
  // GPU upload: textures + shader programs for this scene
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'thicknessMap', 'transmissionMap', 'alphaMap', 'clearcoatNormalMap', 'specularIntensityMap']) {
      if (o.material[k]) renderer.initTexture(o.material[k]);
    }
  });
  if (scene && camera) {
    scene.add(root);
    await renderer.compileAsync(root, camera, scene);
    scene.remove(root);
  }
  const tUploaded = performance.now();
  return {
    root,
    bytes: buf.byteLength,
    glbInfo: parseGLB(buf),
    timings: { fetchMs: tFetched - t0, parseMs: tParsed - tFetched, uploadMs: tUploaded - tParsed, totalMs: tUploaded - t0 },
  };
}

/** Read the GLB JSON chunk: per-image byte sizes and mime types. */
export function parseGLB(buf) {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const images = (json.images ?? []).map((im, i) => ({
    index: i,
    name: im.name ?? `image_${i}`,
    mimeType: im.mimeType,
    bytes: im.bufferView !== undefined ? json.bufferViews[im.bufferView].byteLength : 0,
  }));
  const extensions = json.extensionsUsed ?? [];
  return { images, extensions, meshes: json.meshes?.length ?? 0, materials: json.materials?.length ?? 0 };
}

/** Static geometry / material / texture stats from a loaded scene. */
export function sceneStats(root, glbInfo) {
  let tris = 0, verts = 0, meshes = 0;
  const mats = new Set(), texs = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.__wire) return;
    meshes++;
    const g = o.geometry;
    verts += g.getAttribute('position').count;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const m = o.userData.__orig ?? o.material;
    mats.add(m);
    for (const k of Object.keys(m)) {
      const t = m[k];
      if (t && t.isTexture && !texs.has(t.uuid)) texs.set(t.uuid, { slot: k, tex: t, material: m.name });
    }
  });
  const textures = [];
  for (const { slot, tex, material } of texs.values()) {
    const img = tex.image;
    const w = img?.width ?? 0, h = img?.height ?? 0;
    textures.push({
      name: tex.name || slot,
      material,
      slots: slotsOf(root, tex),
      width: w,
      height: h,
      // ESTIMATE: RGBA8 + full mip chain (×4/3). Drivers may pad, compress or
      // keep the decoded source; the browser does not expose real VRAM.
      estGpuBytes: Math.round(w * h * 4 * (4 / 3)),
    });
  }
  // match GLB image byte sizes onto textures by image order of first use
  const imgBytes = glbInfo.images.reduce((s, i) => s + i.bytes, 0);
  return {
    triangles: Math.round(tris),
    vertices: verts,
    meshes,
    materials: mats.size,
    textures,
    textureCount: textures.length,
    textureDownloadBytes: imgBytes,
    estTextureMemoryBytes: textures.reduce((s, t) => s + t.estGpuBytes, 0),
    images: glbInfo.images,
    extensions: glbInfo.extensions,
  };
}

function slotsOf(root, tex) {
  const s = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.userData.__orig ?? o.material;
    for (const k of Object.keys(m)) if (m[k] === tex) s.add(k);
  });
  return [...s];
}

/** Draw calls for this content alone: one render with only it in the scene. */
export function measureDrawCalls(stage) {
  const r = stage.renderer;
  const prev = r.info.autoReset;
  r.info.autoReset = false;
  r.info.reset();
  stage.renderer.render(stage.scene, stage.camera);
  const calls = r.info.render.calls;
  const tris = r.info.render.triangles;
  r.info.autoReset = prev;
  return { calls, renderedTriangles: tris };
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    const m = o.userData.__orig ?? o.material;
    for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
    m.dispose();
  });
}
