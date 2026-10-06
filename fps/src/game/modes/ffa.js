import * as THREE from 'three';
import { TeamMode } from './team.js';
import { snapToNav, yawToward } from './mapdata.js';

/**
 * FREE FOR ALL — Doug and seven bots, every man for himself (docs/EXPANSION.md
 * §10.6). First to 30 kills, or the leader at 10:00.
 *
 * TEAMS. The AI runs with the `'ffa'` relation (src/ai/teams.js, set through
 * `ai.setRelation`): every combatant is everybody's enemy, so bots hunt each
 * other as well as Doug. All FFA bots spawn on the 'hostile' side internally,
 * which is what puts their hit capsules on the layer the player's rounds hit
 * and points their fire at the player; the relation does the rest. Friendly
 * fire is therefore ON for everyone (there are no friends).
 *
 * SPAWNS. Both team spawn lists are pooled; a spawn is the candidate furthest
 * from every living actor, lightly penalised if it was just used.
 *
 * SCORE. One point per kill. Deaths without a killer (a fall, his own grenade)
 * score nobody. The HUD shows Doug's place, his score and the leader's, plus a
 * top-3 board; the match report lists the standings.
 */

const FFA_VARIANTS = ['vanguard', 'irregular', 'breacher'];
const FFA_ROLES = ['rifleman', 'smg', 'rifleman', 'shotgun', 'rifleman', 'sniper', 'lmg', 'smg'];

export class FfaMode extends TeamMode {
  static id = 'ffa';
  static label = 'FREE FOR ALL';
  static teams = ['ffa'];
  static respawn = true;
  static ffaBots = 7;
  static teamSize = 8;
  static scoreLimit = 30;
  static timeLimit = 600;
  static respawnDelay = 3;
  /** Keep a respawn this far from anybody when the map allows it. */
  static safeSpawn = 18;

  init(ctx, session, host) {
    super.init(ctx, session, host);
    // Every spawn on the map is everyone's spawn.
    const sp = this.data.spawns;
    this._allSpawns = [...(sp.esf ?? []), ...(sp.hostile ?? [])];
    // Facing: the map's centre (team centroids would point half the field at a wall).
    const c = new THREE.Vector3();
    const cE = this.data.centroids?.esf;
    const cH = this.data.centroids?.hostile;
    if (cE && cH) c.lerpVectors(cE, cH, 0.5);
    this._centre = snapToNav(ctx, c, 6);
    this.data.centroids = { esf: this._centre, hostile: this._centre };
    this._recentAll = [];
    this._living = [];

    /** Standings: the player record and every slot, sorted on read. */
    this.player.score = 0;
    this.player.place = 1;
    this._standings = [this.player, ...this.slots];
    this._sortFn = (a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0);
    const top = [];
    for (let i = 0; i < 3; i++) top.push({ name: '', score: 0, isPlayer: false, place: i + 1, tier: 0, weapon: null });
    this._hud.ffa = {
      place: 1,
      of: this._standings.length,
      score: 0,
      leaderName: '',
      leaderScore: 0,
      leaderIsPlayer: true,
      top,
    };
    this._hud.playerTeam = 'ffa';
    return this;
  }

  /* ------------------------------------------------------------ roster --- */

  _buildRoster() {
    const C = this.constructor;
    for (let i = 0; i < C.ffaBots; i++) {
      this.slots.push({
        team: 'hostile',
        teamIndex: i,
        name: null,
        fallbackName: null,
        variant: FFA_VARIANTS[i % FFA_VARIANTS.length],
        role: FFA_ROLES[i % FFA_ROLES.length],
        agent: null,
        alive: false,
        kills: 0,
        deaths: 0,
        score: 0,
        place: 0,
        respawnAt: 0,
        spawnPos: new THREE.Vector3(),
        order: { kind: 'hunt', pos: new THREE.Vector3(), radius: 0, targetId: null, interact: null },
        interactAt: -1e9,
      });
    }
  }

  start() {
    // Everyone against everyone, before the first bot thinks.
    this.ctx.peek('ai')?.setRelation?.('ffa');
    super.start();
  }

  dispose() {
    this.ctx.peek('ai')?.setRelation?.('teams');
    super.dispose();
  }

  onStart() {
    this.say('ffa.start', { limit: this.limit }, 'start', { banner: { title: this.constructor.label, sub: `FIRST TO ${this.limit}` } });
  }

  /* ------------------------------------------------------------- spawning */

  _allLiving(out) {
    out.length = 0;
    for (const s of this.slots) if (s.alive && s.agent?.alive !== false && s.agent?.position) out.push(s.agent.position);
    if (this.player.alive) {
      const pp = this.playerPos();
      if (pp) out.push(pp);
    }
    return out;
  }

  /** Furthest from every living actor (the spawner is dead, so not counted). */
  pickSpawn() {
    const list = this._allSpawns;
    if (!list.length) return null;
    const living = this._allLiving(this._living);
    const recent = this._recentAll;
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const sp = list[i];
      let near = 80;
      for (const e of living) {
        const d = Math.hypot(e.x - sp.pos.x, e.z - sp.pos.z);
        if (d < near) near = d;
      }
      let score = near + this.rng.float() * 4;
      const r = recent.indexOf(i);
      if (r >= 0) score -= 12 - r * 3;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    recent.unshift(best);
    if (recent.length > 4) recent.length = 4;
    return list[best];
  }

  spawnPlayer() {
    const sp = this.pickSpawn();
    this.player.alive = true;
    this.player.respawnAt = 0;
    if (!sp) {
      this.host?.respawnPlayer?.(null, 0);
      return;
    }
    const pos = this.jitter(sp.pos, this._v2, 0.2, 1.2);
    this.host?.respawnPlayer?.(pos, yawToward(pos, this._centre), 1.66);
  }

