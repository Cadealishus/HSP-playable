import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Builds ONE bottle version (?v=flopops|aaa|bodycam), exports it as GLB and
 * hands the bytes, the editable PNG sources and timings to the Node driver via
 * window.__RESULT__.
 */
const v = new URLSearchParams(location.search).get('v');
const log = (s) => (document.getElementById('log').textContent += '\n' + s);
const t0 = performance.now();
try {
  const mod = await import(`./build-${v}.js`);
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(64, 64);
  const tb = performance.now();
  const { root, textures, notes } = await mod.build({ renderer, log });
  const tBuilt = performance.now();
  root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(root, { binary: true, maxTextureSize: 4096, onlyVisible: true });
  const tExp = performance.now();
  const b64 = (buf) => {
    const u8 = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const tex = textures.map((t) => ({ name: t.name, role: t.role, w: t.canvas.width, h: t.canvas.height, png: t.canvas.toDataURL('image/png') }));
  window.__RESULT__ = {
    ok: true,
    version: v,
    glb: b64(glb),
    glbBytes: glb.byteLength,
    textures: tex,
    notes,
    timings: { importMs: tb - t0, buildMs: tBuilt - tb, exportMs: tExp - tBuilt, totalMs: tExp - t0 },
  };
  log('done ' + glb.byteLength + ' bytes');
} catch (e) {
  window.__RESULT__ = { ok: false, error: String(e && e.stack || e) };
  log('ERROR ' + e.stack);
}
