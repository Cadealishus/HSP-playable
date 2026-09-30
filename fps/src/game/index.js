/**
 * GAME — OPERATION TOTAL CONFIDENCE, the wave-holdout loop that turns the
 * sandbox into a game. Subsystem id `game`. Doug and the Extra Special Forces
 * hold the town square "for as long as it takes" (Command's estimate: about a
 * wave). Talks to every other subsystem strictly through ctx.get / peek and
 * ctx.events (never an import).
 *
 * STATE MACHINE            attract → play → down → over   (see _setState)
 *   attract  before the first ui:startRun. No waves spawn; the loop is inert so
 *            the title screen and the capture harness are undisturbed.
 *   play     a wave is being fought.
 *   down     Doug is down and a continue is on offer (once per run).
 *   over     operation concluded; game:over carries the after-action numbers.
 *
 * EVENTS EMITTED
 *   game:state {state} · game:wave {wave,count} · game:waveClear {wave,bonus}
 *   game:score {score,delta,mult} · game:mult {mult} · game:continueOffer {}
 *   game:multiKill {count}
 *   game:over {score,wave,kills,accuracy,best,bestWave,newBest,job,durationS,continued}
 * EVENTS CONSUMED:
 *   ui:startRun {job} · ui:continue · ui:restart · ui:accept · ui:attract
 *   player:death · actor:death · bullet:impact · damage:dealt
 *
 * INTEGRATION NOTES
 *   - Kills / wave progress are counted from `actor:death` (fires for every enemy
 *     death, all causes). Headshots are read from the `bullet:impact` that lands
 *     immediately before the fatal `damage:dealt` (actor:death carries a
 *     hard-coded headshot:false, so it can't tell us). Accuracy = enemy hits
 *     (damage:dealt to an enemy) / rounds fired (weapons.stats.fired).
 *   - Spawning calls `ai.spawnWave({count,intensity,waveIndex})` and trusts its
 *     return count. If that method does not exist yet it falls back to
 *     `ai.populate({squads,perSquad})`. Clearing enemies prefers
 *     `ai.despawnAll/clearAgents/killAll`, else emits lethal damage:dealt.
 *   - Loadouts set the weapon via `weapons.setWeaponImmediate(id)` and, for
 *     CHARLIE's double plating, raise the live `player.health.max` (there is no
 *     armour subsystem to hook).
 *
 * OFFLINE BY DESIGN
 *   There is no leaderboard, token, beacon or share-card traffic: the game makes
 *   no network requests at all. Persistence is the local best score and best
 *   wave in localStorage, every access try/catch wrapped.
 */

import { Scoring } from './scoring.js';
import { CONCURRENT_CAP, BREATHER_S, waveGoal, waveIntensity, waveBonus } from './waves.js';

/**
 * ESF loadout id → { weapon id, armour multiplier on base max health }.
 * ALPHA "STANDARD ISSUE" rifle · BRAVO "ROOM SERVICE" SMG ·
 * CHARLIE "CONTINGENCY" sidearm with double plating.
 */
const LOADOUTS = {
  alpha: { weapon: 'rifle', primary: 'rifle', secondary: 'pistol', armour: 1 },
  bravo: { weapon: 'smg', primary: 'smg', secondary: 'mpistol', armour: 1 },
  charlie: { weapon: 'pistol', primary: null, secondary: 'pistol', armour: 2 },
  delta: { weapon: 'sniper', primary: 'sniper', secondary: 'pistol', armour: 1 },
  echo: { weapon: 'shotgun', primary: 'shotgun', secondary: 'pistol', armour: 1.2 },
  foxtrot: { weapon: 'lmg', primary: 'lmg', secondary: 'pistol', armour: 1.2 },
  golf: { weapon: 'carbine_sd', primary: 'carbine_sd', secondary: 'mpistol', armour: 1 },
  hotel: { weapon: 'marksman', primary: 'marksman', secondary: 'pistol', armour: 1 },
  india: { weapon: 'carbine', primary: 'carbine', secondary: 'rocket', armour: 1 },
};
const DEFAULT_JOB = 'alpha';
/** Weapon-class shorthands accepted by FLOP.start() from the console. */
const LOADOUT_ALIASES = { rifle: 'alpha', smg: 'bravo', pistol: 'charlie', sniper: 'delta', shotgun: 'echo', lmg: 'foxtrot', carbine_sd: 'golf', marksman: 'hotel', carbine: 'india', rocket: 'india' };

const BEST_KEY = 'flopops.best';
const BEST_WAVE_KEY = 'flopops.bestWave';

