/**
 * GAME — HOLD THE LEDGER, the wave-holdout loop that turns the sandbox into a
 * game. Subsystem id `game`. Owns only this directory + a one-line registration
 * in src/main.js. Talks to every other subsystem strictly through ctx.get / peek
 * and ctx.events (never an import), so it composes with the UI / AI / WEAPONS /
 * PLAYER agents building in parallel.
 *
 * STATE MACHINE            attract → play → down → over   (see _setState)
 *   attract  before the first ui:startRun. No waves spawn; the loop is inert so
 *            the title screen and the capture harness are undisturbed.
 *   play     a wave is being fought.
 *   down     the player died and a continue is on offer (once per run).
 *   over     run settled; game:over carries the scorecard.
 *
 * EVENTS EMITTED (canonical, NERDCON_CONTRACT.md "Event interface"):
 *   game:state {state} · game:wave {wave,count} · game:waveClear {wave,bonus}
 *   game:score {score,delta,mult} · game:mult {mult} · game:continueOffer {}
 *   game:over {score,wave,kills,accuracy,best,bestWave,newBest}
 * EVENTS CONSUMED:
 *   ui:startRun {job} · ui:continue · ui:restart · ui:accept (additive)
 *   player:death · actor:death · bullet:impact · damage:dealt
 *
 * INTEGRATION NOTES for the parallel agents
 *   - Kills / wave progress are counted from `actor:death` (fires for every enemy
 *     death, all causes). Headshots are read from the `bullet:impact` that lands
 *     immediately before the fatal `damage:dealt` (actor:death carries a
 *     hard-coded headshot:false, so it can't tell us). Accuracy = enemy hits
 *     (damage:dealt to an enemy) / rounds fired (weapons.stats.fired).
 *   - Spawning calls `ai.spawnWave({count,intensity,waveIndex})` and trusts its
 *     return count. If that method does not exist yet it falls back to
 *     `ai.populate({squads,perSquad})`. Clearing enemies prefers
 *     `ai.despawnAll/clearAgents/killAll`, else emits lethal damage:dealt.
 *   - Job loadouts set the weapon via `weapons.setWeaponImmediate(id)` and, for
 *     the compliance officer's "max armour", raise the live `player.health.max`
 *     (there is no armour subsystem to hook).
 *
 * LEADERBOARD (added with the launch roadmap)
 *   `game.leaderboard` is the Supabase client (see leaderboard.js). The UI
 *   reaches it through `ctx.peek('game').leaderboard` — never an import, per
 *   ARCHITECTURE.md. A run token is requested at ui:startRun and NOT awaited;
 *   the loop is identical whether or not the network answers. `game:over` now
 *   also carries `job`, `durationS` and `continued`, which is everything
 *   submit-score needs to validate the run.
 *
 * ADDED EVENTS (beyond the contract's canonical set)
 *   `ui:attract` — UI → game. Abandon whatever is on screen and return to the
 *   attract state. Cabinet mode's 60-second idle reset is the only caller.
 */

import { Scoring } from './scoring.js';
import { CONCURRENT_CAP, BREATHER_S, waveGoal, waveIntensity, waveBonus } from './waves.js';
import { Leaderboard } from './leaderboard.js';

/** job id (normalised) → { weapon id, armour multiplier on base max health }. */
const LOADOUTS = {
  'fraud-analyst': { weapon: 'rifle', armour: 1 },
  'payments-engineer': { weapon: 'smg', armour: 1 },
  'compliance-officer': { weapon: 'pistol', armour: 2 },
};
const DEFAULT_JOB = 'fraud-analyst';

const BEST_KEY = 'nod.best';
const BEST_WAVE_KEY = 'nod.bestWave';

/** Scoring's internal channel names → the contract's event names. */
const SCORING_EVENTS = {
  score: 'game:score',
  mult: 'game:mult',
  // ADDITIVE (beyond the contract's canonical set): a double kill inside the
  // 1.2 s window. Consumed by src/ui, which renders the contract's
  // `BATCH PROCESSED` copy into the KILLFEED — deliberately not the banner,
  // which is a singleton with no queue and is already contended by the wave
  // banner and the per-kill score banner.
  multiKill: 'game:multiKill',
};

