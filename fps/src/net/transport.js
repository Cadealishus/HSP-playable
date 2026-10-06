/**
 * NET — the transport interface and its shared plumbing.
 *
 * A transport is one named room: everyone who opened the same party code.
 * Two adapters implement it with IDENTICAL semantics:
 *
 *   ClaudeRoomTransport  (claude.js)  the real one: `claude.use('room')` →
 *                                     `room.join(code)` inside the claude.ai
 *                                     artifact viewer
 *   LocalTransport       (local.js)   BroadcastChannel between tabs/pages of
 *                                     one browser profile (`?net=local`), for
 *                                     headless tests and LAN-less dev
 *
 * INTERFACE
 *   kind                      'claude' | 'local'
 *   selfId                    this page's peer label (null until known)
 *   open(code) → Promise      join the named room (rejects with Error.code)
 *   peers() → Map<id, Peer>   everyone here, me included; Peer = { id, by,
 *                             presence (frozen, untrusted), isMe }
 *   onPeers(fn)               fn({ joined: id[], left: id[], updated: id[] })
 *   setPresence(patch)        merge into my presence (null deletes a key);
 *                             coalesced to ~30 Hz, merged object ≤ 4 KiB
 *   emit(topic, data)         a moment to everyone else (never echoed back
 *                             to this page); data ≤ 4 KiB
 *   on(topic, fn)             fn(data, fromId) — data is UNTRUSTED
 *   connected() → bool
 *   close()                   leave; idempotent
 *
 * Both adapters enforce the room contract locally (topic grammar, the 4 KiB
 * limits) so a size bug shows up in a local test exactly as it would on the
 * real room.
 */

export const TOPIC_RE = /^[a-z][a-z0-9_.-]{0,47}$/;
export const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
export const MAX_BYTES = 4096;

/**
 * Every topic this game sends. The artifact must open each to the interact
 * level at publish time:
 *   capabilities: { room: { topics: { hit: 'interact', … } }, user: { … } }
 */
export const TOPICS = Object.freeze([
  'hit', // client → host: batched hit claims {s, h:[[botId,dmg,head]], p:[[peer,dmg,zone]], am, w}
  'dmg', // host → one player: validated damage {t, a, f:[x,y,z], k killer, z zone, am ammo, w}
  'kill', // host: a bot died {i, h, k, d:[x,y,z]}
  'wave', // host: wave start {n, c, run}
  'clear', // host: wave held {n, b, run}
  'over', // host: everyone is down, run concluded {score, wave, kills, …}
  'nade', // anyone: grenade thrown {k, p:[], v:[], f}
  'boom', // host: hostile explosion {p:[], r, d}
  'revive', // reviver → downed teammate {t}
  'start', // host (lobby): deploy {m, d, run}
  'state', // host: full state re-sent when someone joins {g, r}
  'death', // PvP: I died {k killer, h headshot, w weapon} (killfeed, ragdoll, score)
]);

export function byteLen(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export class NetError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

/**
 * Shared bookkeeping both adapters use: listeners, the peer map, merged
 * presence. Adapters call `_peerSet / _peerGone / _flushPeers / _deliver`.
 */
export class BaseTransport {
  constructor(kind) {
    this.kind = kind;
    this.selfId = null;
    this._peers = new Map();
    this._peerFns = new Set();
    this._topicFns = new Map();
    this._presence = {};
    this._pending = { joined: [], left: [], updated: [] };
    this._closed = false;
  }

  peers() {
    return this._peers;
  }

  onPeers(fn) {
    this._peerFns.add(fn);
    return () => this._peerFns.delete(fn);
  }

  on(topic, fn) {
    let set = this._topicFns.get(topic);
    if (!set) this._topicFns.set(topic, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /** Merge a patch into my presence; returns the merged object or throws on size. */
  _merge(patch) {
    const next = { ...this._presence };
    for (const k of Object.keys(patch ?? {})) {
      if (patch[k] === null || patch[k] === undefined) delete next[k];
      else next[k] = patch[k];
    }
    const bytes = byteLen(JSON.stringify(next));
    if (bytes > MAX_BYTES) throw new NetError('invalid_argument', `presence is ${bytes} bytes (max ${MAX_BYTES})`);
    this._presence = next;
    return next;
  }

  _checkEmit(topic, data) {
    if (!TOPIC_RE.test(topic)) throw new NetError('invalid_argument', `bad topic ${topic}`);
    const bytes = byteLen(JSON.stringify(data ?? null));
    if (bytes > MAX_BYTES) throw new NetError('invalid_argument', `emit ${topic} is ${bytes} bytes (max ${MAX_BYTES})`);
  }

  _peerSet(id, by, presence, isMe) {
    const had = this._peers.get(id);
    if (had && had.presence === presence) return;
    this._peers.set(id, Object.freeze({ id, by: by ?? null, presence: presence ?? {}, isMe: !!isMe }));
    (had ? this._pending.updated : this._pending.joined).push(id);
  }

  _peerGone(id) {
    if (!this._peers.has(id)) return;
    this._peers.delete(id);
    this._pending.left.push(id);
  }

  _flushPeers() {
    const p = this._pending;
    if (!p.joined.length && !p.left.length && !p.updated.length) return;
    this._pending = { joined: [], left: [], updated: [] };
    for (const fn of this._peerFns) {
      try {
        fn(p);
      } catch (err) {
        console.warn('[net] peers handler threw', err);
      }
    }
  }

  _deliver(topic, data, from) {
    const set = this._topicFns.get(topic);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(data, from);
      } catch (err) {
        console.warn(`[net] ${topic} handler threw`, err);
      }
    }
  }
}