/** Scoring's internal channel names → the bus event names. */
const SCORING_EVENTS = {
  score: 'game:score',
  mult: 'game:mult',
  // Two or more kills inside the 1.2 s window. src/ui renders it into the
  // killfeed and hands it to Command's radio as a streak.
  multiKill: 'game:multiKill',
};

/* ==================================================================== */
/* THE WAVE-CLEAR BEAT                                                  */
/* ==================================================================== */

/**
 * The town square, in level coordinates: the plaza centre the mission is named
 * after. Converted to world space through the world's own public
 * `levelToWorld()` so the level transform stays owned by src/world.
 */
const SQUARE_LEVEL_X = -1.7;
const SQUARE_LEVEL_Z = 8.6;

/** Signal-flare amber in rough linear space. */
const FLARE = { r: 1.0, g: 0.46, b: 0.16 };

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

    /** Last concluded run, for the after-action report. Null until the first game over. */
    this.lastRun = null;

    this.scoring = new Scoring((type, data) => ctx.events.emit(SCORING_EVENTS[type] ?? 'game:score', data));

    this._squarePos = null; // resolved once, on the first wave clear

    // Base player max health, captured before any armour override.
    const p = ctx.peek('player');
    this._baseMaxHealth = p?.health?.max ?? p?.maxHealth ?? 100;

    this._loadBest();
    this._wireEvents(ctx);
    this._installDebugApi();

    this._setState('attract');
    console.info('[game] OPERATION TOTAL CONFIDENCE ready — state=attract');
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
    on('ui:accept', () => this.accept()); // "ACCEPT THE OUTCOME" → over
    on('ui:attract', () => this.attract()); // "RETURN TO BASE" from the report

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

  /** ui:startRun / FLOP.start — begin a fresh run with the given loadout. */
  startRun(job) {
    const norm = this._normaliseJob(job);
    this.job = norm;
    this._lastJob = norm;

    this._endDeathBeat();
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

    this._markSquare(true);
    this._setState('play');
    this._startWave(1);
    console.info(`[game] deploy — loadout=${norm} wave 1`);
  }

  /** ui:continue / FLOP.continueRun — REQUEST ONE (1) MORE CHANCE. Restarts the wave. */
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

  /** ui:restart / FLOP.restart — "REDEPLOY". From the death screen it means accept. */
  restart() {
    if (this.state === 'down') {
      this._gameOver(); // a restart from the death screen = accept the outcome
      return;
    }
    this.startRun(this._lastJob);
  }

  /** ui:accept — "ACCEPT THE OUTCOME" ghost button on the death screen. */
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
      // additive — the after-action report reads these off the same event
      job: this.lastRun.job,
      durationS: this._runDuration,
      continued: this._continueUsed,
    });
    console.info(`[game] operation concluded — score=${score} wave=${this.wave} kills=${this.scoring.kills}`);
  }

  /**
   * ui:attract / FLOP.attract — drop everything and go back to the title.
   * "RETURN TO BASE" on the after-action report is the only UI caller.
   */
  attract() {
    this._endDeathBeat();
    this._waveActive = false;
    this._breather = 0;
    this.wave = 0;
    this._clearAI();
    this.scoring.reset();
    this.scoring.announce();
    this.ctx.peek('player')?.setControlEnabled?.(false);
    this._markSquare(false);
    this._setState('attract');
    console.info('[game] return to base → attract');
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
    // multi-kill notice parked on it. tickCombo runs through the breather, so
    // the notice lands and then the window expires on its own.
    this.ctx.events.emit('game:waveClear', { wave: this.wave, bonus });
    this._breather = BREATHER_S; // update() counts this down and starts the next
    this._startClearBeat();
    console.info(`[game] wave ${this.wave} held +${bonus} — breather ${BREATHER_S}s`);
  }

  /* ================================================================== */
  /* the wave-clear beat                                                */
  /* ================================================================== */

  /**
   * The four-second breather needs a physical moment at the front of it, or the
   * wave clear is a banner and a number and nothing else. Two cues, both
   * through other subsystems' PUBLIC APIs:
   *
   *   a short amber pulse high over the square (fx.lights.flash): a signal
   *   flare popping overhead. Priority 3 so a stray impact flash can not evict
   *   it; short decay so it is a pulse, not a lamp.
   *   player.addCameraShake(0.30): roughly a distant explosion. Felt, not thrown.
   *
   * Restraint is the spec: no screen flash, no particles, nothing that competes
   * with the wave banner or Command's radio line for the eye.
   */
  _startClearBeat() {
    if (this.ctx.config?.deterministic) return; // never perturb a capture
    const fx = this.ctx.peek('fx');
    const p = this.ctx.peek('player');
    const pos = this._squareWorldPos();

    if (fx?.lights?.flash && pos) {
      // (x,y,z, r,g,b, peak, duration, decay, distance, priority)
      fx.lights.flash(pos.x, pos.y + 9, pos.z, FLARE.r, FLARE.g, FLARE.b, 150, 0.7, 3.8, 26, 3);
    }
    p?.addCameraShake?.(0.3);
  }

  /**
   * Put (or take down) the objective marker on the square: compass pip,
   * minimap square and the world-space DEFEND marker, all through ui's public
   * setObjectives(). Called on deploy and on return to the title.
   */
  _markSquare(on) {
    const ui = this.ctx.peek('ui');
    if (typeof ui?.setObjectives !== 'function') return;
    const pos = on ? this._squareWorldPos() : null;
    if (!pos) {
      ui.setObjectives([]);
      return;
    }
    if (!this._squareObj) {
      // Head height over the square, allocated once per session.
      this._squareObj = { position: pos.clone(), label: 'A', name: 'DEFEND' };
      this._squareObj.position.y += 1.6;
    }
    ui.setObjectives([this._squareObj]);
  }

  /** The town square in world space. Resolved once, from world's public transform. */
  _squareWorldPos() {
    if (this._squarePos) return this._squarePos;
    const world = this.ctx.peek('world');
    // Any map but the town publishes its own objective (src/world/maps): hold
    // that instead of the town square.
    if (world?.mapId && world.mapId !== 'town' && world.objective?.position) {
      this._squarePos = world.objective.position.clone();
      return this._squarePos;
    }
    if (typeof world?.levelToWorld !== 'function') return null;
    // One allocation, once per session — not a per-frame path.
    const v = world.levelToWorld(SQUARE_LEVEL_X, 0, SQUARE_LEVEL_Z);
    const gy = world.groundHeight?.(v.x, v.z);
    if (Number.isFinite(gy)) v.y = gy;
    this._squarePos = v;
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
      // A session loadout (EXPANSION §1, written by a loadout screen) overrides
      // the job's weapons; the job still decides the armour.
      const lo = this.ctx.config?.session?.loadout ?? null;
      if (typeof wp.setLoadout === 'function') {
        wp.setLoadout({
          primary: lo?.primary ?? kit.primary,
          secondary: lo?.secondary ?? kit.secondary,
          lethal: lo?.lethal ?? 'frag',
          tactical: lo?.tactical ?? 'flash',
        }, { refill: true });
        if (!lo?.primary) wp.setWeaponImmediate?.(kit.weapon);
      } else if (typeof wp.setWeaponImmediate === 'function') wp.setWeaponImmediate(kit.weapon);
      else if (typeof wp.setWeapon === 'function') wp.setWeapon(kit.weapon);
    }
    const p = this.ctx.peek('player');
    if (p?.respawn) p.respawn(0); // fresh spawn + full heal to base
    if (p?.health) {
      p.health.max = this._baseMaxHealth * kit.armour; // CHARLIE: double plating
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    p?.setControlEnabled?.(true);
  }

  _plazaSpawnIndex() {
    const world = this.ctx.peek('world');
    if (world?.mapId && world.mapId !== 'town') return world.playerSpawnIndex ?? 0;
    const sp = world?.spawnPoints;
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
    let key = String(job).trim().toLowerCase().replace(/[\s_]+/g, '-');
    key = LOADOUT_ALIASES[key] ?? key;
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
  /* debug API (window.FLOP)                                      */
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
    };
  }

  /** Local best, for the title screen footer. */
  bestRecord() {
    return { score: this._best, wave: this._bestWave };
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
      const api = {
        get state() {
          return self._snapshot();
        },
        start: (job) => self.startRun(job),
        continueRun: () => self.continueRun(),
        restart: () => self.restart(),
        skipToWave: (n) => self.skipToWave(n),
        god: (b) => self.god(b),
        killAll: () => self._killAllLive(),
        attract: () => self.attract(),
        /** Equip any weapon id (or +1 'frag' / 'flash') for testing. */
        give: (id) => self.ctx.peek('weapons')?.give?.(id) ?? null,
        /** Every weapon id the arsenal knows. */
        get weapons() {
          return self.ctx.peek('weapons')?.allWeaponIds ?? [];
        },
        get lastRun() {
          return self.lastRun;
        },
      };
      window.FLOP = api;
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
      if (window.FLOP) delete window.FLOP;

    } catch {
      /* ignore */
    }
  }
}
