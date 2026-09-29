/**
 * SURVIVAL — wave tuning (pure functions + constants).
 *
 * The original wave-holdout numbers, escalated: waves grow larger and the
 * concurrent cap rises with them, hostiles get sharper faster, and from wave 3
 * specialists join the rifle squads (marksmen, then shotgunners, then LMG
 * gunners, then armoured heavies). This file is the single place those numbers
 * live so the mode stays about flow, not arithmetic.
 */

/** Concurrent live-enemy cap at wave 1; grows by one every two waves. */
export const CONCURRENT_CAP = 8;
export const CONCURRENT_MAX = 12;

/** Seconds of breather (and resupply) between a cleared wave and the next. */
export const BREATHER_S = 8;

/** Score awarded per kill, and the headshot premium. Both scale by multiplier. */
export const KILL_SCORE = 100;
export const HEADSHOT_SCORE = 150;

/** Multiplier ceiling and the no-kill decay window (seconds per step down). */
export const MULT_CAP = 9;
export const MULT_DECAY_S = 10;

/** Total enemies to eliminate in wave n: 3 + ceil(1.6 n), capped at 30. */
export function waveGoal(n) {
  return Math.min(3 + Math.ceil(n * 1.6), 30);
}

/** How many may be alive at once in wave n. */
export function concurrentCap(n) {
  return Math.min(CONCURRENT_MAX, CONCURRENT_CAP + Math.floor((Math.max(1, n) - 1) / 2));
}

/**
 * Difficulty knob handed to the AI: ~0.1 at wave 1, 1 by wave 9, shifted by the
 * session difficulty offset (recruit -0.25 … veteran +0.4), clamped 0..1.
 */
export function waveIntensity(n, offset = 0) {
  return Math.max(0, Math.min(1, n / 9 + offset));
}

/** Wave-clear bonus base (multiplied by the live streak multiplier). */
export function waveBonus(n) {
  return 250 * n;
}

/**
 * The specialist mix for wave n: `[role, share]`, share of the wave's spawns.
 * Everyone else is a rifleman. The roles are EXPANSION §2 `opts.role` values;
 * the AI maps each to its kit and behaviour (and ignores any it does not know).
 */
export function waveRoles(n) {
  const out = [];
  if (n >= 3) out.push(['marksman', n >= 6 ? 0.15 : 0.1]);
  if (n >= 4) out.push(['shotgunner', 0.15]);
  if (n >= 5) out.push(['gunner', n >= 8 ? 0.15 : 0.1]);
  if (n >= 7) out.push(['heavy', Math.min(0.25, 0.08 + (n - 7) * 0.03)]);
  return out;
}

/** Deterministic role for the k-th spawn of wave n (spreads specialists evenly). */
export function roleFor(n, k) {
  const roles = waveRoles(n);
  // Golden-ratio sequence: an even, repeatable scatter over the wave.
  const u = (k * 0.6180339887 + n * 0.37) % 1;
  let acc = 0;
  for (const [role, share] of roles) {
    acc += share;
    if (u < acc) return role;
  }
  return 'rifleman';
}
