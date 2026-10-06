/**
 * AI — perception and memory.
 *
 * THE RULE: decision code never reads an enemy's live position. Everything a
 * bot knows about another actor lives in a `Rec` in its `Memory`, and a Rec's
 * position is written from the live transform in exactly one place — `look()`,
 * after a field-of-view test AND a line-of-sight raycast to one of the target's
 * body sample points succeeded. Sounds write a *noisy* position (error grows
 * with distance), callouts copy a teammate's (possibly stale) memory, and
 * damage gives a direction. The brain aims at, walks to and searches around
 * `rec.pos`, so a player who breaks line of sight and moves is searched for
 * where he was, not where he is. `ai.selfTest('psychic')` proves it.
 *
 * VISION: range + cone (wider once alert) + LOS to up to three sample points
 * (chest, head, pelvis) through MASK.SIGHT, so walls block and a man crouched
 * behind a low wall shows less of himself (`visFrac`). A new target is only
 * ACQUIRED once `spot` builds to 1: a reaction delay that grows with distance,
 * angle off the bot's facing, low visibility, a still/crouched target and low
 * skill. Rays come out of a per-frame budget shared by every bot (`ai.rays`).
 *
 * HEARING: gunshots (radius scaled by the weapon's `noise`, so a suppressed gun
 * is heard over a third of the distance), explosions, and footsteps of anyone
 * moving fast nearby (crouched or slow movement is silent).
 *
 * CONFIDENCE decays while a target is out of sight; below a floor the Rec is
 * forgotten and the bot goes back to what it was doing.
 */

import * as THREE from 'three';
import { isEnemy } from './teams.js';

const MAX_RECS = 8;

export class Rec {
  constructor() {
    this.actor = null;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this._prev = new THREE.Vector3();
    this._prevT = -Infinity;
    this.seenT = -Infinity; // last successful sight check
    this.heardT = -Infinity;
    this.updT = -Infinity; // last time pos was written, from any source
    this.conf = 0;
    this.visible = false;
    this.visFrac = 0;
    this.spot = 0; // 0..1 reaction build-up
    this.acquired = false; // passed the reaction delay at least once
    this.acquiredT = -Infinity;
    this.lostCalled = false;
    this.source = 'none'; // 'sight' | 'sound' | 'callout' | 'damage'
    this.sightings = 0;
  }

  reset(actor) {
    this.actor = actor;
    this.vel.set(0, 0, 0);
    this._prevT = -Infinity;
    this.seenT = this.heardT = this.updT = this.acquiredT = -Infinity;
    this.conf = 0;
    this.visible = false;
    this.visFrac = 0;
    this.spot = 0;
    this.acquired = false;
    this.lostCalled = false;
    this.source = 'none';
    this.sightings = 0;
  }

  /** Where the target probably is now, extrapolated from what was observed. */
  predict(now, out, maxLead = 0.6) {
    const dt = Math.min(maxLead, Math.max(0, now - this.updT));
    return out.copy(this.pos).addScaledVector(this.vel, dt);
  }
}

export class Memory {
  constructor() {
    this.recs = [];
    for (let i = 0; i < MAX_RECS; i++) this.recs.push(new Rec());
  }

  find(actor) {
    for (let i = 0; i < MAX_RECS; i++) if (this.recs[i].actor === actor) return this.recs[i];
    return null;
  }

  /** The Rec for `actor`, recycling the weakest slot if it is new. */
  touch(actor) {
    let r = this.find(actor);
    if (r) return r;
    let worst = null;
    for (let i = 0; i < MAX_RECS; i++) {
      const c = this.recs[i];
      if (!c.actor) { worst = c; break; }
      if (!worst || c.conf < worst.conf) worst = c;
    }
    worst.reset(actor);
    return worst;
  }

  forget(r) {
    r.reset(null);
  }

  clear() {
    for (let i = 0; i < MAX_RECS; i++) this.recs[i].reset(null);
  }
}

export class Perception {
  constructor(agent) {
    this.agent = agent;
    this.mem = new Memory();
    /** strongest recent unattributed noise: explosions, impacts, a friend's gunfire */
    this.stim = { pos: new THREE.Vector3(), t: -Infinity, strength: 0, kind: 'none' };
    this.alert = 0; // 0 relaxed .. 1 fully alert (widens the cone, speeds reactions)
    this._p = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this.target = null; // best Rec, refreshed each look()
  }

