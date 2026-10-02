/**
 * AI — civilians, hostages, VIPs (EXPANSION.md §7).
 *
 * A Civilian is an Agent on team 'civ' with no weapon and no combat brain: the
 * same body, skeleton, character controller, hit capsules and ragdoll death,
 * re-dressed in plain clothes (civbody.js). Nobody targets civilians; rounds
 * that hit one anyway (the player's, a bot's, a blast) emit
 * `civilian:hit { civ, killer, killerTeam, amount, killed }` and missions
 * decide what that costs.
 *
 * behaviour:
 *   'cower'    crouched, hands over the head; flinches at nearby shots
 *   'flee'     runs to `opts.to` (with pathing), then cowers there
 *   'hostage'  stands where placed, hands up; held by `opts.captor` as a
 *              human shield (the captor drives the hostage's position). When
 *              the captor dies the hostage is released and cowers.
 *   'follow'   follows `opts.target` (an actor, an id, or 'player') at a few
 *              metres with pathing: escort / VIP
 */

import * as THREE from 'three';
import { Agent } from './agent.js';

export class Civilian extends Agent {
  constructor(ai, opts = {}) {
    super(ai, { ...opts, team: 'civ', role: 'rifleman' });
    this.isCivilian = true;
    this.behavior = opts.behavior ?? 'cower';
    this.to = opts.to ? new THREE.Vector3().copy(opts.to) : null;
    this.followTarget = opts.target ?? null;
    this.captor = null;
    this.released = false;
    this.variantDisplay = 'CIVILIAN';
    this.ammo = 0;
    this.hasGrenade = false;
    this.viewRange = 0;
    this._fleeFrom = new THREE.Vector3();
    this._hasFleeFrom = false;
    this._flinchT = -Infinity;
    this._cv = new THREE.Vector3();
  }

  /** Being shot at nearby: flinch (and a fleeing man runs harder). */
  suppress(amount) {
    if (!this.alive) return;
    this.suppression = Math.min(1.6, this.suppression + amount);
    const now = this.ctx.time.elapsed;
    if (now - this._flinchT > 0.6) {
      this._flinchT = now;
      this.animator.hit('torso', 1, Math.min(1, 0.4 + amount));
    }
  }

  /** Hearing a shot: a cowering civilian flinches; nothing else changes. */
  hear(pos, loudness) {
    if (!this.alive) return;
    const d = this.position.distanceTo(pos);
    if (d > loudness) return;
    if (d < loudness * 0.5) this.suppress(0.15);
    if (!this.to && this.behavior === 'flee') {
      this._fleeFrom.copy(pos);
      this._hasFleeFrom = true;
    }
  }

  applyDamage(amount, part, point, dir, blast = null, source = null) {
    if (!this.alive) return;
    super.applyDamage(amount, part, point, dir, blast, source);
    const k = source;
    this.ctx.events.emit('civilian:hit', {
      civ: this,
      killer: k?.isPlayer ? k.system ?? this.ctx.peek('player') ?? 'player' : k ?? null,
      killerTeam: k?.team ?? null,
      killerIsPlayer: !!k?.isPlayer,
      amount,
      killed: !this.alive,
      point,
    });
  }

  /** Captor down (or let go): the hostage is free and cowers where he stands. */
  release() {
    if (this.released) return;
    this.released = true;
    if (this.captor && this.captor.holding === this) this.captor.holding = null;
    this.captor = null;
    this.behavior = 'cower';
    this.ctx.events.emit('civilian:released', { civ: this });
  }

  update(dt, ctx) {
    if (!this.alive) return;
    const now = ctx.time.elapsed;
    this.stateTime += dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.5);
    if (this._stun > 0) this._stun = Math.max(0, this._stun - dt * this._stunRate);
    if (this.pathPending) this._goTo(this._pendingDest);
    this.wantFire = false;
    this.aimWeight = 0;
    this.faceMode = 0;
    this.thinkTimer -= dt;
    const think = this.thinkTimer <= 0;
    if (think) this.thinkTimer = 0.25;
    const an = this.animator;
    switch (this.behavior) {
      case 'hostage': {
        if (this.captor && !this.captor.alive) this.release();
        an.armPose = 'handsUp';
        this.crouch = false;
        this.stopMove();
        this.state = 'hostage';
        if (this.captor) {
          // the captor puts us where he wants us: his _holdHostage drives this
          this.faceYaw(this.captor.yaw);
        }
        break;
      }
      case 'flee': {
        this.state = 'flee';
        an.armPose = 'down';
        this.crouch = false;
        if (think) {
          if (this.to) {
            if (this.distTo(this.to) < 1.5 || this.moveFailed) {
              this.behavior = 'cower';
              this.stopMove();
            } else this.moveTo(this.to, 4.6);
          } else if (this._hasFleeFrom) {
            const away = this._cv.copy(this.position).sub(this._fleeFrom).setY(0).normalize().multiplyScalar(14).add(this.position);
            if (this.ai.snapWalkable(away, this.position.y, this._cv, 6)) this.moveTo(this._cv, 4.6);
            this._hasFleeFrom = false;
          }
        }
        break;
      }
      case 'follow': {
        this.state = 'follow';
        an.armPose = 'down';
        this.crouch = this.suppression > 0.6;
        const t = this.ai.getActor(this.followTarget);
        if (think && t?.alive) {
          const d = this.distTo(t.position);
          if (d > 3) {
            this.ai.snapWalkable(t.position, t.position.y, this._cv, 4);
            this.moveTo(this._cv, d > 7 ? 4.2 : 1.9);
          } else if (d < 2) this.stopMove();
        }
        if (t && !this.isMoving()) this.face(t.position);
        break;
      }
      default: {
        // cower
        this.state = 'cower';
        this.stopMove();
        this.crouch = true;
        an.armPose = this.suppression > 0.25 || this._stun > 0.2 ? 'cower' : 'handsUp';
        break;
      }
    }
    this._move(dt);
    this._drive(dt);
  }
}

