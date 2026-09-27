/**
 * Score plausibility — derived from the HOLD THE LEDGER rules in
 * NERDCON_CONTRACT.md, kept deliberately generous.
 *
 *   kill        +100   · headshot +150   · everything × the streak multiplier
 *   multiplier  climbs to a hard cap of ×9
 *   wave clear  +250×n, also × the multiplier
 *   wave n      min(3 + ceil(n*1.5), 14) enemies to kill
 *   continue    one per run; it restarts the current wave, so a continued run
 *               can farm one extra wave's worth of kills
 *
 * The ceiling assumes a player who headshot every enemy at ×9 from the first
 * kill — physically impossible (the multiplier has to be earned) — then adds
 * 15% slack so a future tuning pass doesn't start rejecting honest runs. The
 * job here is to reject 9,000,000-point pastes, not to police good players.
 */

export const JOBS = ['fraud-analyst', 'payments-engineer', 'compliance-officer'] as const;
export type Job = (typeof JOBS)[number];

const KILL = 100;
const HEADSHOT = 150;
const MULT_CAP = 9;
const BONUS_PER_WAVE = 250;
const SLACK = 1.15;

export function waveGoal(n: number): number {
  return Math.min(3 + Math.ceil(n * 1.5), 14);
}

/** Total enemies that can exist in a run that reached `wave`. */
export function maxKills(wave: number, continued: boolean): number {
  let total = 0;
  for (let n = 1; n <= wave; n++) total += waveGoal(n);
  if (continued) total += waveGoal(wave); // the replayed wave
  return total;
}

/** Generous upper bound on the score of a run that reached `wave`. */
export function maxScore(wave: number, continued: boolean): number {
  let bonus = 0;
  for (let n = 1; n <= wave; n++) bonus += BONUS_PER_WAVE * n;
  const kills = maxKills(wave, continued);
  return Math.ceil(MULT_CAP * (HEADSHOT * kills + bonus) * SLACK);
}

/**
 * Floor on wall-clock seconds. ~0.25 s to acquire and drop one enemy, plus a
 * heavily discounted share of the 4 s between-wave breather. A run that claims
 * wave 12 in nine seconds did not happen.
 */
export function minDuration(wave: number, kills: number): number {
  return Math.floor(0.25 * Math.max(0, kills) + 2 * Math.max(0, wave - 1));
}

export type Verdict = { ok: true } | { ok: false; field: string; detail: string };

export function checkRun(r: {
  score: number;
  wave: number;
  kills: number;
  duration_s: number;
  continued: boolean;
}): Verdict {
  const ceiling = maxScore(r.wave, r.continued);
  if (r.score > ceiling) {
    return { ok: false, field: 'score', detail: `score ${r.score} exceeds the wave-${r.wave} ceiling of ${ceiling}` };
  }
  const killCap = maxKills(r.wave, r.continued);
  if (r.kills > killCap) {
    return { ok: false, field: 'kills', detail: `${r.kills} kills exceeds the wave-${r.wave} maximum of ${killCap}` };
  }
  const floor = minDuration(r.wave, r.kills);
  if (r.duration_s < floor) {
    return { ok: false, field: 'duration_s', detail: `${r.duration_s}s is below the ${floor}s floor for wave ${r.wave}` };
  }
  return { ok: true };
}

/**
 * Three-letter combinations we will not put on a screen at a conference.
 * Slurs, sexual terms and the obvious arcade-cabinet classics. Deliberately
 * conservative: a false positive costs a player one retype, a false negative
 * costs NerdCon a photograph.
 */
const BLOCKED = new Set([
  'ANL', 'ARS', 'ASS', 'BJB', 'BLO', 'BUM', 'CLT', 'CNT', 'COC', 'COK', 'CUM', 'CUN',
  'DIC', 'DIK', 'DIX', 'DYK', 'FAG', 'FAP', 'FCK', 'FCU', 'FKU', 'FUC', 'FUK', 'FUX',
  'GAY', 'HOE', 'JAP', 'JEW', 'JIZ', 'KKK', 'KUM', 'KYS', 'NAZ', 'NGA', 'NGR', 'NIG',
  'PAK', 'PIS', 'POO', 'PRK', 'PUS', 'RAP', 'SEX', 'SHT', 'SLT', 'SPC', 'SUK', 'SUX',
  'TIT', 'TWA', 'VAG', 'WOP', 'XXX', 'ZOG',
]);

export function initialsOk(initials: unknown): initials is string {
  return typeof initials === 'string' && /^[A-Z]{3}$/.test(initials) && !BLOCKED.has(initials);
}
