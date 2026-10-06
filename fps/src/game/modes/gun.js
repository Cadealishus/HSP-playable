import { FfaMode } from './ffa.js';

/**
 * GUN GAME — free for all through the EXISTING arsenal (docs/EXPANSION.md
 * §10.6; no new guns). Every kill moves the killer up one tier and hands him
 * the next weapon on the spot; a kill on the final tier (the knife) wins.
 * A knife kill sets the VICTIM back one tier as well.
 *
 * Knife kills are recognised two ways (either is enough, never both):
 *   - `actor:death.weapon === 'knife'` (src/ai tags a bot hit by `melee:hit`)
 *   - a `melee:hit { target, attacker }` that killed, arriving on the frame of
 *     a death this mode already scored with some other weapon id
 *
 * The final tier: Doug keeps the pistol in hand but only the knife counts. A build without a melee system (no `melee:hit` ever seen
 * and no `weapons.melee`) lets the pistol finish the job instead, so the match
 * can always end. Bots have no knife: their last-tier pistol kill counts as
 * the knife for them (and is announced as such, with a straight face).
 */

/** Tier → weapon id. Ten guns from defs.js, ending on the pistol, then the knife. */
export const GUN_LADDER = ['rifle', 'carbine', 'smg', 'shotgun', 'lmg', 'marksman', 'sniper', 'carbine_sd', 'mpistol', 'pistol', 'knife'];

/** Weapon class → the AI role whose behaviour (and carried model) fits it. */
const ROLE_FOR = { carbine: 'rifleman', rifle: 'rifleman', smg: 'smg', shotgun: 'shotgun', lmg: 'lmg', marksman: 'sniper', sniper: 'sniper', carbine_sd: 'rifleman', mpistol: 'smg', pistol: 'smg', knife: 'smg' };

export class GunMode extends FfaMode {
  static id = 'gun';
  static label = 'GUN GAME';
  static scoreLimit = GUN_LADDER.length; // tiers, not kills
  static timeLimit = 600;
  static respawnDelay = 3;

  init(ctx, session, host) {
    super.init(ctx, session, host);
    this.ladder = GUN_LADDER;
    this.player.tier = 0;
    for (const s of this.slots) s.tier = 0;
    this._lastDeath = { victim: null, frame: -1, knifed: false, killer: null };
    this._meleeSeen = false;
    const ev = ctx.events;
    this._offMelee = ev.on('melee:hit', (e) => this._onMelee(e));
    this._hud.gun = { tier: 1, tiers: GUN_LADDER.length, weapon: '', next: '', knife: false };
    return this;
  }

  dispose() {
    this._offMelee?.();
    this._offMelee = null;
    super.dispose();
  }

  onStart() {
    this.say('gun.start', { n: GUN_LADDER.length }, 'start', { banner: { title: 'GUN GAME', sub: `${GUN_LADDER.length} TIERS · FINISH WITH THE KNIFE` } });
  }

  /* ------------------------------------------------------------- weapons */

  weaponFor(tier) {
    return GUN_LADDER[Math.max(0, Math.min(GUN_LADDER.length - 1, tier | 0))];
  }

  /** Can Doug actually knife someone in this build? */
  meleeAvailable() {
    if (this._meleeSeen) return true;
    const w = this.ctx.peek('weapons');
    return !!(w?.melee || w?.knife || typeof w?.meleeAttack === 'function' || typeof w?.quickMelee === 'function');
  }

  /** The gun a weapon id puts in hand (the knife tier carries the pistol, holstered or not). */
  _handId(id) {
    return id === 'knife' ? 'pistol' : id;
  }

  /** Put the current tier's weapon in Doug's hands. */
  armPlayer() {
    const w = this.ctx.peek('weapons');
    if (!w) return;
    const id = this._handId(this.weaponFor(this.player.tier));
    const slot = w.states?.get?.(id)?.def?.slot ?? (id === 'pistol' || id === 'mpistol' ? 'secondary' : 'primary');
    const L = slot === 'secondary' ? { primary: null, secondary: id } : { primary: id, secondary: null };
    try {
      if (typeof w.setLoadout === 'function') w.setLoadout(L, { refill: true });
      else w.selectLoadout?.(id, { refill: true });
    } catch (err) {
      console.warn('[mode:gun] arm failed', err);
    }
  }

  spawnPlayer() {
    super.spawnPlayer();
    this.armPlayer();
  }

  botSpawnOpts(slot, opts) {
    const id = this._handId(this.weaponFor(slot.tier));
    opts.weapon = id;
    const role = ROLE_FOR[this.weaponFor(slot.tier)] ?? 'rifleman';
    if (this.caps.roles?.has(role)) opts.role = role;
  }

