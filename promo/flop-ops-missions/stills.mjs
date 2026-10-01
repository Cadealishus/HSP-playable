// node stills.mjs scene t1 t2 ...  -> writes PNGs to $OUT (default ./_stills)
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.OUT || path.join(dir, '_stills'); fs.mkdirSync(out, { recursive: true });
const [scene, ...times] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('console', m => console.log('page:', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file://' + dir + '/index.html?render'); await p.evaluate(() => document.fonts.ready);
for (const t of times) {
  const data = await p.evaluate(([s, t]) => { const c = document.getElementById('c'), x = c.getContext('2d');
    if (s === 'cut') renderCut(x, t, { text: true }); else renderScene(x, s, t, {}); return c.toDataURL('image/jpeg', 0.85); }, [scene, +t]);
  const f = path.join(out, `${scene}_${t}.jpg`); fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); console.log(f);
}
await b.close();
