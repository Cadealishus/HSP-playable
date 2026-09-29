import * as THREE from 'three';
import { Scoring } from '../scoring.js';
import {
  BREATHER_S,
  concurrentCap,
  waveGoal,
  waveIntensity,
  waveBonus,
  roleFor,
} from '../waves.js';
import { DIFFICULTY } from '../session.js';
import { snapToNav } from './mapdata.js';

/**
 * SURVIVAL — OPERATION TOTAL CONFIDENCE, the wave holdout (the game's original
 * loop, moved here from src/game/index.js without behaviour loss: scoring,
 * streak multiplier, the one continue, best score and best wave).
 *
 * Doug holds the map's objective against escalating waves until he goes down.
 * The host (GameSystem) owns the state machine (play → down → over) and every
 * shared service; this class owns the waves and the score.
 *
 * What changed from the original loop: waves escalate harder (waves.js), from
 * wave 3 specialists join (marksmen, shotgunners, LMG gunners, heavies, when
 * the AI publishes those roles), and the breather between waves is a real
 * break with a resupply.
 *
 * EVENTS EMITTED (unchanged)
 *   game:wave {wave,count} · game:waveClear {wave,bonus,resupplied}
 *   game:score · game:mult · game:multiKill · game:continueOffer · game:over
 */

/** Scoring's internal channel names → the bus event names. */
const SCORING_EVENTS = { score: 'game:score', mult: 'game:mult', multiKill: 'game:multiKill' };

/** The town square in level coordinates (converted through world.levelToWorld). */
const SQUARE_LEVEL_X = -1.7;
const SQUARE_LEVEL_Z = 8.6;

/** Signal-flare amber in rough linear space. */
const FLARE = { r: 1.0, g: 0.46, b: 0.16 };

const VARIANTS = ['vanguard', 'irregular', 'breacher'];

/** Weapon classes the specialist roles ask the AI for, when defs publish them. */
const ROLE_CLASS = { sniper: /sniper|marksman|dmr/, shotgun: /shotgun/, lmg: /lmg|machine/, heavy: /lmg|machine/ };

export class SurvivalMode {
  static id = 'survival';
  static label = 'SURVIVAL';
  static teams = ['esf', 'hostile'];
  static respawn = false;

  init(ctx, session, host) {
    this.ctx = ctx;
    this.session = session ?? {};
    this.host = host;
    this.rng = ctx.rng.fork();
    this.offset = (DIFFICULTY[this.session.difficulty] ?? DIFFICULTY.regular).offset;

    this.wave = 0;
    this.continueUsed = false;
    this.waveActive = false;
    this.waveGoal = 0;
    this.waveSpawned = 0;
    this.aliveInWave = 0;
    this.breather = 0;
    this.result = null;

    this.scoring = host?.scoring ?? new Scoring((type, data) => ctx.events.emit(SCORING_EVENTS[type] ?? 'game:score', data));
    this._squarePos = null;
    this._squareObj = null;
    this._hud = { mode: 'survival', label: 'SURVIVAL', wave: 0, score: 0, objectives: null, breather: 0 };
    this._v = new THREE.Vector3();
    return this;
  }

  /* --------------------------------------------------------------- run */

  start() {
    this.wave = 0;
    this.continueUsed = false;
    this.waveActive = false;
    this.breather = 0;
    this.aliveInWave = 0;
    this.scoring.reset();
    this.scoring.announce();
    this.markSquare(true);
    this.startWave(1);
  }

  /** REQUEST ONE (1) MORE CHANCE: the same wave restarts, score kept. */
  continueRun() {
    this.continueUsed = true;
    this.aliveInWave = 0;
    this.startWave(this.wave);
  }

  /** Player died. Returns 'down' (a continue is on offer) or 'over'. */
  onPlayerDeath() {
    this.scoring.resetMult(); // streak collapses on death, score survives
    return this.continueUsed ? 'over' : 'down';
  }

  stop() {
    this.waveActive = false;
    this.breather = 0;
  }

  dispose() {
    this.stop();
    this.markSquare(false);
  }

  /* ------------------------------------------------------------- waves */

