import * as THREE from 'three';

/**
 * CINEMATIC SEQUENCE — a list of camera shots played on the wall clock.
 *
 * A sequence only describes and directs. The `cinematic` subsystem
 * (src/cinematic/index.js) hosts it: takes the camera off the player, hides
 * the HUD, writes the time scale, and puts everything back afterwards.
 *
 *   const seq = new CinematicSequence({ name, shots, setup, teardown });
 *   seq.play(ctx.get('cinematic'));   // or cinematic.play(seq)
 *   seq.stop();
 *
 * TIME. Shot durations are REAL seconds of footage: the director runs on
 * `time.raw`, never on the scaled clock, so a two-second slow-motion shot is
 * two seconds on screen whatever `timeScale` it runs the simulation at.
 *
 * SHOT FIELDS (all optional except `duration` or `until`)
 *   name          label for logs
 *   duration      seconds on screen
 *   until(seq)    end early once this returns true (after `minDuration`);
 *                 `duration` / `maxDuration` still caps it
 *   cameraMode    'static' | 'dolly' | 'track' | 'frame' | 'orbit'
 *     static      camera at `position`, looking at `target`
 *     dolly       `position` -> `positionEnd`, `target` -> `targetEnd`, eased
 *     track       follows `targetActor` at `offset` (-> `offsetEnd`), looking
 *                 at it plus `targetOffset`; damped by `smoothing`
 *     frame       keeps every actor in `actors` inside `safeFrame`, viewed
 *                 from `direction` (unit, target -> camera), distance fitted
 *     orbit       circles `target` at `radius`/`height`, `angle` + `angularSpeed`·t
 *   position / positionEnd / target / targetEnd
 *                 a point: Vector3, [x,y,z], a mark name (seq.mark), an actor,
 *                 `{ actor, offset:[x,y,z] }`, or `(seq, t) => Vector3`
 *   targetActor   an actor (anything with a ragdoll, an Agent, an Object3D) or
 *                 `(seq) => actor`, resolved once when the shot starts
 *   fov / fovEnd  degrees
 *   roll          radians (dutch angle)
 *   ease          'linear' | 'in' | 'out' | 'inOut' | (u) => u, for dolly/fov
 *   transition    'cut' (default) or `{ type: 'blend', duration }`
 *   smoothing     `{ position, target }` smooth-damp times in seconds (track,
 *                 frame, orbit). 0 = locked on.
 *   timeScale     number, `[[t, v], ...]` keys in shot seconds, or `(seq, t) => v`
 *   cameraShake   number (trauma 0..1) or `{ trauma, decay, amplitude, rotation, frequency }`,
 *                 kicked when the shot starts. `seq.shake()` kicks one any time.
 *   candidates    `[{ ...shot fields }, ...]` alternative framings (offset,
 *                 direction, position, ...). When the shot starts, each is
 *                 tried and the one whose camera can see the most subjects
 *                 (tracked actor / framed actors / includes) wins; ties go
 *                 to the earliest. Set them in onEnter if they need the scene.
 *   events        `[{ at, fn(seq) }]` cues in shot seconds
 *   onEnter(seq) / onUpdate(seq, t, dt) / onExit(seq)
 *
 * SEQUENCE OPTIONS
 *   setup(seq, ctx)     stage the scene; runs inside play(), before shot 0
 *   teardown(seq, ctx)  runs from stop(), whether it finished or was aborted
 *   onUpdate(seq, dt)   every frame, after the current shot's own onUpdate
 *   shake               defaults for cameraShake
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _arr = [0, 0, 0];
const _arr2 = [0, 0, 0];
const _arr3 = [0, 0, 0];

export const EASE = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeFn = (e) => (typeof e === 'function' ? e : EASE[e] ?? EASE.inOut);

/**
 * Smooth-damp a vector toward `goal` (critically damped spring, Game
 * Programming Gems 4 style). `vel` is the persistent velocity; `time` is
 * roughly the lag in seconds. Frame-rate independent.
 */
export function smoothDamp(cur, goal, vel, time, dt) {
  if (dt <= 0) return cur;
  if (time <= 1e-4) {
    cur.copy(goal);
    vel.set(0, 0, 0);
    return cur;
  }
  const omega = 2 / time;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const e = cur.toArray(_arr);
  const g = goal.toArray(_arr2);
  const v = vel.toArray(_arr3);
  for (let i = 0; i < 3; i++) {
    const change = e[i] - g[i];
    const temp = (v[i] + omega * change) * dt;
    v[i] = (v[i] - omega * temp) * exp;
    e[i] = g[i] + (change + temp) * exp;
  }
  cur.fromArray(e);
  vel.fromArray(v);
  return cur;
}

