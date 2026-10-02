/**
 * AI — one enemy: body, senses, brain, gun.
 *
 * PERCEPTION is deliberately imperfect. A target has to be inside a 100 degree
 * cone, in line of sight through the physics BVH, and then *stay* there for a
 * reaction delay that scales with angle off-centre and distance before the
 * agent acknowledges it. Gunshots and footsteps arrive as events and only give
 * a direction, which becomes a "last known position" that decays — so enemies
 * search where you were, not where you are.
 *
 * BEHAVIOUR is a small state machine:
 *   idle / patrol -> alert -> combat -> suppressed -> flank -> retreat -> dead
 * Combat runs a peek-and-shoot loop from a scored cover point, with the squad
 * handing out permission to peek so they never all lean out at once, plus
 * suppressing fire, grenades and repositioning when the player stops moving.
 *
 * DAMAGE is per-bone: capsule colliders for head, chest, pelvis, arms and legs
 * are pushed into `physics` every frame, so a headshot is a headshot because of
 * where the round landed, not because of a random roll. Death hands the live
 * skeleton to the ragdoll solver with the bullet's impulse.
 */

import * as THREE from 'three';
import { RIG } from './rig.js';
import { Animator } from './animator.js';
import { isEnemyTeam, normTeam, LAYER_ESF } from './teams.js';
import { roleFor, resolveWeapon, weaponFor, PLAYER_DAMAGE_SCALE } from './roles.js';
import { Perception } from './perception.js';
import { Brain, S } from './brain.js';

/**
 * FLOP OPS death tuning. Deaths are the comedy; the physics stays honest.
 * Impulses are N·s multipliers on the round's own, velocities are m/s.
 */
export const DEATH = {
  /** body/limb hits: a touch more shove than the sim-accurate 1.0 */
  bodyMul: 1.25,
  /** headshots snap the head back and fold the body over it */
  headshotMul: 2.1,
  headshotLift: 1.2,
  /** joint looseness: wider limits than the old 74°/38° */
  cone: 84,
  twist: 46,
  /** 0..1 softening of the swing-limit correction (0 = rigid, 1 = rag) */
  limp: 0.3,
  /** the rare theatrical death */
  dramaticChance: 0.05,
  dramaticSpin: 11.0,
  dramaticHop: 2.4,
  dramaticLimp: 0.55,
};

/** Brain states (brain.js), plus the old names older callers use. */
const STATE = { ...S, COMBAT: S.ENGAGE, ALERT: S.INVESTIGATE };

export { STATE };

/** Seconds between two callouts of one kind from one man. */
const CALLOUT_GAP = { contact: 5, lastknown: 6, lost: 8, grenade: 2, help: 10 };
/** Callout -> radio subtitle kind (radio.js). */
const CALLOUT_RADIO = { lost: 'lost', help: 'help' };

/**
 * Called from the captor's update: hold the hostage in front of us, a little
 * to our left, so our right shoulder and head are the only clean shot.
 */
