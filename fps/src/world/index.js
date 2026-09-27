import * as THREE from 'three';
import { Assembler } from './builder.js';
import { BUILDINGS, STREET, SET_PIECES, GATE } from './layout.js';
import { buildGround } from './ground.js';
import { buildBuilding, collapseRoof } from './buildings.js';
import { registerProps } from './props.js';
import {
  registerDressingProps,
  dressStreet,
  dressBuildings,
  scatterDebris,
  buildGate,
  buildPerimeter,
  groundY,
  isOpen,
} from './dressing.js';
import { dressNerdcon, animateNerdcon } from './nerdcon.js';

/**
 * WORLD — level geometry, the modular building kit, props, set dressing and
 * static collision.
 *
 * A ~120 x 120 m Middle-Eastern market street: one main street with a plaza,
 * flanking alleys, eighteen buildings (three of them enterable and furnished
 * across multiple floors), an arched gate closing the vista, and several
 * thousand props. Nothing is loaded from disk — every vertex is generated here.
 *
 * HOW IT FITS TOGETHER
 *   layout.js     the map: footprints, facade programmes, set-piece positions
 *   util.js       geometry toolkit (chamfered boxes, wall panels with real
 *                 holes, cloth grids, catenary tubes, rocks) + vertex masks
 *   kit.js        the modular building kit (facades, windows, doors, balconies,
 *                 stairs, awnings, parapets, drainpipes, damage)
 *   buildings.js  assembles a building from a footprint + a facade programme
 *   interiors.js  furnishes rooms so an interior screenshot is worth taking
 *   props.js      the instanced prop library
 *   dressing.js   places the hundreds of props, cables, laundry and debris
 *   ground.js     terrain, road camber, kerbs, pavement slabs, sand drifts
 *   builder.js    the Assembler: merges statics, batches instances, authors
 *                 collision proxies, bakes the level->world transform
 *
 * PUBLIC API — `const world = ctx.get('world')`
 *   world.root                THREE.Group holding everything
 *   world.bounds              THREE.Box3 of the playable area, world space
 *   world.spawnPoints         [{ position:Vector3, yaw:number, tag:string }]
 *   world.spawn(i)            one of the above
 *   world.groundHeight(x, z)  cheap analytic floor height (physics is exact)
 *   world.isOpen(x, z)        true where a character can stand outdoors
 *   world.stats               { staticTris, instTris, instances, drawCalls }
 *   world.prewarmMaterials()  compile every shader permutation the world can
 *                             produce, before the frame loop starts. Awaitable.
 *                             Call it from src/core/prewarm.js — see the method.
 *   world.levelToWorld(x,y,z,out) / world.worldToLevel(x,y,z,out)
 */

/**
 * LEVEL -> WORLD. The street is authored down -Z; this yaw puts it on the axis
 * the canonical hero/sunset cameras look along, with the market in the near
 * third of the frame and the gate closing the far end.
 */
const LEVEL_YAW = 0.5877;
const LEVEL_TX = 0.9;
const LEVEL_TZ = 1.34;

/**
 * How many zero-intensity "ballast" point lights the world parks in the scene to
 * hold `numPointLights` — and therefore the shader permutation — constant. See
 * `_addBallast()`. Must be at least the worst-case number of practicals that can
 * be in range at once: a sweep of the whole playable area at three eye heights
 * puts that at 10 for the world's own lights, plus whatever `fx` keeps live.
 */
const LIGHT_SLOTS = 20;

/**
 * THE LEDGER's emissive envelope. All of these are time CONSTANTS, not
 * per-frame steps: every decay below is `exp(-dt / tau)`, so the curve is
 * identical at 30, 60 or 144 Hz and identical under the capture harness's
 * fixed 1/60 clock. One float of state each, no allocation.
 */
