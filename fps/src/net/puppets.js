import * as THREE from 'three';
import { Reader, Writer, readBot, writeBot, writeRoster, readRoster, BF, PF, MAX_BOTS, BOT_LEN } from './codec.js';

/**
 * NET — puppets: other people's things, drawn with the AI's own soldiers.
 *
 * A puppet IS an AI Agent (`ai.spawn(...)`: the same skinned soldier, kit,
 * third-person weapon, animator, hit capsules, IFF tag and ragdoll death),
 * with two per-instance overrides installed by `makePuppet`:
 *
 *   agent.update(dt)          no brain: pose from the network (interpolated
 *                             ~100 ms behind the newest sample), then the
 *                             agent's own `_drive()` animates it
 *   agent.applyDamage(...)    no local health: a bot puppet (client) reports
 *                             the hit to the host; a remote player's puppet
 *                             (host) forwards bot rounds to that player
 *
 * Deleting the two overrides turns a puppet back into a normal Agent: that is
 * host migration (`promoteBots`). Nothing else in src/ai is touched.
 *
 * KINDS
 *   bot     (clients) one per host bot, keyed by its netId
 *   player  (everyone) one ESF soldier per remote teammate, keyed by peer id;
 *           on the HOST it is also what hostile bots see, chase and shoot
 *           (it sits in ai.agents on team 'esf', so perception, _traceActors
 *           and grenades all reach it exactly like an ESF bot)
 *
 * Interpolation buffers are preallocated typed arrays; the per-frame path
 * allocates nothing.
 */

const RING = 6;
const INTERP_DELAY = 0.1; // seconds behind the newest sample
const TAU = Math.PI * 2;

function wrap(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}

/** A small ring of timestamped poses: x y z yaw ayaw pitch. */
export class Interp {
  constructor() {
    this.t = new Float64Array(RING);
    this.v = new Float32Array(RING * 6);
    this.n = 0;
    this.head = -1;
  }
  push(t, x, y, z, yaw, ayaw, pitch) {
    // Drop a sample older than the newest (out-of-order delivery).
    if (this.n && t < this.t[this.head]) return;
    this.head = (this.head + 1) % RING;
    const o = this.head * 6;
    this.t[this.head] = t;
    this.v[o] = x;
    this.v[o + 1] = y;
    this.v[o + 2] = z;
    this.v[o + 3] = yaw;
    this.v[o + 4] = ayaw;
    this.v[o + 5] = pitch;
    if (this.n < RING) this.n++;
  }
  /** Teleport: forget the history (spawn, revive, big jumps). */
  snap(t, x, y, z, yaw, ayaw, pitch) {
    this.n = 0;
    this.head = -1;
    this.push(t, x, y, z, yaw, ayaw, pitch);
  }
  sample(now, out) {
    if (!this.n) return false;
    const rt = now - INTERP_DELAY;
    let newer = this.head;
    let older = -1;
    for (let k = 1; k < this.n; k++) {
      const i = (this.head - k + RING) % RING;
      if (this.t[i] <= rt) {
        older = i;
        break;
      }
      newer = i;
    }
    const v = this.v;
    if (older < 0 || newer === older) {
      // Before the oldest sample, or past the newest: hold the nearest.
      const i = older < 0 ? newer : this.head;
      const o = i * 6;
      out.x = v[o];
      out.y = v[o + 1];
      out.z = v[o + 2];
      out.yaw = v[o + 3];
      out.ayaw = v[o + 4];
      out.pitch = v[o + 5];
      return true;
    }
    const t0 = this.t[older], t1 = this.t[newer];
    const k = t1 > t0 ? Math.min(1, Math.max(0, (rt - t0) / (t1 - t0))) : 1;
    const a = older * 6, b = newer * 6;
    out.x = v[a] + (v[b] - v[a]) * k;
    out.y = v[a + 1] + (v[b + 1] - v[a + 1]) * k;
    out.z = v[a + 2] + (v[b + 2] - v[a + 2]) * k;
    out.yaw = v[a + 3] + wrap(v[b + 3] - v[a + 3]) * k;
    out.ayaw = v[a + 4] + wrap(v[b + 4] - v[a + 4]) * k;
    out.pitch = v[a + 5] + (v[b + 5] - v[a + 5]) * k;
    return true;
  }
}

