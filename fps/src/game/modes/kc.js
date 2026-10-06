import { TeamMode } from './team.js';
import { DogTags } from './tags.js';

/**
 * KILL CONFIRMED — Team Deathmatch where a kill is only worth something once
 * somebody walks over and picks up the dog tags (docs/EXPANSION.md §10.6).
 *
 * Every death on either side drops the victim's tags (src/game/modes/tags.js),
 * glowing in the victim's team colour. Picking up an ENEMY tag confirms the kill
 * (+1 to the picker's team); picking up a FRIENDLY tag denies it (no score, the
 * tag is gone). Tags expire after 30 s. First to 50 confirms, or the leader at
 * 10:00. Bots go for tags near them through ordinary 'capture' orders at the
 * tag; the AI decides how to get there.
 */
export class KcMode extends TeamMode {
  static id = 'kc';
  static label = 'KILL CONFIRMED';
  static respawn = true;
  static scoreLimit = 50;
  static timeLimit = 600;
  /** Pickup radius (m), horizontal. */
  static pickup = 1.35;
  /** A bot goes for a tag inside this range (m). */
  static seek = 22;

  init(ctx, session, host) {
    super.init(ctx, session, host);
    this.tags = new DogTags(ctx);
    this.confirmed = { esf: 0, hostile: 0 };
    this.denied = { esf: 0, hostile: 0 };
    this.player.confirms = 0;
    this.player.denies = 0;
    this._hud.kc = { tags: 0, confirms: 0, denies: 0 };
    return this;
  }

  dispose() {
    this.tags?.dispose();
    this.tags = null;
    super.dispose();
  }

  onStart() {
    this.say('kc.start', { limit: this.limit }, 'start', { banner: { title: 'KILL CONFIRMED', sub: `CONFIRM ${this.limit}` } });
  }

  /** A death: no score yet, the victim's tags hit the ground. */
  onKill(victimTeam, killerTeam, e, victim) {
    if (this.result || !this.tags) return;
    const at = victim?.isPlayer ? this.playerPos() : e?.actor?.position ?? e?.point ?? null;
    if (!at) return;
    const name = victim?.isPlayer ? 'DOUG' : victim?.name ?? '';
    this.tags.drop(victimTeam, at, this.t, name);
  }

  /** Who picks up `tag` this tick: Doug first, then the nearest bot. */
  _picker(tag) {
    const R = this.constructor.pickup;
    const R2 = R * R;
    if (this.player.alive) {
      const p = this.playerPos();
      if (p && this._near(p, tag.pos, R2)) return this.player;
    }
    let best = null;
    let bestD = R2;
    for (const s of this.slots) {
      if (!s.alive || !s.agent?.position) continue;
      const q = s.agent.position;
      const dx = q.x - tag.pos.x;
      const dz = q.z - tag.pos.z;
      const d = dx * dx + dz * dz;
      if (d <= bestD && Math.abs(q.y - tag.pos.y) < 2.2) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  _near(p, q, R2) {
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    return dx * dx + dz * dz <= R2 && Math.abs(p.y - q.y) < 2.2;
  }

  tick() {
    const tags = this.tags;
    if (!tags) return;
    tags.update(this.t, this.ctx.time.raw);
    for (const tag of tags.tags) {
      if (!tag.active) continue;
      const who = this._picker(tag);
      if (who) this.collect(tag, who);
    }
  }

  /** `who` (the player record or a slot) takes `tag`. */
  collect(tag, who) {
    if (!tag.active) return;
    const team = who.team;
    this.tags.take(tag);
    const ui = this.ctx.peek('ui');
    if (team !== tag.team) {
      this.confirmed[team] += 1;
      this.score[team] += 1;
      if (who.isPlayer) {
        this.player.confirms += 1;
        ui?.scorePop?.push?.('KILL CONFIRMED', 100, 'kill');
        if (this.player.confirms === 1 || this.player.confirms % 10 === 0) this.say('kc.confirmUs', { n: this.player.confirms });
      }
      const s = this.score[team];
      if (s === this.limit - 5) this.say(team === 'esf' ? 'tdm.close' : 'tdm.threat');
    } else {
      this.denied[team] += 1;
      if (who.isPlayer) {
        this.player.denies += 1;
        ui?.scorePop?.push?.('KILL DENIED', 50, 'assist');
        if (this.player.denies === 1) this.say('kc.denyUs');
      }
    }
  }

  orderFor(agent) {
    const slot = this.slotOf(agent);
    if (!slot) return null;
    const o = slot.order;
    const pos = agent.position;
    let best = null;
    let bestD = this.constructor.seek * this.constructor.seek;
    if (pos && this.tags) {
      for (const tag of this.tags.tags) {
        if (!tag.active) continue;
        const dx = tag.pos.x - pos.x;
        const dz = tag.pos.z - pos.z;
        // enemy tags are worth a detour; friendly ones only when close
        const d = (dx * dx + dz * dz) * (tag.team === slot.team ? 2.2 : 1);
        if (d < bestD) {
          bestD = d;
          best = tag;
        }
      }
    }
    if (best) {
      o.kind = 'capture';
      o.pos.copy(best.pos);
      o.radius = 0.6;
      o.targetId = `tag${best.i}`;
      return o;
    }
    o.kind = 'hunt';
    o.radius = 0;
    o.targetId = null;
    return o;
  }

  summary() {
    return {
      ...super.summary(),
      kc: true,
      confirms: this.player.confirms,
      denies: this.player.denies,
      confirmedEsf: this.confirmed.esf,
      confirmedHostile: this.confirmed.hostile,
    };
  }

  fillHud(h) {
    const k = h.kc;
    k.tags = this.tags?.count() ?? 0;
    k.confirms = this.player.confirms;
    k.denies = this.player.denies;
  }
}