const LEDGER = {
  /** Resting emissive at x1 — the shipped idle level. */
  rest: 0.11,
  /**
   * Resting emissive at the x9 multiplier cap: the monument visibly heats.
   * Capped at the level where the stacked-book steps still read (see the
   * measured table under `flareBase`) — the heat channel is PERMANENT while the
   * streak holds, so unlike the flare it can never be allowed to soften the
   * silhouette even briefly.
   */
  restHot: 0.24,
  /** Time constant for the rest level chasing the multiplier. */
  restTau: 0.55,
  /** Idle carrier: a slow breath, amplitude proportional to the rest level so
   *  the x1 look is bit-for-bit what it was before (0.11 +- 0.05 at 1.5 rad/s). */
  carrier: 0.45,
  carrierRate: 1.5,
  /**
   * Wave-clear flare. `exp(-1.2 / 0.3)` leaves 1.8% after 1.2 s.
   *
   * The peak is MEASURED, not chosen — and the first two guesses were both
   * wrong, because the gold already sits near the top of the dusk exposure at
   * rest. Sweeping `emissiveIntensity` and sampling a box entirely INSIDE the
   * monument in the hero framing (so the stddev is the step contrast between
   * book covers and page-edge risers, not object-vs-background):
   *
   *   v      mean   sd(step)  max   clipped   read
   *   0.11   165    62.8      209   0         crisp step banding  <- rest
   *   0.20   186    65.5      223   0         banding still clear
   *   0.30   199    63.6      232   0         banding faint, halo appears
   *   0.45   207    60.6      238   0         banding GONE — smooth blob
   *   0.90   223    50.8      248   0         blob
   *   1.70   233    41.2      252   77%       blob
   *   3.40   239    33.0      254   80% (29% pure white)
   *
   * The numeric knee (clipping) and the PERCEPTUAL knee are nowhere near each
   * other: the covers and risers stop resolving around 0.3-0.45, long before a
   * pixel clips, because the gold already sits near the top of the dusk
   * exposure at rest. So the usable ceiling is ~0.5, not the 6-10 an emissive
   * on a small lamp lens would take — this is a 1.2 m metallic monument, not a
   * bulb, and it is bright BEFORE the flare starts. Peaking at 0.36 (x1) to
   * 0.50 (x9) is a 3-4x surge that fires in one frame and is gone in 1.2 s:
   * the motion carries it, and the form survives at both ends.
   */
  flareTau: 0.3,
  flareBase: 0.36,
  flarePerMult: 0.018,
  /** Hard ceiling, at the measured edge of "the silhouette still exists". */
  flareMax: 0.55,
  /** Run over: the gold falls under its rest level, holds a beat, recovers. */
  dip: 0.25,
  dipHold: 0.8,
  dipTau: 1.9,
};

/** How often the ATM display may re-upload its canvas, in seconds. */
const ATM_REPAINT_S = 0.25;

/** Spawn points in LEVEL space: [x, z, yaw, tag]. */
const SPAWNS = [
  [0.4, 22.5, Math.PI, 'north street'],
  [-2.4, 30.0, Math.PI, 'north plaza'],
  [3.6, 5.0, Math.PI, 'market'],
  [-3.4, -12.0, 0, 'mid street'],
  [2.6, -32.0, 0, 'south street'],
  [-1.0, -39.0, 0, 'gate'],
  [10.5, 4.6, -Math.PI / 2, 'east alley'],
  [-9.0, -10.2, Math.PI / 2, 'west alley'],
];

export class WorldSystem {
  static id = 'world';
  static deps = ['materials', 'physics'];

