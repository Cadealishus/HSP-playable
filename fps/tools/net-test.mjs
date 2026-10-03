// Headless co-op test over the BroadcastChannel transport (?net=local).
//
// Three pages in ONE browser context (so they share BroadcastChannel): A hosts,
// B and C join. Proves: everyone sees everyone move; the host's bots appear on
// the clients; a client's shot kills a host bot; a bot round damages a client;
// a down → revive cycle; wave progression is shared; host migration when the
// host page closes (a client takes over the waves, the other follows it).
//
// SwiftShader renders a frame in ~13 s, so once a page has booted the test
// replaces render() with a no-op (gameplay, physics, AI and net all still run
// every frame; only the GPU draw is skipped). Every wait is on engine frames /
// game state, never on wall-clock sleeps.
//
//   npx vite --port 5191 &   then   node tools/net-test.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5191/';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}q=low&prewarm=0&net=local`;
const CODE = 'ops-test';
const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
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
    if (/\[net\]/.test(t)) log(name, t.slice(0, 200));
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  return p;
}

const until = (p, fn, arg, timeout = 120000) => p.waitForFunction(fn, arg, { timeout, polling: 200 });
const ev = (p, fn, arg) => p.evaluate(fn, arg);
/** Wait n engine frames on page p. */
const frames = (p, n) =>
  ev(p, (k) => {
    const f0 = window.__ENGINE__.time.frame;
    return new Promise((res) => {
      const t = () => (window.__ENGINE__.time.frame - f0 >= k ? res() : setTimeout(t, 30));
      t();
    });
  }, n);

