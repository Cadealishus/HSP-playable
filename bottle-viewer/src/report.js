import { VERSIONS } from './spec.js';
import { INSTANCING_POLICY } from './bench.js';

/** Collect everything the viewer knows into one plain object (the JSON export). */
export function buildReport({ bays, results, genData, manual, ui, spec }) {
  const versions = VERSIONS.map((v) => {
    const c = bays[v.id].loaded;
    if (!c) return { id: v.id, label: v.label, loaded: false };
    const s = c.stats;
    return {
      id: v.id,
      label: v.label,
      description: v.blurb,
      static: {
        triangles: s.triangles,
        vertices: s.vertices,
        meshes: s.meshes,
        materials: s.materials,
        textures: s.textures.map((t) => ({ name: t.name, material: t.material, width: t.width, height: t.height })),
        textureDownloadBytes: s.textureDownloadBytes,
        glbBytes: c.bytes,
        gltfExtensions: s.extensions,
      },
      measured: {
        drawCallsBottleOnly: c.drawCalls,
        drawCallsWholeFrame: c.drawCallsWholeFrame,
        firstLoad: c.timings,
        firstFrameMs: c.firstFrameMs,
        loadMedianOf3: results.loadRepeat[v.id] ?? null,
      },
      estimates: {
        textureMemoryBytes: s.estTextureMemoryBytes,
        method: 'width × height × 4 bytes (RGBA8) × 4/3 (mip chain), per texture',
      },
    };
  });
  return {
    title: 'FLOP OPS bottle realism comparison',
    generatedAt: new Date().toISOString(),
    environment: results.env,
    viewSettingsAtExport: ui,
    referenceBottle: { height: spec.height, glassColor: spec.glass.color, capColor: spec.cap.color, label: { paper: spec.label.paper, ink: spec.label.ink }, liquidFill: spec.liquid.fill },
    versions,
    benchmarks: results.bench,
    benchmarkMethod: {
      isolation: 'Fresh WebGL context per run, one version only, asset downloaded and parsed from scratch, side-by-side bays paused.',
      cameraPath: 'One full orbit over the test duration around the bottle (radius 0.6 m for 1 bottle, 1.05 m for 25, 1.85 m for 100), elevation oscillating 18–23°.',
      instancing: INSTANCING_POLICY,
      fps: 'requestAnimationFrame deltas; vsync-capped.',
      syncFrame: 'render + 1-pixel readPixels (forces GPU completion), median of 20 frames; uncapped.',
      gpu: 'EXT_disjoint_timer_query_webgl2 when exposed; otherwise not available.',
    },
    unavailable: [
      'CPU and GPU utilisation percentages (not exposed to web pages)',
      'Exact VRAM usage (not exposed; texture memory is an estimate)',
      'GPU frame time when EXT_disjoint_timer_query_webgl2 is not exposed (most browsers disable it)',
      'Token counts, credits and monetary cost of generation (not exposed to the generating session; enter manually)',
    ],
    generation: genData ? { ...genData, manualEntries: manual } : null,
    recommendation: recommendationText({ versions, bench: results.bench }),
  };
}

function benchOf(bench, id, count) {
  return bench.find((b) => b.id === id && b.count === count) ?? null;
}

const KB = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
const N = (n) => Math.round(n).toLocaleString('en-US');

