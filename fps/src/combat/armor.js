/**
 * COMBAT — helmets, ballistic vests and the ONE damage-resolution function
 * (EXPANSION §10.3). Pure data + maths: no THREE, no ctx, no allocation per
 * call. Both the player's health and every Agent's `applyDamage` go through
 * `resolveDamage`, and so do net hits (§10.7), explosions and burn ticks.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE MODEL
 *   A helmet covers 'head', a vest covers 'torso'; limbs are never covered.
 *   While a piece has plate hp left it takes `protect` (0..1) of an incoming
 *   round off the wearer's health. The round also wears the plate:
 *       armourDamage = amount * WEAR * ammo.armorDmgMult
 *   and a hit that wears more than is left BREAKS it (protection is pro-rated
 *   on that last hit, so a broken plate never over-protects). Broken = hp 0.
 *
 *   Ammo (§10.2 AMMO fields, src/weapons/ammo.js) changes the plate maths:
 *     armorPen     0..1 on GUNSMITH's scale, where FMJ is the 0.25 baseline.
 *                  It is read RELATIVE to FMJ: strip = (pen - 0.25) / 0.75,
 *                  so FMJ meets the tier's full protection, AP (0.65) strips
 *                  53 % of it, and hollow point (0) makes plates 33 % better.
 *     armorDmgMult how hard it chews plates (AP 1.6, hollow point 0.55)
 *     fleshMult    extra damage to flesh: applied ONLY where no intact plate
 *                  covers the zone (hollow point 1.25)
 *     burn         { dps, dur }: incendiary. Returned to the caller, who ticks
 *                  it back through resolveDamage with kind 'fire'.
 *   `dmgMult` / `rangeMult` / `penetrationMult` belong to the weapon (it has
 *   already scaled `amount` before it gets here); this file ignores them.
 *
 *   A HEAVY helmet `deflects`: while intact, a non-AP head hit can never take
 *   more than `deflectCap` health, however big it is. That is the "it saved me
 *   from one sniper headshot" rule: a 500-damage sniper headshot leaves 40 hp of
 *   damage, and wears the helmet straight through its hp, so it BREAKS and the
 *   next one kills.
 *
 *   kind 'blast' (explosions) counts as torso with `BLAST_SHARE` of the vest's
 *   protection; kind 'fire' (burn ticks, molotov) with `FIRE_SHARE`; and
 *   kind 'melee' ignores armour (knives go round plates).
 *
 * BALANCE
 *   The LIGHT tiers are the loadout default and are tuned to barely move
 *   time-to-kill: a light vest takes 10% off a torso round and breaks after
 *   36 hp of wear (two rifle rounds from Doug), so the total it can ever save
 *   is ~6 hp. Its job is to make NONE (faster) and HEAVY (slower, tanky) a real
 *   choice, not to make the default tankier.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * API
 *   ARMOR.helmet[tier] / ARMOR.vest[tier]  { id, label, desc, protect, hp, moveMult, ... }
 *   ARMOR_TIERS                            ['none', 'light', 'heavy']
 *   createArmor(helmet, vest, out?)        { helmet: {tier, hp, max}, vest: {tier, hp, max} }
 *   setArmor(armor, helmet, vest)          re-tier in place, full plates
 *   restoreArmor(armor)                    plates back to full (resupply)
 *   armorMoveMult(armor)                   product of the tiers' move costs
 *   armorFraction(armor, slot)             0..1 plate hp left (0 for 'none')
 *   resolveDamage({ amount, zone, ammo, armor, kind }, out?)
 *     -> { health, armorDamage, absorbed, broke, brokeSlot, deflected, slot,
 *          burnDps, burnDur }
 *     MUTATES `armor` (the plate hp). Returns a shared scratch object unless
 *     you pass `out`; copy what you keep.
 *   zoneOf(part)                           'head' | 'torso' | 'limb' from an AI hitbox part
 *   ammoDef(ammo)                          AMMO def object for an id / object / null (fmj)
 */

export const ARMOR_TIERS = Object.freeze(['none', 'light', 'heavy']);

/** Plate hp lost per point of incoming damage (before ammo.armorDmgMult). */
export const WEAR = 0.6;
/** Share of vest protection that applies to blast and to fire. */
export const BLAST_SHARE = 0.35;
export const FIRE_SHARE = 0.2;

const tier = (o) => Object.freeze(o);

