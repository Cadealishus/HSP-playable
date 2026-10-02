/**
 * AI — the brain: utility-scored state selection, the behaviour of each state,
 * and the tactical execution of mode orders.
 *
 * DECISIONS run at the bot's think rate (5-10 Hz close to the fight, 1-3 Hz far
 * from it, staggered). Every candidate state is scored from the bot's OWN
 * picture of the world — its memory (perception.js), its health, ammo,
 * suppression, cover, its role and its order — and the best one wins, with
 * hysteresis and minimum dwell times so a bot commits to what it chose.
 *
 *   IDLE          nothing to do: stand a post, look around
 *   PATROL        walk a route: the order's, its own, or the hunt sweep
 *   SUSPICIOUS    half-seen / half-heard something: stop, turn, weapon up
 *   INVESTIGATE   walk carefully to where the noise was
 *   SEARCH        lost a target: go to the last-known position, then check
 *                 the likely spots around it while confidence decays
 *   ENGAGE        target in sight: shoot from where you are (pushers close in)
 *   CHASE         target just broke contact: run after him (aggressive roles)
 *   TAKE_COVER    get to cover that actually blocks the threat, hide, reload
 *   PEEK          lean out of that cover, fire a burst, duck back
 *   FLANK         with the squad's flank token: go round the side
 *   RETREAT       hurt and outgunned: fall back to cover further away
 *   RELOAD        change magazines (in cover when there is any)
 *   SUPPRESSED    rounds cracking past: head down
 *   EVADE_GRENADE a live grenade nearby: run
 *
 * The cover loop falls out of the scores: take cover -> reload -> peek ->
 * burst -> return -> (after a few peeks, or once the cover is flanked)
 * reposition.
 */

import * as THREE from 'three';

export const S = Object.freeze({
  IDLE: 'idle',
  PATROL: 'patrol',
  SUSPICIOUS: 'suspicious',
  INVESTIGATE: 'investigate',
  SEARCH: 'search',
  ENGAGE: 'engage',
  CHASE: 'chase',
  TAKE_COVER: 'take_cover',
  PEEK: 'peek',
  FLANK: 'flank',
  RETREAT: 'retreat',
  RELOAD: 'reload',
  SUPPRESSED: 'suppressed',
  EVADE_GRENADE: 'evade_grenade',
  HOSTAGE: 'hold_hostage',
  DEAD: 'dead',
});

const ALL = [
  S.IDLE, S.PATROL, S.SUSPICIOUS, S.INVESTIGATE, S.SEARCH, S.ENGAGE, S.CHASE,
  S.TAKE_COVER, S.PEEK, S.FLANK, S.RETREAT, S.RELOAD, S.SUPPRESSED, S.EVADE_GRENADE,
];

/** Seconds a state holds before a rival needs a clear margin to take over. */
const DWELL = {
  idle: 0.5, patrol: 1, suspicious: 1.2, investigate: 1.5, search: 2, engage: 0.8, chase: 1.5,
  take_cover: 1.2, peek: 0.7, flank: 3, retreat: 2, reload: 0.5, suppressed: 1, evade_grenade: 0.8,
};

const SPEED = { walk: 1.45, careful: 1.9, tactical: 2.7, run: 4.3, sprint: 5.1 };

export class Brain {
  constructor(agent) {
    this.a = agent;
    this.state = S.IDLE;
    this.stateT = 0; // elapsed time at entry
    this.prev = S.IDLE;
    this.scores = {};
    for (const k of ALL) this.scores[k] = 0;
    this.order = null;
    this._orderT = -Infinity;
    this.orderProvided = false;
    /** set by a commander: go flank / throw a grenade */
    this.flankOrder = -Infinity;
    this.grenadeOrder = -Infinity;
    // per-state working memory
    this.dest = new THREE.Vector3();
    this.hasDest = false;
    this.peekCount = 0;
    this.maxPeeks = 3;
    this.hideUntil = 0;
    this.peekUntil = 0;
    this.searchPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.searchN = 0;
    this.searchI = 0;
    this.searchPhase = 0;
    this.lookUntil = 0;
    this.flankPt = new THREE.Vector3();
    this.evadePt = new THREE.Vector3();
    this.huntPt = new THREE.Vector3();
    this.huntUntil = -Infinity;
    this.hasHunt = false;
    this.patrolIndex = 0;
    this.lastRetreat = -Infinity;
    this.lastCoverFail = -Infinity;
    this.slot = new THREE.Vector3();
    this.slotT = -Infinity;
    this.hasSlot = false;
    this.interactT = -Infinity;
    this.noContactT = 0;
    this._shotsHere = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._threat = new THREE.Vector3();
    this.grenade = null; // the grenade we are evading
  }

  get now() {
    return this.a.ctx.time.elapsed;
  }

  /* ================================================================== */
  /* orders                                                             */
  /* ================================================================== */

