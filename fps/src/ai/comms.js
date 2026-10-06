/**
 * AI — callouts between bots of one team.
 *
 * A callout is information, and information travels: it is spoken, so it only
 * reaches teammates within VOICE_RANGE of the speaker, plus squadmates within
 * RADIO_RANGE on the squad net, and it arrives after a believable delay
 * (0.6-1.4 s: someone has to say it and someone has to hear it). It carries the
 * SPEAKER'S memory — his Rec position, which may already be out of date — never
 * the target's live transform. No map-wide omniscience.
 *
 * Kinds:
 *   contact   "contact, there"       -> receivers learn a position (callout Rec)
 *   lastknown "last seen there"      -> same, weaker
 *   lost      "lost him"             -> receivers drop their confidence
 *   grenade   "grenade!"             -> receivers learn of a live grenade
 *   help      "need help"            -> receivers investigate the speaker
 */

import * as THREE from 'three';
import { relation } from './teams.js';

export const VOICE_RANGE = 34;
export const RADIO_RANGE = 85;
const QUEUE = 48;

export class Comms {
  constructor(ai) {
    this.ai = ai;
    this.queue = [];
    for (let i = 0; i < QUEUE; i++) {
      this.queue.push({ live: false, at: 0, kind: '', from: null, team: '', squad: null, actor: null, pos: new THREE.Vector3(), origin: new THREE.Vector3(), conf: 0 });
    }
    this.sent = 0;
    this.delivered = 0;
    this.log = []; // recent callouts (debug / tests), bounded
  }

  /**
   * Queue a callout from `from` (an Agent). `actor`/`pos`/`conf` describe the
   * subject from the speaker's memory.
   */
  post(from, kind, actor, pos, conf = 1) {
    const now = this.ai.ctx.time.elapsed;
    let slot = null;
    for (let i = 0; i < QUEUE; i++) if (!this.queue[i].live) { slot = this.queue[i]; break; }
    if (!slot) return false;
    slot.live = true;
    // deterministic delay from speaker id and time: no RNG draw
    const h = Math.sin(from.id * 91.7 + now * 7.3) * 43758.5453;
    slot.at = now + 0.6 + (h - Math.floor(h)) * 0.8;
    slot.kind = kind;
    slot.from = from;
    slot.team = from.team;
    slot.squad = from.squad;
    slot.actor = actor;
    if (pos) slot.pos.copy(pos);
    slot.origin.copy(from.position);
    slot.conf = conf;
    this.sent++;
    this.log.push({ t: now, from: from.name, kind });
    if (this.log.length > 40) this.log.shift();
    return true;
  }

  update(now) {
    for (let i = 0; i < QUEUE; i++) {
      const c = this.queue[i];
      if (!c.live || now < c.at) continue;
      c.live = false;
      // a dead man's last words still get out if they were already said
      const agents = this.ai.agents;
      for (let k = 0; k < agents.length; k++) {
        const r = agents[k];
        if (!r.alive || r === c.from || r.team !== c.team || !r.perception || relation() === 'ffa') continue;
        const d = r.position.distanceTo(c.origin);
        const inVoice = d <= VOICE_RANGE;
        const inRadio = c.squad && r.squad === c.squad && d <= RADIO_RANGE;
        if (!inVoice && !inRadio) continue;
        this.delivered++;
        r.onCallout(c, now);
      }
    }
  }
}
