/**
 * AI — combat roles and the weapons they carry.
 *
 * A role is a way of fighting, not a stat block: where a man wants to stand
 * relative to the target (`range`), how willing he is to close (`aggression`),
 * how he pulls the trigger (`burst`, `burstGap`), and which third-person model
 * he carries (`model`, see weapon.js). Weapon NUMBERS come from the shared
 * registry, `src/weapons/defs.js`, by id (EXPANSION.md §6), so an AI shotgun and
 * the player's shotgun are the same gun. The registry is being extended while
 * this ships (shotgun / lmg / sniper / rocket), so every lookup is guarded: a
 * missing def falls back to the rifle's numbers, and only the traits that
 * define the class (pellets for a shotgun, a projectile for a launcher, the
 * cadence) come from the role's own profile below, so a shotgun modelled as a
 * shotgun never fires like a carbine.
 *
 * Damage is scaled on the way in. The player's rifle does 33 a round; a bot
 * connecting at that rate would kill Doug in three, so rounds aimed at the
 * player carry `PLAYER_DAMAGE_SCALE` of the def's damage (the rifle's 33
 * becomes the 17 the wave game was balanced around) and bot-on-bot rounds carry
 * `BOT_DAMAGE_SCALE`. Difficulty never touches health.
 */

import * as WeaponDefs from '../weapons/defs.js';

export const PLAYER_DAMAGE_SCALE = 0.52;
export const BOT_DAMAGE_SCALE = 0.8;

/**
 * Role table.
 *   range      [min, ideal, max] engagement metres
 *   aggression 0..1: push, chase, flank appetite
 *   burst      [min, max] rounds per trigger pull
 *   burstGap   [min, max] seconds between bursts
 *   model      weapon.js style; `modelHostile` overrides for the Committee
 *   variant    body silhouettes this role is drawn from
 *   decision   0..1 extra tactical sense (commander)
 */
export const ROLES = {
  rifleman: {
    id: 'rifleman',
    display: 'RIFLEMAN',
    weapon: { hostile: 'rifle', esf: 'carbine' },
    model: 'carbine',
    modelByVariant: { irregular: 'ak' },
    variant: ['vanguard', 'irregular'],
    range: [6, 22, 62],
    aggression: 0.5,
    burst: [3, 6],
    burstGap: [0.4, 1.1],
    decision: 0,
    speed: 1,
  },
  smg: {
    id: 'smg',
    display: 'ASSAULT',
    weapon: 'smg',
    model: 'smg',
    variant: ['irregular', 'vanguard'],
    range: [2, 9, 30],
    aggression: 0.85,
    burst: [4, 9],
    burstGap: [0.22, 0.6],
    decision: 0,
    speed: 1.08,
    pushes: true,
  },
  shotgun: {
    id: 'shotgun',
    display: 'BREACHER',
    weapon: 'shotgun',
    model: 'shotgun',
    variant: ['breacher'],
    range: [1, 5, 15],
    aggression: 0.95,
    burst: [1, 1],
    burstGap: [0.75, 1.05],
    decision: 0,
    speed: 1.04,
    pushes: true,
    indoor: true,
  },
  lmg: {
    id: 'lmg',
    display: 'SUPPORT',
    weapon: 'lmg',
    model: 'lmg',
    variant: ['breacher', 'vanguard'],
    range: [10, 30, 75],
    aggression: 0.3,
    burst: [7, 16],
    burstGap: [0.45, 1.1],
    decision: 0,
    speed: 0.86,
    suppressor: true,
  },
  sniper: {
    id: 'sniper',
    display: 'MARKSMAN',
    weapon: 'sniper',
    model: 'sniper',
    variant: ['vanguard', 'irregular'],
    range: [18, 50, 130],
    aggression: 0.1,
    burst: [1, 1],
    burstGap: [1.7, 2.9],
    decision: 0.15,
    speed: 0.95,
    relocates: true,
    glint: true,
  },
  rocket: {
    id: 'rocket',
    display: 'HEAVY',
    weapon: 'rocket',
    model: 'rocket',
    variant: ['breacher'],
    range: [16, 34, 95],
    aggression: 0.25,
    burst: [1, 1],
    burstGap: [9, 13],
    decision: 0.1,
    speed: 0.85,
    rocket: true,
  },
  commander: {
    id: 'commander',
    display: 'COMMANDER',
    weapon: { hostile: 'rifle', esf: 'carbine' },
    model: 'carbine',
    variant: ['vanguard'],
    range: [6, 20, 60],
    aggression: 0.6,
    burst: [3, 5],
    burstGap: [0.35, 0.9],
    decision: 0.35,
    speed: 1,
    leader: true,
  },
};

export const ROLE_IDS = Object.keys(ROLES);

/** The role for an id (loose: 'assault' -> smg, 'heavy' -> rocket, ...). */
export function roleFor(id) {
  if (!id) return ROLES.rifleman;
  const k = String(id).toLowerCase();
  if (ROLES[k]) return ROLES[k];
  if (/assault|smg/.test(k)) return ROLES.smg;
  if (/breach|shot/.test(k)) return ROLES.shotgun;
  if (/support|lmg|mg/.test(k)) return ROLES.lmg;
  if (/snip|mark/.test(k)) return ROLES.sniper;
  if (/rocket|heavy|launch|rpg/.test(k)) return ROLES.rocket;
  if (/command|elite|leader|officer/.test(k)) return ROLES.commander;
  return ROLES.rifleman;
}