  refreshOrder(now) {
    const ai = this.a.ai;
    if (now - this._orderT < 0.5) return;
    this._orderT = now;
    const fn = ai.orderProvider;
    let o = null;
    if (fn) {
      try {
        o = fn(this.a) ?? null;
      } catch (err) {
        if (!ai._orderErr) {
          ai._orderErr = true;
          console.warn('[ai] order provider threw:', err?.message ?? err);
        }
      }
    }
    this.orderProvided = !!fn;
    if (o !== this.order) {
      const changed = !o || !this.order || o.kind !== this.order.kind || !samePos(o.pos, this.order.pos);
      this.order = o;
      if (changed) {
        this.hasSlot = false;
        this.hasHunt = false;
        this.patrolIndex = 0;
      }
    }
  }

  /** Zone centre + leash radius for orders that tie a bot to a place, or null. */
  leash() {
    const o = this.order;
    if (!o || !o.pos || Array.isArray(o.pos)) return null;
    const r = o.radius ?? 4;
    switch (o.kind) {
      case 'capture': return r + 7;
      case 'defend': return r + 12;
      case 'hold': return Math.max(4, r + 2);
      case 'plant':
      case 'defuse': return r + 9;
      default: return null;
    }
  }

  /** Is world point `p` within this bot's leash (true with no leash)? */
  inLeash(p, extra = 0) {
    const L = this.leash();
    if (L === null) return true;
    const o = this.order.pos;
    return Math.hypot(p.x - o.x, p.z - o.z) <= L + extra;
  }

  /* ================================================================== */
  /* decision                                                           */
  /* ================================================================== */

  think(now) {
    const a = this.a;
    const P = a.perception;
    this.refreshOrder(now);
    const T = P.target;
    const role = a.roleDef;
    const aggr = a.aggression;
    const vis = !!(T && T.visible && T.acquired);
    const known = !!(T && T.conf > 0.2);
    const dist = T ? Math.hypot(T.pos.x - a.position.x, T.pos.z - a.position.z) : Infinity;
    const since = T ? now - T.seenT : Infinity;
    const hp = a.health / a.maxHealth;
    const ammo = a.ammo / Math.max(1, a.magSize);
    const supp = a.suppression;
    const inCover = a.inCover();
    const threat = a.ai.grenadeThreat(a);
    const stun = a.stunLevel;
    const leashed = this.leash() !== null;
    const sc = this.scores;
    for (const k of ALL) sc[k] = 0;

    if (known) this.noContactT = now;

    // ---- emergencies
    if (threat) sc.evade_grenade = 5;
    if (a.ammo <= 0) sc.reload = 1.3;
    else if (ammo < 0.35 && !vis) sc.reload = 0.6;
    else if (ammo < 0.7 && !known && a.roleDef.id !== 'rocket') sc.reload = 0.3;
    if (supp > 1.05 && (inCover || !vis)) sc.suppressed = 0.85 + (supp - 1) * 0.5;
    if (stun > 0.3) sc.suppressed = Math.max(sc.suppressed, 0.5 + stun * 0.5) * (a.cover ? 1 : 0.7);

    // ---- combat
    if (known) {
      const coverOK = now - this.lastCoverFail > 3 && !!a.ai.cover;
      if (vis) {
        sc.engage = 0.62 + (dist < role.range[1] ? 0.1 : 0) + (role.pushes ? 0.12 : 0) + aggr * 0.08;
        if (dist < role.range[0] && (role.id === 'sniper' || role.id === 'rocket')) sc.engage -= 0.3;
        if (stun > 0.3) sc.engage *= 0.6;
      }
      if (coverOK && T.conf > 0.4) {
        sc.take_cover = 0.5 + (vis ? 0.12 : 0) + (1 - hp) * 0.3 + Math.min(1, supp) * 0.3 - aggr * 0.28 +
          (inCover ? 0.2 : 0) + (role.id === 'lmg' || role.id === 'sniper' ? 0.12 : 0);
        if (role.pushes && dist < role.range[2]) sc.take_cover -= 0.15;
      }
      if (inCover && T.conf > 0.35 && now >= this.hideUntil && this.state === S.TAKE_COVER) {
        sc.peek = 0.9;
      }
      if (this.state === S.PEEK && now < this.peekUntil) sc.peek = 1.0;
      // flank: the squad hands out tokens; a commander can order one
      const sq = a.squad;
      const ordered = now - this.flankOrder < 3;
      if (sq && T.acquired && dist > 9 && dist < 55 && (ordered || sq.canFlank(a)) && !leashed) {
        const staticT = Math.hypot(T.vel.x, T.vel.z) < 0.6;
        sc.flank = (ordered ? 0.95 : 0.2 + aggr * 0.35 + (staticT ? 0.1 : 0) + role.decision * 0.3) *
          (this.state === S.FLANK ? 1 : this._flankRoll(now));
      }
      if (this.state === S.FLANK && this.hasDest) sc.flank = Math.max(sc.flank, 0.8);
      if (T.acquired && !vis && since < 5 && T.conf > 0.45 && (role.pushes || aggr > 0.62)) {
        sc.chase = 0.5 + aggr * 0.25 - (hp < 0.4 ? 0.3 : 0);
      }
      if (T.acquired && !vis && since > 1.2 && T.conf > 0.1) sc.search = 0.42 + (this.state === S.SEARCH ? 0.1 : 0);
      if (!T.acquired && T.conf > 0.22) {
        if (T.spot > 0.1 && T.visible) sc.suspicious = 0.55;
        else sc.investigate = 0.4 + T.conf * 0.2;
      }
      if (hp < 0.35 && now - this.lastRetreat > 10 && dist < role.range[1] * 1.4) sc.retreat = 0.72 - aggr * 0.3;
      if (role.id === 'sniper' && vis && dist < 12) sc.retreat = Math.max(sc.retreat, 0.75);
      if (role.id === 'rocket' && known && dist < 9) sc.retreat = Math.max(sc.retreat, 0.8);
      if (a.wasHurtRecently(1.2) && !vis && coverOK) sc.take_cover = Math.max(sc.take_cover, 0.8);
      // marksmen relocate after a few shots from one spot, or once found
      if (role.relocates && (a.shotsFired - this._shotsHere >= 3 || (a.wasHurtRecently(0.8) && now - this.lastRetreat > 4))) {
        sc.retreat = Math.max(sc.retreat, 0.95);
      }
      // breachers indoors (hemmed-in nav cells) push even harder
      if (role.indoor && a.ai.enclosedAt(a.position) && vis) sc.engage += 0.15;
    }

    // ---- sounds and suspicion
    const st = P.stim;
    if (st.strength > 0.12 && now - st.t < 8) {
      if (now - st.t < 1.5 && this.state !== S.INVESTIGATE) sc.suspicious = Math.max(sc.suspicious, 0.5);
      sc.investigate = Math.max(sc.investigate, 0.34 + st.strength * 0.2);
    }

    // ---- peacetime
    sc.patrol = 0.25;
    sc.idle = 0.05;
    // a zone order is a job: stand in it / hold it before chasing noises
    if (this.order && !known && this._orderNeedsMove()) sc.patrol = 0.5;

    // ---- order leash: no wandering off the objective
    if (leashed && T) {
      if (!this.inLeash(T.pos, 6)) {
        sc.chase = 0;
        sc.search *= 0.3;
        sc.investigate *= 0.3;
      }
    }
    if (leashed && st.strength > 0 && !this.inLeash(st.pos, 4)) sc.investigate *= 0.2;

    // ---- pick, with hysteresis
    let best = this.state;
    let bestS = (sc[this.state] ?? 0) + 0.15;
    const dwelling = now - this.stateT < (DWELL[this.state] ?? 0.5);
    for (const k of ALL) {
      const v = sc[k];
      if (v <= bestS) continue;
      if (dwelling && v < (sc[this.state] ?? 0) + 0.45 && k !== S.EVADE_GRENADE) continue;
      best = k;
      bestS = v;
    }
    if (best !== this.state) this.enter(best, now);
    this.run(now, T, vis, dist);
  }

