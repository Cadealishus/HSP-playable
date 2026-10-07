/**
 * FFA / KILL CONFIRMED / GUN GAME headless test (SwiftShader-safe: frame-synced waits).
 *   node tools/modes/modes.test.mjs --base=http://127.0.0.1:5293/ --mode=ffa|kc|gun
 * The session is launched the way the menu does it: localStorage `flopops.session`, then a plain load.
 */
import { openPage, makeTester, argv } from '../missions/lib.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const A = argv();
const base = A.base ?? 'http://127.0.0.1:5293/';
const mode = A.mode ?? 'ffa';
const SHOTS = resolve(import.meta.dirname, '../shots');
mkdirSync(SHOTS, { recursive: true });

// 1. menu-style launch: write the session, load with no mode in the URL
const url = `${base}?q=low&prewarm=0`;
const pre = await openPage(url, { width: 640, height: 360 });
await pre.page.evaluate((m) => {
  localStorage.setItem('flopops.session', JSON.stringify({ kind: 'mp', mode: m, map: 'town', mission: null, difficulty: 'regular', pending: true }));
}, mode);
await pre.page.reload({ waitUntil: 'domcontentloaded' });
await pre.page.waitForFunction('window.__READY__ === true && !!window.__ENGINE__', null, { timeout: 900_000, polling: 500 });
const { browser, page, errors, logs } = pre;
const t = makeTester(browser, page, errors, logs);
page.on('pageerror', (e) => console.log('   STACK', e.stack));
const sess = await t.eval(() => window.__ENGINE__.ctx.config.session);
t.check(sess.mode === mode && sess.pending === true, `session resolved from localStorage (${sess.mode}, pending)`);
// the deploy card: start the session as the click would
await t.eval(() => FLOP.launch(window.__ENGINE__.ctx.config.session));
await t.until(`FLOP.state.gameMode === '${mode}' && window.__ENGINE__.ctx.peek('ai').agents.filter(a=>a.alive).length >= 5`, `${mode} launched with bots`, 400);
await t.frames(10);

// helpers in the page
await t.eval(() => {
  const ctx = window.__ENGINE__.ctx;
  window.__T = {
    ai: () => ctx.peek('ai'),
    bots: () => ctx.peek('ai').agents.filter((a) => a.alive && !a.isMannequin),
    /** Doug kills `a` (an unattributed round on a bot is Doug's), optional knife. */
    dougKills(a, knife) {
      if (knife) ctx.events.emit('melee:hit', { target: a, attacker: ctx.peek('player'), amount: 200, backstab: true });
      ctx.events.emit('damage:dealt', { target: a, amount: 1e6, headshot: false, killed: false, point: a.position.clone() });
    },
    /** bot `k` kills bot `v` through the AI's own bot-on-bot path */
    botKills(k, v) {
      const ai = ctx.peek('ai');
      ai.tagHitWeapon(v, k.weaponId);
      v.applyDamage(1e6, 'torso', v.position.clone().setY(v.position.y + 1.2), v.position.clone().sub(k.position).normalize(), null, k);
    },
  };
});

