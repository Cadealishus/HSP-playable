/**
 * OPERATION TOTAL CONFIDENCE — wave tuning (pure functions + constants).
 *
 * The numbers are the original wave-holdout spec; this
 * file is the single place they live so the loop in index.js stays about flow,
 * not arithmetic.
 */

/** Concurrent live-enemy cap. Waves larger than this are fed in trickles. */
export const CONCURRENT_CAP = 8;

/** Seconds of breather between a cleared wave and the next. */
export const BREATHER_S = 4;

/** Score awarded per kill, and the headshot premium. Both scale by multiplier. */
export const KILL_SCORE = 100;
export const HEADSHOT_SCORE = 150;

/** Multiplier ceiling and the no-kill decay window (seconds per step down). */
export const MULT_CAP = 9;
export const MULT_DECAY_S = 10;

/** Total enemies to eliminate in wave n: min(3 + ceil(n*1.5), 14). */
export function waveGoal(n) {
  return Math.min(3 + Math.ceil(n * 1.5), 14);
}

/** Difficulty knob handed to ai.spawnWave: 0 at wave 1-ish, 1 by wave 10. */
export function waveIntensity(n) {
  return Math.min(1, n / 10);
}

/** Wave-clear bonus base (multiplied by the live streak multiplier). */
export function waveBonus(n) {
  return 250 * n;
}
