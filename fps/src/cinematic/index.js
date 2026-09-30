import * as THREE from 'three';
import { CinematicSequence, actorCenter, actorVelocity, smoothDamp, EASE } from './sequence.js';
import { createGrenadeRagdoll } from './sequences/grenadeRagdoll.js';

/**
 * CINEMATIC — the replay / cutscene camera host.
 *
 * Plays a `CinematicSequence` (see sequence.js): while one runs this system
 * owns the engine camera and the time scale, hides the HUD and viewmodel,
 * makes Doug invulnerable (blasts are measured from the camera), freezes and
 * hides unrelated soldiers, and puts every one of those things back exactly
 * as it found them when the sequence ends or is stopped.
 *
 * PUBLIC API — `const cine = ctx.get('cinematic')`
 *   cine.play(seqOrName)       start a sequence (stops a running one first)
 *   cine.stop()                end it now and restore gameplay
 *   cine.playing               the running sequence, or null
 *   cine.register(name, make)  make(ctx, opts) -> CinematicSequence
 *   cine.library               registered factories by name
 *
 * DEV TRIGGER — `K` replays the grenade ragdoll sequence; `Shift+K` stops.
 *   Development builds only (`import.meta.env.DEV`), or any build with
 *   `?dev=1`. Console: `FLOP.cinematic('grenade')`, `FLOP.stopCinematic()`.
 *
 * FRAME ORDER — everything happens in lateUpdate, after player, ui and fx
 * have written the camera and the clock, so the director simply wins the
 * frame. The time scale written here applies to the NEXT frame's simulation.
 */

const DEV_KEY = 'KeyK';

export class CinematicSystem {
  static id = 'cinematic';
  static deps = ['render', 'physics', 'player', 'weapons', 'fx', 'ai', 'ui', 'game'];

  async init(ctx) {
    this.ctx = ctx;
    this.playing = null;
    this.debug = false;
    this.library = new Map();
    this.aspect = ctx.camera.aspect || 16 / 9;
    this._lastRaw = 0;
    this._saved = null;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();

    let devParam = false;
    try {
      devParam = new URLSearchParams(location.search).get('dev') === '1';
    } catch {
      /* no location (headless) */
    }
    this.devTrigger = !!(import.meta.env?.DEV || devParam) && !ctx.config.deterministic;

    this.register('grenade', createGrenadeRagdoll);
    this._installDebugApi();
  }

  register(name, make) {
    this.library.set(name, make);
    return this;
  }

  /* ---------------------------------------------------------------- play -- */

  play(seqOrName = 'grenade', opts = {}) {
    let seq = seqOrName;
    if (typeof seqOrName === 'string') {
      const make = this.library.get(seqOrName);
      if (!make) throw new Error(`[cinematic] no sequence "${seqOrName}"`);
      seq = make(this.ctx, opts);
    }
    if (!(seq instanceof CinematicSequence)) throw new Error('[cinematic] play() needs a CinematicSequence');
    if (this.playing) this.stop();
    if (this.ctx.peek('ui')?.menu?.open) return null; // never start under the pause menu

    this._takeOver();
    this.playing = seq;
    this._lastRaw = this.ctx.time.raw;
    try {
      seq._begin(this, this.ctx);
    } catch (err) {
      console.error('[cinematic] setup failed', err);
      this.playing = null;
      this._restore();
      return null;
    }
    this._apply(seq, true);
    console.info(`[cinematic] play ${seq.name}`);
    return seq;
  }

  stop(which) {
    const seq = this.playing;
    if (!seq || (which && which !== seq)) return;
    this.playing = null;
    try {
      seq._end(this.ctx);
    } catch (err) {
      console.error('[cinematic] teardown failed', err);
    }
    this._restore();
    console.info(`[cinematic] end ${seq.name} (${seq.time.toFixed(2)}s)`);
  }

  /* --------------------------------------------------------- take / give -- */

  /** Remember everything the sequence is about to change. */
  _takeOver() {
    const ctx = this.ctx;
    const cam = ctx.camera;
    const player = ctx.peek('player');
    const ui = ctx.peek('ui');
    const render = ctx.peek('render');
    const phys = ctx.peek('physics');
    this._saved = {
      scale: ctx.time.scale,
      camPos: cam.position.clone(),
      camQuat: cam.quaternion.clone(),
      fov: cam.fov,
      near: cam.near,
      control: player?.controlEnabled ?? true,
      invulnerable: player?.invulnerable ?? false,
      uiVisibility: ui?.root?.style?.visibility ?? '',
      viewScene: ctx.viewScene.visible,
      realtimeShutter: render?.realtimeShutter ?? false,
      interpolate: phys?.interpolateRagdolls ?? false,
      hidden: [],
    };
    player?.setControlEnabled?.(false);
    if (player) player.invulnerable = true;
    if (ui?.root?.style) ui.root.style.visibility = 'hidden';
    ctx.viewScene.visible = false;
    if (render) render.realtimeShutter = true;
    if (phys) phys.interpolateRagdolls = true;
    cam.near = 0.03;
    cam.updateProjectionMatrix();
  }