  startWave(n) {
    this.wave = n;
    this.waveActive = true;
    this.breather = 0;
    this.waveSpawned = 0;
    this.aliveInWave = 0;
    this.waveGoal = waveGoal(n);
    this.ctx.events.emit('game:wave', { wave: n, count: this.waveGoal });
    this.refill();
  }

  /** Keep the fight topped up to the concurrent cap, up to the wave's total. */
  refill() {
    if (!this.waveActive || this.breather > 0) return;
    const ai = this.ctx.peek('ai');
    if (!ai) return;
    const remaining = this.waveGoal - this.waveSpawned;
    const room = concurrentCap(this.wave) - this.aliveInWave;
    const want = Math.min(remaining, room);
    if (want <= 0) return;
    const intensity = waveIntensity(this.wave, this.offset);

    // Specialists need the AI's role support (EXPANSION §2). Without it the
    // AI's own wave spawner runs exactly as before.
    const roles = this.host?.aiCaps?.()?.roles;
    let spawned = 0;
    if (roles && roles.size && typeof ai.spawn === 'function' && ai.grid) {
      spawned = this.spawnRoles(ai, want, intensity, roles);
    } else if (typeof ai.spawnWave === 'function') {
      const r = ai.spawnWave({ count: want, intensity, waveIndex: this.wave });
      spawned = Number.isFinite(r) ? r : want;
    } else if (typeof ai.populate === 'function') {
      if (this.waveSpawned > 0) return;
      const before = ai.agents?.length ?? 0;
      const made = ai.populate({ squads: Math.max(1, Math.ceil(this.waveGoal / 3)), perSquad: 3 });
      spawned = Number.isFinite(made) ? made : Math.max(0, (ai.agents?.length ?? 0) - before);
      if (spawned > 0) this.waveGoal = spawned;
    }
    this.waveSpawned += spawned;
    this.aliveInWave += spawned;
  }

  /**
   * Spawn `count` hostiles with the wave's specialist mix, at the world's spawn
   * points furthest from Doug (the same "spawn to be found" rule as
   * ai.spawnWave), in squads of four on a patrol through nearby points.
   */
  spawnRoles(ai, count, intensity, roles) {
    const world = this.ctx.peek('world');
    const spawns = world?.spawnPoints ?? [];
    if (!spawns.length) return 0;
    if (typeof ai.reapCorpses === 'function') ai.reapCorpses(14);
    else ai._reapCorpses?.(14);
    const pp = this.ctx.peek('player')?.position ?? this.ctx.camera.position;
    let ranked = spawns
      .map((s) => ({ s, d: s.position.distanceTo(pp) }))
      .sort((a, b) => b.d - a.d)
      .filter((e) => e.d > 16);
    if (!ranked.length) ranked = spawns.map((s) => ({ s, d: 0 }));
    const weapons = this._roleWeapons();
    let made = 0;
    let squad = null;
    for (let k = 0; k < count; k++) {
      const idx = this.waveSpawned + k;
      if (k % 4 === 0) squad = ai.createSquad?.() ?? null;
      const anchor = ranked[((k / 4) | 0) % ranked.length].s;
      const route = [anchor.position.clone()];
      for (const e of ranked) {
        if (e.s !== anchor && route.length < 3) route.push(e.s.position.clone());
      }
      const a0 = this.rng.range(0, Math.PI * 2);
      const r0 = this.rng.range(0.8, 3.2);
      const p = new THREE.Vector3(anchor.position.x + Math.cos(a0) * r0, anchor.position.y, anchor.position.z + Math.sin(a0) * r0);
      snapToNav(this.ctx, p, 6);
      let role = roleFor(this.wave, idx);
      if (!roles.has(role)) role = roles.has('rifleman') ? 'rifleman' : null;
      const opts = { team: 'hostile', skill: intensity, patrol: route };
      if (role) opts.role = role;
      if (role && weapons[role]) opts.weapon = weapons[role];
      let a = null;
      try {
        a = ai.spawn(VARIANTS[(this.wave * 2 + idx) % VARIANTS.length], p, anchor.yaw + this.rng.signed() * 0.7, opts);
      } catch (err) {
        console.warn('[survival] spawn failed', err);
      }
      if (!a) continue;
      a.setDifficulty?.(intensity);
      squad?.add?.(a);
      made++;
    }
    return made;
  }

