// Compile generation/usage.json from the measured authoring markers
// (generation/authoring-events.txt), the generator run log (generation/log.json)
// and hand-recorded failed runs. Run after any regeneration.
import { readFile, writeFile } from 'node:fs/promises';
const ev = (await readFile('generation/authoring-events.txt', 'utf8')).trim().split('\n').map((l) => {
  const [k, s] = l.split(' ');
  return { k, t: Number(s) * 1000 };
});
const log = JSON.parse(await readFile('generation/log.json', 'utf8'));
const failed = JSON.parse(await readFile('generation/failed-runs.json', 'utf8'));
// sum every start->end (or start->pause / resume->end) segment for a prefix
function segments(prefix) {
  let total = 0, open = null;
  for (const e of ev) {
    if (!e.k.startsWith(prefix)) continue;
    if (/_(start|resume)$/.test(e.k)) open = e.t;
    else if (/_(end|pause)$/.test(e.k) && open != null) { total += e.t - open; open = null; }
  }
  return total || null;
}
const runs = (id) => log.runs.filter((r) => r.version === id);
const task = (id, label, method, tools) => {
  const R = runs(id);
  const fails = failed[id]?.length ?? 0;
  return {
    id, label, method, tools,
    authoringWallMs: segments('bottle_' + id),
    generatorRuns: R.length + fails,
    successfulRuns: R.length,
    failedRuns: fails,
    revisions: Math.max(0, R.length + fails - 1),
    lastRunWallMs: R.at(-1)?.wallMs ?? null,
    runs: R,
    tokens: 'Not available', credits: 'Not available', cost: 'Not available',
  };
};
const usage = {
  tasks: [
    { id: 'shared', label: 'Shared setup (spec, texture kit, geometry kit, generator driver)', method: 'Hand-written JavaScript tooling; three.js r180 vendored from the game', tools: 'Claude Code (file writes, shell), Node 22, headless Chromium (SwiftShader)', authoringWallMs: segments('shared_setup'), generatorRuns: null, revisions: null, lastRunWallMs: null, tokens: 'Not available' },
    task('flopops', 'Bottle 1: Current FLOP OPS style', 'Code-built CylinderGeometry pieces + the game\'s own TextureForge bakes read back to PNG', 'tools/gen/build-flopops.js, game src/materials (read-only), GLTFExporter'),
    task('aaa', 'Bottle 2: Call of Duty-inspired', 'Code-built lathe solids + procedural 1K textures (seeded noise, scratch strokes, paper grain)', 'tools/gen/build-aaa.js, tools/gen/tex.js, GLTFExporter'),
    task('bodycam', 'Bottle 3: Bodycam-inspired', 'Code-built lathe solids + procedural 2K textures (fingerprints, dust, fibres, alpha tear, thickness map)', 'tools/gen/build-bodycam.js, tools/gen/tex.js, GLTFExporter'),
    { id: 'viewer', label: 'Viewer, benchmark and report (shared)', method: 'Hand-written three.js app', tools: 'Claude Code', authoringWallMs: segments('viewer'), generatorRuns: null, revisions: null, lastRunWallMs: null, tokens: 'Not available' },
  ],
  notes: [
    'Authoring wall time is measured between timestamp markers written by the generating session before and after each task (generation/authoring-events.txt). It includes the model\'s writing and thinking time between those markers, so it measures elapsed time, not cost or compute.',
    'Generator runs are counted from generation/log.json (successful) plus generation/failed-runs.json (failed); each run after the first is counted as a revision attempt. "Last run wall time" is the Node-measured time for that run, from launching Chromium to writing the files.',
    'Token counts, credits and monetary cost were not exposed to the generating session (no account usage API was available), so they are "Not available". Enter real values from your account in the Generation usage tab; they are stored in your browser and included in the exported report.',
    'No AI image or 3D generation service was used; all three bottles are procedural code.',
  ],
};
await writeFile('generation/usage.json', JSON.stringify(usage, null, 2));
for (const t of usage.tasks) console.log(t.id, t.authoringWallMs && (t.authoringWallMs / 60000).toFixed(1) + ' min', 'runs', t.generatorRuns, 'last', t.lastRunWallMs);