/* ---- the two per-instance overrides (module functions: no closure per puppet) */

function puppetUpdate(dt) {
  const e = this.__net;
  if (e) e.owner.drive(this, e, dt);
}

function puppetDamage(amount, part, point, dir, blast, source) {
  const e = this.__net;
  if (e) e.owner.onPuppetDamage(this, e, amount, part, point, dir, blast, source);
}

const S = { x: 0, y: 0, z: 0, yaw: 0, ayaw: 0, pitch: 0 };
const BOT = { id: 0, x: 0, y: 0, z: 0, yaw: 0, ayaw: 0, pitch: 0, speed: 0, flags: 0, shots: 0, hits: 0, hp: 100 };

export class Puppets {
  constructor(net) {
    this.net = net;
    this.ctx = net.ctx;
    /** netId → entry (client bot puppets) */
    this.bots = new Map();
    /** peer id → entry (remote players) */
    this.players = new Map();
    /** host: netId → live Agent, rebuilt every encode */
    this.byNetId = new Map();
    this._nextNetId = 1;
    this._w = new Writer(MAX_BOTS * BOT_LEN + 8);
    this._r = new Reader();
    this._rosterKey = '';
    this.rosterStr = '';
    this._rosterList = [];
    this._roster = new Map();
    this._snapSeq = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._fe = { weapon: 'ai_rifle', ai: true, actor: null, origin: new THREE.Vector3(), dir: new THREE.Vector3(), intensity: 1, light: 0.02, flashScale: 0.8, seed: 0, net: true };
    this._se = { position: new THREE.Vector3(), velocity: new THREE.Vector3() };
    this._te = { from: new THREE.Vector3(), to: new THREE.Vector3(), speed: 880 };
    this._bulletOpts = { origin: null, dir: null, damage: 0, penetration: 0, maxDist: 220, mask: 0 };
  }

  get ai() {
    return this.ctx.peek('ai');
  }

  now() {
    return performance.now() / 1000;
  }

  /* ================================================================ host */

  /** Assign network ids to every live non-puppet agent (host). */
  _netId(a) {
    if (!a.netId) {
      a.netId = this._nextNetId;
      this._nextNetId = (this._nextNetId % 4000) + 1;
    }
    return a.netId;
  }

  /** Host: pack every live bot into a string (≤ MAX_BOTS). Also refreshes the roster. */
  encodeBots() {
    const ai = this.ai;
    const w = this._w.reset();
    this.byNetId.clear();
    if (!ai?.agents) return '';
    let key = '';
    let n = 0;
    const list = this._rosterList;
    list.length = 0;
    for (let i = 0; i < ai.agents.length && n < MAX_BOTS; i++) {
      const a = ai.agents[i];
      if (!a.alive || a.__net?.kind === 'player' || a.team === 'civ') continue;
      const id = this._netId(a);
      this.byNetId.set(id, a);
      if (a.lastHurtT !== a.__lastHurt) {
        a.__lastHurt = a.lastHurtT;
        a.__hits = ((a.__hits ?? 0) + 1) % 64;
      }
      const p = a.position;
      const eyeY = p.y + (a.eyeHeight ?? 1.6);
      const dx = a.aimTarget.x - p.x, dy = a.aimTarget.y - eyeY, dz = a.aimTarget.z - p.z;
      const h = Math.hypot(dx, dz);
      BOT.id = id;
      BOT.x = p.x;
      BOT.y = p.y;
      BOT.z = p.z;
      BOT.yaw = a.yaw;
      BOT.ayaw = h > 1e-3 ? Math.atan2(dx, dz) : a.yaw;
      BOT.pitch = Math.atan2(dy, Math.max(1e-3, h));
      BOT.speed = Math.min(6.3, a.speed ?? 0);
      BOT.flags = (a.crouch ? BF.CROUCH : 0) | (a.aimWeight > 0.5 ? BF.AIM : 0) | (a.animator?.reloading ? BF.RELOAD : 0) |
        (a.team === 'esf' ? BF.ESF : 0);
      BOT.shots = (a.shotsFired ?? 0) % 64;
      BOT.hits = a.__hits ?? 0;
      BOT.hp = Math.max(0, Math.min(100, a.health));
      writeBot(w, BOT);
      key += id + ',';
      list.push(a);
      n++;
    }
    if (key !== this._rosterKey) {
      this._rosterKey = key;
      this.rosterStr = writeRoster(
        list.map((a) => ({
          id: a.netId,
          variant: a.variantName,
          role: a.role,
          weapon: a.weaponId,
          team: a.team,
          name: a.name,
        }))
      );
    }
    return w.toString();
  }

