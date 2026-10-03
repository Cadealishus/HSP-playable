/**
 * NET — online co-op. Subsystem id `net`.
 *
 * 2–4 players hold the line against the survival waves together, over a
 * realtime room (src/net/transport.js): the claude.ai artifact room in
 * production, a BroadcastChannel between tabs under `?net=local`. With no
 * party, nothing here runs and single-player is untouched.
 *
 * HOST-AUTHORITATIVE
 *   host     one page runs the survival mode and ALL AI, exactly as single
 *            player does. Remote teammates exist in its AI world as ESF
 *            puppets (puppets.js), so bots see, hunt and shoot them; a bot
 *            round on a puppet is forwarded to that player (`dmg`).
 *   clients  spawn no AI. The host's bots arrive in presence (`b`, `r`) and
 *            are drawn as interpolated puppets of the AI's own soldiers.
 *            A client's round on a puppet is resolved locally, then reported
 *            (`hit`); the host validates it (alive, range, rate) and applies
 *            it through the agent's own damage path. Kills come back (`kill`).
 *   everyone owns their own movement and health (presence `p`).
 *
 * ELECTION. Each page publishes a host claim `c` = epoch·2 + priority. The
 * highest claim is host (ties: lowest peer label). The party creator claims
 * at once; when the host leaves, nobody claims, and after a short settle the
 * LOWEST peer label claims epoch+1: host migration. Its bot puppets become
 * real agents again (Puppets.promoteBots) and its survival mode takes over the
 * wave from the last state the old host published. A page that reloads onto a
 * new map re-claims with its old priority, so the original host keeps hosting.
 *
 * PRESENCE (≈20 Hz, all ≤ 4 KiB; see codec.js for the packing)
 *   v proto · st 'lobby'|'game' · c claim · uid user id (names, when `by` is null)
 *   l (host) lobby {m map, d difficulty, go start counter, ig in game}
 *   p player record · w weapon id · rt revive target
 *   g (host) game record · b (host) bot snapshot · r (host) bot roster
 * EVENTS: transport.js TOPICS.
 *
 * DOWNED. In co-op a death is a down: hold F for 3 s next to a downed teammate
 * to revive; after 30 s he bleeds out and redeploys at the next wave. When
 * everyone is down (or out) at once, the run is over for the whole party.
 *
 * Everything received is untrusted: every field is validated and clamped.
 */

import * as THREE from 'three';
import { LocalTransport } from './local.js';
import { ClaudeRoomTransport, claudeRoom, claudeUser } from './claude.js';
import { TOPICS } from './transport.js';
import { Writer, writePlayer, readPlayer, writeGame, readGame, Reader, PF, GF, num, vec3, cm, randomCode, normaliseCode, PLAYER_LEN, GAME_LEN } from './codec.js';
import { Puppets } from './puppets.js';
import { NetHud } from './hud.js';

export { TOPICS };

const PARTY_KEY = 'flopops.party';
const PROTO = 1;
const SEND_MS = 50;
const FLUSH_MS = 100;
const HUD_MS = 200;
const BLEED_S = 30;
const REVIVE_S = 3;
const REVIVE_R = 2.2;
const SETTLE_JOIN_MS = 1500;
const SETTLE_RESUME_MS = 60000;
const SETTLE_MIGRATE_MS = 700;
const HIT_RATE = 30;
const HIT_BURST = 45;
const MAX_HIT_DMG = 600;
const MAX_HIT_RANGE = 320;
const PARTY_TTL_MS = 30 * 60 * 1000;
const SPAWN_RING = 1.5;

/* ------------------------------------------------------------ party record */

function storages() {
  const out = [];
  try {
    if (globalThis.sessionStorage) out.push(globalThis.sessionStorage);
  } catch {
    /* blocked */
  }
  try {
    if (globalThis.localStorage) out.push(globalThis.localStorage);
  } catch {
    /* blocked */
  }
  return out;
}