/* ==================================================================== */
/* THE SETTLE BEAT                                                      */
/* ==================================================================== */

/**
 * THE LEDGER, in level coordinates. Authored at `buildLedger(A, rng, -1.7, 8.6)`
 * in src/world/nerdcon.js — the plaza centrepiece, just west of the street
 * centreline. Converted to world space through the world's own public
 * `levelToWorld()` so the level transform stays owned by src/world; only these
 * two authored numbers are mirrored here, and they are scenery constants.
 */
const LEDGER_LEVEL_X = -1.7;
const LEDGER_LEVEL_Z = 8.6;

/** Loot Gold #FFD700 in rough linear space, plus the hotter core it decays from. */
const GOLD = { r: 1.0, g: 0.68, b: 0.05 };

/**
 * A spawn descriptor for `fx.emitLit`.
 *
 * fx's own call sites use the shared `resetSpawn()` singleton out of
 * src/fx/particles.js, but importing another subsystem's module is exactly what
 * ARCHITECTURE.md rule 2 forbids — so this is our own copy of the same field
 * set, built ONCE and refilled in place. `ParticleLayer.emit()` only ever reads
 * named properties off it, so a structurally identical object is a drop-in.
 * Keep in sync with SP in src/fx/particles.js if that gains a field.
 */
function makeSpawn() {
  return {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    size0: 0.2, size1: 0.3, sizeCurve: 1,
    life: 1, delay: 0, drag: 1.4, gravity: 0,
    rot: 0, spin: 0, stretch: 0,
    r0: 1, g0: 1, b0: 1, i0: 1,
    r1: 1, g1: 1, b1: 1, i1: 0,
    tile: 0, soft: 0.4, alpha: 1, alphaCurve: 1,
    turb: 0, turbFreq: 1, seed: 0, flags: 0,
  };
}

/**
 * Particle atlas tiles, from src/fx/atlas.js. Mirrored as literals for the same
 * no-cross-import reason as makeSpawn(). CHIP + SPLINTER are the flat angular
 * flakes the impact code throws off masonry; tinted gold and given a slow fall
 * they read as paper — the ledger shedding pages.
 */
const TILE_CHIP = 8;
const TILE_SPLINTER = 9;

export class GameSystem {
  static id = 'game';
  // init after the systems we drive so their event handlers are wired first.
  static deps = ['ai', 'player', 'weapons'];

  async init(ctx) {
    this.ctx = ctx;
    this.state = 'attract';
    this.wave = 0;
    this.job = null;
    this._lastJob = DEFAULT_JOB;

    this._continueUsed = false;
    this._waveActive = false;
    this._waveGoal = 0;
    this._waveSpawned = 0;
    this._aliveInWave = 0;
    this._breather = 0;

    this._ignoreDeaths = false;   // set while we clear enemies ourselves
    this._synthDamage = false;    // set while we emit our own lethal damage
    this._god = false;
    this._announced = false;

    // per-run accuracy bookkeeping
    this._shotsAtRunStart = 0;
    this._hits = 0;

    // headshot stash: agent -> was the last non-exit impact a head hit?
    this._pendingHead = new Map();

    // slow-mo death beat (raw-time deadline; never runs in capture)
    this._deathBeatUntil = 0;

    // run clock (wall time, for the plausibility check server-side)
    this._runStartedMs = 0;
    this._runDuration = 0;

    // Leaderboard client. Disabled under ?capture=1 so the screenshot harness
    // is never network-bound. `?cabinet=1` only tags the telemetry.
    const params = this._params();
    this.leaderboard = new Leaderboard({
      enabled: !ctx.config?.deterministic,
      cabinet: params.get('cabinet') === '1',
    });
    /** Last settled run, for the initials/share UI. Null until the first game over. */
    this.lastRun = null;

    this.scoring = new Scoring((type, data) => ctx.events.emit(SCORING_EVENTS[type] ?? 'game:score', data));

    // Settle beat (see _startSettleBeat / _updateSettleBeat). Preallocated: the
    // whole sequence runs from update() and must not allocate per frame.
    this._settleT = -1;
    this._settleStep = 0;
    this._ledgerPos = null; // resolved once, on the first wave clear
    /** Reusable particle descriptor — fx.emitLit reads named fields off it. */
    this._spawn = makeSpawn();

    // Base player max health, captured before any armour override.
    const p = ctx.peek('player');
    this._baseMaxHealth = p?.health?.max ?? p?.maxHealth ?? 100;

    this._loadBest();
    this._wireEvents(ctx);
    this._installDebugApi();

    this._setState('attract');
    // Anything stranded by a dead network last session goes up now, before the
    // player has done anything that could compete for bandwidth.
    this.leaderboard.drain();
    console.info('[game] HOLD THE LEDGER ready — state=attract');
  }