  /** Host after migration: continue numbering above every id already in use. */
  seedNetIds() {
    let max = 0;
    for (const id of this.bots.keys()) max = Math.max(max, id);
    for (const a of this.ai?.agents ?? []) if (a.netId) max = Math.max(max, a.netId);
    this._nextNetId = (max % 4000) + 1;
  }

  /* ============================================================== client */

  /** Client: the host's roster string (who each netId is). */
  applyRoster(str) {
    if (typeof str !== 'string' || str === this._rosterSeen) return;
    this._rosterSeen = str;
    this._roster = readRoster(str);
  }

  /** Client: one bot snapshot from the host. */
  applyBots(str) {
    if (typeof str !== 'string' || str.length > MAX_BOTS * BOT_LEN + 8) return;
    const ai = this.ai;
    if (!ai) return;
    const r = this._r.set(str);
    const t = this.now();
    const seq = ++this._snapSeq;
    let spawned = false;
    while (r.left >= BOT_LEN) {
      if (!readBot(r, BOT)) return; // malformed: drop the rest of this snapshot
      let e = this.bots.get(BOT.id);
      if (!e) {
        const info = this._roster.get(BOT.id);
        if (!info) continue; // roster not here yet: next snapshot
        if (!spawned) {
          ai.reapCorpses?.(14);
          spawned = true;
        }
        e = this._spawnBot(info, BOT);
        if (!e) continue;
        this.bots.set(BOT.id, e);
      }
      e.seen = seq;
      e.missing = 0;
      if (!e.agent.alive) continue;
      e.interp.push(t, BOT.x, BOT.y, BOT.z, BOT.yaw, BOT.ayaw, BOT.pitch);
      e.speed = BOT.speed;
      e.crouch = (BOT.flags & BF.CROUCH) !== 0;
      e.aim = (BOT.flags & BF.AIM) !== 0;
      const reload = (BOT.flags & BF.RELOAD) !== 0;
      if (reload && !e.reload) e.agent.animator?.reload?.();
      e.reload = reload;
      e.hp = BOT.hp;
      const ds = (BOT.shots - e.shots + 64) % 64;
      e.shots = BOT.shots;
      if (ds > 0 && ds < 32) e.pendingShots = Math.min(3, e.pendingShots + ds);
      const dh = (BOT.hits - e.hits + 64) % 64;
      e.hits = BOT.hits;
      if (dh > 0 && dh < 32 && !e.localHit) e.agent.animator?.hit?.('torso', 1, 0.7);
      e.localHit = false;
    }
    // Bots the host no longer lists: dead (the kill event normally got here first).
    for (const [id, e] of this.bots) {
      if (e.seen === seq) continue;
      if (++e.missing >= 3) {
        if (e.agent.alive) this.killBot(id, null, false, null);
        this.bots.delete(id);
      }
    }
  }

