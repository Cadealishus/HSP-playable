import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Stage } from './stage.js';
import { VERSIONS, SPEC } from './spec.js';
import { PRESETS } from './lighting.js';
import { loadBottle, sceneStats, measureDrawCalls, disposeObject } from './assets.js';
import { runBench, INSTANCING_POLICY } from './bench.js';
import { buildReport, toMarkdown, recommendationHTML } from './report.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const UI = {
  layout: 'side', preset: 'studio', channel: 'final', auto: false, wire: false, post: true, bodycam: false,
};
const CAM_POS = new THREE.Vector3(0, 0.15, 0.62);
const CAM_TARGET = new THREE.Vector3(0, 0.112, 0);
const PR = Math.min(window.devicePixelRatio || 1, 2);

const bays = {};
const results = { load: {}, loadRepeat: {}, bench: [], env: {} };
let paused = false;
let angle = 0;

// ------------------------------------------------------------------ stages
for (const v of VERSIONS) {
  const el = document.createElement('div');
  el.className = 'bay';
  el.innerHTML = `<canvas id="cv-${v.id}" aria-label="${v.label} bottle render"></canvas><div class="tag">${v.label}</div><div class="cam" hidden></div><div class="sub"></div><div class="status">loading…</div>`;
  $('#bays').append(el);
  const stage = new Stage(el.querySelector('canvas'), { width: 400, height: 520, pixelRatio: PR, preserve: false });
  stage.camera.position.copy(CAM_POS);
  const controls = new OrbitControls(stage.camera, stage.canvas);
  controls.target.copy(CAM_TARGET);
  controls.enableDamping = false;
  controls.minDistance = 0.12;
  controls.maxDistance = 2.5;
  controls.update();
  bays[v.id] = { v, el, stage, controls, loaded: null };
}

// synchronized orbit / zoom: whichever bay moved drives the others
let syncing = false;
for (const b of Object.values(bays)) {
  b.controls.addEventListener('change', () => {
    if (syncing) return;
    syncing = true;
    for (const o of Object.values(bays)) {
      if (o === b) continue;
      o.stage.camera.position.copy(b.stage.camera.position);
      o.controls.target.copy(b.controls.target);
      o.controls.update();
    }
    syncing = false;
  });
}

function resetCamera() {
  for (const b of Object.values(bays)) {
    b.stage.camera.position.copy(CAM_POS);
    b.controls.target.copy(CAM_TARGET);
    b.controls.update();
  }
}

function layoutBays() {
  const wrap = $('#bays');
  const W = wrap.clientWidth;
  const inspect = UI.layout !== 'side';
  wrap.classList.toggle('inspect', inspect);
  let w, h;
  if (inspect) {
    w = W;
    h = Math.round(Math.min(window.innerHeight * 0.72, W * 0.66));
  } else {
    const cols = window.innerWidth <= 900 ? 1 : 3;
    w = Math.floor((W - 12 * (cols - 1)) / cols);
    h = Math.round(Math.min(window.innerHeight * 0.62, w * 1.3));
  }
  for (const b of Object.values(bays)) {
    const show = !inspect || UI.layout === b.v.id;
    b.el.hidden = !show;
    if (show) b.stage.setSize(w, h); // identical size for every visible bay
  }
  $('#fairness').textContent =
    `All bays: ${w}×${h} CSS px at device pixel ratio ${PR} (${Math.round(w * PR)}×${Math.round(h * PR)} rendered), same camera, lens (30° vFOV), lighting preset, exposure, tone mapping (ACES, as in the game) and post chain. Glass casts no shadow in every version (three.js has no caustics); opaque parts cast and receive.`;
}
window.addEventListener('resize', layoutBays);

