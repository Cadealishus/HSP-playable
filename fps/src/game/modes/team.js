import * as THREE from 'three';
import { resolveMapData, snapToNav, yawToward } from './mapdata.js';
import { LinePicker } from './lines.js';
import { other } from './zones.js';
import { DIFFICULTY } from '../session.js';

/**
 * TEAM MODE — the shared chassis of every bot match (docs/EXPANSION.md §2-4).
 *
 * Owns the roster (Doug plus ESF bots versus hostile bots), spawning at team
 * spawns far from living enemies, kill/death accounting, respawn timers, the
 * score/time limits and the preallocated HUD snapshot. A concrete mode fills
 * in `onKill`, `tick`, `orderFor` and its own HUD fields.
 *
 * Bots are real `ai` Agents: `ai.spawn(variant, pos, yaw, { team, role, skill,
 * name })`. A dead Agent is a ragdoll and cannot be revived, so a respawn is a
 * fresh Agent in the same roster SLOT (same callsign, same K/D line).
 *
 * The mode never moves an Agent: it hands out ORDERS through
 * `ai.setOrderProvider` (the host installs `orderFor`) and the AI decides how.
 * Orders are preallocated per slot and mutated, never rebuilt per think.
 */

/** ESF bot callsigns. Serious names on a serious roster. */
export const ESF_NAMES = ['FINCH', 'OKAFOR', 'HALVORSEN', 'DOYLE', 'MARSH', 'PRZYBYLSKI', 'LUND', 'ABERNATHY'];

const HOSTILE_VARIANTS = ['vanguard', 'irregular', 'breacher'];
const ESF_VARIANTS = ['vanguard', 'breacher', 'vanguard'];
/** Per-slot role rotation; only passed when the AI publishes a matching role. */
const ROLE_ROTATION = ['rifleman', 'rifleman', 'smg', 'rifleman', 'sniper', 'lmg'];

/** Role ids the team-capable AI resolves (src/ai roles: unknown ids fall back to rifleman). */
const KNOWN_ROLES = ['rifleman', 'smg', 'shotgun', 'lmg', 'sniper', 'rocket', 'commander', 'heavy'];

/** Player eye height above the feet when standing (src/core/config UNITS). */
const EYE = 1.66;

/** What the running AI supports. Everything here is duck-typed. */
export function aiCaps(ctx) {
  const ai = ctx?.peek?.('ai');
  const orders = typeof ai?.setOrderProvider === 'function';
  let roles = null;
  const r = ai?.roles ?? ai?.ROLES ?? null;
  if (Array.isArray(r)) roles = new Set(r);
  else if (r && typeof r === 'object') roles = new Set(Object.keys(r));
  // The team-capable AI takes `opts.role` on spawn (EXPANSION §2).
  else if (orders) roles = new Set(KNOWN_ROLES);
  return {
    spawn: typeof ai?.spawn === 'function',
    orders,
    // Team support ships with the order provider (EXPANSION §2 + §3). A build
    // may also say so explicitly.
    teams: ai?.caps?.teams ?? ai?.supportsTeams ?? orders,
    roles,
  };
}

export class TeamMode {
  static id = 'team';
  static label = 'TEAM';
  static teams = ['esf', 'hostile'];
  static respawn = true;
  static teamSize = 6;
  static scoreLimit = 50;
  static timeLimit = 600;
  static respawnDelay = 4;

  /**
   * @param ctx      engine context
   * @param session  resolved session (src/game/session.js)
   * @param host     the GameSystem (clearAI, respawnPlayer, spectate, announce …)
   */
  init(ctx, session, host = null) {
    const C = this.constructor;
    this.ctx = ctx;
    this.session = session ?? {};
    this.host = host;
    this.rng = ctx.rng.fork();
    this.lines = new LinePicker(this.rng.fork());
    this.data = resolveMapData(ctx);
    this.caps = aiCaps(ctx);
    this.skill = (DIFFICULTY[this.session.difficulty] ?? DIFFICULTY.regular).skill;

    this.t = 0;
    this.score = { esf: 0, hostile: 0 };
    this.limit = C.scoreLimit;
    this.timeLeft = C.timeLimit;
    this.result = null;
    this.started = false;

    /** Doug. Same shape as a bot slot where it matters. */
    this.player = {
      isPlayer: true,
      team: 'esf',
      name: 'DOUG',
      alive: true,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
      teamIndex: 0,
    };
    this.slots = [];
    this._slotOf = new Map();
    /** Every agent this mode ever spawned → its slot (a dead killer still gets credit). */
    this._everSlot = new WeakMap();
    this._buildRoster();

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._enemyPos = [];
    this._recentSpawn = { esf: [], hostile: [] };

    this._hud = {
      mode: C.id,
      label: C.label,
      scoreEsf: 0,
      scoreHostile: 0,
      limit: this.limit,
      timeLeft: this.timeLeft,
      objectives: [],
      round: null,
      message: null,
      playerTeam: 'esf',
      respawnIn: 0,
      killer: null,
      spectating: false,
      spectateName: null,
      prompt: null,
      alive: { esf: 0, hostile: 0 },
      teamSize: C.teamSize,
      kills: 0,
      deaths: 0,
    };
    return this;
  }

