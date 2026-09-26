#!/usr/bin/env node
// Screenshot harness. Boots the game in headless Chromium (SwiftShader WebGL2) with ?harness,
// applies registered shots, and saves PNGs. Used by agents and the visual-review loop.
//
//   node tools/shoot.mjs overview weapon-hip        # specific shots
//   node tools/shoot.mjs --all                      # every registered shot
//   node tools/shoot.mjs --list                     # list shots
//   node tools/shoot.mjs --out shots/r1 --size 1920x1080 --params quality=ultra overview
//   node tools/shoot.mjs --eval "__fps.game.player.position.toArray()"   # run JS, print JSON result
//   --fresh    reload the page before each shot (slower, fully isolated)
//   --timeout  seconds to wait for boot (default 600)
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = { out: join(root, 'shots', 'latest'), size: '1600x900', params: '', timeout: 600, shots: [], evals: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = resolve(args[++i]);
  else if (a === '--size') opt.size = args[++i];
  else if (a === '--params') opt.params = args[++i];
  else if (a === '--timeout') opt.timeout = Number(args[++i]);
  else if (a === '--eval') opt.evals.push(args[++i]);
  else if (a === '--all') opt.all = true;
  else if (a === '--list') opt.list = true;
  else if (a === '--fresh') opt.fresh = true;
  else opt.shots.push(a);
}
const [W, H] = opt.size.split('x').map(Number);
mkdirSync(opt.out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const url = `http://127.0.0.1:${port}/?harness&${opt.params}`;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));

async function boot() {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: opt.timeout * 1000 });
  await page.waitForFunction(() => window.__fps && (window.__fps.ready || window.__fps.errors.length), null, {
    timeout: opt.timeout * 1000,
    polling: 250,
  });
  const errs = await page.evaluate(() => window.__fps.errors);
  if (errs.length) throw new Error('Game failed to boot:\n' + errs.join('\n'));
  console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

let failed = false;
try {
  await boot();
  const available = await page.evaluate(() => window.__fps.listShots());
  if (opt.list) {
    for (const s of available) console.log(`${s.name.padEnd(28)} ${s.description}`);
  }
  for (const code of opt.evals) {
    const r = await page.evaluate(async (c) => {
      const v = await (0, eval)(c);
      return JSON.stringify(v, null, 2);
    }, code);
    console.log(r);
  }
  const names = opt.all ? available.map((s) => s.name) : opt.shots;
  for (const [i, name] of names.entries()) {
    if (opt.fresh && i > 0) await boot();
    const t0 = Date.now();
    await page.evaluate((n) => window.__fps.shot(n), name);
    const file = join(opt.out, `${name}.png`);
    await page.screenshot({ path: file });
    const stats = await page.evaluate(() => window.__fps.stats());
    console.log(`${name} -> ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s, ${stats.calls} draws, ${stats.triangles} tris)`);
  }
} catch (err) {
  failed = true;
  console.error(String(err.stack || err));
} finally {
  const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
  writeFileSync(join(opt.out, 'console.log'), logs.join('\n'));
  if (errors.length) {
    console.log(`\n${errors.length} console error(s):`);
    for (const e of errors.slice(0, 20)) console.log('  ' + e.slice(0, 500));
  }
  await browser.close();
  await server.close();
  process.exit(failed ? 1 : 0);
}
