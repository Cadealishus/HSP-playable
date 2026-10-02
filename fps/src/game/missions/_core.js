import * as THREE from 'three';
import { DIFFICULTY, normaliseLoadout } from '../session.js';
import { snapToNav } from '../modes/mapdata.js';
import { missionCaps } from '../missions.js';

export { missionCaps };

/**
 * SPECIAL OPERATIONS — the mission chassis (docs/EXPANSION.md §8).
 *
 * A mission is a mode (§4) the host runs like any other: init / start /
 * update / orderFor / hudState / onDeath / onPlayerDeath / isOver / summary /
 * dispose. A concrete mission (underground.js, flight717.js, hostage.js)
 * subclasses MissionMode and supplies three things in `build()`:
 *
 *   encounters  { name: { members: [{ at, yaw, role, weapon, order, … }], … } }
 *               squads spawned on demand by `ensure(name)`, idempotent, through
 *               the real AI (`ai.spawn` with team / role / weapon / skill)
 *   objectives  an ORDERED list of { id, text, marker, start, update, complete,
 *               restore, checkpoint } evaluated one at a time
 *   intro       Command's opening lines
 *
 * NEVER IN VIEW. Every spawn goes through `_visible()`: the camera frustum plus
 * a physics line of sight to the spawn's head and waist. A member whose spot is
 * in view waits in the queue until it is not (spawn points are authored behind
 * doors, inside the train, around corners, so in practice this rarely waits).
 *
 * The rest is shared: trigger volumes (Box3 or { pos, r, h }), hold-F
 * interactions, the objective HUD line and waypoint (hudState → the UI's mode
 * HUD), a paced radio queue onto `mode:announce`, civilians and the fail rules,
 * checkpoints (a failed run can retry from the last one: the host re-creates the
 * mode and `init` resumes from the module-level RETRY record), the debrief
 * (time, kills, accuracy, civilians, a rank and Command's summary), and the
 * `window.FLOP.mission` debug hooks the headless tests drive.
 *
 * Performance: everything per-frame reuses preallocated vectors and records;
 * squads spawn only when their objective (or the one before it) comes up; at
 * most one AI spawn per frame.
 */

/** Player eye height above the feet, standing. */
const EYE = 1.66;
/** localStorage: 'issue' (the mission's kit) or 'own' (the LOADOUT screen's). */
export const KIT_KEY = 'flopops.missionKit';

/** The retry-from-checkpoint record, consumed by the next init of the same mission. */
let RETRY = null;

export function missionKitChoice() {
  try {
    return localStorage.getItem(KIT_KEY) === 'own' ? 'own' : 'issue';
  } catch {
    return 'issue';
  }
}

/**
 * Objective builders. `at` / `vol` may be an anchor name (resolved against
 * world.anchors and the mission's own `points` at run time), a Box3, a
 * Vector3, a { pos, yaw } or { pos, r, h }.
 */
const resolve = (m, a) => (typeof a === 'string' ? m.anchorSpot(a) ?? m.anchors?.[a] : typeof a === 'function' ? a(m) : a);
const rawVol = (m, v) => (typeof v === 'string' ? m.points?.[v] ?? m.anchors?.[v] : typeof v === 'function' ? v(m) : v);
const centre = (v) => (v?.isBox3 ? v.getCenter(new THREE.Vector3()).setY(v.min.y + 0.5) : v?.pos ?? v);

export const obj = {
  /** Get Doug into a volume. */
  reach(id, text, vol, extra = {}) {
    let mk = null;
    return {
      id,
      text,
      markerName: 'GO',
      marker: (m) => (mk ??= extra.at ? centre(resolve(m, extra.at)) : centre(rawVol(m, vol))),
      update: (m) => m.inside(rawVol(m, vol)),
      skip: (m) => {
        const c = centre(rawVol(m, vol));
        if (c) m.teleport({ pos: c, yaw: 0 });
      },
      ...extra,
    };
  },
  /** Every member of a squad down (the squad is ensured when this starts). */
  clear(id, text, group, extra = {}) {
    return {
      id,
      text,
      spawn: [group],
      markerName: 'CLEAR',
      // the waypoint sits on the nearest live member of the squad
      marker: (m) => m.nearestOf(group),
      sub: (m) => `HOSTILES REMAINING  ${m.groupAlive(group)}`,
      update: (m) => m.groupClear(group),
      skip: (m) => m.killGroup(group),
      ...extra,
    };
  },
  /** Hold F at a point. */
  interact(id, text, at, seconds, prompt, extra = {}) {
    return {
      id,
      text,
      markerName: 'USE',
      marker: (m) => resolve(m, at)?.pos ?? resolve(m, at),
      update: (m, dt) => m.holdInteract(resolve(m, at), seconds, prompt, 'HOLD F', extra.r ?? 1.8, dt),
      ...extra,
    };
  },
  /** One tagged hostile down. */
  kill(id, text, tag, extra = {}) {
    return {
      id,
      text,
      markerName: 'KILL',
      marker: (m) => m.tagged.get(tag)?.position ?? null,
      update: (m) => m._ensuredTag(tag) && !m.tagged.get(tag),
      skip: (m) => m._debug.kill(tag),
      ...extra,
    };
  },
};

