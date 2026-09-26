// Player controller: Rapier kinematic character controller driven at the physics fixed step
// (120 Hz, via physics.onStep) with render interpolation. Implements CoD-style locomotion:
// walk / ADS walk / crouch / prone / sprint / tactical sprint, slide + slide-cancel, jump with
// coyote time + buffering, mantle and vault, fall damage, death + respawn. Camera feel lives in
// CameraRig.js. Contract: docs/CONTRACTS.md#player.
import * as THREE from 'three';
import { LAYER, groups, ALL } from '../core/Physics.js';
import { TUNING as T } from './config.js';
import { CameraRig } from './CameraRig.js';
import { clamp, lerp, DEG, easeOutCubic, easeInOutSine } from './util.js';

const KCC_FILTER = LAYER.WORLD | LAYER.PROP | LAYER.ENEMY;
const RAY_GROUPS = groups(ALL, LAYER.WORLD | LAYER.PROP);
const KCC_GROUPS = groups(LAYER.PLAYER, KCC_FILTER);
const UP = { x: 0, y: 1, z: 0 };
const DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const IDENT = { x: 0, y: 0, z: 0, w: 1 };

export class PlayerSystem {
  constructor() {
    this.name = 'player';
    this.position = new THREE.Vector3(); // feet, simulation state
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.health = T.health.max;
    this.maxHealth = T.health.max;
    this.alive = true;
    this.state = {
      grounded: false, sprinting: false, tacticalSprint: false, crouching: false, sliding: false, moving: false,
      // additive (not in the original contract): useful for weapons / audio / ui
      prone: false, mantling: false, mantleT: 0, vaulting: false, stance: 'stand', tacMeter: 1, dead: false, sprintOutT: 0,
    };
    this.motion = { bobPhase: Math.PI / 2, bobAmount: 0, speed01: 0, landImpulse: 0, landSpeed: 0 };
    this.body = null;
    this.collider = null;
    this.tuning = T;

    this.renderPosition = new THREE.Vector3(); // interpolated feet position used by the camera
    this.prevPosition = new THREE.Vector3();
    this.stance = 'stand';
    this.capsuleHeight = T.height.stand;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundSurface = 'concrete';
    this.intent = { f: 0, s: 0, jumpHeld: false, crouchHeld: false, sprintHeld: false, adsHeld: false, fireHeld: false };
    this.latch = { jump: false, crouch: false, crouchUp: false, prone: false, sprint: false };
    this.adsAmount = 0;
    this.extraBounds = []; // [{ box: Box3, fallback: {pos, yaw} }] regions outside world.bounds (test course)
    this._resetTransient();
    this.cam = new CameraRig(this);
  }

  _resetTransient() {
    this.simTime = 0;
    this.timeSinceGround = 0;
    this.timeSinceJump = 10;
    this.jumpedSinceGround = false;
    this.jumpBuffer = 0;
    this.peakY = 0;
    this.slide = null;
    this.slideCooldown = 0;
    this.mantle = null;
    this.tacMeter = 1;
    this.tacExhausted = false;
    this.tacEndAt = -10;
    this.crouchPressAt = -10;
    this.crouchFromPress = false;
    this.wantStand = false;
    this.lastDamageAt = -100;
    this.deathTime = 0;
    this.stepIndex = 0;
    this.stepOffsetPending = 0;
    this.mantleCheckTick = 0;
    this.walls = [];
    this.sprintOutT = 0;
    this.lastHitDir = null;
  }

  // ------------------------------------------------------------------ lifecycle
  async init(game) {
    this.game = game;
    const { RAPIER, world } = game.physics;
    this.RAPIER = RAPIER;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(T.height.stand / 2 - T.radius, T.radius)
        .setTranslation(0, T.height.stand / 2, 0)
        .setCollisionGroups(groups(LAYER.PLAYER, ALL & ~(LAYER.DEBRIS | LAYER.TRIGGER))),
      this.body,
    );
    game.physics.setData(this.collider, { type: 'player', entity: this, surface: 'flesh' });

    const kcc = world.createCharacterController(T.skin);
    kcc.setUp(UP);
    kcc.setSlideEnabled(true);
    kcc.enableAutostep(T.stepHeight, T.stepMinWidth, false);
    kcc.enableSnapToGround(T.snapToGround);
    kcc.setMaxSlopeClimbAngle(T.maxSlopeClimb * DEG);
    kcc.setMinSlopeSlideAngle(T.minSlopeSlide * DEG);
    kcc.setApplyImpulsesToDynamicBodies(true);
    kcc.setCharacterMass(85);
    this.kcc = kcc;
    this.shapes = new Map();

    game.physics.onStep((h) => this._step(h));
    game.events.on('run:start', () => this._onRunStart());

    const sp = game.world?.spawns?.player?.[0];
    if (sp) this.setPose({ pos: sp.pos, yaw: sp.yaw || 0, pitch: 0 });
    else this.setPose({ pos: [0, 0, 0] });

