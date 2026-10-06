/**
 * AMMUNITION TYPES (docs/EXPANSION.md §10.2).
 *
 *   AMMO[id] = { id, label, tag, desc, dmgMult, fleshMult, armorPen (0..1),
 *                armorDmgMult, penetrationMult, rangeMult, burn: {dps, dur} | null,
 *                tracer, noiseMult, velocityMult }
 *
 * What is applied WHERE:
 *   weapons (here)   dmgMult (the round's damage), penetrationMult (the wall
 *                    budget handed to physics.fireBullet), rangeMult (max range
 *                    and the damage falloff distance), velocityMult (muzzle
 *                    velocity: subsonic is subsonic), noiseMult (the weapon:fire
 *                    hearing radius) and `tracer` (bullet:tracer `warm` tint, or
 *                    no tracer at all).
 *   armour (src/combat/armor.js resolveDamage, owned by ARMOUR) consumes
 *                    fleshMult, armorPen, armorDmgMult and burn from the `ammo`
 *                    object every player damage payload carries. Nothing here
 *                    does armour maths.
 *
 * `tracer` is `null` (no visible tracer) or `{ warm }`: the fx tracer's warmth
 * factor (1 = the stock orange-white streak, < 1 deeper orange/red, > 1 paler).
 */

export const AMMO = {
  fmj: {
    id: 'fmj',
    label: 'FULL METAL JACKET',
    tag: 'FMJ',
    desc: 'Standard issue. Does what it says on the jacket.',
    dmgMult: 1,
    fleshMult: 1,
    armorPen: 0.25,
    armorDmgMult: 1,
    penetrationMult: 1,
    rangeMult: 1,
    velocityMult: 1,
    noiseMult: 1,
    burn: null,
    tracer: { warm: 1 },
  },
  hp: {
    id: 'hp',
    label: 'HOLLOW POINT',
    tag: 'HP',
    desc: 'Expands on contact. More damage to people, very little to armour or walls.',
    dmgMult: 1,
    fleshMult: 1.25,
    armorPen: 0,
    armorDmgMult: 0.55,
    penetrationMult: 0.45,
    rangeMult: 0.9,
    velocityMult: 1,
    noiseMult: 1,
    burn: null,
    tracer: { warm: 1 },
  },
  ap: {
    id: 'ap',
    label: 'ARMOUR-PIERCING',
    tag: 'AP',
    desc: 'Hardened core. Goes through vests and drywall, and slightly less through people.',
    dmgMult: 1,
    fleshMult: 0.9,
    armorPen: 0.65,
    armorDmgMult: 1.6,
    penetrationMult: 1.85,
    rangeMult: 1.05,
    velocityMult: 1.03,
    noiseMult: 1,
    burn: null,
    tracer: { warm: 1.3 },
  },
  incendiary: {
    id: 'incendiary',
    label: 'INCENDIARY',
    tag: 'INC',
    desc: 'Sets targets on fire. Command has asked that this not become a habit.',
    dmgMult: 0.9,
    fleshMult: 1,
    armorPen: 0.15,
    armorDmgMult: 0.9,
    penetrationMult: 0.75,
    rangeMult: 0.95,
    velocityMult: 1,
    noiseMult: 1,
    burn: { dps: 9, dur: 2.5 },
    tracer: { warm: 0.45 },
  },
  subsonic: {
    id: 'subsonic',
    label: 'SUBSONIC',
    tag: 'SUB',
    desc: 'No supersonic crack. Quieter, slower and shorter-ranged. No tracers.',
    dmgMult: 0.92,
    fleshMult: 1,
    armorPen: 0.2,
    armorDmgMult: 0.9,
    penetrationMult: 0.8,
    rangeMult: 0.7,
    velocityMult: 0.72,
    noiseMult: 0.55,
    burn: null,
    tracer: null,
  },
};

export const AMMO_IDS = ['fmj', 'hp', 'ap', 'incendiary', 'subsonic'];
export const DEFAULT_AMMO = 'fmj';

/** The def for an id (or a def), falling back to FMJ. */
export function ammoDef(a) {
  if (a && typeof a === 'object' && AMMO[a.id]) return AMMO[a.id];
  return AMMO[a] ?? AMMO.fmj;
}

/** Ammo types a weapon def accepts (`def.ammoTypes`, default all; none for a launcher). */
export function ammoFor(def) {
  if (!def || def.projectile) return [];
  return Array.isArray(def.ammoTypes) ? def.ammoTypes : AMMO_IDS;
}

/** 'head' | 'torso' | 'limb' from a physics collider part name. */
export function zoneOf(part) {
  if (!part) return 'torso';
  const p = String(part);
  if (p === 'head' || p === 'neck') return 'head';
  if (/arm|leg|hand|foot|thigh|shin|calf|forearm|limb/i.test(p)) return 'limb';
  return 'torso';
}