const GRADES = [
  { min: 92, id: 'S', label: 'EXTRA SPECIAL' },
  { min: 80, id: 'A', label: 'SPECIAL' },
  { min: 65, id: 'B', label: 'ADEQUATE' },
  { min: 45, id: 'C', label: 'PRESENT' },
  { min: 0, id: 'D', label: 'ADMINISTRATIVE' },
];

export class MissionMode {
  static id = 'mission';
  static label = 'SPECIAL OPERATION';
  static teams = ['esf', 'hostile'];
  static respawn = false;
  /** Par time in seconds (rank). */
  static par = 600;
  /** Civilian hits before Command calls it (0 = off). */
  static civLimit = 3;
  /** The mission's issued kit (weapons/defs ids). */
  static loadout = { primary: 'carbine', secondary: 'pistol', lethal: 'frag', tactical: 'flash' };

  init(ctx, session, host = null) {
    const C = this.constructor;
    this.ctx = ctx;
    this.session = session ?? {};
    this.host = host;
    this.world = ctx.peek('world');
    this.anchors = this.world?.anchors ?? {};
    this.rng = ctx.rng.fork();
    this.caps = missionCaps(ctx);
    this.skill = (DIFFICULTY[this.session.difficulty] ?? DIFFICULTY.regular).skill;

    this.t = 0;
    this.started = false;
    this.result = null;
    this._overAt = 0;
    this.index = -1;
    this.cur = null;
    this.objT = 0;
    this.checkpoint = -1;
    this.stats = { kills: 0, headshots: 0, civHits: 0, civKills: 0, deaths: 0, retries: 0, priorTime: 0 };

    this.player = { isPlayer: true, team: 'esf', name: 'DOUG', alive: true, kills: 0, deaths: 0 };
    this.slots = []; // the host's spectator reads this; missions do not spectate

    /** agent -> { group, order, tag } */
    this._recs = new Map();
    /** group name -> { spawned, alive, total, queued, alerted } */
    this.groups = new Map();
    this._queue = [];
    this._ensured = new Set();
    this.civs = new Map(); // tag -> civilian
    this._civRecs = new Map(); // civilian -> { tag, vip }
    this.tagged = new Map(); // tag -> agent
    this._everTagged = new Set();

    this._radioQ = [];
    this._radioWait = 0;

    // preallocated scratch
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._m4 = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
    this._sphere = new THREE.Sphere();
    this._prompt = { key: 'F', text: '', sub: '', progress: 0 };
    this._hold = 0;
    this._marker = { pos: new THREE.Vector3(), label: '', name: '', color: '#E9B64A', lift: 1.6 };
    this._marker2 = { pos: new THREE.Vector3(), label: 'VIP', name: 'ESCORT', color: '#A9C6DC', lift: 2.1 };
    this._objList = [];
    this._hud = {
      mode: 'mission',
      mission: C.id,
      label: C.label,
      scoreEsf: 0,
      scoreHostile: 0,
      limit: 1,
      timeLeft: 0,
      objectives: this._objList,
      objective: { index: 0, total: 0, text: '', sub: '', id: '' },
      round: null,
      message: null,
      playerTeam: 'esf',
      respawnIn: 0,
      killer: null,
      spectating: false,
      spectateName: null,
      prompt: null,
      alive: { esf: 1, hostile: 0 },
      teamSize: 1,
      kills: 0,
      deaths: 0,
      civHits: 0,
      civLimit: C.civLimit,
      elapsed: 0,
    };

    const def = this.build();
    this.encounters = def.encounters ?? {};
    this.objectives = def.objectives ?? [];
    this.intro = def.intro ?? [];
    this._hud.objective.total = this.objectives.length;

    // Retry from a checkpoint (the host re-creates the mode on REMATCH).
    this._resumeAt = 0;
    const r = RETRY;
    RETRY = null;
    if (r && r.mission === C.id && host?.state === 'over' && r.index > 0 && r.index < this.objectives.length) {
      this._resumeAt = r.index;
      Object.assign(this.stats, r.stats);
      this.stats.retries += 1;
    }

    this._offs = [];
    const on = (type, fn) => this._offs.push(ctx.events.on(type, fn));
    on('civilian:hit', (e) => this._onCivHit(e));
    on('damage:dealt', (e) => this._onDamage(e));
    this._installDebug();
    return this;
  }

  /** Subclasses return { encounters, objectives, intro }. */
  build() {
    return { encounters: {}, objectives: [] };
  }

  /* ================================================================ lifecycle */

  start() {
    const C = this.constructor;
    this.started = true;
    this.host?.clearAI?.();
    const kit = missionKitChoice() === 'own' ? normaliseLoadout(this.session.loadout) : normaliseLoadout(C.loadout);
    this.loadoutUsed = kit;
    this.host?.applyLoadout?.(kit);

    let spot = this.startSpot();
    if (this._resumeAt > 0) {
      for (let i = 0; i < this._resumeAt; i++) this.objectives[i].restore?.(this);
      spot = this._checkpointSpot(this._resumeAt) ?? spot;
    }
    this.host?.respawnPlayer?.(spot?.pos ?? null, spot?.yaw ?? 0, EYE);
    this.onStart?.();
    if (this._resumeAt > 0) {
      this.say('Resuming from the last checkpoint. Command has removed the previous attempt from the record.', 'Thanks.');
    } else {
      for (const [text, reply, speaker] of this.intro) this.say(text, reply, speaker);
    }
    this._advance(this._resumeAt);
    console.info(`[mission:${C.id}] deployed (${this.session.difficulty}, kit ${missionKitChoice()}${this._resumeAt ? `, checkpoint ${this._resumeAt}` : ''})`);
  }