/**
 * World-space tracking point for an actor. For a ragdoll this is its centre
 * of mass — the mean of every particle weighted by mass — which glides
 * through a tumble instead of jittering with whichever limb is outermost.
 */
export function actorCenter(actor, out) {
  if (!actor) return null;
  if (typeof actor === 'function') return actorCenter(actor(), out);
  const rd = actor.ragdoll ?? (actor.particleCount ? actor : null);
  if (rd && rd.alive !== false && rd.particleCount) {
    let x = 0, y = 0, z = 0, m = 0;
    for (let i = 0; i < rd.particleCount; i++) {
      const im = rd.invMass[i];
      const w = im > 0 ? 1 / im : 0;
      x += rd.px[i] * w; y += rd.py[i] * w; z += rd.pz[i] * w; m += w;
    }
    if (m > 0) return out.set(x / m, y / m, z / m);
  }
  if (actor.position && actor.eyeHeight !== undefined) {
    // a standing Agent: chest height
    return out.copy(actor.position).setY(actor.position.y + actor.eyeHeight * 0.62);
  }
  if (actor.isObject3D) return actor.getWorldPosition(out);
  if (actor.position) return out.copy(actor.position);
  if (actor.isVector3) return out.copy(actor);
  return null;
}

/** Velocity of an actor's ragdoll centre (m/s), or zero. */
export function actorVelocity(actor, out, h = 1 / 120) {
  out.set(0, 0, 0);
  const rd = actor?.ragdoll;
  if (!rd || !rd.particleCount) return out;
  let x = 0, y = 0, z = 0, m = 0;
  for (let i = 0; i < rd.particleCount; i++) {
    const im = rd.invMass[i];
    const w = im > 0 ? 1 / im : 0;
    x += (rd.px[i] - rd.qx[i]) * w; y += (rd.py[i] - rd.qy[i]) * w; z += (rd.pz[i] - rd.qz[i]) * w; m += w;
  }
  if (m > 0) out.set(x / m / h, y / m / h, z / m / h);
  return out;
}

/** Evaluate a keyed curve `[[t, v], ...]` (sorted by t) with smoothstep between keys. */
function evalKeys(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const u = clamp01((t - t0) / Math.max(1e-6, t1 - t0));
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1][1];
}

/** Camera shake: trauma-squared noise, sum-of-sines with seeded phases. */
class Shake {
  constructor(seed = 1) {
    this.trauma = 0;
    this.decay = 1.2;
    this.amplitude = 0.12;
    this.rotation = 2.2;
    this.frequency = 22;
    this.t = 0;
    let s = seed >>> 0 || 1;
    const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * Math.PI * 2;
    this.ph = Array.from({ length: 12 }, next);
    this.offset = new THREE.Vector3();
    this.rot = new THREE.Vector3();
  }

  kick(o) {
    if (typeof o === 'number') o = { trauma: o };
    this.trauma = Math.min(1, Math.max(this.trauma, o.trauma ?? 0.6));
    if (o.decay !== undefined) this.decay = o.decay;
    if (o.amplitude !== undefined) this.amplitude = o.amplitude;
    if (o.rotation !== undefined) this.rotation = o.rotation;
    if (o.frequency !== undefined) this.frequency = o.frequency;
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt / Math.max(0.05, this.decay));
    const k = this.trauma * this.trauma;
    if (k <= 0) {
      this.offset.set(0, 0, 0);
      this.rot.set(0, 0, 0);
      return;
    }
    const f = this.frequency * this.t;
    const p = this.ph;
    const n = (i, a, b) => 0.6 * Math.sin(f * a + p[i]) + 0.4 * Math.sin(f * b + p[i + 6]);
    const A = this.amplitude * k;
    const R = (this.rotation * k * Math.PI) / 180;
    this.offset.set(n(0, 1.0, 2.31) * A, n(1, 1.13, 2.73) * A, n(2, 0.91, 2.07) * A);
    this.rot.set(n(3, 1.07, 2.41) * R, n(4, 0.97, 2.19) * R, n(5, 1.21, 2.63) * R * 0.6);
  }
}

