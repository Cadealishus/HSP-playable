/**
 * NET — wire encoding. Plain JS, no three.js, no engine: Node can import it
 * (tools/net-codec-test.mjs checks every size budget below).
 *
 * High-rate state rides in room `presence`, whose MERGED object must stay
 * under 4 KiB of JSON. Numbers in JSON cost 4-7 bytes each plus a comma, so
 * the snapshots are packed into base64url strings instead: every field is
 * quantised to a fixed number of 6-bit characters, and a string of [A-Za-z0-9-_]
 * needs no JSON escaping, so its byte cost is exactly its length.
 *
 *   field        chars  range / resolution
 *   position     3 × 3  signed centimetres, ±1310 m
 *   yaw          2      12 bits over 2π (0.09°)
 *   pitch        1      6 bits over [-π/2, π/2] (2.9°)
 *   speed        1      0 .. 6.3 m/s in 0.1 m/s
 *   counters     1      shots / hits mod 64 (receivers diff them)
 *   health       1      0 .. 63 of 63
 *
 *   BOT record     21 chars → 16 bots = 336 B (MAX_BOTS)
 *   PLAYER record  21 chars
 *   GAME record    24 chars
 *
 * Decoding is defensive: a character outside the alphabet makes the record
 * invalid (null), never NaN, and every value comes back clamped to its range.
 * Everything a peer sends is untrusted.
 */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ENC = new Uint8Array(64);
const DEC = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) {
  ENC[i] = ALPHA.charCodeAt(i);
  DEC[ALPHA.charCodeAt(i)] = i;
}

const TAU = Math.PI * 2;

export const BOT_LEN = 21;
export const PLAYER_LEN = 21;
export const GAME_LEN = 24;
/** Bots per snapshot. 16 keeps every presence string under 1 KiB (the room
 *  hands presence to a viewer's Claude only when each string is ≤ 1 KiB). */
export const MAX_BOTS = 16;
export const ROSTER_MAX = 1000;

/** Fixed-capacity writer: one string allocation per `toString()`, nothing else. */
export class Writer {
  constructor(cap = 1024) {
    this.buf = new Uint8Array(cap);
    this.n = 0;
  }
  reset() {
    this.n = 0;
    return this;
  }
  /** Unsigned integer in `chars` characters (clamped). */
  u(v, chars) {
    const max = 2 ** (6 * chars) - 1;
    let x = Math.round(Number.isFinite(v) ? v : 0);
    x = x < 0 ? 0 : x > max ? max : x;
    for (let i = chars - 1; i >= 0; i--) this.buf[this.n++] = ENC[Math.floor(x / 2 ** (6 * i)) % 64];
    return this;
  }
  /** Signed integer in `chars` characters (offset binary, clamped). */
  s(v, chars) {
    const half = 2 ** (6 * chars - 1);
    let x = Math.round(Number.isFinite(v) ? v : 0);
    x = x < -half ? -half : x > half - 1 ? half - 1 : x;
    return this.u(x + half, chars);
  }
  /** Metres → signed centimetres, 3 chars. */
  pos(m) {
    return this.s(m * 100, 3);
  }
  /** Radians, wrapped, 12 bits. */
  yaw(r) {
    let a = (Number.isFinite(r) ? r : 0) % TAU;
    if (a < 0) a += TAU;
    return this.u(Math.round((a / TAU) * 4096) % 4096, 2);
  }
  /** Radians in [-π/2, π/2], 6 bits. */
  pitch(r) {
    const p = Number.isFinite(r) ? r : 0;
    return this.u(Math.round(((p + Math.PI / 2) / Math.PI) * 63), 1);
  }
  toString() {
    // String.fromCharCode over a subarray: one allocation (the string).
    return String.fromCharCode.apply(null, this.buf.subarray(0, this.n));
  }
}

