import * as THREE from 'three';

/**
 * KILLCAM (docs/EXPANSION.md §10.6). Owned by GameSystem (src/game/index.js).
 *
 * RECORDER
 *   Every actor (ai.agents: bots, net puppets; plus Doug) is sampled at 20 Hz
 *   into a pooled ring: CAP samples x MAXA actor slots of STRIDE floats
 *   (feet xyz, eye height, body yaw, aim yaw, aim pitch, speed, flags) plus a
 *   weapon index per sample. Fire events (`weapon:fire`) go into their own
 *   ring with the round's end point (one world raycast per shot). Nothing in
 *   the per-frame path allocates: the slot table and the weapon-id table grow
 *   only when a new actor / weapon id first appears.
 *
 * PLAYBACK
 *   `play(rec)` replays [death - 4 s, death + 0.7 s] from the killer's eye,
 *   interpolated, over his right shoulder so his third-person weapon is in the
 *   frame. The world is PAUSED for the duration (ctx.time.scale = 0: nothing
 *   simulates, so nothing can double-simulate) and every live actor is hidden;
 *   the recorded cast is drawn with pooled AI mannequins (`ai.spawnMannequin`:
 *   the same skinned soldier, kit and third-person weapon, no physics), Doug
 *   as an ESF soldier carrying his weapon's model. A man who dies inside the
 *   window hands over to his real ragdoll (it lies exactly where he fell);
 *   Doug, who has no ragdoll, folds. Tracers and muzzle flashes are drawn by
 *   the killcam itself (the fx system is paused with the world). The live HUD
 *   and the viewmodel are hidden; a FLOP OPS lower-third names the killer, his
 *   weapon, the distance, the headshot, and Command's view of it.
 *   Space or a click skips. `onEnd` runs either way.
 */

const HZ = 20;
const DT = 1 / HZ;
/** Seconds of history kept (the request: "about 6 s"; 7 leaves room for the 1 s lead-in). */
const HISTORY = 7;
const CAP = Math.ceil(HISTORY * HZ);
const MAXA = 40;
const STRIDE = 9; // x y z eyeY bodyYaw aimYaw pitch speed flags
const F_ALIVE = 1;
const F_CROUCH = 2;
const FCAP = 320;
const TRACERS = 24;
const FLASHES = 8;
const CAST = 16;

/** Seconds before the kill the replay starts / after it ends. */
const LEAD = 4;
const TAIL = 0.7;

/** Weapon class → the AI's third-person weapon style (src/ai/weapon.js WEAPON_STYLES). */
const STYLE_FOR_CLASS = { carbine: 'carbine', rifle: 'carbine', smg: 'smg', shotgun: 'shotgun', lmg: 'lmg', sniper: 'sniper', marksman: 'sniper', pistol: 'smg', launcher: 'rocket' };

/** Command's read on how Doug died. Picked by context, never random-per-frame. */
const LINES = {
  normal: [
    'Command has reviewed the footage. Command would like to stop reviewing the footage.',
    'For training purposes, this is what not to do.',
    'Command notes that the enemy was, in fact, there.',
    'The plan did not account for this. The plan did not account for much.',
  ],
  headshot: [
    'Headshot. Command recommends a smaller head.',
    'Command has confirmed the helmet was decorative.',
  ],
  long: ['From that far. Command is impressed, for the wrong reasons.'],
  close: ['At this range Command would have recommended stepping aside.'],
  knife: ['Knifed. Command will not be including this in the newsletter.'],
  explosive: ['Command reminds everyone that grenades are not catches.'],
  survival: [
    'Doug is down. Command is reviewing the footage for a silver lining.',
    'The position was held for about a wave. Command called it.',
  ],
  final: [
    'The match, decided. Command would like it framed.',
    'And that is the end of it. Command has already ordered the plaque.',
  ],
  finalDoug: ['The final kill. Command has asked for this one in slow motion. It is in slow motion.'],
};