export class CinematicSequence {
  constructor(opts = {}) {
    this.name = opts.name ?? 'sequence';
    this.shots = opts.shots ?? [];
    this.setup = opts.setup ?? null;
    this.teardown = opts.teardown ?? null;
    /** Every frame, after the shot's own update: `(seq, dt)`. */
    this.onUpdate = opts.onUpdate ?? null;
    this.shakeDefaults = opts.shake ?? {};
    /** Free-form bag for a sequence's own state (actors, grenade, ...). */
    this.data = {};
    this.marks = new Map();

    this.host = null;
    this.ctx = null;
    this.playing = false;
    this.finished = false;
    this.index = -1;
    this.shot = null;
    this.shotTime = 0;
    this.time = 0;
    this.timeScale = 1;

    /** The directed camera, before shake. Written onto ctx.camera by the host. */
    this.cam = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, roll: 0 };
    this._posVel = new THREE.Vector3();
    this._tgtVel = new THREE.Vector3();
    this._goalPos = new THREE.Vector3();
    this._goalTgt = new THREE.Vector3();
    this._blendFrom = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, roll: 0 };
    this._blendDur = 0;
    this._cut = false;
    this._shake = new Shake(opts.seed ?? 0x51e7);
  }

  /* ------------------------------------------------------------ public -- */

  play(host) {
    return host.play(this);
  }

  stop() {
    this.host?.stop(this);
  }

  /** Name a point so shots can refer to it: `target: 'grenade'`. */
  mark(name, v) {
    const m = this.marks.get(name) ?? new THREE.Vector3();
    m.copy(v);
    this.marks.set(name, m);
    return m;
  }

  /** Kick camera shake now (0..1 trauma, or a shake options object). */
  shake(o) {
    this._shake.kick({ ...this.shakeDefaults, ...(typeof o === 'number' ? { trauma: o } : o) });
  }

  /** Resolve a point spec (see header) into `out`. Returns null if unresolvable. */
  resolve(spec, out, t = this.shotTime) {
    if (spec == null) return null;
    if (typeof spec === 'function') {
      const r = spec(this, t);
      return r ? out.copy(r) : null;
    }
    if (typeof spec === 'string') {
      const m = this.marks.get(spec);
      return m ? out.copy(m) : null;
    }
    if (Array.isArray(spec)) return out.set(spec[0], spec[1], spec[2]);
    if (spec.isVector3) return out.copy(spec);
    if (spec.actor) {
      if (!actorCenter(spec.actor, out)) return null;
      if (spec.offset) out.x += spec.offset[0], out.y += spec.offset[1], out.z += spec.offset[2];
      return out;
    }
    return actorCenter(spec, out);
  }

  /* ---------------------------------------------------------- lifecycle -- */

  /** Called by the host after it has taken the camera. */
  _begin(host, ctx) {
    this.host = host;
    this.ctx = ctx;
    this.playing = true;
    this.finished = false;
    this.time = 0;
    this.index = -1;
    this.data = {};
    this.marks.clear();
    this._shake.trauma = 0;
    this.setup?.(this, ctx);
    this._enter(0);
  }

  /** Called by the host from stop(), before it restores the game. */
  _end(ctx) {
    if (this.shot) this.shot.onExit?.(this);
    this.shot = null;
    this.playing = false;
    this.teardown?.(this, ctx);
  }

  /** True on the frame a hard cut happened (host resets temporal history). */
  consumeCut() {
    const c = this._cut;
    this._cut = false;
    return c;
  }

  _enter(i) {
    if (this.shot) this.shot.onExit?.(this);
    this.index = i;
    this.shot = this.shots[i] ?? null;
    this.shotTime = 0;
    if (!this.shot) {
      this.finished = true;
      return;
    }
    const s = this.shot;
    s._events = (s.events ?? []).map((e) => ({ ...e, done: false }));
    s._actor = typeof s.targetActor === 'function' ? s.targetActor(this) : s.targetActor ?? null;
    s._actors = typeof s.actors === 'function' ? s.actors(this) : s.actors ?? null;

    const blend = s.transition && s.transition.type === 'blend' && i > 0;
    if (blend) {
      this._blendFrom.position.copy(this.cam.position);
      this._blendFrom.target.copy(this.cam.target);
      this._blendFrom.fov = this.cam.fov;
      this._blendFrom.roll = this.cam.roll;
      this._blendDur = Math.max(0.01, s.transition.duration ?? 0.5);
    } else {
      this._blendDur = 0;
    }
    s.onEnter?.(this);
    if (s.candidates?.length) this._pickCandidate(s);
    if (s.cameraShake) this.shake(s.cameraShake);
    // Evaluate at t=0 and snap: a cut starts exactly on its first frame.
    this._goals(0, 0);
    this._collideGoal();
    if (!blend) {
      this.cam.position.copy(this._goalPos);
      this.cam.target.copy(this._goalTgt);
      this._posVel.set(0, 0, 0);
      this._tgtVel.set(0, 0, 0);
      this._cut = true;
    }
    if (this.host?.debug) console.info(`[cinematic] ${this.name} → shot ${i} ${s.name ?? ''}`);
  }

  /**
   * Advance by `dt` real seconds. Returns false once the last shot is done.
   */
  update(dt) {
    if (!this.playing || this.finished) return false;
    let s = this.shot;
    this.time += dt;
    this.shotTime += dt;

    // shot end: fixed duration, or `until` between min and max
    const dur = s.duration ?? s.maxDuration ?? 1;
    const minD = s.minDuration ?? 0;
    const maxD = s.maxDuration ?? dur;
    const early = s.until && this.shotTime >= minD && s.until(this);
    if (early || this.shotTime >= (s.until ? maxD : dur)) {
      const spill = s.until && early ? 0 : this.shotTime - dur;
      this._enter(this.index + 1);
      if (this.finished) return false;
      s = this.shot;
      this.shotTime = Math.max(0, Math.min(spill, 0.05));
    }

    const t = this.shotTime;
    for (const e of s._events) {
      if (!e.done && t >= e.at) {
        e.done = true;
        e.fn(this);
      }
    }
    s.onUpdate?.(this, t, dt);
    this.onUpdate?.(this, dt);

    this._goals(t, dt);
    this._collideGoal();
    const sm = s.smoothing ?? {};
    const mode = s.cameraMode ?? 'static';
    const damped = mode === 'track' || mode === 'frame' || mode === 'orbit';
    if (this._blendDur > 0 && t < this._blendDur) {
      const u = EASE.inOut(clamp01(t / this._blendDur));
      this.cam.position.lerpVectors(this._blendFrom.position, this._goalPos, u);
      this.cam.target.lerpVectors(this._blendFrom.target, this._goalTgt, u);
      this.cam.fov = this._blendFrom.fov + (this.cam.fov - this._blendFrom.fov) * u;
    } else if (damped) {
      smoothDamp(this.cam.position, this._goalPos, this._posVel, sm.position ?? 0.35, dt);
      smoothDamp(this.cam.target, this._goalTgt, this._tgtVel, sm.target ?? 0.18, dt);
    } else {
      this.cam.position.copy(this._goalPos);
      this.cam.target.copy(this._goalTgt);
    }

    this.timeScale = this._timeScale(s, t);
    this._shake.update(dt);
    return true;
  }

  /**
   * Keep the goal out of walls (host-provided raycast), BEFORE smoothing, so
   * a correction eases in like any other camera move. Shots opt out with
   * `collide: false`.
   */
  _collideGoal() {
    if (this.shot?.collide === false || !this.host?.collideGoal) return;
    this.host.collideGoal(this._goalTgt, this._goalPos);
  }

  /** Try each of `shot.candidates` and keep the one that sees most subjects. */
  _pickCandidate(s) {
    const host = this.host;
    if (!host?.lineClear) {
      Object.assign(s, s.candidates[0]);
      return;
    }
    const t0 = performance.now();
    const subjects = [];
    if (s._actor) subjects.push(s._actor);
    if (s._actors) subjects.push(...s._actors);
    for (const spec of s.include ?? []) subjects.push(spec);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < s.candidates.length; i++) {
      const c = s.candidates[i];
      Object.assign(s, c);
      this._goals(0, 0);
      const before = _v2.copy(this._goalPos);
      this._collideGoal();
      let score = 0;
      for (const sub of subjects) {
        const p = typeof sub === 'string' || Array.isArray(sub) || sub.isVector3 ? this.resolve(sub, _v3) : actorCenter(sub, _v3);
        if (p && host.lineClear(this._goalPos, p)) score += 1;
      }
      // a goal the wall check had to move is a compromise
      if (before.distanceToSquared(this._goalPos) > 0.01) score -= 0.5;
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = c;
      }
      if (score >= subjects.length) break; // sees everything, unmoved: take it
    }
    Object.assign(s, best);
    if (host.debug) console.info(`[cinematic] ${s.name}: candidate ${s.candidates.indexOf(best)} (${bestScore}/${subjects.length}) in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  /** Where the shot wants the camera this frame (before damping). */
  _goals(t, dt) {
    const s = this.shot;
    const dur = s.duration ?? s.maxDuration ?? 1;
    const u = easeFn(s.ease)(clamp01(t / dur));
    const mode = s.cameraMode ?? 'static';
    const P = this._goalPos;
    const T = this._goalTgt;
    // lens first: `frame` fits its distance to this shot's FOV
    const f0 = s.fov ?? this.cam.fov;
    const f1 = s.fovEnd ?? f0;
    const fu = s.fovEnd !== undefined ? easeFn(s.fovEase ?? s.ease)(clamp01(t / dur)) : 0;
    this.cam.fov = f0 + (f1 - f0) * fu;
    this.cam.roll = typeof s.roll === 'function' ? s.roll(this, t) : s.roll ?? 0;

    if (mode === 'track') {
      const c = actorCenter(s._actor, _v3) ?? this.resolve(s.target, _v3) ?? T;
      const cx = c.x, cy = c.y, cz = c.z;
      const o0 = s.offset ?? [0, 1.5, -5];
      const o1 = s.offsetEnd ?? o0;
      P.set(
        cx + o0[0] + (o1[0] - o0[0]) * u,
        cy + o0[1] + (o1[1] - o0[1]) * u,
        cz + o0[2] + (o1[2] - o0[2]) * u
      );
      const to = s.targetOffset ?? [0, 0, 0];
      T.set(cx + to[0], cy + to[1], cz + to[2]);
      if (s.minHeight !== undefined) P.y = Math.max(P.y, s.minHeight);
    } else if (mode === 'frame') {
      this._frameGoal(s, u);
    } else if (mode === 'orbit') {
      const c = this.resolve(s.target, T) ?? T;
      const a = (s.angle ?? 0) + (s.angularSpeed ?? 0.3) * t;
      const r = s.radius ?? 6;
      P.set(c.x + Math.sin(a) * r, c.y + (s.height ?? 2), c.z + Math.cos(a) * r);
    } else {
      // static / dolly
      this.resolve(s.position, P) ?? P;
      if (s.positionEnd !== undefined && this.resolve(s.positionEnd, _v2)) P.lerp(_v2, u);
      this.resolve(s.target, T) ?? T;
      if (s.targetEnd !== undefined && this.resolve(s.targetEnd, _v2)) T.lerp(_v2, u);
    }
  }

  /**
   * `frame` mode: look at the midpoint of every actor, from `direction`, far
   * enough that their spread fits in the centre `safeFrame` of the screen.
   * For vertical crops keep safeFrame.x small (0.28 ≈ a 9:16 slice of 16:9).
   */
  _frameGoal(s, u) {
    const list = s._actors ?? [];
    const T = this._goalTgt;
    const P = this._goalPos;
    let n = 0;
    const mn = _v.set(Infinity, Infinity, Infinity);
    const mx = _v2.set(-Infinity, -Infinity, -Infinity);
    for (const a of list) {
      const c = actorCenter(a, _v3);
      if (!c) continue;
      mn.min(c);
      mx.max(c);
      n++;
    }
    if (s.include) {
      for (const spec of s.include) {
        const c = this.resolve(spec, _v3);
        if (!c) continue;
        mn.min(c);
        mx.max(c);
        n++;
      }
    }
    if (!n) return;
    T.addVectors(mn, mx).multiplyScalar(0.5);
    const to = s.targetOffset ?? [0, 0, 0];
    T.x += to[0]; T.y += to[1]; T.z += to[2];
    const d0 = s.direction ?? [0, 0.2, -1];
    const d1 = s.directionEnd ?? d0;
    const dir = _v3.set(d0[0] + (d1[0] - d0[0]) * u, d0[1] + (d1[1] - d0[1]) * u, d0[2] + (d1[2] - d0[2]) * u).normalize();
    // spread across and up the screen, from the camera's side
    const ext = mx.sub(mn);
    const right = _right.set(dir.z, 0, -dir.x).normalize();
    const across = Math.abs(ext.x * right.x) + Math.abs(ext.z * right.z) + (s.padding ?? 1.2) * 2;
    const vert = ext.y + (s.padding ?? 1.2) * 2;
    const sf = s.safeFrame ?? { x: 0.3, y: 0.8 };
    const fov = (this.cam.fov * Math.PI) / 180;
    const aspect = this.host?.aspect ?? 16 / 9;
    const tanV = Math.tan(fov / 2);
    const tanH = tanV * aspect;
    const dist = Math.max(across / 2 / (tanH * sf.x), vert / 2 / (tanV * sf.y));
    const D = Math.min(s.maxDistance ?? 80, Math.max(s.minDistance ?? 4, dist));
    P.copy(T).addScaledVector(dir, D);
    if (s.minHeight !== undefined) P.y = Math.max(P.y, s.minHeight);
  }

  _timeScale(s, t) {
    const ts = s.timeScale;
    if (ts == null) return 1;
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'function') return ts(this, t);
    if (Array.isArray(ts)) return evalKeys(ts, t);
    return 1;
  }

  /** Shake offset/rotation for the host to add on top of `cam`. */
  get shakeOffset() {
    return this._shake.offset;
  }

  get shakeRotation() {
    return this._shake.rot;
  }
}
