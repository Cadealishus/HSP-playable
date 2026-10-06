// Headless ONLINE PvP test (?net=local, two pages in one browser context):
// TEAM DEATHMATCH without bots, then FREE FOR ALL. Proves: teams are dealt and
// drawn relative to each page; a host round kills the client (claimed on the
// host, applied by the victim through damage:dealt); the death is scored by
// the host and mirrored; the victim respawns; a client round damages the host
// (claim → validation → victim); thrown equipment is simulated on the other
// page; the match ends for both at the score limit; FFA scores per player.
//   npx vite --port 5191 &   then   node tools/net-pvp-test.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5191/';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}q=low&prewarm=0&net=local`;
const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  log(pass ? 'PASS' : 'FAIL', name, detail);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: EXE,
  args: ['--ignore-gpu-blocklist', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
});
const context = await browser.newContext({ viewport: { width: 320, height: 180 } });
const errors = [];
async function open(name) {
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(`${name}: ${t.slice(0, 300)}`);
    if (/\[net\]|\[game\] (deploy|match)/.test(t)) log(name, t.slice(0, 200));
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  return p;
}
const until = (p, fn, arg, timeout = 120000) => p.waitForFunction(fn, arg, { timeout, polling: 200 });
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const frames = (p, n) =>
  ev(p, (k) => {
    const f0 = window.__ENGINE__.time.frame;
    return new Promise((res) => {
      const t = () => (window.__ENGINE__.time.frame - f0 >= k ? res() : setTimeout(t, 30));
      t();
    });
  }, n);

/** Shoot (one round per frame) at the other player's soldier on page `p` until `stop` is true. */
async function shootAt(p, peer, stop, max = 30) {
  let dealt = 0;
  for (let i = 0; i < max; i++) {
    if (await stop()) break;
    dealt += await ev(p, (id) => {
      const ctx = window.__ENGINE__.ctx;
      const e = window.__NET__.system.puppets.players.get(id);
      if (!e || e.ragdoll || !e.agent.alive) return 0;
      const pl = ctx.peek('player');
      const a = e.agent;
      // stand 3 m off him and fire at his chest
      pl.teleport({ x: a.position.x + 3, y: a.position.y + 1.66, z: a.position.z }, pl.yaw);
      const phys = ctx.peek('physics');
      const O = ctx.camera.position.clone().set(a.position.x + 3, a.position.y + 1.6, a.position.z);
      const T = a.position.clone();
      T.y += 1.3;
      const d = T.clone().sub(O).normalize();
      O.addScaledVector(d, 0.5);
      let got = 0;
      const off = ctx.events.on('damage:dealt', (x) => {
        if (x.target === a) got += x.amount;
      });
      phys.fireBullet({ origin: O, dir: d, damage: 40, penetration: 0.5, maxDist: 20, mask: phys.MASK.BULLET });
      off();
      return got;
    }, peer);
    await frames(p, 4);
  }
  return dealt;
}

