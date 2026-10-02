import * as THREE from 'three';
import { EQUIPMENT_DEFS } from './defs.js';
import { buildFrag, buildFlash } from './models/grenades.js';
import { clamp01, smoothstep, lerp } from './mathx.js';

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
    this.counts = { frag: EQUIPMENT_DEFS.frag.count, flash: EQUIPMENT_DEFS.flash.count };

    // Throw state machine.
    this.th = { phase: 'idle', kind: null, t: 0, held: false, cook: 0, released: false, queued: null, wait: 0 };

    this.live = [];
    this._pool = { frag: [], flash: [] };
    this._records = [];
    for (let i = 0; i < POOL_PER_KIND * 2; i++) {
      this._records.push({ active: false, kind: null, body: null, mesh: null, fuse: 0, owner: null, bounced: false, marked: false });
    }
    this._impactPos = new THREE.Vector3();
    this._throwPayload = { kind: null, owner: null, position: new THREE.Vector3(), velocity: new THREE.Vector3() };

    // Player flash state (the white-out).
    this.flashLevel = 0;
    this.flashHold = 0;
    this.flashRate = 1;
    this.flashBlur = 0;

    this.stats = { thrown: 0, detonated: 0, cookedOff: 0, lastFlash: null };
  }

  /* ====================================================================== */
  /*  construction                                                          */
  /* ====================================================================== */

  /** Build the world pool and the in-hand copies. Called from weapons.init. */
  build(mats, viewmodel) {
    const bake = mats.lib?.bakeMasks?.bind(mats.lib) ?? null;
    const kinds = { frag: buildFrag(), flash: buildFlash() };
    this.shapes = {};
    this._geos = [];
    for (const kind of Object.keys(kinds)) {
      const { asm, radius, halfHeight } = kinds[kind];
      this.shapes[kind] = { radius, halfHeight };
      const map = asm.build();
      const parts = [];
      for (const [matKey, geo] of map) {
        if (bake) bake(geo, { wear: 1, grime: 1, ao: 1, edgeThreshold: 0.16, rng: this.rng });
        this._geos.push(geo);
        parts.push({ geo, mat: mats.get(matKey) });
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
      for (let i = 0; i < POOL_PER_KIND; i++) {
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
      viewmodel.addThrowItem(kind, make(`ow-${kind}-hand`));
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
        if (th.t >= PRIME) {
          // Pin out, spoon held: the fuse is now burning.
          this._pinSound();
          this._enter(th.held ? 'hold' : 'throw');
        }
        break;
      case 'hold':
        th.t += dt;
        th.cook += dt;
        if (th.cook >= this.defs[th.kind].fuse) {
          this._cookOff();
          break;
        }
        if (!th.held) this._enter('throw');
        break;
      case 'throw':
        th.t += dt;
        if (!th.released) {
          th.cook += dt;
          if (th.cook >= this.defs[th.kind].fuse) {
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
      th.phase === 'prime' ? th.t / PRIME
        : th.phase === 'throw' ? th.t / THROW
          : th.phase === 'recover' ? th.t / RECOVER
            : th.phase === 'hold' ? th.t : 0;
    const f = this.cookFraction;
    vm.setThrow(th.phase, tn, th.kind, f > 0.6 ? (f - 0.6) / 0.4 : 0, th.released);

    this._updateFlash(dt);
  }

  _enter(phase) {
    this.th.phase = phase;
    this.th.t = 0;
  }

  /** Fuses tick on the physics clock so detonation is frame-rate independent. */
  fixedUpdate(h) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= h;
      if (g.fuse <= 0) {
        this.live.splice(i, 1);
        this._detonate(g.kind, g.body.position, g.owner);
        this._retire(g);
      }
    }
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
    const g = this._spawn(kind, pos, vel, Math.max(0.05, fuseLeft), owner);
    if (g) {
      // End-over-end tumble about the throwing arm's swing axis.
      g.body.angularVelocity.copy(_right).multiplyScalar(-11);
      g.body.angularVelocity.y += this.rng.signed() * 3;
    }
    this.stats.thrown++;
    this._spoonSound();
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
      lifetime: fuse + 2,
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
    else this._frag(pos, owner);
  }

  _frag(pos, owner) {
    const def = this.defs.frag;
    this.ctx.events.emit('explosion', {
      position: pos,
      radius: def.radius,
      damage: def.damage,
      impulse: def.impulse,
      owner,
      source: owner,
      team: owner?.team ?? (owner?.isPlayer ? 'esf' : undefined),
      kind: 'frag',
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

  _pinSound() {
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

  clear() {
    for (const g of this.live) this._retire(g);
    this.live.length = 0;
    this.th.phase = 'idle';
    this.th.kind = null;
    this.flashLevel = 0;
    this.flashBlur = 0;
  }

  dispose() {
    this.clear();
    for (const kind of Object.keys(this._pool)) {
      for (const s of this._pool[kind]) s.group.removeFromParent();
    }
    for (const g of this._geos ?? []) g.dispose();
  }
}
