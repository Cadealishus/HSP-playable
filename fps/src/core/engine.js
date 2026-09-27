import * as THREE from 'three';
import { Registry, EventBus } from './registry.js';
import { FIXED_DT, MAX_SUBSTEPS } from './config.js';
import { Input } from './input.js';
import { Rng } from './rng.js';

/**
 * BOOT PROGRESS — the loading bar's model of a 6-second cold start.
 *
 * Measured, not guessed (tools/perf.mjs + a Long Tasks observer on a cold load):
 *
 *   engine.init()      ~2.9 s   ONE uninterruptible long task. Every subsystem's
 *                               init() is `async` but awaits nothing, so the
 *                               `await sys.init?.()` below is a microtask — it
 *                               never yields to the compositor and the screen
 *                               stays exactly as it was for the whole 2.9 s.
 *   prewarm()          ~1.0 s   already rAF-yielding, already reports progress
 *   start + 1st frames ~1.1 s   fx self-warm, light-count stabilisation, the
 *                               first real draws — all AFTER start()
 *   settle             ~0.4 s
 *
 * So the bar needs two things from here: a weight model that matches where the
 * time actually goes, and a real repaint between the heavy phases. The rAF
 * yields below cost ~8 extra frames (~130 ms) of boot and are the entire reason
 * the bar is visible at all.
 *
 * WEIGHTS are shares of `init` measured on the same cold load, normalised over
 * whichever subsystems are actually registered so the band always lands exactly
 * on BOOT_BANDS.init. `ai` alone is 43% and is one synchronous block: the bar
 * WILL sit still there, which is why its caption is the longest and most
 * deliberate string on the screen.
 */
export const BOOT_BANDS = { init: 0.6, prewarm: 0.2, warm: 0.2 };

const BOOT_WEIGHTS = {
  render: 3,
  materials: 1,
  sky: 1,
  physics: 1.5,
  world: 24,
  weapons: 18,
  fx: 13,
  ai: 43,
  player: 0.15,
  ui: 0.15,
  audio: 0.15,
  game: 0.05,
};
const BOOT_WEIGHT_DEFAULT = 0.15;

/**
 * Phase captions. ALL CAPS, dry, deadpan (Flop Ops tone) — the loading screen is the
 * first copy anyone reads, so it carries the same voice as the killfeed.
 */
const BOOT_CAPTIONS = {
  render: 'RAISING THE PIPELINE',
  materials: 'STAMPING TEXTURES',
  sky: 'CLEARING THE SKY',
  physics: 'ENFORCING GRAVITY',
  world: 'BUILDING THE TOWN',
  weapons: 'RACKING WEAPONS',
  fx: 'MIXING PYRO',
  ai: 'BRIEFING THE HOSTILES',
  player: 'LOCATING DOUG',
  ui: 'PROVISIONING THE HUD',
  audio: 'TUNING THE RADIO',
  game: 'FINALISING THE PLAN',
};

/**
 * The Engine owns the frame loop and the shared context handed to every
 * subsystem. It does NOT know what any subsystem does — it only sequences them.
 *
 * Frame order:
 *   1. input.beginFrame()
 *   2. fixedUpdate(FIXED_DT) xN   — physics, deterministic gameplay
 *   3. update(dt)                 — animation, cameras, AI decisions
 *   4. lateUpdate(dt)             — anything that must observe final transforms
 *   5. render subsystem draws
 *   6. input.endFrame()
 */
