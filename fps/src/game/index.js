/**
 * GAME — the session host. Subsystem id `game`. Runs whatever the player
 * launched (src/game/session.js): SURVIVAL (OPERATION TOTAL CONFIDENCE, the
 * original wave holdout), the bot-match modes (TEAM DEATHMATCH, DOMINATION,
 * HARDPOINT, SEARCH & DESTROY) and, when their modules are in the build, the
 * SPECIAL OPERATIONS missions. Talks to every other subsystem strictly through
 * ctx.get / peek and ctx.events (never an import).
 *
 * STATE MACHINE            attract → play → down → over   (see _setState)
 *   attract  the main menu. Nothing spawns; the capture harness is undisturbed.
 *   play     a mode is running (in a bot match this includes respawn waits and
 *            spectating: those are mode sub-states, see hudState()).
 *   down     SURVIVAL only: Doug is down and a continue is on offer.
 *   over     the run or match is concluded; game:over carries the numbers.
 *
 * MODES (src/game/modes, docs/EXPANSION.md §4) implement init/start/update/
 * orderFor/hudState/onDeath/interact/isOver. The host owns everything they
 * share: the state machine, clearing the AI, placing and reviving Doug,
 * loadouts and resupply, the order provider, the spectator camera, the
 * announcer bus and the debug API.
 *
 * EVENTS EMITTED
 *   game:state {state} · game:over {mode, winner, …} · mode:announce {text, kind, reply, banner}
 *   survival: game:wave · game:waveClear · game:score · game:mult · game:multiKill · game:continueOffer
 * EVENTS CONSUMED
 *   ui:launch {session} · ui:startRun {job} · ui:continue · ui:restart · ui:accept · ui:attract
 *   player:death · actor:death · bullet:impact · damage:dealt
 *
 * OFFLINE BY DESIGN: persistence is the local best score / best wave and the
 * session in localStorage, every access try/catch wrapped.
 */

import * as THREE from 'three';
import { Scoring } from './scoring.js';
import { MODES, MODE_INFO, modeAvailable } from './modes/index.js';
import { aiCaps } from './modes/team.js';
import { availableMissions, loadMission } from './missions.js';
import { DEFAULT_SESSION, normaliseSession, saveSession, launchSession, mapSupports, normaliseLoadout } from './session.js';

/**
 * Legacy ESF loadout id → { weapon id, armour multiplier on base max health }.
 * Still honoured by `ui:startRun {job}` and FLOP.start(job).
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
/** Weapon-class shorthands accepted by FLOP.start() from the console. */
const LOADOUT_ALIASES = { rifle: 'alpha', smg: 'bravo', pistol: 'charlie', sniper: 'delta', shotgun: 'echo', lmg: 'foxtrot', carbine_sd: 'golf', marksman: 'hotel', carbine: 'india', rocket: 'india' };

const BEST_KEY = 'flopops.best';
const BEST_WAVE_KEY = 'flopops.bestWave';

const SCORING_EVENTS = { score: 'game:score', mult: 'game:mult', multiKill: 'game:multiKill' };

/** Player eye height above the feet, standing (src/core/config UNITS). */
const EYE = 1.66;

export class GameSystem {
  static id = 'game';
  // init after the systems we drive so their event handlers are wired first.
  static deps = ['ai', 'player', 'weapons'];