  /* ------------------------------------------------------------ roster --- */

  _buildRoster() {
    const C = this.constructor;
    const esfBots = this.caps.teams ? C.teamSize - 1 : 0;
    const make = (team, i) => ({
      team,
      teamIndex: team === 'esf' ? i + 1 : i,
      name: null,
      fallbackName: team === 'esf' ? ESF_NAMES[i % ESF_NAMES.length] : null,
      variant: (team === 'esf' ? ESF_VARIANTS : HOSTILE_VARIANTS)[i % 3],
      role: ROLE_ROTATION[i % ROLE_ROTATION.length],
      agent: null,
      alive: false,
      kills: 0,
      deaths: 0,
      respawnAt: 0,
      spawnPos: new THREE.Vector3(),
      order: { kind: 'hunt', pos: new THREE.Vector3(), radius: 0, targetId: null, interact: null },
      interactAt: -1e9,
    });
    for (let i = 0; i < esfBots; i++) this.slots.push(make('esf', i));
    for (let i = 0; i < C.teamSize; i++) this.slots.push(make('hostile', i));
    if (!this.caps.teams) {
      console.warn(
        `[mode:${C.id}] the running AI has no team support (ai.setOrderProvider missing): ` +
          'no ESF bots will spawn. This mode is not listed in the menu until it does.'
      );
    }
  }

  slotOf(agent) {
    return this._slotOf.get(agent) ?? null;
  }

  /** The slot an agent belongs or belonged to, alive or not. */
  slotOfAny(agent) {
    return (agent && typeof agent === 'object' && (this._slotOf.get(agent) ?? this._everSlot.get(agent))) || null;
  }

  /** True when `k` (an actor:death killer / damage source) is Doug. */
  isPlayerActor(k) {
    return !!k && (k === 'player' || k.isPlayer === true || k === this.ctx.peek('player'));
  }

  /** The side a team spawns on (S&D swaps it at half time). */
  spawnSide(team) {
    return team;
  }

  /* ------------------------------------------------------------ lifecycle */

  /** Clear the level, place everyone, open the net. */
  start() {
    this.started = true;
    this.host?.clearAI?.();
    this.host?.applyLoadout?.(this.session.loadout);
    this.spawnPlayer();
    for (const s of this.slots) this.spawnBot(s);
    this.onStart();
  }

  /** Hook: announce, set up objectives. */
  onStart() {}

  /** Tear-down hook (the host clears the AI and the order provider). */
  dispose() {
    this._slotOf.clear();
    for (const s of this.slots) s.agent = null;
  }

  /* ------------------------------------------------------------- spawning */

  /** Living actors of `team` (Doug included), positions into `out`. */
  _livingPositions(team, out) {
    out.length = 0;
    for (const s of this.slots) {
      if (s.team === team && s.alive && s.agent?.alive !== false && s.agent?.position) out.push(s.agent.position);
    }
    if (team === this.player.team && this.player.alive) {
      const pp = this.playerPos();
      if (pp) out.push(pp);
    }
    return out;
  }

  playerPos() {
    const p = this.ctx.peek('player');
    const pos = p?.position;
    return pos && Number.isFinite(pos.x) ? pos : null;
  }

  /**
   * Pick a spawn on `side` for a member of `team`: the candidate furthest from
   * the nearest living enemy, lightly penalised if it was just used, ties
   * broken by the mode's RNG. Returns { pos, yaw } (a shared record, copy it).
   */
  pickSpawn(side, team) {
    const list = this.data.spawns[side] ?? this.data.spawns[team] ?? [];
    if (!list.length) return null;
    const enemies = this._livingPositions(other(team), this._enemyPos);
    const recent = this._recentSpawn[side] ?? (this._recentSpawn[side] = []);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
      let near = 80;
      for (const e of enemies) {
        const d = Math.hypot(e.x - sp.pos.x, e.z - sp.pos.z);
        if (d < near) near = d;
      }
      let score = near + this.rng.float() * 6;
      const r = recent.indexOf(i);
      if (r >= 0) score -= 10 - r * 3;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    recent.unshift(best);
    if (recent.length > 3) recent.length = 3;
    return list[best];
  }

  /** A walkable point near `pos`, jittered so a squad does not stack. */
  jitter(pos, out, rMin = 0.6, rMax = 2.4) {
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(rMin, rMax);
    out.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
    return snapToNav(this.ctx, out, 5);
  }

