/**
 * Headless mission-test harness (SwiftShader-safe).
 *
 * The container renders at well under 1 fps in software WebGL, so nothing here
 * waits on wall-clock time: every wait is on `window.__ENGINE__.ctx.time.frame`
 * or on a predicate evaluated in the page, with a generous wall-clock ceiling
 * only as a hang guard.
 *
 *   const t = await openMission('underground', { base: 'http://127.0.0.1:5291/' });
 *   await t.frames(10);                       // advance 10 engine frames
 *   await t.until('FLOP.mission.state.index >= 2', 'objective 3');
 *   t.check(cond, 'label');
 *   await t.close();
 */
import { chromium } from 'playwright';

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function argv() {
  return Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? true] : [a, true];
    })
  );
}

export async function openPage(url, { width = 320, height = 180, timeout = 900_000, log = false } = {}) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit',
      '--mute-audio',
      '--force-device-scale-factor=1',
    ],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  const logs = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('   PAGE ERROR', e.message);
  });
  page.on('console', (m) => {
    const t = `[${m.type()}] ${m.text()}`;
    logs.push(t);
    if (m.type() === 'error') errors.push(m.text());
    // mission + game lines and every warning/error, live
    if (log || m.type() === 'error' || m.type() === 'warning' || /^\[(mission|game)/.test(m.text())) console.log('   page', t.slice(0, 300));
  });
  page.setDefaultTimeout(timeout);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction('window.__READY__ === true && !!window.__ENGINE__', null, { timeout, polling: 500 });
  return { browser, page, errors, logs };
}

export async function openMission(id, opts = {}) {
  const base = opts.base ?? 'http://127.0.0.1:5291/';
  const q = opts.q ?? 'low';
  const url = `${base}?mission=${id}&q=${q}${opts.extra ? '&' + opts.extra : ''}`;
  const t0 = Date.now();
  const { browser, page, errors, logs } = await openPage(url, opts);
  console.log(`[test] ${id}: booted in ${((Date.now() - t0) / 1000).toFixed(0)} s (${url})`);
  return makeTester(browser, page, errors, logs, opts);
}

export function makeTester(browser, page, errors, logs, opts = {}) {
  let fails = 0;
  let passes = 0;
  const t = {
    page,
    errors,
    logs,
    eval: (fn, arg) => page.evaluate(fn, arg),
    frame: () => page.evaluate(() => window.__ENGINE__.ctx.time.frame),
    /** Advance `n` engine frames. */
    async frames(n) {
      const f0 = await t.frame();
      await page.waitForFunction((f) => window.__ENGINE__.ctx.time.frame >= f, f0 + n, { polling: 250, timeout: opts.timeout ?? 900_000 });
    },
    /**
     * Wait until the page expression is truthy. `maxFrames` bounds it in ENGINE
     * frames (the honest unit here); the wall clock only guards a hang.
     */
    async until(expr, label, maxFrames = 600) {
      const f0 = await t.frame();
      const fn = new Function(`try { return !!(${expr}); } catch (e) { return false; }`);
      const src = `(() => { const ok = (${fn.toString()})(); return ok || window.__ENGINE__.ctx.time.frame > ${f0 + maxFrames} ? { ok, frame: window.__ENGINE__.ctx.time.frame } : null; })()`;
      const h = await page.waitForFunction(src, null, { polling: 250, timeout: opts.timeout ?? 1_800_000 });
      const r = await h.jsonValue();
      t.check(r.ok, `${label} (by frame ${r.frame})`);
      return r.ok;
    },
    check(cond, label) {
      if (cond) {
        passes++;
        console.log(`  PASS  ${label}`);
      } else {
        fails++;
        console.log(`  FAIL  ${label}`);
      }
      return !!cond;
    },
    state: () => page.evaluate(() => JSON.parse(JSON.stringify(window.FLOP?.mission?.state ?? null))),
    async close() {
      const errs = errors.filter((e) => !/favicon|404|AudioContext|net::ERR/.test(e));
      if (errs.length) console.log('  page errors:\n   ' + errs.slice(0, 12).join('\n   '));
      t.check(errs.length === 0, 'no page errors');
      console.log(`[test] ${passes} passed, ${fails} failed`);
      await browser.close();
      return fails === 0;
    },
  };
  return t;
}