export class Engine {
  constructor({ canvas, config }) {
    this.canvas = canvas;
    this.config = config;
    this.registry = new Registry();
    this.events = new EventBus();
    this.input = new Input(canvas, config);
    this.rng = new Rng(config.deterministic ? 0x5eed1234 : (Math.random() * 2 ** 32) >>> 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';

    /** Separate scene+camera for the first-person viewmodel, drawn with its own
     *  near plane so hands/weapon never clip into world geometry. */
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(60, 1, 0.005, 12);

    this.time = {
      /** Seconds since start, scaled. */ elapsed: 0,
      /** Unscaled wall-clock seconds since start. */ raw: 0,
      /** Last frame delta, scaled and clamped. */ dt: 0,
      /** Fixed step. */ fixed: FIXED_DT,
      /** Interpolation alpha between the last two physics steps, 0..1. */ alpha: 0,
      scale: 1,
      frame: 0,
    };

    this.ctx = {
      engine: this,
      scene: this.scene,
      camera: this.camera,
      viewScene: this.viewScene,
      viewCamera: this.viewCamera,
      canvas,
      config,
      events: this.events,
      input: this.input,
      time: this.time,
      rng: this.rng,
      get: (id) => this.registry.get(id),
      peek: (id) => this.registry.peek(id),
      has: (id) => this.registry.has(id),
    };

    this._accum = 0;
    this._last = 0;
    this._running = false;
    this._onResize = () => this.resize();
  }

  add(SystemClass, opts) {
    this.registry.add(new SystemClass(opts));
    return this;
  }

  /**
   * Build every subsystem, reporting `boot:progress {phase, pct, detail, ms}`
   * at each boundary. `pct` is monotonic 0..1 across the WHOLE boot — this loop
   * only ever fills BOOT_BANDS.init of it; prewarm and the warm frames are
   * driven from src/main.js over the remaining two bands.
   */
  async init() {
    const order = this.registry.resolve();

    let totalWeight = 0;
    for (const sys of order) totalWeight += BOOT_WEIGHTS[sys.constructor.id] ?? BOOT_WEIGHT_DEFAULT;
    totalWeight = totalWeight || 1;

    // Capture mode gets NO yields: the shot harness is frame-counted, the
    // loading overlay is display:none from the first inline script, and every
    // rAF spent here would be wall-clock the deterministic path must not pay.
    const paint = !this.config?.deterministic;
    const yieldFrame = () => new Promise((r) => requestAnimationFrame(r));

    let pct = 0;
    // A subsystem that blocked for >50 ms owes the compositor a real frame. We
    // repay it at the TOP of the next iteration, after that subsystem's caption
    // has been emitted — so the one repaint shows both the bar's new position
    // and the name of the thing that is about to block.
    let owed = false;

    for (const sys of order) {
      const phase = sys.constructor.id ?? 'system';
      const weight = BOOT_WEIGHTS[phase] ?? BOOT_WEIGHT_DEFAULT;
      const detail = BOOT_CAPTIONS[phase] ?? 'INITIALISING';
      this.events.emit('boot:progress', { phase, pct, detail });
      // Repay a frame when the LAST subsystem blocked, and spend one up front
      // when THIS one is about to: a heavy phase whose predecessor was cheap
      // (world, right after materials + sky) would otherwise block for a second
      // with the previous caption still on screen. Costs ~5 frames of boot and
      // guarantees every heavy phase names itself before it freezes.
      if (paint && (owed || weight >= 3)) await yieldFrame();
      owed = false;

      const t0 = performance.now();
      await sys.init?.(this.ctx);
      const ms = performance.now() - t0;

      pct = Math.min(BOOT_BANDS.init, pct + (weight / totalWeight) * BOOT_BANDS.init);
      this.events.emit('boot:progress', { phase, pct, detail, ms });
      if (ms > 50) {
        console.info(`[engine] ${phase} init ${ms.toFixed(0)}ms`);
        owed = true;
      }
    }
    if (paint) await yieldFrame();

    this.input.attach();
    addEventListener('resize', this._onResize);
    this.resize();
    return this;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
    for (const sys of this.registry.with('resize')) sys.resize(w, h, this.ctx);
    this.events.emit('resize', { width: w, height: h });
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
  }

  _loop(now) {
    if (!this._running) return;
    requestAnimationFrame(this._loop);
    this.step(now);
  }

  /** Advance one frame. Exposed so the capture harness can pump frames by hand. */
  step(now = performance.now()) {
    const t = this.time;
    // Clamp so a tab-switch or a breakpoint doesn't teleport the simulation.
    const rawDt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    t.raw += rawDt;
    t.dt = rawDt * t.scale;
    t.elapsed += t.dt;
    t.frame++;

    this.input.beginFrame();

    this._accum += t.dt;
    let steps = 0;
    const fixedSystems = this.registry.with('fixedUpdate');
    while (this._accum >= FIXED_DT && steps < MAX_SUBSTEPS) {
      for (const sys of fixedSystems) sys.fixedUpdate(FIXED_DT, this.ctx);
      this._accum -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this._accum = 0; // shed backlog rather than spiral
    t.alpha = this._accum / FIXED_DT;

    for (const sys of this.registry.with('update')) sys.update(t.dt, this.ctx);
    for (const sys of this.registry.with('lateUpdate')) sys.lateUpdate(t.dt, this.ctx);

    const renderSystem = this.registry.peek('render');
    if (typeof renderSystem?.render === 'function') renderSystem.render(this.ctx);

    this.input.endFrame();
  }

  dispose() {
    this.stop();
    removeEventListener('resize', this._onResize);
    this.input.detach();
    for (const sys of [...this.registry.ordered].reverse()) sys.dispose?.();
    this.events.clear();
  }
}