/** Plain-text recommendation; numbers come from this run. */
export function recommendationText({ versions, bench }) {
  const by = Object.fromEntries(versions.map((v) => [v.id, v]));
  const ok = versions.every((v) => v.static);
  if (!ok) return ['Assets not loaded yet.'];
  const st = (id) => by[id].static;
  const est = (id) => by[id].estimates.textureMemoryBytes;
  const sync = (id, n) => benchOf(bench, id, n)?.measured.syncFrameMs;
  const benchLine = (id) => {
    const b1 = sync(id, 1), b100 = sync(id, 100);
    if (b1 == null && b100 == null) return 'Run the benchmark on your gaming PC to fill in frame costs.';
    return `Measured sync frame on this machine: ${b1 != null ? b1.toFixed(2) + ' ms for 1 bottle' : '1 bottle not run'}${b100 != null ? `, ${b100.toFixed(2)} ms for 100` : ''}.`;
  };
  return [
    `Current FLOP OPS style (${N(st('flopops').triangles)} triangles, ${KB(st('flopops').glbBytes)} GLB, ~${KB(est('flopops'))} texture memory, estimate). Reads correctly at gameplay distance and is the cheapest by every measure, but up close it is clearly a placeholder: a faceted silhouette, alpha-blended glass that looks like tinted plastic (no refraction, no thickness), a 128×32 label that turns to blocks, and a flat cap. ${benchLine('flopops')}`,
    `Call of Duty-inspired (${N(st('aaa').triangles)} triangles, ${KB(st('aaa').glbBytes)} GLB, ~${KB(est('aaa'))} texture memory, estimate). The biggest visual jump for the money: a smooth silhouette, real refraction through walls with thickness, tinted volume, a readable label with paper grain, a knurled cap and believable wear. The main new cost is transmission: three.js renders the opaque scene once more into a texture whenever transmissive glass is on screen, so it is a scene-wide pass rather than a per-bottle one. ${benchLine('aaa')}`,
    `Bodycam-inspired (${N(st('bodycam').triangles)} triangles, ${KB(st('bodycam').glbBytes)} GLB, ~${KB(est('bodycam'))} texture memory, estimate). The most convincing up close (mould seams, a punt, fingerprints and dust that only show in reflections, a fibrous label with worn edges, thick refractive glass with dispersion), but most of that detail is invisible beyond a couple of metres while its texture memory is the highest. ${benchLine('bodycam')}`,
    'Recommendation: adopt the Call of Duty-inspired level as the FLOP OPS standard for props. It fixes everything that makes the current props read as placeholder while staying cheap enough to scatter. Use bodycam-level assets only where the camera gets close (inspect views, hero props, menus, killcam close-ups), ideally as LOD0 over an AAA-level LOD1. Keep the current style only as a distant LOD or for low-quality settings.',
  ];
}

export function recommendationHTML(rep) {
  const [a, b, c, d] = rep.recommendation;
  if (!b) return `<p>${a}</p>`;
  return `<h2>Recommendation</h2>
    <p><b>Current</b> ${a.replace(/^Current FLOP OPS style /, '')}</p>
    <p><b>AAA</b> ${b.replace(/^Call of Duty-inspired /, '')}</p>
    <p><b>Bodycam</b> ${c.replace(/^Bodycam-inspired /, '')}</p>
    <p><b>Verdict</b> ${d.replace(/^Recommendation: /, '')}</p>
    <p class="note">Export the report to keep these numbers. Benchmark figures are from the machine that ran them; rerun on the PC you play on.</p>`;
}

