import * as THREE from 'three';
import { EQUIPMENT_DEFS, EQUIPMENT_COPY, EQUIPMENT_IDS } from './defs.js';
import { buildFrag, buildFlash, buildSemtex, buildMolotov, buildSmoke, buildConcussion } from './models/grenades.js';
import { buildThrowingKnife } from './models/knives.js';
import { clamp01, smoothstep, lerp } from './mathx.js';
import { EquipmentSfx } from './sfx.js';

/**
 * EQUIPMENT — the player's frag (lethal, G) and flashbang (tactical, Q).
 *
 * THE THROW
 *   press      the gun lowers, the throwing hand comes up with the grenade
 *   prime      0.30 s; at its end the pin is out and the fuse is burning
 *   hold       while the key is held the grenade is COOKED: the fuse keeps
 *              running in the hand (HUD ring via getHudState().cook). Hold a
 *              frag past its fuse and it goes off in your hand.
 *   release    the arm swings through and the grenade leaves the hand at the
 *              release point with the view direction lofted a few degrees, at
 *              `throwSpeed`, PLUS the player's own velocity
 *   recover    the gun comes back up
 * A tap runs the whole thing with no extra cook. A press during a reload
 * cancels the reload (the magazine state is only committed at `magin`, so a
 * cancelled reload changes nothing); a press while sprinting waits for the
 * sprint pose to come down first.
 *
 * IN FLIGHT the grenade is a real physics rigid body (a sphere for the frag, a
 * capsule for the flashbang) with CCD, so it bounces off walls, rolls down
 * slopes and settles; the fuse runs in fixedUpdate.
 *
 * DETONATION
 *   frag   the canonical `explosion { position, radius, damage, impulse, owner,
 *          kind:'frag', team }`. Damage is applied by each target's OWN
 *          listener (ai + player both occlusion-test the blast), fx draws it,
 *          audio spatialises it and deafens, physics shoves props and bodies,
 *          and the player shakes. A frag cooked off in the hand damages the
 *          player through exactly the same path.
 *   flash  `flash:detonate { position, radius, owner, team }`, then:
 *          player  player.flash(intensity, duration) — see `flashIntensity`
 *          ai      agent.stun(intensity, duration) where the agent implements it
 *                  (suppression + hearing as the fallback). AI may ALSO listen
 *                  to flash:detonate for barks/reactions but must not stun a
 *                  second time off it: the emitter has already applied it.
 */

const PRIME = 0.3;
const THROW = 0.36;
const RELEASE_AT = 0.48;
const RECOVER = 0.34;
const WAIT_MAX = 0.6;
const POOL_PER_KIND = 4;
const KIND_POOL = { throwing_knife: 6, smoke: 3 };
const DART_SLOTS = 12;
const CLOUD_SLOTS = 4;
const FIRE_SLOTS = 4;
const BURN_SLOTS = 16;
const GRAVITY = -9.81;

/**
 * THE COMMENT-PASS THROWABLES (EXPANSION §10.4), same G / Q, same state
 * machine, picked per def (`defs.js`, `flight`):
 *   semtex          swept projectile, glues itself to the first surface or body
 *                   it touches (and rides that body's bone, ragdoll included),
 *                   beeps faster as its fixed fuse runs down, then the canonical
 *                   `explosion { kind:'semtex' }`.
 *   molotov         swept projectile, shatters on first contact into a fire
 *                   area (`fireRadius`, `fireTime`): flames, light, smoke, a
 *                   `damage:dealt` burn tick (zone 'torso', `ammo.burn`) on
 *                   everyone standing in it plus a short afterburn, and an AI
 *                   avoid query `hazardAt(pos)`.
 *   throwing_knife  fast, nearly flat, spinning; sticks in walls and bodies;
 *                   head/torso one hit, limbs heavy; picked back up by walking
 *                   over it or pressing F (`use`) near it.
 *   smoke           rigid body; on its fuse it vents a cloud that grows for ~3 s,
 *                   holds, then thins out over `duration`. `smokeBlocks(from, to)`
 *                   is the sight test AI perception calls.
 *   concussion      rigid body; `concussion:detonate`, no blind: the player is
 *                   slowed and his view wobbles (`slowMult`, camera kicks),
 *                   bots get `agent.stun()` capped under the blind threshold.
 */

/** Swept-projectile mask: world, props, debris, live hitboxes. Not glass, not foliage. */
const DART_MASK_BITS = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 4) | (1 << 9);

/** fx atlas tiles (src/fx/atlas.js P) — read as numbers, never imported. */
const TILE = { SMOKE_A: 0, SMOKE_B: 1, SPARK: 4, CHIP: 8, FIRE: 14 };

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _negZ = new THREE.Vector3(0, 0, -1);
const _upY = new THREE.Vector3(0, 1, 0);

/** Every throwable id, both slots, in menu order. */
export const EQUIPMENT_KINDS = [...EQUIPMENT_IDS.lethal, ...EQUIPMENT_IDS.tactical];

/**
 * The loadout registry (EXPANSION §10.4): `{ lethal: [{id,label,desc,count,max,displayName}],
 * tactical: [...] }`. Freshly allocated: build menus with it, not frames.
 */
export function equipmentRegistry() {
  const row = (id) => ({
    id,
    label: EQUIPMENT_COPY[id]?.label ?? EQUIPMENT_DEFS[id].displayName,
    desc: EQUIPMENT_COPY[id]?.desc ?? '',
    count: EQUIPMENT_DEFS[id].count,
    max: EQUIPMENT_DEFS[id].max,
    displayName: EQUIPMENT_DEFS[id].displayName,
  });
  return { lethal: EQUIPMENT_IDS.lethal.map(row), tactical: EQUIPMENT_IDS.tactical.map(row) };
}
export const EQUIPMENT = EQUIPMENT_DEFS;

/**
 * EXPANSION §10.4: does live smoke block the sight line from `from` to `to`?
 * Reached at runtime (`ctx.peek('weapons').smokeBlocks`), so callers in other
 * subsystems never import this module; this export is the same test.
 */
