import { Engine, BOOT_BANDS } from './core/engine.js';
import { createConfig } from './core/config.js';

import { RenderSystem } from './render/index.js';
import { MaterialSystem } from './materials/index.js';
import { SkySystem } from './sky/index.js';
import { WorldSystem } from './world/index.js';
import { PhysicsSystem } from './physics/index.js';
import { PlayerSystem } from './player/index.js';
import { WeaponSystem } from './weapons/index.js';
import { FxSystem } from './fx/index.js';
import { AiSystem } from './ai/index.js';
import { UiSystem } from './ui/index.js';
import { AudioSystem } from './audio/index.js';
import { GameSystem } from './game/index.js';

import { installShotApi } from './dev/shots.js';
import { MAPS, resolveMapId, switchMap } from './world/maps/index.js';
import { prewarm } from './core/prewarm.js';

/** Wall clock at the first line of the module graph — `boot:done.totalMs`. */
const bootT0 = performance.now();

const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';
// Deterministic shutter for the pixel gate: the engine does not schedule its own
// frames, the driver advances exactly N of them through window.__PUMP__. Opt-in,
// because tools that measure real frame pacing (tools/perf.mjs) need the loop to
// free-run. See the long comment in src/dev/shots.js.
const lockstep = capture && params.get('lockstep') === '1';

const config = createConfig({
  quality: params.get('q') ?? 'ultra',
  deterministic: capture,
});

// The active map (see src/world/maps/index.js): `?map=`, else the last choice
// made on the title screen, else the town. The world system builds it; the
// title screen reads the list and the active id off window.__FLOP_MAPS__ (the
// UI never imports the world), and `select(id)` saves and reloads onto a map.
config.map = resolveMapId(params);
window.__FLOP_MAPS__ = {
  active: config.map,
  list: MAPS.map(({ load, ...meta }) => meta),
  select: (id) => (id === config.map ? false : switchMap(id)),
};

const canvas = document.getElementById('game');

const engine = new Engine({ canvas, config });

// Registration order is irrelevant — Registry topo-sorts on static deps.
engine
  .add(RenderSystem)
  .add(MaterialSystem)
  .add(SkySystem)
  .add(WorldSystem)
  .add(PhysicsSystem)
  .add(PlayerSystem)
  .add(WeaponSystem)
  .add(FxSystem)
  .add(AiSystem)
  .add(UiSystem)
  .add(AudioSystem)
  .add(GameSystem);

// ---------------------------------------------------------------- loading --
// The loading screen is plain DOM in index.html, driven by an inline classic
// script that has already painted by the time this module evaluates. All this
// side does is forward the engine's boot events onto it. `window.__BOOT__` is
// always defined (the inline script installs a no-op stub under ?capture=1),
// but it is optional-chained anyway so a stripped index.html cannot break boot.
const boot = window.__BOOT__ ?? null;
engine.events.on('boot:progress', (e) => boot?.set?.(e?.pct ?? 0, e?.detail));
engine.events.on('boot:done', () => boot?.done?.());