try {
  const A = await open('A');
  const B = await open('B');
  const C = await open('C');
  const pages = { A, B, C };
  for (const [n, p] of Object.entries(pages)) {
    await until(p, () => window.__ENGINE__ && window.__ENGINE__.time.frame > 3 && window.__NET__, null, 900000);
    await ev(p, () => {
      window.__ENGINE__.registry.peek('render').render = () => {};
    });
    log(n, 'booted');
  }

  // ---- party
  await ev(A, (c) => window.__NET__.host(c), CODE);
  await until(A, () => window.__NET__.state.role === 'host');
  await ev(B, (c) => window.__NET__.join(c), CODE);
  await ev(C, (c) => window.__NET__.join(c), CODE);
  await until(B, () => window.__NET__.state.role === 'client' && window.__NET__.state.players.length === 3);
  await until(C, () => window.__NET__.state.role === 'client' && window.__NET__.state.players.length === 3);
  const lobby = await ev(B, () => window.__NET__.state);
  check('lobby: 3 players, one host', lobby.players.length === 3 && lobby.players.filter((p) => p.host).length === 1, JSON.stringify(lobby.players.map((p) => p.name)));

  // ---- deploy (same map: starts in place)
  await ev(A, () => window.__NET__.start());
  for (const p of [A, B, C]) await until(p, () => window.FLOP?.state?.mode === 'play' && window.__NET__.stats().inGame);
  check('everyone deployed', true);

  const sys = (p) => ev(p, () => {
    const s = window.__NET__.stats();
    const g = window.__ENGINE__.ctx.peek('game');
    return { ...s, wave: g.mode?.wave, remote: !!g.mode?.remote, hostiles: window.__ENGINE__.ctx.peek('ai').agents.filter((a) => a.alive && a.team === 'hostile').length };
  });

  // ---- each sees the others move
  await until(A, () => window.__NET__.system.puppets.players.size === 2);
  await until(B, () => window.__NET__.system.puppets.players.size === 2);
  await until(C, () => window.__NET__.system.puppets.players.size === 2);
  const moveAndSee = async (mover, moverName, watchers) => {
    const target = await ev(mover, () => {
      const p = window.__ENGINE__.ctx.peek('player');
      const x = p.position.x + 3, z = p.position.z + 2;
      p.teleport({ x, y: p.position.y + 1.66, z }, p.yaw);
      return { x, z, id: window.__NET__.system.t.selfId };
    });
    await frames(mover, 5);
    for (const [wn, w] of watchers) {
      await until(w, (t) => {
        const e = window.__NET__.system.puppets.players.get(t.id);
        return e && Math.hypot(e.agent.position.x - t.x, e.agent.position.z - t.z) < 0.6;
      }, target, 60000).then(
        () => check(`${wn} sees ${moverName} move`, true),
        () => check(`${wn} sees ${moverName} move`, false)
      );
    }
  };
  await moveAndSee(A, 'A(host)', [['B', B], ['C', C]]);
  await moveAndSee(B, 'B', [['A', A], ['C', C]]);

  // ---- host bots on the clients
  await until(A, () => window.__ENGINE__.ctx.peek('ai').agents.some((a) => a.alive && a.team === 'hostile'), null, 120000);
  await until(B, () => window.__NET__.system.puppets.bots.size > 0, null, 60000);
  const sa = await sys(A);
  const sb = await sys(B);
  check('host bots appear on client', sb.bots > 0 && Math.abs(sb.bots - sa.hostiles) <= 2, `host ${sa.hostiles} live, client ${sb.bots} puppets`);
  const posMatch = await ev(B, () => {
    const out = [];
    for (const e of window.__NET__.system.puppets.bots.values()) out.push([e.id, +e.agent.position.x.toFixed(2), +e.agent.position.z.toFixed(2)]);
    return out;
  });
  const hostPos = await ev(A, (ids) => ids.map((id) => {
    const a = window.__NET__.system.puppets.byNetId.get(id);
    return a ? [id, +a.position.x.toFixed(2), +a.position.z.toFixed(2)] : null;
  }), posMatch.map((p) => p[0]));
  let maxErr = 0;
  posMatch.forEach((p, i) => {
    if (hostPos[i]) maxErr = Math.max(maxErr, Math.hypot(p[1] - hostPos[i][1], p[2] - hostPos[i][2]));
  });
  check('client puppets track host bot positions', maxErr < 3, `max error ${maxErr.toFixed(2)} m`);

  // ---- a client shot kills a host bot (a real physics round against the puppet's hit capsules)
  await ev(B, () => {
    const net = window.__NET__.system;
    const e = [...net.puppets.bots.values()].find((x) => x.agent.alive);
    window.__shotTarget = e.id;
    const a = e.agent;
    const p = window.__ENGINE__.ctx.peek('player');
    // stand 3 m from it, then fire straight at its chest
    p.teleport({ x: a.position.x + 3, y: a.position.y + 1.66, z: a.position.z }, p.yaw);
  });
  await frames(B, 3);
  const shot = await ev(B, () => {
    const ctx = window.__ENGINE__.ctx;
    const net = window.__NET__.system;
    const e = net.puppets.bots.get(window.__shotTarget);
    const a = e.agent;
    const phys = ctx.peek('physics');
    const O = window.__ENGINE__.ctx.camera.position.clone();
    const T = a.position.clone();
    T.y += 1.3;
    const d = T.clone().sub(O).normalize();
    O.addScaledVector(d, 0.5);
    let dealt = 0;
    const off = ctx.events.on('damage:dealt', (x) => {
      if (x.target === a) dealt += x.amount;
    });
    for (let i = 0; i < 6; i++) phys.fireBullet({ origin: O, dir: d, damage: 60, penetration: 0.5, maxDist: 20, mask: phys.MASK.BULLET });
    off();
    return { id: e.id, dealt, sent: net.stats.hitsSent };
  });
  await until(B, (id) => {
    const e = window.__NET__.system.puppets.bots.get(id);
    return !e || !e.agent.alive;
  }, shot.id, 60000).catch(() => {});
  const killed = await ev(B, (id) => ({ alive: !!window.__NET__.system.puppets.bots.get(id)?.agent.alive, kills: window.__NET__.stats().local.kills }), shot.id);
  const hostSide = await ev(A, (id) => {
    const ai = window.__ENGINE__.ctx.peek('ai');
    const a = ai.agents.find((x) => x.netId === id);
    return { alive: !!a?.alive, applied: window.__NET__.stats().hitsApplied, rejected: window.__NET__.stats().hitsRejected };
  }, shot.id);
  check('client shot kills a host bot', shot.dealt > 0 && !hostSide.alive && !killed.alive && killed.kills >= 1,
    `round hit puppet for ${shot.dealt.toFixed(0)}; host applied ${hostSide.applied}, rejected ${hostSide.rejected}; host alive=${hostSide.alive}; client puppet alive=${killed.alive}; client kills=${killed.kills}`);

  // ---- a bot round damages the client (host AI fires at B's soldier)
  const hpBefore = await ev(B, () => window.__ENGINE__.ctx.peek('player').health.value);
  const fired = await ev(A, (bid) => {
    const ctx = window.__ENGINE__.ctx;
    const ai = ctx.peek('ai');
    const net = window.__NET__.system;
    const e = net.puppets.players.get(bid);
    const bot = ai.agents.find((a) => a.alive && a.team === 'hostile' && !a.__net);
    if (!e || !bot) return { ok: false, why: `puppet ${!!e} bot ${!!bot}` };
    const T = e.agent.position.clone();
    T.y += 1.25;
    const O = T.clone().add(new window.__ENGINE__.ctx.camera.position.constructor(2.2, 0.1, 0));
    const d = T.clone().sub(O).normalize();
    const before = net.stats.dmgSent;
    ai._fireOne(bot, O, d, true);
    let path = 'ai._fireOne';
    if (net._dmg.size === 0 && net.stats.dmgSent === before) {
      // geometry got in the way: the exact call _fireOne makes on a hit
      e.agent.applyDamage(20, 'torso', T, d, null, bot);
      path = 'agent.applyDamage (fallback)';
    }
    return { ok: true, path };
  }, await ev(B, () => window.__NET__.system.t.selfId));
  await until(B, (hp) => window.__ENGINE__.ctx.peek('player').health.value < hp, hpBefore, 30000).catch(() => {});
  const hpAfter = await ev(B, () => window.__ENGINE__.ctx.peek('player').health.value);
  check('bot round damages the client', hpAfter < hpBefore, `${fired.path}: ${hpBefore.toFixed(0)} → ${hpAfter.toFixed(0)}`);

  // ---- down → revive
  await ev(B, () => window.__ENGINE__.ctx.peek('player').applyDamage(999, null, { type: 'bullet' }));
  await until(B, () => window.__NET__.stats().local.downed);
  const bId = await ev(B, () => window.__NET__.system.t.selfId);
  await until(A, (id) => window.__NET__.system.puppets.players.get(id)?.downed === true, bId, 30000).then(
    () => check('host sees the client downed', true),
    () => check('host sees the client downed', false)
  );
  await ev(A, (id) => {
    const e = window.__NET__.system.puppets.players.get(id);
    const p = window.__ENGINE__.ctx.peek('player');
    p.teleport({ x: e.agent.position.x + 1, y: e.agent.position.y + 1.66, z: e.agent.position.z }, p.yaw);
    window.__NET__.system._forceRevive = true; // holding F
  }, bId);
  await until(B, () => !window.__NET__.stats().local.downed, null, 60000).catch(() => {});
  await ev(A, () => (window.__NET__.system._forceRevive = false));
  const rv = await ev(B, () => ({ downed: window.__NET__.stats().local.downed, hp: window.__ENGINE__.ctx.peek('player').health.value, dead: window.__ENGINE__.ctx.peek('player').dead }));
  check('down → revive cycle', !rv.downed && rv.hp > 0 && !rv.dead, JSON.stringify(rv));

  // ---- shared wave progression
  const w0 = (await sys(A)).wave;
  for (let i = 0; i < 40; i++) {
    const s = await sys(A);
    if (s.wave > w0) break;
    await ev(A, () => window.FLOP.killAll('hostile'));
    await frames(A, 20);
  }
  const w1 = (await sys(A)).wave;
  await until(B, (w) => window.__ENGINE__.ctx.peek('game').mode.wave === w, w1, 60000).catch(() => {});
  await until(C, (w) => window.__ENGINE__.ctx.peek('game').mode.wave === w, w1, 60000).catch(() => {});
  const wb = (await sys(B)).wave, wc = (await sys(C)).wave;
  const scoreA = await ev(A, () => window.FLOP.state.score);
  const scoreB = await ev(B, () => window.FLOP.state.score);
  check('wave progression is shared', w1 > w0 && wb === w1 && wc === w1, `host ${w0}→${w1}, B ${wb}, C ${wc}`);
  check('score is shared', scoreA > 0 && scoreB === scoreA, `host ${scoreA}, B ${scoreB}`);

  // ---- host migration
  const before = { B: await sys(B), C: await sys(C) };
  await A.close();
  log('host page closed');
  let newHost = null;
  for (let i = 0; i < 300 && !newHost; i++) {
    const b = await sys(B);
    const c = await sys(C);
    if (b.role === 'host' && c.host === b.self) newHost = 'B';
    else if (c.role === 'host' && b.host === c.self) newHost = 'C';
    else await frames(B, 5);
  }
  const H = newHost === 'B' ? B : C;
  const F = newHost === 'B' ? C : B;
  const hs = newHost ? await sys(H) : null;
  check('host migration: a client takes over and the other follows it', !!newHost, newHost ? `new host ${newHost}, wave ${hs.wave}, remote=${hs.remote}, hostiles ${hs.hostiles}` : 'no new host');
  if (newHost) {
    check('new host runs the waves (authoritative, bots handed to the AI)', !hs.remote && hs.wave === before.B.wave && hs.promoted === 1, JSON.stringify({ wave: hs.wave, remote: hs.remote, hostiles: hs.hostiles, promoted: hs.promoted }));
    // the follower renders the new host's bots
    await until(H, () => window.__ENGINE__.ctx.peek('ai').agents.some((a) => a.alive && a.team === 'hostile' && !a.__net), null, 120000).catch(() => {});
    await until(F, () => window.__NET__.system.puppets.bots.size > 0, null, 60000).catch(() => {});
    const fs = await sys(F);
    check('follower draws the new host\'s bots', fs.bots > 0, `${fs.bots} puppets`);
    // and the new host advances the wave by itself
    const wv = (await sys(H)).wave;
    for (let i = 0; i < 40; i++) {
      if ((await sys(H)).wave > wv) break;
      await ev(H, () => window.FLOP.killAll('hostile'));
      await frames(H, 20);
    }
    const wv2 = (await sys(H)).wave;
    await until(F, (w) => window.__ENGINE__.ctx.peek('game').mode.wave === w, wv2, 60000).catch(() => {});
    const wf = (await sys(F)).wave;
    check('waves continue under the new host', wv2 > wv && wf === wv2, `new host ${wv}→${wv2}, follower ${wf}`);
  }

  // ---- everyone down → run over for the whole party
  if (newHost) {
    for (const p of [H, F]) await ev(p, () => window.__ENGINE__.ctx.peek('player').applyDamage(999, null, { type: 'bullet' }));
    await until(H, () => window.FLOP.state.mode === 'over', null, 60000).catch(() => {});
    await until(F, () => window.FLOP.state.mode === 'over', null, 60000).catch(() => {});
    const oh = await ev(H, () => window.FLOP.state.mode);
    const of = await ev(F, () => window.FLOP.state.mode);
    check('everyone down → game over for the party', oh === 'over' && of === 'over', `host ${oh}, follower ${of}`);
  }
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