  /* --------------------------------------------------------------- deaths */

  /** The standings record of a killer: the player record, a slot, or null. */
  recordOf(k) {
    if (!k) return null;
    if (this.isPlayerActor(k)) return this.player;
    return this.slotOfAny(k);
  }

  onDeath(e) {
    const slot = e?.actor ? this._slotOf.get(e.actor) : null;
    if (!slot) return;
    this._slotOf.delete(e.actor);
    slot.alive = false;
    slot.agent = null;
    slot.deaths += 1;
    const k = this.recordOf(e.killer);
    if (this.constructor.respawn && !this.result) slot.respawnAt = this.t + this.constructor.respawnDelay;
    if (k && k !== slot) {
      k.kills += 1;
      this.onFrag(k, slot, e);
    } else {
      this.onSuicide(slot, e);
    }
  }

  onPlayerDeath(e) {
    if (!this.player.alive) return;
    this.player.alive = false;
    this.player.deaths += 1;
    const killer = e?.killer ?? this.host?.lastAttacker?.() ?? null;
    const ks = killer && !this.isPlayerActor(killer) ? this.slotOfAny(killer) : null;
    this._hud.killer = killer?.name ? String(killer.name).toUpperCase() : null;
    if (this.constructor.respawn && !this.result) {
      this.player.respawnAt = this.t + this.constructor.respawnDelay;
      this.host?.playerDown?.({ respawn: true });
    } else {
      this.host?.playerDown?.({ respawn: false });
    }
    if (ks) {
      ks.kills += 1;
      const w = e?.weapon ?? killer?.weaponId ?? null;
      this.onFrag(ks, this.player, { ...e, weapon: w, killer });
    } else {
      this.onSuicide(this.player, e);
    }
  }

  /** Hook: `killer` (a record) killed `victim` (a record). FFA: a point. */
  onFrag(killer, victim) {
    if (this.result) return;
    killer.score = (killer.score ?? 0) + 1;
    if (killer.score === this.limit - 5) this.say(killer === this.player ? 'ffa.close' : 'ffa.threat', { name: this.nameOf(killer) });
  }

  /** Hook: a death nobody gets credit for. */
  onSuicide() {}

  nameOf(rec) {
    if (!rec) return '';
    if (rec.isPlayer) return 'DOUG';
    return String(rec.name ?? rec.agent?.name ?? rec.fallbackName ?? 'UNKNOWN').toUpperCase();
  }

  /* -------------------------------------------------------------- scoring */

  /** Sorted standings (the shared array, re-sorted in place). */
  standings() {
    const s = this._standings;
    s.sort(this._sortFn);
    for (let i = 0; i < s.length; i++) s[i].place = i + 1;
    return s;
  }

  leader() {
    return this.standings()[0];
  }

  checkEnd() {
    const st = this.standings();
    const top = st[0];
    if (top.score >= this.limit) this.finishFfa(top, 'limit');
    else if (this.constructor.timeLimit && this.timeLeft <= 0) {
      const tie = st.length > 1 && st[1].score === top.score;
      this.finishFfa(tie ? null : top, 'time');
    }
  }

  /** `winner` is a standings record (null: a draw on time). */
  finishFfa(winnerRec, reason) {
    if (this.result) return;
    const winner = !winnerRec ? 'draw' : winnerRec.isPlayer ? 'esf' : 'hostile';
    this.result = { winner, reason, winnerName: winnerRec ? this.nameOf(winnerRec) : null };
    if (winner === 'draw') this.say('match.draw', null, 'result');
    else if (winner === 'esf') this.say('ffa.won', null, 'result');
    else this.say('ffa.lost', { name: this.nameOf(winnerRec) }, 'result');
  }

  summary() {
    const st = this.standings();
    const top = st[0];
    const other = st.find((r) => !r.isPlayer) ?? null;
    return {
      ...super.summary(),
      ffa: true,
      // The report's two numbers: Doug's score and the best score that is not his.
      scoreEsf: this.player.score,
      scoreHostile: top.isPlayer ? other?.score ?? 0 : top.score,
      place: this.player.place,
      of: st.length,
      winnerName: this.result?.winnerName ?? this.nameOf(top),
      standings: st.slice(0, 8).map((r) => ({
        name: this.nameOf(r),
        score: r.score,
        kills: r.kills,
        deaths: r.deaths,
        isPlayer: !!r.isPlayer,
        place: r.place,
      })),
    };
  }

  /* --------------------------------------------------------------- output */

  aliveCount() {
    let n = this.player.alive ? 1 : 0;
    for (const s of this.slots) if (s.alive) n++;
    return n;
  }

  fillHud(h) {
    const f = h.ffa;
    const st = this.standings();
    const top = st[0];
    f.place = this.player.place;
    f.of = st.length;
    f.score = this.player.score;
    // The leader, or (if Doug leads) the man chasing him.
    const lead = top.isPlayer && st.length > 1 ? st[1] : top;
    f.leaderName = this.nameOf(lead);
    f.leaderScore = lead.score;
    f.leaderIsPlayer = top.isPlayer;
    for (let i = 0; i < f.top.length; i++) {
      const r = st[i];
      const t = f.top[i];
      t.name = r ? this.nameOf(r) : '';
      t.score = r ? r.score : 0;
      t.isPlayer = !!r?.isPlayer;
      t.place = i + 1;
      t.tier = r?.tier ?? 0;
    }
    h.scoreEsf = this.player.score;
    h.scoreHostile = lead.score;
    h.kills = this.player.kills;
    h.deaths = this.player.deaths;
    this.fillFfaHud?.(h);
  }
}