  _spawnBot(info, b) {
    const ai = this.ai;
    let a = null;
    try {
      a = ai.spawn(info.variant || null, this._v.set(b.x, b.y, b.z), b.yaw, {
        team: this.net.relTeam?.(info.team) ?? info.team,
        role: info.role || undefined,
        weapon: info.weapon || undefined,
        name: info.name || undefined,
      });
    } catch (err) {
      console.warn('[net] puppet spawn failed', err);
      return null;
    }
    if (!a) return null;
    const e = this._entry('bot', a);
    e.id = info.id;
    a.netId = info.id;
    e.shots = b.shots;
    e.hits = b.hits;
    e.interp.snap(this.now(), b.x, b.y, b.z, b.yaw, b.ayaw, b.pitch);
    return e;
  }

  _entry(kind, agent) {
    const e = {
      kind,
      owner: this,
      agent,
      id: 0,
      peer: null,
      interp: new Interp(),
      speed: 0,
      crouch: false,
      aim: false,
      reload: false,
      hp: 100,
      shots: 0,
      hits: 0,
      pendingShots: 0,
      localHit: false,
      seen: 0,
      missing: 0,
      downed: false,
      weapon: 'carbine',
      name: '',
      flags: 0,
      revive: 0,
      kills: 0,
      slot: 0,
      bleed: 0,
    };
    this.makePuppet(agent, e);
    return e;
  }

  makePuppet(agent, e) {
    agent.__net = e;
    agent.update = puppetUpdate;
    agent.applyDamage = puppetDamage;
    agent.wantFire = false;
    agent.brain && (agent.brain.order = null);
  }

  /** Strip the overrides: the Agent's own prototype methods take over again. */
  release(agent) {
    delete agent.update;
    delete agent.applyDamage;
    agent.__net = null;
  }

  /** Client: the host says bot `id` died (or it vanished). */
  killBot(id, killer, headshot, dir) {
    const e = this.bots.get(id);
    if (!e || !e.agent.alive) return null;
    const a = e.agent;
    a.lastAttacker = killer ?? a.lastAttacker ?? null;
    a.applyDamage = Object.getPrototypeOf(a).applyDamage; // die() may route through it
    try {
      a.die(null, dir ?? null, 40, headshot ? 'head' : 'torso', null, killer ?? null);
    } catch (err) {
      console.warn('[net] puppet death failed', err);
    }
    return a;
  }

  /** Every bot puppet back to a real AI agent (this page became host). */
  promoteBots() {
    let n = 0;
    for (const e of this.bots.values()) {
      const a = e.agent;
      if (!a.alive) continue;
      this.release(a);
      a.netId = e.id;
      a.health = Math.max(1, e.hp);
      if (a.brain) a.brain._orderT = -Infinity;
      a.thinkTimer = 0;
      n++;
    }
    this.bots.clear();
    this.seedNetIds();
    return n;
  }

  /** Every live non-puppet bot becomes a puppet of the (new) host. */
  demoteBots() {
    const ai = this.ai;
    for (const a of ai?.agents ?? []) {
      if (!a.alive || a.__net || a.team === 'civ') continue;
      const e = this._entry('bot', a);
      e.id = this._netId(a);
      e.shots = (a.shotsFired ?? 0) % 64;
      e.interp.snap(this.now(), a.position.x, a.position.y, a.position.z, a.yaw, a.yaw, 0);
      this.bots.set(e.id, e);
    }
  }

  clearBots() {
    for (const e of this.bots.values()) this._remove(e.agent);
    this.bots.clear();
    this._roster = new Map();
    this._rosterSeen = '';
  }

  /* ============================================================= players */