export const ARMOR = Object.freeze({
  helmet: Object.freeze({
    none: tier({
      id: 'none', slot: 'helmet', label: 'NO HELMET', short: 'CAP',
      desc: 'A patrol cap. Protects against sun and nothing else. Doug can hear everything.',
      protect: 0, hp: 0, moveMult: 1.01,
    }),
    light: tier({
      id: 'light', slot: 'helmet', label: 'LIGHT HELMET', short: 'LIGHT',
      desc: 'High-cut ballistic shell. Turns a ricochet into a story. Turns a headshot into a shorter story.',
      protect: 0.12, hp: 30, moveMult: 1.0,
    }),
    heavy: tier({
      id: 'heavy', slot: 'helmet', label: 'HEAVY HELMET', short: 'HEAVY',
      desc: 'Full-cut shell with a ballistic visor. Stops one sniper round, then retires.',
      protect: 0.5, hp: 100, moveMult: 0.97,
      deflect: true, deflectCap: 40,
    }),
  }),
  vest: Object.freeze({
    none: tier({
      id: 'none', slot: 'vest', label: 'NO VEST', short: 'NONE',
      desc: 'Shirt. Fast. Command calls this "agile". Accounts calls it "cheaper".',
      protect: 0, hp: 0, moveMult: 1.04,
    }),
    light: tier({
      id: 'light', slot: 'vest', label: 'SOFT VEST', short: 'LIGHT',
      desc: 'Soft armour panels. Takes the edge off two rounds, then it is a jacket.',
      protect: 0.1, hp: 36, moveMult: 1.0,
    }),
    heavy: tier({
      id: 'heavy', slot: 'vest', label: 'PLATE CARRIER', short: 'HEAVY',
      desc: 'Ceramic plates, side plates, shoulder armour. You will be shot a lot and walk slowly about it.',
      protect: 0.4, hp: 160, moveMult: 0.91,
    }),
  }),
});

/**
 * Ammo fallback (EXPANSION §10.2 field names). Used when the payload names an
 * id `src/weapons/ammo.js` has not registered, or carries no ammo at all. A
 * payload that carries the AMMO def object is used as-is (missing fields fall
 * back to fmj's).
 */
export const AMMO_FALLBACK = Object.freeze({
  fmj: Object.freeze({ id: 'fmj', dmgMult: 1, fleshMult: 1, armorPen: 0.25, armorDmgMult: 1, burn: null }),
  hp: Object.freeze({ id: 'hp', dmgMult: 1, fleshMult: 1.25, armorPen: 0, armorDmgMult: 0.55, burn: null }),
  ap: Object.freeze({ id: 'ap', dmgMult: 1, fleshMult: 0.9, armorPen: 0.65, armorDmgMult: 1.6, burn: null }),
  incendiary: Object.freeze({
    id: 'incendiary', dmgMult: 0.9, fleshMult: 1, armorPen: 0.15, armorDmgMult: 0.9,
    burn: Object.freeze({ dps: 9, dur: 2.5 }),
  }),
  subsonic: Object.freeze({ id: 'subsonic', dmgMult: 0.92, fleshMult: 1, armorPen: 0.2, armorDmgMult: 0.9, burn: null }),
});
/** FMJ's armorPen on the ammo table's scale: the baseline that meets full protection. */
export const PEN_BASE = 0.25;
/** Share of protection a round strips (negative: plates do better), relative to FMJ. */
export function penStrip(A) {
  return (num(A?.armorPen, PEN_BASE) - PEN_BASE) / (1 - PEN_BASE);
}
const FMJ = AMMO_FALLBACK.fmj;

/** Optional registry hook: `registerAmmo(AMMO)` lets src/weapons/ammo.js feed its table in. */
let AMMO_TABLE = null;
export function registerAmmo(table) {
  AMMO_TABLE = table && typeof table === 'object' ? table : null;
}