  spawnBot(slot) {
    const ai = this.ctx.peek('ai');
    if (!ai?.spawn) return null;
    if (slot.team === 'esf' && !this.caps.teams) return null;
    const sp = this.pickSpawn(this.spawnSide(slot.team), slot.team);
    if (!sp) return null;
    // Long matches: retire settled ragdolls so the agent list stays bounded.
    if (typeof ai.reapCorpses === 'function') ai.reapCorpses(10);
    else ai._reapCorpses?.(10);
    const pos = this.jitter(sp.pos, new THREE.Vector3());
    slot.spawnPos.copy(pos);
    // World spawn yaws are in the player's convention (forward = -sin, -cos);
    // an Agent faces (sin, cos). Face the other side of the map.
    const face = this.data.centroids?.[other(this.spawnSide(slot.team))];
    const playerYaw = face ? yawToward(pos, face) : sp.yaw;
    const opts = { team: slot.team, skill: this.skill };
    if (slot.name) opts.name = slot.name;
    if (this.caps.roles?.has(slot.role)) opts.role = slot.role;
    this.botSpawnOpts?.(slot, opts);
    let a = null;
    try {
      a = ai.spawn(slot.variant, pos, playerYaw + Math.PI, opts);
    } catch (err) {
      console.warn(`[mode:${this.constructor.id}] spawn failed`, err);
      return null;
    }
    if (!a) return null;
    a.setDifficulty?.(this.skill);
    // Some AI builds read `.team` straight off the agent; keep it truthful.
    if (a.team !== slot.team) {
      try {
        a.team = slot.team;
      } catch {
        /* read-only: the AI owns it */
      }
    }
    // First spawn: the AI names the man (its callsign pools); he keeps it.
    if (!slot.name) slot.name = a.name ?? slot.fallbackName;
    if (!a.name && slot.name) a.name = slot.name;
    slot.agent = a;
    slot.alive = true;
    slot.respawnAt = 0;
    slot.interactAt = -1e9;
    this._slotOf.set(a, slot);
    this._everSlot.set(a, slot);
    this.onBotSpawned?.(slot, a);
    return a;
  }

  /** Doug at an ESF spawn (or the side ESF spawns on), full health, full ammo. */
  spawnPlayer() {
    const sp = this.pickSpawn(this.spawnSide(this.player.team), this.player.team);
    this.player.alive = true;
    this.player.respawnAt = 0;
    if (!sp) {
      this.host?.respawnPlayer?.(null, 0);
      return;
    }
    const pos = this.jitter(sp.pos, this._v2, 0.2, 1.2);
    const face = this.data.centroids?.[other(this.spawnSide(this.player.team))];
    const yaw = face ? yawToward(pos, face) : sp.yaw;
    this.host?.respawnPlayer?.(pos, yaw, EYE);
  }

  /* --------------------------------------------------------------- deaths */

  /** Which team scored a death. Contract payload first, then what we know. */
  killerTeamOf(e, victimTeam) {
    if (e?.killerTeam === 'esf' || e?.killerTeam === 'hostile') return e.killerTeam;
    const k = e?.killer;
    if (k) {
      if (k === 'player' || k.isPlayer === true || k === this.ctx.peek('player')) return 'esf';
      const ks = this.slotOfAny(k);
      if (ks) return ks.team;
      if (k.team === 'esf' || k.team === 'hostile') return k.team;
    }
    // The pre-team AI: only Doug (or his grenades) kills hostiles.
    return other(victimTeam);
  }

  /** `actor:death` (forwarded by the host). */
  onDeath(e) {
    const slot = e?.actor ? this._slotOf.get(e.actor) : null;
    if (!slot) return;
    this._slotOf.delete(e.actor);
    slot.alive = false;
    slot.agent = null;
    slot.deaths += 1;
    const kTeam = this.killerTeamOf(e, slot.team);
    const k = e.killer;
    if (k === 'player' || k?.isPlayer === true || k === this.ctx.peek('player') || (!k && slot.team === 'hostile' && !e.killerTeam)) {
      this.player.kills += 1;
    } else if (k) {
      const ks = this.slotOfAny(k);
      if (ks) ks.kills += 1;
    }
    if (this.constructor.respawn && !this.result) slot.respawnAt = this.t + this.constructor.respawnDelay;
    if (kTeam !== slot.team) this.onKill(slot.team, kTeam, e, slot);
  }

  /** `player:death` (forwarded by the host). */
  onPlayerDeath(e) {
    if (!this.player.alive) return;
    this.player.alive = false;
    this.player.deaths += 1;
    const killer = e?.killer ?? this.host?.lastAttacker?.() ?? null;
    const ks = killer ? this.slotOfAny(killer) : null;
    if (ks) ks.kills += 1;
    this._hud.killer = killer?.name ? String(killer.name).toUpperCase() : null;
    const kTeam = ks?.team ?? 'hostile';
    if (this.constructor.respawn && !this.result) {
      this.player.respawnAt = this.t + this.constructor.respawnDelay;
      this.host?.playerDown?.({ respawn: true });
    } else {
      this.host?.playerDown?.({ respawn: false });
    }
    if (kTeam !== 'esf') this.onKill('esf', kTeam, e, this.player);
  }

