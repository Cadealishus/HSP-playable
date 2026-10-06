const other = (t) => (t === 'esf' ? 'hostile' : 'esf');

/**
 * NET — online PvP: TEAM DEATHMATCH and FREE FOR ALL with real players.
 *
 * `netModeOf(Base, { ffa })` wraps an existing mode class (the bot-match TDM,
 * src/game/modes/tdm.js, handed in by the GameSystem at runtime) so the SAME
 * class runs the match on the host and mirrors it on clients:
 *
 *   host    the mode as written: roster, spawns, bot fill, scoring, limits.
 *           Remote players are extra combatants: their soldiers (puppets.js)
 *           sit in the AI world on their absolute team, bots fight them, and
 *           their deaths arrive as `death` events credited here.
 *   client  no bots and no scoring (`remote`): the mode only spawns and
 *           respawns this player on its team's side, mirrors the host's score
 *           and clock (`applyNet`), and ends when the host says so.
 *
 * TEAMS are absolute in the host's frame ('esf' is the host's team). Every
 * page draws everything RELATIVE to itself: its own team is 'esf' locally
 * (blue chevrons, rounds pass through) and the other is 'hostile'. In FFA
 * every other player is 'hostile' and there are no bots.
 */

export const NET_MODES = ['survival', 'tdm', 'ffa'];
export const NET_MODE_INFO = {
  survival: { id: 'survival', label: 'CO-OP SURVIVAL', blurb: 'Hold the line against the waves together. Downed teammates can be revived.' },
  tdm: { id: 'tdm', label: 'TEAM DEATHMATCH', blurb: 'Two squads of real operators. Bots fill the empty slots if you let them.' },
  ffa: { id: 'ffa', label: 'FREE FOR ALL', blurb: 'Everyone against everyone. Command has stopped pretending there is a plan.' },
};