  /** Deterministic per-bot flank appetite that changes every few seconds. */
  _flankRoll(now) {
    const k = Math.floor(now / 4) + this.a.id * 7;
    const h = Math.sin(k * 12.9898) * 43758.5453;
    return h - Math.floor(h) < 0.35 ? 1 : 0.2;
  }

  _orderNeedsMove() {
    const o = this.order;
    if (!o) return false;
    if (o.kind === 'hunt' || o.kind === 'patrol' || o.kind === 'escort' || o.kind === 'attack') return true;
    if (!o.pos || Array.isArray(o.pos)) return false;
    const r = (o.radius ?? 3) * (o.kind === 'hold' ? 0.4 : 0.85);
    return Math.hypot(this.a.position.x - o.pos.x, this.a.position.z - o.pos.z) > r;
  }

  enter(s, now) {
    const a = this.a;
    const was = this.state;
    this.exit(was, s);
    this.prev = was;
    this.state = s;
    this.stateT = now;
    a.state = s;
    a.stateTime = 0;
    this.hasDest = false;
    switch (s) {
      case S.TAKE_COVER:
        if (was !== S.PEEK) {
          this.peekCount = 0;
          this.maxPeeks = 2 + (a.id % 3);
          this._pickCover(now, false);
        }
        this.hideUntil = now + 0.5 + a.rng.float() * 1.2;
        break;
      case S.PEEK:
        this.peekUntil = now + 1.1 + a.rng.float() * 1.4;
        this.peekCount++;
        if (a.cover) {
          const T = a.perception.target;
          if (T) {
            a.ai.cover.peekOffset(a.cover, T.pos, a.eyeHeight, this._v2);
            this.dest.copy(this._v2);
            this.hasDest = true;
          }
        }
        break;
      case S.SEARCH:
        this.searchPhase = 0;
        this.searchN = 0;
        this.searchI = 0;
        a.callout('lost');
        break;
      case S.FLANK:
        if (!this._planFlank(now)) {
          this.lastCoverFail = now;
          this.state = S.ENGAGE;
          a.state = S.ENGAGE;
        } else a.radio('flank');
        break;
      case S.RETREAT:
        this.lastRetreat = now;
        this._shotsHere = a.shotsFired;
        this._pickCover(now, true);
        a.callout('help');
        break;
      case S.RELOAD:
        a.startReload();
        break;
      case S.EVADE_GRENADE:
        this._planEvade();
        break;
      case S.ENGAGE:
      case S.CHASE:
        break;
      default:
        break;
    }
  }