// --------------------------------------------------------------- controls
const bind = (id, key, fn) => $(id).addEventListener('change', (e) => {
  UI[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  fn?.();
});
bind('#layout', 'layout', layoutBays);
bind('#preset', 'preset', () => eachStage((s) => s.setPreset(UI.preset)));
bind('#channel', 'channel', () => eachStage((s) => s.setView(UI.channel)));
bind('#auto', 'auto');
bind('#wire', 'wire', () => eachStage((s) => s.setWireframe(UI.wire)));
bind('#post', 'post', applyPost);
bind('#bodycam', 'bodycam', applyPost);
$('#reset').addEventListener('click', resetCamera);
$('#shot').addEventListener('click', screenshot);
function eachStage(fn) { for (const b of Object.values(bays)) fn(b.stage); }
function applyPost() {
  $('#bodycam').disabled = !UI.post;
  const cam = UI.post && UI.bodycam;
  eachStage((s) => { s.setPost(UI.post); s.setBodycam(cam); });
  for (const b of Object.values(bays)) {
    const tag = b.el.querySelector('.cam');
    tag.hidden = !cam;
  }
}

// ------------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    if (UI.auto) angle += dt * 0.45;
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    for (const b of Object.values(bays)) {
      if (b.el.hidden || !b.loaded) continue;
      b.stage.content.rotation.y = angle;
      if (UI.post && UI.bodycam) b.el.querySelector('.cam').textContent = `● REC  BODY CAM 03  ${stamp}`;
      b.stage.render(dt);
    }
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------- loading
async function loadAll() {
  for (const b of Object.values(bays)) {
    const s = b.stage;
    try {
      // load sequentially so the measured load time is not shared with another load
      const L = await loadBottle(b.v.id, s.renderer, s.scene, s.camera);
      s.setContent(null);
      const empty = measureDrawCalls(s);
      s.setContent(L.root);
      const full = measureDrawCalls(s);
      const t0 = performance.now();
      s.render(0);
      s.renderer.getContext().finish();
      const firstFrameMs = performance.now() - t0;
      const stats = sceneStats(L.root, L.glbInfo);
      b.loaded = { ...L, stats, drawCalls: full.calls - empty.calls, drawCallsWholeFrame: full.calls, firstFrameMs };
      results.load[b.v.id] = { bytes: L.bytes, ...L.timings, firstFrameMs };
      b.el.querySelector('.status').remove();
      b.el.querySelector('.sub').textContent = `${fmtInt(stats.triangles)} tris · ${stats.textureCount} textures · ${fmtBytes(L.bytes)}`;
    } catch (e) {
      b.el.querySelector('.status').textContent = 'Load failed: ' + e.message;
      console.error(e);
    }
  }
  results.env = envInfo();
  renderMetrics();
  renderTextures();
  window.__VIEWER_READY__ = true;
}

function envInfo() {
  const gl = bays.flopops.stage.renderer.getContext();
  let gpu = 'unavailable';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch {}
  return {
    userAgent: navigator.userAgent,
    gpuRendererString: gpu,
    gpuTimerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    devicePixelRatio: window.devicePixelRatio,
    three: THREE.REVISION,
    date: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ tabs
for (const t of document.querySelectorAll('[role=tab]')) {
  t.addEventListener('click', () => {
    for (const o of document.querySelectorAll('[role=tab]')) {
      const on = o === t;
      o.setAttribute('aria-selected', on);
      $('#panel-' + o.dataset.tab).hidden = !on;
    }
    if (t.dataset.tab === 'report') renderReport();
  });
}

// --------------------------------------------------------------- metrics
const M = (k) => `<span class="pill ${k}">${{ m: 'measured', e: 'estimate', n: 'n/a', s: 'static' }[k]}</span>`;
function renderMetrics() {
  const cols = VERSIONS.map((v) => bays[v.id].loaded);
  const row = (label, kind, f) => `<tr><th scope="row">${label} ${M(kind)}</th>${cols.map((c) => `<td class="num">${c ? f(c) : '—'}</td>`).join('')}</tr>`;
  const rep = (id) => results.loadRepeat[id];
  $('#panel-metrics').innerHTML = `
    <div class="tbl"><table>
      <thead><tr><th>Per bottle</th>${VERSIONS.map((v) => `<th>${v.label}</th>`).join('')}</tr></thead>
      <tbody>
        ${row('Triangles', 's', (c) => fmtInt(c.stats.triangles))}
        ${row('Vertices', 's', (c) => fmtInt(c.stats.vertices))}
        ${row('Meshes', 's', (c) => c.stats.meshes)}
        ${row('Materials', 's', (c) => c.stats.materials)}
        ${row('Draw calls (bottle only)', 'm', (c) => `${c.drawCalls} <span class="note">(frame total ${c.drawCallsWholeFrame} incl. floor)</span>`)}
        ${row('Textures', 's', (c) => c.stats.textures.map((t) => `${t.width}×${t.height}`).join('<br>'))}
        ${row('Texture download size', 's', (c) => fmtBytes(c.stats.textureDownloadBytes))}
        ${row('Texture memory (RGBA8 + mips)', 'e', (c) => fmtBytes(c.stats.estTextureMemoryBytes))}
        ${row('Total asset download (GLB)', 'm', (c) => fmtBytes(c.bytes))}
        ${row('Load: fetch / parse / GPU upload', 'm', (c) => `${ms(c.timings.fetchMs)} / ${ms(c.timings.parseMs)} / ${ms(c.timings.uploadMs)}`)}
        ${row('Load total (first load, no cache)', 'm', (c) => ms(c.timings.totalMs))}
        ${row('First frame after load', 'm', (c) => ms(c.firstFrameMs))}
        ${row('Load total, median of 3 (fresh context)', 'm', (c) => (rep(c.root.name) ? ms(rep(c.root.name).median) : '<span class="note">run below</span>'))}
        ${row('glTF extensions', 's', (c) => c.stats.extensions.join('<br>') || 'none')}
      </tbody>
    </table></div>
    <div class="bar"><button type="button" id="reload3">Re-measure load time (3× each, fresh context)</button><span class="progress" id="reloadProg"></span></div>
    <p class="note">Draw calls are counted by three.js (renderer.info) for one frame with the bottle, minus the same frame without it, so they include the shadow pass and, for transmissive glass, the transmission pre-pass. Texture memory is an estimate: width × height × 4 bytes × 4/3 for mipmaps. Browsers do not expose real VRAM, CPU or GPU utilisation, so none are shown.</p>`;
  $('#reload3').addEventListener('click', remeasureLoads);
}

async function remeasureLoads() {
  const btn = $('#reload3');
  btn.disabled = true;
  paused = true;
  const host = document.createElement('div');
  try {
    for (const v of VERSIONS) {
      const times = [];
      for (let i = 0; i < 3; i++) {
        $('#reloadProg').textContent = `${v.short}: run ${i + 1}/3…`;
        const cv = document.createElement('canvas');
        const st = new Stage(cv, { width: 640, height: 640, pixelRatio: 1 });
        const L = await loadBottle(v.id, st.renderer, st.scene, st.camera);
        times.push(L.timings.totalMs);
        disposeObject(L.root);
        st.dispose();
      }
      times.sort((a, b) => a - b);
      results.loadRepeat[v.id] = { runs: times, median: times[1] };
    }
    $('#reloadProg').textContent = 'done';
  } finally {
    paused = false;
    btn.disabled = false;
    host.remove();
  }
  renderMetrics();
}

// -------------------------------------------------------------- benchmark
function renderBenchPanel() {
  const P = PRESETS;
  $('#panel-bench').innerHTML = `
    <p class="note">Each run is isolated: a fresh WebGL context at a fixed resolution and pixel ratio 1, the bottle downloaded and parsed from scratch, only that version in the scene, a warm-up, then a timed orbit (one full revolution over the test time, elevation 18–23°, same path for every version). The side-by-side bays are paused while it runs. ${INSTANCING_POLICY}</p>
    <div class="bar">
      <label for="bVersions">Versions
        <select id="bVersions"><option value="all">All three</option>${VERSIONS.map((v) => `<option value="${v.id}">${v.label}</option>`).join('')}</select></label>
      <span class="ctl">Bottles <label for="bc1"><input type="checkbox" id="bc1" checked> 1</label><label for="bc25"><input type="checkbox" id="bc25" checked> 25</label><label for="bc100"><input type="checkbox" id="bc100" checked> 100</label></span>
      <label for="bRes">Resolution <select id="bRes"><option value="1280x720">1280×720</option><option value="1920x1080">1920×1080</option><option value="640x360">640×360</option></select></label>
      <label for="bWarm">Warm-up s <input type="number" id="bWarm" value="${params.get('benchWarm') ?? 2}" min="0" step="0.5" style="width:4.5em"></label>
      <label for="bTest">Test s <input type="number" id="bTest" value="${params.get('benchTest') ?? 8}" min="1" step="1" style="width:4.5em"></label>
      <button class="primary" type="button" id="bRun">Run benchmark</button>
      <span class="progress" id="bProg"></span>
    </div>
    <p class="note" id="bSettings"></p>
    <div id="benchHost"></div>
    <div class="tbl" id="bTable"></div>
    <p class="note">FPS and frame time come from requestAnimationFrame and are capped by the display refresh (vsync), so a light scene reads as 60 (or your refresh rate). <b>Sync frame</b> is uncapped: render, then read one pixel back, which waits for the GPU to finish (median of 20 frames). <b>CPU submit</b> is the JavaScript time spent issuing the frame. <b>GPU</b> uses EXT_disjoint_timer_query_webgl2 and is shown only when this browser exposes it.</p>`;
  $('#bRun').addEventListener('click', runBenchmarks);
  renderBenchTable();
}

async function runBenchmarks() {
  const btn = $('#bRun');
  btn.disabled = true;
  paused = true;
  const ids = $('#bVersions').value === 'all' ? VERSIONS.map((v) => v.id) : [$('#bVersions').value];
  const counts = [1, 25, 100].filter((n) => $('#bc' + n).checked);
  const [width, height] = $('#bRes').value.split('x').map(Number);
  const warmupSec = Number($('#bWarm').value), testSec = Number($('#bTest').value);
  $('#bSettings').textContent = `Settings for this run: lighting "${PRESETS[UI.preset].label}", post-processing ${UI.post ? 'on' : 'off'}, bodycam effect ${UI.post && UI.bodycam ? 'on' : 'off'}, ${width}×${height} @1x, warm-up ${warmupSec}s, test ${testSec}s.`;
  try {
    for (const count of counts) {
      for (const id of ids) {
        const label = VERSIONS.find((v) => v.id === id).short;
        const r = await runBench({
          id, count, preset: UI.preset, post: UI.post, bodycam: UI.bodycam, width, height, warmupSec, testSec,
          host: $('#benchHost'),
          onProgress: (ph, f) => ($('#bProg').textContent = `${label} ×${count}: ${ph} ${Math.round(f * 100)}%`),
        });
        results.bench = results.bench.filter((x) => !(x.id === id && x.count === count));
        results.bench.push(r);
        renderBenchTable();
      }
    }
    $('#bProg').textContent = 'Benchmark complete.';
  } catch (e) {
    $('#bProg').textContent = 'Benchmark failed: ' + e.message;
    console.error(e);
  } finally {
    paused = false;
    btn.disabled = false;
  }
}

function renderBenchTable() {
  if (!results.bench.length) {
    $('#bTable').innerHTML = '<p class="note" style="padding:10px">No results yet. Run the benchmark on the machine you play on; numbers from another machine do not transfer.</p>';
    return;
  }
  const rows = [...results.bench].sort((a, b) => a.count - b.count || VERSIONS.findIndex((v) => v.id === a.id) - VERSIONS.findIndex((v) => v.id === b.id));
  $('#bTable').innerHTML = `<table><thead><tr>
    <th>Version</th><th>Bottles</th><th>Avg FPS ${M('m')}</th><th>Avg frame ${M('m')}</th><th>p95 frame ${M('m')}</th><th>Sync frame ${M('m')}</th><th>CPU submit ${M('m')}</th><th>GPU frame</th><th>Draw calls ${M('m')}</th><th>Triangles ${M('s')}</th><th>Load ${M('m')}</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${VERSIONS.find((v) => v.id === r.id).label}</td><td class="num">${r.count}</td>
      <td class="num">${r.measured.avgFps?.toFixed(1) ?? '—'}</td><td class="num">${ms(r.measured.avgFrameMs)}</td><td class="num">${ms(r.measured.p95FrameMs)}</td>
      <td class="num">${ms(r.measured.syncFrameMs)}</td><td class="num">${ms(r.measured.cpuSubmitMs)}</td>
      <td class="num">${r.measured.gpuFrameMs != null ? ms(r.measured.gpuFrameMs) + ' ' + M('m') : M('n')}</td>
      <td class="num">${r.stats.drawCalls}</td><td class="num">${fmtInt(r.stats.triangles)}</td><td class="num">${ms(r.load.totalMs)}</td></tr>`).join('')}
    </tbody></table>`;
}

// ---------------------------------------------------------------- textures
function renderTextures() {
  const panel = $('#panel-textures');
  panel.innerHTML = `<p class="note">Every texture each version ships, decoded from its GLB, at its real resolution (thumbnails are scaled). Use the Shading menu above to view base colour, normal, ORM or a UV checker on the models themselves. Editable PNG sources live in <code>assets/&lt;version&gt;/textures/</code>.</p><div class="grid3" id="texCols"></div>`;
  for (const v of VERSIONS) {
    const c = bays[v.id].loaded;
    const col = document.createElement('div');
    col.className = 'card';
    col.innerHTML = `<h3>${v.label}</h3><p class="note">${v.blurb}</p><div class="texgrid"></div>`;
    $('#texCols').append(col);
    if (!c) continue;
    const grid = col.querySelector('.texgrid');
    const seen = new Set();
    c.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.userData.__orig ?? o.material;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'thicknessMap', 'alphaMap']) {
        const t = m[k];
        if (!t || seen.has(t.uuid)) continue;
        seen.add(t.uuid);
        const img = t.image;
        const cv = document.createElement('canvas');
        const s = 160 / Math.max(img.width, img.height);
        cv.width = Math.max(1, Math.round(img.width * s));
        cv.height = Math.max(1, Math.round(img.height * s));
        try { cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); } catch {}
        const d = document.createElement('div');
        d.className = 'tex';
        d.append(cv);
        const slot = k === 'roughnessMap' ? 'ORM' : k.replace('Map', '');
        d.insertAdjacentHTML('beforeend', `<span>${m.name} · ${slot}</span><span>${img.width}×${img.height}</span>`);
        grid.append(d);
      }
    });
  }
}

// ------------------------------------------------------- generation usage
const MANUAL_KEY = 'bottleviewer.manualUsage';
let genData = null;
async function loadGeneration() {
  try {
    genData = await (await fetch('generation/usage.json', { cache: 'no-store' })).json();
  } catch {
    genData = null;
  }
  renderGeneration();
}
function manualUsage() {
  try { return JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '{}'); } catch { return {}; }
}
function renderGeneration() {
  const p = $('#panel-gen');
  if (!genData) { p.innerHTML = '<p class="note">generation/usage.json not found.</p>'; return; }
  const man = manualUsage();
  const tasks = genData.tasks;
  p.innerHTML = `
    <p class="note">What it took to CREATE each bottle, tracked as separate tasks. Times are wall-clock measurements, not cost. Token, credit and money figures were not exposed to the generating session, so they are marked n/a; enter the real values from your account below (kept in this browser only and included in the exported report).</p>
    <div class="tbl"><table><thead><tr><th>Task</th><th>Method and tools ${M('s')}</th><th>Authoring wall time ${M('m')}</th><th>Generator runs ${M('m')}</th><th>Last run wall time ${M('m')}</th><th>Revision attempts ${M('m')}</th><th>Tokens / credits / cost</th></tr></thead><tbody>
    ${tasks.map((t) => `<tr><td><b>${t.label}</b></td><td>${t.method}<br><span class="note">${t.tools}</span></td>
      <td class="num">${t.authoringWallMs != null ? mins(t.authoringWallMs) : '—'}</td>
      <td class="num">${t.generatorRuns ?? '—'}</td><td class="num">${t.lastRunWallMs != null ? ms(t.lastRunWallMs) : '—'}</td>
      <td class="num">${t.revisions ?? '—'}</td><td>${M('n')} Not available</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">${genData.notes.join(' ')}</p>
    <h3>Enter real usage</h3>
    <div class="tbl manual"><table><thead><tr><th>Task</th><th>Input tokens</th><th>Output tokens</th><th>Credits / cost</th><th>Notes</th></tr></thead><tbody>
    ${tasks.map((t) => `<tr><td>${t.label}</td>${['in', 'out', 'cost', 'notes'].map((f) => `<td><input type="text" id="man-${t.id}-${f}" data-task="${t.id}" data-f="${f}" value="${(man[t.id]?.[f] ?? '').replace(/"/g, '&quot;')}" aria-label="${t.label} ${f}"></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  p.querySelectorAll('input[data-task]').forEach((inp) => inp.addEventListener('input', () => {
    const m = manualUsage();
    (m[inp.dataset.task] ??= {})[inp.dataset.f] = inp.value;
    try { localStorage.setItem(MANUAL_KEY, JSON.stringify(m)); } catch {}
  }));
}

// ------------------------------------------------------------------ report
function currentReport() {
  return buildReport({ bays, results, genData, manual: manualUsage(), ui: { ...UI }, spec: SPEC });
}
function renderReport() {
  const rep = currentReport();
  $('#panel-report').innerHTML = `
    <div class="bar"><button class="primary" type="button" id="expMd">Export report (.md)</button><button type="button" id="expJson">Export data (.json)</button><span class="progress" id="expProg"></span></div>
    <div class="card reco">${recommendationHTML(rep)}</div>`;
  $('#expMd').addEventListener('click', () => save('bottle-realism-report.md', new Blob([toMarkdown(currentReport())], { type: 'text/markdown' })));
  $('#expJson').addEventListener('click', () => save('bottle-realism-report.json', new Blob([JSON.stringify(currentReport(), null, 2)], { type: 'application/json' })));
}

// ------------------------------------------------------------ screenshots
async function screenshot() {
  const vis = Object.values(bays).filter((b) => !b.el.hidden && b.loaded);
  const w = vis[0].stage.canvas.width, h = vis[0].stage.canvas.height;
  const band = Math.round(34 * PR);
  const out = document.createElement('canvas');
  out.width = w * vis.length;
  out.height = h + band;
  const g = out.getContext('2d');
  g.fillStyle = '#121416';
  g.fillRect(0, 0, out.width, out.height);
  vis.forEach((b, i) => {
    b.stage.render(0); // draw now, then copy before the browser clears the buffer
    g.drawImage(b.stage.canvas, i * w, 0);
    g.fillStyle = '#e6e2d8';
    g.font = `600 ${Math.round(16 * PR)}px 'Barlow Condensed', sans-serif`;
    g.fillText(b.v.label.toUpperCase(), i * w + 10 * PR, h + band * 0.68);
  });
  g.fillStyle = '#9a9d9f';
  g.font = `${Math.round(11 * PR)}px 'IBM Plex Mono', monospace`;
  const meta = `${PRESETS[UI.preset].label} · ${UI.channel} · post ${UI.post ? 'on' : 'off'}${UI.post && UI.bodycam ? ' · bodycam fx' : ''}`;
  g.fillText(meta, out.width - g.measureText(meta).width - 10 * PR, h + band * 0.68);
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  await save(`bottle-comparison-${UI.preset}.png`, blob);
}

/** Save a file: the claude.ai downloads capability inside an artifact, a normal download elsewhere. */
async function save(filename, blob) {
  try {
    const dl = window.claude?.use ? await window.claude.use('downloads') : null;
    if (dl) { await dl.save({ filename, data: blob }); return; }
  } catch (e) {
    if (e?.code === 'declined') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ---------------------------------------------------------------- format
export function fmtInt(n) { return n == null ? '—' : Math.round(n).toLocaleString('en-US'); }
export function fmtBytes(b) {
  if (b == null) return '—';
  return b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB';
}
function ms(v) { return v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(2) + ' s' : v.toFixed(v < 10 ? 2 : 1) + ' ms'; }
function mins(v) { return v >= 60000 ? (v / 60000).toFixed(1) + ' min' : (v / 1000).toFixed(0) + ' s'; }

// ------------------------------------------------------------------ boot
layoutBays();
applyPost();
renderBenchPanel();
requestAnimationFrame(frame);
loadAll();
loadGeneration();
window.__VIEWER__ = { bays, results, UI, runBenchmarks, currentReport };
