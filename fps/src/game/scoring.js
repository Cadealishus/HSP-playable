/**
 * Scoring: running score, kill count and the streak multiplier.
 *
 * Rules:
 *   - kill +100, headshot +150, everything × the current multiplier.
 *   - multiplier climbs +1 for every (3 + mult) kills, capped at ×9.
 *   - it decays one step per 10s without a kill.
 *   - it drops to ×1 ONLY on player death (chip damage never resets it — that is
 *     an FPS, not an arcade game). resetMult() is the death hook.
 *
 * This class holds no engine references. It reports changes through the `emit`
 * callback it is constructed with — `emit('score', {score, delta, mult})` /
 * `emit('mult', {mult})` / `emit('multiKill', {count})` — so index.js can
 * forward them onto ctx.events as game:score / game:mult (and
 * game:multiKill) without this file knowing about the bus.
 */

import { KILL_SCORE, HEADSHOT_SCORE, MULT_CAP, MULT_DECAY_S } from './waves.js';

/**
 * Double-kill window, seconds. Two kills inside it are a multi-kill
 * (Command notices); a third inside the *same* rolling window keeps
 * extending the run, so a genuine spray-down reports ×3 / ×4 rather than firing
 * three separate double-kill notices.
 */
const DOUBLE_WINDOW_S = 1.2;

/**
 * Quiet time before a burst is reported. Kills that land on the SAME frame — a
 * grenade, an explosion, FLOP.killAll() — would otherwise fire one notice per
 * kill from the second onward and flood a six-row killfeed. Waiting a beat and
 * reporting the final count instead means a burst is always exactly one line.
 */
const DOUBLE_REPORT_S = 0.28;

export class Scoring {
  constructor(emit) {
    this._emit = typeof emit === 'function' ? emit : () => {};
    this.reset();
  }

  reset() {
    this.score = 0;
    this.mult = 1;
    this.kills = 0;
    this._streak = 0;      // kills banked toward the next multiplier step
    this._sinceKill = 0;   // seconds since the last kill (drives decay)
    this._dblSince = 1e9;  // seconds since the last kill, ALWAYS advanced
    this._dblRun = 0;      // kills inside the current double-kill window
    this._dblPending = 0;  // burst size waiting to be reported
  }

  /** Announce the current zeroed state — call after reset() at run start. */
  announce() {
    this._emit('score', { score: this.score, delta: 0, mult: this.mult });
    this._emit('mult', { mult: this.mult });
  }

  /** Register one enemy kill. */
  kill(headshot = false) {
    const base = headshot ? HEADSHOT_SCORE : KILL_SCORE;
    const delta = base * this.mult;
    this.score += delta;
    this.kills += 1;

    // Double kill, evaluated BEFORE the timers reset. The notice is not emitted
    // here: it is parked and reported from tickCombo() once the burst has gone
    // quiet, so a burst of any size is exactly one multi-kill line
    // carrying its final count.
    this._dblRun = this._dblSince <= DOUBLE_WINDOW_S ? this._dblRun + 1 : 1;
    this._dblSince = 0;
    if (this._dblRun >= 2) this._dblPending = this._dblRun;

    this._sinceKill = 0;
    this._emit('score', { score: this.score, delta, mult: this.mult });

    // Escalate the streak. Threshold uses the CURRENT multiplier, so ×1→×2 costs
    // 4 kills, ×2→×3 costs 5, and so on, up to the cap.
    this._streak += 1;
    if (this.mult < MULT_CAP && this._streak >= 3 + this.mult) {
      this._streak = 0;
      this.mult += 1;
      this._emit('mult', { mult: this.mult });
    }
  }

  /** Flat points (wave-clear bonus). Caller has already applied ×mult. */
  addBonus(points) {
    if (!points) return;
    this.score += points;
    this._emit('score', { score: this.score, delta: points, mult: this.mult });
  }

  /**
   * Break the double-kill window without touching score or multiplier. Called
   * at every seam in the fight — wave clear, death — because the window is
   * measured in `update()` time, and `update()` does not run during the
   * breather. Without this, the last kill of wave 3 and the first kill of wave
   * 4 would report as a double across a four-second gap.
   */
  resetCombo() {
    this._dblSince = 1e9;
    this._dblRun = 0;
    this._dblPending = 0;
  }

  /**
   * Double-kill clock. Called EVERY frame from the game loop, outside every
   * state gate — unlike update() below, which only runs while a wave is being
   * fought. The window has to keep running through the breather and the death
   * screen, or the last kill of one wave pairs with the first kill of the next.
   */
  tickCombo(dt) {
    if (this._dblSince >= 1e9) return;
    this._dblSince += dt;
    if (this._dblPending && this._dblSince >= DOUBLE_REPORT_S) {
      this._emit('multiKill', { count: this._dblPending });
      this._dblPending = 0;
    }
  }

  /** Player death: streak collapses to ×1. Score is kept. */
  resetMult() {
    this.resetCombo();
    this._streak = 0;
    this._sinceKill = 0;
    if (this.mult !== 1) {
      this.mult = 1;
      this._emit('mult', { mult: this.mult });
    }
  }

  /** Multiplier decay. Only call while a wave is actually being fought. */
  update(dt) {
    if (this.mult <= 1) return;
    this._sinceKill += dt;
    if (this._sinceKill >= MULT_DECAY_S) {
      this._sinceKill = 0;
      this._streak = 0;
      this.mult -= 1;
      this._emit('mult', { mult: this.mult });
    }
  }
}