if (mode === 'ffa' || mode === 'gun') {
  const rel = await t.eval(() => window.__T.ai().relation);
  t.check(rel === 'ffa', `AI relation is ffa (${rel})`);
  // bots damage each other: real _fireOne from one bot at another, point blank
  const dmg = await t.eval(() => {
    const ctx = window.__ENGINE__.ctx;
    const ai = window.__T.ai();
    const [a, b] = window.__T.bots();
    const h0 = b.health;
    const o = a.eye.clone();
    // stand b one metre in front of a's eye line
    const fwd = new o.constructor(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    b.position.copy(a.position).addScaledVector(fwd, 2.5);
    b.group.position.copy(b.position);
    b.group.updateMatrixWorld(true);
    b.syncHitboxes();
    const target = b.position.clone().setY(b.position.y + 1.25);
    const d = target.sub(o).normalize();
    for (let i = 0; i < 3; i++) ai._fireOne(a, o, d, true);
    const enemy = ai.agents.includes(b) && a.team === b.team;
    return { h0, h1: b.health, alive: b.alive, sameTeam: enemy };
  });
  console.log('   bot-on-bot', JSON.stringify(dmg));
  t.check(dmg.sameTeam && (dmg.h1 < dmg.h0 || !dmg.alive), 'FFA: a bot damages another bot of the same internal team');
}

if (mode === 'ffa') {
  const s0 = await t.eval(() => FLOP.mode.player.score);
  await t.eval(() => window.__T.dougKills(window.__T.bots()[0]));
  await t.frames(2);
  const s1 = await t.eval(() => ({ score: FLOP.mode.player.score, hud: FLOP.hud.ffa }));
  t.check(s1.score === s0 + 1, `Doug's kill scores (${s0} -> ${s1.score})`);
  // bot kills bot: the killer bot scores
  const bk = await t.eval(() => {
    const [k, v] = window.__T.bots();
    const ks = FLOP.mode.slotOfAny(k);
    const before = ks.score;
    window.__T.botKills(k, v);
    return { before, after: ks.score, name: ks.name };
  });
  t.check(bk.after === bk.before + 1, `bot ${bk.name} scores a bot kill`);
  await t.frames(4);
  await page.screenshot({ path: resolve(SHOTS, 'ffa-scoreboard.png') });
  console.log('   hud', JSON.stringify(await t.eval(() => FLOP.hud.ffa)));
  // a respawned bot lands away from everyone
  await t.until('FLOP.mode.slots.every((s) => s.alive)', 'dead bots respawn', 200);
  // the end: Doug one short of the limit
  await t.eval(() => {
    FLOP.mode.player.score = FLOP.mode.limit - 1;
    window.__T.dougKills(window.__T.bots()[0]);
  });
}

if (mode === 'kc') {
  await t.eval(() => window.__T.dougKills(window.__T.bots().find((a) => a.team === 'hostile')));
  await t.frames(2);
  const tags = await t.eval(() => ({ n: FLOP.mode.tags.count(), score: FLOP.mode.score.esf }));
  t.check(tags.n >= 1 && tags.score === 0, `a kill drops a tag and scores nothing yet (${JSON.stringify(tags)})`);
  // Doug walks onto the tag
  await t.eval(() => {
    const tag = FLOP.mode.tags.tags.find((x) => x.active && x.team === 'hostile');
    FLOP.mode.host.respawnPlayer(tag.pos.clone(), 0);
  });
  await t.until('FLOP.mode.score.esf === 1', 'Doug confirms the kill (+1)', 60);
  // a bot denies: an ESF tag at a hostile's feet... confirms for them; an ESF tag at an ESF bot's feet denies
  const bt = await t.eval(() => {
    const h = window.__T.bots().find((a) => a.team === 'hostile');
    FLOP.mode.tags.drop('esf', h.position.clone(), FLOP.mode.t, 'DOUG');
    return FLOP.mode.score.hostile;
  });
  await t.until(`FLOP.mode.score.hostile === ${bt + 1}`, 'a hostile bot picks up an ESF tag and confirms', 60);
  const den = await t.eval(() => {
    const e = window.__T.bots().find((a) => a.team === 'esf');
    FLOP.mode.tags.drop('esf', e.position.clone(), FLOP.mode.t, 'X');
    return FLOP.mode.denied.esf;
  });
  await t.until(`FLOP.mode.denied.esf === ${den + 1}`, 'an ESF bot denies a friendly tag', 60);
  await page.screenshot({ path: resolve(SHOTS, 'kc.png') });
  await t.eval(() => {
    FLOP.mode.score.esf = FLOP.mode.limit - 1;
    const h = window.__T.bots().find((a) => a.team === 'hostile');
    FLOP.mode.tags.drop('hostile', window.__ENGINE__.ctx.peek('player').position.clone(), FLOP.mode.t, 'Y');
  });
}

if (mode === 'gun') {
  await t.eval(() => window.__T.dougKills(window.__T.bots()[0]));
  await t.frames(2);
  const g1 = await t.eval(() => ({ tier: FLOP.mode.player.tier, active: window.__ENGINE__.ctx.peek('weapons').activeId }));
  t.check(g1.tier === 1 && g1.active === 'carbine', `Doug advances to tier 2 with the next gun (${JSON.stringify(g1)})`);
  // knife setback on a bot that has advanced
  const ks = await t.eval(() => {
    const v = window.__T.bots()[0];
    const s = FLOP.mode.slotOfAny(v);
    s.tier = 3;
    s.score = 3;
    let deathWeapon = null;
    const off = window.__ENGINE__.ctx.events.on('actor:death', (e) => (deathWeapon = e.weapon));
    window.__T.dougKills(v, true);
    off();
    return { tier: s.tier, playerTier: FLOP.mode.player.tier, deathWeapon };
  });
  t.check(ks.tier === 2 && ks.deathWeapon === 'knife', `knife kill sets the victim back a tier (${JSON.stringify(ks)})`);
  // simulated melee:hit after the death on the same frame (other emit order)
  const ks2 = await t.eval(() => {
    const v = window.__T.bots()[1];
    const s = FLOP.mode.slotOfAny(v);
    s.tier = 5;
    s.score = 5;
    window.__ENGINE__.ctx.events.emit('damage:dealt', { target: v, amount: 1e6, point: v.position.clone() });
    window.__ENGINE__.ctx.events.emit('melee:hit', { target: v, attacker: window.__ENGINE__.ctx.peek('player'), amount: 200 });
    return s.tier;
  });
  t.check(ks2 === 4, `melee:hit right after the death also sets back (${ks2})`);
  // bots progress
  const bp = await t.eval(() => {
    const [k, v] = window.__T.bots();
    const s = FLOP.mode.slotOfAny(k);
    const before = s.tier;
    window.__T.botKills(k, v);
    return { before, after: s.tier, weapon: k.weaponId };
  });
  t.check(bp.after === bp.before + 1 && bp.weapon === ['rifle', 'carbine', 'smg', 'shotgun', 'lmg', 'marksman', 'sniper', 'carbine_sd', 'mpistol', 'pistol', 'pistol'][bp.after], `a bot advances and is rearmed (${JSON.stringify(bp)})`);
  await page.screenshot({ path: resolve(SHOTS, 'gun.png') });
  // the end: Doug on the knife tier, a knife kill
  await t.eval(() => {
    FLOP.mode.player.tier = FLOP.mode.ladder.length - 1;
    FLOP.mode.player.score = FLOP.mode.player.tier;
    window.__T.dougKills(window.__T.bots()[0], true);
  });
}

// match end: final killcam (skipped), then the report
await t.until('FLOP.mode.result', `${mode} decided`, 30);
await t.until("(FLOP.kc.playing && FLOP.kc.final) || FLOP.state.mode === 'over'", 'final killcam or report', 120);
await t.eval(() => FLOP.skipKillcam());
await t.until("FLOP.state.mode === 'over'", `${mode} ends with a match report`, 60);
const run = await t.eval(() => FLOP.lastRun);
console.log('   lastRun', JSON.stringify(run));
t.check(run.winner === 'esf', `winner is Doug's side (${run.winner})`);
await t.frames(6);
await page.screenshot({ path: resolve(SHOTS, `report-${mode}.png`) });
await t.close();