  exit(s, next) {
    const a = this.a;
    if (s === S.FLANK) a.squad?.releaseFlank(a);
    if (s === S.PEEK) a.squad?.releasePeek(a);
    if (s === S.TAKE_COVER && next !== S.PEEK && next !== S.RELOAD && next !== S.SUPPRESSED) {
      // leaving the cover loop for good: give the spot back
      if (next !== S.ENGAGE) {
        a.cover = null;
        a.ai.cover?.release(a.id);
      }
    }
  }

  /* ================================================================== */
  /* behaviour                                                          */
  /* ================================================================== */

  run(now, T, vis, dist) {
    const a = this.a;
    const role = a.roleDef;
    a.wantFire = false;
    a.faceMode = 0;
    switch (this.state) {
      case S.IDLE: {
        a.stopMove();
        a.crouch = false;
        a.aimWeight = 0.25;
        this._lookAround(now);
        break;
      }
      case S.PATROL:
        this._runOrder(now);
        break;
      case S.SUSPICIOUS: {
        a.stopMove();
        a.aimWeight = 0.85;
        const p = T && T.conf > 0.2 ? T.pos : a.perception.stim.pos;
        a.face(p);
        if (now - this.stateT > 2.4) this._clearStim();
        break;
      }
      case S.INVESTIGATE: {
        const p = T && !T.acquired && T.conf > 0.22 ? T.pos : a.perception.stim.pos;
        a.aimWeight = 0.8;
        a.crouch = false;
        if (!this.hasDest || this.dest.distanceTo(p) > 2.5) {
          this.dest.copy(p);
          this.hasDest = true;
          this.lookUntil = 0;
        }
        if (a.distTo(this.dest) > 2 && !a.moveFailed) a.moveTo(this.dest, SPEED.careful);
        else {
          a.stopMove();
          if (!this.lookUntil) this.lookUntil = now + 2.2;
          this._lookAround(now);
          if (now > this.lookUntil) {
            this._clearStim();
            if (T && !T.acquired) T.conf *= 0.4;
          }
        }
        if (!a.isMoving()) a.face(this.dest);
        break;
      }
      case S.SEARCH:
        this._runSearch(now, T);
        break;
      case S.ENGAGE:
        this._runEngage(now, T, dist);
        break;
      case S.CHASE: {
        if (!T) break;
        a.aimWeight = 0.6;
        a.crouch = false;
        a.moveTo(T.pos, SPEED.run * role.speed);
        a.face(T.pos);
        if (a.distTo(T.pos) < 2 || a.moveFailed) T.seenT = Math.min(T.seenT, now - 1.3);
        break;
      }
      case S.TAKE_COVER:
        this._runCover(now, T, vis);
        break;
      case S.PEEK:
        this._runPeek(now, T, vis);
        break;
      case S.FLANK: {
        a.aimWeight = 0.45;
        a.crouch = false;
        a.moveTo(this.flankPt, SPEED.run * role.speed);
        if (T) a.face(T.pos);
        // shoot on the move once he is in view from the new angle
        if (vis && dist < role.range[2]) this._fire(T, 0.6);
        if (a.distTo(this.flankPt) < 1.5 || a.moveFailed || now - this.stateT > 14) {
          this.hasDest = false;
          a.squad?.releaseFlank(a);
          this.enter(vis ? S.ENGAGE : S.SEARCH, now);
        }
        break;
      }
      case S.RETREAT: {
        a.aimWeight = 0.35;
        a.crouch = false;
        if (a.cover) {
          a.moveTo(a.coverPos, SPEED.run);
          if (a.inCover()) this.enter(S.TAKE_COVER, now);
        } else if (T) {
          // no cover: open the distance
          if (!this.hasDest) {
            this._v.copy(a.position).sub(T.pos).setY(0).normalize().multiplyScalar(12).add(a.position);
            a.ai.snapWalkable(this._v, a.position.y, this.dest);
            this.hasDest = true;
          }
          a.moveTo(this.dest, SPEED.run);
          if (a.distTo(this.dest) < 1.5 || a.moveFailed) this.enter(S.ENGAGE, now);
        }
        if (T) a.face(T.pos);
        break;
      }
      case S.RELOAD: {
        a.aimWeight = 0.3;
        if (a.cover && !a.inCover() && T && T.conf > 0.4) a.moveTo(a.coverPos, SPEED.tactical);
        else a.stopMove();
        a.crouch = a.inCover() ? true : !!(T && T.visible);
        if (T) a.face(T.pos);
        if (!a.reloading && a.ammo > 0) this.enter(this.prev === S.TAKE_COVER || this.prev === S.PEEK ? S.TAKE_COVER : S.ENGAGE, now);
        break;
      }
      case S.SUPPRESSED: {
        a.stopMove();
        a.crouch = true;
        a.aimWeight = 0.2;
        if (T) a.face(T.pos);
        // blinded men blind-fire toward where the threat was
        if (a.stunLevel > 0.4 && T && T.acquired && now - T.seenT < 3 && (a.id + Math.floor(now * 2)) % 3 === 0) {
          this._fire(T, 1.2, true);
        }
        break;
      }
      case S.EVADE_GRENADE: {
        a.crouch = false;
        a.aimWeight = 0.1;
        a.moveTo(this.evadePt, SPEED.sprint);
        if (a.moveFailed) a.steerAway = true;
        break;
      }
    }

    // a commander's grenade order, or our own read of a dug-in target
    if (T && T.acquired && a.hasGrenade && a.grenadeCooldown <= 0 && this.state !== S.EVADE_GRENADE) {
      const ordered = now - this.grenadeOrder < 4;
      if (dist > 8 && dist < 26 && now - T.updT < 2 && (ordered || (T.visFrac < 0.6 && a.rng.float() < 0.15 * (0.5 + a.aggression)))) {
        if ((ordered || !a.squad || a.squad.requestGrenade()) && a.ai.safeToThrow(a, T.pos)) {
          this.grenadeOrder = -Infinity;
          a.throwGrenadeAt(T.pos);
        }
      }
    }
  }