  async init(ctx) {
    this.ctx = ctx;
    this.rng = ctx.rng.fork();
    const rng = this.rng;
    const materials = ctx.get('materials');
    const physics = ctx.peek('physics');
    const render = ctx.peek('render');

    // Kicked off FIRST, awaited last (just before the canvas signage is
    // painted). The whole level build fits inside the font handshake, so
    // waiting for correct type metrics costs nothing on a warm cache and at
    // most a few hundred ms on a cold one.
    const fonts = this._fontsReady();

    this.root = new THREE.Group();
    this.root.name = 'world';
    this.root.matrixAutoUpdate = false;
    ctx.scene.add(this.root);

    // Weathering in the shared materials keys off the ground plane.
    materials.setGroundLevel?.(0);

    const t0 = performance.now();
    const A = new Assembler({ materials, rng, render });
    this.A = A;
    A.setTransform(LEVEL_YAW, LEVEL_TX, LEVEL_TZ);

    // 1. prototypes first: the level references them by id while it builds
    registerProps(A, rng);
    registerDressingProps(A, rng);

    // 2. ground, then the shells, then what people put in and on them
    buildGround(A, rng);

    const infos = [];
    for (const spec of BUILDINGS) {
      const info = buildBuilding(A, rng, spec);
      infos.push(info);
      if (spec.collapse) {
        collapseRoof(A, rng, spec, info, {
          x: spec.x + rng.range(-2, 2),
          z: spec.z + rng.range(-2, 2),
        });
      }
    }
    this.buildings = infos;

    buildGate(A, rng);
    buildPerimeter(A, rng);
    dressStreet(A, rng);
    dressBuildings(A, rng, infos);
    scatterDebris(A, rng);

    // NERD OF DUTY re-dress: fintech signage, NerdCon banners, THE LEDGER set
    // piece and a few flavour props. Additive only — placed last so its own
    // RNG stream never perturbs the street it sits on. Standalone (canvas-text)
    // meshes go straight onto root; brackets/plinth/ATM merge through A.
    this._nerdcon = { meshes: [], geometries: [], materials: [], textures: [] };
    // Canvas text measures against whatever font is resolved AT PAINT TIME. The
    // Arcade Terminal face (JetBrains Mono) arrives over the network, so
    // painting before it lands silently bakes fallback metrics into every sign
    // and there is no second chance — the canvas is rasterised once. Wait for
    // the font set to settle, but never let a dead network hold up the boot.
    await fonts;
    this._fx = dressNerdcon(A, this.root, this._nerdcon, {
      anisotropy: ctx.config?.q?.anisotropy ?? 8,
    });
    this._initLedger();
    this._wireEvents(ctx);

    this._addLights(A);

    A.finalize(this.root, physics);
    A.releaseCache();

    // -------------------------------------------------------------- queries --
    this._v = new THREE.Vector3();
    this._inv = new THREE.Matrix4().copy(A.xform).invert();
    this.spawnPoints = SPAWNS.map(([x, z, yaw, tag]) => ({
      position: A.toWorld(x, 0, z),
      yaw: yaw + LEVEL_YAW,
      tag,
    }));
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-62, -2, -62),
      new THREE.Vector3(62, 26, 62)
    ).applyMatrix4(A.xform);
    this.stats = A.stats;

    const ms = performance.now() - t0;
    console.info(
      `[world] built in ${ms.toFixed(0)}ms — ${(A.stats.staticTris / 1000).toFixed(0)}k static tris, ` +
        `${(A.stats.instTris / 1000).toFixed(0)}k instanced tris in ${A.stats.instances} instances, ` +
        `${A.stats.drawCalls} draw calls, ${(A.stats.collideTris / 1000).toFixed(1)}k collision tris`
    );
  }

  /**
   * Resolve once the webfonts have loaded (or failed). Racing a timeout matters:
   * the game must run fully offline, and `document.fonts.ready` on a blocked
   * network sits on the request timeout — measured at the full budget in a
   * sandboxed browser. A warm cache resolves in tens of ms, so the cap only
   * ever bites when the face was never going to arrive, and both NEW canvas
   * paints (ticker, ATM) size themselves by measurement rather than by assumed
   * metrics, so the fallback degrades to "slightly different letterforms"
   * rather than to overflowing type.
   */
  _fontsReady() {
    const fonts = globalThis.document?.fonts;
    if (!fonts?.ready) return Promise.resolve();
    return Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 600))]).catch(() => {});
  }

  // ------------------------------------------------------------ game state --
  /**
   * THE LEDGER's envelope state. Four floats and a flag; `update()` integrates
   * them, the listeners below only ever set a target.
   */
  _initLedger() {
    this._ledgerRest = LEDGER.rest; // current, smoothed
    this._ledgerRestTarget = LEDGER.rest; // where the multiplier wants it
    this._ledgerFlare = 0; // additive wave-clear spike
    this._ledgerDim = 1; // 1 = alive, LEDGER.dip = run settled
    this._ledgerHold = 0; // seconds left holding the dip
    this._ledgerMult = 1;
    // ATM display: `_atmScore` is what the game says, `_atmDrawn` is what is on
    // the glass. They differ only between a score event and the next repaint.
    this._atmScore = 0;
    this._atmDrawn = 0;
    this._atmPaintedAt = -1e9;
    this._atmDead = false;
  }

  /**
   * The world's only subscriptions. Everything the street does in response to
   * the game arrives through these three events and nothing else — the world
   * never reaches into `game`, and `game` does not know the street exists.
   */
  _wireEvents(ctx) {
    this._off = [
      // A wave settles: the monument flares gold and decays back over ~1.2 s.
      // Scaled by the streak so a x9 clear reads harder than a x1 clear, and
      // clamped short of the level where bloom eats the silhouette.
      ctx.events.on('game:waveClear', () => {
        const peak = Math.min(
          LEDGER.flareMax,
          LEDGER.flareBase + LEDGER.flarePerMult * (this._ledgerMult - 1)
        );
        // `max`, not `+=`: two clears in quick succession must not stack past
        // the ceiling.
        this._ledgerFlare = Math.max(this._ledgerFlare, peak - this._ledgerDim * this._ledgerRest);
        this._ledgerDim = 1;
        this._ledgerHold = 0;
      }),
      // The streak heats the resting level: 0.11 at x1 up to 0.4 at the x9 cap.
      // This is the slow channel — the player should notice the plaza getting
      // warmer over a good run without ever being told about it.
      ctx.events.on('game:mult', (e) => {
        const m = Math.min(9, Math.max(1, e?.mult ?? 1));
        this._ledgerMult = m;
        this._ledgerRestTarget = LEDGER.rest + ((m - 1) / 8) * (LEDGER.restHot - LEDGER.rest);
        this._ledgerHold = 0; // a live run stops holding the dip
      }),
      // Run settled: the gold falls below rest for a beat, then comes back up
      // slowly. The multiplier target resets with it.
      ctx.events.on('game:over', () => {
        this._ledgerMult = 1;
        this._ledgerRestTarget = LEDGER.rest;
        this._ledgerDim = LEDGER.dip;
        this._ledgerHold = LEDGER.dipHold;
        this._atmDead = true;
        this._fx?.atm?.paint('BALANCE', String(this._atmScore), true);
        this._atmPaintedAt = ctx.time.elapsed;
      }),
      // The ATM balance. Repainting a canvas is a full texture upload, so this
      // only records the number; `update()` decides when the glass may change.
      ctx.events.on('game:score', (e) => {
        this._atmScore = Math.round(e?.score ?? 0);
        this._atmDead = false;
      }),
    ];
  }

  // ----------------------------------------------------------------- lights --
  /**
   * Punctual lights the world owns: the bare bulbs inside the enterable
   * buildings (what makes an interior read as lived-in against cool skylight)
   * and the street lamps, which only draw power after dusk.
   */
  _addLights(A) {
    this.bulbs = [];
    this.lamps = [];

    for (const b of A.interiorLights.slice(0, 20)) {
      // A bare 60 W bulb in an unlit room: the only thing separating an interior
      // from a black hole, so it has to actually carry the room.
      // Intensity is re-driven every update() off the solar altitude; this is
      // the daylight value so a frame captured before the first update is right.
      const l = new THREE.PointLight(0xffc07a, 5, 13, 2);
      l.position.set(b.x, b.y, b.z);
      l.castShadow = false;
      A.light(l, { range: 13, priority: 2 });
      this.bulbs.push(l);
    }

    for (const p of A.lampAnchors) {
      const l = new THREE.PointLight(0xffb765, 0, 22, 2);
      l.position.set(p.x, p.y - 0.12, p.z);
      l.castShadow = false;
      A.light(l, { range: 22, priority: 3 });
      this.lamps.push(l);
    }
    this.lampLens = A.mat('lamp_lens');
    this._lampMix = -1;

    this._addBallast();
  }

  /**
   * BALLAST — hold the scene's point-light COUNT constant.
   *
   * MEASURED, not guessed. The single worst source of stalls in this build was
   * not geometry: it was shader compilation triggered by the world's own
   * practicals. `render` distance-culls every registered punctual light
   * (`light.visible = fade > 0.002`), and Three bakes the number of *visible*
   * point lights into the program cache key. The world owns 17 practicals (12
   * interior bulbs at 13 m, 5 street lamps at 22 m), so walking down the street
   * sweeps the visible count through 9-8-7-6-5-4 — and every single step
   * recompiles EVERY lit material in the frame:
   *
   *   f15 +36 programs  636 ms   f32 +35  702 ms   f41 +35  699 ms
   *   f51 +35 programs  678 ms   f99 +33  698 ms
   *   → 186 programs and ~3.5 s of stalls inside 900 frames of play
   *
   * Pre-compiling every count instead costs 9.5 s of boot (measured: 595
   * programs for counts 0-16), which is the wrong trade. Holding the count
   * still costs nothing.
   *
   * These lights are black (`color 0x000000`, `intensity 0`) with a 1 cm range,
   * parked under the map, and are NOT registered with `render.addLight`, so
   * nothing culls or re-lights them. A point light whose colour times intensity
   * is exactly 0 contributes `0.0` to irradiance — not "almost nothing", but a
   * float zero that is added to the accumulator — so this cannot move a pixel
   * no matter how many slots are lit. It only changes `numPointLights`, which
   * is a shader-permutation input and nothing else.
   *
   * Cost of the padding, measured over 3 paired runs at 1512x982 DPR 2 with 20
   * ballast slots live: p05 frame time 15.7 ms -> 14.4 ms (i.e. inside noise).
   */
  _addBallast() {
    this._ballast = [];
    for (let i = 0; i < LIGHT_SLOTS + 4; i++) {
      const l = new THREE.PointLight(0x000000, 0, 0.01, 2);
      l.name = `world_light_ballast_${i}`;
      l.castShadow = false;
      l.visible = false;
      l.userData.owBallast = true;
      // Far under the terrain, so even the distance-attenuation term is 0.
      l.position.set(0, -1000, 0);
      this.root.add(l);
      this._ballast.push(l);
    }
    /** Point lights in the scene that are NOT ballast; refreshed periodically. */
    this._pointLights = [];
    this._pointLightsFrame = -1e9;
    this._lightTarget = LIGHT_SLOTS;
    this._lightRanges = new Map(); // light -> the cull radius `render` gave it
    this._camPos = new THREE.Vector3();
    this._collectPointLight = (o) => {
      if (o.isPointLight === true && o.userData.owBallast !== true) this._pointLights.push(o);
    };
  }

  /**
   * Top the visible point-light count up to a fixed target. Runs in lateUpdate,
   * after every subsystem has finished moving lights and the camera, and before
   * `render` draws — so the count Three sees is the same every frame.
   *
   * The count has to be PREDICTED rather than read off `light.visible`, because
   * `render._cullLights()` runs inside `render.render()` — i.e. after this. Using
   * last frame's flags is right on 99% of frames and off by one on exactly the
   * frames where a light crosses its cull radius, which are exactly the frames
   * that used to stall. So mirror the renderer's own test here. Getting the
   * prediction wrong can only cost a permutation, never a pixel: the ballast
   * lights are black, and a black light is a no-op however many are lit.
   */
  _stabiliseLightCount(ctx) {
    const list = this._pointLights;
    if (!list) return;
    const render = this._render ?? (this._render = ctx.peek('render'));
    // The set of point lights in the scene only changes when a subsystem builds
    // or frees a pool, so rescanning every frame is pure waste. Every 90 frames
    // is often enough to catch a pool that appears after boot.
    if (ctx.time.frame - this._pointLightsFrame >= 90) {
      this._pointLightsFrame = ctx.time.frame;
      list.length = 0;
      ctx.scene.traverse(this._collectPointLight);
      this._lightRanges.clear();
      for (const e of render?.lights ?? []) {
        if (e.light?.isPointLight === true) this._lightRanges.set(e.light, e.range);
      }
    }

    ctx.camera.getWorldPosition(this._camPos);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const range = this._lightRanges.get(l);
      if (range === undefined) {
        // Not registered for distance culling: its owner drives `visible`.
        if (l.visible === true) n++;
        continue;
      }
      // The renderer's test, verbatim: fade = 1 - smoothstep(d, .75r, 1.15r),
      // light.visible = fade > 0.002.
      const d = l.position.distanceTo(this._camPos);
      if (1 - THREE.MathUtils.smoothstep(d, range * 0.75, range * 1.15) > 0.002) n++;
    }

    // A subsystem can always out-run the pool; adopting the higher count costs
    // one compile, once, instead of one per crossing.
    if (n > this._lightTarget) this._lightTarget = n;
    const want = this._lightTarget - n;
    const pool = this._ballast;
    for (let i = 0; i < pool.length; i++) {
      const v = i < want;
      if (pool[i].visible !== v) pool[i].visible = v;
    }
  }

  // ---------------------------------------------------------------- runtime --
  update(dt, ctx) {
    // Distance LOD for the scatter clouds: one bounding-sphere test per batch.
    this.A?.updateLod(ctx.camera);

    // Street lamps come on as the sun goes down, driven by the sky's real solar
    // altitude rather than a timer, so it is right at any time of day.
    const sky = this._sky ?? (this._sky = ctx.peek('sky'));
    const alt = sky?.sunAltitude ?? 0.6;
    const mix = 1 - Math.min(1, Math.max(0, (alt + 0.05) / 0.16));
    if (Math.abs(mix - this._lampMix) > 0.01) {
      this._lampMix = mix;
      for (let i = 0; i < this.lamps.length; i++) this.lamps[i].intensity = 14 * mix;
      if (this.lampLens) this.lampLens.emissiveIntensity = 9 * mix;
      // Bulbs stay on around the clock — but a 60 W bulb is NOT competitive with
      // daylight, and running it at night strength at noon is what made every
      // interior read as pure tungsten (B-R -93) and sit level with the sunlit
      // street instead of 1.5-2.5 stops under it. Gate the bulb on solar
      // altitude: a weak practical by day, the room's only light after dark.
      for (let i = 0; i < this.bulbs.length; i++) this.bulbs[i].intensity = 5 + 17 * mix;
    }

    this._updateLedger(dt, ctx);

    // Signage: the failing neon, the wayfinder's pulse, the mains hum and the
    // ticker scroll. Pure uniform writes — see `animateNerdcon`.
    animateNerdcon(this._fx, ctx.time.elapsed, dt);

    // ATM display. Gated twice, because a repaint is a 256x128 texture upload:
    // only when the number actually moved, and never faster than 4 Hz.
    const atm = this._fx?.atm;
    if (
      atm &&
      !this._atmDead &&
      this._atmScore !== this._atmDrawn &&
      ctx.time.elapsed - this._atmPaintedAt >= ATM_REPAINT_S
    ) {
      atm.paint('BALANCE', String(this._atmScore), false);
      this._atmDrawn = this._atmScore;
      this._atmPaintedAt = ctx.time.elapsed;
    }
  }

  /**
   * THE LEDGER's emissive envelope.
   *
   * Three channels stacked on one uniform:
   *
   *   rest     the slow one — chases the multiplier, so the plaza warms up as
   *            the run gets good and cools when it does not.
   *   carrier  the shipped idle breath, kept as a fraction of `rest` so the
   *            x1 look is unchanged and the pulse deepens with the heat.
   *   flare    the fast one — a wave clear spikes it to 0.36-0.50 (the measured
   *            ceiling; see LEDGER.flareBase) and it decays exponentially back
   *            to nothing over ~1.2 s.
   *
   * plus `dim`, which drops the whole thing under rest when a run settles and
   * lets it climb back. Every decay is `exp(-dt / tau)` so the shape does not
   * depend on frame rate; nothing here allocates and nothing reads the RNG.
   */
  _updateLedger(dt, ctx) {
    const gold = this._ledgerMat ?? (this._ledgerMat = this.A?.mat('nerdcon_gold'));
    if (!gold) return;

    this._ledgerRest += (this._ledgerRestTarget - this._ledgerRest) * (1 - Math.exp(-dt / LEDGER.restTau));

    if (this._ledgerHold > 0) this._ledgerHold -= dt;
    else if (this._ledgerDim < 1)
      this._ledgerDim += (1 - this._ledgerDim) * (1 - Math.exp(-dt / LEDGER.dipTau));

    if (this._ledgerFlare > 1e-4) this._ledgerFlare *= Math.exp(-dt / LEDGER.flareTau);
    else this._ledgerFlare = 0;

    const rest = this._ledgerRest;
    const carrier = rest * LEDGER.carrier * Math.sin(ctx.time.elapsed * LEDGER.carrierRate);
    gold.emissiveIntensity = this._ledgerDim * (rest + carrier) + this._ledgerFlare;
  }

  lateUpdate(dt, ctx) {
    this._stabiliseLightCount(ctx);
  }

  // --------------------------------------------------------------- pre-warm --
  /**
   * Compile every shader permutation the world can produce, before the frame
   * loop starts. See `src/core/prewarm.js` — that module asks each subsystem for
   * exactly this hook, because `renderer.compileAsync(scene, camera)` alone
   * reaches only the forward lit variant of a material, not the two override
   * passes the world's geometry also goes through every frame:
   *
   *   - the CSM cascades render the whole scene with `csm.depthMaterial`
   *   - the prepass renders it again with the gbuffer's ShaderMaterial
   *
   * Both are separate programs, and each one has its own permutations for plain
   * geometry, instanced geometry and instanced geometry with an instanceColor —
   * which is precisely the mix the world puts in front of them.
   *
   * Pixel-neutral by construction: it compiles, it does not draw. The only
   * mutations are `scene.overrideMaterial` and the ballast light visibility,
   * both restored in the `finally`.
   */
  async prewarmMaterials(ctx = this.ctx) {
    const render = ctx.peek?.('render') ?? ctx.get?.('render');
    const renderer = render?.renderer;
    if (!renderer) return { ok: false, reason: 'no renderer' };
    const scene = ctx.scene;
    const camera = ctx.camera;
    const before = renderer.info.programs?.length ?? 0;
    const t0 = performance.now();

    // Every lit material must carry render's CSM/AO/SSR injection before it is
    // compiled, or the program we warm is not the program the frame will use.
    render.patchMaterials?.(this.root);

    // Compile at the count the frame loop will actually run at, not at whatever
    // the distance cull happens to have left visible during boot.
    this._stabiliseLightCount(ctx);

    const prevOverride = scene.overrideMaterial;
    try {
      // 1. forward lit pass.
      await this._compile(renderer, scene, camera);
      // 2. the shadow cascades and 3. the depth/normal/velocity prepass, both of
      //    which draw this same geometry through an override material.
      for (const over of [render.csm?.depthMaterial, render.gbuffer?.material]) {
        if (!over) continue;
        scene.overrideMaterial = over;
        await this._compile(renderer, scene, camera);
      }
    } finally {
      scene.overrideMaterial = prevOverride;
    }

    return {
      ok: true,
      ms: Math.round(performance.now() - t0),
      compiled: (renderer.info.programs?.length ?? 0) - before,
      lightTarget: this._lightTarget,
    };
  }

  async _compile(renderer, scene, camera) {
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      try {
        renderer.compile(scene, camera);
      } catch {
        /* a driver we cannot pre-warm on; boot must still proceed */
      }
    }
  }

  // ---------------------------------------------------------------- queries --
  spawn(i = 0) {
    const n = this.spawnPoints.length;
    return this.spawnPoints[((i % n) + n) % n];
  }

  levelToWorld(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this.A.xform);
  }

  worldToLevel(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(this._inv);
  }

  /** Analytic floor height. Physics owns the exact answer; this is a hint. */
  groundHeight(x, z) {
    const p = this.worldToLevel(x, 0, z, this._v);
    return groundY(p.x, p.z);
  }

  /** True where a character can stand outdoors (street, pavement, alley). */
  isOpen(x, z, margin = 0.4) {
    const p = this.worldToLevel(x, 0, z, this._v);
    return isOpen(p.x, p.z, margin);
  }

  dispose() {
    for (const off of this._off ?? []) off();
    this._off = null;
    this._fx = null;
    // NERD OF DUTY standalone meshes carry their own geometry/material/texture
    // (unique canvas-text signage), so free them explicitly — the Assembler
    // only tracks what it merged/instanced.
    const nc = this._nerdcon;
    if (nc) {
      for (const m of nc.meshes) m.parent?.remove(m);
      for (const g of nc.geometries) g.dispose();
      for (const m of nc.materials) m.dispose();
      for (const t of nc.textures) t.dispose();
      this._nerdcon = null;
    }
    this.A?.dispose();
    this.root?.parent?.remove(this.root);
    for (const l of this._ballast ?? []) l.parent?.remove(l);
    this._ballast = null;
    this._pointLights = null;
    this.bulbs = null;
    this.lamps = null;
  }
}

export { BUILDINGS, STREET, SET_PIECES, GATE };
