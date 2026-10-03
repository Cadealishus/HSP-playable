// ClaudeRoomTransport against an in-memory mock of the claude.ai room contract
// (room.d.ts: join → NamedRoom with presence/peers/onPeers/emit/on, frozen
// Peer snapshots, own emits echoed back with sameTab, agent peers). Checks the
// adapter yields exactly LocalTransport's semantics.
//   node tools/net-claude-mock-test.mjs
import { ClaudeRoomTransport } from '../src/net/claude.js';

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    fails++;
    console.log('FAIL', m);
  }
};
const tick = () => new Promise((r) => setTimeout(r, 5));

// --- the mock platform: one hub, many pages
const hub = { members: new Map(), listeners: new Map() };
let seq = 0;
function page() {
  const peer = `p${++seq}`;
  const me = { peer, presence: Object.freeze({}), updatedAt: 0 };
  const peerFns = new Set();
  const topicFns = new Map();
  const snap = (viewer) =>
    Object.freeze([...hub.members.values()].map((m) => Object.freeze({ peer: m.peer, by: null, isMe: m.peer === viewer, sameTab: m.peer === viewer, kind: m.kind ?? 'viewer', guest: false, presence: m.presence, updatedAt: m.updatedAt })));
  const named = {
    name: 'ops-mock',
    async emit(topic, data) {
      for (const m of hub.members.values()) {
        for (const fn of m.topicFns?.get(topic) ?? []) fn({ topic, data, peer, by: null, isMe: m.peer === peer, sameTab: m.peer === peer, kind: 'viewer', guest: false });
      }
    },
    on(topic, fn) {
      if (!topicFns.has(topic)) topicFns.set(topic, new Set());
      topicFns.get(topic).add(fn);
      return () => topicFns.get(topic).delete(fn);
    },
    async presence(patch) {
      const next = { ...me.presence };
      for (const k of Object.keys(patch)) {
        if (patch[k] === null) delete next[k];
        else next[k] = patch[k];
      }
      me.presence = Object.freeze(next);
      me.updatedAt = Date.now();
      for (const m of hub.members.values()) m.notify({ updated: [me.peer] });
    },
    peers: () => snap(peer),
    onPeers(fn) {
      peerFns.add(fn);
      queueMicrotask(() => {
        const ps = snap(peer);
        fn({ peers: ps, joined: ps, left: [], updated: [] });
      });
      return () => peerFns.delete(fn);
    },
    connected: () => true,
    onConnection(fn) {
      queueMicrotask(() => fn(true));
      return () => {};
    },
    async leave() {
      hub.members.delete(peer);
      for (const m of hub.members.values()) m.notify({ left: [{ ...me, isMe: false, sameTab: false, kind: 'viewer' }] });
    },
  };
  me.topicFns = topicFns;
  me.notify = ({ updated = [], left = [], joined = [] }) => {
    const ps = snap(peer);
    const pick = (ids) => ids.map((id) => ps.find((p) => p.peer === id)).filter(Boolean);
    for (const fn of peerFns) fn({ peers: ps, joined: pick(joined), updated: pick(updated), left });
  };
  const room = { join: async () => {
    hub.members.set(peer, me);
    for (const m of hub.members.values()) if (m !== me) m.notify({ joined: [peer] });
    return named;
  } };
  return { peer, room };
}

async function make() {
  const pg = page();
  globalThis.claude = { use: async (n) => (n === 'room' ? pg.room : null) };
  // fresh module-level memo per page: construct then swap in the room directly
  const t = new ClaudeRoomTransport();
  t.room = pg.room;
  return { t, pg };
}

// The adapter memoises claude.use('room'); bypass by opening with the room it probes.
const { claudeRoom } = await import('../src/net/claude.js');
const a = await make();
await a.t.open('ops-mock');
const got = { a: [], b: [] };
a.t.on('hit', (d, from) => got.a.push([d, from]));
await tick();
ok(a.t.selfId === a.pg.peer, `selfId ${a.t.selfId}`);

// second page: re-point the memoised probe at its own room object
const b = page();
const tb = new ClaudeRoomTransport();
tb.open = async function (code) {
  // same as ClaudeRoomTransport.open, but with this page's room
  const named = await b.room.join(code);
  this.named = named;
  this.code = code;
  this._offs.push(named.onPeers((ch) => this._onPeers(ch), (e) => this._fail(e)));
  for (const topic of this._topicFns.keys()) this._wire(topic);
};
tb.on('hit', (d, from) => got.b.push([d, from]));
await tb.open('ops-mock');
await tick();
ok(tb.selfId === b.peer, 'second selfId');
ok(a.t.peers().size === 2 && tb.peers().size === 2, `peers ${a.t.peers().size}/${tb.peers().size}`);

await a.t.setPresence({ v: 1, c: 3 });
await tick();
ok(tb.peers().get(a.pg.peer)?.presence?.c === 3, 'presence reaches the other page');
ok(a.t.peers().get(a.pg.peer)?.presence?.c === 3, 'own presence applied locally');

await tb.emit('hit', { s: 1, h: [[5, 10, 0]] });
await tick();
ok(got.a.length === 1 && got.a[0][1] === b.peer, 'emit delivered to the other page with sender id');
ok(got.b.length === 0, 'own emit NOT echoed to the sender');

let rejected = false;
await a.t.setPresence({ big: 'x'.repeat(5000) }).catch(() => (rejected = true));
ok(rejected, 'presence over 4 KiB rejected locally');
rejected = false;
await a.t.emit('Bad:Topic', {}).catch(() => (rejected = true));
ok(rejected, 'bad topic rejected locally');

let left = null;
a.t.onPeers((ch) => ch.left.length && (left = ch.left[0]));
tb.close();
await tick();
ok(left === b.peer && !a.t.peers().has(b.peer), 'leave reported as left');
void claudeRoom;
console.log(fails ? `${fails} FAILURES` : 'claude adapter (mock room): all checks passed');
process.exit(fails ? 1 : 0);