  _fire(T, readiness = 1, blind = false) {
    const a = this.a;
    const now = this.now;
    a.aimWeight = Math.max(a.aimWeight, readiness);
    T.predict(now, a.fireAt);
    a.fireTarget = T;
    a.blindFire = blind;
    a.wantFire = a.clearShot(a.fireAt);
    a.face(T.pos);
  }

  _runEngage(now, T, dist) {
    const a = this.a;
    const role = a.roleDef;
    if (!T) return;
    a.aimWeight = 1;
    a.face(T.pos);
    // pushers close to their ideal range, everyone else holds and fights
    if (role.pushes && dist > role.range[1] && this.inLeash(T.pos, 2)) {
      a.moveTo(T.pos, SPEED.tactical * role.speed);
      a.crouch = false;
    } else if (dist < role.range[0] && (role.id === 'sniper' || role.id === 'rocket')) {
      a.crouch = false;
    } else {
      a.stopMove();
      // a steady shooter crouches in the open at range; pushers stay up
      a.crouch = !role.pushes && dist > 14 && a.id % 2 === 0;
    }
    if (T.visible) this._fire(T, 1);
    else if (role.suppressor && now - T.seenT < 3) this._fire(T, 1); // LMG keeps hosing the last-known
  }

  _runCover(now, T, vis) {
    const a = this.a;
    if (!a.cover) {
      // nothing usable: fight from here
      this.lastCoverFail = now;
      if (T && vis) this._fire(T, 1);
      a.stopMove();
      a.crouch = true;
      return;
    }
    if (!a.inCover()) {
      // running to it: weapon low, but a visible target at close range gets shot
      a.moveTo(a.coverPos, SPEED.run * a.roleDef.speed);
      a.crouch = false;
      a.aimWeight = 0.35;
      if (T) a.face(T.pos);
      if (a.moveFailed) {
        this.lastCoverFail = now;
        a.cover = null;
        a.ai.cover.release(a.id);
      }
      if (T && vis && a.distTo(T.pos) < 12) this._fire(T, 0.7);
      return;
    }
    // in cover: hidden
    a.stopMove();
    a.crouch = !a.cover.high || true;
    a.aimWeight = 0.5;
    if (!this._arrived) {
      this._arrived = true;
      a.radio('cover');
    }
    if (T) a.face(T.pos);
    if (a.ammo < a.magSize * 0.5 && !a.reloading) a.startReload();
    // compromised: he can see us while we are down
    const compromised = T && T.visible && T.acquired && now - this.stateT > 1.5 && !this._protects(T.pos);
    if (compromised || this.peekCount >= this.maxPeeks) {
      this.peekCount = 0;
      this._arrived = false;
      if (!this._pickCover(now, false, true)) this.enter(S.ENGAGE, now);
      return;
    }
    // ready to peek: the squad hands out peek tokens so they alternate
    if (T && now >= this.hideUntil && !a.reloading) {
      if (!a.squad || a.squad.requestPeek(a)) this.enter(S.PEEK, now);
      else this.hideUntil = now + 0.4;
    }
  }

