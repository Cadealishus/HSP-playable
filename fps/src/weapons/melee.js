import * as THREE from 'three';
import { MELEE_DEF } from './defs.js';
import { buildCombatKnife } from './models/knives.js';

/**
 * QUICK MELEE — the combat knife on V (EXPANSION §10.4).
 *
 * Works with any gun in hand: the gun drops out of frame, the knife hand comes
 * in, cuts, and the gun comes back up (the viewmodel's throwing arm carries the
 * knife; see Viewmodel.setMelee). No weapon switch, no loadout slot.
 *
 *   press V       a swing starts unless one is running, a throw is up or the
 *                 cooldown has not run out; a reload in progress is cancelled
 *                 (the magazine is only committed at `magin`, so nothing is lost)
 *   lunge         a live enemy within `lunge` metres and inside the forward cone
 *                 with a clear line: the player is carried toward him during
 *                 the wind-up and the cut is a forward stab that cannot miss
 *   slash         otherwise: three short rays from the eye (centre, a few degrees
 *                 either side) against hitboxes and the world
 *   damage        `damageBack` (kills) when the attacker is behind the target's
 *                 shoulders, else `damageFront` (two to kill)
 *   events        `damage:dealt { target, amount, part, zone, point, incident,
 *                 melee: true, weapon: 'knife', backstab }` (the AI applies it,
 *                 tags the kill 'knife', ragdolls the body; the UI hitmarks and
 *                 puts a knife in the killfeed), then
 *                 `melee:hit { target, attacker, amount, backstab, point, killed }`
 *   world         a ray that finds a wall instead: a knife clang and sparks
 *
 * `weapons.melee` is this object; `weapons.melee.active` blocks firing, throws
 * and swaps while a swing runs.
 */

const MASK_BITS = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 4) | (1 << 9); // world, props, debris, hitboxes, shoot-only