  /** A remote teammate's state (decoded presence). `st` = readPlayer output. */
  /**
   * `team` is how THIS page draws him ('esf' teammate, 'hostile' enemy: on the
   * host that is also his side in the AI world). `ar` = helmet+vest tiers
   * ('n'|'l'|'h' ×2), `role` picks the third-person model for his weapon class.
   */
  updatePlayer(peer, st, name, weapon, team = 'esf', ar = null, role = 'rifleman') {
    const ai = this.ai;
    if (!ai) return null;
    let e = this.players.get(peer);
    const deadNow = (st.flags & PF.DEAD) !== 0;
    if (e && !e.agent.group.parent) {
      // ai.despawnAll() (a run restart) took it: build a new one.
      this.players.delete(peer);
      e = null;
    }
    if (e && e.ragdoll && !deadNow) {
      // Respawned after a PvP death: the corpse stays (the AI reaps it), a new soldier deploys.
      this.players.delete(peer);
      e = null;
      ai.reapCorpses?.(10);
    }
    if (e && !e.ragdoll && (e.agent.team !== team || (e.role !== role && !deadNow))) {
      // Switched sides, or switched to a weapon class with another model.
      this.removePlayer(peer);
      e = null;
    }
    const t = this.now();
    const ayaw = st.yaw + Math.PI; // player yaw → agent convention (forward = sin, cos)
    if (!e) {
      if (deadNow && this.net.pvp?.()) return null; // nobody to draw until he respawns
      let a = null;
      try {
        a = ai.spawn('vanguard', this._v.set(st.x, st.y, st.z), ayaw, {
          team,
          role,
          weapon: weapon || undefined,
          name: name || 'OPERATOR',
        });
      } catch (err) {
        console.warn('[net] teammate spawn failed', err);
        return null;
      }
      if (!a) return null;
      e = this._entry('player', a);
      e.peer = peer;
      e.role = role;
      a.isNetPlayer = true;
      a.netPeer = peer;
      e.name = a.name;
      e.shots = st.shots;
      e.interp.snap(t, st.x, st.y, st.z, ayaw, ayaw, st.pitch);
      this.players.set(peer, e);
    }
    const a = e.agent;
    if (e.ragdoll) return e;
    if (ar && ar !== e.ar) {
      e.ar = ar;
      const T = { n: 'none', l: 'light', h: 'heavy' };
      try {
        a.setArmor?.({ helmet: T[ar[0]], vest: T[ar[1]] });
      } catch {
        /* the AI build has no armour meshes yet */
      }
    }
    if (deadNow && this.net.pvp?.()) {
      // PvP death without the event (dropped): drop him where he stands.
      this.killPlayer(peer, null, false);
      return e;
    }
    if (name && name.toUpperCase() !== e.name) {
      e.name = name.toUpperCase();
      ai.iff?.detach?.(a);
      a.name = e.name;
      ai.iff?.attach?.(a);
    }
    if (weapon && weapon !== e.weapon) e.weapon = weapon;
    const downed = (st.flags & (PF.DOWN | PF.DEAD)) !== 0;
    const wasDown = e.downed;
    e.downed = downed;
    e.flags = st.flags;
    e.revive = st.revive;
    e.kills = st.kills;
    e.slot = st.slot;
    e.bleed = st.bleed;
    e.hp = st.hp * 100;
    // Downed teammates drop out of the fight: bots stop targeting them.
    a.alive = !downed;
    // A respawn or revive far away: no sliding across the map.
    const last = e.interp.n ? e.interp.head * 6 : -1;
    const far = last >= 0 && Math.hypot(e.interp.v[last] - st.x, e.interp.v[last + 2] - st.z) > 6;
    if (far || (wasDown && !downed)) e.interp.snap(t, st.x, st.y, st.z, ayaw, ayaw, st.pitch);
    else e.interp.push(t, st.x, st.y, st.z, ayaw, ayaw, st.pitch);
    e.speed = st.speed;
    e.crouch = downed || (st.flags & (PF.CROUCH | PF.PRONE)) !== 0;
    e.aim = !downed;
    const ds = (st.shots - e.shots + 64) % 64;
    e.shots = st.shots;
    if (ds > 0 && ds < 32 && !downed) e.pendingShots = Math.min(3, e.pendingShots + ds);
    return e;
  }