export function netModeOf(Base, { ffa = false } = {}) {
  return class NetMode extends Base {
    static id = ffa ? 'ffa' : Base.id;
    static label = ffa ? 'FREE FOR ALL' : Base.label;
    static scoreLimit = ffa ? 30 : Base.scoreLimit;
    static timeLimit = Base.timeLimit ?? 600;
    static respawn = true;

    init(ctx, session, host) {
      this.net = ctx.peek('net');
      this.ffa = ffa;
      this.remote = session?.netRole === 'client';
      this.botFill = !ffa && !!this.net?.lobby?.botFill;
      /** peer → { team, name, kills, deaths, alive } (host bookkeeping) */
      this.humans = new Map();
      super.init(ctx, session, host);
      this.player.team = this.net?.myTeam?.() ?? 'esf';
      this.player.name = 'YOU';
      this._hud.playerTeam = this.player.team;
      this.mirror = { a: 0, b: 0, t: this.timeLeft, l: this.limit, run: 0 };
      return this;
    }

    /** Bots only on the host, only with bot fill, never in FFA. */
    _buildRoster() {
      if (this.remote || ffa || !this.botFill) {
        this.slots = [];
        return;
      }
      super._buildRoster();
      // Leave a slot per human on each side.
      const humans = this.net?.teamCounts?.() ?? { esf: 1, hostile: 0 };
      for (const team of ['esf', 'hostile']) {
        let drop = team === 'esf' ? Math.max(0, humans.esf - 1) : humans.hostile;
        for (let i = this.slots.length - 1; i >= 0 && drop > 0; i--) {
          if (this.slots[i].team === team) {
            this.slots.splice(i, 1);
            drop--;
          }
        }
      }
    }

    /** FFA spawns anywhere, as far from every other player as possible. */
    pickSpawn(side, team) {
      if (!ffa) return super.pickSpawn(side, team);
      const all = [...(this.data.spawns.esf ?? []), ...(this.data.spawns.hostile ?? [])];
      if (!all.length) return null;
      const others = this.net?.livingOthers?.() ?? [];
      let best = all[0];
      let bestD = -1;
      for (const sp of all) {
        let near = 80;
        for (const o of others) near = Math.min(near, Math.hypot(o.x - sp.pos.x, o.z - sp.pos.z));
        const d = near + this.rng.float() * 6;
        if (d > bestD) {
          bestD = d;
          best = sp;
        }
      }
      return best;
    }

    spawnPlayer() {
      super.spawnPlayer();
      this.net?.onLocalRespawn?.();
    }

    /* ---------------------------------------------------------- deaths */

    _human(peer) {
      let h = this.humans.get(peer);
      if (!h) {
        h = { team: this.net?.teamOf?.(peer) ?? 'hostile', kills: 0, deaths: 0, alive: true };
        this.humans.set(peer, h);
      }
      return h;
    }

    /** Host: a bot died. Credit a human killer as well as the mode does for slots. */
    onDeath(e) {
      if (this.remote) return;
      const peer = e?.killer?.netPeer;
      if (peer) this._human(peer).kills++;
      super.onDeath(e);
    }

    /** This page's player died (both roles). */
    onPlayerDeath(e) {
      const killer = e?.killer ?? this.host?.lastAttacker?.() ?? null;
      this.net?.reportDeath?.(killer, e);
      if (this.remote) {
        if (!this.player.alive) return;
        this.player.alive = false;
        this.player.deaths++;
        this.player.respawnAt = this.t + this.constructor.respawnDelay;
        this._hud.killer = killer?.name ? String(killer.name).toUpperCase() : null;
        this.host?.playerDown?.({ respawn: true });
        return;
      }
      const peer = killer?.netPeer;
      if (peer) {
        const h = this._human(peer);
        h.kills++;
        if (ffa) {
          this.player.alive = false;
          this.player.deaths++;
          this.player.respawnAt = this.t + this.constructor.respawnDelay;
          this._hud.killer = killer?.name ? String(killer.name).toUpperCase() : null;
          this.host?.playerDown?.({ respawn: true });
          return;
        }
      }
      super.onPlayerDeath({ ...(e ?? {}), killer });
    }

    /** Host: remote player `peer` died, killed by `killerKey` (peer id, 'b'+netId, or ''). */
    netPlayerDeath(peer, killerKey, killerAgent) {
      if (this.remote || this.result) return;
      const v = this._human(peer);
      v.deaths++;
      const self = this.net?.t?.selfId;
      let kTeam = null;
      if (killerKey && killerKey === self) {
        this.player.kills++;
        kTeam = this.player.team;
      } else if (killerKey && this.humans.has(killerKey)) {
        const k = this.humans.get(killerKey);
        k.kills++;
        kTeam = k.team;
      } else if (killerAgent) {
        const ks = this.slotOf?.(killerAgent);
        if (ks) {
          ks.kills++;
          kTeam = ks.team;
        } else kTeam = killerAgent.team ?? null;
      }
      if (ffa) return;
      if (!kTeam || kTeam === v.team) kTeam = other(v.team); // suicide / team kill: a point to the other side
      this.onKill(v.team, kTeam, null, v);
    }

    /* ------------------------------------------------------------- FFA */

    _ffaLeader() {
      let best = { key: this.net?.t?.selfId ?? 'me', kills: this.player.kills };
      for (const [peer, h] of this.humans) if (h.kills > best.kills) best = { key: peer, kills: h.kills };
      return best;
    }

    checkEnd() {
      if (!ffa) return super.checkEnd();
      const lead = this._ffaLeader();
      if (lead.kills >= this.limit) this.finish(lead.key, 'limit');
      else if (this.constructor.timeLimit && this.timeLeft <= 0) this.finish(lead.key, 'time');
    }

    finish(winner, reason) {
      if (!ffa) return super.finish(winner, reason);
      if (this.result) return;
      this.result = { winner: winner === this.net?.t?.selfId ? 'esf' : 'hostile', winnerKey: winner, reason };
      this.say(this.result.winner === 'esf' ? 'match.won' : 'match.lost', null, 'result');
    }

    /* ----------------------------------------------------------- frame */

    update(dt) {
      if (!this.remote) return super.update(dt);
      if (!this.started || this.result) return;
      this.t += dt;
      if (this.constructor.timeLimit) this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (!this.player.alive && this.player.respawnAt > 0 && this.t >= this.player.respawnAt) {
        this.player.respawnAt = 0;
        this.spawnPlayer();
      }
    }

    /** Host → presence `m`: the match for everyone else (small JSON). */
    netState(run) {
      const kd = {};
      const self = this.net?.t?.selfId;
      if (self) kd[self] = [this.player.kills, this.player.deaths];
      for (const [peer, h] of this.humans) kd[peer] = [h.kills, h.deaths];
      return {
        k: ffa ? 'ffa' : 'tdm',
        run,
        a: this.score.esf,
        b: this.score.hostile,
        t: Math.round(this.timeLeft),
        l: this.limit,
        o: this.result ? 1 : 0,
        w: this.result ? (ffa ? this.result.winnerKey : this.result.winner) : null,
        kd,
      };
    }

    /** Client: mirror the host's match (validated by the caller). */
    applyNet(m, self, myTeam) {
      if (!this.remote) return;
      const mine = myTeam === 'hostile';
      this.score.esf = mine ? m.b : m.a;
      this.score.hostile = mine ? m.a : m.b;
      if (Number.isFinite(m.t) && Math.abs(m.t - this.timeLeft) > 2) this.timeLeft = m.t;
      if (Number.isFinite(m.l)) this.limit = m.l;
      const k = m.kd?.[self];
      if (k) {
        this.player.kills = k[0];
        this.player.deaths = Math.max(this.player.deaths, k[1]);
      }
      if (ffa) {
        let best = 0;
        for (const id of Object.keys(m.kd ?? {})) if (id !== self) best = Math.max(best, m.kd[id][0]);
        this.score.esf = this.player.kills;
        this.score.hostile = best;
      }
      if (m.o && !this.result) {
        const winner = ffa ? (m.w === self ? 'esf' : 'hostile') : m.w === 'draw' ? 'draw' : m.w === myTeam ? 'esf' : 'hostile';
        this.result = { winner, reason: 'host' };
      }
    }

    hudState() {
      const h = super.hudState();
      if (ffa) {
        h.scoreEsf = this.player.kills;
        h.scoreHostile = this.remote ? this.score.hostile : this._ffaLeaderOther();
        h.label = 'FREE FOR ALL';
      }
      return h;
    }

    _ffaLeaderOther() {
      let best = 0;
      for (const h of this.humans.values()) best = Math.max(best, h.kills);
      return best;
    }

    summary() {
      const s = super.summary();
      if (ffa) {
        s.scoreEsf = this.player.kills;
        s.scoreHostile = this.remote ? this.score.hostile : this._ffaLeaderOther();
      }
      s.online = true;
      return s;
    }

    /** Host migration: this page runs the match from the mirrored score. */
    promote() {
      if (!this.remote) return;
      this.remote = false;
      this.player.team = 'esf';
    }

    demote() {
      this.remote = true;
    }
  };
}