  async init(ctx) {
    this.ctx = ctx;
    this.state = 'attract';
    this.session = { ...DEFAULT_SESSION, ...(ctx.config?.session ?? {}), map: ctx.config?.map ?? 'town' };
    /** The running mode instance (null on the menu). */
    this.mode = null;
    this.modeId = null;
    this.job = null;
    this._lastJob = null;

    this._ignoreDeaths = false;
    this._synthDamage = false;
    this._god = false;
    this._announced = false;
    this._autostarted = false;

    this._shotsAtRunStart = 0;
    this._hits = 0;
    this._pendingHead = new Map();
    this._deathBeatUntil = 0;
    this._runStartedMs = 0;
    this._runDuration = 0;

    this._lastAttacker = null;
    this._lastAttackerAt = -1e9;
    this._inputHeld = false;

    /** Spectator camera (S&D). `cameraOverride` is non-null while it owns the camera. */
    this.cameraOverride = null;
    this._spec = {
      team: 'esf',
      target: null,
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      want: new THREE.Vector3(),
      wantLook: new THREE.Vector3(),
      snap: true,
    };

    this.lastRun = null;
    this.scoring = new Scoring((type, data) => ctx.events.emit(SCORING_EVENTS[type] ?? 'game:score', data));

    const p = ctx.peek('player');
    this._baseMaxHealth = p?.health?.max ?? p?.maxHealth ?? 100;

    this._loadBest();
    this._wireEvents(ctx);
    this._installDebugApi();

    this._setState('attract');
    // Nobody walks around under the main menu (capture poses the player itself).
    if (!ctx.config?.deterministic) p?.setControlEnabled?.(false);
    console.info(`[game] session ${this.session.kind}/${this.session.mode ?? this.session.mission} on ${this.session.map} — state=attract`);
  }

  /* ================================================================== */
  /* events                                                             */
  /* ================================================================== */

  _wireEvents(ctx) {
    this._off = [];
    const on = (t, fn) => this._off.push(ctx.events.on(t, fn));

    on('ui:launch', (e) => this.launch(e?.session ?? e));
    on('ui:startRun', (e) => this.startRun(e?.job));
    on('ui:continue', () => this.continueRun());
    on('ui:restart', () => this.restart());
    on('ui:accept', () => this.accept());
    on('ui:attract', () => this.attract());

    on('player:death', (e) => this._onPlayerDeath(e));
    on('actor:death', (e) => this._onActorDeath(e));
    on('bullet:impact', (e) => this._onBulletImpact(e));
    on('damage:dealt', (e) => this._onDamageDealt(e));
  }

  _onBulletImpact(e) {
    // The region of the last real hit on an agent, so the fatal shot's headshot
    // flag survives to actor:death (older AI builds send headshot:false there).
    if (!e || !e.actor || e.exit) return;
    this._pendingHead.set(e.actor, e.part === 'head');
  }

  _onDamageDealt(e) {
    if (!e || !e.target) return;
    if (this._isPlayer(e.target)) {
      if (e.source) {
        this._lastAttacker = e.source;
        this._lastAttackerAt = this.ctx.time.elapsed;
      }
      return;
    }
    if (this._synthDamage || this.state !== 'play') return;
    // Accuracy counts Doug's rounds only (bots now shoot bots too).
    if (e.source && !this._isPlayer(e.source)) return;
    this._hits += 1;
  }

  _headshotOf(e) {
    const actor = e?.actor;
    const stash = actor ? this._pendingHead.get(actor) : undefined;
    if (actor) this._pendingHead.delete(actor);
    return e?.headshot === true || stash === true;
  }

  _onActorDeath(e) {
    const actor = e?.actor;
    if (this._ignoreDeaths || !this.mode || this.state !== 'play') {
      if (actor) this._pendingHead.delete(actor);
      return;
    }
    const headshot = this._headshotOf(e);
    if (this.modeId === 'survival') this.mode.onDeath(e, headshot);
    else this.mode.onDeath?.(e, headshot);
  }

  _isPlayer(t) {
    if (!t) return false;
    return t === 'player' || t.isPlayer === true || t === this.ctx.peek('player');
  }

  /** Freshest agent that put a round in Doug (≤ 6 s old), for kill credit. */
  lastAttacker() {
    return this.ctx.time.elapsed - this._lastAttackerAt < 6 ? this._lastAttacker : null;
  }

  /* ================================================================== */
  /* launching                                                          */
  /* ================================================================== */

  _maps() {
    try {
      return globalThis.__FLOP_MAPS__?.list ?? [];
    } catch {
      return [];
    }
  }

  _currentMap() {
    return this.ctx.peek('world')?.mapId ?? this.ctx.config?.map ?? this.session.map;
  }