  /** Put the game back exactly as it was. Safe to call twice. */
  _restore() {
    const s = this._saved;
    if (!s) return;
    this._saved = null;
    const ctx = this.ctx;
    const cam = ctx.camera;
    const player = ctx.peek('player');
    const ui = ctx.peek('ui');
    const render = ctx.peek('render');
    const phys = ctx.peek('physics');

    for (const h of s.hidden) this._unisolate(h);
    // A transient scale someone else owned when we started (hit-stop, death
    // slow-mo) has long since been cleared by its owner: never restore INTO
    // slow motion. Pause is excluded by play().
    ctx.time.scale = s.scale >= 1 ? s.scale : 1;
    cam.position.copy(s.camPos);
    cam.quaternion.copy(s.camQuat);
    cam.fov = s.fov;
    cam.near = s.near;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    if (player) player.invulnerable = s.invulnerable;
    player?.setControlEnabled?.(s.control);
    if (ui?.root?.style) ui.root.style.visibility = s.uiVisibility;
    ctx.viewScene.visible = s.viewScene;
    if (render) render.realtimeShutter = s.realtimeShutter;
    if (phys) phys.interpolateRagdolls = s.interpolate;
    render?.cut?.();
  }

  /**
   * Freeze and hide a live soldier that is not part of the sequence, so a
   * patrol cannot wander through the shot. Called by sequences from setup().
   */
  isolate(agent) {
    if (!this._saved || !agent?.alive || agent.cinematic) return;
    const rec = { agent, staged: agent.staged, visible: agent.group?.visible ?? true };
    agent.staged = { speed: 0, fire: false, noDamage: true, aimWeight: 0, heading: this._v.set(0, 0, 1).clone() };
    if (agent.group) agent.group.visible = false;
    this._saved.hidden.push(rec);
  }

  _unisolate(rec) {
    const a = rec.agent;
    if (a.alive) a.staged = rec.staged;
    if (a.group) a.group.visible = rec.visible;
  }

  /* --------------------------------------------------------------- frame -- */

  update(dt, ctx) {
    if (!this.devTrigger) return;
    const input = ctx.input;
    if (!input?.pressed?.(DEV_KEY)) return;
    if (input.held('ShiftLeft') || input.held('ShiftRight')) this.stop();
    else this.play('grenade');
  }

  lateUpdate(dt, ctx) {
    const seq = this.playing;
    const rawDt = Math.min(0.1, Math.max(0, ctx.time.raw - this._lastRaw));
    this._lastRaw = ctx.time.raw;
    if (!seq) return;
    // Paused: the menu owns the clock (it saved our scale and restores it on
    // close). Hold the shot where it is.
    if (ctx.peek('ui')?.menu?.open) return;

    const alive = seq.update(rawDt);
    if (!alive) {
      this.stop(seq);
      return;
    }
    this._apply(seq, false);
  }

  /** Write the directed camera (plus shake) and the time scale. */
  _apply(seq, first) {
    const ctx = this.ctx;
    const cam = ctx.camera;
    const c = seq.cam;
    cam.position.copy(c.position).add(seq.shakeOffset);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.target);
    const r = seq.shakeRotation;
    if (c.roll || r.z) cam.rotateZ(c.roll + r.z);
    if (r.x) cam.rotateX(r.x);
    if (r.y) cam.rotateY(r.y);
    if (Math.abs(cam.fov - c.fov) > 1e-3) {
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    this.aspect = cam.aspect || this.aspect;

    if (seq.consumeCut() || first) ctx.peek('render')?.cut?.();
    // Never exactly 0: several systems divide by dt.
    ctx.time.scale = Math.max(0.01, Math.min(4, seq.timeScale));
  }

  /**
   * Camera goal vs the level: if a wall stands between the look target and
   * the camera, try the same spot raised 1.5 m and 3 m (a lens over a wall
   * reads better than one pressed into it), then fall back to pulling in.
   */
  collideGoal(target, pos) {
    const phys = this.ctx.peek('physics');
    if (!phys?.raycast) return;
    const M = phys.MASK?.WORLD;
    const blocked = (px, py, pz) => {
      const dx = px - target.x, dy = py - target.y, dz = pz - target.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.3) return -1;
      const hit = phys.raycast(target.x, target.y, target.z, dx, dy, dz, len + 0.25, M);
      return hit?.hit ? hit.distance : -1;
    };
    const first = blocked(pos.x, pos.y, pos.z);
    if (first < 0) return;
    for (const lift of [1.5, 3]) {
      if (blocked(pos.x, pos.y + lift, pos.z) < 0) {
        pos.y += lift;
        return;
      }
    }
    const d = this._v.subVectors(pos, target);
    const len = d.length();
    pos.copy(target).addScaledVector(d, Math.max(0.6, first - 0.35) / len);
  }

  resize(w, h) {
    this.aspect = w / Math.max(1, h);
  }

  /* --------------------------------------------------------------- debug -- */

  _installDebugApi() {
    try {
      const api = window.FLOP ?? (window.FLOP = {});
      api.cinematic = (name = 'grenade', opts) => {
        const s = this.play(name, opts);
        return s ? s.name : null;
      };
      api.stopCinematic = () => this.stop();
      window.__CINEMATIC__ = this;
    } catch {
      /* no window */
    }
  }

  dispose() {
    this.stop();
    try {
      if (window.FLOP) {
        delete window.FLOP.cinematic;
        delete window.FLOP.stopCinematic;
      }
      delete window.__CINEMATIC__;
    } catch {
      /* ignore */
    }
  }
}

export { CinematicSequence, actorCenter, actorVelocity, smoothDamp, EASE };