  /** Where Doug starts. Subclasses override; { pos, yaw } in world space. */
  startSpot() {
    return null;
  }

  _checkpointSpot(i) {
    const o = this.objectives[i];
    const cp = typeof o?.checkpoint === 'function' ? o.checkpoint(this) : o?.checkpoint;
    return cp && cp.pos ? cp : null;
  }

  dispose() {
    for (const off of this._offs ?? []) off?.();
    this._offs = [];
    this._recs.clear();
    this.tagged.clear();
    this._queue.length = 0;
    this._despawnCivs();
    try {
      if (window.FLOP && window.FLOP.mission === this._debug) delete window.FLOP.mission;
    } catch {
      /* no window */
    }
  }

  /* ================================================================== update */

  update(dt) {
    if (!this.started) return;
    this.t += dt;
    this._tickRadio(dt);
    if (this.result) return;

    this._tickQueue();
    this._tickActors();
    this._tickCivs();
    if (this.result) return;

    const o = this.cur;
    if (o) {
      this.objT += dt;
      let done = false;
      try {
        done = o.update ? !!o.update(this, dt) : false;
      } catch (err) {
        console.warn(`[mission] objective ${o.id} threw`, err);
      }
      if (done && !this.result) this._complete();
    }
    this.tick?.(dt);
  }

  _advance(i) {
    this.index = i;
    this._hold = 0;
    this.objT = 0;
    if (i >= this.objectives.length) {
      this.cur = null;
      this.succeed();
      return;
    }
    const o = (this.cur = this.objectives[i]);
    if (o.checkpoint && i > 0) {
      this.checkpoint = i;
    }
    for (const g of o.spawn ?? []) this.ensure(g);
    try {
      o.start?.(this);
    } catch (err) {
      console.warn(`[mission] objective ${o.id} start threw`, err);
    }
    const n = `OBJECTIVE ${i + 1}/${this.objectives.length}`;
    if (o.banner !== false) this.host?.announce?.('', { kind: 'objective', banner: { title: o.text, sub: n, kind: 'info' } });
    console.info(`[mission:${this.constructor.id}] objective ${i + 1}: ${o.id} — ${o.text}`);
  }

  _complete() {
    const o = this.cur;
    try {
      o.complete?.(this);
    } catch (err) {
      console.warn(`[mission] objective ${o.id} complete threw`, err);
    }
    this._advance(this.index + 1);
  }

  /** Debug: finish the current objective as if its condition were met. */
  skip() {
    if (!this.cur || this.result) return null;
    const id = this.cur.id;
    this.cur.skip?.(this);
    this._complete();
    return id;
  }

  succeed() {
    if (this.result) return;
    this.result = { winner: 'esf', reason: 'complete' };
    this._overAt = this.t + 3;
    this.onSuccess?.();
  }

  fail(reason, line = null, reply = null) {
    if (this.result) return;
    this.result = { winner: 'hostile', reason };
    this._overAt = this.t + 3.2;
    if (line) this.say(line, reply, 'command', 5);
    if (this.checkpoint > 0) {
      RETRY = {
        mission: this.constructor.id,
        index: this.checkpoint,
        stats: { ...this.stats, priorTime: this.stats.priorTime + this.t },
      };
    }
    this.host?.playerDown?.({ respawn: false });
    console.info(`[mission:${this.constructor.id}] FAILED — ${reason} (objective ${this.index + 1})`);
  }

  isOver() {
    return this.result && this.t >= this._overAt ? this.result : null;
  }

  /* ============================================================== encounters */

  /**
   * Queue a squad (idempotent). Member: { at: Vector3 | {pos,yaw}, yaw?,
   * variant?, role?, weapon?, name?, tag?, order?: { kind, pos?, radius? },
   * holding?: civilian tag, leader? }.
   */
  ensure(name) {
    if (this._ensured.has(name)) return false;
    const enc = this.encounters[name];
    if (!enc) return false;
    this._ensured.add(name);
    const members = typeof enc.members === 'function' ? enc.members(this) : enc.members;
    const g = this._group(name);
    for (const m of members) {
      g.queued++;
      g.total++;
      this._queue.push({ group: name, def: m, waitedFrames: 0 });
    }
    enc.onEnsure?.(this);
    return true;
  }

  _group(name) {
    let g = this.groups.get(name);
    if (!g) {
      g = { spawned: 0, alive: 0, total: 0, queued: 0, alerted: false, killed: 0 };
      this.groups.set(name, g);
    }
    return g;
  }

  /** True once every member of the group has spawned and died. */
  groupClear(name) {
    const g = this.groups.get(name);
    return !!g && g.total > 0 && g.queued === 0 && g.alive === 0;
  }