  armBot(slot) {
    if (!slot.agent?.alive) return;
    this.ctx.peek('ai')?.rearm?.(slot.agent, this._handId(this.weaponFor(slot.tier)));
  }

  /* -------------------------------------------------------------- scoring */

  _isKnife(weapon) {
    return weapon === 'knife' || weapon === 'melee';
  }

  onFrag(killer, victim, e) {
    if (this.result) return;
    const frame = this.ctx.time.frame;
    const knife = this._isKnife(e?.weapon);
    const ld = this._lastDeath;
    ld.victim = victim;
    ld.killer = killer;
    ld.frame = frame;
    ld.knifed = knife;
    const last = GUN_LADDER.length - 1;
    const onKnifeTier = killer.tier >= last;
    if (onKnifeTier) {
      // The final tier: only the knife counts (bots, and a build without one,
      // finish with the pistol).
      const counts = knife || !killer.isPlayer || !this.meleeAvailable();
      if (!counts) {
        if (killer.isPlayer) this.say('gun.knifeOnly');
        if (knife) this.setback(victim);
        return;
      }
      killer.tier = GUN_LADDER.length;
      killer.score = killer.tier;
      if (knife) this.setback(victim);
      this.finishFfa(killer, 'limit');
      return;
    }
    killer.tier += 1;
    killer.score = killer.tier;
    if (killer.isPlayer) {
      this.armPlayer();
      if (killer.tier === last) this.say('gun.knifeTier', null, 'warn');
      else if (killer.tier === last - 1) this.say('gun.pistol');
    } else {
      this.armBot(killer);
      if (killer.tier === last) this.say('gun.threat', { name: this.nameOf(killer) }, 'warn');
    }
    if (knife) this.setback(victim);
  }

  /** One tier down (never below the first). */
  setback(rec) {
    if (!rec || rec.tier <= 0) {
      if (rec?.isPlayer) this.say('gun.setbackFloor');
      return;
    }
    rec.tier -= 1;
    rec.score = rec.tier;
    if (rec.isPlayer) {
      this.say('gun.setbackUs');
      if (this.player.alive) this.armPlayer();
    } else {
      this.say('gun.setbackThem', { name: this.nameOf(rec) });
      this.armBot(rec);
    }
  }

  onSuicide(rec) {
    // CoD rule: dying by your own hand costs a tier. Command agrees.
    if (!this.result && rec && rec.tier > 0) {
      rec.tier -= 1;
      rec.score = rec.tier;
    }
  }

  /** `melee:hit` after a death was already scored with a gun id: that was a knife. */
  _onMelee(e) {
    this._meleeSeen = true;
    if (!e || this.result) return;
    const ld = this._lastDeath;
    const t = e.target;
    const victim = this.isPlayerActor(t) ? this.player : this.slotOfAny(t);
    if (!victim || ld.victim !== victim || ld.frame !== this.ctx.time.frame || ld.knifed) return;
    ld.knifed = true;
    this.setback(victim);
  }

  checkEnd() {
    // The ladder decides (finishFfa on the last kill); the clock: highest tier.
    if (this.constructor.timeLimit && this.timeLeft <= 0) {
      const st = this.standings();
      const tie = st.length > 1 && st[1].score === st[0].score;
      this.finishFfa(tie ? null : st[0], 'time');
    }
  }

  summary() {
    const s = super.summary();
    s.gun = true;
    s.tier = this.player.tier + 1;
    s.tiers = GUN_LADDER.length;
    return s;
  }

  weaponName(id) {
    if (id === 'knife') return 'KNIFE';
    return this.ctx.peek('weapons')?.states?.get?.(id)?.def?.displayName ?? String(id ?? '').toUpperCase();
  }

  fillFfaHud(h) {
    const g = h.gun;
    const name = this._nameFn ?? (this._nameFn = (id) => this.weaponName(id));
    const tier = Math.min(this.player.tier, GUN_LADDER.length - 1);
    g.tier = tier + 1;
    g.tiers = GUN_LADDER.length;
    g.weapon = name(GUN_LADDER[tier]);
    g.next = tier + 1 < GUN_LADDER.length ? name(GUN_LADDER[tier + 1]) : 'VICTORY';
    g.knife = GUN_LADDER[tier] === 'knife';
    h.limit = GUN_LADDER.length;
    for (const t of h.ffa.top) t.weapon = name(GUN_LADDER[Math.min(GUN_LADDER.length - 1, t.score)]);
  }
}