function holdHostage(captor, hostage) {
  const fx = Math.sin(captor.yaw), fz = Math.cos(captor.yaw);
  // right of the character is -x in its frame: (−cos, +sin)
  const x = captor.position.x + fx * 0.42 + fz * 0.14;
  const z = captor.position.z + fz * 0.42 - fx * 0.14;
  hostage.position.set(x, captor.position.y, z);
  hostage.controller?.teleport(x, captor.position.y, z);
  hostage.yaw = captor.yaw;
  hostage.targetYaw = captor.yaw;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const HITBOXES = [
  ['head', 'Head', 'HeadTop', 0.098, 4.0],
  ['torso', 'Spine1', 'Neck', 0.185, 1.0],
  ['torso', 'Hips', 'Spine1', 0.175, 0.9],
  ['arm', 'UpperArmR', 'HandR', 0.072, 0.65],
  ['arm', 'UpperArmL', 'HandL', 0.072, 0.65],
  ['leg', 'UpLegR', 'FootR', 0.105, 0.7],
  ['leg', 'UpLegL', 'FootL', 0.105, 0.7],
];

/**
 * Ragdoll bone spec, in the order the solver wants it.
 *   [ headBone, tailBone, radius, massFraction, parentIndex, cone°, twist°, map ]
 * `map` false marks a stub whose only job is to weld a limb chain to the torso:
 * the solver shares a particle between two bones only when their endpoints are
 * coincident, so the shoulder and hip need a bone that starts exactly on the
 * spine joint. Deriving our own spec (instead of letting physics infer one from
 * all 25 bones) also gets the capsule radii right, which is the difference
 * between a body and a pancake.
 */
const DOLL = [
  ['Hips', 'Spine', 0.135, 0.14, -1, 0, 0, true],
  ['Spine', 'Spine1', 0.125, 0.10, 0, 22, 16, true],
  ['Spine1', 'Spine2', 0.135, 0.14, 1, 18, 12, true],
  ['Spine2', 'Neck', 0.130, 0.10, 2, 16, 10, true],
  ['Neck', 'Head', 0.052, 0.03, 3, 30, 25, true],
  ['Head', 'HeadTop', 0.098, 0.07, 4, 42, 30, true],
  // stubs get a free cone: their direction is lateral while the parent points
  // up the spine, so any limit here is violated in the bind pose and the solver
  // would inject energy trying to fix it
  ['Spine2', 'UpperArmR', 0.055, 0.02, 3, 179, 179, false],
  ['UpperArmR', 'ForearmR', 0.058, 0.027, 6, 100, 60, true],
  ['ForearmR', 'HandR', 0.048, 0.018, 7, 80, 45, true],
  ['HandR', 'FingersR', 0.038, 0.006, 8, 55, 40, true],
  ['Spine2', 'UpperArmL', 0.055, 0.02, 3, 179, 179, false],
  ['UpperArmL', 'ForearmL', 0.058, 0.027, 10, 100, 60, true],
  ['ForearmL', 'HandL', 0.048, 0.018, 11, 80, 45, true],
  ['HandL', 'FingersL', 0.038, 0.006, 12, 55, 40, true],
  ['Hips', 'UpLegR', 0.065, 0.02, 0, 179, 179, false],
  ['UpLegR', 'LegR', 0.088, 0.10, 14, 95, 35, true],
  ['LegR', 'FootR', 0.068, 0.045, 15, 70, 20, true],
  ['FootR', 'ToeR', 0.050, 0.012, 16, 40, 20, true],
  ['Hips', 'UpLegL', 0.065, 0.02, 0, 179, 179, false],
  ['UpLegL', 'LegL', 0.088, 0.10, 18, 95, 35, true],
  ['LegL', 'FootL', 0.068, 0.045, 19, 70, 20, true],
  ['FootL', 'ToeL', 0.050, 0.012, 20, 40, 20, true],
];

const DEG = Math.PI / 180;

let _nextId = 1;

export class Agent {
  constructor(ai, opts = {}) {
    this.ai = ai;
    this.ctx = ai.ctx;
    this.id = _nextId++;
    this.rng = ai.rng.fork();
    /** 'esf' | 'hostile' | 'civ' (EXPANSION.md §2) */
    this.team = normTeam(opts.team ?? 'hostile');
    /** ESF bots are friendly to the player: the UI minimap reads this */
    this.friendly = this.team === 'esf';
    this.roleDef = roleFor(opts.role);
    this.role = this.roleDef.id;
    this.variantName = opts.variant ?? 'vanguard';
    this.weaponId = opts.weapon ?? weaponFor(this.roleDef, this.team);
    /** AI weapon profile resolved from src/weapons/defs.js (see roles.js) */
    this.weapon = resolveWeapon(this.weaponId, ai.ctx.peek('weapons'));
    this.modelStyle = opts.model ?? null;
    const def = ai.variant(this.variantName, { team: this.team, weapon: this.modelStyle });
    this.def = def;
    this.scale = def.variant.scale ?? 1;
    /** Rank shown by the UI killfeed, e.g. "RIFLEMAN". See
     *  VARIANTS[name].display in soldier.js — runtime id stays `variantName`. */
    this.variantDisplay =
      opts.display ?? (opts.role ? this.roleDef.display : def.variant.display ?? this.variantName.toUpperCase());

    /* ---------------- body ---------------- */
    const { bones, skeleton, root } = RIG.createSkeleton();
    this.bones = bones;
    this.skeleton = skeleton;
    // Material contract, asserted on every spawn: one material per geometry
    // group, every one a real textured MeshStandardMaterial (glass excepted).
    // A missing slot renders as three's default white — the "pale enemy".
    const groups = def.geometry.groups;
    let fallback = def.materials.find((m) => m?.map) ?? null;
    for (const g of groups) {
      const m = def.materials[g.materialIndex];
      if (!m || !m.isMaterial || (!m.map && !/glass/i.test(m.name ?? ''))) {
        console.error(`[ai] ${this.variantName}: material slot ${g.materialIndex} (${m?.name ?? 'missing'}) has no texture`);
        if (fallback) def.materials[g.materialIndex] = fallback;
      }
    }
    this.mesh = new THREE.SkinnedMesh(def.geometry, def.materials);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;
    this.mesh.userData.agent = this;
    this.group = new THREE.Group();
    this.group.name = `enemy${this.id}`;
    this.group.add(root);
    this.group.add(this.mesh);
    this.mesh.bind(skeleton);
    this.group.scale.setScalar(this.scale);
    ai.root.add(this.group);

    /** Physics looks for these when it adopts the skeleton on death. */
    this.skinnedMesh = this.mesh;
    this.mass = 82 * this.scale;

    this.position = new THREE.Vector3().copy(opts.position ?? new THREE.Vector3());
    this.yaw = opts.yaw ?? 0;
    this.targetYaw = this.yaw;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    // The bones' world matrices are derived from the group's, so the group has
    // to be current before anything reads them — including the very first
    // animator pass and a same-frame ragdoll hand-off.
    this.group.updateMatrixWorld(true);

    this.animator = new Animator(RIG, bones, {
      weapon: def.weapon,
      unarmed: !def.weapon,
      rng: this.rng.fork(),
      scale: this.scale,
      probe: (x, z, fromY, out) => this.ai.probeGround(x, z, fromY, out),
    });

    /* ---------------- physics ---------------- */
    const phys = this.ctx.peek('physics');
    this.phys = phys;
    this.height = 1.78 * this.scale;
    this.radius = 0.34 * this.scale;
    this.controller = phys
      ? phys.createCharacter({
        radius: this.radius,
        height: this.height,
        position: this.position,
        stepHeight: 0.42,
        slopeLimit: 48,
      })
      : null;
    this.velocity = new THREE.Vector3();
    this.grounded = true;

    this.colliders = [];
    if (phys) {
      // ESF hitboxes live on a layer no physics mask includes, so the player's
      // rounds (MASK.BULLET) pass through friendlies: see teams.js LAYER_ESF.
      const layer = this.team === 'esf' ? LAYER_ESF : phys.LAYER.ACTOR;
      for (const [part, a, b, r, dmg] of HITBOXES) {
        const c = phys.addCollider({
          shape: 'capsule',
          layer,
          surface: 'flesh',
          owner: this,
          part,
          radius: r * this.scale,
          damageScale: dmg,
        });
        c.userData = { a, b };
        this.colliders.push(c);
      }
    }

    /* ---------------- stats ---------------- */
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.state = STATE.IDLE;
    this.stateTime = 0;
    this.squad = opts.squad ?? null;
    /** 0..1: decisions and reaction time, never health (see setDifficulty) */
    this.skill = opts.skill ?? 0.5;
    /** who last hurt us: an Agent or the PlayerProxy (kill accounting) */
    this.lastAttacker = null;
    this.lastHurtT = -Infinity;

    /* ---------------- perception ---------------- */
    this.eyeHeight = RIG.eyeHeight * this.scale;
    this.viewRange = 58;
    this.viewCos = Math.cos((100 * Math.PI) / 180 / 2);
    this.awareness = 0; // 0..1 build-up before the target is acknowledged
    this.hasTarget = false;
    this.targetVisible = false;
    this.target = null;
    this.lastKnown = new THREE.Vector3();
    this.lastKnownAge = Infinity;
    this.searchPoint = new THREE.Vector3();
    this.suppression = 0;
    this.reactionTimer = 0;
    this.alertness = 0;
    /** Difficulty multiplier on how fast awareness builds to a confirmed target.
     *  1 = the hand-tuned default; scaled by setDifficulty() (see spawnWave). */
    this.reactionMult = 1;

    /* ---------------- combat ---------------- */
    const W = this.weapon;
    this.weaponRange = Math.min(W.maxRange, this.roleDef.range[2]);
    // bots fire a touch under the gun's cyclic rate: trigger discipline
    this.fireRate = Math.min(W.rpm / 60, this.variantName === 'irregular' ? 8.2 : 10.5) || 1;
    if (W.rpm < 300) this.fireRate = W.rpm / 60;
    /** 0..1 push/flank/grenade/hold-ground appetite. 0.5 is behaviour-neutral
     *  (the hand-tuned default); setDifficulty() maps wave intensity onto it. */
    this.aggression = 0.5;
    /** Killfeed callsign. Assigned by AiSystem.spawn() from the contract pool. */
    this.name = opts.name ?? null;
    this.burstLeft = 0;
    this.fireCooldown = 0;
    this.burstCooldown = this.rng.range(0.4, 1.4);
    this.magSize = W.magSize;
    this.ammo = this.magSize;
    this.spread = 0.032;
    /** per round, against the player (see roles.js PLAYER_DAMAGE_SCALE) */
    this.weaponDamage = W.damage * PLAYER_DAMAGE_SCALE;
    this.aimTarget = new THREE.Vector3();
    this.aimActual = new THREE.Vector3();
    this.aimWeight = 0;
    this.wantFire = false;
    this.peekSide = 0;
    this.peeking = false;
    this.peekTimer = this.rng.range(0.5, 2.5);
    this.grenadeCooldown = this.rng.range(9, 22);
    this.hasGrenade = true;

    /* ---------------- vocal (ai:bark) ---------------- */
    /** Shared per-agent cooldown across every bark kind — see bark(). Keeps one
     *  soldier from stacking callouts; cross-agent mush is the audio mixer's
     *  own 0.42s global throttle. */
    this._lastBark = -Infinity;

    /* ---------------- navigation ---------------- */
    this.path = [];
    this.pathLen = 0;
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.moveTarget = new THREE.Vector3().copy(this.position);
    this.hasMoveTarget = false;
    this.desiredSpeed = 0;
    this.speed = 0;
    this.crouch = false;
    this.cover = null;
    this.coverPos = new THREE.Vector3();
    this.patrolPoints = opts.patrol ?? null;
    this.patrolIndex = 0;
    this.stuckTimer = 0;
    this.vaultCooldown = 0;
    /** a path request the frame budget pushed to the next frame */
    this.pathPending = false;
    this._pendingDest = new THREE.Vector3();

    /* ---------------- LOD ---------------- */
    /** set by AiSystem._updateRelevance: nothing this actor does reaches a pixel */
    this.lodIrrelevant = false;
    this._animSkip = 0;
    this._animAccum = 0;

    /* ---------------- scratch ---------------- */
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._steer = new THREE.Vector3();
    this._boneA = new THREE.Vector3();
    this._boneB = new THREE.Vector3();
    this._muzzleDir = new THREE.Vector3();

    this.clip = 'idle';

    /* ---------------- brain ---------------- */
    this.aggression = this.roleDef.aggression;
    this.perception = new Perception(this);
    this.brain = new Brain(this);
    // staggered think phase so a squad never decides on the same frame
    this.thinkTimer = ((this.id * 0.618) % 1) * 0.2;
    this._lastThink = -Infinity;
    this.thinks = 0;
    this._stun = 0;
    this._stunRate = 0.3;
    this._reloadPending = false;
    this._moveDest = new THREE.Vector3(Infinity, 0, 0);
    this.moveFailed = false;
    this.facePoint = new THREE.Vector3();
    this.faceMode = 0;
    this.faceYawV = this.yaw;
    this.scanBase = this.yaw;
    /** where the brain wants rounds to go (a point from memory) */
    this.fireAt = new THREE.Vector3();
    this.fireTarget = null;
    this.blindFire = false;
    this._aimSigma = 0.02;
    this._burstShots = 0;
    this._firstShotDelay = 0.12 + (1 - this.skill) * 0.25;
    this.shotsFired = 0;
    this._calloutT = {};
    this.grenadeWarnT = -Infinity;
    this.friendBlockT = -Infinity;
    this.holding = opts.holding ?? null;
    this._dmgFrame = -1;
    this._dmgMax = 0;
    this._dmgDir = new THREE.Vector3();
    this._impDir = new THREE.Vector3();
    this._impFrame = -1;
  }

  /**
   * Map a wave difficulty scalar `intensity` ∈ [0,1] onto the existing
   * perception / accuracy / aggression knobs. Called by AiSystem.spawnWave().
   * Every field it touches is one the agent already reads every frame, so this
   * is pure re-tuning, not new behaviour.
   *
   *   spread        cone of fire (aim error)   0.055 rad → 0.018 rad
   *   reactionMult  awareness build-up rate    0.60×    → 1.65×
   *   fireRate      rounds/sec                  0.82×    → 1.22× of the variant base
   *   weaponDamage  per round                   12       → 21
   *   aggression    flank/grenade/hold appetite 0.28     → 1.00
   *   grenadeCooldown  first-throw delay        long     → short
   *   viewRange     acquisition distance        50 m     → 64 m
   */
  setDifficulty(intensity) {
    const t = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    this.intensity = t;
    this.spread = 0.055 - 0.037 * t;
    this.skill = t;
    this.reactionMult = 0.6 + 1.05 * t;
    const W = this.weapon;
    const base = W.rpm < 300 ? W.rpm / 60 : Math.min(W.rpm / 60, this.variantName === 'irregular' ? 8.2 : 10.5);
    this.fireRate = base * (0.82 + 0.4 * t);
    // the rifle's 33 x 0.52 = 17.2 at t=0.55; 12.4 .. 21 across the range,
    // exactly the band the wave game was balanced on
    this.weaponDamage = W.damage * PLAYER_DAMAGE_SCALE * (0.72 + 0.5 * t);
    this.aggression = Math.min(1, this.roleDef.aggression * (0.7 + 0.6 * t));
    this._firstShotDelay = 0.12 + (1 - t) * 0.25;
    this.grenadeCooldown = this.rng.range(8, 20) * (1.5 - 0.8 * t);
    this.viewRange = 50 + 14 * t;
    return this;
  }

  /* ================================================================== */
  /* frame                                                              */
  /* ================================================================== */

  get eye() {
    return this._eye.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /**
   * Perception sample point `i` (0 chest, 1 head, 2 pelvis). Crouching lowers
   * all three, so a man crouched behind a wall presents less of himself.
   */
  samplePoint(i, out) {
    const h = (this.crouch ? 1.2 : 1.78) * this.scale;
    const p = this.position;
    if (i === 1) return out.set(p.x, p.y + h * 0.92, p.z);
    if (i === 2) return out.set(p.x, p.y + h * 0.52, p.z);
    return out.set(p.x, p.y + h * 0.74, p.z);
  }

  update(dt, ctx) {
    if (!this.alive) return;
    const now = ctx.time.elapsed;
    this.stateTime += dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.55);
    this.fireCooldown -= dt;
    this.burstCooldown -= dt;
    this.grenadeCooldown -= dt;
    this.repathTimer -= dt;
    this.vaultCooldown -= dt;
    if (this._stun > 0) this._stun = Math.max(0, this._stun - dt * this._stunRate);
    if (this._reloadPending && !this.animator.reloading) {
      this._reloadPending = false;
      this.ammo = this.magSize;
    }

    // a path the frame budget deferred: ask again before anything else does
    if (this.pathPending) this._goTo(this._pendingDest);

    this.perception.decay(now, dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      const since = Math.min(0.6, Math.max(dt, now - this._lastThink));
      this._lastThink = now;
      const interval = this.ai.thinkInterval(this);
      this.thinkTimer = interval;
      this.thinks++;
      this.perception.look(now, since);
      this._hearBots(now);
      if (this.holding?.alive) this._holdHostage(now);
      else this.brain.think(now);
      this._legacy(now);
    }

    this._move(dt);
    if (this.holding?.alive) holdHostage(this, this.holding);
    this._shoot(dt);
    this._drive(dt);
  }

  /**
   * HOSTAGE-TAKER (EXPANSION.md §7, `ai.spawn(..., { holding: civ })`): plant
   * the feet, keep the hostage between us and the threat, and shoot over his
   * shoulder at anything we can actually see. No cover, no flanking: the
   * shield is the plan.
   */
  _holdHostage(now) {
    const T = this.perception.target;
    this.state = this.brain.state = 'hold_hostage';
    this.stopMove();
    this.crouch = false;
    this.wantFire = false;
    this.aimWeight = 0.9;
    if (T && T.conf > 0.2) {
      this.face(T.pos);
      if (T.visible && T.acquired) {
        T.predict(now, this.fireAt);
        this.fireTarget = T;
        this.blindFire = false;
        this.wantFire = this.clearShot(this.fireAt);
      }
    }
  }

  /** Mirror the brain's picture onto the fields older callers read. */
  _legacy(now) {
    const T = this.perception.target;
    this.hasTarget = !!(T && T.acquired && T.conf > 0.3);
    this.targetVisible = !!(T && T.visible);
    this.target = T?.actor ?? null;
    if (T) {
      this.lastKnown.copy(T.pos);
      this.lastKnownAge = now - T.updT;
    } else this.lastKnownAge = Infinity;
    this.alertness = this.perception.alert;
    this.awareness = T?.spot ?? 0;
  }

  /* ================================================================== */
  /* perception glue                                                    */
  /* ================================================================== */

  /**
   * Enemy BOTS moving fast nearby are heard (the player's footsteps arrive as
   * `player:footstep` events). Crouched or slow movement makes no sound.
   */
  _hearBots(now) {
    const agents = this.ai.agents;
    for (let i = 0; i < agents.length; i++) {
      const o = agents[i];
      if (!o.alive || o.team === this.team || o.team === 'civ') continue;
      if (o.crouch || o.speed < 1.3) continue;
      const loud = o.speed > 2.8 ? 17 : 6.5;
      const d = this.position.distanceTo(o.position);
      if (d > loud) continue;
      this.perception.hearFrom(o, o.position, (1 - d / loud) * 0.7, 'footstep', now);
    }
  }

  /** A sound heard from `pos` with `loudness` metres of reach (legacy API). */
  hear(pos, loudness, actor = null, kind = 'noise') {
    if (!this.alive) return;
    const d = this.position.distanceTo(pos);
    if (d > loudness) return;
    this.perception.hearFrom(actor, pos, 1 - d / loudness, kind, this.ctx.time.elapsed);
  }

  /** Rounds cracking past raise suppression, which drives the flinch + duck. */
  suppress(amount) {
    if (!this.alive) return;
    this.suppression = Math.min(1.6, this.suppression + amount);
    this.perception.alert = 1;
  }

  /**
   * Flashbang / concussion (EXPANSION.md §6): aim wrecked, sight gone above
   * 0.55, memory of where things were shaken loose, recovering linearly over
   * `duration`. The brain reads `stun` (SUPPRESSED / blind-fire / cover).
   */
  stun(intensity = 1, duration = 3) {
    if (!this.alive) return;
    const k = Math.max(0, Math.min(1, intensity));
    if (k <= 0) return;
    if (k >= this._stun) {
      this._stun = k;
      this._stunRate = k / Math.max(0.3, duration);
    }
    // blinded: nothing is "in view" any more and what was is less certain
    for (const r of this.perception.mem.recs) {
      if (!r.actor) continue;
      r.visible = false;
      r.conf *= 1 - 0.45 * k;
      r.spot *= 1 - k;
    }
    this.suppression = Math.min(1.6, this.suppression + k * 0.6);
    this.animator.hit('head', 1, 0.6 + k * 0.6);
    this.bark('hurt', 1);
  }

  /** Current stun 0..1 (0 = clear). */
  get stunLevel() {
    return this._stun;
  }

  wasHurtRecently(s) {
    return this.ctx.time.elapsed - this.lastHurtT < s;
  }

  /** First sighting of a target: shout it, and put it on the net. */
  onAcquire(rec) {
    this.bark('spot');
    if (!this._spotted) this.radio('spot');
    this._spotted = true;
    this.callout('contact', rec.actor, rec.pos, 1);
  }

  /**
   * Put a callout on the team net (comms.js), rate-limited per kind, with the
   * matching radio subtitle.
   */
  callout(kind, actor = null, pos = null, conf = null) {
    if (this.team === 'civ') return false;
    const now = this.ctx.time.elapsed;
    const gap = CALLOUT_GAP[kind] ?? 4;
    if (now - (this._calloutT[kind] ?? -Infinity) < gap) return false;
    this._calloutT[kind] = now;
    const T = this.perception.target;
    const who = actor ?? T?.actor ?? null;
    const where = pos ?? T?.pos ?? this.position;
    this.ai.comms.post(this, kind, who, where, conf ?? T?.conf ?? 1);
    const line = CALLOUT_RADIO[kind];
    if (line) this.radio(line);
    return true;
  }

  /** A teammate's callout reached us (after its delay, in range). */
  onCallout(c, now) {
    const P = this.perception;
    switch (c.kind) {
      case 'contact':
      case 'lastknown':
        if (c.actor) P.fromCallout(c.actor, c.pos, c.conf, now);
        else P.hearFrom(null, c.pos, 0.5, 'callout', now);
        break;
      case 'lost': {
        const r = c.actor ? P.mem.find(c.actor) : null;
        if (r && !r.visible) r.conf *= 0.7;
        break;
      }
      case 'grenade':
        this.grenadeWarnT = now;
        break;
      case 'help':
        P.hearFrom(null, c.origin, 0.55, 'help', now);
        break;
    }
    if (c.kind !== 'lost') this.bark('copy', 6);
  }

  /**
   * Emit an `ai:bark` callout for `audio` to voice (see BARKS in
   * src/audio/vox.js: spot, reload, grenade, flank, suppress, advance, hurt,
   * death, copy). Gated by a shared per-agent cooldown, deterministic
   * (ctx.time.elapsed, no RNG) — audio's own bark() has a separate 0.42s
   * global throttle across all agents, so this only needs to stop one soldier
   * from stacking callouts on itself.
   */
  bark(kind, cooldown = 4) {
    const now = this.ctx.time.elapsed;
    if (now - this._lastBark < cooldown) return;
    this._lastBark = now;
    this.ctx.events.emit('ai:bark', { kind, agent: this, position: this.position, voice: this.id, team: this.team });
  }

  /** Say a subtitle line on the team's radio net (`ai:radio`, see radio.js). */
  radio(kind, about = null) {
    return this.ai.radio?.say(this, kind, about) ?? null;
  }

  /* ================================================================== */
  /* the brain's hands and feet                                         */
  /* ================================================================== */

  /** Legacy state setter (staged tableaux, old callers). */
  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  /** Horizontal distance to a point. */
  distTo(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  inCover() {
    return !!this.cover && this.distTo(this.coverPos) < 0.9 && Math.abs(this.coverPos.y - this.position.y) < 1.2;
  }

  isMoving() {
    return this.hasMoveTarget || this.pathPending;
  }

  /**
   * Walk/run to `dest` at `speed`. Re-plans only when the destination moved
   * by more than 0.8 m, so calling it every think is cheap. Sets `moveFailed`
   * when no route exists (the brain gives up on that destination).
   */
  moveTo(dest, speed) {
    this.desiredSpeed = speed;
    const d2 = this._moveDest.distanceToSquared(dest);
    if (d2 < 0.64) {
      if (this.hasMoveTarget || this.pathPending) return true;
      if (this.moveFailed) return false;
      if (this.distTo(dest) < 0.7) return true;
    }
    this._moveDest.copy(dest);
    this.moveFailed = false;
    const ok = this._goTo(dest);
    if (!ok && !this.pathPending) this.moveFailed = true;
    return ok;
  }

  stopMove() {
    this.hasMoveTarget = false;
    this.pathPending = false;
    this.desiredSpeed = 0;
  }

  face(p) {
    this.faceMode = 1;
    this.facePoint.copy(p);
  }

  faceYaw(y) {
    this.faceMode = 2;
    this.faceYawV = y;
  }

  get reloading() {
    return this.animator.reloading;
  }

  startReload() {
    if (this.animator.reloading || this.ammo >= this.magSize) return false;
    this.animator.reload(this.weapon.reload ?? 2.35);
    this.ai.emitReload(this);
    this._reloadPending = true;
    this.burstLeft = 0;
    return true;
  }

  throwGrenadeAt(p) {
    this._throwGrenade(p);
  }

  /**
   * Friendly fire avoidance: false when a teammate stands in the line of fire
   * to `p` (then step aside instead of shooting through him).
   */
  clearShot(p) {
    const eye = this.eye;
    const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const lists = this.ai._civLists;
    lists[0] = this.ai.agents;
    lists[1] = this.ai.civilians;
    for (let l = 0; l < 2; l++) {
      const list = lists[l];
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o === this || o === this.holding || !o.alive || (o.team !== this.team && o.team !== 'civ')) continue;
        const ox = o.position.x - eye.x, oy = o.position.y + 1.1 - eye.y, oz = o.position.z - eye.z;
        const t = ox * ux + oy * uy + oz * uz;
        if (t < 0.4 || t > len - 0.5) continue;
        const mx = ox - ux * t, my = oy - uy * t, mz = oz - uz * t;
        if (mx * mx + mz * mz < 0.36 && Math.abs(my) < 1.0) {
          this.friendBlockT = this.ctx.time.elapsed;
          return false;
        }
      }
    }
    return true;
  }

  /* ================================================================== */
  /* movement                                                           */
  /* ================================================================== */

  _goTo(dest) {
    const grid = this.ai.grid;
    if (!grid) {
      this.moveTarget.copy(dest);
      this.hasMoveTarget = true;
      return true;
    }
    const n = this.ai.requestPath(this.position, dest, this.path);
    if (n < 0) {
      // The frame's A* budget is spent. Hold the destination and retry on the
      // next frame instead of failing outright: `_combat` reads a failed _goTo as
      // "that cover point is unreachable" and drops it.
      this._pendingDest.copy(dest);
      this.pathPending = true;
      return false;
    }
    this.pathPending = false;
    if (n === 0) {
      this.hasMoveTarget = false;
      return false;
    }
    this.pathLen = n;
    this.pathIndex = 0;
    this.moveTarget.copy(this.path[n - 1]);
    this.hasMoveTarget = true;
    return true;
  }

  _move(dt) {
    const wp = this.hasMoveTarget && this.pathIndex < this.pathLen ? this.path[this.pathIndex] : null;
    this._steer.set(0, 0, 0);
    let want = 0;

    if (wp) {
      const to = this._v.copy(wp).sub(this.position);
      to.y = 0;
      const d = to.length();
      if (d < (this.pathIndex === this.pathLen - 1 ? 0.45 : 0.75)) {
        this.pathIndex++;
        if (this.pathIndex >= this.pathLen) this.hasMoveTarget = false;
      } else {
        to.multiplyScalar(1 / d);
        this._steer.copy(to);
        want = this.desiredSpeed;
      }
    }

    // local avoidance: push off squadmates and steer around them
    const others = this.ai.agents;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o === this || !o.alive) continue;
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const d2 = dx * dx + dz * dz;
      const rr = (this.radius + o.radius + 0.42) ** 2;
      if (d2 > rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (1 - d / Math.sqrt(rr)) * 1.5;
      this._steer.x += (dx / d) * push;
      this._steer.z += (dz / d) * push;
      // tangential bias breaks head-on deadlocks deterministically
      this._steer.x += (-dz / d) * push * 0.35 * (this.id % 2 ? 1 : -1);
      this._steer.z += (dx / d) * push * 0.35 * (this.id % 2 ? 1 : -1);
      if (want === 0) want = this.desiredSpeed * 0.35;
    }

    if (this._steer.lengthSq() > 1e-6) this._steer.normalize();

    // speed: ease toward the request so starts and stops have weight
    const targetSpeed = want * (this.crouch ? 0.42 : 1) * (1 - this.suppression * 0.25);
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 7);
    if (this.speed < 0.05) this.speed = 0;

    // facing: the brain's point or heading; otherwise where we are going. A
    // running man faces his run unless the point is within 70 degrees of it.
    const moveYaw = Math.atan2(this._steer.x, this._steer.z);
    if (this.faceMode === 1) {
      const fy = Math.atan2(this.facePoint.x - this.position.x, this.facePoint.z - this.position.z);
      this.targetYaw = this.speed > 3.2 && !this.staged && Math.abs(wrapAngle(fy - moveYaw)) > 1.2 ? moveYaw : fy;
    } else if (this.faceMode === 2) {
      this.targetYaw = this.speed > 3.2 ? moveYaw : this.faceYawV;
    } else if (this.speed > 0.2) {
      this.targetYaw = moveYaw;
    }
    let dy = this.targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    // a big turn while standing still becomes a real turn-in-place step
    if (Math.abs(dy) > 0.9 && this.speed < 0.3) this.animator.turn(dy > 0 ? 1 : -1);
    const turnRate = this.speed > 0.3 ? 6.5 : 3.4;
    this.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, dy));

    /* integrate through the character controller */
    const c = this.controller;
    if (c) {
      const g = this.phys.gravity;
      this.velocity.y += g * dt;
      const vx = this._steer.x * this.speed;
      const vz = this._steer.z * this.speed;
      c.setHeight?.(this.crouch ? 1.16 * this.scale : this.height);
      c.move(vx * dt, this.velocity.y * dt, vz * dt);
      this.position.copy(c.position);
      this.grounded = c.grounded;
      if (c.grounded && this.velocity.y < 0) this.velocity.y = 0;

      // blocked by something low: vault it
      if (c.lastMoveBlocked && this.speed > 1.5 && this.vaultCooldown <= 0 && this.grounded) {
        this._tryVault();
      }
      if (c.lastMoveBlocked && this.speed > 0.5) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 1.1) {
          this.stuckTimer = 0;
          this.repathTimer = 0;
          if (this.hasMoveTarget) this._goTo(this.moveTarget);
        }
      } else this.stuckTimer = 0;
    } else {
      this.position.x += this._steer.x * this.speed * dt;
      this.position.z += this._steer.z * this.speed * dt;
    }
  }

  _tryVault() {
    const phys = this.phys;
    const fwd = this._v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const low = phys.raycast(
      this.position.x, this.position.y + 0.35, this.position.z,
      fwd.x, 0, fwd.z, 0.85, phys.MASK.WORLD
    );
    if (!low.hit) return;
    const high = phys.raycastAny(
      this.position.x, this.position.y + 1.25, this.position.z,
      fwd.x, 0, fwd.z, 1.1, phys.MASK.WORLD
    );
    if (high) return; // a wall, not a ledge
    // landing spot on the other side
    const lx = this.position.x + fwd.x * 1.5;
    const lz = this.position.z + fwd.z * 1.5;
    const y = this.ai.groundAt(lx, lz, this.position.y + 2.2);
    if (!Number.isFinite(y) || Math.abs(y - this.position.y) > 1.3) return;
    this.vaultCooldown = 2.5;
    this.animator.vault(0.8);
    this.vaultFrom = (this.vaultFrom ?? new THREE.Vector3()).copy(this.position);
    this.vaultTo = (this.vaultTo ?? new THREE.Vector3()).set(lx, y, lz);
    this.vaultT = 0;
  }

  /* ================================================================== */
  /* shooting                                                           */
  /* ================================================================== */

  /**
   * AIM, NOT AIMBOT. The gun points at the brain's `fireAt` (a point from
   * MEMORY: the last observed position, extrapolated along the observed
   * velocity by as much as this man's skill lets him lead), and each round
   * leaves with an angular error built from the things that make real shooters
   * miss (see _aimError). Rounds then fly through physics, so a target that
   * moved since the last look is simply missed.
   */
  _shoot(dt) {
    const now = this.ctx.time.elapsed;
    const T = this.fireTarget;
    const aimAt = this._v;
    if (this.wantFire || (T && T.actor?.alive && now - T.updT < 3 && this.aimWeight > 0.6)) {
      aimAt.copy(this.fireAt);
      // slow sway around the point: the human part of holding a rifle
      const err = this._aimSigma * 0.7;
      const w = now * 1.3 + this.id * 1.7;
      const dist = this.position.distanceTo(aimAt);
      aimAt.x += Math.sin(w) * err * dist;
      aimAt.y += Math.sin(w * 1.63 + 1.1) * err * dist * 0.6;
      aimAt.z += Math.cos(w * 0.77) * err * dist;
      this.aimTarget.lerp(aimAt, Math.min(1, dt * (5 + 5 * this.skill)));
    } else {
      let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if (this.faceMode === 1) {
        const dx = this.facePoint.x - this.position.x, dz = this.facePoint.z - this.position.z;
        const l = Math.hypot(dx, dz);
        if (l > 0.5) { fx = dx / l; fz = dz / l; }
      }
      this._v2.set(this.position.x + fx * 12, this.position.y + this.eyeHeight - 0.1, this.position.z + fz * 12);
      this.aimTarget.lerp(this._v2, Math.min(1, dt * 3));
    }

    if (!this.wantFire || this.animator.reloading || this.animator.vaulting) {
      if (!this.wantFire) this._burstShots = 0;
      return;
    }
    if (this.ammo <= 0) {
      this.startReload();
      return;
    }
    // first-sighting reaction: nobody fires on the frame he sees you
    if (T && now - T.acquiredT < this._firstShotDelay) return;
    // barrel roughly on target before the trigger
    const W = this.weapon;
    const R = this.roleDef;
    if (this.burstLeft <= 0) {
      if (this.burstCooldown > 0) return;
      this.burstLeft = this.rng.int(R.burst[0], R.burst[1]);
      this.burstCooldown = this.rng.range(R.burstGap[0], R.burstGap[1]) * (1.2 - 0.4 * this.skill) + this.suppression * 0.5;
      this._burstShots = 0;
      // rockets: rate-limited, only worth it at range or into a group
      if (W.projectile && !this.ai.rocketWorthIt(this, this.fireAt)) {
        this.burstLeft = 0;
        this.burstCooldown = 1.5;
        return;
      }
    }
    if (this.fireCooldown > 0) return;
    this.fireCooldown = 1 / this.fireRate;
    this.burstLeft--;
    this.ammo--;
    this._fireRound(now);
    this._burstShots++;
  }

  /** Angular error (radians, 1 sigma) for the next round. */
  _aimError(now) {
    const T = this.fireTarget;
    const W = this.weapon;
    let s = 0.011 * (1.75 - 1.15 * this.skill); // 0.019 raw .. 0.0066 elite
    if (T) {
      const d = Math.max(2, this.position.distanceTo(T.pos));
      // tracking: how fast he crosses our view, and how well we follow it
      const vx = T.vel.x, vz = T.vel.z;
      const tx = (T.pos.x - this.position.x) / d, tz = (T.pos.z - this.position.z) / d;
      const lateral = Math.abs(vx * tz - vz * tx);
      s += (lateral / d) * 0.35 * (1 - 0.5 * this.skill);
      // reaction: the first rounds after acquisition go wide
      s += 0.045 * Math.exp(-(now - T.acquiredT) / (0.45 + 0.4 * (1 - this.skill)));
      // partly hidden target
      s += (1 - T.visFrac) * 0.012;
    }
    s += this.speed * 0.009; // shooting on the move
    s += this.suppression * 0.022;
    s += this._burstShots * (W.bloom ?? 0.004); // bloom through the burst
    if (this.crouch) s *= 0.85;
    if (W.cls === 'sniper') s *= 0.35;
    s *= 1 + this._stun * 7;
    if (this.blindFire) s = Math.max(s, 0.09);
    return s;
  }

  _fireRound(now = this.ctx.time.elapsed) {
    const an = this.animator;
    const origin = an.muzzleWorld;
    // straight from the muzzle to the aim point, not down the animated bore:
    // IK is for the picture, the round goes where the man is aiming
    const dir = this._muzzleDir.copy(this.aimTarget).sub(origin);
    if (dir.lengthSq() < 1e-6) dir.copy(an.muzzleDir);
    dir.normalize();
    const s = this._aimError(now);
    this._aimSigma = s;
    dir.x += this.rng.gauss() * s;
    dir.y += this.rng.gauss() * s * 0.7;
    dir.z += this.rng.gauss() * s;
    dir.normalize();
    an.fire(this.weapon.cls === 'shotgun' || this.weapon.cls === 'sniper' || this.weapon.projectile ? 1.6 : 1);
    this.shotsFired++;
    this.ai.onAgentFire(this, origin, dir);
  }

  _throwGrenade(target) {
    this.grenadeCooldown = this.rng.range(16, 34);
    this.hasGrenade = false;
    const from = this._v.copy(this.animator.muzzleWorld);
    this.ai.throwGrenade(this, from, target);
  }

  /* ================================================================== */
  /* damage                                                             */
  /* ================================================================== */

  /**
   * Take a hit. NOTE: named `applyDamage`, not `damage` — the weapon's damage
   * value is a field on this object and a method of the same name would be
   * shadowed by it.
   * @param amount  post-falloff damage
   * @param part    'head' | 'torso' | 'arm' | 'leg'
   * @param point   world impact point
   * @param dir     incident direction (unit)
   */
  applyDamage(amount, part, point, dir, blast = null, source = null) {
    if (!this.alive) return;
    if (source) this.lastAttacker = source;
    this.lastHurtT = this.ctx.time.elapsed;
    this.health -= amount;
    this.alertness = 1;
    this.suppression = Math.min(1.6, this.suppression + 0.35);
    // knowing roughly where it came from (a direction, not a position)
    if (dir && point && !blast) this.perception.fromDamage(source, point, dir, this.ctx.time.elapsed);
    if (this.health < this.maxHealth * 0.4 && this.health > 0) this.callout('help');

    if (this.health <= 0) {
      this.die(point, dir, amount, part, blast, source);
      return;
    }
    this.bark('hurt');
    // hit reaction by region, with the side the round came from
    const side = dir ? Math.sign(dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw)) || 1 : 1;
    const region =
      part === 'head' ? 'head'
        : part === 'arm' ? (this._sideOf(point) < 0 ? 'armR' : 'armL')
          : part === 'leg' ? (this._sideOf(point) < 0 ? 'legR' : 'legL')
            : 'torso';
    this.animator.hit(region, side, Math.min(1.4, 0.5 + amount / 45));
    if (part === 'leg') this.speed *= 0.4;
  }

  /** Which side of the body a world point is on: <0 right, >0 left. */
  _sideOf(p) {
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    return dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
  }

  /**
   * @param point   world hit point (defaults to the chest)
   * @param dir     incident direction (defaults to +Z)
   * @param amount  the killing blow's damage
   * @param part    'head' | 'torso' | 'arm' | 'leg' — a headshot throws harder
   * @param blast   `{ position, radius, strength }` when an explosion did it:
   *                the doll is launched from the blast centre (see _launch)
   */
  die(point, dir, amount = 30, part = 'torso', blast = null, source = null) {
    if (!this.alive) return;
    if (source) this.lastAttacker = source;
    this.alive = false;
    this.state = STATE.DEAD;
    this.squad?.releaseFlank?.(this);
    this.squad?.releasePeek?.(this);
    this.wantFire = false;
    this.animator.enabled = false;
    this.ai.cover?.release(this.id);
    if (this.controller) this.phys.removeCharacter(this.controller);
    this.controller = null;
    for (const c of this.colliders) this.phys?.removeCollider(c);
    this.colliders.length = 0;

    // Impulse is N·s, and the ragdoll turns it into a velocity change on the
    // particles it lands near: a 5.56 round carries ~4 N·s, so anything in the
    // hundreds launches the body across the street instead of dropping it.
    // FLOP OPS: a headshot is a *little* too much — it snaps the head back and
    // folds the body over it — but still a drop, never a launch.
    const headshot = part === 'head';
    this.group.updateMatrixWorld(true);
    const impulse = this._v2
      .copy(dir ?? this._v.set(0, 0, 1))
      .normalize()
      .multiplyScalar(Math.min(5.5, 1.5 + amount * 0.02) * (headshot ? DEATH.headshotMul : DEATH.bodyMul));
    if (headshot) impulse.y += DEATH.headshotLift;
    const hitPoint = point ?? this._v.copy(this.position).setY(this.position.y + 1.2);

    // Own the hand-off: build the capsule spec from the *live* animated pose,
    // hand it to the solver and let it drive the skeleton from here. Setting
    // __ragdoll stops physics creating a second one off our death event.
    const rd = this._makeRagdoll(impulse, hitPoint, headshot);
    if (rd) {
      this.__ragdoll = rd;
      this.ragdoll = rd;
      if (blast) this._launch(rd, blast);
      else this._maybeDramatic(rd, impulse);
    }
    // Kill accounting for modes (EXPANSION.md §2): who, which side, by whom.
    // `killer` is the Agent, or the player system when Doug did it (the same
    // object `damage:dealt` names as its target when he is hit).
    const k = this.lastAttacker;
    const killerIsPlayer = !!k?.isPlayer;
    this.ctx.events.emit('actor:death', {
      actor: this,
      team: this.team,
      role: this.role,
      killer: killerIsPlayer ? k.system ?? this.ctx.peek('player') ?? 'player' : k ?? null,
      killerTeam: k?.team ?? null,
      killerName: k?.name ?? null,
      killerIsPlayer,
      point: hitPoint,
      impulse,
      headshot,
      blast: !!blast,
      dramatic: !!this.dramaticDeath,
    });
    this.deadTime = 0;
    this.ai.onAgentDeath?.(this);
    this._squadReport();
  }

  /**
   * Explosion death: throw the whole doll away from the blast, up and
   * cartwheeling (Ragdoll.blast, tuned in physics as BLAST). Deliberately too
   * much — a grenade at 1 m puts a man's boots 1.7 m off the ground — but
   * bounded: the solver clamps per-step travel and sweeps fast particles
   * against the world, so nothing leaves the level or passes through a wall.
   */
  _launch(rd, blast) {
    const p = blast.position;
    rd.blast(p.x, p.y, p.z, blast.radius ?? 6, blast.strength ?? 1);
  }

  /**
   * The rare theatrical death (DEATH.dramaticChance): the man spins on the
   * spot, arms out, and goes down in a long pirouette-and-fold, as if the
   * round had personally offended him. Deterministic per actor (derived from
   * id, no RNG draw) so captures and replays are stable.
   */
  _maybeDramatic(rd, impulse) {
    // cheap integer hash of the actor id -> [0,1)
    let h = (this.id * 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    const u = (h >>> 0) / 4294967296;
    if (!(u < DEATH.dramaticChance || this.forceDramatic)) return;
    this.dramaticDeath = true;
    // spin about the vertical (a pirouette) plus a little stagger along the
    // shot direction and a hop so the feet leave the floor for the turn
    const sgn = (h & 1) ? 1 : -1;
    rd.addSpin(0, 1, 0, DEATH.dramaticSpin * sgn);
    rd.addVelocity(impulse.x * 0.35, DEATH.dramaticHop, impulse.z * 0.35);
    rd.limp(DEATH.dramaticLimp);
  }

  /**
   * Tell the squad a man is down: the nearest surviving squadmate says so on
   * the radio (and the audio bark fires as a 'copy'). Deterministic pick.
   */
  _squadReport() {
    const sq = this.squad;
    if (!sq) return;
    let best = null;
    let bestD = Infinity;
    for (const m of sq.members) {
      if (m === this || !m.alive) continue;
      const d = m.position.distanceToSquared(this.position);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) best.radio('mandown', this);
  }

  /**
   * Hand the live pose to the ragdoll solver. `physics` derives the capsule
   * chain from the skeleton itself, so the doll starts exactly in the pose the
   * animator left — the death has no pop. `radiusRatio` fattens the capsules
   * (its default is thin enough that a settled body reads as a pancake).
   */
  _makeRagdoll(impulse, point, headshot = false) {
    const phys = this.phys;
    if (!phys) return null;
    // Fat capsules that start half-buried in the floor tunnel straight through
    // it: the contact normal flips once a bone's axis is on the far side. Lift
    // the pose clear of the ground for the one frame it takes to build the doll,
    // then put the group back — the body drops the 15 cm invisibly.
    const lift = 0.15 * this.scale;
    this.group.position.y += lift;
    this.group.updateMatrixWorld(true);
    const rd = phys.createRagdollFromSkeleton(this.mesh, {
      actor: this,
      mass: this.mass,
      radiusRatio: 0.42,
      // FLOP OPS: looser joints than a sim-accurate body. Wider swing and twist
      // limits and softer limit correction (see Ragdoll.limp) are what make a
      // body fold over a crate instead of landing like a dropped mannequin.
      cone: DEATH.cone,
      twist: DEATH.twist,
      iterations: 8,
      velocity: { x: this.velocity.x * 0.6, y: 0, z: this.velocity.z * 0.6 },
    });
    this.group.position.y -= lift;
    this.group.updateMatrixWorld(true);
    if (!rd) return null;
    if (impulse && point) {
      // wide radius: a tight one dumps all of it into whichever light bone is
      // nearest and whips the limb across the street
      // a headshot uses a tighter radius so the head and shoulders take it
      rd.applyImpulse(point.x, point.y, point.z, impulse.x, impulse.y, impulse.z, headshot ? 0.5 : 0.85);
    }
    rd.limp(DEATH.limp);
    if (this.ai.debugLog) {
      console.info(
        `[ai] ragdoll ${rd.boneCount} bones / ${rd.particleCount} particles, ` +
          `mask=${rd.mask} tris=${rd.world?.triCount}`
      );
    }
    return rd;
  }

  /* ================================================================== */
  /* drive the visual                                                   */
  /* ================================================================== */

  _drive(dt) {
    // root motion for a vault
    if (this.vaultT !== undefined && this.animator.vaulting && this.vaultFrom) {
      this.vaultT += dt / 0.8;
      const t = Math.min(1, this.vaultT);
      this.position.lerpVectors(this.vaultFrom, this.vaultTo, t);
      this.position.y += Math.sin(t * Math.PI) * 0.42;
      this.controller?.teleport(this.position.x, this.position.y, this.position.z);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);

    const moving = this.speed > 0.25;
    let clip;
    if (this.crouch) clip = moving ? 'crouchWalk' : 'crouchIdle';
    else if (this.speed > 2.6) clip = 'run';
    else if (moving) clip = 'walk';
    else clip = this.health < 35 ? 'hurtIdle' : 'idle';
    this.clip = clip;

    const an = this.animator;
    an.setState({
      clip,
      speed: this.speed,
      crouch: this.crouch,
      aimTarget: this.aimTarget,
      lookTarget: this.faceMode === 1 ? this.facePoint : this.aimTarget,
      aimWeight: this.aimWeight,
      suppress: Math.min(1, this.suppression * 0.8),
    });

    // ANIMATION RATE LOD. The pose write, the three IK chains and the two foot
    // ground rays are the whole per-actor cost, and for an actor that cannot
    // reach a pixel this frame (see AiSystem._updateRelevance) they buy nothing.
    // Evaluate a third as often and hand the solver the accumulated dt, so the
    // stride phase, the recoil envelope and the reload timeline stay on the same
    // clock — nothing skates or slides when the actor becomes visible again, and
    // the frame it does become visible is always a full evaluation because
    // lodIrrelevant is false by then.
    this._animAccum += dt;
    if (this.lodIrrelevant) {
      if (this._animSkip > 0) {
        this._animSkip--;
        return;
      }
      this._animSkip = 2; // one evaluation in three while nothing can see it
    } else {
      this._animSkip = 0;
    }
    an.update(this._animAccum, this.ctx.time.elapsed);
    this._animAccum = 0;
  }

  /** Push the hit capsules onto the animated skeleton. */
  syncHitboxes() {
    if (!this.alive) return;
    const an = this.animator;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      const { a, b } = c.userData;
      an.bonePos(a, this._boneA);
      an.bonePos(b, this._boneB);
      c.setSegment(
        this._boneA.x, this._boneA.y, this._boneA.z,
        this._boneB.x, this._boneB.y, this._boneB.z
      );
    }
  }

  dispose() {
    if (this.controller) this.phys?.removeCharacter(this.controller);
    for (const c of this.colliders) this.phys?.removeCollider(c);
    this.colliders.length = 0;
    if (this.ragdoll) this.phys?.removeRagdoll(this.ragdoll);
    // Per-instance GPU resource. RIG.createSkeleton() mints fresh bones + a fresh
    // THREE.Skeleton for every agent, and three uploads one bone DataTexture per
    // skeleton (Skeleton.computeBoneTexture). Without this, each spawn->dispose
    // wave churn leaks ~1 GPU texture per soldier, unbounded. Skeleton.dispose()
    // frees that boneTexture and is idempotent. The SkinnedMesh geometry and
    // materials are SHARED/cached on the variant (AiSystem._variants) and are
    // disposed by AiSystem at teardown — never dispose them here.
    this.skeleton?.dispose();
    this.group.parent?.remove(this.group);
  }
}