function makeGlowTexture() {
  const S = 64;
  let c = null;
  try {
    c = document.createElement('canvas');
  } catch {
    return null;
  }
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,236,190,0.8)');
  grd.addColorStop(0.55, 'rgba(255,170,80,0.18)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const wrapPi = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export class Killcam {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;

    // ---- recorder -----------------------------------------------------------
    this.times = new Float64Array(CAP);
    this.data = new Float32Array(MAXA * CAP * STRIDE);
    this.wpn = new Uint8Array(MAXA * CAP);
    this.head = -1;
    this.count = 0;
    this._lastSampleT = -1e9;
    /** slot → { actor, team, variant, model, name, role, isPlayer, lastSeen } */
    this.slots = [];
    for (let i = 0; i < MAXA; i++) this.slots.push({ i, actor: null, team: 'hostile', variant: 'vanguard', model: null, name: '', role: '', isPlayer: false, lastSeen: -1e9 });
    this._slotOf = new Map();
    this.weaponIds = [''];
    this._weaponIdx = new Map([['', 0]]);

    this.fT = new Float64Array(FCAP);
    this.fSlot = new Int16Array(FCAP);
    this.fData = new Float32Array(FCAP * 6);
    this.fHead = -1;
    this.fCount = 0;

    /** The last death of Doug and the last kill of the match (preallocated records). */
    this.lastDeath = this._record();
    this.lastKill = this._record();

    // ---- playback -------------------------------------------------------------
    this.playing = false;
    this.pending = null;
    this._pendingAt = 0;
    this._rec = this._record();
    this.pt = 0;
    this._prevPt = 0;
    this.t0 = 0;
    this.t1 = 0;
    this._cast = [];
    this._pool = new Map();
    this._hidden = [];
    this._s = { x: 0, y: 0, z: 0, eyeY: 0, bodyYaw: 0, aimYaw: 0, pitch: 0, speed: 0, alive: false, crouch: false, w: 0 };
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._camSnap = true;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._fov = 0;
    this._skipArm = 0;
    this._startRaw = 0;

    this._fxRoot = null;
    this._tracers = [];
    this._flashes = [];

    this._wire();
  }

  _record() {
    return {
      valid: false,
      t: 0,
      killerSlot: -1,
      victimSlot: -1,
      killerName: '',
      killerRole: '',
      killerIsPlayer: false,
      victimName: '',
      victimIsPlayer: false,
      weapon: null,
      headshot: false,
      distance: 0,
      kind: 'death',
      final: false,
      survival: false,
    };
  }

  _copyRec(dst, src) {
    for (const k in src) dst[k] = src[k];
    return dst;
  }

  _wire() {
    const on = (t, fn) => this.ctx.events.on(t, fn);
    this._off = [on('weapon:fire', (e) => this._onFire(e))];
    this._onKey = (e) => {
      if (!this.playing || this.ctx.time.raw < this._skipArm) return;
      const skip = e.type === 'mousedown' ? e.button === 0 : e.code === 'Space' || e.code === 'Enter';
      if (!skip) return;
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      this.skip();
    };
    try {
      addEventListener('keydown', this._onKey, true);
      addEventListener('mousedown', this._onKey, true);
    } catch {
      /* headless build */
    }
  }

  /* ================================================================== */
  /* recorder                                                            */
  /* ================================================================== */

  _weaponIndex(id) {
    if (!id) return 0;
    let i = this._weaponIdx.get(id);
    if (i === undefined) {
      if (this.weaponIds.length >= 255) return 0;
      i = this.weaponIds.length;
      this.weaponIds.push(id);
      this._weaponIdx.set(id, i);
    }
    return i;
  }

  _isPlayer(a) {
    return !!a && (a === 'player' || a.isPlayer === true || a === this.ctx.peek('player'));
  }

  /** Recorder slot for an actor (Doug = the player system / proxy / 'player'). */
  slotFor(actor, create = true) {
    if (!actor) return -1;
    const key = this._isPlayer(actor) ? 'player' : actor;
    let i = this._slotOf.get(key);
    if (i !== undefined) return i;
    if (!create) return -1;
    // a free slot, or the one unseen the longest (older than the history)
    const now = this.ctx.time.elapsed;
    let pick = -1;
    let oldest = Infinity;
    for (const s of this.slots) {
      if (!s.actor) {
        pick = s.i;
        break;
      }
      if (s.lastSeen < oldest && now - s.lastSeen > HISTORY) {
        oldest = s.lastSeen;
        pick = s.i;
      }
    }
    if (pick < 0) return -1;
    const s = this.slots[pick];
    if (s.actor) this._slotOf.delete(s.actor === 'player' ? 'player' : s.actor);
    s.actor = key;
    s.isPlayer = key === 'player';
    s.team = s.isPlayer ? 'esf' : actor.team ?? 'hostile';
    s.variant = s.isPlayer ? 'vanguard' : actor.variantName ?? 'vanguard';
    s.model = s.isPlayer ? null : actor.modelStyle ?? null;
    s.name = s.isPlayer ? 'DOUG' : String(actor.name ?? 'UNKNOWN').toUpperCase();
    s.role = s.isPlayer ? 'ESF' : String(actor.variantDisplay ?? actor.role ?? '').toUpperCase();
    s.lastSeen = now;
    // clear its history so a recycled slot never replays the previous owner
    for (let k = 0; k < CAP; k++) this.data[(pick * CAP + k) * STRIDE + 8] = 0;
    this._slotOf.set(key, pick);
    return pick;
  }

  /** Sample every actor (called once per frame by the game; 20 Hz inside). */
  record() {
    if (this.playing) return;
    const now = this.ctx.time.elapsed;
    if (now - this._lastSampleT < DT && now >= this._lastSampleT) return;
    this._lastSampleT = now;
    this.head = (this.head + 1) % CAP;
    if (this.count < CAP) this.count++;
    const row = this.head;
    this.times[row] = now;
    const D = this.data;
    for (let i = 0; i < MAXA; i++) D[(i * CAP + row) * STRIDE + 8] = 0;

    // Doug
    const p = this.ctx.peek('player');
    if (p?.position && Number.isFinite(p.position.x)) {
      const alive = !(p.dead === true || p.health?.dead === true);
      const si = this.slotFor('player');
      if (si >= 0) {
        const f = p.forward;
        const eye = p.eyePosition ?? p.position;
        const aimYaw = f ? Math.atan2(f.x, f.z) : Math.PI - (p.yaw ?? 0);
        const pitch = f ? Math.asin(Math.max(-1, Math.min(1, f.y))) : p.pitch ?? 0;
        const v = p.velocity;
        const crouch = p.stance === 'crouch' || p.stance === 'prone';
        this._write(si, row, p.position.x, p.position.y, p.position.z, eye.y, aimYaw, aimYaw, pitch, v ? Math.hypot(v.x, v.z) : 0, (alive ? F_ALIVE : 0) | (crouch ? F_CROUCH : 0), this._weaponIndex(this.ctx.peek('weapons')?.activeId ?? null));
      }
    }
    // Agents (bots and net puppets)
    const ai = this.ctx.peek('ai');
    const agents = ai?.agents;
    if (Array.isArray(agents)) {
      for (let k = 0; k < agents.length; k++) {
        const a = agents[k];
        if (!a?.alive || !a.position || a.isMannequin) continue;
        const si = this.slotFor(a);
        if (si < 0) continue;
        const eyeY = a.position.y + (a.eyeHeight ?? 1.6) * (a.crouch ? 0.72 : 1);
        let aimYaw = a.yaw;
        let pitch = 0;
        const at = a.aimTarget;
        if (at && (a.aimWeight ?? 0) > 0.15) {
          const dx = at.x - a.position.x;
          const dz = at.z - a.position.z;
          const dy = at.y - eyeY;
          const h = Math.hypot(dx, dz);
          if (h > 0.3) {
            aimYaw = Math.atan2(dx, dz);
            pitch = Math.atan2(dy, h);
          }
        }
        this._write(si, row, a.position.x, a.position.y, a.position.z, eyeY, a.yaw, aimYaw, pitch, a.speed ?? 0, F_ALIVE | (a.crouch ? F_CROUCH : 0), this._weaponIndex(a.weaponId));
      }
    }
  }

  _write(si, row, x, y, z, eyeY, bodyYaw, aimYaw, pitch, speed, flags, w) {
    const o = (si * CAP + row) * STRIDE;
    const D = this.data;
    D[o] = x;
    D[o + 1] = y;
    D[o + 2] = z;
    D[o + 3] = eyeY;
    D[o + 4] = bodyYaw;
    D[o + 5] = aimYaw;
    D[o + 6] = pitch;
    D[o + 7] = speed;
    D[o + 8] = flags;
    this.wpn[si * CAP + row] = w;
    this.slots[si].lastSeen = this.ctx.time.elapsed;
  }

  _onFire(e) {
    if (this.playing || !e?.origin || !e.dir) return;
    const actor = e.actor ?? (e.ai === true ? null : 'player');
    if (!actor) return;
    const si = this.slotFor(actor);
    if (si < 0) return;
    this.fHead = (this.fHead + 1) % FCAP;
    if (this.fCount < FCAP) this.fCount++;
    const i = this.fHead;
    this.fT[i] = this.ctx.time.elapsed;
    this.fSlot[i] = si;
    const o = i * 6;
    const F = this.fData;
    F[o] = e.origin.x;
    F[o + 1] = e.origin.y;
    F[o + 2] = e.origin.z;
    let dist = 90;
    const phys = this.ctx.peek('physics');
    if (phys?.raycast && phys.MASK) {
      const h = phys.raycast(e.origin, e.dir, 160, phys.MASK.BULLET);
      if (h?.hit) dist = Math.max(0.5, h.distance);
    }
    F[o + 3] = e.origin.x + e.dir.x * dist;
    F[o + 4] = e.origin.y + e.dir.y * dist;
    F[o + 5] = e.origin.z + e.dir.z * dist;
  }

  /** Interpolated sample of slot `si` at time `t` into `out`. False when absent. */
  sample(si, t, out) {
    if (si < 0 || this.count < 1) return false;
    // newest row with time <= t
    let b = -1;
    for (let k = 0; k < this.count; k++) {
      const r = (this.head - k + CAP) % CAP;
      if (this.times[r] <= t) {
        b = r;
        break;
      }
    }
    if (b < 0) return false;
    const n = (b + 1) % CAP;
    const hasNext = b !== this.head;
    const D = this.data;
    const ob = (si * CAP + b) * STRIDE;
    const fb = D[ob + 8];
    if (!(fb & F_ALIVE)) {
      out.alive = false;
      return false;
    }
    let u = 0;
    let on = ob;
    if (hasNext) {
      const oN = (si * CAP + n) * STRIDE;
      const span = this.times[n] - this.times[b];
      if ((D[oN + 8] & F_ALIVE) && span > 1e-4) {
        u = Math.min(1, Math.max(0, (t - this.times[b]) / span));
        on = oN;
      }
    }
    const L = (k) => D[ob + k] + (D[on + k] - D[ob + k]) * u;
    const A = (k) => D[ob + k] + wrapPi(D[on + k] - D[ob + k]) * u;
    out.x = L(0);
    out.y = L(1);
    out.z = L(2);
    out.eyeY = L(3);
    out.bodyYaw = A(4);
    out.aimYaw = A(5);
    out.pitch = L(6);
    out.speed = L(7);
    out.alive = true;
    out.crouch = (fb & F_CROUCH) !== 0;
    out.w = this.wpn[si * CAP + b];
    return true;
  }

  /** Last recorded time slot `si` was alive (≤ t), or -Infinity. */
  lastAliveBefore(si, t) {
    for (let k = 0; k < this.count; k++) {
      const r = (this.head - k + CAP) % CAP;
      if (this.times[r] > t) continue;
      if (this.data[(si * CAP + r) * STRIDE + 8] & F_ALIVE) return this.times[r];
    }
    return -Infinity;
  }

  oldest() {
    if (!this.count) return Infinity;
    return this.times[(this.head - this.count + 1 + CAP) % CAP];
  }

  /* ================================================================== */
  /* death notes                                                         */
  /* ================================================================== */

  _fill(rec, killer, victim, weapon, headshot, kind) {
    rec.valid = false;
    const ks = this.slotFor(killer);
    const vs = this.slotFor(victim);
    if (ks < 0 || vs < 0 || ks === vs) return rec;
    rec.valid = true;
    rec.t = this.ctx.time.elapsed;
    rec.killerSlot = ks;
    rec.victimSlot = vs;
    rec.killerName = this.slots[ks].name;
    rec.killerRole = this.slots[ks].role;
    rec.killerIsPlayer = this.slots[ks].isPlayer;
    rec.victimName = this.slots[vs].name;
    rec.victimIsPlayer = this.slots[vs].isPlayer;
    rec.weapon = weapon ?? null;
    rec.headshot = !!headshot;
    rec.kind = kind;
    rec.final = false;
    rec.survival = false;
    // distance: killer eye to victim, from the live transforms now
    const kp = this._posOf(killer, this._v);
    const vp = this._posOf(victim, this._v2);
    rec.distance = kp && vp ? kp.distanceTo(vp) : 0;
    return rec;
  }

  _posOf(a, out) {
    if (this._isPlayer(a)) {
      const p = this.ctx.peek('player')?.position;
      return p ? out.copy(p) : null;
    }
    return a?.position ? out.copy(a.position) : null;
  }

  /** Doug died. `killer` is an Agent (or null: nothing to replay). */
  notePlayerDeath(killer, weapon, headshot) {
    if (!killer || this._isPlayer(killer)) {
      this.lastDeath.valid = false;
      return null;
    }
    // one last sample so the window reaches the moment of death
    this._lastSampleT = -1e9;
    this.record();
    this._fill(this.lastDeath, killer, 'player', weapon ?? killer.weaponId ?? null, headshot, 'death');
    if (this.lastDeath.valid) this._copyRec(this.lastKill, this.lastDeath);
    return this.lastDeath.valid ? this.lastDeath : null;
  }

  /** Any kill (actor:death with a killer), kept for the final killcam. */
  noteKill(e, headshot) {
    if (!e?.actor || !e.killer) return;
    const rec = this._scratchKill ?? (this._scratchKill = this._record());
    this._fill(rec, e.killer, e.actor, e.weapon ?? null, headshot ?? e.headshot, 'kill');
    if (rec.valid) this._copyRec(this.lastKill, rec);
  }

  /* ================================================================== */
  /* playback                                                            */
  /* ================================================================== */

  /** True when `rec` has the killer on record inside its window. */
  canPlay(rec) {
    if (!rec?.valid || this.count < 4) return false;
    const t0 = Math.max(this.oldest(), rec.t - LEAD);
    return this.lastAliveBefore(rec.killerSlot, rec.t + 0.05) >= t0;
  }

  /** Play `rec` after `delay` raw seconds (the death beat). */
  queue(rec, delay, opts = {}) {
    if (!this.canPlay(rec)) return false;
    this.pending = this._copyRec(this._pendingRec ?? (this._pendingRec = this._record()), rec);
    this.pending.final = !!opts.final;
    this.pending.survival = !!opts.survival;
    this._pendingOpts = opts;
    this._pendingAt = this.ctx.time.raw + delay;
    return true;
  }

  cancel() {
    this.pending = null;
    if (this.playing) this.stop(true);
  }

  get busy() {
    return this.playing || !!this.pending;
  }

  /** Per frame (game.update): start a queued replay when its delay is up. */
  tick() {
    if (this.pending && !this.playing && this.ctx.time.raw >= this._pendingAt) {
      const rec = this.pending;
      const opts = this._pendingOpts ?? {};
      this.pending = null;
      if (!this.play(rec, opts)) opts.onEnd?.(false);
    }
  }

  play(rec, opts = {}) {
    if (this.playing || !this.canPlay(rec)) return false;
    const ctx = this.ctx;
    const ai = ctx.peek('ai');
    if (!ai?.spawnMannequin) return false;
    this._copyRec(this._rec, rec);
    this._rec.final = !!(opts.final ?? rec.final);
    this._rec.survival = !!(opts.survival ?? rec.survival);
    this._onEnd = opts.onEnd ?? null;
    this.t0 = Math.max(this.oldest(), rec.t - LEAD);
    this.t1 = rec.t + TAIL;
    this.pt = this.t0;
    this._prevPt = this.t0 - 1e-3;
    this._camSnap = true;
    this.playing = true;
    this._startRaw = ctx.time.raw;
    this._skipArm = ctx.time.raw + 0.3;

    // the world holds still
    this._prevScale = ctx.time.scale || 1;
    ctx.time.scale = 0;
    // live actors and their ragdolls are hidden; the cast stands in for them
    this._hidden.length = 0;
    for (const list of [ai.agents, ai.civilians]) {
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (a?.group && a.group.visible) {
          a.group.visible = false;
          this._hidden.push(a);
        }
      }
    }
    if (ctx.viewScene) {
      this._viewWas = ctx.viewScene.visible;
      ctx.viewScene.visible = false;
    }
    this._fov = ctx.camera.fov;
    ctx.camera.fov = 62;
    ctx.camera.updateProjectionMatrix();
    ctx.peek('ui')?.setHudVisible?.(false);
    this._buildCast(ai);
    this._ensureFx();
    this._overlay(true);
    console.info(`[killcam] ${this._rec.final ? 'FINAL ' : ''}${this._rec.killerName} → ${this._rec.victimName} (${this._rec.weapon ?? '?'}, ${this._rec.distance.toFixed(1)} m${this._rec.headshot ? ', headshot' : ''})`);
    ctx.events.emit('killcam:start', { final: this._rec.final, killer: this._rec.killerName, victim: this._rec.victimName, weapon: this._rec.weapon });
    return true;
  }

  skip() {
    if (this.playing) this.stop(false, true);
  }

  stop(cancelled = false, skipped = false) {
    if (!this.playing) return;
    const ctx = this.ctx;
    this.playing = false;
    for (const c of this._cast) {
      c.m.group.visible = false;
      c.m.group.rotation.x = 0;
    }
    this._cast.length = 0;
    for (const a of this._hidden) if (a.group) a.group.visible = true;
    this._hidden.length = 0;
    for (const t of this._tracers) t.mesh.visible = false;
    for (const f of this._flashes) f.sprite.visible = false;
    if (ctx.viewScene) ctx.viewScene.visible = this._viewWas !== false;
    ctx.camera.fov = this._fov || ctx.camera.fov;
    ctx.camera.updateProjectionMatrix();
    ctx.peek('ui')?.setHudVisible?.(true);
    // the pause menu may have been opened over the replay: it restores to "running"
    const menu = ctx.peek('ui')?.menu;
    if (menu?.open) {
      menu._prevScale = 1;
      ctx.time.scale = 0;
    } else ctx.time.scale = 1;
    this._overlay(false);
    ctx.events.emit('killcam:end', { skipped, cancelled });
    const cb = this._onEnd;
    this._onEnd = null;
    if (!cancelled) cb?.(true);
  }

  /* ---------------------------------------------------------------- cast */

  _styleFor(weaponId) {
    const def = this.ctx.peek('weapons')?.states?.get?.(weaponId)?.def;
    return STYLE_FOR_CLASS[def?.class] ?? STYLE_FOR_CLASS[weaponId] ?? 'carbine';
  }

  _mannequin(ai, variant, team, model) {
    const key = `${variant}|${team}|${model ?? ''}`;
    let list = this._pool.get(key);
    if (!list) this._pool.set(key, (list = []));
    for (const m of list) if (!m._kcBusy) return m;
    if (this._poolSize >= 24) return null;
    let m = null;
    try {
      m = ai.spawnMannequin(variant, { team, model });
    } catch (err) {
      console.warn('[killcam] mannequin failed', err);
      return null;
    }
    if (!m) return null;
    this._poolSize = (this._poolSize ?? 0) + 1;
    m.group.visible = false;
    list.push(m);
    return m;
  }

  _buildCast(ai) {
    for (const list of this._pool.values()) for (const m of list) m._kcBusy = false;
    const cast = this._cast;
    cast.length = 0;
    const s = this._s;
    // the killer first, the victim second, then everyone on record in the window
    const order = this._order ?? (this._order = []);
    order.length = 0;
    order.push(this._rec.killerSlot, this._rec.victimSlot);
    for (const sl of this.slots) if (sl.actor && sl.i !== this._rec.killerSlot && sl.i !== this._rec.victimSlot) order.push(sl.i);
    for (const si of order) {
      if (cast.length >= CAST) break;
      const sl = this.slots[si];
      if (!sl.actor) continue;
      // on record at some point in the window?
      if (this.lastAliveBefore(si, this.t1) < this.t0) continue;
      let model = sl.model;
      if (sl.isPlayer) {
        this.sample(si, Math.min(this._rec.t, this.lastAliveBefore(si, this._rec.t)), s);
        model = this._styleFor(this.weaponIds[s.w] || 'carbine');
      }
      const m = this._mannequin(ai, sl.variant, sl.team, model);
      if (!m) continue;
      m._kcBusy = true;
      m.group.rotation.x = 0;
      const live = sl.isPlayer ? null : sl.actor;
      cast.push({ si, m, live, deathT: this.lastAliveBefore(si, this.t1), isPlayer: sl.isPlayer, fired: 0 });
    }
  }

  /* ---------------------------------------------------------- tracers/fx */

  _ensureFx() {
    if (this._fxRoot) return;
    const root = (this._fxRoot = new THREE.Group());
    root.name = 'killcam-fx';
    this.ctx.scene.add(root);
    this._tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
    this._tracerGeo.translate(0, 0, -0.5);
    this._tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < TRACERS; i++) {
      const mesh = new THREE.Mesh(this._tracerGeo, this._tracerMat);
      mesh.visible = false;
      mesh.userData.owNoPrepass = true;
      mesh.userData.owNoShadow = true;
      mesh.frustumCulled = false;
      root.add(mesh);
      this._tracers.push({ mesh, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), len: 0, active: false });
    }
    this._glowTex = makeGlowTexture();
    this._flashMat = new THREE.SpriteMaterial({ map: this._glowTex, color: new THREE.Color(5, 3.6, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < FLASHES; i++) {
      const sprite = new THREE.Sprite(this._flashMat);
      sprite.visible = false;
      sprite.userData.owNoPrepass = true;
      sprite.userData.owNoShadow = true;
      root.add(sprite);
      this._flashes.push({ sprite, t: 0, active: false });
    }
  }

  _spawnTracer(fi) {
    let tr = null;
    for (const t of this._tracers) if (!t.active) { tr = t; break; }
    if (!tr) tr = this._tracers[fi % TRACERS];
    const o = fi * 6;
    const F = this.fData;
    tr.from.set(F[o], F[o + 1], F[o + 2]);
    tr.to.set(F[o + 3], F[o + 4], F[o + 5]);
    tr.len = tr.from.distanceTo(tr.to);
    tr.t = 0;
    tr.active = true;
    let fl = null;
    for (const f of this._flashes) if (!f.active) { fl = f; break; }
    if (fl) {
      fl.active = true;
      fl.t = 0;
      fl.sprite.position.copy(tr.from);
      fl.sprite.visible = true;
    }
  }

  _updateFx(rawDt) {
    const SPEED = 520; // replay tracer, m/s
    for (const tr of this._tracers) {
      if (!tr.active) continue;
      tr.t += rawDt;
      const head = Math.min(tr.len, tr.t * SPEED);
      const tail = Math.max(0, head - 5);
      if (tail >= tr.len - 0.01) {
        tr.active = false;
        tr.mesh.visible = false;
        continue;
      }
      const m = tr.mesh;
      const u = tr.len > 0 ? 1 / tr.len : 0;
      m.position.lerpVectors(tr.from, tr.to, head * u);
      this._v.lerpVectors(tr.from, tr.to, tail * u);
      m.lookAt(this._v);
      m.scale.set(1, 1, Math.max(0.05, head - tail));
      m.visible = true;
    }
    for (const f of this._flashes) {
      if (!f.active) continue;
      f.t += rawDt;
      if (f.t > 0.06) {
        f.active = false;
        f.sprite.visible = false;
        continue;
      }
      const s = 0.45 * (1 - f.t / 0.06) + 0.15;
      f.sprite.scale.set(s, s, 1);
    }
  }

  /* -------------------------------------------------------------- frame */

  /** Drive the replay: poses, camera, tracers. Called from game.lateUpdate. */
  lateUpdate() {
    if (!this.playing) return;
    const ctx = this.ctx;
    const rawDt = Math.min(0.1, Math.max(0, ctx.time.raw - (this._lastRaw ?? ctx.time.raw)));
    this._lastRaw = ctx.time.raw;
    // a fixed step per frame when the page renders at a crawl (SwiftShader):
    // the replay is about the motion, not about the wall clock
    const step = Math.min(rawDt || 1 / 30, 1 / 15);
    ctx.time.scale = 0;
    this._prevPt = this.pt;
    this.pt += step;
    const pt = this.pt;
    const s = this._s;
    const ai = ctx.peek('ai');
    if (ai?.ground) {
      if (ai.ground.body) ai.ground.body.visible = false;
      if (ai.ground.feet) ai.ground.feet.visible = false;
    }

    for (const c of this._cast) {
      const m = c.m;
      if (this.sample(c.si, pt, s)) {
        m.position.set(s.x, s.y, s.z);
        m.yaw = s.bodyYaw;
        m.targetYaw = s.bodyYaw;
        m.speed = s.speed;
        m.crouch = s.crouch;
        m.health = 100;
        m.suppression = 0;
        m.faceMode = 0;
        const cp = Math.cos(s.pitch);
        m.aimTarget.set(s.x + Math.sin(s.aimYaw) * cp * 12, s.eyeY + Math.sin(s.pitch) * 12, s.z + Math.cos(s.aimYaw) * cp * 12);
        m.aimWeight = 0.95;
        m.group.visible = true;
        m.group.rotation.x = 0;
        m._drive(step);
        if (c.live?.group) c.live.group.visible = false;
      } else if (pt > c.deathT && c.deathT > -Infinity) {
        // he died inside the window
        if (c.live?.group && c.live.alive === false && (c.live.ragdoll || c.live.__ragdoll)) {
          // the real ragdoll lies exactly where he fell
          m.group.visible = false;
          c.live.group.visible = true;
        } else if (c.isPlayer || c.live) {
          // Doug (no ragdoll): fold over where he stood
          const k = Math.min(1, (pt - c.deathT) / 0.55);
          m.group.visible = true;
          m.group.rotation.x = -k * k * 1.45;
          m.group.updateMatrixWorld(true);
        } else m.group.visible = false;
      } else m.group.visible = false;
    }

    // fire events in (prev, pt]
    if (this.fCount) {
      for (let k = 0; k < this.fCount; k++) {
        const i = (this.fHead - k + FCAP) % FCAP;
        const t = this.fT[i];
        if (t <= this._prevPt) break;
        if (t > pt) continue;
        this._spawnTracer(i);
        for (const c of this._cast) if (c.si === this.fSlot[i]) c.m.animator?.fire?.(1);
      }
    }
    this._updateFx(step);
    this._camera(step);
    this._overlayTick();
    if (pt >= this.t1) this.stop(false, false);
  }

  /** Over the killer's right shoulder at his recorded eye, looking down his aim. */
  _camera(dt) {
    const cam = this.ctx.camera;
    const s = this._s;
    const si = this._rec.killerSlot;
    let t = this.pt;
    if (!this.sample(si, t, s)) {
      t = this.lastAliveBefore(si, t);
      if (!this.sample(si, t, s)) return;
    }
    const cp = Math.cos(s.pitch);
    const d = this._fwd.set(Math.sin(s.aimYaw) * cp, Math.sin(s.pitch), Math.cos(s.aimYaw) * cp);
    // right of the aim (agent convention: forward (sin, cos) → right (-cos, sin))
    const rx = -Math.cos(s.aimYaw);
    const rz = Math.sin(s.aimYaw);
    const want = this._v.set(s.x - d.x * 0.62 + rx * 0.34, s.eyeY + 0.1 - d.y * 0.3, s.z - d.z * 0.62 + rz * 0.34);
    const look = this._v2.copy(want).addScaledVector(d, 25);
    const k = this._camSnap ? 1 : 1 - Math.exp(-14 * dt);
    this._camSnap = false;
    this._camPos.lerp(want, k);
    this._camLook.lerp(look, k);
    if (k === 1) {
      this._camPos.copy(want);
      this._camLook.copy(look);
    }
    cam.position.copy(this._camPos);
    cam.lookAt(this._camLook);
    cam.updateMatrixWorld();
  }

  /* ============================================================ overlay */

  _overlay(on) {
    if (on && !this._el) this._buildOverlay();
    if (!this._el) return;
    this._el.style.display = on ? '' : 'none';
    if (!on) return;
    const r = this._rec;
    const weaponName = this._weaponName(r.weapon);
    this._kicker.textContent = r.final ? 'FINAL KILLCAM' : r.survival ? 'DOUG IS DOWN  ·  KILLCAM' : 'KILLCAM';
    this._name.textContent = r.killerName || 'UNKNOWN';
    this._role.textContent = r.killerIsPlayer ? 'ESF  ·  EXTRA SPECIAL FORCES' : `${r.killerRole || 'HOSTILE'}${r.final ? `  ·  KILLED ${r.victimName}` : ''}`;
    this._weapon.textContent = weaponName;
    this._dist.textContent = `${Math.max(1, Math.round(r.distance))} M`;
    this._hs.style.display = r.headshot ? '' : 'none';
    this._line.textContent = this._commandLine(r);
    this._skipEl.textContent = 'SPACE  ·  CLICK  SKIP';
    this._el.classList.toggle('final', r.final);
  }

  _overlayTick() {
    if (!this._bar) return;
    const u = Math.min(1, Math.max(0, (this.pt - this.t0) / Math.max(0.1, this.t1 - this.t0)));
    this._bar.style.transform = `scaleX(${u.toFixed(3)})`;
  }

  _weaponName(id) {
    if (!id) return 'UNKNOWN';
    if (id === 'knife' || id === 'melee') return 'COMBAT KNIFE';
    if (id === 'frag') return 'M67 FRAG';
    const def = this.ctx.peek('weapons')?.states?.get?.(id)?.def;
    if (def?.displayName) return def.displayName;
    return String(id).replace(/^ai_/, '').toUpperCase();
  }

  _commandLine(r) {
    const n = (r.killerSlot * 7 + Math.round(r.t * 10)) >>> 0;
    const pick = (bank) => bank[n % bank.length];
    if (r.final) return pick(r.killerIsPlayer ? LINES.finalDoug : LINES.final);
    if (r.weapon === 'knife' || r.weapon === 'melee') return pick(LINES.knife);
    if (r.weapon === 'frag' || r.weapon === 'semtex' || r.weapon === 'rocket') return pick(LINES.explosive);
    if (r.survival) return pick(LINES.survival);
    if (r.headshot) return pick(LINES.headshot);
    if (r.distance > 45) return pick(LINES.long);
    if (r.distance < 4) return pick(LINES.close);
    return pick(LINES.normal);
  }

  _buildOverlay() {
    let host = null;
    try {
      host = this.ctx.peek('ui')?.root ?? document.body;
    } catch {
      return;
    }
    if (!host) return;
    if (!document.getElementById('fo-killcam-style')) {
      const st = document.createElement('style');
      st.id = 'fo-killcam-style';
      st.textContent = KILLCAM_CSS;
      document.head.appendChild(st);
    }
    const el = (tag, cls, parent, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      parent?.appendChild(e);
      return e;
    };
    const root = (this._el = el('div', 'fo-kc', host));
    el('div', 'fo-kc-bar top', root);
    el('div', 'fo-kc-bar bot', root);
    const tl = el('div', 'fo-kc-tl', root);
    el('i', 'fo-kc-dot', tl);
    this._kicker = el('span', 'fo-kc-kicker', tl, 'KILLCAM');
    const lt = el('div', 'fo-kc-lt', root);
    el('div', 'fo-kc-lbl', lt, 'KILLED BY');
    const row = el('div', 'fo-kc-row', lt);
    this._name = el('b', 'fo-kc-name', row, '');
    this._hs = el('span', 'fo-kc-hs', row, 'HEADSHOT');
    this._role = el('div', 'fo-kc-role', lt, '');
    const meta = el('div', 'fo-kc-meta', lt);
    const w = el('div', 'fo-kc-cell', meta);
    el('span', 'k', w, 'WEAPON');
    this._weapon = el('span', 'v', w, '');
    const d = el('div', 'fo-kc-cell', meta);
    el('span', 'k', d, 'DISTANCE');
    this._dist = el('span', 'v', d, '');
    this._line = el('div', 'fo-kc-line', lt, '');
    const prog = el('div', 'fo-kc-prog', lt);
    this._bar = el('i', null, prog);
    this._skipEl = el('div', 'fo-kc-skip', root, '');
    root.style.display = 'none';
  }

  /* ============================================================ debug */

  /** FLOP.killcam(): replay the last death (or the last kill). */
  replayLast() {
    const rec = this.lastDeath.valid && this.canPlay(this.lastDeath) ? this.lastDeath : this.lastKill;
    if (!this.canPlay(rec)) return false;
    return this.play(rec, { final: false, survival: false, onEnd: null });
  }

  get debugState() {
    return {
      playing: this.playing,
      pending: !!this.pending,
      pt: this.pt,
      t0: this.t0,
      t1: this.t1,
      killer: this._rec.killerName,
      victim: this._rec.victimName,
      weapon: this._rec.weapon,
      final: this._rec.final,
      cast: this._cast.length,
      samples: this.count,
      fires: this.fCount,
      lastDeath: this.lastDeath.valid ? { killer: this.lastDeath.killerName, weapon: this.lastDeath.weapon, t: this.lastDeath.t } : null,
      lastKill: this.lastKill.valid ? { killer: this.lastKill.killerName, victim: this.lastKill.victimName, weapon: this.lastKill.weapon } : null,
    };
  }

  /** The killer's recorded eye at the current replay time (tests). */
  killerEyeNow(out = {}) {
    const s = this._s;
    if (!this.sample(this._rec.killerSlot, this.pt, s)) return null;
    out.x = s.x;
    out.y = s.eyeY;
    out.z = s.z;
    return out;
  }

  dispose() {
    for (const off of this._off ?? []) off();
    try {
      removeEventListener('keydown', this._onKey, true);
      removeEventListener('mousedown', this._onKey, true);
    } catch {
      /* ignore */
    }
    if (this.playing) this.stop(true);
    const ai = this.ctx.peek('ai');
    for (const list of this._pool.values()) for (const m of list) ai?.releaseMannequin?.(m);
    this._pool.clear();
    this._fxRoot?.parent?.remove(this._fxRoot);
    this._tracerGeo?.dispose();
    this._tracerMat?.dispose();
    this._flashMat?.dispose();
    this._glowTex?.dispose();
    this._el?.remove();
  }
}