    this.cam.init(game);
    const { buildCourse } = await import('./course.js');
    buildCourse(game, this);
  }

  // ------------------------------------------------------------------ public API
  get eye() {
    return new THREE.Vector3(this.position.x, this.position.y + this.cam.eyeHeight, this.position.z);
  }

  get stamina() {
    return this.tacMeter;
  }

  // pos = feet [x,y,z] or Vector3; yaw/pitch in degrees. Also resets transient state (revives,
  // stands up, clears slide/mantle/recoil/shake) so harness shots are self-contained.
  setPose({ pos, yaw = 0, pitch = 0, keepState = false } = {}) {
    const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : new THREE.Vector3().copy(pos);
    this.position.copy(p);
    this.prevPosition.copy(p);
    this.renderPosition.copy(p);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw * DEG;
    this.pitch = pitch * DEG;
    this.debugView = null;
    if (!keepState) {
      this._resetTransient();
      this.health = this.maxHealth;
      this.alive = true;
      Object.assign(this.state, {
        grounded: true, sprinting: false, tacticalSprint: false, crouching: false, sliding: false, moving: false,
        prone: false, mantling: false, mantleT: 0, vaulting: false, stance: 'stand', tacMeter: 1, dead: false, sprintOutT: 0,
      });
      for (const k in this.latch) this.latch[k] = false;
      this._setCapsule(T.height.stand);
      this.stance = 'stand';
      this.peakY = p.y;
      this.motion.bobPhase = Math.PI / 2;
      this.motion.bobAmount = 0;
      this.motion.speed01 = 0;
      this.motion.landImpulse = 0;
      this.cam.reset();
    }
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this._syncCollider();
    if (this.game) this.cam.apply(0, this.game);
  }

  // Weapon camera kick. pitchDeg > 0 kicks up; yawDeg is added to yaw (positive = left).
  applyRecoil(pitchDeg, yawDeg = 0) {
    this.cam.recoil(pitchDeg, yawDeg);
  }

  // Trauma-based shake: intensity 0..1 (1 = very violent), duration seconds.
  addShake(intensity = 0.3, duration = 0.4) {
    this.cam.shake(intensity, duration);
  }

  takeDamage(amount, info = {}) {
    if (!this.alive || !(amount > 0)) return;
    const game = this.game;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageAt = game.time.now;
    const direction = this._attackerDirection(info);
    if (direction) this.lastHitDir = direction.clone();
    game.events.emit('player:damaged', { amount, health: this.health, direction, source: info.source ?? null });
    this.cam.flinch(direction, amount);
    if (this.health <= 0) this._die(info);
  }

  kill(info = {}) {
    this.takeDamage(this.health + 1, info);
  }

  // ------------------------------------------------------------------ per frame
  update(dt, game) {
    const inp = game.input;
    const w = game.weapons;
    this.adsAmount = clamp(w?.adsAmount ?? 0, 0, 1);

    // Menu flyover / cinematics own the camera: freeze player input meanwhile and resume cleanly.
    const overridden = typeof game.cameraOverride === 'function';
    if (overridden !== this._overridden) {
      this._overridden = overridden;
      this.velocity.set(0, 0, 0);
      this.cam.reset();
      this.cam.eye.reset(this.stance === 'slide' ? T.eye.slide : T.eye[this.stance] ?? T.eye.stand);
      for (const k in this.latch) this.latch[k] = false;
    }

    if (overridden) {
      const I = this.intent;
      I.f = I.s = 0;
      I.jumpHeld = I.crouchHeld = I.sprintHeld = I.adsHeld = I.fireHeld = false;
      this.state.sprinting = false;
      this._endTac();
      if (!this.alive) this.deathTime += dt;
    } else if (this.alive) {
      // Mouse look. ADS scales sensitivity by the zoom ratio (CoD "relative" ADS sensitivity).
      const sens = inp.sensitivity * (game.settings.sensitivity ?? 1) * this.cam.lookScale(game);
      this.yaw -= inp.lookDelta.x * sens;
      this.pitch = clamp(this.pitch - inp.lookDelta.y * sens, -1.5, 1.5);

      const I = this.intent;
      I.f = (inp.down('forward') ? 1 : 0) - (inp.down('back') ? 1 : 0);
      I.s = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      I.jumpHeld = inp.down('jump');
      I.crouchHeld = inp.down('crouch');
      I.sprintHeld = inp.down('sprint');
      I.adsHeld = inp.down('ads');
      I.fireHeld = inp.down('fire');
      const L = this.latch;
      if (inp.pressed('jump')) L.jump = true;
      if (inp.pressed('crouch')) L.crouch = true;
      if (inp.released('crouch')) L.crouchUp = true;
      if (inp.pressed('prone')) L.prone = true;
      if (inp.pressed('sprint')) L.sprint = true;

      // Health regen after a few seconds without damage.
      if (this.health < this.maxHealth && game.time.now - this.lastDamageAt > T.health.regenDelay) {
        this.health = Math.min(this.maxHealth, this.health + T.health.regenRate * dt);
      }
    } else {
      const I = this.intent;
      I.f = I.s = 0;
      I.jumpHeld = I.crouchHeld = I.sprintHeld = I.adsHeld = I.fireHeld = false;
      this.deathTime += dt;
      // Inside a wave-survival run the UI shows the run summary and emits run:start to redeploy.
      if (this.deathTime > T.respawnDelay && !game.run?.active) this.respawn();
    }
  }

  lateUpdate(dt, game) {
    const a = game.physics.alpha ?? 0;
    this.renderPosition.lerpVectors(this.prevPosition, this.position, a);
    if (typeof game.cameraOverride === 'function') game.cameraOverride(game.camera, dt, game);
    else this.cam.apply(dt, game);
  }

  // run:start (DEPLOY / REDEPLOY): full health, clean camera state, spawn in the central square.
  _onRunStart() {
    const sp = this.game.world?.spawns?.player?.[0];
    this.setPose({ pos: sp ? sp.pos : [0, 0, 0], yaw: sp?.yaw || 0, pitch: 0 });
    this.game.events.emit('player:respawn', {});
  }

  // ------------------------------------------------------------------ simulation (fixed step)
  _step(h) {
    this.simTime += h;
    this.prevPosition.copy(this.position);
    const L = this.latch;
    const st = this.state;

    if (!this.alive) {
      this._deadStep(h);
      this._clearLatches();
      return;
    }
    if (this.mantle) {
      this._mantleStep(h);
      this._clearLatches();
      this._updateTac(h);
      return;
    }

    this.slideCooldown -= h;
    this.jumpBuffer -= h;
    this.timeSinceJump += h;
    if (L.jump) this.jumpBuffer = T.jumpBuffer;

    const wasSprinting = this.state.sprinting;
    this._stanceInput(L);
    this._sprintLogic(L);
    this._updateSprintOut(h, wasSprinting);
    if (st.sliding) this._slideStep(h);
    else this._moveStep(h);
    this._jumpLogic(h);

    // Gravity (semi-implicit; applied before the move).
    this.velocity.y = Math.max(-T.terminalVelocity, this.velocity.y - T.gravity * h);
    this._kccMove(h);
    this._keepInBounds();
    this._footsteps(h);
    this._updateTac(h);
    this._clearLatches();
    this._publishState();
  }

  _clearLatches() {
    const L = this.latch;
    L.jump = L.crouch = L.crouchUp = L.prone = L.sprint = false;
  }

  // ------------------------------------------------------------------ stance
  _stanceInput(L) {
    const st = this.state;
    const mode = this.game.settings.crouchMode || 'hybrid'; // 'toggle' | 'hold' | 'hybrid'
    if (L.crouch) {
      if (st.sliding) {
        if (this.slide.t >= T.slide.minCancelTime) this._slideCancel('crouch');
      } else if (
        st.sprinting && st.grounded && this._hSpeed() >= T.slide.minSpeed && this.slideCooldown <= 0 && this.stance === 'stand'
      ) {
        this._startSlide();
      } else if (this.stance === 'prone') {
        this._trySetStance('crouch');
      } else if (this.stance === 'crouch') {
        if (mode !== 'hold') this._trySetStance('stand');
      } else {
        this._trySetStance('crouch');
        this.crouchPressAt = this.simTime;
        this.crouchFromPress = true;
      }
    }
    if (L.crouchUp) {
      const held = this.simTime - this.crouchPressAt;
      if (this.stance === 'crouch' && this.crouchFromPress && (mode === 'hold' || (mode === 'hybrid' && held > 0.3))) {
        this.wantStand = true;
      }
      this.crouchFromPress = false;
    }
    if (this.wantStand) {
      if (this.stance !== 'crouch' || st.sliding) this.wantStand = false;
      else if (this._trySetStance('stand')) this.wantStand = false;
    }
    if (L.prone && !st.sliding) {
      if (this.stance === 'prone') this._trySetStance('stand') || this._trySetStance('crouch');
      else if (st.grounded) this._trySetStance('prone');
    }
  }

  _trySetStance(stance) {
    if (stance === this.stance) return true;
    const h = T.height[stance];
    if (h > this.capsuleHeight + 1e-4 && !this._fits(h, this.position)) return false;
    this.stance = stance;
    this._setCapsule(h);
    if (stance !== 'stand') {
      this.state.sprinting = false;
      this._endTac();
    }
    return true;
  }

  _setCapsule(height) {
    this.capsuleHeight = height;
    if (!this.collider) return;
    this.collider.setHalfHeight(Math.max(0.005, height / 2 - T.radius));
    this.collider.setTranslationWrtParent({ x: 0, y: height / 2, z: 0 });
    this._syncCollider();
  }

  _syncCollider() {
    const p = this.position;
    this.collider?.setTranslation({ x: p.x, y: p.y + this.capsuleHeight / 2, z: p.z });
  }

  _capsuleShape(height, shrink) {
    const key = height.toFixed(3) + ':' + shrink;
    let s = this.shapes.get(key);
    if (!s) {
      const r = T.radius - shrink;
      s = new this.RAPIER.Capsule(Math.max(0.005, height / 2 - T.radius), r);
      this.shapes.set(key, s);
    }
    return s;
  }

  // Does a capsule of `height` fit with its feet at `feet`? (lifted a little off the floor)
  _fits(height, feet, lift = 0.06) {
    const shape = this._capsuleShape(height, 0.02);
    const c = { x: feet.x, y: feet.y + height / 2 + lift, z: feet.z };
    const hit = this.game.physics.world.intersectionWithShape(
      c, IDENT, shape, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, KCC_GROUPS, this.collider,
    );
    return !hit;
  }

  // ------------------------------------------------------------------ sprint
  _forwardEnough() {
    const { f, s } = this.intent;
    return f > 0 && f >= T.sprint.minForward * Math.hypot(f, s);
  }

  _sprintLogic(L) {
    const st = this.state;
    const blocked = this.intent.adsHeld || this.adsAmount > 0.3 || this.intent.fireHeld || st.sliding || !this._forwardEnough();
    if (L.sprint) {
      if (st.sprinting) {
        if (!st.tacticalSprint && !this.tacExhausted && this.tacMeter >= T.tac.minToStart) st.tacticalSprint = true;
      } else if (!blocked) {
        if (this.stance !== 'stand') this._trySetStance('stand');
        if (this.stance === 'stand') st.sprinting = true;
      }
    } else if (!st.sprinting && this.intent.sprintHeld && !blocked && this.stance === 'stand') {
      st.sprinting = true; // holding sprint before pushing forward
    }
    if (st.sprinting && (blocked || this.stance !== 'stand')) {
      st.sprinting = false;
    }
    if (st.tacticalSprint && !st.sprinting) this._endTac();
  }

  // Sprint-out: after leaving sprint (not into a slide) weapons wait T.sprint.outTime before firing
  // or aiming. Published as state.sprintOutT (seconds remaining).
  _updateSprintOut(h, wasSprinting) {
    const st = this.state;
    if (wasSprinting && !st.sprinting && !st.sliding) this.sprintOutT = T.sprint.outTime;
    else if (st.sprinting) this.sprintOutT = 0;
    else this.sprintOutT = Math.max(0, (this.sprintOutT || 0) - h);
    st.sprintOutT = this.sprintOutT;
  }

  _endTac() {
    if (this.state.tacticalSprint) this.tacEndAt = this.simTime;
    this.state.tacticalSprint = false;
  }

  _updateTac(h) {
    const st = this.state;
    if (st.tacticalSprint) {
      this.tacMeter -= h / T.tac.duration;
      this.tacEndAt = this.simTime;
      if (this.tacMeter <= 0) {
        this.tacMeter = 0;
        this.tacExhausted = true;
        st.tacticalSprint = false;
      }
    } else if (st.sliding || this.mantle || !st.grounded) {
      // recharge pauses (does not reset) while sliding / airborne / mantling
    } else if (this.simTime - this.tacEndAt > T.tac.rechargeDelay && this.tacMeter < 1) {
      this.tacMeter = Math.min(1, this.tacMeter + h / T.tac.rechargeTime);
      if (this.tacMeter >= 1) this.tacExhausted = false;
    }
  }

  // ------------------------------------------------------------------ horizontal movement
  _hSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  _wish(out) {
    const st = this.state;
    let { f, s } = this.intent;
    const len = Math.hypot(f, s);
    if (len < 1e-3) return out.set(0, 0, 0);
    f /= Math.max(1, len);
    s /= Math.max(1, len);
    const ads = this.adsAmount;
    let speed;
    if (st.sprinting) speed = st.tacticalSprint ? T.speed.tac : T.speed.sprint;
    else if (this.stance === 'prone') speed = T.speed.prone;
    else if (this.stance === 'crouch') speed = lerp(T.speed.crouch, T.speed.crouchAds, ads);
    else speed = lerp(T.speed.walk, T.speed.ads, ads);
    if (!st.sprinting) {
      const nf = f / Math.hypot(f, s);
      speed *= nf >= 0 ? lerp(T.strafeMult, 1, nf * nf) : lerp(T.strafeMult, T.backMult, nf * nf);
    }
    const mm = this.game.weapons?.current?.moveMult;
    if (typeof mm === 'number' && mm > 0.3 && mm < 1.5) speed *= mm;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return out.set((-sy * f + cy * s) * speed, 0, (-cy * f - sy * s) * speed);
  }

  _moveStep(h) {
    const v = this.velocity;
    const wish = this._wish(_d);
    // Touching walls: slide along them instead of pushing into them.
    const W = this.walls;
    for (let i = 0; i < W.length; i += 2) {
      const d = wish.x * W[i] + wish.z * W[i + 1];
      if (d < 0) {
        wish.x -= d * W[i];
        wish.z -= d * W[i + 1];
      }
    }
    const tgt = Math.hypot(wish.x, wish.z);
    if (this.state.grounded) {
      if (tgt < 1e-3) {
        moveTowards2(v, 0, 0, T.decel * h);
      } else {
        // Split velocity into the component along the wish direction (speed changes, weighty)
        // and the perpendicular component (direction changes, grippy) so turning never skates.
        const dx = wish.x / tgt, dz = wish.z / tgt;
        let along = v.x * dx + v.z * dz;
        let px = v.x - along * dx, pz = v.z - along * dz;
        const pl = Math.hypot(px, pz);
        const pk = pl > 0 ? Math.max(0, pl - (T.accel * 1.5) * h) / pl : 0;
        px *= pk;
        pz *= pk;
        if (along < tgt) {
          const rate = along < 0 ? T.decel + T.accel : along < T.speed.walk ? T.accel : T.sprintAccel;
          along = Math.min(tgt, along + rate * h);
        } else {
          along = Math.max(tgt, along - T.slowDecel * h);
        }
        v.x = dx * along + px;
        v.z = dz * along + pz;
      }
    } else {
      // Air: keep momentum, allow limited steering, never gain speed beyond max(current, wish).
      const cur = Math.hypot(v.x, v.z);
      if (tgt > 1e-3) {
        const cap = Math.max(cur, tgt);
        moveTowards2(v, wish.x, wish.z, T.airAccel * h);
        const n = Math.hypot(v.x, v.z);
        if (n > cap) {
          v.x *= cap / n;
          v.z *= cap / n;
        }
      } else {
        const k = Math.max(0, 1 - T.airDrag * h);
        v.x *= k;
        v.z *= k;
      }
    }
  }

  // ------------------------------------------------------------------ slide
  _startSlide() {
    const st = this.state;
    const v = this.velocity;
    const sp = this._hSpeed();
    this.slide = {
      t: 0,
      dir: new THREE.Vector3(v.x / sp, 0, v.z / sp),
      speed: sp,
      target: Math.min(T.slide.maxSpeed, sp + T.slide.boost),
      startSpeed: sp,
      startPos: this.position.clone(),
      tac: st.tacticalSprint,
    };
    st.sliding = true;
    st.sprinting = false;
    this._endTac();
    this.stance = 'slide';
    this._setCapsule(T.height.slide);
    this.game.events.emit('player:slide', { phase: 'start' });
    this.cam.onSlideStart();
  }

  _slideStep(h) {
    const s = this.slide;
    s.t += h;
    let speed = s.speed;
    if (s.t <= T.slide.boostTime) speed += ((s.target - s.startSpeed) / T.slide.boostTime) * h;
    else speed -= (T.slide.friction + T.slide.frictionLin * speed) * h;
    if (this.state.grounded) {
      const n = this.groundNormal;
      speed += T.gravity * T.slide.slopeGain * n.y * (n.x * s.dir.x + n.z * s.dir.z) * h;
    }
    // Gentle steering towards the stick direction.
    const wish = this._wish(_d);
    const wl = Math.hypot(wish.x, wish.z);
    if (wl > 0.1) {
      const cur = Math.atan2(s.dir.x, s.dir.z);
      const want = Math.atan2(wish.x, wish.z);
      let da = want - cur;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < Math.PI * 0.6) {
        const a = cur + clamp(da, -T.slide.steerRate * h, T.slide.steerRate * h);
        s.dir.set(Math.sin(a), 0, Math.cos(a));
      }
    }
    speed = clamp(speed, 0, T.slide.maxSpeed);
    s.speed = speed;
    this.velocity.x = s.dir.x * speed;
    this.velocity.z = s.dir.z * speed;
    if (s.t >= T.slide.duration || (s.t > 0.2 && speed < T.slide.endSpeed)) {
      // Hard cut to crouch-walk speed (CoD slides stop, they do not ease out).
      const cut = Math.min(speed, T.speed.crouch);
      this.velocity.x = s.dir.x * cut;
      this.velocity.z = s.dir.z * cut;
      this._endSlide('crouch');
    }
    else if (!this.state.grounded && this.timeSinceGround > 0.25) this._endSlide('air');
  }

  _endSlide(to = 'crouch', cancel = null) {
    const s = this.slide;
    if (!s) return;
    this.state.sliding = false;
    this.slideCooldown = T.slide.cooldown;
    this.lastSlide = { distance: Math.hypot(this.position.x - s.startPos.x, this.position.z - s.startPos.z), time: s.t, reason: to, cancel, endSpeed: this._hSpeed() };
    this.slide = null;
    // Stand up if that is what was asked (and there is room), otherwise end crouched.
    this.stance = 'crouch';
    this._setCapsule(T.height.crouch);
    if (to === 'stand' || to === 'air') this._trySetStance('stand');
    this.game.events.emit('player:slide', { phase: 'end', cancel });
    this.cam.onSlideEnd();
  }

  _slideCancel(kind) {
    const st = this.state;
    // MWIII slide-cancel: crouch or jump ends the slide immediately, stands up straight into
    // sprint and restores tactical sprint.
    this._endSlide('stand', kind);
    if (this.stance !== 'stand') return;
    if (kind === 'jump') {
      const k = T.slide.jumpKeep;
      this.velocity.x *= k;
      this.velocity.z *= k;
      this._doJump();
    }
    if (this._forwardEnough() || kind === 'jump') {
      st.sprinting = true;
      this.tacMeter = 1;
      this.tacExhausted = false;
      st.tacticalSprint = true;
      this.sprintOutT = 0;
    }
  }

  // ------------------------------------------------------------------ jump / mantle
  _jumpLogic() {
    const st = this.state;
    if (this.jumpBuffer <= 0) {
      // Holding jump + forward in the air grabs ledges (CoD auto-mantle).
      if (!st.grounded && !st.sliding && this.intent.f > 0.3 && (this.intent.jumpHeld || this.timeSinceJump < 0.35)) {
        if ((this.mantleCheckTick++ & 1) === 0) this._tryMantle(false);
      }
      return;
    }
    if (st.sliding) {
      if (this.slide.t >= T.slide.minCancelTime) {
        this.jumpBuffer = 0;
        this._slideCancel('jump');
      }
      return;
    }
    if (this.stance === 'prone') {
      this.jumpBuffer = 0;
      this._trySetStance('crouch');
      return;
    }
    const canJump = st.grounded || (this.timeSinceGround < T.coyoteTime && !this.jumpedSinceGround);
    if (this._tryMantle(canJump)) {
      this.jumpBuffer = 0;
      return;
    }
    if (this.stance === 'crouch') {
      if (canJump) {
        this.jumpBuffer = 0;
        this._trySetStance('stand'); // CoD: jump while crouched stands you up
      }
      return;
    }
    if (canJump) this._doJump();
  }

  _doJump() {
    const st = this.state;
    this.velocity.y = Math.sqrt(2 * T.gravity * T.jumpHeight);
    if (st.grounded) this.airStartY = this.position.y;
    st.grounded = false;
    this.jumpedSinceGround = true;
    this.timeSinceJump = 0;
    this.jumpBuffer = 0;
    this.peakY = this.position.y;
    this.game.events.emit('player:jump', {});
    this.cam.onJump();
  }

  _ray(origin, dir, dist) {
    return this.game.physics.raycast(origin, dir, dist, { filterGroups: RAY_GROUPS });
  }

  // Look for a ledge in front. fromGround: the player is (or just was) standing.
  _tryMantle(fromGround) {
    if (this.stance !== 'stand' && this.stance !== 'crouch') return false;
    const M = T.mantle;
    const p = this.position;
    const R = T.radius;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = _v.set(-sy, 0, -cy);
    // Walking/strafing direction also counts when it points roughly forward.
    const maxAbove = fromGround ? M.maxHeight : M.airMaxAbove;

    // 1) Find a wall face in front with horizontal rays at several heights.
    let wall = null;
    for (const hgt of [0.3, 0.7, 1.1, 1.5]) {
      if (hgt > maxAbove - 0.05) break;
      _o.set(p.x, p.y + hgt, p.z);
      const hit = this._ray(_o, fwd, R + M.reach);
      if (hit && Math.abs(hit.normal.y) < 0.5 && (!wall || hit.distance < wall.distance)) wall = hit;
    }
    if (!wall) return false;
    const n = new THREE.Vector3(wall.normal.x, 0, wall.normal.z).normalize();
    const dir = n.clone().negate();
    if (dir.dot(fwd) < Math.cos(M.maxAngle * DEG)) return false;

    // 2) Probe down just past the wall face for the ledge top (below any ceiling).
    let topY = p.y + maxAbove + 0.35;
    _o.set(p.x, p.y + this.capsuleHeight - 0.05, p.z);
    const ceil = this._ray(_o, DOWN.clone().negate(), topY - _o.y + 0.3);
    if (ceil) topY = Math.min(topY, ceil.point.y - 0.05);
    const px = wall.point.x + dir.x * 0.14, pz = wall.point.z + dir.z * 0.14;
    _o.set(px, topY, pz);
    const ledge = this._ray(_o, DOWN, topY - (p.y + M.minHeight * (fromGround ? 1 : 0) - 0.3));
    if (!ledge || ledge.distance < 1e-3 || ledge.normal.y < 0.75) return false;
    const height = ledge.point.y - p.y;
    const minH = fromGround ? M.minHeight : -0.25;
    if (height < minH || height > maxAbove) return false;
    const topSurface = ledge.point.y;
    // Jump-mantles reach about as high as a standing mantle from the take-off ground.
    if (!fromGround && topSurface - (this.airStartY ?? p.y) > M.maxHeight + 0.12) return false;

    // 3) Nothing in the way between us and the ledge edge at ledge height (e.g. a window frame).
    _o.set(p.x, topSurface + 0.25, p.z);
    const block = this._ray(_o, dir, Math.max(0.05, wall.distance + 0.2));
    if (block) return false;

    // 4) Vault (thin obstacle, low) or mantle onto the top.
    const wallX = wall.point.x, wallZ = wall.point.z;
    let vault = false;
    let land = new THREE.Vector3();
    let endStance = 'stand';
    if (height <= M.vaultMaxHeight && fromGround) {
      // Depth probe: is the top surface thin?
      const dx = wallX + dir.x * (M.vaultMaxDepth + 0.12), dz = wallZ + dir.z * (M.vaultMaxDepth + 0.12);
      _o.set(dx, topSurface + 0.3, dz);
      const far = this._ray(_o, DOWN, 3.5);
      if (!far || far.point.y < topSurface - 0.45) {
        // Find where the obstacle ends: walk the probe back towards the wall.
        let depth = M.vaultMaxDepth;
        for (let d = 0.2; d <= M.vaultMaxDepth + 0.01; d += 0.1) {
          _o.set(wallX + dir.x * d, topSurface + 0.3, wallZ + dir.z * d);
          const hh = this._ray(_o, DOWN, 0.45);
          if (!hh || hh.point.y < topSurface - 0.3) {
            depth = d;
            break;
          }
        }
        const lx = wallX + dir.x * (depth + R + 0.2), lz = wallZ + dir.z * (depth + R + 0.2);
        land.set(lx, topSurface + 0.06, lz);
        // Over-the-top clearance and landing clearance.
        const overX = wallX + dir.x * (depth * 0.5), overZ = wallZ + dir.z * (depth * 0.5);
        if (this._fits(T.height.crouch, _o.set(overX, topSurface + 0.02, overZ), 0.02) && this._fits(T.height.stand, land, 0.02)) {
          vault = true;
        }
      }
    }
    if (!vault) {
      land.set(wallX + dir.x * (R + 0.16), topSurface, wallZ + dir.z * (R + 0.16));
      if (!this._fits(T.height.stand, land, 0.03)) {
        if (this._fits(T.height.crouch, land, 0.03)) endStance = 'crouch';
        else return false;
      }
    }
    // 5) Room to rise straight up in front of the wall.
    _o.set(p.x, topSurface + 0.02, p.z);
    if (!this._fits(T.height.crouch, _o, 0)) return false;

    this._startMantle({ height, topY: topSurface, dir, land, vault, endStance });
    return true;
  }

  _startMantle({ height, topY, dir, land, vault, endStance }) {
    const st = this.state;
    const M = T.mantle;
    if (st.sliding) this._endSlide('crouch');
    this.mantle = {
      t: 0,
      dur: vault ? M.vaultTime + 0.08 * Math.max(0, height - 0.8) : M.timeBase + M.timePerMetre * Math.max(0.5, height),
      start: this.position.clone(),
      topY,
      dir: dir.clone(),
      land: land.clone(),
      vault,
      height,
      endStance,
      sprint: st.sprinting || this.intent.sprintHeld,
      tac: st.tacticalSprint,
    };
    st.mantling = true;
    st.vaulting = vault;
    st.sprinting = false;
    this._endTac();
    this.velocity.set(0, 0, 0);
    this.jumpBuffer = 0;
    st.grounded = false;
    this.game.events.emit('player:mantle', { phase: 'start', height, vault });
    this.cam.onMantleStart(this.mantle);
  }

  _mantleStep(h) {
    const m = this.mantle;
    const st = this.state;
    m.t += h;
    const u = clamp(m.t / m.dur, 0, 1);
    const s = m.start;
    const p = this.position;
    if (m.vault) {
      // Up and over in one motion: rise quickly, travel across the top, release on the far side.
      const up = easeOutCubic(u / 0.42);
      const fw = easeInOutSine((u - 0.12) / 0.88);
      p.y = lerp(s.y, m.topY + 0.06, up);
      p.x = lerp(s.x, m.land.x, fw);
      p.z = lerp(s.z, m.land.z, fw);
    } else {
      // Pull up (fast, then slowing) and roll onto the top.
      const up = easeOutCubic(u / 0.62);
      const fw = easeInOutSine((u - 0.4) / 0.6);
      const over = T.mantle.overshoot * Math.sin(Math.PI * clamp((u - 0.4) / 0.6, 0, 1));
      p.y = lerp(s.y, m.topY, up) + over;
      p.x = lerp(s.x, m.land.x, fw);
      p.z = lerp(s.z, m.land.z, fw);
    }
    st.mantleT = u;
    this.body.setNextKinematicTranslation(p);
    this._syncCollider();
    if (u >= 1) {
      this.mantle = null;
      st.mantling = false;
      st.vaulting = false;
      st.mantleT = 0;
      if (m.endStance !== this.stance) this._trySetStance(m.endStance);
      const exit = m.vault ? T.mantle.vaultExitSpeed : T.mantle.exitSpeed;
      this.velocity.set(m.dir.x * exit, m.vault ? 0.5 : 0, m.dir.z * exit);
      if (!m.vault) p.y = m.topY + 0.005;
      this.peakY = p.y;
      this.jumpedSinceGround = true;
      this.timeSinceGround = m.vault ? 0.2 : 0;
      if (m.sprint && this._forwardEnough() && this.stance === 'stand') st.sprinting = true;
      this.lastMantle = { height: m.height, vault: m.vault, time: m.t, end: p.clone() };
      this.game.events.emit('player:mantle', { phase: 'end', height: m.height, vault: m.vault });
      this.cam.onMantleEnd(m);
    }
    this._publishState();
  }

  // ------------------------------------------------------------------ KCC move + contacts
  _kccMove(h) {
    const st = this.state;
    const v = this.velocity;
    const kcc = this.kcc;
    const wasGrounded = st.grounded;
    const vyBefore = v.y;
    const desired = { x: v.x * h, y: v.y * h, z: v.z * h };
    kcc.computeColliderMovement(this.collider, desired, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, KCC_GROUPS);
    const m = kcc.computedMovement();
    let grounded = kcc.computedGrounded() && v.y <= 0.5;
    const dh = Math.hypot(desired.x, desired.z);
    const mh = Math.hypot(m.x, m.z);

    // Explicit step-up (kerbs, stairs): blocked while grounded and there is a walkable top within
    // step height just ahead with room for the capsule → lift onto it (camera smooths the jump).
    let stepped = null;
    if (wasGrounded && v.y <= 0.01 && dh > 1e-4 && mh < dh * 0.75 && !st.sliding) stepped = this._stepUp(desired, dh);
    if (stepped) {
      m.x = stepped.x - this.position.x;
      m.y = stepped.y - this.position.y;
      m.z = stepped.z - this.position.z;
      grounded = true;
      this.blockedSteps = 0;
    } else {
      // Clip velocity against near-vertical contacts so no speed is stored into walls (no corner
      // jitter, bob/footsteps stop when pressed into a wall) and bonk on ceilings. Rounded contacts
      // on step edges (normal.y > 0.3) are left alone so stairs keep their speed.
      const nc = kcc.numComputedCollisions();
      this.walls.length = 0;
      for (let i = 0; i < nc; i++) {
        const c = kcc.computedCollision(i, this._coll || (this._coll = new this.RAPIER.CharacterCollision()));
        if (!c) continue;
        const nx = c.normal1.x, ny = c.normal1.y, nz = c.normal1.z; // obstacle normal, pointing at us
        if (ny < -0.5) {
          if (v.y > 0) v.y = 0; // ceiling bonk
        } else if (ny < 0.3) {
          const hl = Math.hypot(nx, nz) || 1;
          const hx = nx / hl, hz = nz / hl;
          if (this.walls.length < 4) this.walls.push(hx, hz);
          const hd = v.x * hx + v.z * hz;
          if (hd < 0) {
            v.x -= hd * hx;
            v.z -= hd * hz;
          }
        }
      }
      if (v.y > 0 && m.y < desired.y * 0.5 - 1e-4) v.y = 0;
      // Flush against geometry the controller may report no contact: after a few blocked steps fall
      // back to the achieved motion.
      this.blockedSteps = dh > 1e-5 && mh < dh * 0.5 ? (this.blockedSteps || 0) + 1 : 0;
      if (this.blockedSteps >= 3) {
        const along = mh > 1e-6 ? (v.x * m.x + v.z * m.z) / mh : 0;
        const k = mh > 1e-6 ? Math.max(0, along) / mh : 0;
        v.x = m.x * k;
        v.z = m.z * k;
      }
    }

    const dy = m.y;
    this.position.x += m.x;
    this.position.y += m.y;
    this.position.z += m.z;
    this.body.setNextKinematicTranslation(this.position);
    this._syncCollider();

    if (grounded) {
      // Ground probe for normal + surface.
      _o.set(this.position.x, this.position.y + 0.25, this.position.z);
      const g = this._ray(_o, DOWN, 0.6);
      if (g) {
        this.groundNormal.copy(g.normal);
        this.groundSurface = g.data?.surface || 'concrete';
      } else this.groundNormal.set(0, 1, 0);
      if (v.y < 0) v.y = 0;
      // Discrete height changes while grounded (autostep up kerbs/stairs, snapping down) are
      // smoothed by the camera so stairs do not feel like a staircase of jolts.
      // On flat treads any vertical change is a step (edge ride, step-up, snap-down): smooth it.
      // On ramps (tilted ground normal) the camera follows exactly.
      const flat = this.groundNormal.y > 0.97;
      if (wasGrounded && ((flat && Math.abs(dy) > 0.004) || Math.abs(dy) > 0.07) && Math.abs(dy) < 0.6) {
        this.cam.onStep(dy);
        this.prevPosition.y += dy; // interpolate without the discrete jump; the spring eases it
      }
    }

    if (!grounded) {
      if (wasGrounded) {
        this.peakY = this.position.y;
        this.airStartY = this.position.y - m.y; // ground height we left from (jump or walk-off)
      }
      this.peakY = Math.max(this.peakY, this.position.y);
      this.timeSinceGround += h;
    } else {
      if (!wasGrounded) this._onLand(-vyBefore);
      this.timeSinceGround = 0;
      this.jumpedSinceGround = false;
    }
    st.grounded = grounded;
  }

  _stepUp(desired, dh) {
    const p = this.position;
    const ux = desired.x / dh, uz = desired.z / dh;
    const R = T.radius;
    for (const ahead of [R + 0.05, R + 0.15]) {
      _o.set(p.x + ux * ahead, p.y + T.stepHeight + 0.04, p.z + uz * ahead);
      const hit = this._ray(_o, DOWN, T.stepHeight + 0.02);
      if (!hit || hit.normal.y < 0.7 || hit.distance < 1e-3) continue;
      const rise = hit.point.y - p.y;
      if (rise < 0.03 || rise > T.stepHeight) continue;
      const adv = Math.min(dh, 0.06);
      const np = new THREE.Vector3(p.x + ux * adv, hit.point.y + 0.004, p.z + uz * adv);
      if (!this._fits(this.capsuleHeight, np, 0.004)) continue;
      return np;
    }
    return null;
  }

  _onLand(impactSpeed) {
    const fall = this.peakY - this.position.y;
    const st = this.state;
    impactSpeed = Math.max(0, impactSpeed);
    if (impactSpeed > 1.5) {
      this.game.events.emit('player:land', { impactSpeed, surface: this.groundSurface, height: fall });
      this.cam.onLand(impactSpeed);
      // Landing slowdown for big drops (not for normal hops).
      const slow = clamp((impactSpeed - 5) * T.landSlowdown, 0, 0.45);
      if (!st.sliding) {
        this.velocity.x *= 1 - slow;
        this.velocity.z *= 1 - slow;
      }
    }
    this.lastLand = { impactSpeed, fall };
    if (fall > T.fall.minHeight && this.alive) {
      const dmg = ((fall - T.fall.minHeight) / (T.fall.lethalHeight - T.fall.minHeight)) * this.maxHealth;
      this.takeDamage(Math.max(1, Math.round(dmg)), { source: 'fall', direction: null });
      this.addShake(clamp(0.25 + fall * 0.04, 0, 0.8), 0.45);
    }
    this.peakY = this.position.y;
  }

  // ------------------------------------------------------------------ footsteps & bob
  _footsteps(h) {
    const st = this.state;
    const mo = this.motion;
    const hs = this._hSpeed();
    const onGround = st.grounded && !st.sliding && !this.mantle;
    let stride = T.stride.walk;
    if (st.sprinting) stride = st.tacticalSprint ? T.stride.tac : T.stride.sprint;
    else if (this.stance === 'crouch') stride = T.stride.crouch;
    else if (this.stance === 'prone') stride = T.stride.prone;
    else stride = lerp(T.stride.walk, T.stride.ads, this.adsAmount);
    if (onGround && hs > 0.35) {
      mo.bobPhase += (Math.PI * hs * h) / stride;
      const idx = Math.floor(mo.bobPhase / Math.PI);
      if (idx !== this.stepIndex) {
        this.stepIndex = idx;
        this.game.events.emit('player:footstep', {
          surface: this.groundSurface,
          position: this.position.clone(),
          speed01: clamp(hs / T.speed.sprint, 0, 1),
          sprint: st.sprinting,
          crouch: this.stance === 'crouch' || this.stance === 'prone',
          foot: idx % 2 === 0 ? 'L' : 'R',
        });
      }
      if (mo.bobPhase > Math.PI * 64) {
        mo.bobPhase -= Math.PI * 64;
        this.stepIndex -= 64;
      }
    } else if (onGround && hs < 0.2) {
      // Settle at mid-stride so the first footfall after starting comes half a stride later.
      const k = Math.floor(mo.bobPhase / Math.PI);
      const tgt = k * Math.PI + Math.PI / 2;
      mo.bobPhase += (tgt - mo.bobPhase) * Math.min(1, 6 * h);
      this.stepIndex = k;
    }
    const amt = onGround ? clamp(hs / T.speed.walk, 0, 1) : 0;
    mo.bobAmount += (amt - mo.bobAmount) * Math.min(1, 10 * h);
    mo.speed01 = clamp(hs / T.speed.sprint, 0, 1);
  }

  _publishState() {
    const st = this.state;
    st.crouching = this.stance === 'crouch';
    st.prone = this.stance === 'prone';
    st.stance = this.stance;
    st.moving = this._hSpeed() > 0.3 || !!this.mantle;
    st.tacMeter = this.tacMeter;
    st.dead = !this.alive;
  }

  // ------------------------------------------------------------------ bounds
  _keepInBounds() {
    const p = this.position;
    let box = null, region = null;
    for (const r of this.extraBounds) {
      if (r.box.containsPoint(p)) {
        box = r.box;
        region = r;
        break;
      }
    }
    if (!box) box = this.game.world?.bounds;
    if (!box || box.isEmpty()) return;
    const R = T.radius;
    const cx = clamp(p.x, box.min.x + R, box.max.x - R);
    const cz = clamp(p.z, box.min.z + R, box.max.z - R);
    if (cx !== p.x) this.velocity.x = 0;
    if (cz !== p.z) this.velocity.z = 0;
    if (cx !== p.x || cz !== p.z) {
      p.x = cx;
      p.z = cz;
      this.body.setNextKinematicTranslation(p);
      this._syncCollider();
    }
    if (p.y < box.min.y) {
      // Fell out of the world: put the player back at a spawn.
      const sp = region?.fallback || this._pickSpawn();
      if (sp) this.setPose({ pos: sp.pos, yaw: sp.yaw || 0 });
    }
  }

  _pickSpawn() {
    const spawns = this.game.world?.spawns?.player || [];
    if (!spawns.length) return null;
    const enemies = (this.game.ai?.enemies || []).filter((e) => e.alive && e.position);
    if (!enemies.length) {
      this.spawnCursor = ((this.spawnCursor ?? -1) + 1) % spawns.length;
      return spawns[this.spawnCursor];
    }
    // Farthest spawn from the nearest living enemy.
    let best = spawns[0], bestD = -1;
    for (const s of spawns) {
      let dmin = Infinity;
      for (const e of enemies) dmin = Math.min(dmin, e.position.distanceToSquared(s.pos));
      if (dmin > bestD) {
        bestD = dmin;
        best = s;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ damage / death
  _attackerDirection(info) {
    const eye = this.eye;
    const src = info.source;
    const sp = src?.position || src?.object?.position;
    if (sp && sp.isVector3) return _dirTo(eye, sp);
    if (info.origin?.isVector3) return _dirTo(eye, info.origin);
    if (info.position?.isVector3 && info.position.distanceToSquared(eye) > 1e-4) return _dirTo(eye, info.position);
    if (info.direction?.isVector3) return info.direction.clone().negate().normalize(); // bullet travel dir
    return null;
  }

  _die(info) {
    const st = this.state;
    this.alive = false;
    if (this.slide) this._endSlide('crouch');
    this.mantle = null;
    st.sliding = st.sprinting = st.tacticalSprint = st.mantling = st.vaulting = false;
    st.mantleT = 0;
    st.dead = true;
    this.deathTime = 0;
    this.game.events.emit('player:died', {});
    this.cam.onDeath(this._attackerDirection(info) || this.lastHitDir);
  }

  _deadStep(h) {
    const v = this.velocity;
    moveTowards2(v, 0, 0, 12 * h);
    v.y = Math.max(-T.terminalVelocity, v.y - T.gravity * h);
    if (this.stance !== 'crouch' && this.stance !== 'prone') this._trySetStance('crouch');
    this._kccMove(h);
    this._publishState();
  }

  respawn() {
    const sp = this._pickSpawn();
    const pos = sp ? sp.pos : new THREE.Vector3();
    this.setPose({ pos, yaw: sp?.yaw || 0, pitch: 0 });
    this.game.events.emit('player:respawn', {});
  }
}

function moveTowards2(v, tx, tz, maxDelta) {
  const dx = tx - v.x, dz = tz - v.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxDelta || d < 1e-9) {
    v.x = tx;
    v.z = tz;
  } else {
    v.x += (dx / d) * maxDelta;
    v.z += (dz / d) * maxDelta;
  }
}

function _dirTo(from, to) {
  const d = new THREE.Vector3().subVectors(to, from);
  const l = d.length();
  return l > 1e-5 ? d.multiplyScalar(1 / l) : null;
}
