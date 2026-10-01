// Render all clips to MP4 (1080x1920, 24fps). Usage: node render.mjs [outDir]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(dir, 'renders'); fs.mkdirSync(out, { recursive: true });
const FPS = 24;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('file://' + dir + '/index.html?render'); await p.evaluate(() => document.fonts.ready);
async function clip(name, dur, fn) {
  const file = path.join(out, name + '.mp4');
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    const data = await p.evaluate(fn, (i + 0.0001) / FPS);
    if (!ff.stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log(file, n, 'frames');
}
const scenes = await p.evaluate(() => CUT.map((c, i) => ({ id: c.id, dur: SCENES[c.id].dur, i })));
const names = ['01_plane_raid', '02_underground_survival', '03_hostage_rescue', '04_something_completely_stupid', '05_aftermath_worst_idea'];
for (const s of scenes) await clip('scenes/' + names[s.i], s.dur, new Function('t', `const c=document.getElementById('c');renderScene(c.getContext('2d'),'${s.id}',t,{});return c.toDataURL('image/jpeg',0.95);`));
const total = await p.evaluate(() => ensureCut());
await clip('flop_ops_missions_textless', total, (t) => { const c = document.getElementById('c'); renderCut(c.getContext('2d'), t, { text: false }); return c.toDataURL('image/jpeg', 0.95); });
await clip('flop_ops_missions_with_text', total, (t) => { const c = document.getElementById('c'); renderCut(c.getContext('2d'), t, { text: true }); return c.toDataURL('image/jpeg', 0.95); });
await b.close();
