// Headless smoke test of the viewer: boot, screenshots per preset, inspect mode,
// a short benchmark, report export. Usage: node tools/test-viewer.mjs [outDir] [--bench]
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, '..');
const out = resolve(process.argv[2] ?? 'test-out');
await mkdir(out, { recursive: true });
const pw = await import(resolve(VIEWER, '../fps/node_modules/playwright/index.mjs'));
const port = 5199;
const srv = spawn(process.execPath, [resolve(VIEWER, 'serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await pw.chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.__VIEWER_READY__, null, { timeout: 900000, polling: 1000 });
console.log('ready in', (Date.now() - t0) / 1000, 's');
const settle = () => page.waitForTimeout(Number(process.env.SETTLE ?? 9000));
const shotBays = async (path) => {
  const box = await page.locator('#bays').boundingBox();
  await page.screenshot({ path, clip: box, timeout: 300000, animations: 'allow' });
};
for (const preset of ['studio', 'outdoor', 'indoor']) {
  await page.selectOption('#preset', preset);
  await settle();
  await shotBays(`${out}/side-${preset}.png`);
}
await page.selectOption('#preset', 'studio');
for (const v of ['flopops', 'aaa', 'bodycam']) {
  await page.selectOption('#layout', v);
  await settle();
  await shotBays(`${out}/inspect-${v}.png`);
}
await page.selectOption('#layout', 'side');
await page.check('#wire'); await settle();
await shotBays(`${out}/side-wire.png`);
await page.uncheck('#wire');
await page.selectOption('#channel', 'normal'); await settle();
await shotBays(`${out}/side-normal.png`);
await page.selectOption('#channel', 'final');
await page.check('#bodycam'); await settle();
await shotBays(`${out}/side-bodycamfx.png`);
await page.uncheck('#bodycam');
await page.screenshot({ path: `${out}/page-metrics.png`, fullPage: true, timeout: 300000 });
if (process.argv.includes('--bench')) {
  await page.click('#tab-bench');
  await page.selectOption('#bRes', '640x360');
  await page.fill('#bWarm', '0.5');
  await page.fill('#bTest', '2');
  await page.uncheck('#bc100');
  await page.click('#bRun');
  await page.waitForFunction(() => /complete|failed/.test(document.querySelector('#bProg').textContent), null, { timeout: 3600000, polling: 2000 });
  console.log(await page.textContent('#bProg'));
  await page.screenshot({ path: `${out}/page-bench.png`, fullPage: true, timeout: 300000 });
}
await page.click('#tab-gen');
await page.screenshot({ path: `${out}/page-gen.png`, fullPage: true, timeout: 300000 });
await page.click('#tab-report');
const rep = await page.evaluate(() => window.__VIEWER__.currentReport());
await writeFile(`${out}/report.json`, JSON.stringify(rep, null, 2));
await page.screenshot({ path: `${out}/page-report.png`, fullPage: true, timeout: 300000 });
console.log('errors:', JSON.stringify(errors.slice(0, 20), null, 1));
await browser.close();
srv.kill();
