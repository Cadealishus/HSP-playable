import * as THREE from 'three';

/**
 * Named camera setups the screenshot harness can request. Each shot freezes
 * input, poses the camera, and optionally forces gameplay state so critics
 * always review the same framing across iterations.
 *
 * A shot is `{ pos:[x,y,z], look:[x,y,z], fov?, time?, apply?(engine) }`.
 * `time` is hour-of-day 0..24 handed to the sky system.
 */
/** Airport LEVEL (x east, y, z south) -> WORLD, for the HOLDING PATTERN shots. */
function AP(x, y, z) {
  return [-z, y, x];
}

export const SHOTS = {
  // ---- environment / lighting ----
  hero: {
    pos: [12, 1.75, 18],
    look: [-4, 2.2, -6],
    fov: 75,
    // Tracks the DEFAULT gameplay time (see SkySystem.hour): the establishing
    // shot must read the shipping late-afternoon grade. sunset(19.2)/night(1.5)
    // stay the dedicated TOD anchors.
    time: 17.2,
    doc: 'Wide establishing shot down the main street — reads overall art direction (late-afternoon default).',
  },
  interior: {
    pos: [-8.5, 1.7, 3.2],
    look: [2, 1.6, -2],
    fov: 70,
    time: 16.5,
    doc: 'Interior with light shafts through windows — bounce, AO, volumetrics.',
  },
  detail: {
    pos: [3.2, 1.35, 5.0],
    look: [1.4, 1.1, 2.2],
    fov: 45,
    time: 16.5,
    doc: 'Close-up on wall/prop materials — texel density, normal maps, grime.',
  },
  sunset: {
    pos: [16, 3.2, 22],
    look: [-10, 3.0, -14],
    fov: 65,
    time: 19.2,
    doc: 'Low sun — atmospheric scattering, long shadows, god rays, bloom.',
  },
  night: {
    pos: [12, 1.75, 18],
    look: [-4, 2.2, -6],
    fov: 75,
    time: 1.5,
    doc: 'Night — artificial lights, exposure adaptation, shadow quality in the dark.',
  },

  // ---- WORLD + LOOK (flop ops) ----
  'world-square': {
    // Eye level in the square, the ESF supply crate (the objective) at 5 m,
    // the north street, HESCO and the ESF truck behind it. Level (1.0, 6.2)
    // looking at (-1.3, 10.0); see src/world/flopops.js OBJECTIVE.
    pos: [5.17, 1.62, 5.95],
    look: [5.36, 0.85, 10.38],
    fov: 62,
    time: 17.2,
    doc: 'The objective in the square at eye level — crate, stencils, tank traps, north street.',
  },

  // ---- weapon / viewmodel ----
  weapon: {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('idle'),
    doc: 'Hip-fire viewmodel — weapon silhouette, materials, hand rig.',
  },
  ads: {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 58,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('ads'),
    doc: 'Aiming down sights — optic alignment, depth of field, reticle.',
  },
  muzzle: {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 80,
    time: 16.5,
    apply: (e, o) => e.ctx.peek('weapons')?.debugPose?.('fire', o),
    doc: 'Mid-recoil with muzzle flash — flash shape, light spill, shell eject.',
  },

  // ---- WEAPONS area (src/weapons): per-gun viewmodel shots ----
  // `weapon` / `ads` above show the default primary (the carbine). These pin a
  // specific gun so every model can be reviewed in the same framing.
  'weapon-carbine': {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('idle', { weapon: 'carbine' }),
    doc: 'Hip-fire viewmodel, KESTREL 556 carbine + holo sight.',
  },
  'ads-carbine': {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 58,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('ads', { weapon: 'carbine' }),
    doc: 'ADS through the holo window — circle-dot reticle on screen centre.',
  },
  'weapon-rifle': {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('idle', { weapon: 'rifle' }),
    doc: 'Hip-fire viewmodel, HARRIER 556 rifle.',
  },
  'ads-rifle': {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 58,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('ads', { weapon: 'rifle' }),
    doc: 'ADS through the rifle tube sight.',
  },
  'weapon-smg': {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('idle', { weapon: 'smg' }),
    doc: 'Hip-fire viewmodel, MERLIN 9 SMG.',
  },
  'weapon-pistol': {
    pos: [6, 1.7, 10],
    look: [-2, 1.8, -2],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('weapons')?.debugPose?.('idle', { weapon: 'pistol' }),
    doc: 'Hip-fire viewmodel, P19 sidearm.',
  },
  // ---- end WEAPONS area ----

  // ---- combat / fx ----
  combat: {
    pos: [4, 1.7, 12],
    look: [-6, 1.7, -4],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('ai')?.debugStage?.('firefight'),
    doc: 'Enemies mid-firefight — character quality, animation, impact FX.',
  },
  impacts: {
    pos: [2.5, 1.6, 6],
    // Squared up on the plaster wall 5.25 m away. The old aim looked down the
    // open market, so the burst was staged 20+ m out among the stalls and the
    // decals were never legible — the whole point of this shot.
    look: [-1.8, 1.5, 9.0],
    fov: 60,
    time: 16.5,
    apply: (e) => e.ctx.peek('fx')?.debugBurst?.('wall'),
    doc: 'Bullet impacts on a wall — decals, debris, dust puffs, sparks.',
  },
  // ---- ENEMIES + CHAOS area (src/ai, src/physics, src/fx explosions) ----
  'ai-closeup': {
    pos: [4, 1.7, 12],
    look: [-6, 1.55, -4],
    fov: 60,
    time: 16.5,
    apply: (e) => e.ctx.peek('ai')?.debugStage?.('closeup'),
    doc: 'One enemy rifleman at ~4 m — kit, cloth, helmet, balaclava, plate carrier, rifle.',
  },
  'ai-flop': {
    pos: [4, 2.0, 12],
    look: [-6, 1.6, -4],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('ai')?.debugStage?.('flop'),
    doc: 'Frozen frame 0.5 s after a grenade lands in a squad — ragdolls and rubble mid-air (capture with --settle=40).',
  },
  hud: {
    pos: [12, 1.75, 18],
    look: [-4, 2.2, -6],
    fov: 80,
    time: 16.5,
    apply: (e) => e.ctx.peek('ui')?.debugState?.('combat'),
    doc: 'Full HUD in combat — layout, typography, readability, hit feedback.',
  },

  // ---- MAP 02 HOLDING PATTERN + MAP SELECTION area (src/world/maps) ----
  // Capture with `--map=airport` (tools/capture-sw.mjs adds it automatically
  // for `airport-*` shots). Poses are authored in the airport's LEVEL metres
  // (x east, z south) and rotated into the world by AP(): the level sits a
  // quarter turn round (src/world/maps/airport/layout.js LEVEL_YAW), so world
  // = (-z, y, x).
  'airport-checkin': {
    map: 'airport',
    pos: AP(-19.6, 1.65, -11.5),
    look: AP(-3.0, 2.6, 3.5),
    fov: 70,
    time: 17.2,
    doc: 'Check-In: islands, columns, the atrium skylights, departures bank (ref 01).',
  },
  'airport-concourse': {
    map: 'airport',
    pos: AP(2.4, 1.65, 9.6),
    look: AP(16.0, 2.8, -1.0),
    fov: 70,
    time: 17.2,
    doc: 'Central Concourse toward the gate: escalator bank, deck, kiosks, glass (ref 02).',
  },
  'airport-gate': {
    map: 'airport',
    pos: AP(18.6, 1.65, -2.6),
    look: AP(33.0, 3.6, 21.0),
    fov: 70,
    time: 17.2,
    doc: 'Gate 12: desk, seat rows, the airliner and jet bridge through the curtain wall (ref 03).',
  },
  'airport-cabin': {
    map: 'airport',
    pos: AP(15.9, 5.02, 25.0),
    look: AP(49.0, 4.85, 25.0),
    fov: 70,
    time: 17.2,
    doc: 'Down the aisle toward the cockpit: 2 + 2 seating, bins, window light (ref 04).',
  },
  'airport-tarmac': {
    map: 'airport',
    pos: AP(2.5, 1.65, 41.5),
    look: AP(19.0, 3.2, 24.0),
    fov: 70,
    time: 17.2,
    doc: 'South apron: slide, belt loader, cart train, the terminal and bridge behind (ref 05).',
  },
  'ui-title-maps': {
    map: 'airport',
    pos: AP(-4.0, 5.5, 46.0),
    look: AP(24.0, 4.0, 17.0),
    fov: 62,
    time: 17.2,
    apply: (e) => e.ctx.peek('ui')?.debugState?.('title'),
    doc: 'Title screen with the MAP picker (HOLDING PATTERN selected) over the airport.',
  },
  // ---- end HOLDING PATTERN area ----

  // ---- PRESENTATION area (src/ui, src/game): front-end + HUD ----
  'ui-title': {
    pos: [12, 1.75, 18],
    look: [-4, 2.2, -6],
    fov: 70,
    time: 17.4,
    apply: (e) => e.ctx.peek('ui')?.debugState?.('title'),
    doc: 'Title screen — FLOP OPS wordmark, OPERATION TOTAL CONFIDENCE card, ESF loadout select.',
  },
  'ui-hud': {
    pos: [4, 1.7, 12],
    look: [-6, 1.7, -4],
    fov: 80,
    time: 17.4,
    apply: (e) => {
      e.ctx.peek('ai')?.debugStage?.('firefight');
      e.ctx.peek('ui')?.debugState?.('radio');
    },
    doc: 'Mid-wave HUD with a Command radio subtitle up — layout, subtitles, score callouts.',
  },
  'ui-death': {
    pos: [4, 0.42, 12],
    look: [-6, 1.3, -4],
    fov: 74,
    time: 17.4,
    apply: (e) => e.ctx.peek('ui')?.debugState?.('death'),
    doc: 'DOUG IS DOWN — death card, killer line, continue offer, Command on the radio.',
  },
};

