// Generate one bottle version as its own tracked task:
//   node tools/build-assets.mjs <flopops|aaa|bodycam>
// Serves the repo root (the baseline imports the game's own material baker from
// fps/src, read-only), drives tools/generate.html in headless Chromium, writes
// assets/<id>/bottle.glb + textures/*.png + manifest.json, and appends a measured
// entry to generation/log.json.
import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, '..');
const REPO = resolve(VIEWER, '..');
const id = process.argv[2];
if (!['flopops', 'aaa', 'bodycam'].includes(id)) { console.error('usage: build-assets.mjs flopops|aaa|bodycam'); process.exit(1); }
const pw = await import(resolve(REPO, 'fps/node_modules/playwright/index.mjs'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer(async (req, res) => {
  try {
    const f = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(REPO)) throw 0;
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { console.log('404', req.url); res.writeHead(404); res.end(); }
}).listen(0);
await new Promise((r) => srv.on('listening', r));
const started = new Date();
const t0 = performance.now();
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else console.log('[page]', m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/bottle-viewer/tools/generate.html?v=${id}`);
await page.waitForFunction(() => window.__RESULT__, null, { timeout: 1800000, polling: 500 });
const R = await page.evaluate(() => window.__RESULT__);
await browser.close(); srv.close();
const elapsedMs = performance.now() - t0;
if (!R.ok) { console.error(R.error, errors); process.exit(2); }
const out = join(VIEWER, 'assets', id);
await mkdir(join(out, 'textures'), { recursive: true });
await writeFile(join(out, 'bottle.glb'), Buffer.from(R.glb, 'base64'));
const texMeta = [];
for (const t of R.textures) {
  const buf = Buffer.from(t.png.split(',')[1], 'base64');
  await writeFile(join(out, 'textures', t.name + '.png'), buf);
  texMeta.push({ name: t.name, role: t.role, width: t.w, height: t.h, pngBytes: buf.length });
}
const manifest = { version: id, generatedAt: started.toISOString(), glbBytes: R.glbBytes, textures: texMeta, notes: R.notes, pageTimings: R.timings };
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
// append the measured generation run
const logPath = join(VIEWER, 'generation', 'log.json');
await mkdir(dirname(logPath), { recursive: true });
let log = { runs: [] };
try { log = JSON.parse(await readFile(logPath, 'utf8')); } catch {}
const prior = log.runs.filter((r) => r.version === id).length;
log.runs.push({ version: id, run: prior + 1, startedAt: started.toISOString(), wallMs: Math.round(elapsedMs), pageTimings: R.timings, glbBytes: R.glbBytes, consoleErrors: errors.length });
await writeFile(logPath, JSON.stringify(log, null, 2));
console.log(JSON.stringify({ id, glbBytes: R.glbBytes, wallMs: Math.round(elapsedMs), timings: R.timings, textures: texMeta.map((t) => `${t.name} ${t.width}x${t.height}`), errors }, null, 1));
