import * as THREE from 'three';
import { TeamMode } from './team.js';
import { other } from './zones.js';
import { snapToNav } from './mapdata.js';

/**
 * SEARCH & DESTROY — rounds, one life each, first to 4. Attackers carry one
 * charge (one attacker holds it; it drops where its carrier dies and any
 * attacker can pick it up by walking over it) and plant it at site A or B by
 * holding F for 4 s. The charge then burns a 40 s fuse; defenders defuse it by
 * holding F for 6 s beside it. Sides swap after round 3.
 *
 * A round ends when:
 *   - the charge detonates                              → attackers
 *   - it is defused                                     → defenders
 *   - every defender is dead                            → attackers
 *   - every attacker is dead before the plant           → defenders
 *   - the round clock runs out before the plant         → defenders
 * (every attacker dead AFTER the plant does not end it: defuse or lose.)
 *
 * A dead Doug spectates living teammates until the next round (the host owns
 * the camera: see GameSystem.beginSpectate).
 *
 * PHASES   pre (4 s, bots hold) → live (2:30) → planted (fuse) → post (5 s)
 */
export const SD = {
  roundsToWin: 4,
  halftimeAfter: 3,
  preS: 4,
  roundS: 150,
  fuseS: 40,
  plantS: 4,
  defuseS: 6,
  postS: 5,
  pickupR: 1.5,
  defuseR: 1.8,
  blastRadius: 14,
  blastDamage: 600,
};

export class SdMode extends TeamMode {
  static id = 'sd';
  static label = 'SEARCH & DESTROY';
  static respawn = false;
  static scoreLimit = SD.roundsToWin;
  static timeLimit = 0;

  onStart() {
    this.wins = this.score; // the team score IS rounds won
    this.round = 0;
    this.swapped = false;
    this.phase = 'pre';
    this.phaseT = 0;
    this.sites = {
      A: { id: 'A', label: 'A', pos: this.data.sd.A.pos, radius: this.data.sd.A.radius ?? 3 },
      B: { id: 'B', label: 'B', pos: this.data.sd.B.pos, radius: this.data.sd.B.radius ?? 3 },
    };
    this.bomb = {
      state: 'carried',
      holder: null,
      pos: new THREE.Vector3(),
      site: null,
      fuse: 0,
      plant: 0,
      defuse: 0,
    };
    this._aiInteracts = false;
    this._objs = ['A', 'B'].map((id) => ({
      id,
      label: id,
      owner: null,
      progress: 0,
      capTeam: null,
      contested: false,
      active: true,
      pos: this.sites[id].pos,
      radius: this.sites[id].radius,
      planted: false,
      playerInside: false,
    }));
    this._bombHud = { state: 'carried', carrierIsPlayer: false, carrier: null, site: null, fuse: 0, pos: this.bomb.pos };
    this._prompt = { key: 'F', text: '', sub: '', progress: 0 };
    this.say('sd.start', null, 'start');
    this.startRound();
  }

  /** Base start() spawns everyone once; S&D spawns per round instead. */
  start() {
    this.started = true;
    this.host?.clearAI?.();
    this.host?.applyLoadout?.(this.session.loadout);
    this.onStart();
  }

  /** Rounds decide the match (in tick, after the post-round beat). */
  checkEnd() {}

  attackers() {
    return this.swapped ? other(this.data.sd.attackers) : this.data.sd.attackers;
  }

  defenders() {
    return other(this.attackers());
  }

  spawnSide(team) {
    return team === this.attackers() ? this.data.sd.attackers : other(this.data.sd.attackers);
  }

  /* ---------------------------------------------------------------- rounds */

  startRound() {
    this.round += 1;
    this.phase = 'pre';
    this.phaseT = SD.preS;
    this.message = null;
    this.outcome = null;
    // Everybody off the field (deaths ignored), then everybody back on it.
    for (const s of this.slots) {
      s.alive = false;
      s.agent = null;
    }
    this._slotOf.clear();
    this.host?.clearAI?.();
    this.host?.endSpectate?.();
    this.spawnPlayer();
    for (const s of this.slots) this.spawnBot(s);
    this.host?.refill?.();

    const b = this.bomb;
    b.state = 'carried';
    b.site = null;
    b.fuse = 0;
    b.plant = 0;
    b.defuse = 0;
    b.plantSite = null;
    const att = this.attackers();
    const carriers = this.slots.filter((s) => s.team === att && s.alive);
    if (this.player.team === att) carriers.push(this.player);
    b.holder = carriers.length ? carriers[this.rng.int(0, carriers.length - 1)] : null;
    this.targetSite = this.rng.float() < 0.5 ? 'A' : 'B';
    this._retriever = null;
    this._defuser = null;
    this._lastAliveSaid = false;

    const attacking = this.player.team === att;
    this.say(attacking ? 'sd.attack' : 'sd.defend', { n: this.round }, 'round', {
      banner: {
        title: `ROUND ${this.round}`,
        sub: attacking ? (b.holder === this.player ? 'ATTACKING · YOU HAVE THE CHARGE' : 'ATTACKING') : 'DEFENDING',
      },
    });
  }