const KILLCAM_CSS = `
.fo-kc { position:absolute; inset:0; pointer-events:none; z-index:40; font-family: var(--fd, 'Barlow Condensed', sans-serif); color: var(--ink, #f3f1eb); }
.fo-kc-bar { position:absolute; left:0; right:0; height:8.5%; background:#050506; }
.fo-kc-bar.top { top:0; } .fo-kc-bar.bot { bottom:0; }
.fo-kc-tl { position:absolute; top:calc(8.5% + 18px); left:4.2%; display:flex; align-items:center; gap:10px; }
.fo-kc-dot { width:10px; height:10px; border-radius:50%; background:#E4412E; box-shadow:0 0 10px rgba(228,65,46,.8); animation: fo-kc-blink 1s steps(2) infinite; }
@keyframes fo-kc-blink { 50% { opacity:.25; } }
.fo-kc-kicker { font-weight:700; font-size:clamp(14px, 1.6vw, 26px); letter-spacing:.32em; text-shadow:0 1px 2px rgba(0,0,0,.9); }
.fo-kc.final .fo-kc-kicker { color: var(--acc, #E9B64A); }
.fo-kc-lt { position:absolute; left:4.2%; bottom:calc(8.5% + 22px); min-width:min(420px, 46vw); max-width:56vw; padding:12px 18px 12px 16px;
  background:linear-gradient(90deg, rgba(9,10,11,.78), rgba(9,10,11,.42) 80%, rgba(9,10,11,0)); border-left:3px solid #E4412E; }
.fo-kc.final .fo-kc-lt { border-left-color: var(--acc, #E9B64A); }
.fo-kc-lbl { font-size:clamp(10px, .85vw, 13px); letter-spacing:.3em; color: var(--ink-3, #9f9c96); font-weight:600; }
.fo-kc-row { display:flex; align-items:baseline; gap:12px; }
.fo-kc-name { font-weight:700; font-size:clamp(22px, 3vw, 48px); letter-spacing:.03em; line-height:1.05; text-shadow:0 1px 2px rgba(0,0,0,.9); }
.fo-kc-hs { font-weight:700; font-size:clamp(10px, .9vw, 14px); letter-spacing:.2em; color:#120806; background:#E9B64A; padding:2px 7px; transform:translateY(-4px); }
.fo-kc-role { font-size:clamp(11px, 1vw, 15px); letter-spacing:.2em; color: var(--enemy, #F2654F); font-weight:600; margin-top:2px; }
.fo-kc-meta { display:flex; gap:28px; margin-top:8px; }
.fo-kc-cell { display:flex; flex-direction:column; }
.fo-kc-cell .k { font-size:clamp(9px, .75vw, 12px); letter-spacing:.28em; color: var(--ink-3, #9f9c96); font-weight:600; }
.fo-kc-cell .v { font-size:clamp(15px, 1.5vw, 24px); font-weight:600; letter-spacing:.06em; }
.fo-kc-line { margin-top:9px; font-family: var(--ff, Inter, sans-serif); font-size:clamp(11px, .95vw, 15px); color: var(--ink-2, #c4c1ba); font-style:italic; max-width:52vw; }
.fo-kc-prog { margin-top:10px; height:2px; background:rgba(255,255,255,.14); overflow:hidden; }
.fo-kc-prog i { display:block; height:100%; background:#E4412E; transform-origin:0 50%; transform:scaleX(0); }
.fo-kc.final .fo-kc-prog i { background: var(--acc, #E9B64A); }
.fo-kc-skip { position:absolute; right:4.2%; bottom:calc(8.5% + 22px); font-size:clamp(10px, .85vw, 13px); letter-spacing:.28em; color: var(--ink-2, #c4c1ba); font-weight:600; }
`;