  /** URLSearchParams, or an empty stand-in in a non-browser build step. */
  _params() {
    try {
      return new URLSearchParams(location.search);
    } catch {
      return new URLSearchParams('');
    }
  }

  /* ================================================================== */
  /* events                                                             */
  /* ================================================================== */

  _wireEvents(ctx) {
    this._off = [];
    const on = (t, fn) => this._off.push(ctx.events.on(t, fn));

    on('ui:startRun', (e) => this.startRun(e?.job));
    on('ui:continue', () => this.continueRun());
    on('ui:restart', () => this.restart());
    on('ui:accept', () => this.accept()); // additive: "ACCEPT THE LOSS" → over
    on('ui:attract', () => this.attract()); // additive: cabinet idle reset

    on('player:death', () => this._onPlayerDeath());
    on('actor:death', (e) => this._onActorDeath(e));
    on('bullet:impact', (e) => this._onBulletImpact(e));
    on('damage:dealt', (e) => this._onDamageDealt(e));
  }

  _onBulletImpact(e) {
    // Stash the region of the last real hit on an enemy so the fatal shot's
    // headshot flag survives to actor:death (which is emitted from inside the
    // AI's damage:dealt handler, before ours runs).
    if (!e || !e.actor || e.exit) return;
    this._pendingHead.set(e.actor, e.part === 'head');
  }

  _onDamageDealt(e) {
    if (this._synthDamage || !e || this.state !== 'play') return;
    if (this._isPlayerTarget(e.target)) return;
    if (!e.target) return;
    this._hits += 1; // a round connected with an enemy — for accuracy
  }

  _onActorDeath(e) {
    const actor = e?.actor;
    if (this._ignoreDeaths) {
      if (actor) this._pendingHead.delete(actor);
      return;
    }
    // Only count deaths that belong to a live wave we are fighting. Stray
    // garrison kills (attract) and deaths during the death screen are ignored.
    if (this.state !== 'play' || !this._waveActive) {
      if (actor) this._pendingHead.delete(actor);
      return;
    }
    const headshot = actor ? this._pendingHead.get(actor) === true : false;
    if (actor) this._pendingHead.delete(actor);

    this._aliveInWave = Math.max(0, this._aliveInWave - 1);
    this.scoring.kill(headshot);

    this._refillWave();
    this._checkWaveClear();
  }

  _isPlayerTarget(t) {
    if (!t) return false;
    return t === 'player' || t.isPlayer === true || t === this.ctx.peek('player');
  }

  /* ================================================================== */
  /* run lifecycle                                                      */
  /* ================================================================== */

  /** ui:startRun / NOD.start — begin a fresh run with the given job. */
  startRun(job) {
    const norm = this._normaliseJob(job);
    this.job = norm;
    this._lastJob = norm;

    this._endDeathBeat();
    this._settleT = -1; // a run start cancels any settle still playing out
    this._continueUsed = false;
    this.wave = 0;
    this._waveActive = false;
    this._breather = 0;
    this._aliveInWave = 0;
    this._pendingHead.clear();
    this.scoring.reset();
    this.scoring.announce();

    this._clearAI(); // wipe any boot garrison / previous run (deaths ignored)
    this._applyLoadout(norm);

    this._hits = 0;
    this._shotsAtRunStart = this.ctx.peek('weapons')?.stats?.fired ?? 0;
    this._runStartedMs = Date.now();
    this._runDuration = 0;

    // Both of these are deliberately un-awaited: the wave spawns on the same
    // tick whether the network answers in 40 ms or never.
    this.leaderboard.requestToken();
    this.leaderboard.drain();
    this.leaderboard.beacon('run_start', { job: norm });

    this._setState('play');
    this._startWave(1);
    console.info(`[game] deploy — job=${norm} wave 1`);
  }