try {
  const A = await open('A');
  const B = await open('B');
  for (const [n, p] of Object.entries({ A, B })) {
    await until(p, () => window.__ENGINE__ && window.__ENGINE__.time.frame > 3 && window.__NET__, null, 900000);
    await ev(p, () => {
      window.__ENGINE__.registry.peek('render').render = () => {};
    });
    log(n, 'booted');
  }
  await ev(A, () => window.__NET__.host('ops-pvp'));
  await until(A, () => window.__NET__.state.role === 'host');
  await ev(B, () => window.__NET__.join('ops-pvp'));
  await until(B, () => window.__NET__.state.role === 'client' && window.__NET__.state.players.length === 2);
  await ev(A, () => window.__NET__.setLobby({ mode: 'tdm', botFill: false }));
  await until(B, () => window.__NET__.state.lobby.mode === 'tdm');
  check('lobby: host picks TDM, bot fill off; the client sees it', true);

  await ev(A, () => window.__NET__.start());
  for (const p of [A, B]) await until(p, () => window.FLOP?.state?.gameMode === 'tdm' && window.FLOP.state.mode === 'play' && window.__NET__.stats().inGame);
  const ids = { A: await ev(A, () => window.__NET__.system.t.selfId), B: await ev(B, () => window.__NET__.system.t.selfId) };
  const teams = await ev(B, () => ({ mine: window.__NET__.system.myTeam(), host: window.__NET__.system.teamOf(window.__NET__.system.hostId) }));
  const bots = await ev(A, () => window.__ENGINE__.ctx.peek('ai').agents.filter((a) => a.alive && !a.__net).length);
  check('TDM deployed: opposite teams, no bots', teams.mine === 'hostile' && teams.host === 'esf' && bots === 0, JSON.stringify({ ...teams, bots }));

  await until(A, (id) => window.__NET__.system.puppets.players.get(id), ids.B);
  await until(B, (id) => window.__NET__.system.puppets.players.get(id), ids.A);
  const rel = {
    A: await ev(A, (id) => window.__NET__.system.puppets.players.get(id).agent.team, ids.B),
    B: await ev(B, (id) => window.__NET__.system.puppets.players.get(id).agent.team, ids.A),
  };
  check('each page draws the other as the enemy', rel.A === 'hostile' && rel.B === 'hostile', JSON.stringify(rel));

  // ---- host kills client
  const bHp0 = await ev(B, () => window.__ENGINE__.ctx.peek('player').health.value);
  const dealt = await shootAt(A, ids.B, () => ev(B, () => window.__ENGINE__.ctx.peek('player').dead));
  await until(B, () => window.__ENGINE__.ctx.peek('player').dead, null, 30000).catch(() => {});
  const bDead = await ev(B, () => window.__ENGINE__.ctx.peek('player').dead);
  check('host round kills the client (claim → victim applies)', dealt > 0 && bDead, `rounds dealt ${dealt.toFixed(0)} on the puppet; client hp ${bHp0} → dead=${bDead}`);
  await until(A, () => window.__ENGINE__.ctx.peek('game').mode.score.esf >= 1, null, 30000).catch(() => {});
  const sc = { A: await ev(A, () => ({ ...window.__ENGINE__.ctx.peek('game').mode.score, k: window.__ENGINE__.ctx.peek('game').mode.player.kills })) };
  await until(B, () => window.__ENGINE__.ctx.peek('game').mode.score.hostile >= 1, null, 30000).catch(() => {});
  sc.B = await ev(B, () => ({ ...window.__ENGINE__.ctx.peek('game').mode.score }));
  check('the host scores the kill; the client mirrors it', sc.A.esf === 1 && sc.A.k === 1 && sc.B.hostile === 1, JSON.stringify(sc));
  const ragdoll = await ev(A, (id) => !!window.__NET__.system.puppets.players.get(id)?.ragdoll, ids.B);
  check('the victim ragdolls on the killer\'s page', ragdoll);

  // ---- respawn
  await until(B, () => !window.__ENGINE__.ctx.peek('player').dead && window.__ENGINE__.ctx.peek('game').mode.player.alive, null, 60000).catch(() => {});
  const bAlive = await ev(B, () => !window.__ENGINE__.ctx.peek('player').dead);
  await until(A, (id) => {
    const e = window.__NET__.system.puppets.players.get(id);
    return e && !e.ragdoll && e.agent.alive;
  }, ids.B, 30000).catch(() => {});
  const aSees = await ev(A, (id) => {
    const e = window.__NET__.system.puppets.players.get(id);
    return !!(e && !e.ragdoll && e.agent.alive);
  }, ids.B);
  check('the client respawns and redeploys on the host', bAlive && aSees);

  // ---- client damages host
  const aHp0 = await ev(A, () => window.__ENGINE__.ctx.peek('player').health.value);
  await shootAt(B, ids.A, () => ev(A, () => window.__ENGINE__.ctx.peek('player').health.value < 100), 6);
  await until(A, (h) => window.__ENGINE__.ctx.peek('player').health.value < h, aHp0, 20000).catch(() => {});
  const aHp1 = await ev(A, () => window.__ENGINE__.ctx.peek('player').health.value);
  const st = await ev(A, () => window.__NET__.stats());
  check('client round damages the host (validated claim)', aHp1 < aHp0, `${aHp0} → ${aHp1.toFixed(0)}; applied ${st.hitsApplied} rejected ${st.hitsRejected}`);

  // ---- equipment travels as events
  const live0 = await ev(A, () => window.__ENGINE__.ctx.peek('weapons').equipment?.stats?.detonated ?? 0);
  const thrown = await ev(B, () => {
    const eq = window.__ENGINE__.ctx.peek('weapons').equipment;
    if (!eq?.debugThrow) return false;
    eq.give?.('frag', 1);
    eq.debugThrow('frag');
    return true;
  });
  await until(A, (n) => (window.__ENGINE__.ctx.peek('weapons').equipment?.stats?.detonated ?? 0) > n, live0, 60000).catch(() => {});
  const live1 = await ev(A, () => window.__ENGINE__.ctx.peek('weapons').equipment?.stats?.detonated ?? 0);
  check('a thrown grenade is simulated on the other page', thrown && live1 > live0, `host copies detonated ${live0} → ${live1}`);

  // ---- match end at the limit
  await ev(A, () => (window.__ENGINE__.ctx.peek('game').mode.limit = 2));
  await shootAt(A, ids.B, () => ev(B, () => window.__ENGINE__.ctx.peek('player').dead));
  await until(A, () => window.FLOP.state.mode === 'over', null, 30000).catch(() => {});
  await until(B, () => window.FLOP.state.mode === 'over', null, 30000).catch(() => {});
  const over = { A: await ev(A, () => [window.FLOP.state.mode, window.FLOP.lastRun?.winner]), B: await ev(B, () => [window.FLOP.state.mode, window.FLOP.lastRun?.winner]) };
  check('the match ends for both at the score limit', over.A[0] === 'over' && over.B[0] === 'over' && over.A[1] === 'esf' && over.B[1] === 'hostile', JSON.stringify(over));

  // ---- FFA
  await ev(A, () => window.FLOP.attract());
  await until(B, () => window.FLOP.state.mode === 'attract', null, 30000).catch(() => {});
  await ev(A, () => window.__NET__.setLobby({ mode: 'ffa' }));
  await until(B, () => window.__NET__.state.lobby.mode === 'ffa');
  await ev(A, () => window.__NET__.start());
  for (const p of [A, B]) await until(p, () => window.FLOP?.state?.gameMode === 'ffa' && window.FLOP.state.mode === 'play' && window.__NET__.stats().inGame);
  check('FFA deployed for both', true);
  await until(A, (id) => window.__NET__.system.puppets.players.get(id)?.agent.alive, ids.B);
  await shootAt(A, ids.B, () => ev(B, () => window.__ENGINE__.ctx.peek('player').dead));
  await until(B, () => window.__ENGINE__.ctx.peek('game').mode.score.hostile >= 1, null, 30000).catch(() => {});
  const ffa = {
    A: await ev(A, () => window.__ENGINE__.ctx.peek('game').hudState()?.scoreEsf),
    B: await ev(B, () => [window.__ENGINE__.ctx.peek('game').mode.score.esf, window.__ENGINE__.ctx.peek('game').mode.score.hostile]),
  };
  check('FFA: the kill counts for the killer, the victim sees the leader', ffa.A === 1 && ffa.B[0] === 0 && ffa.B[1] === 1, JSON.stringify(ffa));
} catch (err) {
  check('test harness', false, err.stack ?? String(err));
} finally {
  const real = errors.filter((e) => !/favicon|WebGL|GPU stall|ReadPixels/i.test(e));
  check('no page errors', real.length === 0, real.slice(0, 6).join(' || '));
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
}