export function installShotApi(engine, { capture, lockstep = false } = {}) {
  window.__SHOTS__ = SHOTS;

  /**
   * `opts.grabFrame` is how many frames the harness will pump before it presses
   * the shutter. Shots whose subject is a transient (a muzzle flash lives ~52 ms)
   * need it so they can land the event on the captured frame instead of guessing.
   */
  window.__APPLY_SHOT__ = (name, opts = {}) => {
    const shot = SHOTS[name];
    if (!shot) return { error: `unknown shot "${name}"`, available: Object.keys(SHOTS) };

    // Freeze live input and hand the camera to the shot.
    engine.input.frozen = true;
    engine.input.enabled = false;
    const player = engine.ctx.peek('player');
    player?.setControlEnabled?.(false);

    const cam = engine.camera;
    cam.position.fromArray(shot.pos);
    const target = new THREE.Vector3().fromArray(shot.look);
    cam.lookAt(target);
    if (shot.fov) {
      cam.fov = shot.fov;
      cam.updateProjectionMatrix();
    }
    // Keep the player capsule under the camera so gameplay systems stay coherent.
    player?.teleport?.(cam.position, cam.rotation);

    // Shots are applied back to back in one browser session, so clear the
    // previous shot's *looping* debug state first. Without this the `muzzle`
    // shot's scripted burst is still emptying the magazine during `combat`, and
    // `impacts` keeps walking rounds across a wall behind the HUD shot.
    engine.ctx.peek('weapons')?.debugPose?.('idle');
    engine.ctx.peek('fx')?.debugBurst?.('none');
    engine.ctx.peek('ui')?.debugState?.('clean');

    if (shot.time !== undefined) engine.ctx.peek('sky')?.setTimeOfDay?.(shot.time);
    shot.apply?.(engine, opts);

    engine.events.emit('shot:applied', { name, shot });
    return { applied: name, pos: shot.pos, fov: shot.fov ?? engine.config.fov };
  };

  if (capture) {
    engine.input.frozen = true;
    // Fixed timestep in capture mode so temporal effects converge identically.
    //
    // `this._last = fake` before each step forces rawDt to be EXACTLY 1000/60 on
    // every frame including the first, whatever else touched `_last` (Engine.start
    // and prewarm both assign performance.now() to it). Without that, frame 1's dt
    // was 0 whenever `_last` had been stamped with a real clock and 1/60 when it
    // had not — a boot-path-dependent one-frame difference in every accumulator.
    let fake = 0;
    engine.step = ((orig) =>
      function () {
        this._last = fake;
        fake += 1000 / 60;
        return orig.call(this, fake);
      })(engine.step);
  }

  window.__RENDER_INFO__ = null;
  engine.events.on('resize', () => {});
  const snapInfo = () => {
    const r = engine.ctx.peek('render');
    window.__RENDER_INFO__ = {
      frame: engine.time.frame,
      calls: r?.renderer?.info.render.calls ?? 0,
      tris: r?.renderer?.info.render.triangles ?? 0,
      programs: r?.renderer?.info.programs?.length ?? 0,
      textures: r?.renderer?.info.memory.textures ?? 0,
      geometries: r?.renderer?.info.memory.geometries ?? 0,
      ms: engine.time.dt * 1000,
    };
  };

  /**
   * LOCKSTEP CAPTURE (`?capture=1&lockstep=1`) — the determinism fix.
   *
   * The problem it solves: the engine's own rAF loop keeps stepping while the
   * driver is doing round trips (waitForFunction on __READY__, the evaluate that
   * applies the shot, the screenshot RPC itself). The number of frames that fit
   * inside those round trips is wall-clock dependent, so `engine.time.frame` at
   * the moment the shutter fires drifted 10-20 frames run to run. Everything
   * phase-locked to the absolute frame index — TAA jitter (render/index.js:1067),
   * GTAO / SSR / contact-shadow noise rotation (`frame % 64`), exposure
   * adaptation, and the cadence of every scripted transient — therefore resolved
   * differently on every run. That, not any subsystem clock read, is what made
   * two identical runs differ and what made pre-warm (which burns ~1.4 s of wall
   * clock before the loop starts) look like a visual change.
   *
   * The fix: in lockstep mode the engine NEVER schedules its own frames. Frames
   * only happen inside __PUMP__(n), which advances exactly n of them. The frame
   * index at the shutter is then a constant, and nothing at all advances while
   * the screenshot is being taken.
   */
  if (lockstep) {
    engine.start = function () { this._running = true; };
    window.__LOCKSTEP__ = true;

    /** Advance exactly `n` engine frames, one per rAF so each is presented. */
    window.__PUMP__ = (n = 1) => new Promise((resolve) => {
      let i = 0;
      const tick = () => {
        engine.step();
        snapInfo();
        if (++i >= n) resolve(engine.time.frame);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    /** Yield `n` rAFs WITHOUT stepping, so the compositor picks up the last
     *  rendered frame before the screenshot. Advances no simulation state. */
    window.__PRESENT__ = (n = 2) => new Promise((resolve) => {
      let i = 0;
      const tick = () => (++i >= n ? resolve(engine.time.frame) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
  } else {
    window.__LOCKSTEP__ = false;
    // Free-running: the engine drives itself, __PUMP__ just waits out n frames.
    window.__PUMP__ = (n = 1) => new Promise((resolve) => {
      let i = 0;
      const tick = () => (++i >= n ? resolve(engine.time.frame) : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
    window.__PRESENT__ = window.__PUMP__;
    const info = () => { snapInfo(); requestAnimationFrame(info); };
    requestAnimationFrame(info);
  }

  return { pump: window.__PUMP__, present: window.__PRESENT__, lockstep: !!lockstep };
}
