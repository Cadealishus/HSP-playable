// Game context shared by every system. Owns the frame loop, scene, cameras, physics,
// input and event bus. Systems are plain objects: { name, init, postInit, update, lateUpdate }.
// See docs/CONTRACTS.md for the full contract between systems.
import * as THREE from 'three';
import { Events } from './Events.js';
import { Input } from './Input.js';
import { Physics } from './Physics.js';
import { mulberry32 } from './rng.js';

export class Game {
  constructor(canvas, params = new URLSearchParams(location.search)) {
    this.canvas = canvas;
    this.params = params;
    this.harness = params.has('harness');
    this.debug = params.has('debug');

    // Seeded RNG. In harness mode Math.random is replaced too so screenshots are reproducible.
    this.seed = Number(params.get('seed') || 1337);
    this.random = mulberry32(this.seed);
    if (this.harness) Math.random = mulberry32(this.seed ^ 0x9e3779b9);

    this.settings = {
      fov: Number(params.get('fov') || 80), // CoD-style FOV: horizontal degrees at 4:3, Hor+ for wider screens
      sensitivity: 1.0,
      adsSensitivity: 0.85,
      quality: params.get('quality') || 'high', // 'low' | 'medium' | 'high' | 'ultra'
      masterVolume: 0.8,
    };

    this.events = new Events();
    this.input = new Input(canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.verticalFov(this.settings.fov), innerWidth / innerHeight, 0.05, 3000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // First-person viewmodel lives in its own scene/camera so it never clips into walls and
    // can use its own FOV. Put weapon/arms under `viewmodel.root` in camera-local space
    // (x right, y up, -z forward, metres). The render system composites it over the world.
    const vmScene = new THREE.Scene();
    const vmCamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
    vmCamera.layers.enable(2);
    const vmRoot = new THREE.Group();
    vmRoot.name = 'viewmodel-root';
    vmScene.add(vmRoot);
    // sharpLayer: viewmodel meshes on this layer (optic reticles) are drawn after the ADS weapon blur.
    this.viewmodel = { scene: vmScene, camera: vmCamera, root: vmRoot, fov: 55, sharpLayer: 2 };

    // When set to a function (camera, dt, game) the player system stops driving the camera and
    // calls this instead (main-menu flyover, cinematics). Set back to null to hand control back.
    this.cameraOverride = null;

    // Wave-survival run state. The UI starts/ends runs (events run:start / run:end) and tallies
    // score; the AI director owns waves. Core advances `time` while a run is active.
    this.run = { active: false, time: 0, kills: 0, headshots: 0, score: 0, streak: 0, bestStreak: 0, wave: 0, difficulty: 'regular' };

    this.loader = new THREE.LoadingManager();
    this.systems = [];
    this.time = { now: 0, dt: 0, frame: 0, scale: 1 };
    this.paused = false;
    this.physics = null;
    this.shots = new Map(); // name -> { description, setup(game), settle }
    this.width = innerWidth;
    this.height = innerHeight;

    addEventListener('resize', () => this.resize());
  }

  // CoD-style FOV (horizontal at 4:3) -> three.js vertical FOV in degrees.
  verticalFov(fov4x3) {
    return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov4x3) / 2) * 0.75));
  }

  add(system) {
    this.systems.push(system);
    if (system.name) this[system.name] = system; // game.render, game.world, game.player ...
    return system;
  }

  async init() {
    this.physics = await Physics.create();
    for (const s of this.systems) {
      const t0 = performance.now();
      if (s.init) await s.init(this);
      if (this.debug) console.log(`[init] ${s.name} ${(performance.now() - t0).toFixed(0)}ms`);
    }
    for (const s of this.systems) if (s.postInit) await s.postInit(this);
    this.resize();
    this.events.emit('game:ready', {});
  }

  resize() {
    this.width = this.canvas.clientWidth || innerWidth;
    this.height = this.canvas.clientHeight || innerHeight;
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewmodel.camera.aspect = aspect;
    this.viewmodel.camera.updateProjectionMatrix();
    for (const s of this.systems) s.resize?.(this.width, this.height, this);
  }

  // One frame. dt in seconds (real time, clamped).
  tick(dt, { render = true } = {}) {
    dt = Math.min(dt, 1 / 15) * this.time.scale;
    this.time.dt = dt;
    this.time.now += dt;
    this.time.frame++;
    this.input.poll();
    const paused = this.paused;
    for (const s of this.systems) if (s.update && (!paused || s.alwaysUpdate)) s.update(dt, this);
    if (!paused) this.physics.step(dt);
    if (!paused && this.run.active) this.run.time += dt;
    for (const s of this.systems) if (s.lateUpdate && (!paused || s.alwaysUpdate)) s.lateUpdate(dt, this);
    if (render && this.render?.renderFrame) this.render.renderFrame(dt, this);
    this.input.endFrame();
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // --- Screenshot harness -------------------------------------------------------------
  // Systems register named shots in init(): game.registerShot('weapon-ads', { description, setup, settle })
  // setup(game) may be async; it should put the game in a fully specified state (player pose,
  // weapon state, time of day, spawned enemies...). `settle` = seconds of simulation to run after setup.
  registerShot(name, def) {
    this.shots.set(name, { settle: 0.5, ...def });
  }

  // Advance the simulation `seconds` at a fixed 60 fps. Renders only the last `renderFrames` frames.
  advance(seconds, renderFrames = 1) {
    const n = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < n; i++) this.tick(1 / 60, { render: i >= n - renderFrames });
  }
}