/** Per tab first (two tabs = two players), localStorage as the fallback. */
function readParty() {
  for (const s of storages()) {
    try {
      const raw = s.getItem(PARTY_KEY);
      if (!raw) continue;
      const v = JSON.parse(raw);
      if (v && typeof v.code === 'string' && Date.now() - (v.t ?? 0) < PARTY_TTL_MS) return v;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function writeParty(rec) {
  const ss = storages();
  for (let i = 0; i < ss.length; i++) {
    try {
      if (rec) ss[i].setItem(PARTY_KEY, JSON.stringify({ ...rec, t: Date.now() }));
      else ss[i].removeItem(PARTY_KEY);
      if (rec && i === 0) {
        // sessionStorage took it: make sure a stale shared copy cannot win.
        for (let j = 1; j < ss.length; j++) ss[j].removeItem(PARTY_KEY);
        return;
      }
    } catch {
      /* try the next */
    }
  }
}

const PL = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, flags: 0, shots: 0, hp: 1, bleed: 0, revive: 0, slot: 0, kills: 0 };
const RP = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, flags: 0, shots: 0, hp: 1, bleed: 0, revive: 0, slot: 0, kills: 0 };
const GS = { run: 0, wave: 0, flags: 0, score: 0, mult: 1, kills: 0, alive: 0, spawned: 0, goal: 0, breather: 0, epoch: 0 };
const GR = { run: 0, wave: 0, flags: 0, score: 0, mult: 1, kills: 0, alive: 0, spawned: 0, goal: 0, breather: 0, epoch: 0 };

export class NetSystem {
  static id = 'net';
  static deps = ['game', 'ai', 'player', 'weapons', 'ui'];

  async init(ctx) {
    this.ctx = ctx;
    let params = null;
    try {
      params = new URLSearchParams(location.search);
    } catch {
      /* headless */
    }
    this.kind = params?.get('net') === 'local' ? 'local' : 'claude';
    /** 'unknown' | 'ok' | 'unavailable' */
    this.availability = 'unknown';
    /** 'off' | 'joining' | 'lobby' | 'error' */
    this.status = 'off';
    this.errorText = '';
    this.t = null;
    this.code = null;
    this.role = null;
    this.hostId = null;
    this.claim = 0;
    this.epoch = 0;
    this.version = 0;
    this.inGame = false;
    this.run = 0;
    this.lobby = { map: ctx.config?.map ?? 'town', diff: ctx.config?.session?.difficulty ?? 'regular', go: 0 };
    this.local = { downed: false, dead: false, bleed: 0, kills: 0, reviveT: 0, reviveTarget: null, prompt: false };
    this.names = new Map();
    this.uid = null;
    this.tune = { reviveS: REVIVE_S, bleedS: BLEED_S };
    this.stats = { sent: 0, hitsSent: 0, hitsApplied: 0, hitsRejected: 0, dmgSent: 0, dmgTaken: 0, kills: 0, promoted: 0, demoted: 0 };

    this._seenPres = new Map();
    this._buckets = new Map();
    this._hits = [];
    this._hitSeq = 0;
    this._dmg = new Map();
    this._lastSend = 0;
    this._lastFlush = 0;
    this._lastHud = 0;
    this._settleUntil = 0;
    this._notice = { text: '', until: 0 };
    this._goSeen = -1;
    this._gsRun = -1;
    this._w = new Writer(64);
    this._r = new Reader();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._from = new THREE.Vector3();
    this._impact = { point: new THREE.Vector3(), normal: new THREE.Vector3(), incident: new THREE.Vector3(), surface: 'flesh', damage: 0, actor: null, part: 'torso', exit: false, net: true };
    this._targets = [];
    this._targetPool = [];
    this._hudView = { show: false, head: '', players: [], note: '', downed: null };
    this._hudRows = [];
    for (let i = 0; i < 4; i++) this._hudRows.push({ name: '', hp: 1, down: false, host: false, me: false, tag: '' });
    this._downCard = { title: '', sub: '' };

    this.puppets = new Puppets(this);
    this.hud = new NetHud();
    this._wireEvents(ctx);
    this._installApi();

    this._probe();
    const rec = readParty();
    if (rec && !ctx.config?.deterministic) {
      this._resume = rec;
      this.lobby.map = rec.map ?? this.lobby.map;
      this.lobby.diff = rec.d ?? this.lobby.diff;
      this.join(rec.code, { resume: rec }).then((ok) => {
        if (!ok) writeParty(null);
      });
    }
  }

  /* ================================================================ probe */

  async _probe() {
    if (this.kind === 'local') {
      this.availability = LocalTransport.available() ? 'ok' : 'unavailable';
      this.version++;
      return;
    }
    const room = await claudeRoom();
    this.availability = room ? 'ok' : 'unavailable';
    this.version++;
    if (room) {
      const user = await claudeUser();
      try {
        this.uid = (await user?.id?.()) ?? null;
      } catch {
        this.uid = null;
      }
    }
  }

  /* ========================================================== party API */

  /** Create a party (random code unless given) and host it. */
  async hostParty(code = null) {
    const c = normaliseCode(code) ?? randomCode();
    return this.join(c, { host: true });
  }

  /** Join (or create) the named room. Resolves true when in the lobby. */
  async join(code, opts = {}) {
    const c = normaliseCode(code);
    if (!c) {
      this.errorText = 'THAT IS NOT A PARTY CODE';
      this.status = 'error';
      this.version++;
      return false;
    }
    if (this.t) this.leave(true);
    this.status = 'joining';
    this.errorText = '';
    this.version++;
    const t = this.kind === 'local' ? new LocalTransport() : new ClaudeRoomTransport();
    for (const topic of TOPICS) t.on(topic, (d, from) => this._onTopic(topic, d, from));
    t.onPeers((ch) => this._onPeersChange(ch));
    this.t = t;
    this.code = c;
    this.role = null;
    this.hostId = null;
    this._seenPres.clear();
    const res = opts.resume ?? null;
    this.epoch = res?.epoch | 0;
    this.claim = opts.host || res?.wasHost ? (this.epoch + 1) * 2 + 1 : 0;
    const now = performance.now();
    this._settleUntil = now + (res && !res.wasHost ? SETTLE_RESUME_MS : SETTLE_JOIN_MS);
    this._goSeen = -1;
    try {
      await t.open(c);
    } catch (err) {
      console.warn('[net] join failed', err?.code ?? err);
      this.status = 'error';
      this.errorText =
        err?.code === 'not_granted' || err?.code === 'not_permitted'
          ? 'ONLINE PLAY NEEDS THE SHARED FLOP OPS LINK (CLAUDE.AI)'
          : 'COMMAND COULD NOT REACH THAT PARTY';
      this.t = null;
      this.code = null;
      this.version++;
      return false;
    }
    if (this.t !== t) return false; // left while joining
    t.setPresence(this._basePresence()).catch(() => {});
    this.status = 'lobby';
    this._installPlayerFilter();
    if (!res) writeParty({ code: c, wasHost: !!opts.host, epoch: this.epoch, started: false, map: this.lobby.map, d: this.lobby.diff });
    console.info(`[net] joined ${c} as ${t.selfId} (${this.kind}${opts.host ? ', host' : ''}${res ? ', resumed' : ''})`);
    this.version++;
    return true;
  }

  /** Leave the party. `quiet` = no return to the menu (a re-join is coming). */
  leave(quiet = false) {
    const wasInGame = this.inGame;
    this.inGame = false;
    try {
      this.t?.close();
    } catch {
      /* ignore */
    }
    this.t = null;
    this.code = null;
    this.role = null;
    this.hostId = null;
    this.claim = 0;
    this.status = 'off';
    this._resume = null;
    this.puppets.dispose();
    this._resetLocal();
    writeParty(null);
    this.ctx.peek('ui')?.clearPrompt?.();
    this.hud.render(this._hiddenView());
    this.version++;
    if (wasInGame && !quiet) this.ctx.peek('game')?.attract?.();
  }

  /** The host's lobby choices. */
  setLobby({ map, diff } = {}) {
    if (typeof map === 'string') this.lobby.map = map;
    if (typeof diff === 'string') this.lobby.diff = diff;
    this.version++;
  }

  /** Host: everyone deploys onto the chosen map. */
  start() {
    if (this.role !== 'host' || !this.t) return false;
    this.lobby.go++;
    const msg = { m: this.lobby.map, d: this.lobby.diff, go: this.lobby.go };
    this.t.emit('start', msg).catch(() => {});
    this._sendPresence(performance.now(), true);
    this._deploy(msg);
    return true;
  }

  /** Client: join the operation the host is already running. */
  deployNow() {
    const host = this.hostId ? this.t?.peers().get(this.hostId) : null;
    const l = host?.presence?.l;
    if (!l) return false;
    this._deploy({ m: String(l.m ?? this.lobby.map), d: String(l.d ?? this.lobby.diff) });
    return true;
  }

  _deploy({ m, d }) {
    const maps = globalThis.__FLOP_MAPS__?.list ?? [];
    const map = maps.some((x) => x.id === m) ? m : this.ctx.config?.map ?? 'town';
    const diff = ['recruit', 'regular', 'hardened', 'veteran'].includes(d) ? d : 'regular';
    this.lobby.map = map;
    this.lobby.diff = diff;
    writeParty({ code: this.code, wasHost: this.role === 'host', epoch: this.epoch, started: true, map, d: diff });
    const game = this.ctx.peek('game');
    game?.setDifficulty?.(diff);
    const session = { kind: 'survival', mode: 'survival', map, mission: null, difficulty: diff };
    const ui = this.ctx.peek('ui');
    if (typeof ui?._launch === 'function') ui._launch(session);
    else this.ctx.events.emit('ui:launch', { session });
  }

  /* =================================================== game integration */

  /** True while in a party room (menu lobby or in game). */
  active() {
    return !!this.t && this.status === 'lobby';
  }

  /** What the game should run: null (single player), 'host' or 'client'. */
  sessionRole() {
    if (!this.active()) return null;
    return this.role ?? 'client';
  }

  /** GameSystem started the co-op run (either role). */
  onGameBegin(role) {
    this.inGame = true;
    this._resetLocal();
    if (role === 'host') this.run = (this.run | 0) + 1;
    // A fresh run cleared the AI (despawnAll): forget the old bot puppets.
    this.puppets.clearBots();
    this._seenPres.clear();
    this._gsRun = -1;
    this._offsetSpawn();
    this._sendPresence(performance.now(), true);
    this.version++;
  }

  /** GameSystem went back to the menu. */
  onGameEnd() {
    if (!this.inGame) return;
    this.inGame = false;
    this.puppets.clearBots();
    this.puppets.clearPlayers();
    this._resetLocal();
    this.ctx.peek('ui')?.clearPrompt?.();
    this.hud.render(this._hiddenView());
    if (this.t) this._sendPresence(performance.now(), true);
    this.version++;
  }

  /** player:death in co-op is a down. Returns true when handled. */
  handlePlayerDeath() {
    if (!this.inGame) return false;
    const L = this.local;
    if (L.downed || L.dead) return true;
    L.downed = true;
    L.bleed = this.tune.bleedS;
    L.reviveT = 0;
    this.ctx.peek('game')?.playerDown?.();
    this._notify('YOU ARE DOWN', 2);
    this._sendPresence(performance.now(), true);
    return true;
  }

  /** Living players' feet positions (host): the survival intel spreads over them. */
  huntTargets() {
    const out = this._targets;
    out.length = 0;
    const p = this.ctx.peek('player');
    let k = 0;
    const take = () => this._targetPool[k] ?? (this._targetPool[k] = new THREE.Vector3());
    if (p?.position && !this.local.downed && !this.local.dead && !p.dead) out.push(take().copy(p.position)), k++;
    for (const e of this.puppets.players.values()) {
      if (e.downed || !e.agent.alive) continue;
      out.push(take().copy(e.agent.position));
      k++;
    }
    return out;
  }

  /* ============================================================== frame */

  update(dt, ctx) {
    const t = this.t;
    if (!t) return;
    const now = performance.now();
    if (t._closed && this.status === 'lobby') {
      this.status = 'error';
      this.errorText = 'THE PARTY CONNECTION WAS LOST';
      this.version++;
      return;
    }
    this._elect(now);
    this._ingestAll();
    if (this.inGame) {
      const game = ctx.peek('game');
      if (!game?.mode || game.modeId !== 'survival') this.onGameEnd();
      else {
        this._updateLocal(dt);
        // A run restart (ai.despawnAll) disposed a teammate's soldier: rebuild it
        // from that teammate's presence, even if it has not changed since.
        for (const [id, e] of this.puppets.players) {
          if (e.agent.group.parent) continue;
          this.puppets.players.delete(id);
          this._seenPres.delete(id);
        }
        this.puppets.update(dt);
        if (this.role === 'host') this._checkAllDown(game);
      }
    }
    if (now - this._lastSend >= SEND_MS) this._sendPresence(now);
    if (now - this._lastFlush >= FLUSH_MS) this._flush(now);
    if (now - this._lastHud >= HUD_MS) {
      this._lastHud = now;
      // The menu re-renders on `version`: bump it only when the lobby changed.
      let key = `${this.hostId}|${this.lobby.map}|${this.lobby.diff}|${this.lobby.hostInGame ? 1 : 0}|${this.role}`;
      for (const [id, p] of t.peers()) key += `|${id}:${p.presence?.st ?? ''}:${this._nameOf(id)}`;
      if (key !== this._lobbyKey) {
        this._lobbyKey = key;
        this.version++;
      }
      this.hud.render(this.inGame ? this._buildView(now) : this._hiddenView());
    }
  }

  /* ----------------------------------------------------------- election */

  _elect(now) {
    const peers = this.t.peers();
    const self = this.t.selfId;
    let best = null;
    let bestC = 0;
    let minId = null;
    for (const [id, p] of peers) {
      let c;
      if (id === self) c = this.claim;
      else {
        const pr = p.presence;
        if (!pr || pr.v !== PROTO) continue;
        c = Number.isInteger(pr.c) && pr.c > 0 && pr.c < 1e9 ? pr.c : 0;
      }
      if (minId === null || id < minId) minId = id;
      if (c > bestC || (c === bestC && c > 0 && id < best)) {
        best = id;
        bestC = c;
      }
    }
    if (bestC > 0) {
      this.epoch = Math.max(this.epoch, bestC >> 1);
      if (best !== self && this.claim) {
        this.claim = 0; // someone outranks me: stand down
        this._sendPresence(now, true);
      }
      this._setHost(best, now);
      return;
    }
    if (this.hostId && this.hostId !== self) {
      // The host vanished without a successor yet.
      this._setHost(null, now);
      this._settleUntil = Math.max(this._settleUntil, now + SETTLE_MIGRATE_MS);
      if (this.inGame) this._notify('HOST LEFT — MIGRATING', 30);
    }
    if (self && now >= this._settleUntil && minId === self) {
      this.claim = (this.epoch + 1) * 2;
      this._sendPresence(now, true);
      this._setHost(self, now);
    }
  }

  _setHost(id, now) {
    if (id === this.hostId) return;
    const prevHost = this.hostId;
    this.hostId = id;
    this._seenPres.clear();
    this._hostWasIn = false;
    this.version++;
    if (id === null) return;
    const role = id === this.t.selfId ? 'host' : 'client';
    const old = this.role;
    this.role = role;
    if (old !== role) this._roleChanged(old, role);
    if (this.inGame && (prevHost !== null || old !== role)) {
      this._notify(role === 'host' ? 'YOU ARE NOW THE HOST' : `HOST · ${this._nameOf(id)}`, 3);
    }
    console.info(`[net] host → ${id}${role === 'host' ? ' (me)' : ''} epoch ${this.epoch}`);
  }

  _roleChanged(old, role) {
    if (!this.inGame) return;
    const game = this.ctx.peek('game');
    if (role === 'host') {
      const n = this.puppets.promoteBots();
      this.stats.promoted++;
      this.run = Math.max(this.run | 0, this._gsRun | 0);
      game?.netPromote?.(this._lastGame ?? null);
      console.info(`[net] promoted to host: ${n} bots handed to the AI`);
    } else if (old === 'host') {
      this.puppets.demoteBots();
      this.stats.demoted++;
      game?.netDemote?.();
      console.info('[net] demoted to client');
    }
  }

  /* ------------------------------------------------------------- ingest */

  _onPeersChange(ch) {
    if (ch.joined.length || ch.left.length) this.version++;
    for (const id of ch.left) {
      this._seenPres.delete(id);
      this._buckets.delete(id);
      this._dmg.delete(id);
      this.puppets.removePlayer(id);
    }
    if (ch.joined.length && this.role === 'host' && this.inGame) {
      // Late joiners: the full picture at once (presence carries it too).
      queueMicrotask(() => this._emitState());
    }
    this._resolveNames();
  }

  _ingestAll() {
    const peers = this.t.peers();
    const self = this.t.selfId;
    // The host first: its roster must land before anything else this frame.
    if (this.hostId && this.hostId !== self) {
      const h = peers.get(this.hostId);
      if (h && this._seenPres.get(this.hostId) !== h.presence) {
        this._seenPres.set(this.hostId, h.presence);
        this._ingestHost(h.presence);
        this._ingestPlayer(this.hostId, h);
      }
    }
    for (const [id, p] of peers) {
      if (id === self || id === this.hostId) continue;
      if (this._seenPres.get(id) === p.presence) continue;
      this._seenPres.set(id, p.presence);
      this._ingestPlayer(id, p);
    }
  }

  _ingestHost(pr) {
    if (!pr || pr.v !== PROTO || this.role !== 'client') return;
    const l = pr.l;
    if (l && typeof l === 'object') {
      if (typeof l.m === 'string') this.lobby.map = l.m.slice(0, 32);
      if (typeof l.d === 'string') this.lobby.diff = l.d.slice(0, 16);
      const go = Number.isInteger(l.go) ? l.go : 0;
      if (this._goSeen < 0) this._goSeen = go;
      else if (go > this._goSeen) {
        this._goSeen = go;
        if (!this.inGame) this._deploy({ m: this.lobby.map, d: this.lobby.diff });
      }
      this.lobby.hostInGame = l.ig === 1;
    }
    // The host went back to base mid-operation: so does the squad.
    const hostIn = pr.st === 'game';
    if (this.inGame && this._hostWasIn && !hostIn) {
      this._hostWasIn = false;
      this.ctx.peek('game')?.attract?.();
      return;
    }
    this._hostWasIn = hostIn;
    if (!this.inGame) return;
    if (typeof pr.r === 'string') this.puppets.applyRoster(pr.r);
    if (typeof pr.g === 'string') this._applyGame(pr.g);
    if (typeof pr.b === 'string') this.puppets.applyBots(pr.b);
  }

  _ingestPlayer(id, p) {
    const pr = p.presence;
    if (!this.inGame) return;
    if (!pr || pr.v !== PROTO || pr.st !== 'game' || typeof pr.p !== 'string' || pr.p.length !== PLAYER_LEN) {
      this.puppets.removePlayer(id);
      return;
    }
    if (!readPlayer(pr.p, RP, this._r)) return;
    const weapon = typeof pr.w === 'string' ? pr.w.replace(/[^a-z0-9_]/gi, '').slice(0, 20) : null;
    this.puppets.updatePlayer(id, RP, this._nameOf(id), weapon);
  }

  _applyGame(str) {
    if (!readGame(str, GR, this._r)) return;
    this._lastGame = Object.assign(this._lastGame ?? {}, GR);
    const game = this.ctx.peek('game');
    const m = game?.mode;
    if (!m || !m.remote) return;
    if (GR.run !== this._gsRun) {
      const first = this._gsRun < 0;
      this._gsRun = GR.run;
      if (!first && game.state === 'over') {
        // The host redeployed: a fresh run for this page too.
        game.startSession(game.session);
        return;
      }
    }
    m.applyNet?.(GR);
    if (GR.flags & GF.OVER && game.state === 'play') game.netOver?.({ score: GR.score, wave: GR.wave, kills: GR.kills });
  }

  /* ------------------------------------------------------------- topics */

  _onTopic(topic, d, from) {
    if (!d || typeof d !== 'object' || typeof from !== 'string') return;
    const fromHost = from === this.hostId;
    switch (topic) {
      case 'hit':
        if (this.role === 'host' && this.inGame) this._onHit(d, from);
        break;
      case 'dmg':
        if (fromHost && this.inGame && d.t === this.t?.selfId) this._onDmg(d);
        break;
      case 'kill':
        if (fromHost && this.inGame && this.role === 'client') this._onKill(d);
        break;
      case 'wave':
        if (fromHost && this.inGame) {
          const n = num(d.n, 0, 9999, 0) | 0;
          this.ctx.peek('game')?.mode?.netWave?.(n, num(d.c, 0, 999, 0) | 0);
        }
        break;
      case 'clear':
        if (fromHost && this.inGame) {
          const n = num(d.n, 0, 9999, 0) | 0;
          this.ctx.peek('game')?.mode?.netClear?.(n, num(d.b, 0, 1e7, 0));
        }
        break;
      case 'over':
        if (fromHost && this.inGame && this.role === 'client') {
          this.ctx.peek('game')?.netOver?.({
            score: num(d.score, 0, 1e9, 0) | 0,
            wave: num(d.wave, 0, 9999, 0) | 0,
            kills: num(d.kills, 0, 1e6, 0) | 0,
            durationS: num(d.durationS, 0, 1e6, 0) | 0,
          });
        }
        break;
      case 'nade':
        if (this.inGame) this._onNade(d, from);
        break;
      case 'boom':
        if (fromHost && this.inGame && this.role === 'client') this._onBoom(d);
        break;
      case 'revive':
        if (this.inGame && d.t === this.t?.selfId) this._onRevive(from);
        break;
      case 'start':
        if (fromHost && !this.inGame) {
          const go = num(d.go, 0, 1e6, 0) | 0;
          if (go > this._goSeen) this._goSeen = go;
          this._deploy({ m: String(d.m ?? ''), d: String(d.d ?? '') });
        }
        break;
      case 'state':
        if (fromHost && this.inGame && this.role === 'client') {
          if (typeof d.r === 'string') this.puppets.applyRoster(d.r);
          if (typeof d.g === 'string') this._applyGame(d.g);
        }
        break;
      default:
        break;
    }
  }

  /** Host: a client's batched hits on host bots. */
  _onHit(d, from) {
    const list = d.h;
    if (!Array.isArray(list) || list.length > 40) return;
    const seq = num(d.s, 0, 1e9, -1);
    const b = this._bucket(from);
    if (seq <= b.seq) return; // replay / reorder
    b.seq = seq;
    const shooter = this.puppets.players.get(from)?.agent;
    if (!shooter || !shooter.alive) {
      this.stats.hitsRejected += list.length;
      return;
    }
    const now = performance.now() / 1000;
    b.tokens = Math.min(HIT_BURST, b.tokens + (now - b.t) * HIT_RATE);
    b.t = now;
    for (const h of list) {
      if (!Array.isArray(h) || h.length < 2) continue;
      const id = num(h[0], 0, 4095, -1);
      const dmg = num(h[1], 0, MAX_HIT_DMG, 0);
      const head = h[2] === 1;
      const a = this.puppets.byNetId.get(id);
      if (!a || !a.alive || a.__net || !(dmg > 0)) {
        this.stats.hitsRejected++;
        continue;
      }
      if (b.tokens < 1) {
        this.stats.hitsRejected++;
        continue;
      }
      if (a.position.distanceTo(shooter.position) > MAX_HIT_RANGE) {
        this.stats.hitsRejected++;
        continue;
      }
      b.tokens -= 1;
      const part = head ? 'head' : 'torso';
      const dir = this._v.copy(a.position).sub(shooter.position);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const point = this._v2.set(a.position.x, a.position.y + (head ? 1.62 : 1.2) * (a.scale ?? 1), a.position.z);
      const e = this._impact;
      e.point.copy(point);
      e.normal.copy(dir).multiplyScalar(-1);
      e.incident.copy(dir);
      e.damage = dmg;
      e.actor = a;
      e.part = part;
      this.ctx.events.emit('bullet:impact', e);
      a.applyDamage(dmg, part, point, dir, null, shooter);
      this.stats.hitsApplied++;
    }
  }

  _bucket(id) {
    let b = this._buckets.get(id);
    if (!b) this._buckets.set(id, (b = { tokens: HIT_BURST, t: performance.now() / 1000, seq: -1 }));
    return b;
  }

  _onDmg(d) {
    const L = this.local;
    if (L.downed || L.dead) return;
    const p = this.ctx.peek('player');
    if (!p || p.dead) return;
    const a = num(d.a, 0, 400, 0);
    if (!(a > 0)) return;
    const from = vec3(d.f, this._from) ? this._from : null;
    this.stats.dmgTaken += a;
    p.applyDamage(a, from, { type: 'bullet' });
  }

  _onKill(d) {
    const id = num(d.i, 0, 4095, -1);
    if (id < 0) return;
    const self = this.t?.selfId;
    const k = typeof d.k === 'string' ? d.k : '';
    const ai = this.ctx.peek('ai');
    const killer = k && k === self ? ai?.player ?? null : this.puppets.players.get(k)?.agent ?? null;
    const dir = vec3(d.d, this._v, 2) ? this._v : null;
    const a = this.puppets.killBot(id, killer, d.h === 1, dir);
    if (a && k === self) {
      this.local.kills++;
      this.stats.kills++;
      this.ctx.peek('ui')?.hitmarker?.(d.h === 1 ? 'headkill' : 'kill');
    }
  }

  _onNade(d, from) {
    const owner = this.puppets.players.get(from)?.agent;
    if (!owner) return;
    const kind = d.k === 'flash' ? 'flash' : d.k === 'frag' ? 'frag' : null;
    if (!kind) return;
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    if (!vec3(d.p, pos) || !vec3(d.v, vel, 60)) return;
    if (pos.distanceTo(owner.position) > 6) return; // thrown from where he stands
    const fuse = num(d.f, 0.05, 6, 2);
    const eq = this.ctx.peek('weapons')?.equipment;
    if (typeof eq?._spawn !== 'function') return;
    eq._spawn(kind, pos, vel, fuse, owner);
    if (this.role === 'host') {
      // Let the host's bots see it coming and scatter.
      this.ctx.events.emit('grenade:throw', { kind, owner, position: pos, velocity: vel, fuse, net: true });
    }
  }

  _onBoom(d) {
    const pos = new THREE.Vector3();
    if (!vec3(d.p, pos)) return;
    this.ctx.events.emit('explosion', {
      position: pos,
      radius: num(d.r, 0.5, 15, 6),
      damage: num(d.d, 0, 400, 100),
      kind: d.k === 'rocket' ? 'rocket' : 'frag',
      owner: null,
      netBoom: true,
    });
  }

  _onRevive(from) {
    const L = this.local;
    if (!L.downed || L.dead) return;
    const reviver = this.puppets.players.get(from);
    const p = this.ctx.peek('player');
    if (!reviver || !p?.position) return;
    if (reviver.agent.position.distanceTo(p.position) > REVIVE_R + 2.5) return;
    this._revive(reviver.name);
  }

  /* ------------------------------------------------------------- events */

  _wireEvents(ctx) {
    this._off = [];
    const on = (t, fn) => this._off.push(ctx.events.on(t, fn));
    on('game:wave', (e) => {
      if (!this.inGame) return;
      if (this.local.dead) this._redeploy();
      if (this.role === 'host') this._emit('wave', { n: e?.wave | 0, c: e?.count | 0, run: this.run });
    });
    on('game:waveClear', (e) => {
      if (this.inGame && this.role === 'host') this._emit('clear', { n: e?.wave | 0, b: Math.round(e?.bonus ?? 0), run: this.run });
    });
    on('game:over', (e) => {
      if (!this.inGame || this.role !== 'host' || e?.mode !== 'survival') return;
      this._sendPresence(performance.now(), true);
      this._emit('over', { score: e.score | 0, wave: e.wave | 0, kills: e.kills | 0, durationS: e.durationS | 0 });
    });
    on('actor:death', (e) => {
      const a = e?.actor;
      if (!this.inGame || this.role !== 'host' || !a?.netId || a.__net) return;
      const self = this.t?.selfId;
      const killer = e.killer;
      const kp = e.killerIsPlayer ? self : typeof killer?.netPeer === 'string' ? killer.netPeer : '';
      const imp = e.impulse;
      let d = null;
      if (imp && Number.isFinite(imp.x)) {
        const l = Math.hypot(imp.x, imp.y, imp.z) || 1;
        d = [cm(imp.x / l), cm(imp.y / l), cm(imp.z / l)];
      }
      this._emit('kill', { i: a.netId, h: e.headshot ? 1 : 0, k: kp, d });
      if (kp === self && self) {
        this.local.kills++;
        this.stats.kills++;
      }
    });
    on('grenade:throw', (e) => {
      if (!this.inGame || e?.net) return;
      const p = this.ctx.peek('player');
      const o = e?.owner;
      if (!o || !(o === p || o.isPlayer === true)) return;
      const eq = this.ctx.peek('weapons')?.equipment;
      const rec = eq?.live?.[eq.live.length - 1];
      const fuse = rec?.fuse ?? 2.5;
      const P = e.position, V = e.velocity;
      if (!P || !V) return;
      this._emit('nade', { k: e.kind === 'flash' ? 'flash' : 'frag', p: [cm(P.x), cm(P.y), cm(P.z)], v: [cm(V.x), cm(V.y), cm(V.z)], f: cm(fuse) });
    });
    on('explosion', (e) => {
      if (!this.inGame || this.role !== 'host' || !e?.position || e.netBoom) return;
      const o = e.owner ?? e.source ?? null;
      if (o && o.team !== 'hostile') return; // players' own grenades travel as `nade`
      const P = e.position;
      this._emit('boom', { p: [cm(P.x), cm(P.y), cm(P.z)], r: cm(e.radius ?? 6), d: Math.round(e.damage ?? 100), k: e.kind === 'rocket' ? 'rocket' : 'frag' });
    });
  }

  _emit(topic, data) {
    if (!this.t) return;
    this.stats.sent++;
    this.t.emit(topic, data).catch((err) => {
      if (!this._emitWarned) {
        this._emitWarned = true;
        console.warn(`[net] emit ${topic} rejected`, err?.code ?? err, err?.message ?? '');
      }
    });
  }

  _emitState() {
    if (this.role !== 'host' || !this.inGame) return;
    const g = this._gameString();
    if (g) this._emit('state', { g, r: this.puppets.rosterStr });
  }

  /* --------------------------------------------------- outgoing batches */

  /** Client: a hit on a host bot, sent in the next batch. */
  queueHit(id, dmg, head) {
    if (this.role !== 'client' || !this.inGame) return;
    const h = this._hits;
    // Merge with a queued hit on the same bot (pellets, bursts).
    for (let i = 0; i < h.length; i++) {
      if (h[i][0] === id) {
        h[i][1] = Math.min(MAX_HIT_DMG, h[i][1] + dmg);
        if (head) h[i][2] = 1;
        return;
      }
    }
    if (h.length < 32) h.push([id, dmg, head ? 1 : 0]);
  }

  /** Host: damage for a remote player, sent in the next batch. */
  queueDamage(peer, amount, from) {
    if (!peer) return;
    let q = this._dmg.get(peer);
    if (!q) this._dmg.set(peer, (q = { a: 0, x: 0, y: 0, z: 0 }));
    q.a += amount;
    q.x = from.x;
    q.y = from.y + 1.5;
    q.z = from.z;
  }

  _flush(now) {
    this._lastFlush = now;
    if (this._hits.length) {
      const h = this._hits;
      for (const e of h) e[1] = Math.round(e[1] * 10) / 10;
      this._emit('hit', { s: ++this._hitSeq, h });
      this.stats.hitsSent += h.length;
      this._hits = [];
    }
    if (this._dmg.size) {
      for (const [peer, q] of this._dmg) {
        if (q.a <= 0) continue;
        this._emit('dmg', { t: peer, a: Math.round(q.a * 10) / 10, f: [cm(q.x), cm(q.y), cm(q.z)] });
        this.stats.dmgSent += q.a;
      }
      this._dmg.clear();
    }
  }

  /* ----------------------------------------------------------- presence */

  _basePresence() {
    return { v: PROTO, st: this.inGame ? 'game' : 'lobby', c: this.claim, uid: this.uid ?? null };
  }

  _sendPresence(now, force = false) {
    if (!this.t || (!force && now - this._lastSend < SEND_MS)) return;
    this._lastSend = now;
    const pres = this._basePresence();
    if (this.role === 'host') {
      pres.l = { m: this.lobby.map, d: this.lobby.diff, go: this.lobby.go, ig: this.inGame ? 1 : 0 };
    } else pres.l = null;
    if (this.inGame) {
      pres.p = this._playerString();
      pres.w = this.ctx.peek('weapons')?.activeId ?? null;
      pres.rt = this.local.reviveTarget;
      if (this.role === 'host') {
        pres.b = this.puppets.encodeBots();
        pres.r = this.puppets.rosterStr;
        pres.g = this._gameString();
      } else {
        pres.b = null;
        pres.r = null;
        pres.g = null;
      }
    } else {
      pres.p = null;
      pres.w = null;
      pres.rt = null;
      pres.b = null;
      pres.r = null;
      pres.g = null;
    }
    this.t.setPresence(pres).catch((err) => {
      if (!this._presWarned) {
        this._presWarned = true;
        console.warn('[net] presence rejected', err?.code ?? err, err?.message ?? '');
      }
    });
  }

  _playerString() {
    const p = this.ctx.peek('player');
    const L = this.local;
    if (!p?.position) return null;
    const f = p.forward;
    PL.x = p.position.x;
    PL.y = p.position.y;
    PL.z = p.position.z;
    if (f && Number.isFinite(f.x)) {
      PL.yaw = Math.atan2(-f.x, -f.z);
      PL.pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    } else {
      PL.yaw = p.yaw ?? 0;
      PL.pitch = p.pitch ?? 0;
    }
    PL.speed = Math.min(6.3, p.horizontalSpeed ?? 0);
    const stance = p.stance;
    PL.flags =
      (stance === 'crouch' ? PF.CROUCH : 0) | (stance === 'prone' ? PF.PRONE : 0) | (p.sprinting ? PF.SPRINT : 0) |
      ((p.adsProgress ?? 0) > 0.5 ? PF.ADS : 0) | (L.downed ? PF.DOWN : 0) | (L.dead ? PF.DEAD : 0);
    PL.shots = (this.ctx.peek('weapons')?.stats?.fired ?? 0) % 64;
    PL.hp = L.downed || L.dead ? 0 : Math.max(0, Math.min(1, p.healthFraction ?? 1));
    PL.bleed = L.downed ? Math.ceil(L.bleed) : 0;
    PL.revive = L.reviveTarget ? Math.min(1, L.reviveT / this.tune.reviveS) : 0;
    PL.slot = this._slotOf(this.t.selfId);
    PL.kills = L.kills;
    const w = this._w.reset();
    writePlayer(w, PL);
    return w.toString();
  }

  _gameString() {
    const game = this.ctx.peek('game');
    const m = game?.mode;
    if (!m || game.modeId !== 'survival') return null;
    GS.run = this.run;
    GS.wave = m.wave | 0;
    GS.flags = (m.waveActive ? GF.ACTIVE : 0) | (m.breather > 0 ? GF.BREATHER : 0) | (game.state === 'over' ? GF.OVER : 0) | (game.state === 'play' ? GF.PLAY : 0);
    GS.score = m.scoring?.score ?? 0;
    GS.mult = m.scoring?.mult ?? 1;
    GS.kills = m.scoring?.kills ?? 0;
    GS.alive = m.aliveInWave | 0;
    GS.spawned = m.waveSpawned | 0;
    GS.goal = m.waveGoal | 0;
    GS.breather = Math.max(0, Math.min(15.75, m.breather ?? 0));
    GS.epoch = this.epoch;
    const w = this._w.reset();
    writeGame(w, GS);
    return w.toString();
  }

  /* ------------------------------------------------------- local player */

  _resetLocal() {
    const L = this.local;
    L.downed = false;
    L.dead = false;
    L.bleed = 0;
    L.reviveT = 0;
    L.reviveTarget = null;
    if (L.prompt) {
      L.prompt = false;
      this.ctx.peek('ui')?.clearPrompt?.();
    }
  }

  _updateLocal(dt) {
    const L = this.local;
    const ui = this.ctx.peek('ui');
    if (L.downed) {
      L.bleed -= dt;
      if (L.bleed <= 0) {
        L.downed = false;
        L.dead = true;
        L.bleed = 0;
        this._notify('BLED OUT', 2);
        this._sendPresence(performance.now(), true);
      }
      return;
    }
    if (L.dead) return;
    const p = this.ctx.peek('player');
    if (!p?.position || p.dead) return;
    // Nearest downed teammate within reach.
    let best = null;
    let bestD = REVIVE_R;
    for (const e of this.puppets.players.values()) {
      if (!e.downed || e.flags & PF.DEAD) continue;
      const d = e.agent.position.distanceTo(p.position);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) {
      L.reviveT = 0;
      L.reviveTarget = null;
      if (L.prompt) {
        L.prompt = false;
        ui?.clearPrompt?.();
      }
      return;
    }
    const holding = !!(this.ctx.input?.action?.('use') || this._forceRevive);
    L.reviveTarget = best.peer;
    L.reviveT = holding ? L.reviveT + dt : 0;
    const prog = Math.min(1, L.reviveT / this.tune.reviveS);
    ui?.setPrompt?.({ key: 'F', text: 'HOLD TO REVIVE', sub: best.name, progress: prog });
    L.prompt = true;
    if (L.reviveT >= this.tune.reviveS) {
      L.reviveT = 0;
      this._emit('revive', { t: best.peer });
      this._notify(`${best.name} IS BACK UP`, 2);
    }
  }

  _revive(by) {
    const L = this.local;
    L.downed = false;
    L.dead = false;
    L.bleed = 0;
    const p = this.ctx.peek('player');
    if (p?.health) {
      p.health.reset?.(true);
      p.health.value = p.health.max * 0.5;
      p.health.dead = false;
    }
    const game = this.ctx.peek('game');
    game?._releaseInput?.();
    p?.setControlEnabled?.(true);
    this._notify(by ? `REVIVED BY ${by}` : 'REVIVED', 2);
    this._sendPresence(performance.now(), true);
  }

  /** Bled out: back at the next wave, at the objective. */
  _redeploy() {
    const L = this.local;
    L.dead = false;
    L.downed = false;
    const game = this.ctx.peek('game');
    const p = this.ctx.peek('player');
    p?.respawn?.(game?._plazaSpawnIndex?.() ?? 0);
    if (p?.health) {
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    game?._releaseInput?.();
    p?.setControlEnabled?.(true);
    game?.refill?.();
    this._offsetSpawn();
    this._notify('REDEPLOYED', 2);
  }

  /** Spread the squad around the spawn point (everyone spawns on one spot). */
  _offsetSpawn() {
    const p = this.ctx.peek('player');
    const phys = this.ctx.peek('physics');
    if (!p?.position || typeof p.teleport !== 'function') return;
    const slot = this._slotOf(this.t?.selfId);
    if (slot <= 0) return;
    const ang = slot * 2.1;
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const from = this._v.set(p.position.x, p.position.y + 1, p.position.z);
    let r = SPAWN_RING;
    const h = phys?.raycast?.(from.x, from.y, from.z, dx, 0, dz, r + 0.5, phys.MASK?.WORLD);
    if (h?.hit) r = Math.max(0, h.distance - 0.5);
    if (r < 0.3) return;
    const x = p.position.x + dx * r, z = p.position.z + dz * r;
    const gy = phys?.groundHeight?.(x, z, p.position.y + 2);
    const feet = Number.isFinite(gy) && Math.abs(gy - p.position.y) < 1.5 ? gy + 0.03 : p.position.y;
    p.teleport({ x, y: feet + 1.66, z }, p.yaw);
  }

  _checkAllDown(game) {
    if (game.state !== 'play') return;
    let n = 1;
    let down = this.local.downed || this.local.dead ? 1 : 0;
    for (const [id, e] of this.puppets.players) {
      const pr = this.t.peers().get(id)?.presence;
      if (!pr || pr.st !== 'game') continue;
      n++;
      if (e.downed) down++;
    }
    if (down >= n) {
      console.info(`[net] all ${n} operators down: run over`);
      game._gameOver?.();
    }
  }

  /* --------------------------------------------------------------- names */

  _slotOf(id) {
    if (!this.t || !id) return 0;
    const ids = [];
    for (const [pid, p] of this.t.peers()) if (pid === this.t.selfId || p.presence?.v === PROTO) ids.push(pid);
    ids.sort();
    return Math.max(0, ids.indexOf(id));
  }

  _keyOf(id) {
    const p = this.t?.peers().get(id);
    if (!p) return null;
    if (p.isMe) return this.uid;
    return p.by ?? (typeof p.presence?.uid === 'string' ? p.presence.uid.slice(0, 64) : null);
  }

  _nameOf(id) {
    const key = this._keyOf(id);
    const n = key ? this.names.get(key) : null;
    return n || `OPERATOR ${this._slotOf(id) + 1}`;
  }

  async _resolveNames() {
    if (this.kind !== 'claude' || !this.t) return;
    const user = await claudeUser();
    if (!user?.profiles) return;
    const want = [];
    for (const id of this.t.peers().keys()) {
      const k = this._keyOf(id);
      if (k && !this.names.has(k)) {
        this.names.set(k, '');
        want.push(k);
      }
    }
    if (!want.length) return;
    try {
      const ps = await user.profiles(want);
      for (const p of ps ?? []) {
        const name = String(p?.name ?? '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 20);
        if (p?.id && name) this.names.set(p.id, name.toUpperCase());
      }
      this.version++;
    } catch {
      /* names stay "OPERATOR n" */
    }
  }

  /* ----------------------------------------------------------------- hud */

  _notify(text, seconds) {
    this._notice.text = text;
    this._notice.until = performance.now() + seconds * 1000;
  }

  _hiddenView() {
    const v = this._hudView;
    v.show = false;
    v.note = '';
    v.downed = null;
    return v;
  }

  _buildView(now) {
    const v = this._hudView;
    v.show = true;
    v.head = `PARTY ${String(this.code ?? '').toUpperCase()} · ${this.role === 'host' ? 'HOST' : this.hostId ? 'SQUAD' : 'NO HOST'}`;
    v.players.length = 0;
    const self = this.t?.selfId;
    const p = this.ctx.peek('player');
    let i = 0;
    const row = (name, hp, down, host, me, tag) => {
      const r = this._hudRows[i++];
      r.name = name;
      r.hp = hp;
      r.down = down;
      r.host = host;
      r.me = me;
      r.tag = tag;
      v.players.push(r);
    };
    const L = this.local;
    row('YOU', L.downed || L.dead ? 0 : p?.healthFraction ?? 1, L.downed || L.dead, this.role === 'host', true,
      L.dead ? 'OUT' : L.downed ? `DOWN ${Math.ceil(L.bleed)}S` : this.role === 'host' ? 'HOST' : '');
    for (const e of this.puppets.players.values()) {
      if (i >= this._hudRows.length) break;
      const dead = (e.flags & PF.DEAD) !== 0;
      row(e.name, e.downed ? 0 : e.hp / 100, e.downed, e.peer === this.hostId, false,
        dead ? 'OUT' : e.downed ? `DOWN ${e.bleed}S` : e.peer === this.hostId ? 'HOST' : '');
    }
    v.note = now < this._notice.until ? this._notice.text : !this.hostId ? 'HOST LEFT — MIGRATING' : '';
    if (L.downed || L.dead) {
      const c = this._downCard;
      if (L.dead) {
        c.title = 'BLED OUT';
        c.sub = 'REDEPLOYING NEXT WAVE · COMMAND HAS NOTED IT';
      } else {
        let reviver = null;
        for (const [id, peer] of this.t.peers()) {
          if (id !== self && peer.presence?.rt === self) reviver = this.puppets.players.get(id)?.name ?? null;
        }
        c.title = 'YOU ARE DOWN';
        c.sub = reviver ? `${reviver} IS REVIVING YOU` : `HOLD ON · A TEAMMATE CAN REVIVE YOU · BLEED OUT ${Math.ceil(L.bleed)}S`;
      }
      v.downed = c;
    } else v.downed = null;
    return v;
  }

  /* ---------------------------------------------------- the menu's view */

  /** What the main menu's CO-OP pages render (menu time only). */
  menuState() {
    const players = [];
    if (this.t) {
      const self = this.t.selfId;
      for (const [id, p] of this.t.peers()) {
        if (id !== self && p.presence?.v !== PROTO) continue;
        players.push({ id, name: id === self ? `${this._nameOf(id)} (YOU)` : this._nameOf(id), me: id === self, host: id === this.hostId, slot: this._slotOf(id), inGame: p.presence?.st === 'game' });
      }
      players.sort((a, b) => a.slot - b.slot);
    }
    return {
      kind: this.kind,
      availability: this.availability,
      status: this.status,
      error: this.errorText,
      code: this.code,
      role: this.role,
      host: this.hostId,
      players,
      lobby: { ...this.lobby },
      inGame: this.inGame,
    };
  }

  /* --------------------------------------------------------------- misc */

  /** Friendly fire off for explosions: a teammate's grenade copy never hurts this player. */
  _installPlayerFilter() {
    const p = this.ctx.peek('player');
    if (!p || p.__netFilter || typeof p._onExplosion !== 'function') return;
    const orig = p._onExplosion;
    const net = this;
    p.__netFilter = true;
    p._onExplosion = function (e) {
      const o = e?.owner;
      if (net.active() && o && o !== p && o.isPlayer !== true && o.team === 'esf') return orig.call(this, { ...e, damage: 0 });
      return orig.call(this, e);
    };
  }

  _installApi() {
    const self = this;
    try {
      window.__NET__ = {
        get state() {
          return self.menuState();
        },
        get system() {
          return self;
        },
        host: (code) => self.hostParty(code),
        join: (code) => self.join(code),
        leave: () => self.leave(),
        start: () => self.start(),
        deploy: () => self.deployNow(),
        setLobby: (o) => self.setLobby(o),
        stats: () => ({ ...self.stats, role: self.role, host: self.hostId, self: self.t?.selfId ?? null, inGame: self.inGame, bots: self.puppets.bots.size, players: self.puppets.players.size, local: { ...self.local } }),
      };
    } catch {
      /* no window */
    }
  }

  dispose() {
    for (const off of this._off ?? []) off();
    this._off = [];
    try {
      this.t?.close();
    } catch {
      /* ignore */
    }
    this.puppets.dispose();
    this.hud.dispose();
    try {
      delete window.__NET__;
    } catch {
      /* ignore */
    }
  }
}
