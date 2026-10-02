/**
 * AI — squad coordination.
 *
 * The squad exists to stop four individually-sensible soldiers from behaving
 * like one four-headed idiot:
 *   • PEEK TOKENS — only about half the squad leans out at once, rotated;
 *   • FLANK TOKENS — at most `maxFlankers` (1, or 2 with a commander or a big
 *     squad) men are off on a flank at a time, with a cooldown between flanks;
 *   • GRENADES are rationed across the squad;
 *   • a COMMANDER (role 'commander') runs the squad better: every few seconds he
 *     reads the squad's shared picture and hands the flank token to the man best
 *     placed to use it, and calls a grenade on a target that has gone to ground.
 *
 * What the squad does NOT do any more is share a live contact across the map:
 * information moves between bots only as callouts (comms.js), with range and
 * delay.
 */

let _nextSquad = 1;

export class Squad {
  constructor(rng) {
    this.id = _nextSquad++;
    this.members = [];
    this.rng = rng;
    this.peekTokens = 1;
    this.peekHolders = new Set();
    this.peekTimer = 0;
    this.grenadeCooldown = 6;
    /** current flankers (Agents) */
    this.flankers = [];
    this.maxFlankers = 1;
    this.flankCooldown = 3;
    this.leader = null;
    this._cmdTimer = 2;
    /** legacy single-flanker view */
    this.flanker = null;
  }

  add(agent) {
    agent.squad = this;
    this.members.push(agent);
    this.peekTokens = Math.max(1, Math.round(this.members.length * 0.5));
    if (agent.role === 'commander' && !this.leader) this.leader = agent;
    this.maxFlankers = this.leader || this.members.length >= 5 ? 2 : 1;
    return agent;
  }

  get alive() {
    let n = 0;
    for (const m of this.members) if (m.alive) n++;
    return n;
  }

  /** Called once per frame by the AI system. */
  update(dt) {
    this.grenadeCooldown -= dt;
    this.flankCooldown -= dt;
    for (let i = this.flankers.length - 1; i >= 0; i--) {
      const f = this.flankers[i];
      if (!f.alive || f.brain?.state !== 'flank') {
        this.flankers.splice(i, 1);
        this.flankCooldown = Math.max(this.flankCooldown, 2.5);
      }
    }
    this.flanker = this.flankers[0] ?? null;
    if (this.leader && !this.leader.alive) this.leader = null;
    if (this.leader) this._command(dt);

    // rotate the peek tokens so the same man is not always exposed
    this.peekTimer -= dt;
    if (this.peekTimer <= 0) {
      this.peekTimer = 1.1 + this.rng.float() * 1.2;
      this.peekHolders.clear();
    }
  }

  /** Ask to lean out of cover. Only `peekTokens` members may at once. */
  requestPeek(agent) {
    if (this.peekHolders.has(agent.id)) return true;
    if (this.peekHolders.size >= this.peekTokens) return false;
    this.peekHolders.add(agent.id);
    return true;
  }

  releasePeek(agent) {
    this.peekHolders.delete(agent.id);
  }

  /** How many men are pinning the target while someone moves. */
  engaged(except = null) {
    let n = 0;
    for (const m of this.members) {
      if (m === except || !m.alive) continue;
      const s = m.brain?.state;
      if (s === 'engage' || s === 'peek' || s === 'take_cover' || s === 'suppressed') n++;
    }
    return n;
  }

  /** A flank token is free, the cooldown is over, and someone else is holding attention. */
  canFlank(agent) {
    if (this.flankers.includes(agent)) return true;
    if (this.flankers.length >= this.maxFlankers || this.flankCooldown > 0) return false;
    return this.engaged(agent) >= 1;
  }

  claimFlank(agent) {
    if (this.flankers.includes(agent)) return true;
    if (this.flankers.length >= this.maxFlankers) return false;
    this.flankers.push(agent);
    this.flanker = this.flankers[0];
    this.flankCooldown = 4;
    agent.bark('flank');
    return true;
  }

  releaseFlank(agent) {
    const i = this.flankers.indexOf(agent);
    if (i >= 0) this.flankers.splice(i, 1);
    this.flanker = this.flankers[0] ?? null;
  }

  requestGrenade() {
    if (this.grenadeCooldown > 0) return false;
    this.grenadeCooldown = 14 + this.rng.float() * 12;
    return true;
  }

  /**
   * The commander's tick: better decisions than any one man makes alone. Uses
   * only what the squad's members themselves remember.
   */
  _command(dt) {
    this._cmdTimer -= dt;
    if (this._cmdTimer > 0) return;
    this._cmdTimer = 2.5;
    const L = this.leader;
    const now = L.ctx.time.elapsed;
    const rec = L.perception?.target;
    if (!rec || !rec.acquired || rec.conf < 0.5) return;
    // target gone static (dug in) for a while -> flank him and flush him out
    const static_ = now - rec.acquiredT > 3 && Math.hypot(rec.vel.x, rec.vel.z) < 0.8;
    if (static_ && this.flankers.length < this.maxFlankers && this.flankCooldown <= 0) {
      // the man whose own position makes the widest angle on the target, not
      // already busy flanking, not the one holding his attention
      let best = null, bestS = -Infinity;
      for (const m of this.members) {
        if (!m.alive || m === L || this.flankers.includes(m) || !m.brain) continue;
        const d = m.position.distanceTo(rec.pos);
        if (d < 8 || d > 50) continue;
        const s = m.health * 0.01 + m.roleDef.aggression - Math.abs(d - 20) * 0.02;
        if (s > bestS) { bestS = s; best = m; }
      }
      if (best) {
        best.brain.flankOrder = now;
        L.radio('flank');
      }
    }
    // dug in behind cover at grenade range -> order a frag
    if (static_ && rec.visFrac < 0.75) {
      for (const m of this.members) {
        if (!m.alive || !m.hasGrenade || !m.brain) continue;
        const d = m.position.distanceTo(rec.pos);
        if (d < 9 || d > 26) continue;
        m.brain.grenadeOrder = now;
        break;
      }
    }
  }
}