  _runPeek(now, T, vis) {
    const a = this.a;
    if (!T) {
      this.enter(S.TAKE_COVER, now);
      return;
    }
    if (this.hasDest && a.distTo(this.dest) > 0.3) a.moveTo(this.dest, SPEED.walk);
    else a.stopMove();
    a.crouch = a.cover ? !a.cover.high && a.id % 3 === 0 : false;
    if (vis) this._fire(T, 1);
    else if (now - T.updT < 2.5 && (a.roleDef.suppressor || a.id % 3 === 0)) {
      // suppressing fire on the last-known position
      this._fire(T, 1);
      if (a.wantFire) a.bark('suppress', 6);
    } else {
      a.aimWeight = 1;
      a.face(T.pos);
    }
    if (now > this.peekUntil || a.ammo <= 0) {
      a.squad?.releasePeek(a);
      this.enter(S.TAKE_COVER, now);
      this.hideUntil = now + 0.6 + a.rng.float() * 1.3;
    }
  }

  /** Does our current cover's blocker sit between us and `p`? */
  _protects(p) {
    const c = this.a.cover;
    if (!c) return false;
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    return (dx / d) * c.dx + (dz / d) * c.dz > 0.25;
  }

  _pickCover(now, retreat, reposition = false) {
    const a = this.a;
    const T = a.perception.target;
    const cm = a.ai.cover;
    if (!cm || !T) return false;
    const role = a.roleDef;
    const d = a.distTo(T.pos);
    const o = this.order;
    const leash = this.leash();
    const pick = cm.pick(a.position, T.pos, {
      id: a.id,
      squad: a.ai.agents, // spacing against everyone on the team
      team: a.team,
      minRange: retreat ? Math.max(role.range[0], d + 6) : role.range[0] + 2,
      maxRange: retreat ? role.range[2] : Math.max(role.range[1] + 6, 12),
      maxTravel: retreat ? 30 : reposition ? 16 : 22,
      exclude: reposition ? a.cover : null,
      yRef: a.position.y,
      yTol: 3.5,
      zone: leash !== null ? o.pos : null,
      zoneR: leash,
    });
    if (!pick) {
      this.lastCoverFail = now;
      return false;
    }
    a.cover = pick;
    a.coverPos.set(pick.x, pick.y, pick.z);
    this._arrived = false;
    return true;
  }