  /** ui:continue / NOD.continueRun — spend the one continue, restart the wave. */
  continueRun() {
    if (this.state !== 'down') return;
    if (this._continueUsed) {
      this._gameOver();
      return;
    }
    this._continueUsed = true;
    this._endDeathBeat();

    const p = this.ctx.peek('player');
    if (p?.respawn) p.respawn(this._plazaSpawnIndex()); // heal + move to plaza
    if (p?.health) {
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    p?.setControlEnabled?.(true);

    this._clearAI();          // sweep the wave's survivors (not counted)
    this._aliveInWave = 0;
    this._setState('play');
    this._startWave(this.wave); // same wave index, score kept, mult already ×1
    console.info(`[game] continue — wave ${this.wave} restarts`);
  }

  /** ui:restart / NOD.restart — "RUN IT BACK". Also handles accept-the-loss. */
  restart() {
    if (this.state === 'down') {
      this._gameOver(); // a restart from the death screen = accept the loss
      return;
    }
    this.startRun(this._lastJob);
  }

  /** ui:accept — "ACCEPT THE LOSS" ghost button on the death screen. */
  accept() {
    if (this.state === 'down') this._gameOver();
  }

  _onPlayerDeath() {
    const p = this.ctx.peek('player');
    if (this._god) {
      p?.health?.reset?.(true);
      return;
    }
    if (this.state !== 'play') return;

    this.scoring.resetMult(); // streak collapses on death, score survives
    this._beginDeathBeat();
    p?.setControlEnabled?.(false);

    if (this._continueUsed) {
      this._gameOver();
    } else {
      this._setState('down');
      this.ctx.events.emit('game:continueOffer', {});
    }
  }

  _gameOver() {
    this._waveActive = false;
    this._breather = 0;
    this._endDeathBeat();
    this.ctx.peek('player')?.setControlEnabled?.(false);

    const accuracy = this._accuracy();
    const score = this.scoring.score;
    const newBest = score > this._best;
    if (newBest) this._best = score;
    if (this.wave > this._bestWave) this._bestWave = this.wave;
    this._saveBest();

    this._runDuration = this._runStartedMs ? Math.max(0, Math.round((Date.now() - this._runStartedMs) / 1000)) : 0;

    // Everything submit-score validates, in one object the UI can hand straight
    // to leaderboard.submit() with only `initials` added.
    this.lastRun = {
      job: this.job ?? this._lastJob ?? DEFAULT_JOB,
      score,
      wave: Math.max(1, this.wave),
      kills: this.scoring.kills,
      accuracy,
      duration_s: this._runDuration,
      continued: this._continueUsed,
    };

    this._setState('over');
    this.ctx.events.emit('game:over', {
      score,
      wave: this.wave,
      kills: this.scoring.kills,
      accuracy,
      best: this._best,
      bestWave: this._bestWave,
      newBest,
      // additive — the leaderboard/share layer reads these off the same event
      job: this.lastRun.job,
      durationS: this._runDuration,
      continued: this._continueUsed,
    });
    this.leaderboard.beacon('run_end', {
      job: this.lastRun.job,
      wave: this.lastRun.wave,
      score: this.lastRun.score,
    });
    console.info(`[game] run settled — score=${score} wave=${this.wave} kills=${this.scoring.kills}`);
  }

  /**
   * ui:attract / NOD.attract — drop everything and go back to the title. Used
   * by cabinet mode's idle reset; never fires mid-run (the cabinet only arms it
   * on menus and the game-over card).
   */
  attract() {
    this._endDeathBeat();
    this._settleT = -1;
    this._waveActive = false;
    this._breather = 0;
    this.wave = 0;
    this._clearAI();
    this.scoring.reset();
    this.scoring.announce();
    this.ctx.peek('player')?.setControlEnabled?.(true);
    this._setState('attract');
    console.info('[game] idle → attract');
  }

  /* ================================================================== */
  /* waves                                                              */
  /* ================================================================== */

  _startWave(n) {
    this.wave = n;
    this._waveActive = true;
    this._breather = 0;
    this._waveSpawned = 0;
    this._aliveInWave = 0;
    this._waveGoal = waveGoal(n);
    this.ctx.events.emit('game:wave', { wave: n, count: this._waveGoal });
    this._refillWave();
  }

  /** Keep the fight topped up to the concurrent cap, up to the wave's total. */
  _refillWave() {
    if (!this._waveActive || this._breather > 0) return;
    const ai = this.ctx.peek('ai');
    if (!ai) return;

    if (typeof ai.spawnWave === 'function') {
      const remaining = this._waveGoal - this._waveSpawned;
      const room = CONCURRENT_CAP - this._aliveInWave;
      const want = Math.min(remaining, room);
      if (want <= 0) return;
      const r = ai.spawnWave({ count: want, intensity: waveIntensity(this.wave), waveIndex: this.wave });
      const spawned = Number.isFinite(r) ? r : want;
      this._waveSpawned += spawned;
      this._aliveInWave += spawned;
    } else if (typeof ai.populate === 'function') {
      // No trickle API yet — spawn the wave in one go, retrying until it takes.
      if (this._waveSpawned > 0) return;
      const before = ai.agents?.length ?? 0;
      const made = ai.populate({ squads: Math.max(1, Math.ceil(this._waveGoal / 3)), perSquad: 3 });
      const after = ai.agents?.length ?? 0;
      const spawned = Number.isFinite(made) ? made : Math.max(0, after - before);
      if (spawned > 0) {
        this._waveSpawned += spawned;
        this._aliveInWave += spawned;
        this._waveGoal = this._waveSpawned; // this wave clears when these are dead
      }
    }
  }

  _checkWaveClear() {
    if (!this._waveActive || this._waveGoal <= 0) return;
    if (this._waveSpawned >= this._waveGoal && this._aliveInWave <= 0) {
      this._onWaveCleared();
    }
  }

  _onWaveCleared() {
    this._waveActive = false;
    const bonus = waveBonus(this.wave) * this.scoring.mult;
    this.scoring.addBonus(bonus);
    // NOT resetCombo() here: the kill that cleared the wave may still have a
    // `BATCH PROCESSED` parked on it. tickCombo runs through the breather, so
    // the notice lands and then the window expires on its own.
    this.ctx.events.emit('game:waveClear', { wave: this.wave, bonus });
    this._breather = BREATHER_S; // update() counts this down and starts the next
    this._startSettleBeat();
    console.info(`[game] wave ${this.wave} settled +${bonus} — breather ${BREATHER_S}s`);
  }

  /* ================================================================== */
  /* the settle beat                                                    */
  /* ================================================================== */

  /**
   * The four-second breather needs a physical moment at the front of it, or the
   * wave clear is a banner and a number and nothing else. Three cues, all
   * through other subsystems' PUBLIC APIs, all inside 1.2 s:
   *
   *   t=0.00  a gold flash at THE LEDGER (fx.lights.flash) — the plaza lights
   *           up as the books balance. Priority 3 so a stray impact flash can
   *           not evict it; short decay so it is a pulse, not a lamp.
   *   t=0.00  player.addCameraShake(0.30) — the sanctioned trauma API. 0.30 is
   *           roughly a distant explosion: felt, not thrown.
   *   t=0.06  two small gold confetti bursts, 0.16 s apart, of CHIP/SPLINTER
   *           tiles on a slow fall. Paper, not a jackpot.
   *
   * This is a SETTLE. Restraint is the spec: no screen flash, no full-screen
   * particles, nothing that competes with the wave banner for the eye.
   *
   * `fx.now` is only refreshed inside fx.update(), and the registry runs fx
   * before game every frame, so `now` is already this frame's elapsed time when
   * we get here. (Calling from init or an event outside the frame would not be.)
   */
  _startSettleBeat() {
    if (this.ctx.config?.deterministic) return; // never perturb a capture
    const fx = this.ctx.peek('fx');
    const p = this.ctx.peek('player');
    const pos = this._ledgerWorldPos();

    if (fx?.lights?.flash && pos) {
      // (x,y,z, r,g,b, peak, duration, decay, distance, priority)
      // peak 170 cd sits well under the 420 an explosion asks for — the plaza
      // lifts, it does not detonate. distance 20 keeps the spill on the
      // monument and the stone around it.
      fx.lights.flash(pos.x, pos.y + 1.35, pos.z, GOLD.r, GOLD.g, GOLD.b, 170, 0.55, 4.6, 20, 3);
    }
    p?.addCameraShake?.(0.3);

    this._settleT = 0;
    this._settleStep = 0;
  }

  /** Runs the confetti bursts on the frame clock. Returns nothing, allocates nothing. */
  _updateSettleBeat(dt) {
    if (this._settleT < 0) return;
    this._settleT += dt;
    if (this._settleStep === 0 && this._settleT >= 0.06) {
      this._settleStep = 1;
      this._confetti(0.55);
    } else if (this._settleStep === 1 && this._settleT >= 0.22) {
      this._settleStep = 2;
      this._confetti(0.4);
    } else if (this._settleStep >= 2 && this._settleT >= 1.2) {
      this._settleT = -1; // whole beat done well inside the 4s breather
    }
  }

  /**
   * One restrained gold burst above the Ledger. Count scales with `fx.pScale`
   * (the quality preset's particle budget) exactly as fx's own emitters do, and
   * the pool is a ring — emitting never allocates.
   */
  _confetti(strength) {
    const fx = this.ctx.peek('fx');
    const pos = this._ledgerWorldPos();
    if (!fx?.emitLit || !pos) return;
    const rng = this.ctx.rng; // deterministic stream, never Math.random
    const s = this._spawn;
    const n = Math.round(16 * (fx.pScale ?? 1) * strength) + 5;

    for (let i = 0; i < n; i++) {
      const a = rng.float() * 6.283;
      const r = 0.2 + rng.float() * 0.55;
      s.x = pos.x + Math.cos(a) * r;
      s.y = pos.y + 1.1 + rng.float() * 0.4;
      s.z = pos.z + Math.sin(a) * r;
      s.vx = Math.cos(a) * (0.6 + rng.float() * 1.5);
      s.vy = 1.8 + rng.float() * 2.1;
      s.vz = Math.sin(a) * (0.6 + rng.float() * 1.5);
      s.tile = i % 3 ? TILE_CHIP : TILE_SPLINTER;
      s.size0 = 0.055 + rng.float() * 0.05;
      s.size1 = s.size0 * 0.85; // flakes do not grow
      s.sizeCurve = 1;
      s.life = 1.2 + rng.float() * 0.8;
      s.delay = 0;
      s.drag = 2.1;      // enough air resistance to flutter rather than arc
      s.gravity = -2.6;
      s.rot = rng.float() * 6.283;
      s.spin = (rng.float() - 0.5) * 7;
      s.stretch = 0;
      // Loot Gold ramping to a duller leaf as it falls out of the light. The
      // lit layer is sun-shaded, so intensity carries the gold through the
      // plaza's shadow side — without it the flakes read as grey litter.
      s.r0 = 1.0; s.g0 = 0.74; s.b0 = 0.1; s.i0 = 2.4;
      s.r1 = 0.5; s.g1 = 0.34; s.b1 = 0.06; s.i1 = 0.9;
      s.alpha = 0.92;
      s.alphaCurve = 1.5;
      s.soft = 0.2;
      s.turb = 0.22; s.turbFreq = 2.6;
      s.seed = rng.float();
      s.flags = 0;
      fx.emitLit(s);
    }
  }

  /** THE LEDGER in world space. Resolved once, from world's public transform. */
  _ledgerWorldPos() {
    if (this._ledgerPos) return this._ledgerPos;
    const world = this.ctx.peek('world');
    if (typeof world?.levelToWorld !== 'function') return null;
    // One allocation, once per session — not a per-frame path.
    const v = world.levelToWorld(LEDGER_LEVEL_X, 0, LEDGER_LEVEL_Z);
    const gy = world.groundHeight?.(v.x, v.z);
    if (Number.isFinite(gy)) v.y = gy;
    this._ledgerPos = v;
    return v;
  }

  /* ================================================================== */
  /* frame                                                              */
  /* ================================================================== */

  update(dt, ctx) {
    if (!this._announced) {
      // Re-broadcast once so a UI that subscribed after our init still syncs.
      this._announced = true;
      ctx.events.emit('game:state', { state: this.state });
    }

    if (this._deathBeatUntil && ctx.time.raw >= this._deathBeatUntil) this._endDeathBeat();
    this._updateSettleBeat(dt);
    this.scoring.tickCombo(dt); // outside every state gate — see Scoring.tickCombo

    if (this._god) {
      const p = ctx.peek('player');
      if (p?.health) {
        if (p.health.value < p.health.max) p.health.value = p.health.max;
        p.health.dead = false;
      }
    }

    if (this.state !== 'play') return;

    if (this._breather > 0) {
      this._breather -= dt;
      if (this._breather <= 0) {
        this._breather = 0;
        this._startWave(this.wave + 1);
      }
      return;
    }
    if (this._waveActive) {
      this.scoring.update(dt); // multiplier decay
      this._refillWave();
      this._checkWaveClear();
    }
  }

  /* ================================================================== */
  /* enemy clearing / loadout / helpers                                 */
  /* ================================================================== */

  /** Remove every live enemy WITHOUT it counting as kills (deaths ignored). */
  _clearAI() {
    const ai = this.ctx.peek('ai');
    if (!ai) return;
    this._ignoreDeaths = true;
    try {
      if (typeof ai.despawnAll === 'function') ai.despawnAll();
      else if (typeof ai.clearAgents === 'function') ai.clearAgents();
      else if (typeof ai.killAll === 'function') ai.killAll();
      else this._lethalToAll(ai);
    } finally {
      this._ignoreDeaths = false;
    }
    this._pendingHead.clear();
    this._aliveInWave = 0;
  }

  /** Kill every live enemy so it DOES count (debug: advance a wave hands-free). */
  _killAllLive() {
    const ai = this.ctx.peek('ai');
    if (!ai || !Array.isArray(ai.agents)) return 0;
    let n = 0;
    for (const a of [...ai.agents]) {
      if (a?.alive) {
        n += 1;
        this._emitLethal(a);
      }
    }
    return n;
  }

  _lethalToAll(ai) {
    if (!Array.isArray(ai.agents)) return;
    for (const a of [...ai.agents]) if (a?.alive) this._emitLethal(a);
  }

  /** Sanctioned enemy removal: hand the AI a fatal damage:dealt for one agent. */
  _emitLethal(a) {
    this._synthDamage = true; // keep this off the accuracy tally
    try {
      this.ctx.events.emit('damage:dealt', {
        target: a,
        amount: 1e6,
        headshot: false,
        killed: false,
        point: a.position ?? a.eye ?? undefined,
      });
    } finally {
      this._synthDamage = false;
    }
  }

  _applyLoadout(job) {
    const kit = LOADOUTS[job] ?? LOADOUTS[DEFAULT_JOB];
    const wp = this.ctx.peek('weapons');
    if (wp) {
      if (typeof wp.setWeaponImmediate === 'function') wp.setWeaponImmediate(kit.weapon);
      else if (typeof wp.setWeapon === 'function') wp.setWeapon(kit.weapon);
    }
    const p = this.ctx.peek('player');
    if (p?.respawn) p.respawn(0); // fresh spawn + full heal to base
    if (p?.health) {
      p.health.max = this._baseMaxHealth * kit.armour; // compliance = max armour
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    p?.setControlEnabled?.(true);
  }

  _plazaSpawnIndex() {
    const sp = this.ctx.peek('world')?.spawnPoints;
    if (Array.isArray(sp)) {
      const i = sp.findIndex((s) => /plaza/i.test(s?.tag ?? ''));
      if (i >= 0) return i;
    }
    return 0;
  }

  _accuracy() {
    const fired = this.ctx.peek('weapons')?.stats?.fired ?? 0;
    const shots = Math.max(0, fired - this._shotsAtRunStart);
    return shots > 0 ? Math.min(1, this._hits / shots) : null;
  }

  _normaliseJob(job) {
    if (!job) return this._lastJob ?? DEFAULT_JOB;
    const key = String(job).trim().toLowerCase().replace(/[\s_]+/g, '-');
    return LOADOUTS[key] ? key : DEFAULT_JOB;
  }

  _setState(state) {
    if (this.state === state && this._announced) return;
    this.state = state;
    this.ctx.events.emit('game:state', { state });
    console.info(`[game] state → ${state}`);
  }

  _beginDeathBeat() {
    if (this.ctx.config?.deterministic) return; // never touch capture timing
    const t = this.ctx.time;
    if (!t) return;
    t.scale = 0.35;
    this._deathBeatUntil = t.raw + 1.2;
  }

  _endDeathBeat() {
    if (this.ctx.time) this.ctx.time.scale = 1;
    this._deathBeatUntil = 0;
  }

  /* ================================================================== */
  /* persistence                                                        */
  /* ================================================================== */

  _loadBest() {
    this._best = 0;
    this._bestWave = 0;
    try {
      const b = localStorage.getItem(BEST_KEY);
      if (b != null) this._best = Number(b) || 0;
      const w = localStorage.getItem(BEST_WAVE_KEY);
      if (w != null) this._bestWave = Number(w) || 0;

      // One-time migration: an earlier game hosted on this domain stored its high
      // score under the plain-integer key 'nod_best'. If it beats our best, adopt
      // it, then drop the legacy key so this runs at most once.
      const legacy = localStorage.getItem('nod_best');
      if (legacy != null) {
        const lv = Number(legacy);
        if (Number.isFinite(lv) && lv > this._best) {
          this._best = lv;
          localStorage.setItem(BEST_KEY, String(this._best));
        }
        localStorage.removeItem('nod_best');
      }
    } catch {
      /* private mode / disabled storage — best stays 0 */
    }
  }

  _saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(this._best));
      localStorage.setItem(BEST_WAVE_KEY, String(this._bestWave));
    } catch {
      /* ignore */
    }
  }

  /* ================================================================== */
  /* debug API (window.NOD, exactly per contract)                       */
  /* ================================================================== */

  _snapshot() {
    return {
      mode: this.state,
      wave: this.wave,
      score: this.scoring.score,
      mult: this.scoring.mult,
      kills: this.scoring.kills,
      accuracy: this._accuracy(),
      best: this._best,
      aliveEnemies: this._aliveInWave,
      job: this.job,
      durationS: this._runStartedMs ? Math.round((Date.now() - this._runStartedMs) / 1000) : 0,
      queued: this.leaderboard?.queued ?? 0,
    };
  }

  god(on) {
    this._god = !!on;
    if (this._god) {
      const p = this.ctx.peek('player');
      if (p?.health) {
        p.health.value = p.health.max;
        p.health.dead = false;
      }
    }
    return this._god;
  }

  skipToWave(n) {
    const target = Math.max(1, Math.floor(Number(n)) || 1);
    if (this.state !== 'play' && this.state !== 'down') this.startRun(this._lastJob);
    this._clearAI();
    this._breather = 0;
    this.ctx.peek('player')?.setControlEnabled?.(true);
    this._setState('play');
    this._startWave(target);
    return this.wave;
  }

  _installDebugApi() {
    const self = this;
    try {
      window.NOD = {
        get state() {
          return self._snapshot();
        },
        start: (job) => self.startRun(job),
        continueRun: () => self.continueRun(),
        restart: () => self.restart(),
        skipToWave: (n) => self.skipToWave(n),
        god: (b) => self.god(b),
        killAll: () => self._killAllLive(),
        // launch-roadmap additions (leaderboard / share / cabinet verification)
        attract: () => self.attract(),
        get lastRun() {
          return self.lastRun;
        },
        leaderboard: self.leaderboard,
      };
    } catch {
      /* no window (headless build step) — the loop still runs */
    }
  }

  dispose() {
    for (const off of this._off ?? []) off();
    this._off = [];
    this._endDeathBeat();
    this._pendingHead.clear();
    try {
      if (window.NOD) delete window.NOD;
    } catch {
      /* ignore */
    }
  }
}
