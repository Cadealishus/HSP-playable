import * as THREE from 'three';
import { Stage } from './stage.js';
import { loadBottle, sceneStats, measureDrawCalls, disposeObject } from './assets.js';

export const INSTANCING_POLICY =
  'No GPU instancing for any version: a stress test of N bottles is N independent clones (Object3D.clone) that share geometry, materials and textures. Draw calls therefore scale with N × meshes per bottle (plus the transmission pre-pass for transmissive glass).';

/**
 * Isolated benchmark of ONE bottle version at ONE count.
 * A fresh Stage (own WebGL context) at a fixed render resolution and pixel ratio
 * 1, the chosen lighting preset and post settings, the asset loaded from scratch,
 * a warm-up, then a timed run along a scripted camera orbit.
 */
export async function runBench({ id, count, preset, post, bodycam, width, height, warmupSec, testSec, host, onProgress }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = `width:${Math.min(width, 640)}px;height:${Math.min(width, 640) * (height / width)}px`;
  host.replaceChildren(canvas);
  const stage = new Stage(canvas, { width, height, pixelRatio: 1 });
  stage.setPreset(preset);
  stage.setPost(post);
  stage.setBodycam(post && bodycam);

  const load = await loadBottle(id, stage.renderer, stage.scene, stage.camera);
  const group = layout(load.root, count);
  // draw calls: frame with the bottles minus the empty frame (floor + shadows)
  stage.setContent(null);
  const empty = measureDrawCalls(stage);
  stage.setContent(group);
  const full = measureDrawCalls(stage);
  const stats = sceneStats(load.root, load.glbInfo);

  const gl = stage.renderer.getContext();
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const R = radiusFor(count);
  const pose = (t) => {
    const a = t * Math.PI * 2 + 0.4;
    const el = 0.32 + 0.08 * Math.sin(t * Math.PI * 4);
    stage.camera.position.set(Math.sin(a) * R * Math.cos(el), R * Math.sin(el) + 0.09, Math.cos(a) * R * Math.cos(el));
    stage.camera.lookAt(0, count === 1 ? 0.11 : 0.06, 0);
  };

  const frames = [], cpu = [], gpu = [];
  const pending = [];
  let phase = 'warmup';
  const tStart = performance.now();
  let tTest = 0, last = 0;
  await new Promise((resolve) => {
    const step = (now) => {
      const el = (now - tStart) / 1000;
      if (phase === 'warmup' && el >= warmupSec) { phase = 'test'; tTest = now; last = now; }
      const t = phase === 'test' ? (now - tTest) / 1000 / testSec : el / Math.max(0.001, warmupSec);
      pose(t % 1);
      let q = null;
      if (timerExt && phase === 'test') { q = gl.createQuery(); gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q); }
      const c0 = performance.now();
      stage.render(1 / 60);
      const c1 = performance.now();
      if (q) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); pending.push(q); }
      if (phase === 'test') {
        frames.push(now - last);
        cpu.push(c1 - c0);
        last = now;
      }
      // collect finished GPU queries
      for (let i = pending.length - 1; i >= 0; i--) {
        const qq = pending[i];
        if (gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(qq);
          pending.splice(i, 1);
        }
      }
      onProgress?.(phase, phase === 'test' ? Math.min(1, (now - tTest) / 1000 / testSec) : Math.min(1, el / warmupSec));
      if (phase === 'test' && (now - tTest) / 1000 >= testSec) return resolve();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  // uncapped cost: render + 1-pixel readPixels forces the GPU to finish the frame
  const px = new Uint8Array(4);
  const sync = [];
  for (let i = 0; i < 20; i++) {
    pose(i / 20);
    const s0 = performance.now();
    stage.render(1 / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sync.push(performance.now() - s0);
  }
  for (const q of pending) gl.deleteQuery(q);
  const info = {
    debugRenderer: rendererString(gl),
    timerQuery: !!timerExt,
  };
  disposeObject(load.root);
  stage.dispose();
  host.replaceChildren();

  // the first frame's delta can include the warm-up handoff; drop the first sample
  const f = frames.slice(1);
  const avgFrame = mean(f);
  return {
    id,
    count,
    settings: { preset, post, bodycam: post && bodycam, width, height, pixelRatio: 1, warmupSec, testSec },
    load: { bytes: load.bytes, ...load.timings },
    stats: { triangles: stats.triangles * count, meshes: stats.meshes * count, drawCalls: full.calls - empty.calls, drawCallsWholeFrame: full.calls },
    measured: {
      frames: f.length,
      avgFps: f.length ? 1000 / avgFrame : null,
      avgFrameMs: avgFrame,
      p95FrameMs: pct(f, 0.95),
      cpuSubmitMs: mean(cpu),
      syncFrameMs: median(sync),
      gpuFrameMs: gpu.length ? mean(gpu) : null,
      gpuSamples: gpu.length,
    },
    info,
  };
}

/** Grid layout for the stress test: same spacing and yaw pattern for every version. */
export function layout(root, count) {
  const g = new THREE.Group();
  if (count === 1) { g.add(root); return g; }
  const n = Math.round(Math.sqrt(count));
  const sp = 0.115;
  for (let i = 0; i < count; i++) {
    const c = i === 0 ? root : root.clone();
    const x = (i % n) - (n - 1) / 2, z = Math.floor(i / n) - (n - 1) / 2;
    c.position.set(x * sp, 0, z * sp);
    c.rotation.y = (i * 2.399) % (Math.PI * 2);
    g.add(c);
  }
  return g;
}

export function radiusFor(count) {
  return count === 1 ? 0.6 : count <= 25 ? 1.05 : 1.85;
}

function rendererString(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch {
    return 'unavailable';
  }
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function pct(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