  endRound(winner, reason) {
    if (this.phase === 'post') return;
    this.phase = 'post';
    this.phaseT = SD.postS;
    this.score[winner] += 1;
    this.outcome = { winner, reason };
    const us = winner === this.player.team;
    const REASON = {
      detonated: us ? 'TARGET DESTROYED' : 'SITE DESTROYED',
      defused: 'CHARGE DEFUSED',
      eliminated: us ? 'HOSTILES ELIMINATED' : 'ESF ELIMINATED',
      time: 'TIME EXPIRED',
    };
    this.message = REASON[reason] ?? '';
    let key = us ? 'sd.roundWon' : 'sd.roundLost';
    if (reason === 'detonated') key = winner === this.player.team ? 'sd.detonatedUs' : 'sd.detonatedThem';
    else if (reason === 'defused') key = winner === this.player.team ? 'sd.defusedUs' : 'sd.defusedThem';
    else if (reason === 'time') key = winner === this.player.team ? 'sd.timeUs' : 'sd.timeThem';
    this.say(key, null, 'roundEnd', {
      banner: { title: us ? 'ROUND WON' : 'ROUND LOST', sub: `${this.message} · ${this.score.esf} – ${this.score.hostile}`, kind: us ? 'clear' : 'threat' },
    });
  }

  /* ----------------------------------------------------------------- deaths */

  onDeath(e) {
    const slot = e?.actor ? this.slotOf(e.actor) : null;
    const where = e?.actor?.position;
    super.onDeath(e);
    if (slot && this.bomb.state === 'carried' && this.bomb.holder === slot) this.dropBomb(where);
    if (slot && this._defuser === slot) this.bomb.defuse = 0;
  }

  onPlayerDeath(e) {
    const where = this.playerPos();
    super.onPlayerDeath(e);
    if (this.bomb.state === 'carried' && this.bomb.holder === this.player) this.dropBomb(where);
    this.host?.beginSpectate?.(this.player.team);
  }

  dropBomb(where) {
    const b = this.bomb;
    b.state = 'dropped';
    b.holder = null;
    b.plant = 0;
    if (where) snapToNav(this.ctx, b.pos.copy(where), 3);
  }

  /* ------------------------------------------------------------------ tick */

  tick(dt) {
    const b = this.bomb;
    this.phaseT -= dt;
    if (this.phase === 'post') {
      if (this.phaseT <= 0) {
        if (this.score.esf >= SD.roundsToWin || this.score.hostile >= SD.roundsToWin) {
          this.finish(this.score.esf >= SD.roundsToWin ? 'esf' : 'hostile', 'rounds');
          return;
        }
        if (this.round === SD.halftimeAfter && !this.swapped) {
          this.swapped = true;
          this.say('sd.half', null, 'half');
        }
        this.startRound();
      }
      return;
    }
    if (this.phase === 'pre') {
      if (this.phaseT <= 0) {
        this.phase = 'live';
        this.phaseT = SD.roundS;
      }
      this._trackBomb();
      return;
    }

    this._trackBomb();
    const att = this.attackers();
    const def = this.defenders();
    const attAlive = this.aliveCount(att);
    const defAlive = this.aliveCount(def);

    if (this.phase === 'live') {
      this._tickPlant(dt);
      if (this.phase === 'planted') return;
      if (defAlive === 0) return this.endRound(att, 'eliminated');
      if (attAlive === 0) return this.endRound(def, 'eliminated');
      if (this.phaseT <= 0) return this.endRound(def, 'time');
    } else if (this.phase === 'planted') {
      b.fuse = Math.max(0, b.fuse - dt);
      this._tickDefuse(dt);
      if (this.phase !== 'planted') return;
      if (b.fuse <= 0) {
        b.state = 'detonated';
        this.ctx.events.emit('explosion', {
          position: b.pos,
          radius: SD.blastRadius,
          damage: SD.blastDamage,
          owner: null,
          kind: 'charge',
        });
        this.ctx.peek('player')?.addCameraShake?.(0.9);
        return this.endRound(att, 'detonated');
      }
      if (defAlive === 0) return this.endRound(att, 'eliminated');
    }

    if (!this._lastAliveSaid && this.player.alive && this.aliveCount(this.player.team) === 1 && this.teamCount(this.player.team) > 1) {
      this._lastAliveSaid = true;
      this.say('sd.lastAlive');
    }
  }