/**
 * Class traits the AI needs even when the registry has no def for the gun yet.
 * These are the traits that make the class what it is; everything else falls
 * back to the rifle.
 */
const CLASS_TRAITS = {
  rifle: { cls: 'rifle', audio: 'ai_rifle', noise: 1, bloom: 0.0035, pellets: 1, tracerEvery: 3 },
  carbine: { cls: 'rifle', audio: 'ai_rifle', noise: 1, bloom: 0.0035, pellets: 1, tracerEvery: 3 },
  ak: { cls: 'rifle', audio: 'ai_ak', noise: 1, bloom: 0.0045, pellets: 1, tracerEvery: 3 },
  smg: { cls: 'smg', audio: 'ai_smg', noise: 0.85, bloom: 0.005, pellets: 1, tracerEvery: 4, rpm: 900, magSize: 32, reload: 2.1, damage: 24, maxRange: 200 },
  pistol: { cls: 'pistol', audio: 'ai_pistol', noise: 0.75, bloom: 0.006, pellets: 1, tracerEvery: 5, rpm: 380, magSize: 15, reload: 1.6, damage: 26, maxRange: 120 },
  shotgun: { cls: 'shotgun', audio: 'ai_shotgun', noise: 1.1, bloom: 0, pellets: 8, pelletSpread: 0.045, tracerEvery: 2, rpm: 70, magSize: 6, reload: 3.4, damage: 15, maxRange: 60, penetration: 0.35 },
  lmg: { cls: 'lmg', audio: 'ai_lmg', noise: 1.15, bloom: 0.0028, pellets: 1, tracerEvery: 2, rpm: 720, magSize: 100, reload: 5.6, damage: 30, maxRange: 400, penetration: 1.4 },
  sniper: { cls: 'sniper', audio: 'ai_sniper', noise: 1.3, bloom: 0, pellets: 1, tracerEvery: 1, rpm: 42, magSize: 5, reload: 3.6, damage: 92, maxRange: 600, penetration: 2 },
  rocket: {
    cls: 'rocket', audio: 'ai_rocket', noise: 1.4, bloom: 0, pellets: 1, tracerEvery: 1, rpm: 30, magSize: 1, reload: 4.2,
    damage: 150, maxRange: 300,
    projectile: { speed: 58, radius: 5.5, damage: 150, arm: 4 },
  },
};

function lookupDef(id, weapons) {
  if (!id) return null;
  // runtime registry first (the arsenal may expose more than the file does)
  const live = weapons?.getDef?.(id) ?? weapons?.defs?.[id] ?? weapons?.states?.get?.(id)?.def ?? null;
  if (live) return live;
  try {
    return WeaponDefs?.WEAPON_DEFS?.[id] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve an AI weapon profile. Never throws, never returns null.
 * @param id       def id ('rifle', 'smg', 'shotgun', 'lmg', 'sniper', 'rocket', ...)
 * @param weapons  the weapons system (optional; for runtime defs)
 */
export function resolveWeapon(id, weapons = null) {
  const key = String(id ?? 'rifle').toLowerCase();
  const own = lookupDef(key, weapons);
  const rifle = lookupDef('rifle', weapons);
  const base = own ?? rifle ?? {};
  const traits = CLASS_TRAITS[key] ?? CLASS_TRAITS[base.class] ?? CLASS_TRAITS.rifle;
  // own def wins on every number it has; a missing def takes the class traits
  // for what makes the class, and the rifle for everything else
  const pick = (k, fallback) => (own && own[k] !== undefined ? own[k] : traits[k] !== undefined ? traits[k] : base[k] !== undefined ? base[k] : fallback);
  const rpm = pick('rpm', 800);
  const projDef = own?.projectile ?? traits.projectile ?? null;
  const pellets = own?.pellets ?? traits.pellets ?? 1;
  const p = {
    id: key,
    found: !!own,
    cls: traits.cls,
    audio: traits.audio,
    rpm,
    interval: 60 / Math.max(10, rpm),
    damage: pick('damage', 33),
    pellets,
    pelletSpread: own?.pelletSpread ?? (own?.spreadHip && pellets > 1 ? (own.spreadHip * Math.PI) / 180 : traits.pelletSpread ?? 0),
    magSize: pick('magSize', 30),
    reload: own?.reloadTac ?? own?.reload ?? traits.reload ?? base.reloadTac ?? 2.3,
    maxRange: pick('maxRange', 400),
    penetration: pick('penetration', 1),
    dropoff: pick('dropoff', 0.6),
    noise: own?.noise ?? (own?.suppressed ? 0.3 : traits.noise ?? 1),
    suppressed: !!own?.suppressed,
    bloom: traits.bloom ?? 0.004,
    tracerEvery: own?.tracerEvery ?? traits.tracerEvery ?? 3,
    projectile: projDef
      ? {
        speed: projDef.speed ?? projDef.velocity ?? 58,
        radius: projDef.radius ?? projDef.blastRadius ?? 5.5,
        damage: projDef.damage ?? own?.damage ?? 150,
        arm: projDef.arm ?? projDef.armDistance ?? 4,
      }
      : null,
  };
  if (p.projectile) p.pellets = 1;
  return p;
}

/** Third-person model style for a role on a given body. */
export function modelFor(role, variant) {
  return role.modelByVariant?.[variant] ?? role.model ?? 'carbine';
}

/** Weapon def id for a role on a team. */
export function weaponFor(role, team) {
  const w = role.weapon;
  if (typeof w === 'string') return w;
  return w?.[team] ?? w?.hostile ?? 'rifle';
}
