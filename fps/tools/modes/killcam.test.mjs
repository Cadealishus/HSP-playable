/**
 * Killcam headless test (SwiftShader-safe: frame-synced waits only).
 *   node tools/modes/killcam.test.mjs --base=http://127.0.0.1:5293/ [--mode=tdm]
 */
import { openPage, makeTester, argv } from '../missions/lib.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const A = argv();
const base = A.base ?? 'http://127.0.0.1:5293/';
const mode = A.mode ?? 'tdm';
const SHOTS = resolve(import.meta.dirname, '../shots');
mkdirSync(SHOTS, { recursive: true });
const url = `${base}?mode=${mode}&map=${A.map ?? 'town'}&q=low&prewarm=0`;
const { browser, page, errors, logs } = await openPage(url, { width: A.w ? +A.w : 640, height: A.h ? +A.h : 360 });
const t = makeTester(browser, page, errors, logs);
page.on('pageerror', (e) => console.log('   STACK', e.stack));
console.log('[test] booted', url);

await t.until(`FLOP.state.gameMode === '${mode}' && window.__ENGINE__.ctx.peek('ai').agents.filter(a=>a.alive).length >= 4`, 'match running with bots', 400);
await t.frames(25);

// a hostile shoots Doug dead: fire events for the recorder, then the damage
const info = await t.eval(() => {
  const ctx = window.__ENGINE__.ctx;
  const ai = ctx.peek('ai');
  const p = ctx.peek('player');
  const k = ai.agents.find((a) => a.alive && a.team === 'hostile');
  window.__killer = k;
  return { killer: k?.name, kpos: k && [k.position.x, k.position.z], ppos: [p.position.x, p.position.z] };
});
console.log('  killer', JSON.stringify(info));
for (let i = 0; i < 6; i++) {
  await t.eval(() => {
    const ctx = window.__ENGINE__.ctx;
    const k = window.__killer;
    const p = ctx.peek('player');
    const o = k.eye.clone();
    const d = p.position.clone().setY(p.position.y + 1.3).sub(o).normalize();
    k.aimTarget.copy(p.position).setY(p.position.y + 1.3);
    k.aimWeight = 1;
    ctx.events.emit('weapon:fire', { weapon: 'ai_rifle', ai: true, actor: k, origin: o, dir: d, seed: 1 });
  });
  await t.frames(2);
}
await t.eval(() => {
  const ctx = window.__ENGINE__.ctx;
  const k = window.__killer;
  const p = ctx.peek('player');
  ctx.events.emit('damage:dealt', { target: p, amount: 1000, headshot: false, killed: false, point: p.position.clone(), from: k.eye.clone(), source: k });
});
await t.frames(2);
console.log('   after death', JSON.stringify(await t.eval(() => ({ kc: FLOP.kc, st: FLOP.state.mode, alive: FLOP.mode?.player?.alive, dead: window.__ENGINE__.ctx.peek('player').dead }))));
await t.until('FLOP.kc.pending || FLOP.kc.playing', 'killcam queued on player death', 30);
await t.until('FLOP.kc.playing', 'killcam playing', 200);
const s1 = await t.eval(() => {
  const ctx = window.__ENGINE__.ctx;
  const el = document.querySelector('.fo-kc');
  return { kc: FLOP.kc, scale: ctx.time.scale, overlay: !!el && el.style.display !== 'none', text: el?.innerText?.replace(/\s+/g, ' ') };
});
console.log('  ', JSON.stringify(s1));
t.check(s1.kc.killer === String(info.killer).toUpperCase(), 'replay names the killer');
t.check(s1.scale === 0, 'world paused during the replay');
t.check(s1.kc.cast >= 2, 'cast built (killer + Doug)');
t.check(s1.overlay, 'lower-third shown');
await t.frames(12);
const s2 = await t.eval(() => {
  const g = window.__ENGINE__.ctx.peek('game');
  const cam = window.__ENGINE__.ctx.camera.position;
  const eye = g.killcam.killerEyeNow();
  return { pt: FLOP.kc.pt, cam: [cam.x, cam.y, cam.z], eye: eye && [eye.x, eye.y, eye.z] };
});
const dist = s2.eye ? Math.hypot(s2.cam[0] - s2.eye[0], s2.cam[1] - s2.eye[1], s2.cam[2] - s2.eye[2]) : 99;
console.log('   camera-to-killer-eye', dist.toFixed(2), 'm', JSON.stringify(s2));
t.check(dist < 1.2, "camera follows the killer's recorded eye");
await page.screenshot({ path: resolve(SHOTS, `killcam-${mode}.png`) });
console.log('   shot', resolve(SHOTS, `killcam-${mode}.png`));
await page.keyboard.press('Space');
await t.until('!FLOP.kc.playing', 'space skips the killcam', 20);
const s3 = await t.eval(() => ({ scale: window.__ENGINE__.ctx.time.scale, view: window.__ENGINE__.ctx.viewScene.visible }));
t.check(s3.scale === 1 && s3.view, 'world resumes, viewmodel back');
if (mode !== 'survival') await t.until('FLOP.mode.player.alive === true', 'Doug respawns after the killcam', 60);
else await t.until("FLOP.state.mode === 'down'", 'survival death screen after the killcam', 30);
await t.eval(() => FLOP.killcam());
await t.until('FLOP.kc.playing', 'FLOP.killcam() replays the last death', 10);
await t.eval(() => FLOP.skipKillcam());
await t.until('!FLOP.kc.playing', 'debug replay ends', 10);
if (mode !== 'survival' && !A.nofinal) {
  // FINAL KILLCAM: one kill from the limit, Doug finishes it
  await t.frames(20);
  await t.eval(() => {
    const m = FLOP.mode;
    if (m.score) m.score.esf = m.limit - 1;
    if (m.player && 'score' in m.player) m.player.score = m.limit - 1;
    FLOP.killAll('hostile');
  });
  await t.until('FLOP.kc.playing && FLOP.kc.final', 'final killcam plays at match end', 120);
  await t.frames(6);
  await page.screenshot({ path: resolve(SHOTS, `killcam-final-${mode}.png`) });
  console.log('   final', JSON.stringify(await t.eval(() => FLOP.kc)));
  await page.mouse.click(100, 100);
  await t.until("FLOP.state.mode === 'over' && !FLOP.kc.playing", 'click skips; match report follows', 40);
  console.log('   lastRun', JSON.stringify(await t.eval(() => FLOP.lastRun)));
}
await t.close();