  /** Carrier position, pick-ups and who fetches a dropped charge. */
  _trackBomb() {
    const b = this.bomb;
    if (b.state === 'carried' && b.holder) {
      const p = b.holder === this.player ? this.playerPos() : b.holder.agent?.position;
      if (p) b.pos.copy(p);
    } else if (b.state === 'dropped') {
      const att = this.attackers();
      let nearest = null;
      let nd = Infinity;
      const pickup = (who, p) => {
        const d = Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
        if (d < SD.pickupR && Math.abs(p.y - b.pos.y) < 2.2) {
          b.state = 'carried';
          b.holder = who;
          return true;
        }
        if (d < nd) {
          nd = d;
          nearest = who;
        }
        return false;
      };
      if (this.player.team === att && this.player.alive) {
        const pp = this.playerPos();
        if (pp && pickup(this.player, pp)) {
          this.host?.announce?.('You have the charge.', { kind: 'bomb', banner: { title: 'CHARGE RECOVERED', sub: 'PLANT AT A OR B' } });
          return;
        }
      }
      for (const s of this.slots) {
        if (s.team !== att || !s.alive || !s.agent?.position) continue;
        if (pickup(s, s.agent.position)) return;
      }
      this._retriever = nearest;
    }
  }

  _siteAt(p) {
    if (!p) return null;
    for (const id of ['A', 'B']) {
      const s = this.sites[id];
      if (Math.hypot(p.x - s.pos.x, p.z - s.pos.z) <= s.radius && Math.abs(p.y - s.pos.y) < 3) return s;
    }
    return null;
  }

  _useHeld() {
    const inp = this.ctx.input;
    return !!(inp && inp.enabled !== false && !inp.frozen && inp.action?.('use'));
  }

  _tickPlant(dt) {
    const b = this.bomb;
    this._playerPrompt = null;
    if (b.state !== 'carried' || !b.holder) return;
    const isPlayer = b.holder === this.player;
    const p = isPlayer ? this.playerPos() : b.holder.agent?.position;
    const site = this._siteAt(p);
    if (!site) {
      b.plant = 0;
      return;
    }
    let working;
    if (isPlayer) {
      working = this._useHeld();
      this._playerPrompt = { text: 'PLANT THE CHARGE', sub: `SITE ${site.label} · HOLD F`, progress: b.plant };
    } else {
      // The AI calls interact() while it plants; an AI that never does is
      // treated as planting whenever its carrier stands on the site.
      working = this._aiInteracts ? this.t - b.holder.interactAt < 1.2 : true;
    }
    if (!working) {
      b.plant = 0;
      return;
    }
    b.plant += dt / SD.plantS;
    if (b.plant >= 1) this.plant(site, p);
  }

  plant(site, p) {
    const b = this.bomb;
    b.state = 'planted';
    b.site = site.id;
    b.plant = 0;
    b.defuse = 0;
    b.fuse = SD.fuseS;
    b.holder = null;
    snapToNav(this.ctx, b.pos.copy(p ?? site.pos), 2);
    this.phase = 'planted';
    const ours = this.attackers() === this.player.team;
    this.say(ours ? 'sd.plantedUs' : 'sd.plantedThem', null, 'planted', {
      banner: { title: 'CHARGE PLANTED', sub: `SITE ${site.label} · ${SD.fuseS} SECONDS`, kind: ours ? 'info' : 'threat' },
    });
  }

