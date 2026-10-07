/**
 * Close-quarters and equipment foley, synthesised (EXPANSION §10.4).
 *
 * Same approach as src/audio: no samples, every voice is noise bursts, swept
 * filters and struck resonators built on the live AudioContext and hung off
 * one top gain. The voices are the ones the audio system has no name for (a
 * knife swing, a semtex beep, a bottle breaking, a fire, a smoke canister's
 * hiss); everything it already does well (surface impacts, explosions, the
 * concussion muffle) is still asked of it through `audio.play` / `concuss`.
 *
 * Reaching the graph: `ctx.peek('audio')` gives `actx` and `mixer.bus(name)`
 * once the user has unlocked audio; before that every call is a silent no-op,
 * never a throw. Spatialisation is deliberately simple (distance gain, a
 * low-pass for distance and a stereo pan off the camera's right axis): these
 * are short close-range sounds, and the loops update their pan every frame.
 *
 * Nodes are created per EVENT (a swing, a beep), never per frame.
 */

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _r = new THREE.Vector3();

export class EquipmentSfx {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    this._noise = null;
    this._crackle = null;
    this._actx = null;
    this.loops = [];
  }

  /** The live graph, or null while audio is locked / missing. */
  _graph() {
    const audio = this.ctx.peek('audio');
    if (!audio?.running || !audio.actx || !audio.mixer || audio.actx.state === 'suspended') return null;
    if (this._actx !== audio.actx) {
      this._actx = audio.actx;
      this._noise = this._crackle = null;
    }
    return audio;
  }

  _noiseBuf(actx) {
    if (this._noise) return this._noise;
    const n = Math.floor(actx.sampleRate * 1.5);
    const b = actx.createBuffer(1, n, actx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = this.rng.signed();
    this._noise = b;
    return b;
  }

  /** Sparse decaying grains: the crackle of burning fuel. */
  _crackleBuf(actx) {
    if (this._crackle) return this._crackle;
    const sr = actx.sampleRate;
    const n = Math.floor(sr * 2);
    const b = actx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    let i = 0;
    while (i < n) {
      i += Math.floor(sr * this.rng.range(0.004, 0.05));
      const amp = this.rng.range(0.2, 1) ** 2;
      const len = Math.floor(sr * this.rng.range(0.001, 0.006));
      const f = this.rng.range(0.15, 0.6);
      for (let k = 0; k < len && i + k < n; k++) {
        d[i + k] += amp * Math.sin(k * f) * Math.exp(-k / (len * 0.3)) * (this.rng.signed() * 0.4 + 0.6);
      }
    }
    // A low bed of roar under the grains.
    let lp = 0;
    for (let k = 0; k < n; k++) {
      lp += (this.rng.signed() - lp) * 0.02;
      d[k] = d[k] * 0.9 + lp * 0.9;
    }
    this._crackle = b;
    return b;
  }

  /**
   * Output chain for one voice at `pos` (null = head-locked): gain for distance,
   * a distance low-pass, a pan. Returns { input, out, t } or null.
   */
  _chain(audio, pos, level, bus = 'foley', maxDist = 60) {
    const actx = audio.actx;
    const t = actx.currentTime + 0.005;
    const out = actx.createGain();
    let g = level;
    let pan = 0;
    let cut = 18000;
    if (pos) {
      const cam = this.ctx.camera;
      _v.copy(pos).sub(cam.position);
      const d = _v.length();
      if (d > maxDist) return null;
      g *= 1 / (1 + (d / 4) ** 1.6);
      cut = 18000 / (1 + d * 0.12);
      if (d > 0.3) {
        _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
        pan = Math.max(-0.85, Math.min(0.85, _v.dot(_r) / d));
      }
    }
    out.gain.value = g;
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut;
    lp.connect(out);
    let tail = out;
    if (actx.createStereoPanner) {
      const p = actx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      tail = p;
    }
    tail.connect(audio.mixer.bus(bus));
    return { input: lp, out, tail, t, actx };
  }

  _noiseSrc(c, dur, delay = 0) {
    const src = c.actx.createBufferSource();
    src.buffer = this._noiseBuf(c.actx);
    src.loop = true;
    src.start(c.t + delay, this.rng.range(0, 1.2));
    src.stop(c.t + delay + dur);
    return src;
  }

  _env(param, t, peak, attack, decay) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, attack));
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _filter(c, type, f, q = 0.7) {
    const b = c.actx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  /** A struck metal partial: sine with an exponential decay. */
  _ping(c, f, amp, decay, delay = 0) {
    const o = c.actx.createOscillator();
    o.frequency.value = f;
    const g = c.actx.createGain();
    this._env(g.gain, c.t + delay, amp, 0.0015, decay);
    o.connect(g).connect(c.input);
    o.start(c.t + delay);
    o.stop(c.t + delay + decay + 0.05);
  }

  _burst(c, type, f, q, amp, attack, decay, delay = 0, sweepTo = 0) {
    const src = this._noiseSrc(c, attack + decay + 0.05, delay);
    const bf = this._filter(c, type, f, q);
    if (sweepTo) {
      bf.frequency.setValueAtTime(f, c.t + delay);
      bf.frequency.exponentialRampToValueAtTime(sweepTo, c.t + delay + attack + decay);
    }
    const g = c.actx.createGain();
    this._env(g.gain, c.t + delay, amp, attack, decay);
    src.connect(bf).connect(g).connect(c.input);
  }

  /* ==================================================================== */
  /*  voices                                                              */
  /* ==================================================================== */

  /** Knife through air: a fast band-passed sweep, head-locked. */
  swing(level = 1, lunge = false) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, null, 0.55 * level);
    if (!c) return;
    this._burst(c, 'bandpass', lunge ? 500 : 700, 1.4, 0.9, 0.05, lunge ? 0.2 : 0.14, 0, lunge ? 2200 : 3200);
    this._burst(c, 'highpass', 3500, 0.7, 0.18, 0.03, 0.08, 0.02);
  }

  /** Knife into a body: a wet low thump and a short cloth tear. */
  stab(pos, level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.9 * level);
    if (!c) return;
    this._burst(c, 'lowpass', 420, 0.9, 1, 0.004, 0.11);
    this._burst(c, 'bandpass', 1400, 2, 0.35, 0.002, 0.06, 0.01);
    this._ping(c, 92, 0.5, 0.12);
  }

  /** Steel on a hard surface: a bright ring over a click. */
  clang(pos, surface = 'concrete', level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.6 * level);
    if (!c) return;
    const metal = surface === 'metal';
    const base = metal ? 1900 : 2600;
    this._ping(c, base * this.rng.range(0.97, 1.03), 0.35, metal ? 0.6 : 0.28);
    this._ping(c, base * 1.71, 0.22, metal ? 0.45 : 0.2);
    this._ping(c, base * 2.83, 0.12, 0.16);
    this._burst(c, 'highpass', 2500, 0.8, 0.6, 0.001, 0.025);
  }

  /** A thrown blade biting into something: click plus a body depending on what. */
  thunk(pos, surface = 'wood', level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.8 * level);
    if (!c) return;
    if (surface === 'flesh') return this.stab(pos, level);
    const f = surface === 'wood' ? 380 : surface === 'metal' ? 1500 : 900;
    this._burst(c, 'bandpass', f, 1.6, 1, 0.001, 0.07);
    this._ping(c, f * 3.1, 0.25, surface === 'metal' ? 0.4 : 0.12);
    this._ping(c, 150, 0.35, 0.08);
  }

  /** Throw whoosh for the lighter throwables. */
  toss(level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, null, 0.35 * level);
    if (!c) return;
    this._burst(c, 'bandpass', 600, 1.1, 0.8, 0.04, 0.16, 0, 1500);
  }

  /** Semtex timer: a hard-edged 3.1 kHz beep. */
  beep(pos, level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.32 * level, 'weapons');
    if (!c) return;
    const o = c.actx.createOscillator();
    o.type = 'square';
    o.frequency.value = 3100;
    const g = c.actx.createGain();
    g.gain.setValueAtTime(0.0001, c.t);
    g.gain.linearRampToValueAtTime(0.5, c.t + 0.003);
    g.gain.setValueAtTime(0.5, c.t + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, c.t + 0.058);
    const bp = this._filter(c, 'bandpass', 3100, 3);
    o.connect(bp).connect(g).connect(c.input);
    o.start(c.t);
    o.stop(c.t + 0.07);
  }

  /** Putty on a surface: a soft slap. */
  splat(pos, level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.7 * level);
    if (!c) return;
    this._burst(c, 'lowpass', 900, 0.8, 1, 0.002, 0.06);
    this._ping(c, 210, 0.3, 0.05);
  }

  /** A bottle breaking: a spray of glass partials over a noise burst. */
  shatter(pos, level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.9 * level);
    if (!c) return;
    this._burst(c, 'highpass', 1800, 0.7, 1, 0.001, 0.12);
    this._burst(c, 'bandpass', 5200, 1.2, 0.5, 0.001, 0.2, 0.01);
    for (let i = 0; i < 9; i++) {
      this._ping(c, this.rng.range(2800, 7600), this.rng.range(0.05, 0.18), this.rng.range(0.04, 0.22), this.rng.range(0, 0.16));
    }
  }

  /** Fuel catching: a soft, swelling whoomp. */
  whoomp(pos, level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 1.1 * level, 'weapons');
    if (!c) return;
    this._burst(c, 'lowpass', 220, 0.8, 1, 0.06, 0.7, 0, 1400);
    this._ping(c, 55, 0.6, 0.5);
  }

  /** Smoke canister igniting: a pop, then the hiss loop does the rest. */
  pop(pos, level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, pos, 0.8 * level);
    if (!c) return;
    this._burst(c, 'lowpass', 600, 0.8, 1, 0.002, 0.09);
    this._burst(c, 'highpass', 3000, 0.7, 0.4, 0.005, 0.3, 0.03);
  }

  /** Picking a knife back up: two small metal ticks. */
  pickup(level = 1) {
    const a = this._graph();
    if (!a) return;
    const c = this._chain(a, null, 0.35 * level);
    if (!c) return;
    this._ping(c, 3400, 0.25, 0.08);
    this._ping(c, 4600, 0.18, 0.07, 0.07);
    this._burst(c, 'bandpass', 2000, 1, 0.3, 0.002, 0.05, 0.05);
  }

  /**
   * A sustained, positioned loop ('fire' | 'hiss') for `dur` seconds with a
   * fade in and out. Returns a handle for `moveLoop` / `stopLoop`, or null.
   */
  loop(kind, pos, dur, level = 1) {
    const a = this._graph();
    if (!a) return null;
    const c = this._chain(a, pos, 1, kind === 'fire' ? 'weapons' : 'foley', 90);
    if (!c) return null;
    const actx = c.actx;
    const src = actx.createBufferSource();
    src.buffer = kind === 'fire' ? this._crackleBuf(actx) : this._noiseBuf(actx);
    src.loop = true;
    const f = kind === 'fire' ? this._filter(c, 'bandpass', 900, 0.45) : this._filter(c, 'highpass', 2400, 0.6);
    const g = actx.createGain();
    const peak = (kind === 'fire' ? 0.85 : 0.22) * level;
    const fadeIn = kind === 'fire' ? 0.25 : 0.6;
    const fadeOut = kind === 'fire' ? 1.0 : 2.5;
    g.gain.setValueAtTime(0.0001, c.t);
    g.gain.linearRampToValueAtTime(peak, c.t + fadeIn);
    g.gain.setValueAtTime(peak, c.t + Math.max(fadeIn, dur - fadeOut));
    g.gain.linearRampToValueAtTime(0.0001, c.t + dur);
    src.connect(f).connect(g).connect(c.input);
    src.start(c.t, this.rng.range(0, 1));
    src.stop(c.t + dur + 0.1);
    const h = { src, chain: c, pos: new THREE.Vector3().copy(pos), end: c.t + dur + 0.2 };
    src.onended = () => {
      try {
        c.tail.disconnect();
      } catch {
        /* already gone */
      }
      const i = this.loops.indexOf(h);
      if (i >= 0) this.loops.splice(i, 1);
    };
    this.loops.push(h);
    return h;
  }

  /** Re-pan / re-attenuate the live loops for the listener. Once per frame. */
  update() {
    if (!this.loops.length) return;
    const cam = this.ctx.camera;
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    for (const h of this.loops) {
      const c = h.chain;
      _v.copy(h.pos).sub(cam.position);
      const d = _v.length();
      const g = 1 / (1 + (d / 5) ** 1.5);
      c.out.gain.setTargetAtTime(g, c.actx.currentTime, 0.08);
      if (c.tail !== c.out && c.tail.pan) {
        const pan = d > 0.3 ? Math.max(-0.85, Math.min(0.85, _v.dot(_r) / d)) : 0;
        c.tail.pan.setTargetAtTime(pan, c.actx.currentTime, 0.08);
      }
    }
  }

  stopAll() {
    for (const h of this.loops.slice()) {
      try {
        h.src.stop();
      } catch {
        /* not started */
      }
    }
    this.loops.length = 0;
  }
}