  /** PvP: a remote player died — his soldier ragdolls like any actor (killfeed, killcam). */
  killPlayer(peer, killer, headshot) {
    const e = this.players.get(peer);
    if (!e || e.ragdoll) return null;
    const a = e.agent;
    e.ragdoll = true;
    a.alive = true; // die() only runs on the living
    a.lastAttacker = killer ?? null;
    a.applyDamage = Object.getPrototypeOf(a).applyDamage;
    try {
      a.die(null, null, 40, headshot ? 'head' : 'torso', null, killer ?? null);
    } catch (err) {
      console.warn('[net] teammate death failed', err);
    }
    return a;
  }

  removePlayer(peer) {
    const e = this.players.get(peer);
    if (!e) return;
    this.players.delete(peer);
    this._remove(e.agent);
  }

  clearPlayers() {
    for (const e of this.players.values()) this._remove(e.agent);
    this.players.clear();
  }

  _remove(a) {
    const ai = this.ai;
    if (!a) return;
    a.alive = false;
    try {
      ai?.iff?.detach?.(a);
      ai?.cover?.release?.(a.id);
      a.dispose();
    } catch {
      /* already gone */
    }
    const list = ai?.agents;
    if (list) {
      const i = list.indexOf(a);
      if (i >= 0) list.splice(i, 1);
    }
  }

  /** Downed teammates are `alive = false` (out of the AI's world) but still drawn. */
  update(dt) {
    for (const e of this.players.values()) {
      if (!e.agent.alive && e.downed && !e.ragdoll && e.agent.group.parent) this.drive(e.agent, e, dt);
    }
  }

  /* ============================================================ the pose */

  drive(a, e, dt) {
    if (!e.interp.sample(this.now(), S)) return;
    a.position.set(S.x, S.y, S.z);
    a.controller?.teleport?.(S.x, S.y, S.z);
    a.yaw = S.yaw;
    a.targetYaw = S.yaw;
    a.faceYawV = S.yaw;
    a.speed = e.downed ? 0 : e.speed;
    a.crouch = e.crouch;
    a.suppression = 0;
    a.health = e.downed ? 10 : e.hp;
    const cp = Math.cos(S.pitch);
    const eye = S.y + (a.eyeHeight ?? 1.6) * (a.crouch ? 0.72 : 1);
    const pitch = e.downed ? -0.5 : S.pitch;
    a.aimTarget.set(S.x + Math.sin(S.ayaw) * cp * 12, eye + Math.sin(pitch) * 12, S.z + Math.cos(S.ayaw) * cp * 12);
    a.faceMode = 0;
    const want = e.aim ? 0.95 : 0.1;
    a.aimWeight += (want - a.aimWeight) * Math.min(1, dt * 8);
    a._drive(dt);
    if (e.pendingShots > 0) {
      e.pendingShots--;
      if (!a.animator?.reloading) this._fireVisual(a, e);
    }
  }