export function smokeBlocks(ctx, from, to) {
  return ctx?.peek?.('weapons')?.equipment?.smokeBlocks(from, to) ?? false;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Equipment {
  /**
   * @param {object} ctx
   * @param {import('./index.js').WeaponSystem} weapons
   */
  constructor(ctx, weapons) {
    this.ctx = ctx;
    this.weapons = weapons;
    this.rng = ctx.rng.fork();
    this.defs = EQUIPMENT_DEFS;
    /** Loadout: which item sits in each slot. */
    this.lethal = 'frag';
    this.tactical = 'flash';
    this.counts = {};
    for (const k of Object.keys(EQUIPMENT_DEFS)) this.counts[k] = EQUIPMENT_DEFS[k].count;

    // Throw state machine.
    this.th = { phase: 'idle', kind: null, t: 0, held: false, cook: 0, released: false, queued: null, wait: 0 };

    this.live = [];
    this._pool = {};
    for (const k of Object.keys(EQUIPMENT_DEFS)) this._pool[k] = [];
    this._records = [];
    for (let i = 0; i < POOL_PER_KIND * 4; i++) {
      this._records.push({ active: false, kind: null, body: null, mesh: null, fuse: 0, owner: null, bounced: false, marked: false });
    }
    this._impactPos = new THREE.Vector3();
    this._throwPayload = { kind: null, owner: null, position: new THREE.Vector3(), velocity: new THREE.Vector3() };

    // Player flash state (the white-out).
    this.flashLevel = 0;
    this.flashHold = 0;
    this.flashRate = 1;
    this.flashBlur = 0;

    this.stats = { thrown: 0, detonated: 0, cookedOff: 0, lastFlash: null, stuck: 0, pickedUp: 0, knifeHits: 0, burnTicks: 0 };

    // ---- swept projectiles (semtex, molotov, throwing knife) -------------
    this.darts = [];
    this._darts = [];
    for (let i = 0; i < DART_SLOTS; i++) {
      this._darts.push({
        active: false, kind: null, state: 'flight', slot: null, owner: null,
        pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
        base: new THREE.Quaternion(), angle: 0, spin: 0, age: 0, fuse: 0, beepT: 0, life: 0,
        agent: null, bone: null, local: new THREE.Matrix4(), world: new THREE.Matrix4(),
        normal: new THREE.Vector3(), surface: 'concrete',
      });
    }
    // ---- smoke clouds, fires, burning victims -----------------------------
    this.clouds = [];
    for (let i = 0; i < CLOUD_SLOTS; i++) {
      this.clouds.push({ active: false, pos: new THREE.Vector3(), t: 0, dur: 12, R: 4.8, acc: 0, rec: null, loop: null });
    }
    this.fires = [];
    for (let i = 0; i < FIRE_SLOTS; i++) {
      this.fires.push({ active: false, pos: new THREE.Vector3(), t: 0, dur: 6, R: 2.7, owner: null, acc: 0, sacc: 0, eacc: 0, tick: 0, light: null, loop: null });
    }
    this._burns = [];
    for (let i = 0; i < BURN_SLOTS; i++) this._burns.push({ target: null, t: 0, owner: null, fire: null, tick: 0 });
    this._burnPayload = {
      target: null, amount: 0, headshot: false, killed: false, part: 'torso', zone: 'torso',
      point: new THREE.Vector3(), from: new THREE.Vector3(), incident: null, source: undefined,
      weapon: 'molotov', kind: 'fire', ammo: { id: 'molotov', burn: { dps: EQUIPMENT_DEFS.molotov.dps, dur: EQUIPMENT_DEFS.molotov.afterburn } },
    };
    this._hitPayload = {
      target: null, amount: 0, headshot: false, killed: false, part: 'torso', zone: 'torso',
      point: new THREE.Vector3(), incident: new THREE.Vector3(), weapon: 'throwing_knife',
      ammo: { id: 'throwing_knife', armorPen: 0.6 },
    };
    // ---- concussion on the player -----------------------------------------
    this.concussLevel = 0;
    this.concussRate = 0;
    this._wob = 0;
    /** Movement multiplier the weapons system folds into moveSpeedScale. */
    this.slowMult = 1;
    // ---- one particle descriptor, reused for every sprite -----------------
    this._sp = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size0: 0.2, size1: 0.3, sizeCurve: 1,
      life: 1, delay: 0, drag: 1.4, gravity: 0, rot: 0, spin: 0, stretch: 0,
      r0: 1, g0: 1, b0: 1, i0: 1, r1: 1, g1: 1, b1: 1, i1: 0,
      tile: 0, soft: 0.4, alpha: 1, alphaCurve: 1, turb: 0, turbFreq: 1, seed: 0, flags: 0,
    };
    this._promptShown = false;
    this.sfx = new EquipmentSfx(ctx);
    this._owned = [];
  }

  /* ====================================================================== */
  /*  construction                                                          */
  /* ====================================================================== */

  /** Build the world pool and the in-hand copies. Called from weapons.init. */
  build(mats, viewmodel) {
    const bake = mats.lib?.bakeMasks?.bind(mats.lib) ?? null;
    const kinds = {
      frag: buildFrag(),
      flash: buildFlash(),
      semtex: buildSemtex(),
      molotov: buildMolotov(),
      smoke: buildSmoke(),
      concussion: buildConcussion(),
      throwing_knife: buildThrowingKnife(),
    };
    this.shapes = {};
    this._geos = [];
    for (const kind of Object.keys(kinds)) {
      const { asm, radius, halfHeight } = kinds[kind];
      this.shapes[kind] = { radius, halfHeight };
      const map = asm.build();
      const parts = [];
      for (const [matKey, geo] of map) {
        // The bottle glass, the fuel and the LED are smooth; the masks are for metal and paint.
        if (bake && !matKey.startsWith('eq_')) bake(geo, { wear: 1, grime: 1, ao: 1, edgeThreshold: 0.16, rng: this.rng });
        this._geos.push(geo);
        parts.push({ geo, mat: this._mat(mats, matKey) });
      }
      const make = (name) => {
        const g = new THREE.Group();
        g.name = name;
        for (const p of parts) {
          const m = new THREE.Mesh(p.geo, p.mat);
          m.castShadow = true;
          m.receiveShadow = true;
          g.add(m);
        }
        return g;
      };
      const n = KIND_POOL[kind] ?? POOL_PER_KIND;
      for (let i = 0; i < n; i++) {
        const g = make(`ow-${kind}-${i}`);
        g.visible = false;
        // Tiny: keep them out of the shadow cascades and the prepass.
        g.traverse((o) => {
          if (o.isMesh) {
            o.userData.owNoShadow = true;
          }
        });
        this.ctx.scene.add(g);
        this._pool[kind].push({ group: g, busy: false });
      }
      const hand = make(`ow-${kind}-hand`);
      viewmodel.addThrowItem(kind, hand);
      this._seatInHand(kind, hand);
    }
  }

  /**
   * Materials: the shared weapon set, plus the three this file owns (bottle
   * glass, fuel and the semtex LED have no library equivalent).
   */
  _mat(mats, key) {
    if (!key.startsWith('eq_')) return mats.get(key);
    this._eqMats = this._eqMats ?? {};
    if (this._eqMats[key]) return this._eqMats[key];
    let m;
    if (key === 'eq_bottle') {
      m = new THREE.MeshPhysicalMaterial({
        color: 0x3d5a2a, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55,
        ior: 1.5, specularIntensity: 1, envMapIntensity: 0.7, depthWrite: false,
      });
    } else if (key === 'eq_fuel') {
      m = new THREE.MeshStandardMaterial({ color: 0x8a5a14, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.85 });
    } else {
      m = new THREE.MeshStandardMaterial({ color: 0x300404, emissive: 0xff1a0a, emissiveIntensity: 2.5, roughness: 0.3 });
    }
    m.name = 'ow-' + key;
    this._eqMats[key] = m;
    this._owned.push(m);
    return m;
  }

  /** How each throwable sits in the throwing hand (default: the grenade seat). */
  _seatInHand(kind, g) {
    if (kind === 'molotov') {
      // Held by the neck, the bottle below the fist.
      g.position.set(0.004, -0.03, -0.06);
      g.rotation.set(1.9, 0, -0.15);
    } else if (kind === 'throwing_knife') {
      // Pinched by the blade, the handle back along the fingers.
      g.position.set(0.02, -0.03, -0.075);
      g.rotation.set(0.1, Math.PI / 2 + 0.2, 0.3);
    } else if (kind === 'semtex') {
      g.position.set(0.004, -0.034, -0.07);
      g.rotation.set(0.35, 0.3, -0.2);
    }
  }

  /* ====================================================================== */
  /*  public                                                                */
  /* ====================================================================== */

  get lethalCount() {
    return this.counts[this.lethal] ?? 0;
  }

  get tacticalCount() {
    return this.counts[this.tactical] ?? 0;
  }

  get throwing() {
    return this.th.phase !== 'idle';
  }

  /** 0..1 of the fuse burnt while the grenade is still in the hand; -1 otherwise. */
  get cookFraction() {
    const th = this.th;
    if (th.phase !== 'hold' && !(th.phase === 'throw' && !th.released)) return -1;
    const def = this.defs[th.kind];
    if (def.cook === false) return -1;
    return clamp01(th.cook / def.fuse);
  }

  get cookRemaining() {
    const th = this.th;
    const f = this.cookFraction;
    if (f < 0) return 0;
    return Math.max(0, this.defs[th.kind].fuse - th.cook);
  }

  setLoadout(lethal, tactical) {
    if (lethal && this.defs[lethal]?.slot === 'lethal') this.lethal = lethal;
    if (tactical && this.defs[tactical]?.slot === 'tactical') this.tactical = tactical;
  }

  /** Refill both slots to their loadout count. */
  resupply() {
    for (const k of Object.keys(this.counts)) this.counts[k] = this.defs[k].count;
  }

  /** Add to one item's count, capped. Returns the new count. */
  give(kind, n = 1) {
    const d = this.defs[kind];
    if (!d) return 0;
    this.counts[kind] = Math.min(d.max, (this.counts[kind] ?? 0) + n);
    return this.counts[kind];
  }

  /**
   * Begin a throw of `kind` ('frag' | 'flash'). Returns true if a throw started
   * or was queued. Every press either starts one, queues one behind the
   * recovery of the last, or is refused because the slot is empty.
   */
  request(kind, held = true) {
    const th = this.th;
    if (this.weapons.melee?.active) return false;
    if ((this.counts[kind] ?? 0) <= 0) {
      this._emptyClick();
      return false;
    }
    if (th.phase === 'recover') {
      th.queued = kind;
      return true;
    }
    if (th.phase !== 'idle') return false;
    th.phase = 'wait';
    th.kind = kind;
    th.t = 0;
    th.wait = 0;
    th.held = held;
    th.cook = 0;
    th.released = false;
    // Reloading? CoD cancels the reload; the mag state is only committed at
    // 'magin', so nothing about the ammo changes.
    this.weapons.cancelReload?.();
    if (this.weapons.inspecting) this.weapons.viewmodel.stopClip();
    return true;
  }

  /* ====================================================================== */
  /*  frame                                                                 */
  /* ====================================================================== */

  /**
   * @param {number} dt
   * @param {object} input  ctx.input (only read when `live`)
   * @param {boolean} live  gameplay input is live
   */
  update(dt, input, live) {
    const th = this.th;
    if (!live) th.held = !!this.scriptHeld;
    if (live) {
      const lethalKey = input.actionPressed('grenade');
      const tacKey = input.actionPressed('tactical');
      if (lethalKey) this.request(this.lethal, true);
      else if (tacKey) this.request(this.tactical, true);
      if (th.phase !== 'idle' && th.kind) {
        const key = th.kind === this.lethal ? 'grenade' : 'tactical';
        if (!input.action(key)) th.held = false;
      }
    }

    const vm = this.weapons.viewmodel;
    switch (th.phase) {
      case 'idle':
        break;
      case 'wait': {
        th.wait += dt;
        const ready = !this.weapons.switching && (vm.sprintT < 0.35 || th.wait > WAIT_MAX);
        if (ready) this._enter('prime');
        break;
      }
      case 'prime':
        th.t += dt;
        if (th.t >= (this.defs[th.kind].prime ?? PRIME)) {
          // Pin out, spoon held: the fuse is now burning.
          this._pinSound(th.kind);
          this._enter(th.held ? 'hold' : 'throw');
        }
        break;
      case 'hold': {
        th.t += dt;
        const cooks = this.defs[th.kind].cook !== false;
        if (cooks) th.cook += dt;
        if (cooks && th.cook >= this.defs[th.kind].fuse) {
          this._cookOff();
          break;
        }
        if (!th.held) this._enter('throw');
        break;
      }
      case 'throw':
        th.t += dt;
        if (!th.released) {
          const cooks = this.defs[th.kind].cook !== false;
          if (cooks) th.cook += dt;
          if (cooks && th.cook >= this.defs[th.kind].fuse) {
            this._cookOff();
            break;
          }
          if (th.t >= THROW * RELEASE_AT) {
            th.released = true;
            this._release(th.kind, this.defs[th.kind].fuse - th.cook);
          }
        }
        if (th.t >= THROW) this._enter('recover');
        break;
      case 'recover':
        th.t += dt;
        if (th.t >= RECOVER) {
          th.phase = 'idle';
          th.kind = null;
          if (th.queued) {
            const q = th.queued;
            th.queued = null;
            this.request(q, live ? input.action(q === this.lethal ? 'grenade' : 'tactical') : false);
          }
        }
        break;
      default:
        th.phase = 'idle';
    }

    // Drive the viewmodel's throw layer.
    const tn =
      th.phase === 'prime' ? th.t / (this.defs[th.kind]?.prime ?? PRIME)
        : th.phase === 'throw' ? th.t / THROW
          : th.phase === 'recover' ? th.t / RECOVER
            : th.phase === 'hold' ? th.t : 0;
    const f = this.cookFraction;
    // The melee layer owns the throwing arm while a knife swing runs.
    if (!this.weapons.melee?.active) vm.setThrow(th.phase, tn, th.kind, f > 0.6 ? (f - 0.6) / 0.4 : 0, th.released);

    this._updateFlash(dt);
    this._updateDarts(dt, input, live);
    this._updateClouds(dt);
    this._updateFires(dt);
    this._updateConcussion(dt);
    this.sfx.update();
  }

  _enter(phase) {
    this.th.phase = phase;
    this.th.t = 0;
  }

  /** Fuses tick on the physics clock so detonation is frame-rate independent. */
  fixedUpdate(h) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      if (g.deployed) continue; // a smoke canister venting: its cloud retires it
      g.fuse -= h;
      if (g.fuse <= 0) {
        if (g.kind === 'smoke') {
          g.deployed = true;
          this._deploySmoke(g);
          continue;
        }
        this.live.splice(i, 1);
        this._detonate(g.kind, g.body.position, g.owner);
        this._retire(g);
      }
    }
    this._stepDarts(h);
  }

  /* ====================================================================== */
  /*  throw                                                                 */
  /* ====================================================================== */

  /** Hand position in world space at the moment of release (camera space (0.07, 0.03, -0.42)). */
  _releasePoint(out) {
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    out.copy(cam.position).addScaledVector(_right, 0.07).addScaledVector(_up, 0.03).addScaledVector(_fwd, 0.42);
    // Never spawn inside a wall the player is hugging: pull the release point
    // back along the eye->hand ray to just short of whatever is in the way.
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    if (phys?.raycast) {
      _v2.copy(out).sub(cam.position);
      const len = _v2.length();
      const r = this.shapes?.frag?.radius ?? 0.033;
      const hit = phys.raycast(cam.position, _v2, len + r + 0.03, phys.MASK?.DEBRIS);
      if (hit?.hit) {
        const safe = Math.max(0.04, hit.distance - r - 0.03);
        out.copy(cam.position).addScaledVector(_v2.divideScalar(len), safe);
      }
    }
    return out;
  }

  _release(kind, fuseLeft) {
    const def = this.defs[kind];
    this.counts[kind] = Math.max(0, (this.counts[kind] ?? 0) - 1);
    const pos = this._releasePoint(this._throwPayload.position);
    // Velocity: the view direction lofted `def.loft` degrees about the camera's
    // right axis, at throwSpeed, plus the thrower's own velocity.
    const cam = this.ctx.camera;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const vel = this._throwPayload.velocity.copy(_fwd).applyAxisAngle(_right, (def.loft * Math.PI) / 180);
    vel.multiplyScalar(def.throwSpeed);
    const pv = this.ctx.peek('player')?.velocity;
    if (pv) vel.add(pv);
    const owner = this.ctx.peek('player') ?? null;
    const flight = def.flight ?? 'body';
    const g = flight === 'body' ? this._spawn(kind, pos, vel, Math.max(0.05, fuseLeft), owner) : null;
    if (flight !== 'body') this._spawnDart(kind, pos, vel, Math.max(0.05, fuseLeft), owner);
    if (g) {
      // End-over-end tumble about the throwing arm's swing axis.
      g.body.angularVelocity.copy(_right).multiplyScalar(-11);
      g.body.angularVelocity.y += this.rng.signed() * 3;
    }
    this.stats.thrown++;
    if (flight === 'body' || kind === 'semtex') this._spoonSound();
    else this.sfx.toss(kind === 'throwing_knife' ? 1.3 : 1);
    const p = this._throwPayload;
    p.kind = kind;
    p.owner = owner;
    this.ctx.events.emit('grenade:throw', p);
    return g;
  }

  /** Spawn a live grenade body. Returns its record (or null if the pool is exhausted). */
  _spawn(kind, pos, vel, fuse, owner) {
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    const rec = this._records.find((r) => !r.active);
    const slot = this._pool[kind].find((s) => !s.busy);
    if (!phys?.addRigidBody || !rec || !slot) {
      // No physics (standalone harness) or an absurd number in the air at once:
      // detonate where it is rather than silently eating the grenade.
      this._detonate(kind, pos, owner);
      return null;
    }
    const def = this.defs[kind];
    const shape = this.shapes[kind];
    const r = shape.radius;
    const hh = shape.halfHeight;
    slot.busy = true;
    slot.group.visible = true;
    slot.group.position.copy(pos);
    const body = phys.addRigidBody({
      shape: def.shape,
      radius: r,
      halfHeight: hh,
      // Real half extents, so the CCD core and broadphase bound are the
      // grenade's size and not the 0.1 m default (which would stop it 6 cm
      // short of every wall).
      halfExtents: { x: r, y: r + hh, z: r },
      mass: def.mass,
      position: pos,
      velocity: vel,
      restitution: def.restitution,
      friction: def.friction,
      linearDamping: 0.05,
      angularDamping: 0.9,
      gravityScale: def.gravityScale,
      lifetime: fuse + 2 + (kind === 'smoke' ? def.duration + 1 : 0),
      object3D: slot.group,
      surfaceType: 'metal',
      onImpact: (b, px, py, pz, nx, ny, nz, speed) => this._onBounce(rec, px, py, pz, speed),
    });
    rec.active = true;
    rec.kind = kind;
    rec.body = body;
    rec.slot = slot;
    rec.fuse = fuse;
    rec.owner = owner;
    rec.bounced = false;
    rec.marked = false;
    rec.deployed = false;
    this.live.push(rec);
    return rec;
  }

  _onBounce(rec, x, y, z, speed) {
    const audio = this.ctx.peek('audio');
    this._impactPos.set(x, y, z);
    audio?.play?.('impact', this._impactPos, { surface: 'metal', energy: Math.min(1, speed / 9) * 0.6 });
    if (!rec.bounced) {
      rec.bounced = true;
      // Danger indicator for the player's own frag landing close.
      if (rec.kind === 'frag' && !rec.marked) {
        const cam = this.ctx.camera;
        if (cam.position.distanceTo(this._impactPos) < 10) {
          rec.marked = true;
          this.ctx.peek('ui')?.spawnGrenade?.(this._impactPos, Math.max(0.2, rec.fuse));
        }
      }
    }
  }

  _retire(rec) {
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    if (rec.body && phys?.removeRigidBody) phys.removeRigidBody(rec.body);
    if (rec.slot) {
      rec.slot.busy = false;
      rec.slot.group.visible = false;
    }
    rec.active = false;
    rec.body = null;
    rec.slot = null;
    rec.owner = null;
  }

  /** Held too long: it goes off in the hand. */
  _cookOff() {
    const th = this.th;
    const kind = th.kind;
    this.counts[kind] = Math.max(0, (this.counts[kind] ?? 0) - 1);
    const pos = this._releasePoint(this._cookPos ?? (this._cookPos = new THREE.Vector3()));
    // In the hand is ~0.35 m in front of and below the eye.
    const cam = this.ctx.camera;
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    pos.addScaledVector(_up, -0.12);
    this.stats.cookedOff++;
    th.released = true;
    this._enter('recover');
    this._detonate(kind, pos, this.ctx.peek('player') ?? null);
  }

  /* ====================================================================== */
  /*  detonation                                                            */
  /* ====================================================================== */

  _detonate(kind, where, owner) {
    this.stats.detonated++;
    // Lift the charge a little off whatever it is resting on: every listener
    // occlusion-tests a ray from this point, and a ray that starts 3 cm above a
    // tessellated floor grazes it and reads as blocked. Never lift it into a
    // ceiling.
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    let lift = 0.22;
    if (phys?.raycast) {
      // Start the probe a few cm up: a ray starting ON the floor reports the
      // floor itself at distance 0.
      const up = phys.raycast(where.x, where.y + 0.04, where.z, 0, 1, 0, lift + 0.02, phys.MASK?.WORLD);
      if (up?.hit) lift = Math.max(0.04, up.distance + 0.04 - 0.06);
    }
    const pos = new THREE.Vector3(where.x, where.y + lift, where.z); // per event, not per frame
    if (kind === 'flash') this._flashbang(pos, owner);
    else if (kind === 'concussion') this._concussion(pos, owner);
    else if (kind === 'semtex') this._frag(pos, owner, 'semtex');
    else if (kind === 'molotov') this._ignite(where, owner);
    else if (kind === 'smoke') this._smokeAt(where);
    else this._frag(pos, owner);
  }

  _frag(pos, owner, kind = 'frag') {
    const def = this.defs[kind];
    this.ctx.events.emit('explosion', {
      position: pos,
      radius: def.radius,
      damage: def.damage,
      impulse: def.impulse,
      owner,
      source: owner,
      team: owner?.team ?? (owner?.isPlayer ? 'esf' : undefined),
      kind,
    });
  }

  _flashbang(pos, owner) {
    const def = this.defs.flash;
    const team = owner?.team ?? (owner?.isPlayer ? 'esf' : undefined);
    this.ctx.events.emit('flash:detonate', { position: pos, radius: def.radius, owner, team, kind: 'flash' });

    // ---- the bang: a short sharp report, fx light + shock ring ------------
    const audio = this.ctx.peek('audio');
    audio?.play?.('explosion', pos, { radius: 2.4, level: 0.75 });
    const fx = this.ctx.peek('fx');
    if (fx) {
      fx.lights?.flash?.(pos.x, pos.y + 0.1, pos.z, 1, 0.97, 0.92, 9000, 0.22, 16, 26, 3);
      fx.hazeRing?.(pos.x, pos.y, pos.z, 0.4, 5, 0.35, 1.2);
      fx.haze?.(pos.x, pos.y + 0.2, pos.z, 0.6, 1.8, 1.2, 0.8);
    }

    // ---- player ------------------------------------------------------------
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const r = this.flashIntensity(pos, cam.position, _fwd, def.radius);
    this.stats.lastFlash = r;
    const player = this.ctx.peek('player');
    if (r.intensity > 0.01) {
      if (player?.flash) player.flash(r.intensity, r.duration);
      else this.flashPlayer(r.intensity, r.duration);
    }
    // The bang deafens whether or not you saw it (walls do not stop 170 dB).
    const deaf = r.distance < def.radius ? clamp01(1 - r.distance / def.radius) : 0;
    const ring = Math.max(r.intensity, deaf * (r.los ? 1 : 0.5));
    if (ring > 0.05) this._concuss(0.35 + 0.65 * ring);

    // ---- ai --------------------------------------------------------------
    const ai = this.ctx.peek('ai');
    const agents = ai?.agents;
    if (agents) {
      for (const a of agents) {
        if (!a?.alive) continue;
        if (team && a.team === team) continue; // no friendly flashes
        const eye = a.eye ?? a.position;
        if (!eye) continue;
        if (a.forward) _v.copy(a.forward);
        else _v.set(Math.sin(a.yaw ?? 0), 0, Math.cos(a.yaw ?? 0));
        const ar = this.flashIntensity(pos, eye, _v, def.radius);
        a.hear?.(pos, 60);
        if (ar.intensity <= 0.02) continue;
        if (typeof a.stun === 'function') a.stun(ar.intensity, ar.duration);
        else a.suppress?.(1.2 * ar.intensity);
      }
    }
  }

  /**
   * How hard a flash at `pos` hits an observer at `eye` looking along `fwd`.
   *   distance  (1 - d/r)^0.7 — anything inside the radius is affected
   *   sight     a physics ray from the flash to the eye (glass does not stop
   *             light, walls do): blocked = 0
   *   angle     the dot of the view direction with the direction to the flash,
   *             from 1.0 looking straight at it to 0.22 facing away; point blank
   *             (under 2.5 m) is at least 0.55 whichever way you face
   * @returns {{intensity, duration, distance, los, facing}}
   */
  flashIntensity(pos, eye, fwd, radius = this.defs.flash.radius) {
    const out = this._flashOut ?? (this._flashOut = { intensity: 0, duration: 0, distance: 0, los: false, facing: 0 });
    _v2.copy(pos).sub(eye);
    const d = _v2.length();
    out.distance = d;
    out.intensity = 0;
    out.duration = 0;
    out.los = false;
    out.facing = 0;
    if (d > radius) return out;
    const phys = this.weapons.physics ?? this.ctx.peek('physics');
    out.los = phys?.lineOfSight ? phys.lineOfSight(pos, eye, phys.MASK?.SIGHT) : true;
    if (!out.los) return out;
    const dir = d > 1e-4 ? _v2.divideScalar(d) : _v2.set(0, 0, 0);
    const fl = fwd.length() || 1;
    const facing = d > 1e-4 ? (dir.x * fwd.x + dir.y * fwd.y + dir.z * fwd.z) / fl : 1;
    out.facing = facing;
    const distF = Math.pow(clamp01(1 - d / radius), 0.7);
    let angF = lerp(0.22, 1, smoothstep(-0.35, 0.8, facing));
    if (d < 2.5) angF = Math.max(angF, 0.55);
    out.intensity = clamp01(distF * angF * 1.08);
    out.duration = 0.6 + 4.4 * out.intensity;
    return out;
  }

  /**
   * The player's white-out. Full white for the first ~30% of `duration`, then an
   * exponential fade to ~2% by `duration`, and a blur that outlives the white.
   * A new flash only ever raises the level (two flashes do not stack past 1).
   */
  flashPlayer(intensity, duration) {
    const i = clamp01(intensity);
    if (i <= 0) return;
    const d = Math.max(0.3, duration);
    if (i >= this.flashLevel) {
      this.flashLevel = i;
      this.flashHold = d * 0.3 * i;
      this.flashRate = Math.log(50) / Math.max(0.2, d - this.flashHold);
    }
    this.flashBlur = Math.max(this.flashBlur, 10 * i);
    this.ctx.peek('player')?.addTrauma?.(0.25 * i);
  }

  _updateFlash(dt) {
    if (this.flashLevel > 0) {
      if (this.flashHold > 0) this.flashHold -= dt;
      else this.flashLevel *= Math.exp(-this.flashRate * dt);
      if (this.flashLevel < 0.002) this.flashLevel = 0;
    }
    if (this.flashBlur > 0) {
      // The blur tracks the white on the way down but lags it (the eye's
      // afterimage outlives the glare).
      const target = this.flashLevel * 10;
      this.flashBlur = Math.max(target, this.flashBlur * Math.exp(-0.9 * dt) - dt * 0.2);
      if (this.flashBlur < 0.05) this.flashBlur = 0;
    }
  }

  _concuss(level) {
    const audio = this.ctx.peek('audio');
    if (!audio) return;
    if (typeof audio.concuss === 'function') audio.concuss(level);
    else audio.mixer?.concuss?.(level);
  }

  /* ====================================================================== */
  /*  foley                                                                 */
  /* ====================================================================== */

  _pinSound(kind) {
    if (kind === 'throwing_knife') return;
    if (kind === 'semtex') {
      this.sfx.beep(null, 0.6);
      return;
    }
    if (kind === 'molotov') {
      // The lighter wheel.
      this.ctx.peek('audio')?.play?.('impact', null, { surface: 'metal', energy: 0.1 });
      return;
    }
    this.ctx.peek('audio')?.play?.('reload', null, { phase: 'magout', heavy: 0.6 });
  }

  _spoonSound() {
    this.ctx.peek('audio')?.play?.('impact', null, { surface: 'metal', energy: 0.25 });
  }

  _emptyClick() {
    this.ctx.peek('audio')?.play?.('dryfire', null, {});
  }

  /**
   * Scripted throw for tests and the capture harness (input frozen). `hold`
   * keeps the key "held" (cooking) until `scriptHeld` is cleared.
   */
  debugThrow(kind = 'frag', hold = false) {
    this.th.phase = 'idle';
    this.scriptHeld = !!hold;
    return this.request(kind, !!hold);
  }

  /* ====================================================================== */
  /*  swept projectiles: semtex, molotov, throwing knife                    */
  /* ====================================================================== */

  _phys() {
    return this.weapons.physics ?? this.ctx.peek('physics');
  }

  _spawnDart(kind, pos, vel, fuse, owner) {
    const def = this.defs[kind];
    let slot = this._pool[kind].find((s) => !s.busy);
    if (!slot) {
      // Every copy is in use (knives stuck all over the map): the oldest one
      // lying about makes way.
      const old = this.darts.find((d) => d.kind === kind && d.state !== 'flight');
      if (old) this._retireDart(old);
      slot = this._pool[kind].find((s) => !s.busy);
    }
    const d = this._darts.find((r) => !r.active);
    if (!slot || !d) {
      if (kind !== 'throwing_knife') this._detonate(kind, pos, owner);
      return null;
    }
    d.active = true;
    d.kind = kind;
    d.state = 'flight';
    d.slot = slot;
    d.owner = owner;
    d.pos.copy(pos);
    d.prev.copy(pos);
    d.vel.copy(vel);
    _v.copy(vel).normalize();
    d.base.setFromUnitVectors(_negZ, _v);
    d.angle = 0;
    d.spin = def.spin ?? 9;
    d.age = 0;
    d.fuse = kind === 'semtex' ? def.fuse : 0;
    d.beepT = 0.2;
    d.life = def.life ?? 60;
    d.agent = null;
    d.bone = null;
    slot.busy = true;
    slot.group.visible = true;
    slot.group.position.copy(pos);
    slot.group.quaternion.copy(d.base);
    this.darts.push(d);
    return d;
  }

  _retireDart(d, splice = true) {
    if (d.slot) {
      d.slot.busy = false;
      d.slot.group.visible = false;
    }
    d.slot = null;
    d.active = false;
    d.agent = null;
    d.bone = null;
    d.owner = null;
    if (splice) {
      const i = this.darts.indexOf(d);
      if (i >= 0) this.darts.splice(i, 1);
    }
  }

  /** Physics-rate flight, sticking and the semtex fuse. */
  _stepDarts(h) {
    const phys = this._phys();
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      const def = this.defs[d.kind];
      if (d.kind === 'semtex') {
        d.fuse -= h;
        if (d.state !== 'flight') {
          d.beepT -= h;
          if (d.beepT <= 0) {
            d.beepT = 0.09 + 0.45 * clamp01(d.fuse / def.fuse);
            this.sfx.beep(d.pos, 1);
            this._ledBlink = this.ctx.time.elapsed;
          }
        }
        if (d.fuse <= 0) {
          this._detonate('semtex', d.pos, d.owner);
          this._retireDart(d);
          continue;
        }
      }
      if (d.state === 'flight') {
        d.prev.copy(d.pos);
        d.vel.y += GRAVITY * (def.gravityScale ?? 1) * h;
        d.pos.addScaledVector(d.vel, h);
        d.angle += d.spin * h;
        d.age += h;
        _v.copy(d.pos).sub(d.prev);
        const len = _v.length();
        if (len > 1e-6 && phys?.raycast) {
          _v.divideScalar(len);
          const r = def.radiusFlight ?? 0.02;
          const hit = phys.raycast(d.prev, _v, len + r, DART_MASK_BITS);
          if (hit?.hit) {
            this._dartHit(d, hit, _v);
            continue;
          }
        }
        if (d.age > 8 || d.pos.y < -80) {
          if (d.kind === 'molotov') this._ignite(d.pos, d.owner, null);
          this._retireDart(d);
        }
      } else if (d.kind === 'throwing_knife') {
        d.life -= h;
        if (d.life <= 0) this._retireDart(d);
      }
    }
  }

  /** First contact. `hit` is a pooled physics record: read it now. */
  _dartHit(d, hit, dir) {
    const def = this.defs[d.kind];
    const actor = hit.actor && hit.actor.alive && typeof hit.actor.applyDamage === 'function' ? hit.actor : null;
    const point = this._impactPos.copy(hit.point);
    d.normal.copy(hit.normal);
    d.surface = actor ? 'flesh' : hit.surface ?? 'concrete';
    const collider = hit.collider ?? null;
    const part = hit.part ?? 'torso';

    if (def.flight === 'shatter') {
      this._shatterFx(point, dir);
      this._ignite(point, d.owner, d.normal, actor);
      this._retireDart(d);
      return;
    }

    if (def.flight === 'blade') {
      if (actor) {
        this._knifeWound(actor, part, point, dir, d.owner);
        this.sfx.stab(point, 1);
      } else {
        this.sfx.thunk(point, d.surface, 1);
        if (d.surface === 'metal' || d.surface === 'concrete') this._sparks(point, d.normal, 6);
      }
      // Tip in along the line of flight, 4 cm deep.
      const tip = this.shapes.throwing_knife?.tip ?? 0.135;
      d.pos.copy(point).addScaledVector(dir, -(tip - 0.04));
      _q.setFromUnitVectors(_negZ, dir);
      _q2.setFromAxisAngle(_negZ, this.rng.signed() * 0.6);
      d.base.copy(_q).multiply(_q2);
      this.stats.stuck++;
    } else {
      // Semtex: adhesive pad down, onto the surface.
      this.sfx.splat(point, 1);
      d.pos.copy(point).addScaledVector(d.normal, actor ? 0.012 : 0.016);
      d.base.setFromUnitVectors(_upY, d.normal);
      this.stats.stuck++;
    }
    const g = d.slot.group;
    g.position.copy(d.pos);
    g.quaternion.copy(d.base);
    d.state = 'stuck';
    // A body: ride the bone the hit capsule belongs to (the ragdoll drives the
    // same bones, so a knife or a charge in a man stays in him when he falls).
    if (actor) {
      const name = collider?.userData?.a;
      const bones = actor.bones;
      const bone = bones && name ? bones.find((b) => b.name === name) : bones?.[0];
      if (bone) {
        d.world.compose(d.pos, d.base, _sc.set(1, 1, 1));
        _m.copy(bone.matrixWorld).invert();
        d.local.multiplyMatrices(_m, d.world);
        d.agent = actor;
        d.bone = bone;
        d.state = 'attached';
      }
    }
  }

  /** Throwing knife into a man: head or torso kills, a limb hurts. */
  _knifeWound(actor, part, point, dir, owner) {
    const def = this.defs.throwing_knife;
    const lethal = part === 'head' || part === 'torso';
    const p = this._hitPayload;
    p.target = actor;
    p.amount = lethal ? def.damageLethal : def.damageLimb;
    p.headshot = part === 'head';
    p.killed = false;
    p.part = part;
    p.zone = part === 'head' ? 'head' : lethal ? 'torso' : 'limb';
    p.point.copy(point);
    p.incident.copy(dir);
    p.source = owner && !owner.isPlayer && owner.team ? owner : undefined;
    this.ctx.events.emit('damage:dealt', p);
    this.stats.knifeHits++;
    this.ctx.peek('fx')?.bloodSpatterBehind?.(point, dir);
  }

  /** Render-rate: interpolate flights, ride bones, pick knives up. */
  _updateDarts(dt, input, live) {
    const alpha = this.ctx.time.alpha ?? 1;
    let best = null;
    let bestD = Infinity;
    const player = this.ctx.peek('player');
    const feet = player?.feetPosition ?? player?.position ?? null;
    const cam = this.ctx.camera;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      const g = d.slot.group;
      if (d.state === 'flight') {
        g.position.lerpVectors(d.prev, d.pos, alpha);
        _q.setFromAxisAngle(_axisX, -d.angle);
        g.quaternion.copy(d.base).multiply(_q);
        continue;
      }
      if (d.state === 'attached') {
        const a = d.agent;
        if (!a || !a.group?.parent) {
          // The body was cleared away: the item drops where it was.
          d.state = 'stuck';
          d.agent = null;
          d.bone = null;
          const phys = this._phys();
          const gy = phys?.groundHeight ? phys.groundHeight(d.pos.x, d.pos.z, d.pos.y + 0.2) : -Infinity;
          if (Number.isFinite(gy)) d.pos.y = gy + 0.012;
          _q.setFromAxisAngle(_axisX, -Math.PI / 2);
          d.base.setFromAxisAngle(_upY, this.rng.float() * 6.28).multiply(_q);
          g.position.copy(d.pos);
          g.quaternion.copy(d.base);
        } else {
          d.world.multiplyMatrices(d.bone.matrixWorld, d.local);
          d.world.decompose(g.position, g.quaternion, _sc);
          d.pos.copy(g.position);
        }
      }
      if (d.kind !== 'throwing_knife' || !feet) continue;
      if (d.agent && d.agent.alive) continue; // still in a live man: not yours yet
      const dx = d.pos.x - feet.x;
      const dz = d.pos.z - feet.z;
      const dy = d.pos.y - feet.y;
      const hd = Math.hypot(dx, dz);
      const full = (this.counts.throwing_knife ?? 0) >= this.defs.throwing_knife.max;
      if (!full && live !== false && hd < this.defs.throwing_knife.pickupRadius && dy > -0.6 && dy < 2.1) {
        this._pickup(d);
        continue;
      }
      const ed = cam.position.distanceTo(d.pos);
      if (ed < this.defs.throwing_knife.useRadius && ed < bestD) {
        _v.copy(d.pos).sub(cam.position).divideScalar(Math.max(1e-3, ed));
        if (_v.dot(_fwd) > 0.55 || ed < 1.3) {
          best = d;
          bestD = ed;
        }
      }
    }
    const full = (this.counts.throwing_knife ?? 0) >= this.defs.throwing_knife.max;
    if (best && !full) {
      if (live && input?.actionPressed?.('use')) {
        this._pickup(best);
        this._clearPrompt();
      } else {
        this.ctx.peek('ui')?.setPrompt?.({ key: 'F', text: 'PICK UP', sub: 'THROWING KNIFE' });
        this._promptShown = true;
      }
    } else {
      this._clearPrompt();
    }
  }

  _clearPrompt() {
    if (!this._promptShown) return;
    this._promptShown = false;
    this.ctx.peek('ui')?.clearPrompt?.();
  }

  _pickup(d) {
    this.give('throwing_knife', 1);
    this._retireDart(d);
    this.sfx.pickup(1);
    this.stats.pickedUp++;
    this.ctx.events.emit('equipment:pickup', { kind: 'throwing_knife', count: this.counts.throwing_knife });
  }

  /** Debug / tests: every knife currently lying (or stuck) somewhere. */
  knivesInWorld() {
    return this.darts.filter((d) => d.kind === 'throwing_knife' && d.state !== 'flight');
  }

  /* ====================================================================== */
  /*  particles                                                             */
  /* ====================================================================== */

  _spReset() {
    const s = this._sp;
    s.x = s.y = s.z = 0;
    s.vx = s.vy = s.vz = 0;
    s.size0 = 0.2; s.size1 = 0.3; s.sizeCurve = 1;
    s.life = 1; s.delay = 0; s.drag = 1.4; s.gravity = 0;
    s.rot = 0; s.spin = 0; s.stretch = 0;
    s.r0 = s.g0 = s.b0 = 1; s.i0 = 1;
    s.r1 = s.g1 = s.b1 = 1; s.i1 = 0;
    s.tile = 0; s.soft = 0.4; s.alpha = 1; s.alphaCurve = 1;
    s.turb = 0; s.turbFreq = 1; s.seed = 0; s.flags = 0;
    return s;
  }

  /** Push the shared descriptor into fx's lit or additive ring. */
  _emit(additive) {
    const fx = this.ctx.peek('fx');
    const layer = additive ? fx?.add : fx?.lit;
    if (layer?.emit) layer.emit(this._sp, this.ctx.time.elapsed);
  }

  get _pq() {
    const b = this.ctx.config?.q?.particleBudget ?? 6000;
    return Math.max(0.4, Math.min(1.25, b / 12000));
  }

  _sparks(p, n, count) {
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const s = this._spReset();
      s.x = p.x; s.y = p.y; s.z = p.z;
      s.vx = n.x * 2 + rng.signed() * 2.5;
      s.vy = n.y * 2 + rng.range(0, 2.5);
      s.vz = n.z * 2 + rng.signed() * 2.5;
      s.tile = TILE.SPARK;
      s.size0 = 0.012; s.size1 = 0.004;
      s.life = rng.range(0.12, 0.3);
      s.drag = 1.5; s.gravity = -9;
      s.stretch = 1.2;
      s.r0 = 1; s.g0 = 0.8; s.b0 = 0.5; s.i0 = 6; s.i1 = 1;
      s.flags = 1;
      s.seed = rng.float();
      this._emit(true);
    }
  }

  _shatterFx(p, dir) {
    const rng = this.rng;
    const n = Math.round(18 * this._pq);
    for (let i = 0; i < n; i++) {
      const s = this._spReset();
      s.x = p.x; s.y = p.y + 0.05; s.z = p.z;
      s.vx = -dir.x * 1.5 + rng.signed() * 3;
      s.vy = rng.range(0.8, 3.5);
      s.vz = -dir.z * 1.5 + rng.signed() * 3;
      s.tile = TILE.CHIP;
      s.size0 = rng.range(0.01, 0.025); s.size1 = s.size0;
      s.life = rng.range(0.4, 0.8);
      s.drag = 0.5; s.gravity = -9.81;
      s.rot = rng.float() * 6.28; s.spin = rng.signed() * 20;
      s.r0 = 0.16; s.g0 = 0.24; s.b0 = 0.12;
      s.r1 = 0.16; s.g1 = 0.24; s.b1 = 0.12;
      s.alpha = 0.9; s.alphaCurve = 3;
      s.soft = 0.05;
      s.seed = rng.float();
      this._emit(false);
    }
  }

  /* ====================================================================== */
  /*  molotov: the fire area                                                */
  /* ====================================================================== */

  /**
   * Break into a fire at `where`. On a wall (or a man) the fuel runs down to the
   * floor below; on a floor it spreads where it landed.
   */
  _ignite(where, owner, normal = null, actor = null) {
    const def = this.defs.molotov;
    const phys = this._phys();
    const c = _v2.copy(where);
    if (actor?.position) c.copy(actor.position);
    else if (!normal || normal.y < 0.6) {
      if (normal) c.addScaledVector(normal, 0.45);
      const gy = phys?.groundHeight ? phys.groundHeight(c.x, c.z, where.y + 0.3) : -Infinity;
      if (Number.isFinite(gy) && gy > where.y - 30) c.y = gy;
    }
    let f = this.fires.find((x) => !x.active);
    if (!f) {
      f = this.fires[0];
      for (const x of this.fires) if (x.t > f.t) f = x;
      this._endFire(f);
    }
    f.active = true;
    f.pos.copy(c);
    f.t = 0;
    f.dur = def.fireTime;
    f.R = def.fireRadius;
    f.r = 0.4;
    f.owner = owner;
    f.acc = f.sacc = f.eacc = 0;
    f.tick = 0;
    f.light = null;
    this.sfx.shatter(c, 1);
    this.sfx.whoomp(c, 1);
    f.loop = this.sfx.loop('fire', c, f.dur, 1);
    const fx = this.ctx.peek('fx');
    fx?.lights?.flash?.(c.x, c.y + 0.6, c.z, 1, 0.55, 0.2, 2600, 0.5, 4, 14, 2);
    fx?.haze?.(c.x, c.y + 0.4, c.z, 1.2, 2.5, 0.6, 0.7);
    // The whoomp: one burst of flame across the whole area.
    const rng = this.rng;
    for (let i = 0; i < Math.round(16 * this._pq); i++) {
      const a = rng.float() * 6.283;
      const rr = Math.sqrt(rng.float()) * f.R * 0.8;
      const s = this._spReset();
      s.x = c.x + Math.cos(a) * rr; s.y = c.y + 0.15; s.z = c.z + Math.sin(a) * rr;
      s.vx = Math.cos(a) * 1.5; s.vy = rng.range(1.5, 3.5); s.vz = Math.sin(a) * 1.5;
      s.tile = TILE.FIRE;
      s.size0 = rng.range(0.4, 0.7); s.size1 = rng.range(1.0, 1.6); s.sizeCurve = 0.4;
      s.life = rng.range(0.35, 0.6);
      s.drag = 2.5; s.gravity = 2;
      s.rot = rng.float() * 6.28; s.spin = rng.signed() * 2;
      s.r0 = 1; s.g0 = 0.75; s.b0 = 0.4; s.i0 = 6;
      s.r1 = 1; s.g1 = 0.25; s.b1 = 0.05; s.i1 = 0.3;
      s.alphaCurve = 0.6; s.soft = 0.5;
      s.turb = 0.15; s.turbFreq = 2.4; s.seed = rng.float();
      this._emit(true);
    }
    const ai = this.ctx.peek('ai');
    for (const a of ai?.agents ?? []) if (a.alive) a.hear?.(c, 30);
    this.ctx.events.emit('molotov:ignite', {
      position: f.pos, radius: f.R, duration: f.dur, owner,
      team: owner?.team ?? (owner?.isPlayer ? 'esf' : undefined),
    });
    this.stats.fires = (this.stats.fires ?? 0) + 1;
    return f;
  }

  _endFire(f) {
    if (!f.active) return;
    f.active = false;
    if (f.light && f.light.light) f.light.age = f.light.duration; // release the pooled light
    f.light = null;
    if (f.loop) {
      try {
        f.loop.src.stop();
      } catch {
        /* ended */
      }
    }
    f.loop = null;
    f.owner = null;
    this.ctx.peek('fx')?.scorch?.(f.pos.x, f.pos.y, f.pos.z, f.R * 0.9);
  }

  _updateFires(dt) {
    const rng = this.rng;
    const def = this.defs.molotov;
    const fx = this.ctx.peek('fx');
    for (const f of this.fires) {
      if (!f.active) continue;
      f.t += dt;
      if (f.t >= f.dur) {
        this._endFire(f);
        continue;
      }
      const grow = smoothstep(0, 0.35, f.t);
      const fade = 1 - smoothstep(f.dur - 1.2, f.dur, f.t);
      f.r = f.R * (0.35 + 0.65 * grow) * (0.8 + 0.2 * fade);
      const c = f.pos;
      // ---- flames ------------------------------------------------------
      f.acc += 34 * this._pq * fade * dt * (f.r / 2.7) ** 2;
      let guard = 12;
      while (f.acc >= 1 && guard-- > 0) {
        f.acc -= 1;
        const a = rng.float() * 6.283;
        const rr = Math.sqrt(rng.float()) * f.r;
        const edge = rr / Math.max(0.1, f.r);
        const s = this._spReset();
        s.x = c.x + Math.cos(a) * rr; s.y = c.y + 0.04; s.z = c.z + Math.sin(a) * rr;
        s.vx = rng.signed() * 0.3; s.vy = rng.range(1.1, 2.3) * (1.1 - 0.5 * edge); s.vz = rng.signed() * 0.3;
        s.tile = TILE.FIRE;
        s.size0 = rng.range(0.28, 0.5) * (1.1 - 0.4 * edge);
        s.size1 = rng.range(0.6, 1.0) * (1.1 - 0.4 * edge);
        s.sizeCurve = 0.6;
        s.life = rng.range(0.42, 0.8);
        s.delay = -rng.float() * dt;
        s.drag = 1.8; s.gravity = 1.6;
        s.rot = rng.float() * 6.28; s.spin = rng.signed() * 1.6;
        s.r0 = 1; s.g0 = rng.range(0.55, 0.8); s.b0 = rng.range(0.22, 0.4); s.i0 = rng.range(3, 5);
        s.r1 = 1; s.g1 = 0.2; s.b1 = 0.04; s.i1 = 0.2;
        s.alphaCurve = 0.75; s.soft = 0.45;
        s.turb = 0.08; s.turbFreq = 3; s.seed = rng.float();
        this._emit(true);
      }
      // ---- embers ------------------------------------------------------
      f.eacc += 7 * fade * dt;
      while (f.eacc >= 1) {
        f.eacc -= 1;
        const a = rng.float() * 6.283;
        const rr = Math.sqrt(rng.float()) * f.r;
        const s = this._spReset();
        s.x = c.x + Math.cos(a) * rr; s.y = c.y + 0.2; s.z = c.z + Math.sin(a) * rr;
        s.vx = rng.signed() * 0.6; s.vy = rng.range(1.5, 3.2); s.vz = rng.signed() * 0.6;
        s.tile = TILE.SPARK;
        s.size0 = 0.018; s.size1 = 0.006;
        s.life = rng.range(0.8, 1.6);
        s.drag = 0.9; s.gravity = 0.6;
        s.stretch = 0.4;
        s.r0 = 1; s.g0 = 0.55; s.b0 = 0.15; s.i0 = 8; s.i1 = 1.5;
        s.turb = 0.25; s.turbFreq = 2; s.flags = 1; s.seed = rng.float();
        this._emit(true);
      }
      // ---- smoke ---------------------------------------------------------
      f.sacc += 5 * this._pq * dt;
      while (f.sacc >= 1) {
        f.sacc -= 1;
        const a = rng.float() * 6.283;
        const rr = Math.sqrt(rng.float()) * f.r * 0.7;
        const s = this._spReset();
        s.x = c.x + Math.cos(a) * rr; s.y = c.y + 0.7; s.z = c.z + Math.sin(a) * rr;
        s.vx = rng.signed() * 0.25; s.vy = rng.range(0.9, 1.5); s.vz = rng.signed() * 0.25;
        s.tile = rng.float() < 0.5 ? TILE.SMOKE_A : TILE.SMOKE_B;
        s.size0 = rng.range(0.7, 1.1); s.size1 = rng.range(2.8, 4);
        s.sizeCurve = 0.7;
        s.life = rng.range(2.6, 3.6);
        s.drag = 0.7; s.gravity = 0.35;
        s.rot = rng.float() * 6.28; s.spin = rng.signed() * 0.3;
        s.r0 = 0.03; s.g0 = 0.027; s.b0 = 0.024;
        s.r1 = 0.07; s.g1 = 0.066; s.b1 = 0.062;
        s.alpha = rng.range(0.35, 0.55) * fade; s.alphaCurve = 1.5;
        s.soft = 0.9; s.turb = 0.3; s.turbFreq = 0.6; s.seed = rng.float();
        this._emit(false);
      }
      // ---- light: one pooled fx light held for the life of the fire --------
      if (fx?.lights?.flash) {
        const flick = 0.72 + 0.16 * Math.sin(f.t * 23.1) + 0.12 * Math.sin(f.t * 7.7 + 1.3);
        const peak = 820 * fade * (0.4 + 0.6 * grow) * flick;
        const L = f.light;
        const mine = L && L.light && L.age < L.duration && Math.abs(L.light.position.x - c.x) < 1e-3 && Math.abs(L.light.position.z - c.z) < 1e-3;
        if (mine) {
          L.peak = peak;
          L.age = Math.min(L.age, 0.01);
        } else {
          f.light = fx.lights.flash(c.x, c.y + 0.7, c.z, 1, 0.5, 0.16, peak, f.dur - f.t + 0.05, 0, 11, 2);
        }
      }
      // ---- who is standing in it -----------------------------------------
      f.tick += dt;
      if (f.tick >= 0.2) {
        f.tick -= 0.2;
        this._burnScan(f);
      }
    }
    // ---- burn damage over time (inside the fire plus an afterburn) ---------
    for (const b of this._burns) {
      if (!b.target) continue;
      const alive = b.target.isPlayerSystem ? !b.target.dead : b.target.alive !== false && !b.target.dead;
      if (!alive) {
        b.target = null;
        continue;
      }
      b.t -= dt;
      b.tick += dt;
      if (b.tick >= 0.25) {
        b.tick -= 0.25;
        this._burnHit(b, def.dps * 0.25);
      }
      if (b.t <= 0) b.target = null;
    }
  }

  _burnScan(f) {
    const def = this.defs.molotov;
    const ai = this.ctx.peek('ai');
    const r2 = f.r * f.r;
    for (const a of ai?.agents ?? []) {
      if (!a.alive || !a.position) continue;
      const dx = a.position.x - f.pos.x;
      const dz = a.position.z - f.pos.z;
      if (dx * dx + dz * dz > r2 || Math.abs(a.position.y - f.pos.y) > 1.1) continue;
      this._burn(a, f, def);
    }
    const player = this.ctx.peek('player');
    const feet = player?.feetPosition ?? player?.position;
    if (player && feet && !player.dead) {
      const dx = feet.x - f.pos.x;
      const dz = feet.z - f.pos.z;
      if (dx * dx + dz * dz <= r2 && Math.abs(feet.y - f.pos.y) < 1.1) this._burn(player, f, def);
    }
  }

  _burn(target, f, def) {
    let free = null;
    for (const b of this._burns) {
      if (b.target === target) {
        b.t = def.afterburn + 0.25;
        b.fire = f;
        return;
      }
      if (!b.target && !free) free = b;
    }
    if (!free) return;
    free.target = target;
    free.t = def.afterburn + 0.25;
    free.tick = 0.25; // first tick lands at once
    free.owner = f.owner;
    free.fire = f;
  }

  _burnHit(b, amount) {
    const t = b.target;
    const p = this._burnPayload;
    const isPlayer = t === this.ctx.peek('player');
    p.target = t;
    p.amount = amount;
    p.killed = false;
    p.headshot = false;
    if (isPlayer) {
      const feet = t.feetPosition ?? t.position;
      p.point.set(feet.x, feet.y + 1, feet.z);
    } else {
      p.point.set(t.position.x, t.position.y + 1.1, t.position.z);
    }
    p.from.copy(b.fire?.pos ?? p.point);
    const o = b.owner;
    // Doug's own fire names nobody (an unattributed hit on a bot is his).
    p.source = o && !o.isPlayer && o !== this.ctx.peek('player') ? o : undefined;
    this.ctx.events.emit('damage:dealt', p);
    this.stats.burnTicks++;
  }

  /**
   * EXPANSION §10.4: the AI avoid-area query. The live fire whose area (plus
   * `pad` metres) contains `pos`, or null. `{ pos, r }` on the result.
   */
  hazardAt(pos, pad = 0.6) {
    if (!pos) return null;
    for (const f of this.fires) {
      if (!f.active) continue;
      const dx = pos.x - f.pos.x;
      const dz = pos.z - f.pos.z;
      const rr = f.r + pad;
      if (dx * dx + dz * dz < rr * rr && Math.abs(pos.y - f.pos.y) < 1.8) return f;
    }
    return null;
  }

  /* ====================================================================== */
  /*  smoke                                                                 */
  /* ====================================================================== */

  _deploySmoke(rec) {
    const def = this.defs.smoke;
    let c = this.clouds.find((x) => !x.active);
    if (!c) {
      c = this.clouds[0];
      for (const x of this.clouds) if (x.t > c.t) c = x;
      this._endCloud(c);
    }
    const bp = rec.body.position;
    c.active = true;
    c.pos.set(bp.x, bp.y, bp.z);
    const phys = this._phys();
    const gy = phys?.groundHeight ? phys.groundHeight(bp.x, bp.z, bp.y + 0.3) : -Infinity;
    if (Number.isFinite(gy) && gy > bp.y - 3) c.pos.y = gy;
    c.t = 0;
    c.dur = def.duration;
    c.R = def.radius;
    c.r = 0.3;
    c.dens = 1;
    c.acc = 0;
    c.rec = rec;
    this.sfx.pop(c.pos, 1);
    c.loop = this.sfx.loop('hiss', c.pos, Math.min(6, c.dur), 1);
    this.stats.detonated++;
    this.ctx.events.emit('smoke:deploy', { position: c.pos, radius: c.R, duration: c.dur, owner: rec.owner });
  }

  /** Test / script hook: a full cloud right here, no canister. */
  _smokeAt(pos) {
    const fake = { body: { position: pos }, owner: null, kind: 'smoke', fake: true };
    this._deploySmoke(fake);
  }

  _endCloud(c) {
    if (!c.active) return;
    c.active = false;
    const rec = c.rec;
    c.rec = null;
    if (rec && !rec.fake && rec.active) {
      const i = this.live.indexOf(rec);
      if (i >= 0) this.live.splice(i, 1);
      this._retire(rec);
    }
  }

  _updateClouds(dt) {
    const rng = this.rng;
    for (const c of this.clouds) {
      if (!c.active) continue;
      c.t += dt;
      if (c.t >= c.dur) {
        this._endCloud(c);
        continue;
      }
      c.r = c.R * (1 - Math.exp(-c.t / 1.25));
      c.dens = 1 - smoothstep(c.dur - 3, c.dur, c.t);
      const early = c.t < 3;
      // Particle volume: puffs born throughout the current cloud, a dense jet
      // off the canister while it is still pouring out.
      c.acc += (early ? 26 : 11) * this._pq * c.dens * dt;
      let guard = 14;
      const src = c.rec?.body?.position ?? c.pos;
      while (c.acc >= 1 && guard-- > 0) {
        c.acc -= 1;
        const s = this._spReset();
        const jet = early && rng.float() < 0.35;
        if (jet) {
          const a = rng.float() * 6.283;
          s.x = src.x; s.y = src.y + 0.1; s.z = src.z;
          s.vx = Math.cos(a) * rng.range(1.5, 3); s.vy = rng.range(0.6, 1.4); s.vz = Math.sin(a) * rng.range(1.5, 3);
          s.size0 = rng.range(0.4, 0.7); s.size1 = rng.range(2.2, 3.2);
          s.life = rng.range(2.5, 3.5); s.drag = 1.1;
        } else {
          const a = rng.float() * 6.283;
          const rr = Math.sqrt(rng.float()) * c.r * 0.8;
          s.x = c.pos.x + Math.cos(a) * rr;
          s.y = c.pos.y + 0.3 + rng.float() * Math.max(0.4, c.r * 0.75);
          s.z = c.pos.z + Math.sin(a) * rr;
          s.vx = Math.cos(a) * 0.22; s.vy = rng.range(0.02, 0.14); s.vz = Math.sin(a) * 0.22;
          const k = Math.min(1, 0.45 + c.r / c.R);
          s.size0 = rng.range(1.6, 2.4) * k; s.size1 = rng.range(3.0, 4.2) * k;
          s.life = rng.range(4, 5.6); s.drag = 0.6;
        }
        s.sizeCurve = 0.6;
        s.delay = -rng.float() * dt;
        s.gravity = 0.04;
        s.tile = rng.float() < 0.5 ? TILE.SMOKE_A : TILE.SMOKE_B;
        s.rot = rng.float() * 6.28; s.spin = rng.signed() * 0.15;
        const g = rng.range(0.5, 0.62);
        s.r0 = g; s.g0 = g * 0.99; s.b0 = g * 0.96;
        s.r1 = g * 1.05; s.g1 = g * 1.04; s.b1 = g * 1.02;
        s.alpha = rng.range(0.55, 0.75); s.alphaCurve = 1.25;
        s.soft = 1.4; s.turb = 0.35; s.turbFreq = 0.35; s.seed = rng.float();
        this._emit(false);
      }
    }
  }

  /**
   * EXPANSION §10.4: does live smoke block the line from `from` to `to`? The
   * cloud is a sphere on the ground point (centre lifted by 0.55 r); the line
   * is blocked once it runs more than ~1.4 m through the dense part. Scalar
   * math only: perception calls this per sight ray.
   */
  smokeBlocks(from, to) {
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      if (!c.active || c.dens < 0.3) continue;
      const r = c.r * 0.92;
      if (r < 0.9) continue;
      const cx = c.pos.x, cy = c.pos.y + r * 0.55, cz = c.pos.z;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-4) continue;
      const ux = dx / L, uy = dy / L, uz = dz / L;
      const mx = from.x - cx, my = from.y - cy, mz = from.z - cz;
      const b = mx * ux + my * uy + mz * uz;
      const cc = mx * mx + my * my + mz * mz - r * r;
      const disc = b * b - cc;
      if (disc <= 0) continue;
      const sq = Math.sqrt(disc);
      const t0 = Math.max(0, -b - sq);
      const t1 = Math.min(L, -b + sq);
      if (t1 - t0 > 1.4 / c.dens) return true;
    }
    return false;
  }

  /* ====================================================================== */
  /*  concussion                                                            */
  /* ====================================================================== */

  _concussion(pos, owner) {
    const def = this.defs.concussion;
    const team = owner?.team ?? (owner?.isPlayer ? 'esf' : undefined);
    this.ctx.events.emit('concussion:detonate', { position: pos, radius: def.radius, owner, team, kind: 'concussion' });
    const audio = this.ctx.peek('audio');
    audio?.play?.('explosion', pos, { radius: 3.2, level: 0.95 });
    const fx = this.ctx.peek('fx');
    if (fx) {
      fx.lights?.flash?.(pos.x, pos.y + 0.1, pos.z, 1, 0.8, 0.55, 1800, 0.12, 20, 12, 2);
      fx.hazeRing?.(pos.x, pos.y, pos.z, 0.5, 7, 0.4, 2.0);
      fx.haze?.(pos.x, pos.y + 0.2, pos.z, 0.8, 2.4, 1.0, 1.0);
    }
    // A low ring of dust kicked off the floor.
    const rng = this.rng;
    for (let i = 0; i < Math.round(14 * this._pq); i++) {
      const a = (i / 14) * 6.283 + rng.signed() * 0.2;
      const s = this._spReset();
      s.x = pos.x; s.y = pos.y; s.z = pos.z;
      s.vx = Math.cos(a) * rng.range(4, 7); s.vy = rng.range(0.2, 0.8); s.vz = Math.sin(a) * rng.range(4, 7);
      s.tile = TILE.SMOKE_B;
      s.size0 = 0.4; s.size1 = rng.range(1.6, 2.4); s.sizeCurve = 0.5;
      s.life = rng.range(1, 1.6); s.drag = 3; s.gravity = 0.1;
      s.rot = rng.float() * 6.28;
      s.r0 = 0.22; s.g0 = 0.2; s.b0 = 0.17; s.r1 = 0.3; s.g1 = 0.28; s.b1 = 0.25;
      s.alpha = 0.45; s.alphaCurve = 1.4; s.soft = 0.8; s.seed = rng.float();
      this._emit(false);
    }
    const phys = this._phys();
    const los = (a, b) => (phys?.lineOfSight ? phys.lineOfSight(a, b, phys.MASK?.EXPLOSION) : true);
    const strength = (eye) => {
      const d = pos.distanceTo(eye);
      if (d > def.radius) return 0;
      const k = Math.pow(clamp01(1 - d / def.radius), 0.7);
      return los(pos, eye) ? k : d < def.radius * 0.5 ? k * 0.4 : 0;
    };
    // ---- player (the thrower is not exempt) --------------------------------
    const k = strength(this.ctx.camera.position);
    this.stats.lastConcussion = k;
    if (k > 0.03) {
      this.concussPlayer(k, 1.8 + 4.2 * k);
      this._concuss(0.35 + 0.6 * k);
    }
    // ---- ai: stunned, never blinded (capped under perception's 0.55 blind) --
    const agents = this.ctx.peek('ai')?.agents;
    if (agents) {
      for (const a of agents) {
        if (!a?.alive) continue;
        a.hear?.(pos, 70);
        if (team && a.team === team) continue;
        const ak = strength(a.eye ?? a.position);
        if (ak <= 0.03) continue;
        if (typeof a.stun === 'function') a.stun(Math.min(0.54, 0.25 + 0.6 * ak), 2.2 + 4 * ak);
        else a.suppress?.(1.2 * ak);
        a._owConcussT = this.ctx.time.elapsed;
      }
    }
  }

  /** Slow + wobble on the player for `duration`, recovering linearly. */
  concussPlayer(intensity, duration) {
    const i = clamp01(intensity);
    if (i <= 0) return;
    if (i >= this.concussLevel) {
      this.concussLevel = i;
      this.concussRate = i / Math.max(0.5, duration);
    }
    this.ctx.peek('player')?.addTrauma?.(0.35 * i);
  }

  _updateConcussion(dt) {
    if (this.concussLevel <= 0) {
      this.slowMult = 1;
      return;
    }
    this.concussLevel = Math.max(0, this.concussLevel - this.concussRate * dt);
    const k = this.concussLevel;
    this.slowMult = 1 - 0.6 * k;
    this._wob += dt;
    const w = this._wob;
    const p = this.ctx.peek('player');
    if (p?.addKick) {
      // A slow drunken sway: small spring impulses every frame, out of phase.
      p.addKick(Math.sin(w * 2.1) * k * 0.9 * dt, Math.sin(w * 1.3 + 1) * k * 1.4 * dt, Math.sin(w * 1.7 + 2) * k * 2.2 * dt);
    }
  }

  clear() {
    for (const g of this.live) this._retire(g);
    this.live.length = 0;
    for (const d of this.darts) this._retireDart(d, false);
    this.darts.length = 0;
    for (const c of this.clouds) {
      c.active = false;
      c.rec = null;
    }
    for (const f of this.fires) this._endFire(f);
    for (const b of this._burns) b.target = null;
    this.sfx.stopAll();
    this.th.phase = 'idle';
    this.th.kind = null;
    this.flashLevel = 0;
    this.flashBlur = 0;
    this.concussLevel = 0;
    this.slowMult = 1;
    this._clearPrompt();
  }

  dispose() {
    this.clear();
    for (const kind of Object.keys(this._pool)) {
      for (const s of this._pool[kind]) s.group.removeFromParent();
    }
    for (const g of this._geos ?? []) g.dispose();
    for (const m of this._owned) m.dispose();
  }
}