  _planFlank(now) {
    const a = this.a;
    const T = a.perception.target;
    const sq = a.squad;
    if (!T || (sq && !sq.claimFlank(a))) return false;
    // swing round the target by 60-80 degrees, to the side with more room
    const toMe = this._v.copy(a.position).sub(T.pos).setY(0);
    const d = toMe.length() || 1;
    toMe.multiplyScalar(1 / d);
    const r = Math.min(20, Math.max(8, d * 0.75));
    let ok = false;
    for (const side of a.id % 2 ? [1, -1] : [-1, 1]) {
      const ang = side * (1.05 + (a.id % 3) * 0.12);
      const c = Math.cos(ang), s = Math.sin(ang);
      this._v2.set(T.pos.x + (toMe.x * c - toMe.z * s) * r, T.pos.y, T.pos.z + (toMe.x * s + toMe.z * c) * r);
      if (a.ai.snapWalkable(this._v2, T.pos.y - 1.3, this.flankPt, 6)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      sq?.releaseFlank(a);
      return false;
    }
    this.hasDest = true;
    return true;
  }

  _planEvade() {
    const a = this.a;
    const g = a.ai.grenadeThreat(a);
    if (!g) return;
    const away = this._v.copy(a.position).sub(g.pos).setY(0);
    const d = away.length();
    if (d < 0.1) away.set(Math.sin(a.yaw + Math.PI), 0, Math.cos(a.yaw + Math.PI));
    else away.multiplyScalar(1 / d);
    const want = g.radius + 3 - d;
    this._v2.copy(a.position).addScaledVector(away, Math.max(3, want + 1.5));
    if (!a.ai.snapWalkable(this._v2, a.position.y, this.evadePt, 4)) this.evadePt.copy(this._v2);
    a.bark('grenade', 2);
    a.callout('grenade', null, g.pos);
  }

  _runSearch(now, T) {
    const a = this.a;
    if (!T) return;
    a.aimWeight = 0.8;
    a.crouch = false;
    if (this.searchPhase === 0) {
      // 1: to the last-known position
      a.moveTo(T.pos, SPEED.tactical);
      a.face(T.pos);
      if (a.distTo(T.pos) < 2.2 || a.moveFailed) {
        this.searchPhase = 1;
        this.lookUntil = now + 1.4;
        this._planSearch(T);
      }
      return;
    }
    // 2: look around, then check the likely spots near it
    if (now < this.lookUntil) {
      a.stopMove();
      this._lookAround(now);
      return;
    }
    if (this.searchI >= this.searchN) {
      // nothing: let confidence run out, then go back to work
      T.conf = Math.min(T.conf, 0.1);
      return;
    }
    const p = this.searchPts[this.searchI];
    a.moveTo(p, SPEED.careful);
    if (!a.isMoving() || a.moveFailed) a.face(p);
    if (a.distTo(p) < 1.6 || a.moveFailed) {
      this.searchI++;
      this.lookUntil = now + 1.2;
    }
  }

  /** Likely hiding spots near the last-known position, ahead of where he was going. */
  _planSearch(T) {
    const a = this.a;
    const g = a.ai.grid;
    this.searchN = 0;
    this.searchI = 0;
    if (!g) return;
    const vx = T.vel.x, vz = T.vel.z;
    const heading = Math.hypot(vx, vz) > 0.5 ? Math.atan2(vx, vz) : Math.atan2(T.pos.x - a.position.x, T.pos.z - a.position.z);
    for (let k = 0; k < 3; k++) {
      const ang = heading + (k - 1) * 0.9 + (a.rng.float() - 0.5) * 0.5;
      const r = 5 + a.rng.float() * 7;
      this._v.set(T.pos.x + Math.sin(ang) * r, T.pos.y, T.pos.z + Math.cos(ang) * r);
      if (a.ai.snapWalkable(this._v, T.pos.y - 1.3, this.searchPts[this.searchN], 4, true)) this.searchN++;
    }
  }

  _clearStim() {
    const st = this.a.perception.stim;
    st.strength = 0;
    st.t = -Infinity;
  }

  _lookAround(now) {
    const a = this.a;
    // slow scan either side of the current heading
    const base = a.scanBase ?? a.yaw;
    const k = Math.sin(now * 0.7 + a.id);
    a.faceYaw(base + k * 1.1);
  }

  /* ================================================================== */
  /* orders, executed tactically                                        */
  /* ================================================================== */

  _runOrder(now) {
    const a = this.a;
    const o = this.order;
    a.crouch = false;
    a.aimWeight = 0.3;
    if (!o) return this._runDefault(now);
    switch (o.kind) {
      case 'hunt':
        return this._runHunt(now);
      case 'patrol': {
        const route = Array.isArray(o.pos) ? o.pos : a.patrolPoints;
        if (!route?.length) return this._runHunt(now);
        return this._runRoute(now, route, SPEED.walk);
      }
      case 'escort':
        return this._runEscort(now, o);
      case 'attack':
        return this._runZone(now, o, 'attack');
      case 'capture':
      case 'defend':
      case 'hold':
      case 'plant':
      case 'defuse':
        return this._runZone(now, o, o.kind);
      default:
        return this._runDefault(now);
    }
  }

  /** No order: walk our own route; drift into hunting after a quiet spell. */
  _runDefault(now) {
    const a = this.a;
    const route = a.patrolPoints;
    const quiet = now - this.noContactT;
    if (route?.length && (quiet < 35 || a.ai.enemiesOf(a.team) === 0)) return this._runRoute(now, route, SPEED.walk);
    return this._runHunt(now);
  }

  _runRoute(now, route, speed) {
    const a = this.a;
    const p = route[this.patrolIndex % route.length];
    if (!p) return;
    if (a.distTo(p) < 1.6 || a.moveFailed) {
      if (!this.lookUntil) this.lookUntil = now + 1 + a.rng.float() * 1.5;
      a.stopMove();
      this._lookAround(now);
      if (now > this.lookUntil) {
        this.lookUntil = 0;
        this.patrolIndex++;
        a.moveFailed = false;
      }
      return;
    }
    a.moveTo(p, speed);
  }

  /**
   * HUNT: seek the enemy team without knowing where it is. Leads first (our
   * own memory, callouts we received), then a sweep through the enemy's side
   * of the map, one point at a time, with a per-bot offset so a team spreads
   * out instead of trooping to the same corner.
   */
  _runHunt(now) {
    const a = this.a;
    const T = a.perception.target;
    if (T && T.conf > 0.15) {
      a.moveTo(T.pos, SPEED.tactical);
      a.aimWeight = 0.6;
      return;
    }
    if (!this.hasHunt || now > this.huntUntil || a.distTo(this.huntPt) < 3 || a.moveFailed) {
      a.moveFailed = false;
      this.hasHunt = a.ai.huntPoint(a, this.huntPt);
      this.huntUntil = now + 30;
      if (!this.hasHunt) {
        a.stopMove();
        this._lookAround(now);
        return;
      }
    }
    a.moveTo(this.huntPt, SPEED.tactical * a.roleDef.speed);
    a.aimWeight = 0.45;
  }

  _runEscort(now, o) {
    const a = this.a;
    const t = a.ai.getActor(o.targetId);
    if (!t || !t.alive) return this._runDefault(now);
    // stay 3-6 m off his shoulder, on our own side, not in his path
    const side = a.id % 2 ? 1 : -1;
    const yaw = t.yaw ?? 0;
    this._v.set(
      t.position.x - Math.sin(yaw) * 3 + Math.cos(yaw) * 2.2 * side,
      t.position.y,
      t.position.z - Math.cos(yaw) * 3 - Math.sin(yaw) * 2.2 * side
    );
    const d = a.distTo(t.position);
    if (d > 6 || (d > 3.5 && a.distTo(this._v) > 2)) {
      a.ai.snapWalkable(this._v, t.position.y, this.dest, 4);
      a.moveTo(this.dest, d > 10 ? SPEED.run : SPEED.tactical);
    } else {
      a.stopMove();
      // watch outward, away from the man we are guarding
      a.faceYaw(Math.atan2(a.position.x - t.position.x, a.position.z - t.position.z));
    }
    a.aimWeight = 0.5;
  }

  /**
   * capture / defend / hold / plant / defuse / attack: get to the zone
   * tactically (a contested zone is approached from the side), then take a
   * spaced slot inside it (capture) or a covered spot around it (defend).
   */
  _runZone(now, o, kind) {
    const a = this.a;
    const pos = o.pos;
    if (!pos) return this._runDefault(now);
    const r = o.radius ?? 4;
    const dz = Math.hypot(a.position.x - pos.x, a.position.z - pos.z);
    if (!this.hasSlot || now - this.slotT > 20) this._pickSlot(now, o, kind);
    const target = this.hasSlot ? this.slot : pos;
    const far = a.distTo(target);
    if (kind === 'attack') {
      if (far > 3) a.moveTo(target, dz > 25 ? SPEED.run : SPEED.tactical);
      else {
        a.stopMove();
        this._lookAround(now);
      }
      return;
    }
    if (far > 1.4) {
      // contested: the last stretch goes in from a flank, not down the middle
      a.moveTo(target, dz > r + 15 ? SPEED.run : SPEED.tactical);
      a.aimWeight = dz < r + 15 ? 0.7 : 0.35;
      return;
    }
    a.stopMove();
    a.aimWeight = 0.6;
    a.crouch = kind === 'defend' || kind === 'hold' || kind === 'defuse' || kind === 'plant';
    // face outward from the zone centre (defenders watch the approaches)
    if (Math.hypot(a.position.x - pos.x, a.position.z - pos.z) > 0.5) {
      a.faceYaw(Math.atan2(a.position.x - pos.x, a.position.z - pos.z) + Math.sin(now * 0.4 + a.id) * 0.8);
    } else this._lookAround(now);
    if ((kind === 'plant' || kind === 'defuse') && dz <= r && !a.wasHurtRecently(1.5)) {
      a.ai.interact(a, o);
    }
  }

  /**
   * A slot for this bot: capture spreads the team across the zone on a ring
   * (index-spaced, no bunching); defend and hold prefer cover within the
   * leash facing out; plant/defuse go to the site itself. When the zone is
   * contested (we know an enemy near it) the approach slot is offset to the
   * side so the last metres come in on a flank.
   */
  _pickSlot(now, o, kind) {
    const a = this.a;
    const pos = o.pos;
    const r = o.radius ?? 4;
    this.slotT = now;
    this.hasSlot = false;
    const n = Math.max(1, a.ai.teamIndex(a));
    const ang = n * 2.399 + (a.team === 'esf' ? 0 : 1.2);
    if (kind === 'defend' || kind === 'hold') {
      const cm = a.ai.cover;
      if (cm && kind === 'defend') {
        const threat = this._threat.set(pos.x + Math.sin(ang) * 20, pos.y, pos.z + Math.cos(ang) * 20);
        const c = cm.pick(a.position, threat, {
          id: a.id, squad: a.ai.agents, team: a.team, minRange: 3, maxRange: 40, maxTravel: 60,
          zone: pos, zoneR: r + 6, yRef: pos.y, yTol: 3,
        });
        if (c) {
          a.cover = c;
          a.coverPos.set(c.x, c.y, c.z);
          this.slot.set(c.x, c.y, c.z);
          this.hasSlot = true;
          return;
        }
      }
      const rr = kind === 'hold' ? Math.min(1.2, r * 0.3) : r * 0.8;
      this._v.set(pos.x + Math.sin(ang) * rr, pos.y, pos.z + Math.cos(ang) * rr);
    } else if (kind === 'plant' || kind === 'defuse') {
      this._v.set(pos.x + Math.sin(ang) * 0.6, pos.y, pos.z + Math.cos(ang) * 0.6);
    } else if (kind === 'attack') {
      this._v.set(pos.x + Math.sin(ang) * 3, pos.y, pos.z + Math.cos(ang) * 3);
    } else {
      // capture: a ring inside the zone, spaced by team index
      const rr = r * (0.35 + 0.4 * ((n * 0.618) % 1));
      this._v.set(pos.x + Math.sin(ang) * rr, pos.y, pos.z + Math.cos(ang) * rr);
      // contested: come in from the side we are on, not across the middle
      const T = a.perception.target;
      if (T && T.conf > 0.3 && Math.hypot(T.pos.x - pos.x, T.pos.z - pos.z) < r + 12) {
        const sx = a.position.x - pos.x, sz = a.position.z - pos.z;
        const d = Math.hypot(sx, sz) || 1;
        this._v.set(pos.x + (sx / d) * r * 0.7 + (-sz / d) * r * 0.5, pos.y, pos.z + (sz / d) * r * 0.7 + (sx / d) * r * 0.5);
      }
    }
    this.hasSlot = a.ai.snapWalkable(this._v, pos.y, this.slot, 5);
  }
}

function samePos(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (Array.isArray(a) || Array.isArray(b)) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.z - b.z) < 0.5;
}