const _eye = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class Melee {
  constructor(ctx, weapons) {
    this.ctx = ctx;
    this.weapons = weapons;
    this.def = MELEE_DEF;
    this.phase = 'idle';
    this.t = 0;
    this.dur = MELEE_DEF.slash;
    this.lunge = false;
    this.target = null;
    this.struck = false;
    this.cool = 0;
    this.stats = { swings: 0, hits: 0, kills: 0, backstabs: 0, clangs: 0, lunges: 0, last: null };
    this._dmg = {
      target: null, amount: 0, headshot: false, killed: false, part: 'torso', zone: 'torso',
      point: new THREE.Vector3(), incident: new THREE.Vector3(), melee: true, weapon: 'knife', backstab: false,
      ammo: { id: 'knife', armorPen: 1 },
    };
    this._hit = { target: null, attacker: null, amount: 0, backstab: false, point: new THREE.Vector3(), killed: false, weapon: 'knife' };
    this._last = { hit: false, backstab: false, amount: 0, killed: false, world: false, target: null };
  }

  get active() {
    return this.phase !== 'idle';
  }

  /** The knife the hand carries. Called from weapons.init with the shared materials. */
  build(mats, viewmodel, bake = null, rng = null) {
    const { asm } = buildCombatKnife();
    const map = asm.build();
    this._geos = [];
    const g = new THREE.Group();
    g.name = 'ow-knife-hand';
    for (const [key, geo] of map) {
      if (bake) bake(geo, { wear: 1, grime: 1, ao: 1, edgeThreshold: 0.16, rng });
      this._geos.push(geo);
      const m = new THREE.Mesh(geo, mats.get(key));
      m.castShadow = false;
      m.receiveShadow = true;
      g.add(m);
    }
    viewmodel.addThrowItem('knife', g);
    // A hammer grip: the handle across the palm, the blade out past the thumb
    // and index finger, edge forward.
    g.position.set(0.012, -0.03, -0.058);
    g.rotation.set(0, -Math.PI / 2, Math.PI / 2);
    this.item = g;
  }

  /** Start a swing. Returns true if one started. */
  request() {
    if (this.active || this.cool > 0) return false;
    const w = this.weapons;
    if (w.equipment?.throwing || w.switching) return false;
    w.cancelReload?.();
    if (w.inspecting) w.viewmodel.stopClip();
    this.target = this._lungeTarget();
    this.lunge = !!this.target;
    this.dur = this.lunge ? this.def.lungeTime : this.def.slash;
    this.phase = 'swing';
    this.t = 0;
    this.struck = false;
    this.cool = this.def.cooldown;
    this.stats.swings++;
    if (this.lunge) this.stats.lunges++;
    w.sfx?.swing(1, this.lunge);
    return true;
  }

  update(dt, input, live) {
    if (this.cool > 0) this.cool -= dt;
    if (live && input.actionPressed('melee')) this.request();
    if (!this.active) return;
    this.t += dt;
    const k = this.t / this.dur;
    // Close the gap during the wind-up: carried toward him, never through him.
    if (this.lunge && !this.struck && this.target?.alive) this._carry(dt);
    if (!this.struck && k >= this.def.hitAt) {
      this.struck = true;
      this._strike();
    }
    this.weapons.viewmodel.setMelee(Math.min(1, k), this.lunge);
    if (k >= 1) {
      this.phase = 'idle';
      this.target = null;
      this.weapons.viewmodel.setThrow('idle', 0, null, 0, false);
    }
  }

  /* -------------------------------------------------------------------- */

  _eyeFwd() {
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    _eye.copy(cam.position);
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
  }

  /** Torso point of an agent. */
  _chest(a, out) {
    return out.set(a.position.x, a.position.y + 1.25 * (a.scale ?? 1), a.position.z);
  }

  _enemy(a) {
    if (!a?.alive || a.isPlayer) return false;
    if (a.team === 'civ') return false;
    // FFA (src/ai/teams.js): every bot is fair game; otherwise not your own side.
    const ai = this.ctx.peek('ai');
    const rel = typeof ai?.relation === 'function' ? ai.relation() : ai?.relation;
    if (rel === 'ffa') return true;
    return a.team !== 'esf';
  }

  /** The enemy to lunge at: nearest inside `lunge` m, the cone and a clear line. */
  _lungeTarget() {
    const ai = this.ctx.peek('ai');
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    this._eyeFwd();
    let best = null;
    let bestD = this.def.lunge;
    for (const a of ai?.agents ?? []) {
      if (!this._enemy(a)) continue;
      this._chest(a, _v);
      _dir.copy(_v).sub(_eye);
      const d = _dir.length();
      if (d > bestD || d < 1e-3) continue;
      _dir.divideScalar(d);
      if (_dir.dot(_fwd) < this.def.lungeCone) continue;
      if (phys?.lineOfSight && !phys.lineOfSight(_eye, _v, phys.MASK?.SIGHT)) continue;
      best = a;
      bestD = d;
    }
    return best;
  }

  _carry(dt) {
    const p = this.weapons.player ?? this.ctx.peek('player');
    const c = p?.character;
    if (!c?.move) return;
    const a = this.target;
    const feet = p.feetPosition ?? c.position;
    const dx = a.position.x - feet.x;
    const dz = a.position.z - feet.z;
    const d = Math.hypot(dx, dz);
    const stop = 0.85 + (a.radius ?? 0.34);
    if (d <= stop) return;
    const step = Math.min(d - stop, 7.5 * dt);
    c.move((dx / d) * step, 0, (dz / d) * step);
  }

  _strike() {
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    this._eyeFwd();
    const L = this._last;
    L.hit = L.backstab = L.killed = L.world = false;
    L.amount = 0;
    L.target = null;
    // A lunge always connects with the man it lunged at (if he is still in reach).
    if (this.lunge && this.target?.alive) {
      const a = this.target;
      this._chest(a, _v);
      if (_v.distanceTo(_eye) < this.def.lunge + 0.8) {
        _dir.copy(_v).sub(_eye).normalize();
        this._wound(a, 'torso', _v.addScaledVector(_dir, -0.18), _dir);
        return;
      }
    }
    if (!phys?.raycast) return;
    // Slash: centre, then 7 degrees either side.
    let world = null;
    for (let i = 0; i < 3; i++) {
      _dir.copy(_fwd);
      if (i > 0) {
        _q.setFromAxisAngle(_up, (i === 1 ? 1 : -1) * 0.12);
        _dir.applyQuaternion(_q);
      }
      const hit = phys.raycast(_eye, _dir, this.def.reach, MASK_BITS);
      if (!hit?.hit) continue;
      const a = hit.actor;
      if (a && this._enemy(a) && typeof a.applyDamage === 'function') {
        this._wound(a, hit.part ?? 'torso', _v.copy(hit.point), _dir);
        return;
      }
      if (!a && !world) {
        world = this._worldHit ?? (this._worldHit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), surface: 'concrete' });
        world.point.copy(hit.point);
        world.normal.copy(hit.normal);
        world.surface = hit.surface ?? 'concrete';
      }
    }
    if (world) {
      // Steel on the wall.
      L.world = true;
      this.stats.clangs++;
      this.weapons.sfx?.clang(world.point, world.surface, 1);
      this.ctx.peek('audio')?.play?.('impact', world.point, { surface: world.surface, energy: 0.35 });
      this.weapons.equipment?._sparks?.(world.point, world.normal, world.surface === 'metal' ? 10 : 5);
      this.weapons.player?.addKick?.(0.006, 0.004, 0.01);
      this.weapons.player?.addTrauma?.(0.08);
    }
  }

  /** Is the attacker (the camera) behind `a`'s shoulders? */
  _isBehind(a) {
    const yaw = a.yaw ?? 0;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = a.position.x - _eye.x;
    const dz = a.position.z - _eye.z;
    const d = Math.hypot(dx, dz) || 1;
    // attacker -> target along the target's own facing = we are at his back
    return (dx * fx + dz * fz) / d > this.def.backDot;
  }

  _wound(a, part, point, dir) {
    const backstab = this._isBehind(a);
    const amount = backstab ? this.def.damageBack : this.def.damageFront;
    const e = this._dmg;
    e.target = a;
    e.amount = amount;
    e.headshot = false;
    e.killed = false;
    e.part = part === 'head' ? 'head' : 'torso';
    e.zone = e.part;
    e.point.copy(point);
    e.incident.copy(dir);
    e.backstab = backstab;
    this.ctx.events.emit('damage:dealt', e);
    const killed = !!e.killed || !a.alive;
    const h = this._hit;
    h.target = a;
    h.attacker = this.ctx.peek('player') ?? 'player';
    h.amount = amount;
    h.backstab = backstab;
    h.point.copy(point);
    h.killed = killed;
    this.ctx.events.emit('melee:hit', h);
    this.stats.hits++;
    if (backstab) this.stats.backstabs++;
    if (killed) this.stats.kills++;
    const L = this._last;
    L.hit = true;
    L.backstab = backstab;
    L.amount = amount;
    L.killed = killed;
    L.target = a;
    this.stats.last = L;
    this.weapons.sfx?.stab(point, 1.2);
    this.ctx.peek('fx')?.bloodSpatterBehind?.(point, dir);
    this.weapons.player?.addKick?.(0.01, 0, 0.012);
  }

  /** Test hook: put the next swing on `agent` directly (no input). */
  debugSwing() {
    this.cool = 0;
    return this.request();
  }

  dispose() {
    for (const g of this._geos ?? []) g.dispose();
    this.item?.removeFromParent();
  }
}
