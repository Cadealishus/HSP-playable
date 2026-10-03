// Unit checks for src/net/codec.js: round trips, clamping, malformed input,
// and the 4 KiB presence budget with 16 (and 24) bots.
//   node tools/net-codec-test.mjs
import {
  Writer, Reader, writeBot, readBot, writePlayer, readPlayer, writeGame, readGame,
  writeRoster, readRoster, jsonBytes, normaliseCode, randomCode, BOT_LEN, PLAYER_LEN, GAME_LEN, MAX_BOTS,
} from '../src/net/codec.js';
import { TOPICS, TOPIC_RE, byteLen } from '../src/net/transport.js';

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) {
    fails++;
    console.log('FAIL', msg);
  }
};
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// --- bots
const w = new Writer(4096);
const bots = [];
for (let i = 0; i < 16; i++) {
  bots.push({
    id: 100 + i * 37,
    x: -812.37 + i * 13.1, y: 3.21 + i * 0.5, z: 455.55 - i * 7,
    yaw: (i * 0.7) % 6.28, ayaw: -1.2 + i * 0.1, pitch: -0.4 + i * 0.05,
    speed: (i % 7) * 0.9, flags: i % 32, shots: i * 9, hits: i * 3, hp: 100 - i * 6,
  });
}
for (const b of bots) writeBot(w, b);
const bstr = w.toString();
ok(bstr.length === 16 * BOT_LEN, `bot string length ${bstr.length}`);
const r = new Reader().set(bstr);
const out = {};
for (const b of bots) {
  ok(readBot(r, out), 'readBot ok');
  ok(out.id === b.id, 'id');
  near(out.x, b.x, 0.006, 'x');
  near(out.y, b.y, 0.006, 'y');
  near(out.z, b.z, 0.006, 'z');
  const dy = Math.abs(((out.yaw - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  ok(dy < 0.002, `yaw ${out.yaw} vs ${b.yaw}`);
  near(out.pitch, b.pitch, 0.03, 'pitch');
  near(out.speed, b.speed, 0.051, 'speed');
  ok(out.flags === b.flags, 'flags');
  ok(out.shots === b.shots % 64, 'shots');
  near(out.hp, b.hp, 1, 'hp');
}

// --- clamping and garbage
w.reset().pos(99999).pos(-99999).yaw(NaN).pitch(Infinity);
const cr = new Reader().set(w.toString());
near(cr.pos(), 1310.71, 0.01, 'pos clamps high');
near(cr.pos(), -1310.72, 0.01, 'pos clamps low');
ok(cr.ok, 'clamped values read ok');
const bad = new Reader().set('!!!!' + bstr.slice(4, BOT_LEN));
ok(!readBot(bad, out), 'malformed bot rejected');
ok(!readBot(new Reader().set('AAA'), out), 'short bot rejected');
ok(!readPlayer('xyz', {}), 'short player rejected');
ok(!readPlayer('é'.repeat(PLAYER_LEN), {}), 'non-alphabet player rejected');

// --- player / game round trips
const pl = { x: 12.34, y: 1.02, z: -40.5, yaw: 2.5, pitch: 0.3, speed: 5.5, flags: 21, shots: 70, hp: 0.62, bleed: 23, revive: 0.5, slot: 2, kills: 345 };
w.reset();
writePlayer(w, pl);
const ps = w.toString();
ok(ps.length === PLAYER_LEN, `player length ${ps.length}`);
const po = {};
ok(readPlayer(ps, po), 'readPlayer');
near(po.x, pl.x, 0.006, 'px');
near(po.hp, pl.hp, 0.02, 'php');
ok(po.shots === 6 && po.bleed === 23 && po.slot === 2 && po.kills === 345, 'player ints');
const g = { run: 3, wave: 17, flags: 9, score: 1234567, mult: 7, kills: 222, alive: 9, spawned: 20, goal: 30, breather: 6.5, epoch: 4 };
w.reset();
writeGame(w, g);
const gs = w.toString();
ok(gs.length === GAME_LEN, `game length ${gs.length}`);
const go = {};
ok(readGame(gs, go), 'readGame');
for (const k of Object.keys(g)) near(go[k], g[k], 0.26, `game ${k}`);

// --- roster
const roster = bots.map((b, i) => ({ id: b.id, variant: ['vanguard', 'irregular', 'breacher'][i % 3], role: 'rifleman', weapon: 'carbine', team: 'hostile', name: `GARY ${'I'.repeat((i % 3) + 1)}|~<script>` }));
const rs = writeRoster(roster);
const rm = readRoster(rs);
ok(rm.size === 16, `roster size ${rm.size}`);
ok(!/[|~<>]/.test([...rm.values()].map((e) => e.name).join('')), 'roster names sanitised');
ok(readRoster('1~a~b~c~h~n|garbage|99999~a~b~c~h~x').size === 1, 'roster rejects junk');

// --- the 4 KiB presence budget (host, worst case)
const pres = (nBots) => {
  const ww = new Writer(8192);
  const list = [];
  for (let i = 0; i < nBots; i++) {
    writeBot(ww, bots[i % 16]);
    list.push({ id: 4000 + i, variant: 'irregular', role: 'shotgun', weapon: 'shotgun_auto', team: 'hostile', name: 'BARTHOLOMEW III' });
  }
  return {
    v: 1, st: 'game', c: 999, uid: 'u_0123456789abcdef0123456789abcdef',
    l: { m: 'industrial', d: 'hardened', go: 12, ig: 1 },
    p: ps, w: 'carbine_sd', rt: 'k3v6q2rt7wacd4fn',
    g: gs, b: ww.toString(), r: writeRoster(list),
  };
};
const b16 = jsonBytes(pres(16));
const b24 = jsonBytes(pres(MAX_BOTS));
console.log(`host presence: 16 bots ${b16} B, ${MAX_BOTS} bots ${b24} B (limit 4096)`);
ok(b16 < 4096 && b24 < 4096, 'host presence under 4 KiB');
const client = { v: 1, st: 'game', c: 0, uid: null, p: ps, w: 'carbine', rt: null };
console.log(`client presence: ${jsonBytes(client)} B`);

// --- event sizes (worst case)
const hit = { s: 123456, h: Array.from({ length: 32 }, (_, i) => [4000 + i, 599.9, 1]) };
const over = { score: 123456789, wave: 99, kills: 9999, durationS: 99999 };
console.log(`hit batch (32): ${jsonBytes(hit)} B, over: ${jsonBytes(over)} B`);
ok(jsonBytes(hit) < 4096, 'hit batch under 4 KiB');
ok(byteLen(JSON.stringify(hit)) === jsonBytes(hit), 'byteLen agrees with TextEncoder');

// --- topics and codes
ok(TOPICS.length <= 16, 'at most 16 topics');
for (const t of TOPICS) ok(TOPIC_RE.test(t), `topic grammar ${t}`);
ok(normaliseCode('OPS-7K2Q') === 'ops-7k2q', 'code normalise');
ok(normaliseCode('7k2q') === 'ops-7k2q', 'code short form');
ok(normaliseCode('  ') === null && normaliseCode('!!') === null, 'code rejects junk');
ok(/^ops-[a-z0-9]{4}$/.test(randomCode()), 'random code shape');

console.log(fails ? `${fails} FAILURES` : 'codec: all checks passed');
process.exit(fails ? 1 : 0);