  /** Hook: a death on `victimTeam` credited to `killerTeam`. */
  onKill(victimTeam, killerTeam) {}

  /* --------------------------------------------------------------- update */

  update(dt) {
    if (!this.started || this.result) return;
    this.t += dt;
    const C = this.constructor;
    if (C.timeLimit) this.timeLeft = Math.max(0, this.timeLeft - dt);

    // Agents can vanish without a death event (a debug clear); drop them.
    for (const s of this.slots) {
      if (s.alive && s.agent && s.agent.alive === false) {
        this.onDeath({ actor: s.agent });
      }
    }
    if (C.respawn) {
      for (const s of this.slots) {
        if (!s.alive && s.respawnAt > 0 && this.t >= s.respawnAt) {
          s.respawnAt = 0;
          this.spawnBot(s);
        }
      }
      if (!this.player.alive && this.player.respawnAt > 0 && this.t >= this.player.respawnAt) {
        this.player.respawnAt = 0;
        this.spawnPlayer();
      }
    }
    this.tick(dt);
    if (!this.result) this.checkEnd();
  }

  /** Hook: per-frame objective logic. */
  tick(dt) {}

  /** Score limit, then the clock. */
  checkEnd() {
    const s = this.score;
    if (s.esf >= this.limit || s.hostile >= this.limit) {
      this.finish(s.esf >= this.limit && s.esf >= s.hostile ? 'esf' : 'hostile', 'limit');
    } else if (this.constructor.timeLimit && this.timeLeft <= 0) {
      this.finish(s.esf > s.hostile ? 'esf' : s.hostile > s.esf ? 'hostile' : 'draw', 'time');
    }
  }

  finish(winner, reason) {
    if (this.result) return;
    this.result = { winner, reason };
    const key = winner === 'draw' ? 'match.draw' : winner === this.player.team ? 'match.won' : 'match.lost';
    this.say(key, null, 'result');
  }

  /** `{ winner }` once decided, else null. */
  isOver() {
    return this.result;
  }

  /** Summary for `game:over`. */
  summary() {
    return {
      mode: this.constructor.id,
      label: this.constructor.label,
      winner: this.result?.winner ?? null,
      reason: this.result?.reason ?? null,
      scoreEsf: this.score.esf,
      scoreHostile: this.score.hostile,
      limit: this.limit,
      kills: this.player.kills,
      deaths: this.player.deaths,
      durationS: Math.round(this.t),
      map: this.session.map,
      difficulty: this.session.difficulty,
    };
  }

  /* --------------------------------------------------------------- orders */

  /** Default: everybody hunts. */
  orderFor(agent) {
    const slot = this._slotOf.get(agent);
    if (!slot) return null;
    const o = slot.order;
    o.kind = 'hunt';
    o.radius = 0;
    o.targetId = null;
    return o;
  }

  /** Plant/defuse ticks from the AI (modes with objectives override). */
  interact(actor) {
    const slot = this._slotOf.get(actor);
    if (slot) slot.interactAt = this.t;
    return false;
  }

  /* --------------------------------------------------------------- output */

  say(key, vars, kind = 'info', extra = null) {
    const line = this.lines.pick(key, vars);
    if (!line) return;
    this.host?.announce?.(line.text, { kind, reply: line.reply, key, ...(extra ?? {}) });
  }

  aliveCount(team) {
    let n = 0;
    for (const s of this.slots) if (s.team === team && s.alive) n++;
    if (team === this.player.team && this.player.alive) n++;
    return n;
  }

  teamCount(team) {
    let n = 0;
    for (const s of this.slots) if (s.team === team) n++;
    if (team === this.player.team) n++;
    return n;
  }

  /** Fill and return the preallocated HUD snapshot. */
  hudState() {
    const h = this._hud;
    h.scoreEsf = this.score.esf;
    h.scoreHostile = this.score.hostile;
    h.limit = this.limit;
    h.timeLeft = this.timeLeft;
    h.respawnIn = !this.player.alive && this.player.respawnAt > 0 ? Math.max(0, this.player.respawnAt - this.t) : 0;
    h.alive.esf = this.aliveCount('esf');
    h.alive.hostile = this.aliveCount('hostile');
    h.kills = this.player.kills;
    h.deaths = this.player.deaths;
    h.playerAlive = this.player.alive;
    this.fillHud(h);
    return h;
  }

  /** Hook: mode-specific HUD fields. */
  fillHud(h) {}
}