  /** role → weapon id from the weapon defs, when the defs publish one. */
  _roleWeapons() {
    if (this._rw) return this._rw;
    const info = this.ctx.peek('weapons')?.loadoutInfo?.() ?? [];
    const out = {};
    for (const [role, re] of Object.entries(ROLE_CLASS)) {
      const w = info.find((x) => re.test(String(x.class ?? '').toLowerCase()));
      if (w) out[role] = w.id;
    }
    this._rw = out;
    return out;
  }

  checkClear() {
    if (!this.waveActive || this.waveGoal <= 0) return;
    if (this.waveSpawned >= this.waveGoal && this.aliveInWave <= 0) this.waveCleared();
  }

  waveCleared() {
    this.waveActive = false;
    const bonus = waveBonus(this.wave) * this.scoring.mult;
    this.scoring.addBonus(bonus);
    // A real break: ammo and equipment topped up for the next wave.
    const resupplied = this.host?.refill?.() ?? false;
    this.ctx.events.emit('game:waveClear', { wave: this.wave, bonus, resupplied, breather: BREATHER_S });
    this.breather = BREATHER_S;
    this.clearBeat();
    console.info(`[game] wave ${this.wave} held +${bonus} — breather ${BREATHER_S}s`);
  }

  /** A signal flare over the objective and a distant thump (never in capture). */
  clearBeat() {
    if (this.ctx.config?.deterministic) return;
    const fx = this.ctx.peek('fx');
    const pos = this.squarePos();
    if (fx?.lights?.flash && pos) fx.lights.flash(pos.x, pos.y + 9, pos.z, FLARE.r, FLARE.g, FLARE.b, 150, 0.7, 3.8, 26, 3);
    this.ctx.peek('player')?.addCameraShake?.(0.3);
  }

  /* ------------------------------------------------------------ deaths */

  /** `actor:death` of a hostile in the live wave. */
  onDeath(e, headshot) {
    if (!this.waveActive) return false;
    this.aliveInWave = Math.max(0, this.aliveInWave - 1);
    this.scoring.kill(!!headshot);
    this.refill();
    this.checkClear();
    return true;
  }

  /* ------------------------------------------------------------ frame */

  update(dt) {
    if (this.breather > 0) {
      this.breather -= dt;
      if (this.breather <= 0) {
        this.breather = 0;
        this.startWave(this.wave + 1);
      }
      return;
    }
    if (this.waveActive) {
      this.scoring.update(dt);
      this.refill();
      this.checkClear();
    }
  }

  orderFor() {
    return null; // hostiles run their own hunt behaviour
  }

  interact() {
    return false;
  }

  isOver() {
    return this.result;
  }

  hudState() {
    const h = this._hud;
    h.wave = this.wave;
    h.score = this.scoring.score;
    h.breather = this.breather;
    return h;
  }

  /* ------------------------------------------------------- objective */

  markSquare(on) {
    const ui = this.ctx.peek('ui');
    if (typeof ui?.setObjectives !== 'function') return;
    const pos = on ? this.squarePos() : null;
    if (!pos) {
      ui.setObjectives([]);
      return;
    }
    if (!this._squareObj) {
      this._squareObj = { position: pos.clone(), label: 'A', name: 'DEFEND' };
      this._squareObj.position.y += 1.6;
    }
    ui.setObjectives([this._squareObj]);
  }

  /** The objective in world space: the map's survival zone, else its objective, else the town square. */
  squarePos() {
    if (this._squarePos) return this._squarePos;
    const world = this.ctx.peek('world');
    const zone = world?.objectives?.survival;
    const zp = zone?.pos ?? zone?.position;
    if (zp) return (this._squarePos = new THREE.Vector3(zp.x, zp.y, zp.z));
    if (world?.mapId && world.mapId !== 'town' && world.objective?.position) {
      return (this._squarePos = world.objective.position.clone());
    }
    if (typeof world?.levelToWorld !== 'function') return null;
    const v = world.levelToWorld(SQUARE_LEVEL_X, 0, SQUARE_LEVEL_Z);
    const gy = world.groundHeight?.(v.x, v.z);
    if (Number.isFinite(gy)) v.y = gy;
    return (this._squarePos = v);
  }
}
