import { TeamMode } from './team.js';

/**
 * TEAM DEATHMATCH — 6 v 6, first team to 50 kills (or the leader at 10:00).
 * Every death on one side is a point for the other. Respawns after 4 s at the
 * team spawn furthest from living enemies.
 */
export class TdmMode extends TeamMode {
  static id = 'tdm';
  static label = 'TEAM DEATHMATCH';
  static respawn = true;
  static scoreLimit = 50;
  static timeLimit = 600;

  onStart() {
    this._warned = { esf: false, hostile: false };
    this.say('tdm.start', { limit: this.limit }, 'start', { banner: { title: 'TEAM DEATHMATCH', sub: `FIRST TO ${this.limit}` } });
  }

  onKill(victimTeam, killerTeam) {
    if (this.result) return;
    this.score[killerTeam] += 1;
    const s = this.score[killerTeam];
    if (s === this.limit - 5 && !this._warned[killerTeam]) {
      this._warned[killerTeam] = true;
      this.say(killerTeam === 'esf' ? 'tdm.close' : 'tdm.threat');
    }
  }
}