  /** Muzzle flash, report, shell, tracer and wall impact for a remote shot. */
  _fireVisual(a, e) {
    const ctx = this.ctx;
    const an = a.animator;
    if (!an) return;
    const origin = an.muzzleWorld;
    const dir = this._dir.copy(a.aimTarget).sub(origin);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const ai = this.ai;
    const fe = this._fe;
    if (e.kind === 'player') {
      const id = e.weapon || 'carbine';
      fe.weapon = /_sd$|suppress/.test(id) ? { id, audio: id, suppressed: true } : id;
    } else {
      const W = a.weapon;
      fe.weapon = W?.suppressed ? { id: W.audio, audio: W.audio, suppressed: true } : W?.audio ?? 'ai_rifle';
    }
    fe.actor = a;
    fe.origin.copy(origin);
    fe.dir.copy(dir);
    fe.intensity = ai?._flashGain?.() ?? 0.4;
    fe.light = ai?._flashLight?.() ?? 0.02;
    fe.flashScale = 0.8;
    fe.seed = (a.id * 2654435761 + ctx.time.frame) >>> 0;
    ctx.events.emit('weapon:fire', fe);
    an.fire?.(1);
    // The host's bots should hear a teammate's gunfire like the host's own.
    if (e.kind === 'player' && this.net.role === 'host') ai?.onShot?.(a, origin, dir, 90, 1);

    const se = this._se;
    se.position.copy(an.ejectWorld ?? origin);
    se.velocity.set(dir.z, 0.55, -dir.x).multiplyScalar(2.1).addScaledVector(dir, -0.6);
    ctx.events.emit('weapon:shell', se);

    // Wall impact (world only: actor layers excluded, so nobody is damaged).
    const phys = ctx.peek('physics');
    let end = 120;
    if (phys?.raycast && phys.MASK && phys.LAYER) {
      const mask = phys.MASK.BULLET & ~phys.LAYER.ACTOR;
      const h = phys.raycast(origin, dir, 220, mask);
      if (h?.hit) {
        end = h.distance;
        const o = this._bulletOpts;
        o.origin = origin;
        o.dir = dir;
        o.damage = 0;
        o.penetration = 0;
        o.maxDist = end + 0.5;
        o.mask = mask;
        try {
          phys.fireBullet?.(o);
        } catch {
          /* impact FX are cosmetic */
        }
      }
    }
    e.tracer = ((e.tracer ?? 0) + 1) % 3;
    if (e.tracer === 0) {
      const te = this._te;
      te.from.copy(origin);
      te.to.copy(origin).addScaledVector(dir, Math.min(end, 120));
      ctx.events.emit('bullet:tracer', te);
    }
  }

  /* ========================================================== damage path */

  onPuppetDamage(a, e, amount, part, point, dir, blast, source) {
    if (blast) return; // explosions: the host applies them to bots, each player to himself
    if (e.kind === 'bot') {
      // Client: my round hit a host bot. Resolved here, applied by the host.
      if (!(amount > 0)) return;
      this.net.queueHit(e.id, amount, part === 'head');
      e.localHit = true;
      const side = dir ? Math.sign(dir.x * Math.cos(a.yaw) - dir.z * Math.sin(a.yaw)) || 1 : 1;
      a.animator?.hit?.(part === 'head' ? 'head' : 'torso', side, Math.min(1.4, 0.5 + amount / 45));
      return;
    }
    const zone = part === 'head' ? 'head' : part === 'torso' ? 'torso' : 'limb';
    if (source?.isPlayer === true) {
      // PvP: my round hit another player's soldier. Teammates are never hit
      // (their capsules are off the bullet mask); this is an enemy.
      if (a.team !== 'hostile' || !(amount > 0)) return;
      this.net.claimPlayerHit(e.peer, amount, zone);
      const side = dir ? Math.sign(dir.x * Math.cos(a.yaw) - dir.z * Math.sin(a.yaw)) || 1 : 1;
      a.animator?.hit?.(part === 'head' ? 'head' : 'torso', side, Math.min(1.4, 0.5 + amount / 45));
      return;
    }
    // On the HOST: a bot round on a remote player's soldier.
    if (this.net.role !== 'host' || !source || source.__net || !source.team || source.team === a.team) return;
    const W = source.weapon;
    const pellets = W?.pellets > 1 ? 1 / Math.sqrt(W.pellets) : 1;
    const dmg = (source.weaponDamage ?? amount) * (part === 'head' ? 1.25 : 1) * pellets;
    this.net.queueDamage(e.peer, dmg, source.position, source.netId ? `b${source.netId}` : '', zone, 'fmj', source.weaponId ?? null);
    a.animator?.hit?.('torso', 1, 0.6);
  }

  dispose() {
    this.clearBots();
    this.clearPlayers();
  }
}
