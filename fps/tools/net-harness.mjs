// Dev harness for co-op work: boots N pages (?net=local) in one browser
// context, stubs render once booted, and serves an eval endpoint so a page can
// be driven without re-booting (SwiftShader boots take minutes).
//   node tools/net-harness.mjs [n=3] [port=5199]
//   curl -s localhost:5199/eval/A --data 'return window.__NET__.state'
//   curl -s localhost:5199/reload/A
import http from 'node:http';
import { chromium } from 'playwright';

const N = Number(process.argv[2] ?? 3);
const PORT = Number(process.argv[3] ?? 5199);
const BASE = process.env.BASE ?? 'http://127.0.0.1:5191/';
const URL = `${BASE}?q=low&prewarm=0&net=local`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
});
const context = await browser.newContext({ viewport: { width: 320, height: 180 } });
const pages = {};
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

async function boot(name, p) {
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__ENGINE__ && window.__ENGINE__.time.frame > 3 && window.__NET__, null, { timeout: 1800000, polling: 500 });
  await p.evaluate(() => {
    window.__ENGINE__.registry.peek('render').render = () => {};
  });
  log(name, 'ready');
}

for (let i = 0; i < N; i++) {
  const name = String.fromCharCode(65 + i);
  const p = await context.newPage();
  p.on('pageerror', (e) => log(name, 'PAGEERROR', e.message));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning' || /\[net\]|\[game\]/.test(t)) log(name, m.type(), t.slice(0, 300));
  });
  pages[name] = p;
}
await Promise.all(Object.entries(pages).map(([n, p]) => boot(n, p)));
log('all ready');

http
  .createServer(async (req, res) => {
    const [, cmd, name] = req.url.split('/');
    let body = '';
    for await (const c of req) body += c;
    const p = pages[name];
    try {
      if (!p) throw new Error(`no page ${name}`);
      let out;
      if (cmd === 'eval') out = await p.evaluate(new Function(`return (async () => { ${body} })()`));
      else if (cmd === 'reload') {
        await boot(name, p);
        out = 'ok';
      } else if (cmd === 'close') {
        await p.close();
        delete pages[name];
        out = 'closed';
      } else throw new Error('cmd?');
      res.end(JSON.stringify(out ?? null, null, 1));
    } catch (err) {
      res.end(`ERR ${err.message}`);
    }
  })
  .listen(PORT, () => log('harness on', PORT));
