import { TeamMode } from './team.js';
import { inZone } from './zones.js';

/**
 * HARDPOINT — one active zone at a time, rotating every 60 s through the map's
 * list. A team scores one point per second while it holds the zone
 * UNCONTESTED (any number of its own inside, none of the other). First to 150,
 * or the leader at 10:00.
 */
export class HpMode extends TeamMode {
  static id = 'hp';
  static label = 'HARDPOINT';
  static respawn = true;
  static scoreLimit = 150;
  static timeLimit = 600;
  static rotateS = 60;

  onStart() {
    this.zones = this.data.hp.map((z, i) => ({
      id: z.id ?? 'P' + (i + 1),
      label: String(i + 1),
      pos: z.pos,
      radius: z.radius ?? 5,
      count: { esf: 0, hostile: 0 },
    }));
    this.active = 0;
    this.rotateIn = this.constructor.rotateS;
    this.holder = null;
    this.contested = false;
    this._acc = { esf: 0, hostile: 0 };
    this._objs = this.zones.map((z) => ({
      id: z.id,
      label: z.label,
      owner: null,
      progress: 0,
      capTeam: null,
      contested: false,
      active: false,
      pos: z.pos,
      radius: z.radius,
      playerInside: false,
    }));
    this.say('hp.start', null, 'start', { banner: { title: 'HARDPOINT', sub: `ZONE ${this.zones[0].label} ACTIVE` } });
  }

  get zone() {
    return this.zones[this.active];
  }

  tick(dt) {
    const z = this.zone;
    this.rotateIn -= dt;
    if (this.rotateIn <= 0) {
      this.active = (this.active + 1) % this.zones.length;
      this.rotateIn += this.constructor.rotateS;
      this.holder = null;
      this.say('hp.move', null, 'move', { banner: { title: 'HARDPOINT MOVED', sub: `ZONE ${this.zone.label}` } });
      return;
    }
    z.count.esf = 0;
    z.count.hostile = 0;
    for (const s of this.slots) if (s.alive && s.agent?.position && inZone(z, s.agent.position)) z.count[s.team] += 1;
    const pp = this.player.alive ? this.playerPos() : null;
    this._playerInside = !!(pp && inZone(z, pp));
    if (this._playerInside) z.count[this.player.team] += 1;

    const e = z.count.esf;
    const h = z.count.hostile;
    this.contested = e > 0 && h > 0;
    const holder = this.contested ? null : e > 0 ? 'esf' : h > 0 ? 'hostile' : null;
    if (holder && holder !== this.holder) {
      this.say(holder === this.player.team ? 'hp.held' : 'hp.lostHold', null, 'hold', { team: holder });
    }
    this.holder = holder;
    if (holder) {
      this._acc[holder] += dt;
      while (this._acc[holder] >= 1) {
        this._acc[holder] -= 1;
        this.score[holder] += 1;
      }
    }
  }

  orderFor(agent) {
    const slot = this.slotOf(agent);
    if (!slot) return null;
    const o = slot.order;
    const z = this.zone;
    if (!z) return super.orderFor(agent);
    if (slot.teamIndex % 4 === 3) {
      // One in four hunts the approaches rather than standing in the circle.
      o.kind = 'attack';
      o.pos.copy(z.pos);
      o.radius = z.radius + 10;
      o.targetId = z.id;
      return o;
    }
    const ours = this.holder === slot.team;
    o.kind = ours ? 'defend' : 'capture';
    o.pos.copy(z.pos);
    o.radius = ours ? z.radius : z.radius * 0.7;
    o.targetId = z.id;
    return o;
  }

  fillHud(h) {
    h.objectives = this._objs;
    h.rotateIn = Math.max(0, this.rotateIn);
    h.holder = this.holder;
    h.contested = this.contested;
    for (let i = 0; i < this._objs.length; i++) {
      const o = this._objs[i];
      const act = i === this.active;
      o.active = act;
      o.owner = act ? this.holder : null;
      o.contested = act && this.contested;
      o.progress = act ? 1 - this.rotateIn / this.constructor.rotateS : 0;
      o.capTeam = o.owner;
      o.playerInside = act && this._playerInside;
    }
  }
}