  groupAlive(name) {
    const g = this.groups.get(name);
    return g ? g.alive + g.queued : 0;
  }

  _tickQueue() {
    if (!this._queue.length) return;
    const ai = this.ctx.peek('ai');
    if (!ai?.spawn) return;
    // One spawn per frame, first spot that is out of view.
    for (let i = 0; i < this._queue.length; i++) {
      const q = this._queue[i];
      const spot = this._resolveSpot(q.def.at, this._v3);
      if (!spot) {
        this._queue.splice(i, 1);
        this._group(q.group).queued--;
        continue;
      }
      if (this._visible(spot)) {
        q.waitedFrames++;
        continue;
      }
      this._queue.splice(i, 1);
      this._spawnMember(q, spot);
      return;
    }
  }

  _resolveSpot(at, out) {
    const p = at?.pos ?? at;
    if (!p || !Number.isFinite(p.x)) return null;
    return out.set(p.x, p.y, p.z);
  }

  /**
   * Can Doug see this floor point? Frustum (with a body-sized sphere) plus a
   * line of sight from the camera to the head or the waist. Anything closer
   * than 5 m counts as seen whatever the walls say (he would hear it).
   */
  _visible(p) {
    const cam = this.ctx.camera;
    const head = this._v.set(p.x, p.y + 1.6, p.z);
    const d = cam.position.distanceTo(head);
    if (d < 5) return true;
    if (d > 110) return false;
    cam.updateMatrixWorld();
    this._m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m4);
    this._sphere.center.set(p.x, p.y + 0.9, p.z);
    this._sphere.radius = 1.1;
    if (!this._frustum.intersectsSphere(this._sphere)) return false;
    const phys = this.ctx.peek('physics');
    if (typeof phys?.lineOfSight !== 'function') return true;
    if (phys.lineOfSight(cam.position, head)) return true;
    return phys.lineOfSight(cam.position, this._v2.set(p.x, p.y + 0.6, p.z));
  }

  _spawnMember(q, spot) {
    const ai = this.ctx.peek('ai');
    const def = q.def;
    const g = this._group(q.group);
    g.queued--;
    const pos = new THREE.Vector3().copy(spot);
    if (def.snap !== false) snapToNav(this.ctx, pos, 3);
    const yaw = def.at?.yaw ?? def.yaw ?? 0;
    const opts = { team: 'hostile', skill: def.skill ?? this.skill };
    if (def.role) opts.role = def.role;
    if (def.weapon) opts.weapon = def.weapon;
    if (def.name) opts.name = def.name;
    if (def.holding) {
      const civ = this.civs.get(def.holding);
      if (civ) opts.holding = civ;
    }
    let a = null;
    try {
      // Agents face (sin, cos); authored yaws are the camera convention.
      a = ai.spawn(def.variant ?? null, pos, yaw + Math.PI, opts);
    } catch (err) {
      console.warn('[mission] spawn failed', err);
    }
    if (!a) return null;
    a.setDifficulty?.(opts.skill);
    if (a.team !== 'hostile') {
      try {
        a.team = 'hostile';
      } catch {
        /* AI-owned */
      }
    }
    if (def.name && a.name !== def.name) a.name = def.name;
    const o = def.order ?? { kind: 'hunt' };
    const order = {
      kind: o.kind ?? 'hunt',
      pos: Array.isArray(o.pos) ? o.pos : o.pos ? new THREE.Vector3().copy(o.pos.pos ?? o.pos) : pos.clone(),
      radius: o.radius ?? 3,
      targetId: null,
    };
    // Two order records per agent, swapped (not mutated) on alert, so the AI's
    // brain sees a new order object and re-plans.
    const alertOrder = { kind: def.alert === 'attack' ? 'attack' : 'hunt', pos: new THREE.Vector3().copy(pos), radius: 4, targetId: null };
    const rec = { group: q.group, order, alertOrder, tag: def.tag ?? null, alertKind: def.alert ?? 'hunt', def };
    this._recs.set(a, rec);
    if (def.tag) {
      this.tagged.set(def.tag, a);
      this._everTagged.add(def.tag);
    }
    g.spawned++;
    g.alive++;
    if (g.alerted) this._alertRec(rec);
    return a;
  }

  /** Position of the live member of `group` nearest Doug (a live reference), or null. */
  nearestOf(group) {
    const p = this.playerPos();
    let best = null;
    let bd = Infinity;
    for (const [a, rec] of this._recs) {
      if (rec.group !== group || a.alive === false || !a.position) continue;
      const d = p ? (a.position.x - p.x) ** 2 + (a.position.z - p.z) ** 2 + (a.position.y - p.y) ** 2 : 0;
      if (d < bd) {
        bd = d;
        best = a.position;
      }
    }
    return best;
  }

  /** True once an agent with this tag has spawned (it may since have died). */
  _ensuredTag(tag) {
    return this._everTagged.has(tag);
  }

  /** The order a mission agent is following (the host installs this provider). */
  orderFor(agent) {
    const r = this._recs.get(agent);
    return r ? r.order : null;
  }

  /** Wake a whole group: holders become hunters (or attack Doug's position). */
  alert(name) {
    const g = this._group(name);
    if (g.alerted) return;
    g.alerted = true;
    for (const rec of this._recs.values()) if (rec.group === name) this._alertRec(rec);
  }

  _alertRec(rec) {
    if (rec.alertKind === 'stay' || rec.order === rec.alertOrder) return;
    if (rec.order.kind === 'hunt') return; // already hunting
    if (rec.alertOrder.kind === 'attack') {
      const pp = this.playerPos();
      if (pp) rec.alertOrder.pos.copy(pp);
    }
    rec.order = rec.alertOrder;
  }

  _onDamage(e) {
    if (!e?.target || this.result) return;
    const rec = this._recs.get(e.target);
    if (rec) this.alert(rec.group);
  }

  /** Agents can vanish without a death event (a debug clear); count them. */
  _tickActors() {
    for (const [a, rec] of this._recs) {
      if (a.alive === false) this._retire(a, rec, null, false);
    }
  }

  _retire(a, rec, e, headshot) {
    this._recs.delete(a);
    const g = this._group(rec.group);
    g.alive = Math.max(0, g.alive - 1);
    g.killed++;
    if (rec.tag && this.tagged.get(rec.tag) === a) this.tagged.delete(rec.tag);
    if (e) {
      const k = e.killer;
      const byPlayer = k === 'player' || k?.isPlayer === true || k === this.ctx.peek('player') || (!k && !e.killerTeam) || e.killerTeam === 'esf';
      if (byPlayer) {
        this.stats.kills++;
        this.player.kills++;
        if (headshot) this.stats.headshots++;
      }
    }
    this.alert(rec.group);
    this.onKill?.(rec, a, e);
  }

  /** `actor:death` (forwarded by the host, with the resolved headshot flag). */
  onDeath(e, headshot = false) {
    const a = e?.actor;
    if (!a) return;
    const rec = this._recs.get(a);
    if (rec) {
      this._retire(a, rec, e, headshot || e.headshot === true);
      return;
    }
    const cr = this._civRecs.get(a);
    if (cr) this._civDown(a, cr, e);
  }

  /** Kill every live member of a group THROUGH the damage path (debug/tests). */
  killGroup(name) {
    let n = 0;
    for (const [a, rec] of [...this._recs]) {
      if (name && rec.group !== name) continue;
      if (!a.alive) continue;
      this._lethal(a);
      n++;
    }
    return n;
  }

  _lethal(a, headshot = false) {
    // Doug's round, as the AI's own damage listener sees it. Flagged synthetic
    // so the host does not count it as a hit for accuracy.
    const h = this.host;
    if (h) h._synthDamage = true;
    try {
      this.ctx.events.emit('damage:dealt', {
        target: a,
        amount: 1e6,
        headshot,
        killed: false,
        point: a.position,
        source: this.ctx.peek('player'),
      });
    } finally {
      if (h) h._synthDamage = false;
    }
  }

  /* ================================================================ civilians */

  /**
   * A civilian through the AI (§7): behavior 'cower' | 'flee' | 'hostage' |
   * 'follow'. Returns null when the AI has no civilians (the menu does not
   * offer missions that need them in that build).
   */
  spawnCivilian(tag, at, opts = {}) {
    const ai = this.ctx.peek('ai');
    if (typeof ai?.spawnCivilian !== 'function') return null;
    const p = at?.pos ?? at;
    const yaw = at?.yaw ?? opts.yaw ?? 0;
    let c = null;
    try {
      c = ai.spawnCivilian(new THREE.Vector3().copy(p), yaw + Math.PI, { ...opts, name: opts.name ?? tag });
    } catch (err) {
      console.warn('[mission] spawnCivilian failed', err);
    }
    if (!c) return null;
    this.civs.set(tag, c);
    this._civRecs.set(c, { tag, vip: !!opts.vip, down: false });
    return c;
  }

  /** Change a civilian's behaviour (follow for the escort). */
  setCivBehavior(civ, behavior, opts = {}) {
    if (!civ) return false;
    if (civ.isCivilian && typeof civ.behavior === 'string' && typeof civ.setBehavior !== 'function') {
      // src/ai/civilian.js: behaviour and its parameters are plain fields
      if (behavior !== 'hostage' && civ.captor) civ.release?.();
      civ.behavior = behavior;
      if (opts.target !== undefined) civ.followTarget = opts.target;
      if (opts.to) civ.to = opts.to.clone?.() ?? opts.to;
      return true;
    }
    if (typeof civ.setBehavior === 'function') {
      civ.setBehavior(behavior, opts);
      return true;
    }
    const ai = this.ctx.peek('ai');
    if (typeof ai?.setCivilianBehavior === 'function') {
      ai.setCivilianBehavior(civ, behavior, opts);
      return true;
    }
    return false;
  }

  _despawnCivs() {
    // ai.despawnAll (the host's clearAI) takes the civilians with it; an AI
    // with a per-civilian despawn gets asked directly.
    const ai = this.ctx.peek('ai');
    for (const c of this.civs.values()) {
      try {
        if (typeof ai?.despawnCivilian === 'function') ai.despawnCivilian(c);
      } catch {
        /* already gone */
      }
    }
    this.civs.clear();
    this._civRecs.clear();
  }

  _onCivHit(e) {
    if (this.result || !e?.civ) return;
    const k = e.killer ?? e.source ?? null;
    const byPlayer = !k || k === 'player' || k?.isPlayer === true || k === this.ctx.peek('player');
    if (!byPlayer) return;
    const cr = this._civRecs.get(e.civ);
    this.stats.civHits++;
    this.onCivHit?.(e.civ, cr);
    const C = this.constructor;
    if (C.civLimit && this.stats.civHits >= C.civLimit) {
      this.fail('civilians', 'Doug, Command. That is too many civilians. Command is ending the operation before the paperwork ends Command.', 'Understood.');
    } else if (cr?.vip) {
      this.say('Doug, that was the VIP. Command would like him returned with the original number of holes.', 'Noted.');
    } else {
      this.say(`Check your fire. Civilian hit, ${this.stats.civHits} of ${C.civLimit}. Command is counting.`, 'Sorry.');
    }
  }

  _tickCivs() {
    for (const [c, cr] of this._civRecs) {
      if (!cr.down && c.alive === false) this._civDown(c, cr, null);
    }
  }

  _civDown(c, cr, e) {
    if (cr.down) return;
    cr.down = true;
    const k = e?.killer;
    const byPlayer = k === 'player' || k?.isPlayer === true || k === this.ctx.peek('player');
    if (byPlayer) this.stats.civKills++;
    if (this.result) return;
    if (cr.vip) {
      this.fail('vip', 'The VIP is down. Command is listing the operation as "not a success", pending a better phrase.', '...');
      return;
    }
    if (byPlayer) {
      this.fail('civilians', 'Doug, you have shot a civilian. ESF does not do that. Command is pulling you out.', 'Understood.');
      return;
    }
    this.onCivLost?.(c, cr);
  }

  /* ================================================================== helpers */

  playerPos() {
    const p = this.ctx.peek('player');
    const pos = p?.position;
    return pos && Number.isFinite(pos.x) ? pos : null;
  }

  /**
   * Is Doug inside the volume? Box3 (contains his waist), { pos, r, h }
   * (cylinder, h = vertical tolerance), or an anchor { pos, yaw } with r.
   */
  inside(vol, p = this.playerPos(), r = 2.5) {
    if (!vol || !p) return false;
    if (vol.isBox3) {
      this._v.set(p.x, p.y + 0.9, p.z);
      return vol.containsPoint(this._v);
    }
    const c = vol.pos ?? vol;
    const rr = vol.r ?? vol.radius ?? r;
    const h = vol.h ?? 2.6;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    return dx * dx + dz * dz <= rr * rr && Math.abs(p.y - c.y) <= h;
  }

  /** Box3 in world space from two corners. */
  box(x0, y0, z0, x1, y1, z1) {
    return new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)));
  }

  /** Is the use key (F) held? */
  useHeld() {
    const inp = this.ctx.input;
    return !!(inp && inp.enabled !== false && !inp.frozen && inp.action?.('use'));
  }

  /**
   * Hold-F interaction at `at` (anchor or Vector3). Returns true once the hold
   * completes. Sets the prompt while Doug is in range.
   */
  holdInteract(at, seconds, text, sub = 'HOLD F', r = 1.8, dt = 0) {
    const c = at?.pos ?? at;
    const p = this.playerPos();
    this._promptOn = false;
    if (!c || !p) return false;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (dx * dx + dz * dz > r * r || Math.abs(p.y - c.y) > 2.2) {
      this._hold = 0;
      return false;
    }
    if (this.useHeld()) this._hold += dt / seconds;
    else this._hold = Math.max(0, this._hold - dt * 2);
    this._promptOn = true;
    this._prompt.text = text;
    this._prompt.sub = sub;
    this._prompt.progress = Math.min(1, this._hold);
    return this._hold >= 1;
  }

  /** Command (or another speaker) on the net, paced so lines never stomp. */
  say(text, reply = null, speaker = 'command', tier = 3) {
    if (!text) return;
    this._radioQ.push({ text, reply, speaker, tier });
  }

  _tickRadio(dt) {
    this._radioWait -= dt;
    if (this._radioWait > 0 || !this._radioQ.length) return;
    const l = this._radioQ.shift();
    this.host?.announce?.(l.text, { kind: l.tier >= 5 ? 'result' : 'info', reply: l.reply, speaker: l.speaker });
    this._radioWait = lineLife(l.text) + (l.reply ? 0.3 + lineLife(l.reply) : 0) + 0.4;
  }

  /** Doug to the anchor/point (debug + checkpoints). */
  teleport(at) {
    const spot = typeof at === 'string' ? this.anchorSpot(at) : at;
    const p = spot?.pos ?? spot;
    if (!p) return false;
    const pl = this.ctx.peek('player');
    if (!pl?.teleport) return false;
    const phys = this.ctx.peek('physics');
    const gy = phys?.groundHeight?.(p.x, p.z, p.y + 2.5);
    const feet = Number.isFinite(gy) && Math.abs(gy - p.y) < 2.5 ? gy + 0.03 : p.y;
    pl.teleport({ x: p.x, y: feet + EYE, z: p.z }, spot?.yaw ?? pl.yaw ?? 0);
    return true;
  }

  /** A named anchor as { pos, yaw }: world.anchors first, then the mission's own. */
  anchorSpot(name) {
    const own = this.points?.[name];
    const a = own ?? this.anchors?.[name];
    if (!a) return null;
    if (a.isVector3) return { pos: a, yaw: 0 };
    if (a.isBox3) {
      // converted once (hudState asks every frame)
      const c = this._boxSpots ?? (this._boxSpots = new Map());
      let r = c.get(a);
      if (!r) c.set(a, (r = { pos: a.getCenter(new THREE.Vector3()).setY(a.min.y + 0.5), yaw: 0 }));
      return r;
    }
    if (a.pos) return a;
    return null;
  }

  /* ===================================================================== HUD */

  hudState() {
    const h = this._hud;
    const o = this.cur;
    h.objective.index = Math.min(this.index, this.objectives.length - 1);
    h.objective.id = o?.id ?? '';
    h.objective.text = this.result ? (this.result.winner === 'esf' ? 'MISSION COMPLETE' : 'MISSION FAILED') : o?.text ?? '';
    // the sub line is a built string: refresh it four times a second, not per frame
    if (this.result || !o?.sub) h.objective.sub = '';
    else if (this.t - (this._subT ?? -1) >= 0.25 || this._subFor !== o) {
      this._subT = this.t;
      this._subFor = o;
      h.objective.sub = o.sub(this) ?? '';
    }
    h.scoreEsf = Math.max(0, this.index);
    h.scoreHostile = this.objectives.length;
    h.kills = this.stats.kills;
    h.deaths = this.stats.deaths;
    h.civHits = this.stats.civHits;
    h.elapsed = this.stats.priorTime + this.t;
    h.playerAlive = this.player.alive;
    h.prompt = this._promptOn && !this.result ? this._prompt : null;
    // waypoint + escort marker
    const list = this._objList;
    list.length = 0;
    if (o && !this.result) {
      const mk = typeof o.marker === 'function' ? o.marker(this) : o.marker;
      const p = mk?.pos ?? mk;
      if (p && Number.isFinite(p.x)) {
        this._marker.pos.copy(p);
        this._marker.label = o.markerLabel ?? '';
        this._marker.name = o.markerName ?? 'OBJECTIVE';
        list.push(this._marker);
      }
      const esc = o.escort ? o.escort(this) : null;
      if (esc && esc.alive !== false && esc.position) {
        this._marker2.pos.copy(esc.position);
        list.push(this._marker2);
      }
    }
    return h;
  }

  /* ================================================================== debrief */

  onPlayerDeath() {
    if (!this.player.alive) return;
    this.player.alive = false;
    this.player.deaths++;
    this.stats.deaths++;
    this.fail('kia', this.pick(KIA_LINES), null);
  }

  pick(list) {
    return list[Math.floor(this.rng.float() * list.length) % list.length];
  }

  grade() {
    const C = this.constructor;
    const s = this.stats;
    const time = s.priorTime + this.t;
    let score = 100;
    score -= Math.max(0, (time - C.par) / C.par) * 30;
    score -= s.civHits * 12 + s.civKills * 30;
    score -= s.retries * 10;
    const acc = this.host?._accuracy?.();
    if (acc != null) score += (acc - 0.35) * 25;
    if (this.result?.winner !== 'esf') score = Math.min(score, 30);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const g = GRADES.find((x) => score >= x.min) ?? GRADES[GRADES.length - 1];
    return { score, ...g };
  }

  /** Command's three-line summary. Subclasses add a mission-specific one. */
  debriefLines(g) {
    const s = this.stats;
    const won = this.result?.winner === 'esf';
    const lines = [];
    if (won) lines.push(this.successLine?.(g) ?? 'Operation complete. Command is taking the credit, as discussed.');
    else lines.push(this.failLine?.(this.result?.reason) ?? FAIL_REASON[this.result?.reason] ?? 'The operation did not complete. Command has reclassified it as a rehearsal.');
    if (s.civHits === 0 && s.civKills === 0) lines.push(`${s.kills} hostiles neutralised and no civilians harmed. Command has framed the second number.`);
    else lines.push(`${s.kills} hostiles neutralised and ${s.civHits} civilian ${s.civHits === 1 ? 'incident' : 'incidents'}. Legal has been told to clear its week.`);
    lines.push(GRADE_LINE[g.id]);
    return lines;
  }

  summary() {
    const C = this.constructor;
    const g = this.grade();
    const won = this.result?.winner === 'esf';
    const time = Math.round(this.stats.priorTime + this.t);
    const canRetry = !won && this.checkpoint > 0;
    return {
      mode: 'mission',
      kind: 'mission',
      mission: C.id,
      label: C.label,
      winner: this.result?.winner ?? null,
      reason: this.result?.reason ?? null,
      result: won ? 'complete' : 'failed',
      scoreEsf: Math.min(this.index, this.objectives.length),
      scoreHostile: this.objectives.length,
      limit: this.objectives.length,
      objectivesDone: Math.min(this.index, this.objectives.length),
      objectivesTotal: this.objectives.length,
      failedAt: won ? null : this.cur?.text ?? null,
      kills: this.stats.kills,
      headshots: this.stats.headshots,
      deaths: this.stats.deaths,
      civHits: this.stats.civHits,
      civKills: this.stats.civKills,
      retries: this.stats.retries,
      durationS: time,
      timeS: time,
      par: C.par,
      grade: g.id,
      gradeLabel: g.label,
      gradeScore: g.score,
      debrief: this.debriefLines(g),
      retryLabel: canRetry ? 'RETRY FROM CHECKPOINT' : 'REPLAY MISSION',
      checkpoint: canRetry ? this.checkpoint : null,
      map: this.session.map,
      difficulty: this.session.difficulty,
      loadout: this.loadoutUsed ?? null,
    };
  }

  aliveCount(team) {
    if (team === 'hostile') {
      let n = 0;
      for (const g of this.groups.values()) n += g.alive;
      return n;
    }
    return this.player.alive ? 1 : 0;
  }

  interact() {
    return false;
  }

  /* ==================================================================== debug */

  _installDebug() {
    const self = this;
    this._debug = {
      get state() {
        return self.debugState();
      },
      /** Complete the current objective (dev). */
      skip: () => self.skip(),
      /** Doug to a named anchor (world.anchors or the mission's points) or {x,y,z}. */
      teleport: (a) => self.teleport(typeof a === 'string' ? a : a?.pos ? a : a ? { pos: new THREE.Vector3(a.x, a.y, a.z), yaw: a.yaw ?? 0 } : null),
      /** Kill a group (or every mission hostile) through the real damage path. */
      killGroup: (name) => self.killGroup(name ?? null),
      /** Kill one tagged agent (e.g. 'leader'), optionally as a headshot. */
      kill: (tag, head = true) => {
        const a = self.tagged.get(tag);
        if (!a || !a.alive) return false;
        self._lethal(a, head);
        return true;
      },
      /** Fire a synthetic civilian hit from Doug (fail-rule tests). */
      hitCivilian: (tag) => {
        const c = tag ? self.civs.get(tag) : self.civs.values().next().value;
        if (!c) return false;
        self.ctx.events.emit('civilian:hit', { civ: c, killer: self.ctx.peek('player') });
        return true;
      },
      /** Points of interest for tests: every anchor/point the mission names. */
      point: (name) => {
        const s = self.anchorSpot(name);
        return s ? { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw ?? 0 } : null;
      },
      civ: (tag) => {
        const c = self.civs.get(tag);
        return c ? { alive: c.alive !== false, x: c.position?.x, y: c.position?.y, z: c.position?.z, behavior: c.behavior ?? null } : null;
      },
      agent: (tag) => {
        const a = self.tagged.get(tag);
        return a ? { alive: a.alive !== false, x: a.position.x, y: a.position.y, z: a.position.z, name: a.name } : null;
      },
      fail: (reason = 'debug') => self.fail(reason),
      get mode() {
        return self;
      },
    };
    try {
      if (window.FLOP) window.FLOP.mission = this._debug;
    } catch {
      /* no window */
    }
  }

  debugState() {
    const groups = {};
    for (const [k, g] of this.groups) groups[k] = { spawned: g.spawned, alive: g.alive, queued: g.queued, total: g.total, killed: g.killed, alerted: g.alerted };
    const civs = {};
    for (const [k, c] of this.civs) civs[k] = { alive: c.alive !== false };
    return {
      mission: this.constructor.id,
      started: this.started,
      index: this.index,
      total: this.objectives.length,
      objective: this.cur?.id ?? null,
      text: this.cur?.text ?? null,
      objectives: this.objectives.map((o) => o.id),
      checkpoint: this.checkpoint,
      resumedAt: this._resumeAt,
      result: this.result,
      over: !!this.isOver(),
      t: +this.t.toFixed(2),
      stats: { ...this.stats },
      groups,
      civs,
      queue: this._queue.length,
      prompt: this._promptOn ? this._prompt.text : null,
      caps: this.caps,
      power: this.power ?? null,
      alarm: this.alarm ?? null,
    };
  }
}

function lineLife(text) {
  let words = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 32) words++;
  return Math.min(7, Math.max(1.6, 1.1 + words * 0.3));
}

const KIA_LINES = [
  'Doug is down. Command is updating his status from "operational" to "resting".',
  "We've lost Doug. Command would like it noted that this was not in the plan, which is new.",
  'Doug, Command. Doug? Command is going to assume that is a no.',
];

const FAIL_REASON = {
  kia: 'Doug was killed in action. Command has filed this under "temporary setbacks".',
  vip: 'The VIP did not survive the rescue. Command is drafting an apology to whoever he was.',
  civilians: 'Too many civilians were harmed. Command has asked that Doug look at things before shooting them.',
  debug: 'The operation was called off from above. Command does not know who is above Command.',
};

const GRADE_LINE = {
  S: 'Rank: EXTRA SPECIAL. Command has nothing to add and has added it anyway.',
  A: 'Rank: SPECIAL. Command is recommending Doug for a commendation and a nap.',
  B: 'Rank: ADEQUATE. Within ESF tolerances, which have been widened for the occasion.',
  C: 'Rank: PRESENT. Doug attended the operation. Attendance has been recorded.',
  D: 'Rank: ADMINISTRATIVE. Command will be in touch about the forms.',
};