  /**
   * The menu launched something. Same map: start it in place (no reload, the
   * level is already built). Different map: store it and reload WITHOUT a
   * query string (src/game/session.js); the next boot shows the deploy card.
   */
  launch(req) {
    const s = normaliseSession({ ...this.session, ...(req ?? {}) }, this._maps());
    this.job = null; // menu launches use the LOADOUT screen, not a legacy kit
    if (s.map !== this._currentMap()) {
      const ok = launchSession(s);
      if (!ok) console.warn('[game] launch: storage unavailable, cannot switch map');
      return ok ? 'reload' : false;
    }
    saveSession({ ...s, pending: false });
    this.startSession(s);
    return 'started';
  }

  /** Start a session on the current map. */
  startSession(s) {
    // CO-OP (src/net): inside a party every run is the shared survival run,
    // hosted by one page and mirrored by the rest. No party: unchanged.
    const netRole = this.ctx.peek('net')?.sessionRole?.() ?? null;
    if (netRole) s = { ...s, kind: 'survival', mode: 'survival', mission: null };
    this.session = { ...this.session, ...s, netRole };
    if (s.kind === 'mission') {
      loadMission(s.mission).then((Cls) => {
        if (!Cls) {
          console.warn(`[game] mission "${s.mission}" is not in this build`);
          return;
        }
        this._begin(Cls, s);
      });
      return;
    }
    const id = s.mode ?? 'survival';
    const Cls = MODES[id];
    if (!Cls) return;
    const av = modeAvailable(id, this.ctx);
    if (!av.ok) console.warn(`[game] ${id}: ${av.why} (dev launch; not offered in the menu)`);
    this._begin(Cls, s);
  }

  _begin(Cls, s) {
    this._teardown();
    this._endDeathBeat();
    this._pendingHead.clear();
    this._lastAttacker = null;
    this.modeId = Cls.id ?? s.mode;
    const mode = new Cls();
    mode.init(this.ctx, s, this);
    this.mode = mode;

    this._hits = 0;
    this._shotsAtRunStart = this.ctx.peek('weapons')?.stats?.fired ?? 0;
    this._runStartedMs = Date.now();
    this._runDuration = 0;
    this._releaseInput();
    this.ctx.peek('player')?.setControlEnabled?.(true);

    if (this.modeId === 'survival') {
      this._continueUsed = false;
      this._clearAI();
      this._applyLoadout(s.loadout, this.job);
      // The survival intel (hunt orders) reaches the bots through the provider.
      const sai = this.ctx.peek('ai');
      if (typeof sai?.setOrderProvider === 'function') sai.setOrderProvider((agent) => this.mode?.orderFor?.(agent) ?? null);
      this._setState('play');
      mode.start();
      if (s.netRole) this.ctx.peek('net')?.onGameBegin?.(s.netRole);
      console.info(`[game] deploy — survival ${s.netRole ? `co-op (${s.netRole})` : `wave 1 (${s.difficulty})`}`);
      return;
    }
    const ai = this.ctx.peek('ai');
    if (typeof ai?.setOrderProvider === 'function') {
      ai.setOrderProvider((agent) => this.mode?.orderFor?.(agent) ?? null);
    }
    this._setState('play');
    mode.start();
    this.ctx.peek('ui')?.setObjectives?.([]);
    console.info(`[game] deploy — ${this.modeId} on ${this._currentMap()} (${s.difficulty})`);
  }

  _teardown() {
    const m = this.mode;
    this.mode = null;
    this.endSpectate();
    try {
      m?.dispose?.();
    } catch (err) {
      console.warn('[game] mode dispose failed', err);
    }
    this.ctx.peek('ai')?.setOrderProvider?.(null);
    this._clearAI();
    this.ctx.peek('ui')?.clearPrompt?.();
  }

  /* ================================================================== */
  /* run lifecycle (survival API kept verbatim for ui + FLOP)            */
  /* ================================================================== */

  /** ui:startRun / FLOP.start — a fresh survival run, optionally with a legacy kit. */
  startRun(job) {
    this.job = this._normaliseJob(job);
    if (this.job) this._lastJob = this.job;
    this.startSession({ ...this.session, kind: 'survival', mode: 'survival', mission: null });
  }