/** Human-readable report. Every value is labelled MEASURED / ESTIMATE / STATIC / NOT AVAILABLE. */
export function toMarkdown(rep) {
  const L = [];
  const p = (s = '') => L.push(s);
  const ms = (v) => (v == null ? '—' : v.toFixed(2) + ' ms');
  p(`# ${rep.title}`);
  p();
  p(`Generated ${rep.generatedAt}. Labels: **[M]** measured in the browser, **[E]** estimate, **[S]** static (read from the asset file), **[N/A]** not available.`);
  p();
  p('## Environment [M]');
  for (const [k, v] of Object.entries(rep.environment ?? {})) p(`- ${k}: ${v}`);
  p();
  p('## Reference bottle (identical for all versions)');
  p(`- Height ${rep.referenceBottle.height} m, glass ${rep.referenceBottle.glassColor}, cap ${rep.referenceBottle.capColor}, label paper ${rep.referenceBottle.label.paper} / ink ${rep.referenceBottle.label.ink}, liquid fill ${rep.referenceBottle.liquidFill} m`);
  p();
  p('## Asset metrics');
  const vs = rep.versions.filter((v) => v.static);
  p(`| Metric | ${vs.map((v) => v.label).join(' | ')} |`);
  p(`|---|${vs.map(() => '---').join('|')}|`);
  const row = (name, f) => p(`| ${name} | ${vs.map(f).join(' | ')} |`);
  row('Triangles [S]', (v) => N(v.static.triangles));
  row('Vertices [S]', (v) => N(v.static.vertices));
  row('Meshes [S]', (v) => v.static.meshes);
  row('Materials [S]', (v) => v.static.materials);
  row('Draw calls, bottle only [M]', (v) => v.measured.drawCallsBottleOnly);
  row('Textures [S]', (v) => v.static.textures.map((t) => `${t.width}×${t.height}`).join(', '));
  row('Texture download [S]', (v) => KB(v.static.textureDownloadBytes));
  row('Texture memory [E]', (v) => KB(v.estimates.textureMemoryBytes));
  row('Total download (GLB) [M]', (v) => KB(v.static.glbBytes));
  row('First load total [M]', (v) => ms(v.measured.firstLoad.totalMs));
  row('Load median of 3 [M]', (v) => (v.measured.loadMedianOf3 ? ms(v.measured.loadMedianOf3.median) : 'not run'));
  row('glTF extensions [S]', (v) => v.static.gltfExtensions.join(', ') || 'none');
  p();
  p('## Benchmarks [M]');
  p(rep.benchmarkMethod.isolation + ' ' + rep.benchmarkMethod.cameraPath);
  p();
  p(rep.benchmarkMethod.instancing);
  p();
  if (!rep.benchmarks.length) p('_No benchmark was run in this session._');
  else {
    p('| Version | Bottles | Avg FPS | Avg frame | p95 frame | Sync frame | CPU submit | GPU frame | Draw calls | Settings |');
    p('|---|---|---|---|---|---|---|---|---|---|');
    for (const b of rep.benchmarks) {
      const s = b.settings;
      p(`| ${VERSIONS.find((v) => v.id === b.id).label} | ${b.count} | ${b.measured.avgFps?.toFixed(1) ?? '—'} | ${ms(b.measured.avgFrameMs)} | ${ms(b.measured.p95FrameMs)} | ${ms(b.measured.syncFrameMs)} | ${ms(b.measured.cpuSubmitMs)} | ${b.measured.gpuFrameMs != null ? ms(b.measured.gpuFrameMs) : 'N/A'} | ${b.stats.drawCalls} | ${s.width}×${s.height}, ${s.preset}, post ${s.post ? 'on' : 'off'}, ${s.warmupSec}+${s.testSec}s |`);
    }
    p();
    p(`FPS: ${rep.benchmarkMethod.fps} Sync frame: ${rep.benchmarkMethod.syncFrame} GPU: ${rep.benchmarkMethod.gpu}`);
  }
  p();
  p('## Not available [N/A]');
  for (const u of rep.unavailable) p(`- ${u}`);
  p();
  p('## Generation usage');
  if (rep.generation) {
    p('| Task | Method / tools [S] | Authoring wall time [M] | Generator runs [M] | Last run wall time [M] | Revisions [M] | Tokens / credits / cost |');
    p('|---|---|---|---|---|---|---|');
    for (const t of rep.generation.tasks) {
      const m = rep.generation.manualEntries?.[t.id] ?? {};
      const manual = [m.in && `in ${m.in}`, m.out && `out ${m.out}`, m.cost && `cost ${m.cost}`, m.notes].filter(Boolean).join(', ');
      p(`| ${t.label} | ${t.method} (${t.tools}) | ${t.authoringWallMs != null ? (t.authoringWallMs / 60000).toFixed(1) + ' min' : '—'} | ${t.generatorRuns ?? '—'} | ${t.lastRunWallMs != null ? (t.lastRunWallMs / 1000).toFixed(1) + ' s' : '—'} | ${t.revisions ?? '—'} | ${manual ? manual + ' (entered manually)' : 'Not available'} |`);
    }
    p();
    for (const n of rep.generation.notes) p(`- ${n}`);
  }
  p();
  p('## Recommendation');
  for (const r of rep.recommendation) p('- ' + r);
  return L.join('\n') + '\n';
}