  /**
   * Vision pass. Called at the bot's think rate with the real elapsed time
   * since the last call. The ONLY writer of live positions into memory.
   */
  look(now, dt) {
    const a = this.agent;
    const ai = a.ai;
    const phys = a.phys;
    const eye = this._eye.copy(a.eye);
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const stun = a.stunLevel;
    // blinded: nothing gets in, and what was visible is not any more
    const blind = stun > 0.55;
    const range = a.viewRange * (1 - stun * 0.8);
    const coneCos = a.viewCos - this.alert * 0.3; // 100 deg relaxed .. ~150 deg alert
    const actors = ai.actors;
    for (let i = 0; i < actors.length; i++) {
      const t = actors[i];
      if (!t.alive || !isEnemy(a, t)) continue;
      const p = t.samplePoint(0, this._p);
      const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      let rec = this.mem.find(t);
      if (blind || d2 > range * range) {
        if (rec) rec.visible = false;
        continue;
      }
      const dist = Math.sqrt(d2) || 1e-3;
      const dot = (fx * dx + fz * dz) / Math.hypot(dx, dz || 1e-6);
      // a tracked target is followed through the full alert cone; anything
      // within 3 m is sensed whatever the facing (breathing, footfalls)
      const cone = rec?.acquired && now - rec.seenT < 2 ? -0.35 : coneCos;
      if (dot < cone && dist > 3) {
        if (rec) rec.visible = false;
        continue;
      }
      // LOS: chest first; head and pelvis only if needed (or to grade a hit)
      if (!ai.takeRays(1)) {
        continue; // budget spent: keep last frame's verdict for this pair
      }
      let seen = 0;
      if (!phys || phys.lineOfSight(eye, p, phys.MASK.SIGHT)) seen++;
      if (ai.takeRays(1)) {
        t.samplePoint(1, p);
        if (!phys || phys.lineOfSight(eye, p, phys.MASK.SIGHT)) seen++;
      }
      if (seen === 0 && ai.takeRays(1)) {
        t.samplePoint(2, p);
        if (!phys || phys.lineOfSight(eye, p, phys.MASK.SIGHT)) seen++;
      }
      if (seen === 0) {
        if (rec) rec.visible = false;
        continue;
      }
      if (!rec) rec = this.mem.touch(t);
      this._sighted(rec, t, dist, dot, seen / 2, now, dt);
    }

    this.target = this.best(now);
    return this.target;
  }

  /** A successful sight check on `t`. */
  _sighted(rec, t, dist, dot, visFrac, now, dt) {
    const a = this.agent;
    rec.visible = true;
    rec.visFrac = Math.min(1, visFrac);
    // reaction delay: seconds to acquire, from the classic factors
    const angle = Math.max(0, 1 - dot); // 0 head-on .. 2 behind
    const still = t.speed < 0.4;
    let react = 0.22 + dist * 0.011 + angle * 0.45 + (1 - this.alert) * 0.4;
    react *= 1.45 - 0.9 * a.skill; // skill 0: x1.45, skill 1: x0.55
    react /= 0.45 + 0.55 * rec.visFrac;
    if (t.crouch && still) react *= 1.35;
    if (t.speed > 3) react *= 0.8;
    if (dist < 3) react = Math.min(react, 0.2);
    react /= a.reactionMult;
    rec.spot = Math.min(1, rec.spot + dt / Math.max(0.08, react));
    // the observation itself: live position, velocity by differencing sightings
    t.samplePoint(0, rec.pos);
    if (now - rec._prevT < 1.2 && now > rec._prevT) {
      const k = 1 / (now - rec._prevT);
      const vx = (rec.pos.x - rec._prev.x) * k, vz = (rec.pos.z - rec._prev.z) * k;
      rec.vel.x += (vx - rec.vel.x) * 0.5;
      rec.vel.z += (vz - rec.vel.z) * 0.5;
      rec.vel.y = 0;
    } else rec.vel.set(0, 0, 0);
    rec._prev.copy(rec.pos);
    rec._prevT = now;
    rec.seenT = now;
    rec.updT = now;
    rec.source = 'sight';
    rec.sightings++;
    rec.lostCalled = false;
    if (rec.spot >= 1) {
      if (!rec.acquired) {
        rec.acquired = true;
        rec.acquiredT = now;
        a.onAcquire?.(rec);
      }
      rec.conf = 1;
      this.alert = 1;
    } else {
      // a glimpse: something is there, not yet identified
      rec.conf = Math.max(rec.conf, 0.25 + rec.spot * 0.4);
      this.alert = Math.max(this.alert, 0.5);
    }
    a.ai.audit?.onSight(a, rec);
  }

