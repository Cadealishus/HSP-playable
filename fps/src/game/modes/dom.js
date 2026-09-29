import { TeamMode } from './team.js';
import { makeZone, inZone, tickCapture, zoneProgress, other } from './zones.js';

/**
 * DOMINATION — zones A, B and C. Stand in one to capture it (contested when
 * both teams are inside, faster with more bodies). Every owned zone scores one
 * point per second; first to 200, or the leader at 10:00. Kills do not score.
 */
export class DomMode extends TeamMode {
  static id = 'dom';
  static label = 'DOMINATION';
  static respawn = true;
  static scoreLimit = 200;
  static timeLimit = 600;
  static tickS = 1;

  onStart() {
    const d = this.data.dom;
    this.zones = [makeZone(d.A, 'A'), makeZone(d.B, 'B'), makeZone(d.C, 'C')];
    this._tickAcc = 0;
    this._objs = this.zones.map((z) => ({
      id: z.id,
      label: z.label,
      owner: null,
      progress: 0,
      capTeam: null,
      contested: false,
      active: true,
      pos: z.pos,
      radius: z.radius,
      playerInside: false,
    }));
    this._scratch = [];
    this.say('dom.start', null, 'start', { banner: { title: 'DOMINATION', sub: 'CAPTURE A · B · C' } });
  }

  /** Count bodies per team in each zone. */
  countZones() {
    for (const z of this.zones) {
      z.count.esf = 0;
      z.count.hostile = 0;
    }
    for (const s of this.slots) {
      if (!s.alive || !s.agent?.position) continue;
      for (const z of this.zones) if (inZone(z, s.agent.position)) z.count[s.team] += 1;
    }
    const pp = this.player.alive ? this.playerPos() : null;
    this._playerZone = null;
    if (pp) {
      for (const z of this.zones) {
        if (inZone(z, pp)) {
          z.count[this.player.team] += 1;
          this._playerZone = z;
        }
      }
    }
  }

  tick(dt) {
    this.countZones();
    for (const z of this.zones) {
      const ev = tickCapture(z, dt);
      if (ev?.type === 'captured') {
        this.say(ev.team === this.player.team ? 'dom.captured' : 'dom.lost', { z: z.label }, 'capture', {
          zone: z.id,
          team: ev.team,
        });
      }
    }
    this._tickAcc += dt;
    while (this._tickAcc >= this.constructor.tickS) {
      this._tickAcc -= this.constructor.tickS;
      for (const z of this.zones) if (z.owner) this.score[z.owner] += 1;
    }
  }

  orderFor(agent) {
    const slot = this.slotOf(agent);
    if (!slot) return null;
    const o = slot.order;
    const team = slot.team;
    const pos = agent.position ?? slot.spawnPos;
    // Zones we do not own, nearest first (scratch array, no allocation).
    const todo = this._scratch;
    todo.length = 0;
    for (const z of this.zones) if (z.owner !== team) todo.push(z);
    if (todo.length > 1) {
      todo.sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos));
    }
    const i = slot.teamIndex;
    if (!todo.length || (i % 3 === 2 && todo.length < 3)) {
      // Everything is ours (or this is a designated defender): hold one we own,
      // preferring the one under pressure.
      let pick = null;
      for (const z of this.zones) {
        if (z.owner !== team) continue;
        if (!pick || z.count[other(team)] > pick.count[other(team)]) pick = z;
      }
      pick = pick ?? this.zones[i % 3];
      o.kind = 'defend';
      o.pos.copy(pick.pos);
      o.radius = pick.radius + 5;
      o.targetId = pick.id;
      return o;
    }
    const z = todo[i % Math.min(2, todo.length)];
    o.kind = 'capture';
    o.pos.copy(z.pos);
    o.radius = z.radius * 0.7;
    o.targetId = z.id;
    return o;
  }

  fillHud(h) {
    h.objectives = this._objs;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const o = this._objs[i];
      o.owner = z.owner;
      o.progress = zoneProgress(z);
      o.capTeam = z.capTeam;
      o.contested = z.contested;
      o.playerInside = this._playerZone === z;
    }
  }
}