/** Reader over an untrusted string. `ok` drops to false on any bad character. */
export class Reader {
  constructor() {
    this.str = '';
    this.i = 0;
    this.ok = true;
  }
  set(str) {
    this.str = typeof str === 'string' ? str : '';
    this.i = 0;
    this.ok = true;
    return this;
  }
  get left() {
    return this.str.length - this.i;
  }
  u(chars) {
    let x = 0;
    for (let k = 0; k < chars; k++) {
      const c = this.str.charCodeAt(this.i++);
      const d = c < 128 ? DEC[c] : -1;
      if (d < 0) {
        this.ok = false;
        return 0;
      }
      x = x * 64 + d;
    }
    return x;
  }
  s(chars) {
    return this.u(chars) - 2 ** (6 * chars - 1);
  }
  pos() {
    return this.s(3) / 100;
  }
  yaw() {
    return (this.u(2) / 4096) * TAU;
  }
  pitch() {
    return (this.u(1) / 63) * Math.PI - Math.PI / 2;
  }
}

/* ------------------------------------------------------------------ bots */

/** Bot flags. */
export const BF = { CROUCH: 1, AIM: 2, RELOAD: 4, HURT: 8, ESF: 16 };

/**
 * Write one bot. `b` = { id, x, y, z, yaw, ayaw, pitch, speed, flags, shots, hits, hp }
 * (yaw = body, ayaw = aim, agent convention: forward = (sin, cos)).
 */
export function writeBot(w, b) {
  w.u(b.id, 2).pos(b.x).pos(b.y).pos(b.z).yaw(b.yaw).yaw(b.ayaw).pitch(b.pitch);
  w.u(b.speed * 10, 1).u(b.flags, 1).u(b.shots % 64, 1).u(b.hits % 64, 1).u((b.hp / 100) * 63, 1);
}

/** Read one bot into `out`; returns false when the record is malformed. */
export function readBot(r, out) {
  if (r.left < BOT_LEN) return false;
  out.id = r.u(2);
  out.x = r.pos();
  out.y = r.pos();
  out.z = r.pos();
  out.yaw = r.yaw();
  out.ayaw = r.yaw();
  out.pitch = r.pitch();
  out.speed = r.u(1) / 10;
  out.flags = r.u(1);
  out.shots = r.u(1);
  out.hits = r.u(1);
  out.hp = (r.u(1) / 63) * 100;
  return r.ok;
}

/* --------------------------------------------------------------- players */

/** Player flags. */
export const PF = { CROUCH: 1, PRONE: 2, SPRINT: 4, ADS: 8, DOWN: 16, DEAD: 32 };

/**
 * One player: { x, y, z (feet), yaw, pitch (player convention: forward =
 * (-sin yaw cos pitch, sin pitch, -cos yaw cos pitch)), speed, flags, shots,
 * hp (0..1), bleed (s), revive (0..1) }.
 */
export function writePlayer(w, p) {
  w.pos(p.x).pos(p.y).pos(p.z).yaw(p.yaw).pitch(p.pitch);
  w.u(p.speed * 10, 1).u(p.flags, 1).u(p.shots % 64, 1).u(p.hp * 63, 1).u(p.bleed, 1).u(p.revive * 63, 1);
  w.u(p.slot ?? 0, 1).u(p.kills ?? 0, 2);
}

export function readPlayer(str, out, r = new Reader()) {
  r.set(str);
  if (r.left < PLAYER_LEN) return false;
  out.x = r.pos();
  out.y = r.pos();
  out.z = r.pos();
  out.yaw = r.yaw();
  out.pitch = r.pitch();
  out.speed = r.u(1) / 10;
  out.flags = r.u(1);
  out.shots = r.u(1);
  out.hp = r.u(1) / 63;
  out.bleed = r.u(1);
  out.revive = r.u(1) / 63;
  out.slot = r.u(1);
  out.kills = r.u(2);
  return r.ok;
}

/* ------------------------------------------------------------------ game */

/** Game flags. */
export const GF = { ACTIVE: 1, BREATHER: 2, OVER: 4, PLAY: 8 };

/**
 * The host's survival state: { run, wave, flags, score, mult, kills, alive,
 * spawned, goal, breather (s), epoch }.
 */
export function writeGame(w, g) {
  w.u(g.run, 2).u(g.wave, 2).u(g.flags, 1).u(g.score, 5).u(g.mult, 1).u(g.kills, 3);
  w.u(g.alive, 2).u(g.spawned, 2).u(g.goal, 2).u(g.breather * 4, 1).u(g.epoch, 3);
}