  /** ui:continue / FLOP.continueRun — REQUEST ONE (1) MORE CHANCE. */
  continueRun() {
    if (this.state !== 'down' || this.modeId !== 'survival') return;
    const m = this.mode;
    if (m.continueUsed) {
      this._gameOver();
      return;
    }
    this._endDeathBeat();
    const p = this.ctx.peek('player');
    if (p?.respawn) p.respawn(this._plazaSpawnIndex());
    if (p?.health) {
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    p?.setControlEnabled?.(true);
    this._clearAI();
    this._setState('play');
    m.continueRun();
    console.info(`[game] continue — wave ${m.wave} restarts`);
  }

  /** ui:restart — REDEPLOY / REMATCH. From the death screen it means accept. */
  restart() {
    if (this.state === 'down') {
      this._gameOver();
      return;
    }
    this.startSession(this.session);
  }

  /** ui:accept — "ACCEPT THE OUTCOME" on the death screen. */
  accept() {
    if (this.state === 'down') this._gameOver();
  }

  _onPlayerDeath(e) {
    const p = this.ctx.peek('player');
    if (this._god) {
      p?.health?.reset?.(true);
      return;
    }
    if (this.state !== 'play' || !this.mode) return;
    if (this.modeId !== 'survival') {
      this.mode.onPlayerDeath?.({ ...(e ?? {}), killer: this.lastAttacker() });
      return;
    }
    // CO-OP: a death is a down (revive / bleed out), handled by src/net.
    if (this.ctx.peek('net')?.handlePlayerDeath?.(e)) return;
    const next = this.mode.onPlayerDeath();
    this._beginDeathBeat();
    p?.setControlEnabled?.(false);
    if (next === 'over') {
      this._gameOver();
    } else {
      this._setState('down');
      this.ctx.events.emit('game:continueOffer', {});
    }
  }

  /** Survival run over: best score, after-action numbers, game:over. */
  _gameOver() {
    const m = this.mode;
    if (!m || this.modeId !== 'survival') return;
    m.stop();
    this._endDeathBeat();
    this.ctx.peek('player')?.setControlEnabled?.(false);

    const accuracy = this._accuracy();
    const score = this.scoring.score;
    const newBest = score > this._best;
    if (newBest) this._best = score;
    if (m.wave > this._bestWave) this._bestWave = m.wave;
    this._saveBest();
    this._runDuration = this._runStartedMs ? Math.max(0, Math.round((Date.now() - this._runStartedMs) / 1000)) : 0;

    this.lastRun = {
      mode: 'survival',
      job: this.job ?? null,
      score,
      wave: Math.max(1, m.wave),
      kills: this.scoring.kills,
      accuracy,
      duration_s: this._runDuration,
      continued: m.continueUsed,
    };
    this._setState('over');
    this.ctx.events.emit('game:over', {
      mode: 'survival',
      score,
      wave: m.wave,
      kills: this.scoring.kills,
      accuracy,
      best: this._best,
      bestWave: this._bestWave,
      newBest,
      job: this.lastRun.job,
      durationS: this._runDuration,
      continued: m.continueUsed,
      map: this._currentMap(),
      difficulty: this.session.difficulty,
    });
    console.info(`[game] operation concluded — score=${score} wave=${m.wave} kills=${this.scoring.kills}`);
  }

  /* ----------------------------------------------------------- co-op */

  /** CO-OP client: the host concluded the run (everyone is down). */
  netOver(sum = {}) {
    const m = this.mode;
    if (!m || this.modeId !== 'survival' || this.state === 'over') return;
    m.stop();
    this._endDeathBeat();
    this._releaseInput();
    this.ctx.peek('player')?.setControlEnabled?.(false);
    const score = sum.score ?? this.scoring.score;
    const wave = Math.max(1, sum.wave ?? m.wave);
    const newBest = score > this._best;
    if (newBest) this._best = score;
    if (wave > this._bestWave) this._bestWave = wave;
    this._saveBest();
    this._runDuration = sum.durationS ?? (this._runStartedMs ? Math.round((Date.now() - this._runStartedMs) / 1000) : 0);
    const accuracy = this._accuracy();
    this.lastRun = { mode: 'survival', job: null, score, wave, kills: sum.kills ?? this.scoring.kills, accuracy, duration_s: this._runDuration, continued: false, coop: true };
    this._setState('over');
    this.ctx.events.emit('game:over', {
      mode: 'survival',
      score,
      wave,
      kills: this.lastRun.kills,
      accuracy,
      best: this._best,
      bestWave: this._bestWave,
      newBest,
      job: null,
      durationS: this._runDuration,
      continued: false,
      coop: true,
      map: this._currentMap(),
      difficulty: this.session.difficulty,
    });
    console.info(`[game] co-op operation concluded — score=${score} wave=${wave}`);
  }

  /** CO-OP host migration: this page now runs the waves. */
  netPromote() {
    if (this.modeId !== 'survival' || !this.mode) return;
    this.session.netRole = 'host';
    this.mode.promote?.();
    const ai = this.ctx.peek('ai');
    if (typeof ai?.setOrderProvider === 'function') ai.setOrderProvider((agent) => this.mode?.orderFor?.(agent) ?? null);
  }

  /** CO-OP: another page outranked this one as host; mirror it from now on. */
  netDemote() {
    if (this.modeId !== 'survival' || !this.mode) return;
    this.session.netRole = 'client';
    this.mode.demote?.();
  }

  /** A bot match or mission decided itself. */
  _finishMatch(result) {
    const m = this.mode;
    this.endSpectate();
    this._releaseInput();
    this.ctx.peek('player')?.setControlEnabled?.(false);
    this.ctx.peek('ui')?.clearPrompt?.();
    this.ctx.peek('ai')?.setOrderProvider?.(null);
    const sum = { ...(m?.summary?.() ?? {}), ...(result ?? {}) };
    sum.mode = sum.mode ?? this.modeId;
    sum.accuracy = this._accuracy();
    sum.map = sum.map ?? this._currentMap();
    this.lastRun = sum;
    this._setState('over');
    this.ctx.events.emit('game:over', sum);
    console.info(`[game] match over — ${sum.mode} winner=${sum.winner} ${sum.scoreEsf ?? ''}-${sum.scoreHostile ?? ''}`);
  }

  /** ui:attract / FLOP.attract — drop everything and go back to the menu. */
  attract() {
    this.ctx.peek('net')?.onGameEnd?.();
    this._endDeathBeat();
    this._teardown();
    this.modeId = null;
    this._releaseInput();
    this.scoring.reset();
    this.scoring.announce();
    this.ctx.peek('player')?.setControlEnabled?.(false);
    this.ctx.peek('ui')?.setObjectives?.([]);
    this._setState('attract');
    console.info('[game] return to base → attract');
  }

  /* ================================================================== */
  /* services for modes                                                  */
  /* ================================================================== */

  aiCaps() {
    return aiCaps(this.ctx);
  }

  /** Command on the net: `mode:announce { text, kind, reply, banner }`. */
  announce(text, opts = {}) {
    this.ctx.events.emit('mode:announce', { text, ...opts });
  }

  /**
   * Put Doug at `pos` (feet, world) facing `yaw` (player convention), full
   * health, full ammo, controls live. `pos` null = the map's first spawn.
   */
  respawnPlayer(pos, yaw = 0, eye = EYE) {
    const p = this.ctx.peek('player');
    if (!p) return;
    this.endSpectate();
    if (pos) {
      const phys = this.ctx.peek('physics');
      const gy = phys?.groundHeight?.(pos.x, pos.z, pos.y + 4);
      const feet = Number.isFinite(gy) && Math.abs(gy - pos.y) < 4 ? gy + 0.03 : pos.y;
      if (typeof p.respawnAt === 'function') p.respawnAt(pos, yaw);
      else {
        p.health?.reset?.(true);
        p.teleport?.({ x: pos.x, y: feet + eye, z: pos.z }, yaw);
      }
    } else {
      p.respawn?.(0);
    }
    if (p.health) {
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    this._releaseInput();
    p.setControlEnabled?.(true);
    this.refill();
  }

  /** Doug is down in a bot match: no input (the gun would still fire), no control. */
  playerDown({ respawn } = {}) {
    const inp = this.ctx.input;
    if (inp && inp.enabled !== false && !this.ctx.config?.deterministic) {
      inp._onBlur?.(); // release held keys so nothing is stuck on respawn
      inp.enabled = false;
      this._inputHeld = true;
    }
    this.ctx.peek('player')?.setControlEnabled?.(false);
    this.ctx.peek('ui')?.clearPrompt?.();
    this._downRespawn = !!respawn;
  }

  _releaseInput() {
    if (this._inputHeld) {
      this.ctx.input.enabled = true;
      this._inputHeld = false;
    }
  }

  /** Top up ammo and equipment. Returns true when something was refilled. */
  refill() {
    const w = this.ctx.peek('weapons');
    if (!w) return false;
    if (typeof w.resupply === 'function') {
      w.resupply();
      return true;
    }
    if (typeof w.selectLoadout === 'function' && w.states instanceof Map) {
      const active = w.activeId;
      for (const id of w.states.keys()) {
        const s = w.states.get(id);
        if (!s?.def) continue;
        s.mag = s.def.magSize;
        s.chambered = true;
        s.reserve = s.def.reserve;
      }
      if (active) w.selectLoadout(active);
      return true;
    }
    return false;
  }

  /** Apply the session loadout (EXPANSION §6), or a legacy kit id. */
  applyLoadout(loadout) {
    this._applyLoadout(loadout, null);
  }

  _applyLoadout(loadout, job) {
    const L = normaliseLoadout(loadout);
    const kit = job ? LOADOUTS[job] : null;
    const wp = this.ctx.peek('weapons');
    if (wp) {
      if (kit) {
        if (typeof wp.setLoadout === 'function') wp.setLoadout({ ...L, primary: kit.weapon });
        else wp.selectLoadout?.(kit.weapon, { refill: true }) || wp.setWeaponImmediate?.(kit.weapon);
      } else if (typeof wp.setLoadout === 'function') {
        wp.setLoadout(L);
      } else if (typeof wp.selectLoadout === 'function') {
        if (!wp.selectLoadout(L.primary, { refill: true })) wp.selectLoadout(wp.primaryId ?? 'carbine', { refill: true });
      }
      // Equipment (src/weapons/equipment.js) takes the lethal / tactical ids.
      if (typeof wp.setLoadout !== 'function') wp.equipment?.setLoadout?.(L.lethal, L.tactical);
    }
    this.refill();
    const p = this.ctx.peek('player');
    if (p?.respawn && this.modeId === 'survival') p.respawn(this._plazaSpawnIndex());
    if (p?.health) {
      p.health.max = this._baseMaxHealth * (kit?.armour ?? 1);
      p.health.value = p.health.max;
      p.health.dead = false;
    }
    p?.setControlEnabled?.(true);
  }

  /* ----------------------------------------------------------- spectate */

  /** Doug is out for the round: watch living teammates (click / space cycles). */
  beginSpectate(team = 'esf') {
    this._spec.team = team;
    this._spec.target = null;
    this._spec.snap = true;
    this.cameraOverride = this._spec;
    this._pickSpectate(0);
  }

  endSpectate() {
    this.cameraOverride = null;
    this._spec.target = null;
  }

  /** Next (dir=1) / previous living teammate. */
  spectateNext(dir = 1) {
    if (!this.cameraOverride) return null;
    this._pickSpectate(dir);
    return this._spec.target?.name ?? null;
  }

  _spectateList() {
    const out = this._specList ?? (this._specList = []);
    out.length = 0;
    const slots = this.mode?.slots ?? [];
    for (const s of slots) if (s.team === this._spec.team && s.alive && s.agent?.alive !== false) out.push(s.agent);
    return out;
  }

  _pickSpectate(dir) {
    const list = this._spectateList();
    if (!list.length) {
      this._spec.target = null;
      return;
    }
    let i = list.indexOf(this._spec.target);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    if (list[i] !== this._spec.target) this._spec.snap = true;
    this._spec.target = list[i];
  }

  spectateName() {
    return this.cameraOverride ? this._spec.target?.name ?? null : null;
  }

  /** Chase camera over the watched teammate's shoulder. */
  _spectateCamera(dt) {
    const sp = this._spec;
    if (sp.target && (sp.target.alive === false || !sp.target.position)) this._pickSpectate(1);
    const cam = this.ctx.camera;
    const t = sp.target;
    if (t) {
      const y = t.yaw ?? 0;
      const fx = Math.sin(y);
      const fz = Math.cos(y);
      const p = t.position;
      sp.want.set(p.x - fx * 2.7 + fz * 0.65, p.y + 2.05, p.z - fz * 2.7 - fx * 0.65);
      sp.wantLook.set(p.x + fx * 6, p.y + 1.35, p.z + fz * 6);
    } else {
      // Nobody left: a high, still view over the objective / the map centre.
      const c = this.mode?.bomb?.state === 'planted' ? this.mode.bomb.pos : this.mode?.data?.centroids?.esf;
      if (c) {
        sp.wantLook.copy(c);
        sp.want.set(c.x + 9, c.y + 14, c.z + 9);
      } else {
        sp.want.copy(cam.position);
        sp.wantLook.set(cam.position.x, cam.position.y, cam.position.z - 1);
      }
    }
    const k = sp.snap ? 1 : 1 - Math.exp(-7 * dt);
    sp.snap = false;
    sp.pos.lerp(sp.want, k);
    sp.look.lerp(sp.wantLook, k);
    if (k === 1) {
      sp.pos.copy(sp.want);
      sp.look.copy(sp.wantLook);
    }
    cam.position.copy(sp.pos);
    cam.lookAt(sp.look);
    cam.updateMatrixWorld();
  }

  /* ================================================================== */
  /* menu data                                                           */
  /* ================================================================== */

  /** Every mode with its menu copy, playability and the maps that host it. */
  availableModes() {
    const maps = this._maps();
    return ['tdm', 'dom', 'hp', 'sd', 'survival'].map((id) => {
      const av = modeAvailable(id, this.ctx);
      return {
        ...MODE_INFO[id],
        available: av.ok,
        why: av.why ?? null,
        maps: maps.filter((m) => mapSupports(m, id)).map((m) => m.id),
      };
    });
  }

  availableMissions() {
    return availableMissions(this._maps());
  }

  /** The running mode's HUD snapshot (preallocated; read, never keep). */
  hudState() {
    if (!this.mode || this.state === 'attract') return null;
    const h = this.mode.hudState?.() ?? null;
    if (h) {
      h.spectating = !!this.cameraOverride;
      h.spectateName = this.spectateName();
      h.over = this.state === 'over';
    }
    return h;
  }

  /** Plant/defuse ticks from the AI (EXPANSION §3), routed to the mode. */
  interact(actor) {
    return this.mode?.interact?.(actor) ?? false;
  }

  /* ================================================================== */
  /* frame                                                               */
  /* ================================================================== */

  update(dt, ctx) {
    if (!this._announced) {
      this._announced = true;
      ctx.events.emit('game:state', { state: this.state });
    }
    // URL-launched sessions (dev/capture) start straight away.
    if (!this._autostarted) {
      this._autostarted = true;
      if (this.session.autostart && this.state === 'attract') this.startSession(this.session);
    }

    if (this._deathBeatUntil && ctx.time.raw >= this._deathBeatUntil) this._endDeathBeat();
    this.scoring.tickCombo(dt);

    if (this._god) {
      const p = ctx.peek('player');
      if (p?.health) {
        if (p.health.value < p.health.max) p.health.value = p.health.max;
        p.health.dead = false;
      }
    }

    if (this.state !== 'play' || !this.mode) return;
    this.mode.update(dt);
    if (this.modeId !== 'survival') {
      // The pause menu hands control back on close; a dead Doug stays dead.
      const p = ctx.peek('player');
      if (this.mode.player && !this.mode.player.alive && p?.controlEnabled) p.setControlEnabled(false);
      const over = this.mode.isOver?.();
      if (over) this._finishMatch(over);
    }
  }

  lateUpdate(dt) {
    if (this.cameraOverride && this.mode) this._spectateCamera(dt);
  }

  /* ================================================================== */
  /* helpers                                                             */
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
  }

  clearAI() {
    this._clearAI();
  }

  /** Kill every live enemy so it DOES count (debug: advance a wave hands-free). */
  _killAllLive(team = null) {
    const ai = this.ctx.peek('ai');
    if (!ai || !Array.isArray(ai.agents)) return 0;
    let n = 0;
    for (const a of [...ai.agents]) {
      if (!a?.alive) continue;
      if (team && (this.mode?.slotOf?.(a)?.team ?? 'hostile') !== team) continue;
      n += 1;
      this._emitLethal(a);
    }
    return n;
  }

  _lethalToAll(ai) {
    if (!Array.isArray(ai.agents)) return;
    for (const a of [...ai.agents]) if (a?.alive) this._emitLethal(a);
  }

  _emitLethal(a) {
    this._synthDamage = true;
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
    if (!job) return null;
    let key = String(job).trim().toLowerCase().replace(/[\s_]+/g, '-');
    key = LOADOUT_ALIASES[key] ?? key;
    return LOADOUTS[key] ? key : null;
  }

  _setState(state) {
    if (this.state === state && this._announced) return;
    this.state = state;
    this.ctx.events.emit('game:state', { state });
    console.info(`[game] state → ${state}`);
  }

  _beginDeathBeat() {
    if (this.ctx.config?.deterministic) return;
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
  /* persistence                                                         */
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

  /** Remember the loadout the LOADOUT screen chose (also rides in every launch). */
  saveLoadout(loadout) {
    this.session.loadout = normaliseLoadout(loadout);
    saveSession({ ...this.session, pending: false });
    return this.session.loadout;
  }

  setDifficulty(d) {
    this.session = normaliseSession({ ...this.session, difficulty: d }, this._maps());
    return this.session.difficulty;
  }

  /* ================================================================== */
  /* debug API (window.FLOP)                                             */
  /* ================================================================== */

  get wave() {
    return this.modeId === 'survival' ? this.mode?.wave ?? 0 : 0;
  }

  _snapshot() {
    const m = this.modeId === 'survival' ? this.mode : null;
    return {
      mode: this.state,
      gameMode: this.modeId,
      wave: m?.wave ?? 0,
      score: this.scoring.score,
      mult: this.scoring.mult,
      kills: m ? this.scoring.kills : this.mode?.player?.kills ?? 0,
      accuracy: this._accuracy(),
      best: this._best,
      aliveEnemies: m?.aliveInWave ?? this.mode?.aliveCount?.('hostile') ?? 0,
      job: this.job,
      durationS: this._runStartedMs ? Math.round((Date.now() - this._runStartedMs) / 1000) : 0,
    };
  }

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
    if (this.modeId !== 'survival' || (this.state !== 'play' && this.state !== 'down')) this.startRun(this._lastJob);
    this._clearAI();
    this.mode.breather = 0;
    this.ctx.peek('player')?.setControlEnabled?.(true);
    this._setState('play');
    this.mode.startWave(target);
    return this.mode.wave;
  }

  _installDebugApi() {
    const self = this;
    try {
      window.FLOP = {
        get state() {
          return self._snapshot();
        },
        start: (job) => self.startRun(job),
        launch: (s) => self.launch(s),
        continueRun: () => self.continueRun(),
        restart: () => self.restart(),
        skipToWave: (n) => self.skipToWave(n),
        god: (b) => self.god(b),
        killAll: (team) => self._killAllLive(team),
        attract: () => self.attract(),
        /** Equip any weapon id (or +1 'frag' / 'flash') for testing. */
        give: (id) => self.ctx.peek('weapons')?.give?.(id) ?? null,
        /** Every weapon id the arsenal knows. */
        get weapons() {
          return self.ctx.peek('weapons')?.allWeaponIds ?? [];
        },
        spectateNext: () => self.spectateNext(1),
        get hud() {
          return self.hudState();
        },
        get modes() {
          return self.availableModes();
        },
        get lastRun() {
          return self.lastRun;
        },
      };
    } catch {
      /* no window (headless build step) */
    }
  }

  dispose() {
    for (const off of this._off ?? []) off();
    this._off = [];
    this._teardown();
    this._endDeathBeat();
    this._pendingHead.clear();
    try {
      if (window.FLOP) delete window.FLOP;
    } catch {
      /* ignore */
    }
  }
}