export function ammoDef(ammo) {
  if (!ammo) return FMJ;
  if (typeof ammo === 'object') return ammo;
  return AMMO_TABLE?.[ammo] ?? AMMO_FALLBACK[ammo] ?? FMJ;
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** A tier id, or anything carrying `.tier` (an armour slot): unknown -> 'light'. */
export function normTier(t) {
  if (t && typeof t === 'object') t = t.tier;
  return t === 'none' || t === 'heavy' ? t : 'light';
}

/* ------------------------------------------------------------------ state */

export function createArmor(helmet = 'light', vest = 'light', out = null) {
  const a = out ?? { helmet: { tier: 'light', hp: 0, max: 0 }, vest: { tier: 'light', hp: 0, max: 0 } };
  return setArmor(a, helmet, vest);
}

export function setArmor(a, helmet, vest) {
  const h = ARMOR.helmet[normTier(helmet)];
  const v = ARMOR.vest[normTier(vest)];
  a.helmet.tier = h.id;
  a.helmet.max = h.hp;
  a.helmet.hp = h.hp;
  a.vest.tier = v.id;
  a.vest.max = v.hp;
  a.vest.hp = v.hp;
  return a;
}

export function restoreArmor(a) {
  if (!a) return a;
  a.helmet.hp = a.helmet.max;
  a.vest.hp = a.vest.max;
  return a;
}

export function armorMoveMult(a) {
  if (!a) return 1;
  return ARMOR.helmet[a.helmet.tier].moveMult * ARMOR.vest[a.vest.tier].moveMult;
}

export function armorFraction(a, slot) {
  const s = a?.[slot];
  return s && s.max > 0 ? Math.max(0, Math.min(1, s.hp / s.max)) : 0;
}

/** AI hitbox part ('head' | 'torso' | 'arm' | 'leg') to an armour zone. */
export function zoneOf(part) {
  if (part === 'head' || part === 'neck') return 'head';
  if (part === 'torso' || part == null) return 'torso';
  if (part === 'limb' || part === 'arm' || part === 'leg') return 'limb';
  return 'torso';
}

/* ------------------------------------------------------------- resolution */

const _out = {
  health: 0, armorDamage: 0, absorbed: 0, broke: false, brokeSlot: null,
  deflected: false, slot: null, burnDps: 0, burnDur: 0,
};

/**
 * @param {object} hit  { amount, zone: 'head'|'torso'|'limb', ammo, armor,
 *                        kind: 'bullet'|'blast'|'fire'|'melee' }
 * @param {object} [out] result object to fill (defaults to a shared scratch)
 */
export function resolveDamage(hit, out = _out) {
  const amount = Math.max(0, num(hit?.amount, 0));
  const kind = hit?.kind ?? 'bullet';
  const armor = hit?.armor ?? null;
  const A = ammoDef(kind === 'bullet' ? hit?.ammo : null);
  out.health = amount;
  out.armorDamage = 0;
  out.absorbed = 0;
  out.broke = false;
  out.brokeSlot = null;
  out.deflected = false;
  out.slot = null;
  const burn = kind === 'bullet' ? A.burn ?? null : null;
  out.burnDps = burn ? num(burn.dps, 0) : 0;
  out.burnDur = burn ? num(burn.dur, 0) : 0;
  if (amount <= 0) return out;

  const fleshMult = num(A.fleshMult, 1);
  const zone = kind === 'blast' || kind === 'fire' ? 'torso' : hit?.zone === 'head' ? 'head' : hit?.zone === 'limb' ? 'limb' : 'torso';
  const slot = zone === 'head' ? 'helmet' : zone === 'torso' ? 'vest' : null;
  const piece = slot && armor && kind !== 'melee' ? armor[slot] : null;
  const def = piece ? ARMOR[slot][piece.tier] : null;

  if (!piece || !def || def.protect <= 0 || piece.hp <= 0) {
    // bare flesh (or a broken plate): only here does hollow point bite harder
    out.health = amount * fleshMult;
    return out;
  }
  out.slot = slot;

  let protect = def.protect;
  if (kind === 'blast') protect *= BLAST_SHARE;
  else if (kind === 'fire') protect *= FIRE_SHARE;
  else protect *= 1 - penStrip(A);
  protect = Math.max(0, Math.min(0.95, protect));

  const wear = amount * WEAR * (kind === 'bullet' ? num(A.armorDmgMult, 1) : kind === 'fire' ? 0.25 : 1);
  // the hit that breaks a plate is only protected for the share it had hp for
  const share = wear > piece.hp && wear > 0 ? piece.hp / wear : 1;
  let absorbed = amount * protect * share;
  let health = amount - absorbed;

  // heavy helmet: an intact shell turns a non-AP head hit of any size into a bad day
  if (def.deflect && kind === 'bullet' && penStrip(A) < 0.5 && health > def.deflectCap) {
    health = def.deflectCap;
    absorbed = amount - health;
    out.deflected = true;
  }

  const armorDamage = Math.min(piece.hp, wear);
  piece.hp -= armorDamage;
  if (piece.hp <= 1e-6) {
    piece.hp = 0;
    out.broke = true;
    out.brokeSlot = slot;
  }
  out.health = health;
  out.absorbed = absorbed;
  out.armorDamage = armorDamage;
  return out;
}

/* ------------------------------------------------------------ bots by role */

/**
 * Which tiers a bot wears. Deterministic from `seq` (a spawn counter) so a wave
 * always dresses the same way. `intensity` is the survival wave intensity / MP
 * bot skill (0..1): later waves bring heavier kit. Specialists are fixed:
 * the LMG gunner, the breacher, the rocket man and the commander are heavy.
 */
export function armorForRole(role, team = 'hostile', intensity = 0.5, seq = 0) {
  const u = frac(seq * 0.6180339887 + (team === 'esf' ? 0.31 : 0));
  const w = frac(seq * 0.7548776662 + 0.17);
  const i = Math.max(0, Math.min(1, num(intensity, 0.5)));
  let helmet = 'light';
  let vest = 'light';
  switch (role) {
    case 'lmg':
    case 'commander':
      helmet = 'heavy'; vest = 'heavy';
      break;
    case 'shotgun':
    case 'heavy':
    case 'rocket':
      helmet = 'heavy'; vest = i > 0.25 || u < 0.5 ? 'heavy' : 'light';
      break;
    case 'sniper':
      helmet = 'none'; vest = 'light';
      break;
    case 'smg':
      helmet = u < 0.5 ? 'none' : 'light';
      vest = i > 0.6 && w < 0.5 ? 'light' : 'none';
      break;
    default: // rifleman and anything unknown
      helmet = i < 0.2 && u < 0.35 ? 'none' : i > 0.7 && w < 0.3 ? 'heavy' : 'light';
      vest = i > 0.55 && u < (i - 0.45) * 0.8 ? 'heavy' : 'light';
      break;
  }
  return { helmet, vest };
}

function frac(x) {
  return x - Math.floor(x);
}