  /** Confidence decay; called every frame (cheap). */
  decay(now, dt) {
    const recs = this.mem.recs;
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (!r.actor) continue;
      if (!r.actor.alive) {
        this.mem.forget(r);
        continue;
      }
      if (r.visible) continue;
      r.spot = Math.max(0, r.spot - dt * (r.acquired ? 0.25 : 0.5));
      // a target that was fighting us is remembered longer than a noise
      const rate = r.acquired ? 0.055 : 0.11;
      r.conf -= dt * rate;
      if (r.conf <= 0.04) this.mem.forget(r);
    }
    if (this.stim.strength > 0) this.stim.strength = Math.max(0, this.stim.strength - dt * 0.07);
    this.alert = Math.max(0, this.alert - dt * 0.012);
  }

  /** Highest-priority Rec: visible and acquired first, then confidence, then distance. */
  best(now) {
    const a = this.agent;
    let best = null;
    let bestS = -Infinity;
    const recs = this.mem.recs;
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (!r.actor || r.conf <= 0.04) continue;
      const d = Math.hypot(r.pos.x - a.position.x, r.pos.z - a.position.z);
      let s = r.conf * 2 + (r.visible && r.acquired ? 3 : 0) - d * 0.02;
      if (r.actor === a.lastAttacker && now - a.lastHurtT < 3) s += 1.2;
      if (r === this.target) s += 0.4; // don't flip-flop
      if (s > bestS) {
        bestS = s;
        best = r;
      }
    }
    return best;
  }

  /**
   * A sound. `actor` is who made it (null for explosions and impacts),
   * `strength` 0..1 how clearly it was heard. The position written is noisy:
   * the further away, the less a bot can tell where it came from.
   */
  hearFrom(actor, pos, strength, kind, now) {
    const a = this.agent;
    const d = a.position.distanceTo(pos);
    // deterministic direction-finding error: a function of who, where, when
    const h = Math.sin(a.id * 12.9898 + now * 3.7 + d) * 43758.5453;
    const e1 = (h - Math.floor(h)) * 2 - 1;
    const h2 = Math.sin(a.id * 78.233 + now * 1.3) * 12345.678;
    const e2 = (h2 - Math.floor(h2)) * 2 - 1;
    const err = d * (0.1 - strength * 0.06);
    this.alert = Math.max(this.alert, Math.min(1, 0.3 + strength));
    if (actor && isEnemy(a, actor)) {
      const rec = this.mem.touch(actor);
      if (rec.visible) return rec; // already looking at him: the eyes win
      rec.pos.set(pos.x + e1 * err, pos.y, pos.z + e2 * err);
      rec.vel.set(0, 0, 0);
      rec.heardT = now;
      rec.updT = now;
      rec.source = 'sound';
      rec.conf = Math.max(rec.conf, Math.min(0.85, 0.3 + strength * 0.55));
      return rec;
    }
    if (strength >= this.stim.strength * 0.8 || now - this.stim.t > 3) {
      this.stim.pos.set(pos.x + e1 * err, pos.y, pos.z + e2 * err);
      this.stim.t = now;
      this.stim.strength = strength;
      this.stim.kind = kind;
    }
    return null;
  }

  /** A teammate's callout: copy his memory of `actor` (it may be stale). */
  fromCallout(actor, pos, conf, now) {
    if (!actor?.alive) return null;
    const rec = this.mem.touch(actor);
    if (rec.visible || rec.updT > now - 0.5) return rec;
    rec.pos.copy(pos);
    rec.vel.set(0, 0, 0);
    rec.updT = now;
    rec.source = 'callout';
    rec.conf = Math.max(rec.conf, conf * 0.75);
    this.alert = Math.max(this.alert, 0.8);
    return rec;
  }

  /** Being shot: the round's direction says roughly where the shooter is. */
  fromDamage(source, point, dir, now) {
    const a = this.agent;
    this.alert = 1;
    if (source && source.team && isEnemy(a, source) && dir) {
      const rec = this.mem.touch(source);
      if (rec.visible) return;
      const back = Math.min(25, Math.max(6, rec.updT > -Infinity ? rec.pos.distanceTo(a.position) : 14));
      rec.pos.copy(point).addScaledVector(dir, -back);
      rec.pos.y = a.position.y + 1.3;
      rec.updT = now;
      rec.source = 'damage';
      rec.conf = Math.max(rec.conf, 0.6);
      // turning toward where it came from is a reflex, not a decision
      rec.spot = Math.max(rec.spot, 0.35);
    }
  }
}