  _tickDefuse(dt) {
    const b = this.bomb;
    const def = this.defenders();
    this._playerPrompt = null;
    // The nearest living defender is the one ordered to defuse.
    let nearest = null;
    let nd = Infinity;
    for (const s of this.slots) {
      if (s.team !== def || !s.alive || !s.agent?.position) continue;
      const d = s.agent.position.distanceTo(b.pos);
      if (d < nd) {
        nd = d;
        nearest = s;
      }
    }
    this._defuser = nearest;

    let working = false;
    if (this.player.team === def && this.player.alive) {
      const pp = this.playerPos();
      if (pp && Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z) < SD.defuseR && Math.abs(pp.y - b.pos.y) < 2.2) {
        working = this._useHeld();
        this._playerPrompt = { text: 'DEFUSE THE CHARGE', sub: 'HOLD F', progress: b.defuse };
      }
    }
    if (!working) {
      for (const s of this.slots) {
        if (s.team !== def || !s.alive || !s.agent?.position) continue;
        const p = s.agent.position;
        if (Math.hypot(p.x - b.pos.x, p.z - b.pos.z) >= SD.defuseR) continue;
        if (this._aiInteracts ? this.t - s.interactAt < 1.2 : s === nearest) {
          working = true;
          break;
        }
      }
    }
    if (!working) {
      b.defuse = 0;
      return;
    }
    b.defuse += dt / SD.defuseS;
    if (b.defuse >= 1) {
      b.state = 'defused';
      this.endRound(def, 'defused');
    }
  }

  /** Plant / defuse ticks from the AI, called while an agent works the charge. */
  interact(actor) {
    const slot = this.slotOf(actor);
    if (!slot || !slot.alive) return false;
    this._aiInteracts = true;
    slot.interactAt = this.t;
    return true;
  }

  /* ---------------------------------------------------------------- orders */

  orderFor(agent) {
    const slot = this.slotOf(agent);
    if (!slot) return null;
    const o = slot.order;
    const b = this.bomb;
    o.targetId = null;
    if (this.phase === 'pre' || this.phase === 'post') {
      o.kind = 'hold';
      o.pos.copy(slot.spawnPos);
      o.radius = 3;
      return o;
    }
    const target = this.sites[this.targetSite];
    if (slot.team === this.attackers()) {
      if (b.state === 'carried' && b.holder === slot) {
        o.kind = 'plant';
        o.pos.copy(target.pos);
        o.radius = target.radius * 0.6;
        o.targetId = target.id;
      } else if (b.state === 'dropped' && this._retriever === slot) {
        o.kind = 'attack';
        o.pos.copy(b.pos);
        o.radius = 0.8;
        o.targetId = 'charge';
      } else if (b.state === 'planted') {
        o.kind = 'defend';
        o.pos.copy(b.pos);
        o.radius = 9;
      } else if (slot.teamIndex % 3 === 2) {
        o.kind = 'hunt';
        o.radius = 0;
      } else {
        o.kind = 'attack';
        o.pos.copy(b.state === 'carried' && b.holder ? b.pos : target.pos);
        o.radius = 6;
        o.targetId = target.id;
      }
      return o;
    }
    // defenders
    if (b.state === 'planted') {
      if (this._defuser === slot) {
        o.kind = 'defuse';
        o.pos.copy(b.pos);
        o.radius = 1.2;
        o.targetId = 'charge';
      } else {
        o.kind = 'defend';
        o.pos.copy(b.pos);
        o.radius = 10;
      }
      return o;
    }
    if (slot.teamIndex % 5 === 4) {
      o.kind = 'hunt';
      o.radius = 0;
      return o;
    }
    const site = this.sites[slot.teamIndex % 2 ? 'B' : 'A'];
    o.kind = 'defend';
    o.pos.copy(site.pos);
    o.radius = 8;
    o.targetId = site.id;
    return o;
  }

  /* ------------------------------------------------------------------- HUD */

  fillHud(h) {
    h.objectives = this._objs;
    h.round = this.round;
    h.phase = this.phase;
    h.phaseLeft = Math.max(0, this.phaseT);
    h.timeLeft = this.phase === 'planted' ? this.bomb.fuse : Math.max(0, this.phaseT);
    h.attackers = this.attackers();
    h.attacking = this.attackers() === this.player.team;
    h.message = this.phase === 'post' ? this.message : null;
    h.outcome = this.outcome;
    h.roundsToWin = SD.roundsToWin;
    const b = this.bomb;
    const bh = this._bombHud;
    bh.state = b.state;
    bh.carrierIsPlayer = b.state === 'carried' && b.holder === this.player;
    bh.carrier = b.state === 'carried' && b.holder ? b.holder.name : null;
    bh.site = b.site;
    bh.fuse = b.fuse;
    bh.plant = b.plant;
    bh.defuse = b.defuse;
    h.bomb = bh;
    for (const o of this._objs) {
      o.planted = b.state === 'planted' && b.site === o.id;
      o.owner = null;
      o.progress = o.planted ? b.fuse / SD.fuseS : 0;
      o.playerInside = false;
    }
    const pr = this._playerPrompt;
    if (pr && this.player.alive && (this.phase === 'live' || this.phase === 'planted')) {
      this._prompt.text = pr.text;
      this._prompt.sub = pr.sub;
      this._prompt.progress = pr.progress;
      h.prompt = this._prompt;
    } else {
      h.prompt = null;
    }
  }

  summary() {
    return { ...super.summary(), rounds: this.round };
  }
}