export function readGame(str, out, r = new Reader()) {
  r.set(str);
  if (r.left < GAME_LEN) return false;
  out.run = r.u(2);
  out.wave = r.u(2);
  out.flags = r.u(1);
  out.score = r.u(5);
  out.mult = Math.min(99, r.u(1));
  out.kills = r.u(3);
  out.alive = r.u(2);
  out.spawned = r.u(2);
  out.goal = r.u(2);
  out.breather = r.u(1) / 4;
  out.epoch = r.u(3);
  return r.ok;
}

/* ---------------------------------------------------------------- roster */

/**
 * Who each bot is (changes on spawn only): `id~variant~role~weapon~team~name`
 * records joined by '|'. Ids/strings are sanitised on write and re-validated
 * on read (identifier-ish, length-capped).
 */
const SAFE = /[^A-Za-z0-9 _.'-]/g;
export function cleanToken(s, max = 24) {
  return String(s ?? '').replace(SAFE, '').slice(0, max);
}

export function writeRoster(list) {
  let out = '';
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const rec = `${e.id | 0}~${cleanToken(e.variant, 10)}~${cleanToken(e.role, 10)}~${cleanToken(e.weapon, 14)}~${e.team === 'esf' ? 'e' : 'h'}~${cleanToken(e.name, 14)}`;
    if (out.length + rec.length + 1 > ROSTER_MAX) break;
    out += (out ? '|' : '') + rec;
  }
  return out;
}

/** Parse a roster string into a Map id → entry (validated). */
export function readRoster(str, max = MAX_BOTS) {
  const out = new Map();
  if (typeof str !== 'string' || str.length > 2400) return out;
  const recs = str.split('|');
  for (let i = 0; i < recs.length && out.size < max; i++) {
    const f = recs[i].split('~');
    if (f.length !== 6) continue;
    const id = Number(f[0]);
    if (!Number.isInteger(id) || id < 0 || id > 4095) continue;
    out.set(id, {
      id,
      variant: cleanToken(f[1], 10),
      role: cleanToken(f[2], 10),
      weapon: cleanToken(f[3], 14),
      team: f[4] === 'e' ? 'esf' : 'hostile',
      name: cleanToken(f[5], 14).toUpperCase(),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- helpers */

/** UTF-8 byte length of the JSON text of `v` (what the room limits). */
export function jsonBytes(v) {
  const s = JSON.stringify(v);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return Buffer.byteLength(s, 'utf8');
}

/** Finite number clamped to [lo, hi], else `def`. */
export function num(v, lo, hi, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return n < lo ? lo : n > hi ? hi : n;
}

/** Validated [x, y, z] array → writes into `out` ({x,y,z}); false if malformed. */
export function vec3(a, out, lim = 5000) {
  if (!Array.isArray(a) || a.length !== 3) return false;
  for (let i = 0; i < 3; i++) if (!Number.isFinite(a[i]) || Math.abs(a[i]) > lim) return false;
  out.x = a[0];
  out.y = a[1];
  out.z = a[2];
  return true;
}

/** Round to cm for event payloads. */
export const cm = (v) => Math.round(v * 100) / 100;

/** Party codes: `ops-` + 4 chars of an unambiguous alphabet. */
const CODE_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomCode() {
  const b = new Uint8Array(4);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < 4; i++) b[i] = (Date.now() / (i + 1)) & 255;
  }
  let s = 'ops-';
  for (let i = 0; i < 4; i++) s += CODE_ALPHA[b[i] % CODE_ALPHA.length];
  return s;
}

/** A user-typed code → a valid room name, or null. Room names: ^[a-z0-9][a-z0-9_.-]{0,47}$ */
export function normaliseCode(s) {
  const c = String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '');
  if (!c) return null;
  const full = /^ops-/.test(c) ? c : /^[a-z0-9]{3,8}$/.test(c) ? `ops-${c}` : c;
  return /^[a-z0-9][a-z0-9_.-]{0,47}$/.test(full) ? full : null;
}