try {
  await engine.init();
} catch (err) {
  console.error('[boot] init failed', err);
  boot?.fail?.();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="position:fixed;inset:0;padding:2rem;color:#f66;background:#000;
       font:12px/1.5 ui-monospace,monospace;overflow:auto;z-index:9999;white-space:pre-wrap">
BOOT FAILURE\n\n${err.stack ?? err.message}</pre>`
  );
  throw err;
}

const shotApi = installShotApi(engine, { capture, lockstep });

// Compile every shader permutation before the frame loop starts. Measured: without
// this, 86 programs compile lazily during play, up to 30 on one frame, producing
// 3.1-3.9 SECOND stalls. See src/core/prewarm.js.
//
// ON BY DEFAULT since the capture path was made frame-deterministic; opt out with
// `?prewarm=0`. It is now PROVEN pixel-neutral: `tools/baseline.mjs` with
// `--query=prewarm=0` vs `--query=prewarm=1` reports identical:true on all 11
// shots (0 changed pixels, maxDelta 0). The two things that previously made the
// ~1.4 s pre-warm spend look like a visual change were both boot-duration
// couplings OUTSIDE the subsystems: (1) the shutter frame index was latency-bound
// because the engine kept stepping through the driver's round trips — fixed by
// lockstep in src/dev/shots.js; (2) `will-change: transform` on the compass strip
// cached a composited-layer raster taken at a wall-clock-dependent moment — fixed
// in src/ui/style.js.
const warmup =
  params.get('prewarm') === '0'
    ? { ok: false, reason: 'disabled by ?prewarm=0' }
    : await prewarm(engine, {
        // prewarm's own step tick (4 poses × 2, plus one per subsystem
        // prewarmMaterials hook, plus a final), mapped onto the second band of
        // the bar. It supplies its own captions for the hooks, which is where
        // most of that second actually goes.
        onProgress: (p, detail) =>
          engine.events.emit('boot:progress', {
            phase: 'prewarm',
            pct: BOOT_BANDS.init + Math.min(1, Math.max(0, p)) * BOOT_BANDS.prewarm,
            detail: detail ?? 'COMPILING SHADERS',
          }),
      });
console.info('[boot] prewarm', warmup);
window.__PREWARM__ = warmup;

engine.start();

// Published BEFORE the warm-frame hold below, not after it: the hold now awaits
// a dozen frames, and every external driver (tools/perf.mjs, tools/demo.mjs,
// the dev overlay) reaches for window.__ENGINE__ as soon as the loop is up.
window.__ENGINE__ = engine;

// Capture harness handshake: only flag ready once a frame has actually landed.
//
// BOOT_FRAMES is deliberately a frame COUNT, not a rAF race. In lockstep mode the
// engine has no loop of its own, so we hand-pump exactly this many frames and only
// then raise __READY__; the shot is therefore always applied at engine frame 3, no
// matter how long boot (or pre-warm) took in wall-clock terms.
const BOOT_FRAMES = 3;

/**
 * Frames the loading screen is HELD for after `engine.start()`.
 *
 * Hiding the bar at start() was the wrong shape: measured, ~1.1 s of long tasks
 * land after it — fx self-warms on frame 2, the world stabilises its visible
 * light count, and the first real draws of every pass happen here. Dropping the
 * overlay then hands the player 1.1 s of frozen first frame instead of 1.1 s of
 * a bar that is still moving. So the last 20% of the bar IS those frames.
 *
 * Not applied under ?capture=1: the shot harness raises __READY__ at engine
 * frame 3 exactly, and every existing shot is keyed to that frame index.
 */
const WARM_FRAMES = 12;

const bootDone = () =>
  engine.events.emit('boot:done', { totalMs: Math.round(performance.now() - bootT0) });

if (lockstep) {
  await shotApi.pump(BOOT_FRAMES);
  window.__READY__ = true;
  bootDone();
} else if (capture) {
  let warm = 0;
  const readyProbe = () => {
    if (++warm >= BOOT_FRAMES) {
      window.__READY__ = true;
      bootDone();
      return;
    }
    requestAnimationFrame(readyProbe);
  };
  requestAnimationFrame(readyProbe);
} else {
  for (let i = 1; i <= WARM_FRAMES; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    engine.events.emit('boot:progress', {
      phase: 'warmup',
      pct: BOOT_BANDS.init + BOOT_BANDS.prewarm + (i / WARM_FRAMES) * BOOT_BANDS.warm,
      detail: 'CONFIDENCE AT MAXIMUM',
    });
    // Identical __READY__ semantics to the old rAF probe: three frames after
    // start(), whatever the loading screen is doing.
    if (i === BOOT_FRAMES) window.__READY__ = true;
  }
  bootDone();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose());
}
