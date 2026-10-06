import * as THREE from 'three';
import { Assembly, box, blob, latheZ, tubeZ, rodZ, extrude, roundRect } from './geometry.js';
import { addMuzzleDevice, addScrew, addForeGrip, buildOptic, buildMiniReflex } from './parts.js';
import { addSuppressor } from './kit.js';
import { buildHoloAt } from './models/carbine.js';
import { AMMO, ammoDef, ammoFor, DEFAULT_AMMO } from './ammo.js';

/**
 * GUNSMITH — weapon attachments (docs/EXPANSION.md §10.2).
 *
 *   ATTACHMENTS[id] = { id, slot, label, desc, mods, model }
 *
 * `mods` are MULTIPLIERS on the weapon def (1 = unchanged) unless noted:
 *   adsTime, adsFov, adsSens   handling and zoom (adsFov multiplies def.adsFov)
 *   spreadHip, spreadAds       the accuracy cone
 *   recoil                     every recoil term (camera climb, kick, punch)
 *   magSize, reloadTime        capacity (rounded, reserve keeps its magazines)
 *                              and the reload clip's duration
 *   range, velocity            max range (damage falloff distance), muzzle velocity
 *   noise                      the weapon:fire hearing radius AI perception uses
 *   moveMult                   the player's move speed while carrying it
 *   flash                      muzzle-flash scale / intensity / light
 *   laser (bool), suppressed (bool)
 *
 * `model` names the procedural mesh builder below. Every builder works in the
 * gun's own weapon space off the MOUNT POINTS each model publishes in
 * `nodes.mounts` (rail / muzzle / barrel / under / side), so one suppressor
 * fits nine guns. Meshes are built lazily on first equip and cached per gun.
 *
 * Which gun takes what is the def's `allows: { slot: [ids] }` (defs.js).
 * `null` in a slot is the gun's stock part (its own optic, muzzle device...).
 * With every slot null and FMJ, `applyKit` returns a def identical to the stock
 * one, so the gun feels exactly as it always has.
 */

export const SLOTS = ['optic', 'muzzle', 'barrel', 'underbarrel', 'magazine', 'laser'];
export const SLOT_LABELS = {
  optic: 'OPTIC',
  muzzle: 'MUZZLE',
  barrel: 'BARREL',
  underbarrel: 'UNDERBARREL',
  magazine: 'MAGAZINE',
  laser: 'LASER',
  ammo: 'AMMUNITION',
};

export const ATTACHMENTS = {
  /* ---------------------------------------------------------------- optic */
  reddot: {
    id: 'reddot', slot: 'optic', label: 'MINI REFLEX', model: 'reddot',
    desc: 'Open reflex sight on a riser. Small window, fast to the eye.',
    mods: { adsTime: 0.95 },
  },
  holo: {
    id: 'holo', slot: 'optic', label: 'HOLOGRAPHIC SIGHT', model: 'holo',
    desc: 'Circle-dot holographic. A bigger window and a little more weight.',
    mods: { adsTime: 1.04, adsFov: 0.97 },
  },
  acog: {
    id: 'acog', slot: 'optic', label: '3X COMBAT SCOPE', model: 'acog',
    desc: 'Fixed 3x prism scope with a chevron. Reach at the cost of speed.',
    mods: { adsTime: 1.2, adsFov: 0.5, adsSens: 0.6, spreadAds: 0.8, moveMult: 0.99 },
  },
  /* --------------------------------------------------------------- muzzle */
  suppressor: {
    id: 'suppressor', slot: 'muzzle', label: 'SUPPRESSOR', model: 'suppressor',
    desc: 'Hides the flash and most of the report. Hostiles hear it a quarter as far.',
    mods: { noise: 0.28, flash: 0.28, range: 0.88, velocity: 0.95, adsTime: 1.06, recoil: 0.95, suppressed: true },
  },
  compensator: {
    id: 'compensator', slot: 'muzzle', label: 'COMPENSATOR', model: 'compensator',
    desc: 'Ported to push the muzzle down. Less climb, more noise and flash.',
    mods: { recoil: 0.84, noise: 1.1, flash: 1.15 },
  },
  flashhider: {
    id: 'flashhider', slot: 'muzzle', label: 'FLASH HIDER', model: 'flashhider',
    desc: 'Three-prong hider. Keeps the flash out of your eyes and theirs.',
    mods: { flash: 0.4, recoil: 0.96 },
  },
  /* --------------------------------------------------------------- barrel */
  longbarrel: {
    id: 'longbarrel', slot: 'barrel', label: 'LONG BARREL', model: 'barrel', ext: 0.065,
    desc: 'More barrel, more velocity, more range. Slower to bring up.',
    mods: { range: 1.28, velocity: 1.08, adsTime: 1.08, moveMult: 0.98, spreadHip: 1.08, recoil: 0.95 },
  },
  shortbarrel: {
    id: 'shortbarrel', slot: 'barrel', label: 'SHORT BARREL', model: 'barrel', ext: -0.035,
    desc: 'Cut down for rooms. Handles faster, reaches less.',
    mods: { range: 0.8, velocity: 0.93, adsTime: 0.88, moveMult: 1.02, spreadHip: 0.9, recoil: 1.06 },
  },
  /* ---------------------------------------------------------- underbarrel */
  vgrip: {
    id: 'vgrip', slot: 'underbarrel', label: 'VERTICAL GRIP', model: 'vgrip',
    desc: 'Something to hold on to. Tames the climb.',
    mods: { recoil: 0.82, adsTime: 1.04, spreadHip: 0.95 },
  },
  agrip: {
    id: 'agrip', slot: 'underbarrel', label: 'ANGLED GRIP', model: 'agrip',
    desc: 'Angled foregrip. Snaps to the sight faster.',
    mods: { adsTime: 0.86, recoil: 0.94 },
  },
  /* ------------------------------------------------------------- magazine */
  extmag: {
    id: 'extmag', slot: 'magazine', label: 'EXTENDED MAGAZINE', model: 'extmag',
    desc: 'A third more rounds. A third more magazine to swap.',
    mods: { magSize: 1.34, reloadTime: 1.12, adsTime: 1.05, moveMult: 0.99 },
  },
  fastmag: {
    id: 'fastmag', slot: 'magazine', label: 'FAST MAG', model: 'fastmag',
    desc: 'Pull-tab baseplates. Reloads about a quarter faster.',
    mods: { reloadTime: 0.72 },
  },
  /* ---------------------------------------------------------------- laser */
  laser: {
    id: 'laser', slot: 'laser', label: 'LASER SIGHT', model: 'laser',
    desc: 'Visible laser. Tighter hip fire; also tells everyone where you are pointing.',
    mods: { spreadHip: 0.72, laser: true },
  },
};

/** Empty kit (stock gun, FMJ). */
export function emptyKit() {
  return { optic: null, muzzle: null, barrel: null, underbarrel: null, magazine: null, laser: null, ammo: DEFAULT_AMMO };
}

/**
 * Sanitise a kit against a def's `allows` and ammo list: unknown, disallowed
 * or wrong-slot ids become null; ammo falls back to FMJ.
 */
export function resolveKit(def, kit) {
  const out = emptyKit();
  const allows = def?.allows ?? {};
  if (kit && typeof kit === 'object') {
    for (const s of SLOTS) {
      const id = kit[s];
      const a = typeof id === 'string' ? ATTACHMENTS[id] : null;
      if (a && a.slot === s && Array.isArray(allows[s]) && allows[s].includes(id)) out[s] = id;
    }
    const types = ammoFor(def);
    if (typeof kit.ammo === 'string' && types.includes(kit.ammo)) out.ammo = kit.ammo;
  }
  if (!ammoFor(def).length) out.ammo = DEFAULT_AMMO;
  return out;
}

/**
 * The modded def: a NEW object built from the normalised stock def, the kit's
 * attachment mods and the ammo type. Called on loadout, never per frame.
 */
export function applyKit(base, kitIn) {
  const kit = resolveKit(base, kitIn);
  const d = { ...base, recoil: { ...base.recoil } };
  const m = {
    adsTime: 1, adsFov: 1, adsSens: 1, spreadHip: 1, spreadAds: 1, recoil: 1, magSize: 1,
    reloadTime: 1, range: 1, velocity: 1, noise: 1, moveMult: 1, flash: 1, laser: false, suppressed: false,
  };
  for (const s of SLOTS) {
    const a = kit[s] ? ATTACHMENTS[kit[s]] : null;
    if (!a) continue;
    for (const [k, v] of Object.entries(a.mods)) {
      if (typeof v === 'boolean') m[k] = m[k] || v;
      else m[k] *= v;
    }
  }
  const ammo = ammoDef(kit.ammo);
  d.adsTime = base.adsTime * m.adsTime;
  d.adsFov = base.adsFov * m.adsFov;
  d.adsSens = m.adsSens !== 1 ? m.adsSens : undefined;
  d.spreadHip = base.spreadHip * m.spreadHip;
  d.spreadAds = base.spreadAds * m.spreadAds;
  if (base.pelletSpread !== undefined && m.spreadHip !== 1) d.pelletSpread = base.pelletSpread * Math.sqrt(m.spreadHip);
  if (m.recoil !== 1) {
    const r = d.recoil;
    r.pitch *= m.recoil;
    r.yaw *= m.recoil;
    r.kickBack *= m.recoil;
    r.kickUp *= m.recoil;
    r.roll *= m.recoil;
    r.punch *= m.recoil;
  }
  if (m.magSize !== 1 && !base.projectile) {
    d.magSize = Math.max(base.magSize + 1, Math.round(base.magSize * m.magSize));
    d.reserve = Math.round((base.reserve * d.magSize) / base.magSize);
  }
  d.reloadMult = m.reloadTime;
  d.maxRange = base.maxRange * m.range * ammo.rangeMult;
  d.muzzleVelocity = base.muzzleVelocity * m.velocity * ammo.velocityMult;
  d.noise = base.noise * m.noise * ammo.noiseMult;
  d.moveMult = base.moveMult * m.moveMult;
  if (m.flash !== 1) {
    d.flashScale = (base.flashScale ?? 1) * m.flash;
    d.flashIntensity = (base.flashIntensity ?? 1) * m.flash;
    d.flashLight = (base.flashLight ?? 1) * m.flash;
  }
  if (m.suppressed && !base.suppressed) {
    d.suppressed = true;
    d.audio = 'suppressed';
  }
  d.laser = m.laser;
  // Ammunition: damage and the wall budget are applied to the round itself;
  // flesh / armour terms ride on the payload for src/combat/armor.js.
  d.damage = base.damage * ammo.dmgMult;
  d.penetration = base.penetration * ammo.penetrationMult;
  if (!ammo.tracer) d.tracerEvery = 0;
  d.tracerWarm = ammo.tracer?.warm ?? 1;
  d.ammo = ammo;
  d.kit = kit;
  d.baseId = base.id;
  return d;
}

/** True when the kit changes nothing (stock gun, FMJ). */
export function isStockKit(kit) {
  if (!kit) return true;
  for (const s of SLOTS) if (kit[s]) return false;
  return !kit.ammo || kit.ammo === DEFAULT_AMMO;
}

/* ========================================================================== */
/*  stat bars (menu)                                                          */
/* ========================================================================== */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Normalised 0..1 stats for the GUNSMITH bars (higher is better), plus the raw
 * numbers. Menu-time only (allocates).
 */
export function statsOf(d) {
  const dmg = d.projectile ? d.projectile.damage : d.damage * (d.pellets ?? 1);
  const reload = (d.reloadTac ?? 2) * (d.reloadMult ?? 1);
  return [
    { key: 'damage', label: 'DAMAGE', v: clamp01(dmg / 220), raw: Math.round(dmg) },
    { key: 'range', label: 'RANGE', v: clamp01(Math.sqrt(d.maxRange / 1000)), raw: `${Math.round(d.maxRange)} M` },
    { key: 'accuracy', label: 'HIP FIRE', v: clamp01(1 - d.spreadHip / 7), raw: `${d.spreadHip.toFixed(2)}°` },
    { key: 'control', label: 'CONTROL', v: clamp01(1 - Math.sqrt(d.recoil.pitch / 0.05)), raw: (d.recoil.pitch * 1000).toFixed(1) },
    { key: 'handling', label: 'AIM SPEED', v: clamp01(1 - d.adsTime / 0.65), raw: `${Math.round(d.adsTime * 1000)} MS` },
    { key: 'zoom', label: 'ZOOM', v: clamp01(d.scope ? 1 : (1 / Math.max(0.2, d.adsFov) - 1) / 2.2), raw: d.scope ? 'SCOPE' : `${(1 / d.adsFov).toFixed(1)}X` },
    { key: 'mobility', label: 'MOBILITY', v: clamp01((d.moveMult - 0.75) / 0.33), raw: `${Math.round(d.moveMult * 100)}%` },
    { key: 'stealth', label: 'STEALTH', v: clamp01(1 - d.noise / 180), raw: `${Math.round(d.noise)} M` },
    { key: 'reload', label: 'RELOAD', v: clamp01(1 - reload / 6.5), raw: `${reload.toFixed(1)} S` },
    { key: 'mag', label: 'MAGAZINE', v: clamp01(d.magSize / 100), raw: d.magSize },
  ];
}

/** The menu's view of what a gun takes: [{ slot, label, options:[{id,label,desc}] }]. */
export function slotOptions(def) {
  const out = [];
  for (const s of SLOTS) {
    const ids = def?.allows?.[s] ?? [];
    if (!ids.length) continue;
    const opts = [{ id: null, label: s === 'optic' && def.scope ? 'STOCK SCOPE' : 'STOCK', desc: 'As issued.' }];
    for (const id of ids) {
      const a = ATTACHMENTS[id];
      if (a) opts.push({ id, label: a.label, desc: a.desc });
    }
    out.push({ slot: s, label: SLOT_LABELS[s], options: opts });
  }
  const ammo = ammoFor(def);
  if (ammo.length) {
    out.push({
      slot: 'ammo',
      label: SLOT_LABELS.ammo,
      options: ammo.map((id) => ({ id, label: AMMO[id].label, desc: AMMO[id].desc, tag: AMMO[id].tag })),
    });
  }
  return out;
}

/* ========================================================================== */
/*  meshes                                                                    */
/* ========================================================================== */

/**
 * Builders: (asm, mounts, ctx) -> info | null. They author in the gun's weapon
 * space (metres, +Y up, -Z to the muzzle) in the same material vocabulary as
 * the models, and return whatever the rig needs from the part (a sight node
 * and reticle glass for optics, a crown for muzzle devices, an emitter for the
 * laser).
 */
const BUILD = {
  reddot(asm, M) {
    const m = M.rail;
    if (!m) return null;
    const riserH = 0.019;
    const len = 0.05;
    // Riser block with a Picatinny clamp, and the reflex sight on top of it.
    const riser = box(0.026, riserH, len, 0.0016, 2);
    asm.add(riser, 'alu', { y: m.y + riserH / 2, z: m.z });
    riser.dispose();
    const lighten = box(0.027, 0.006, 0.026, 0.0008, 1);
    asm.add(lighten, 'cavity', { y: m.y + riserH * 0.45, z: m.z });
    lighten.dispose();
    for (const sx of [-1, 1]) {
      const jaw = box(0.0045, 0.0085, len * 0.86, 0.0008, 1);
      asm.add(jaw, 'alu', { x: sx * 0.0128, y: m.y - 0.0028, z: m.z });
      jaw.dispose();
    }
    addScrew(asm, 'steel', 0.0152, m.y - 0.003, m.z - 0.012, 0.0026, 'x', 0.008);
    addScrew(asm, 'steel', 0.0152, m.y - 0.003, m.z + 0.012, 0.0026, 'x', 0.008);
    const r = buildMiniReflex(asm, { y: m.y + riserH - 0.0022, z: m.z, matBody: 'alu_fine' });
    return {
      sight: r.center,
      optic: { style: 'dot', center: r.center, lensZ: r.lensZ, apertureR: r.apertureR },
      eyeRelief: 0.135,
    };
  },

  holo(asm, M) {
    const m = M.rail;
    if (!m) return null;
    const r = buildHoloAt(asm, m.y, m.z - 0.03);
    return { sight: r.sight, optic: r.optic, eyeRelief: 0.105 };
  },

  acog(asm, M) {
    const m = M.rail;
    if (!m) return null;
    const rTube = 0.0165;
    const y = m.y + 0.0335;
    const z = m.z;
    const o = buildOptic(asm, {
      rTube, len: 0.074, hood: 0.016, y, z, railTop: m.y, matBody: 'alu_fine', matSteel: 'steel',
    });
    // Prism housing: the squared body a 3x combat scope is known by, with the
    // forged top ridge carrying the ambient-light fibre.
    const housing = box(0.03, 0.024, 0.044, 0.004, 3);
    asm.add(housing, 'alu_fine', { y: y + 0.002, z: z + 0.004 });
    housing.dispose();
    const ridge = box(0.011, 0.007, 0.06, 0.002, 2);
    asm.add(ridge, 'alu_fine', { y: y + rTube + 0.004, z });
    ridge.dispose();
    const fibre = rodZ(0.0016, 0.0016, 0.05, 10, 0.0003);
    asm.add(fibre, 'copper', { y: y + rTube + 0.0078, z });
    fibre.dispose();
    for (const tx of [0, 1]) {
      const turret = latheZ([[0, 0], [0, 0.0072], [0.0008, 0.0078], [0.009, 0.0078], [0.0098, 0.0068], [0.0098, 0]], 20);
      if (tx) asm.add(turret, 'alu_fine', { x: 0.015, y, z: z + 0.004, ry: Math.PI / 2 });
      else asm.add(turret, 'alu_fine', { y: y + 0.013, z: z + 0.004, rx: -Math.PI / 2 });
      turret.dispose();
    }
    return {
      sight: [0, y, o.lensZ],
      optic: { style: 'chevron', center: [0, y, z], lensZ: o.lensZ, apertureR: o.apertureR },
      eyeRelief: 0.085,
    };
  },

  suppressor(asm, M) {
    const m = M.muzzle;
    if (!m) return null;
    const small = m.pistol === true;
    const r = small ? 0.0158 : Math.min(0.022, Math.max(0.0172, m.r * 2.25));
    const len = small ? 0.13 : Math.min(0.2, Math.max(0.155, m.r * 19));
    // Thread mount, then the can, its index band and a fluted front cap.
    const mount = tubeZ(m.r + 0.0026, m.r * 0.7, 0.014, 24, 0.0004);
    asm.add(mount, 'steel_black', { y: m.y, z: m.z - 0.007 });
    mount.dispose();
    const crown = addSuppressor(asm, m.z - 0.006, m.y, { len, r, mat: 'steel_black' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const flute = box(0.0024, 0.0012, len * 0.5, 0.0004, 1);
      asm.add(flute, 'cavity', {
        x: Math.sin(a) * (r - 0.0002), y: m.y + Math.cos(a) * (r - 0.0002), z: m.z - 0.006 - len * 0.55, rz: -a,
      });
      flute.dispose();
    }
    return { crown };
  },

  compensator(asm, M) {
    const m = M.muzzle;
    if (!m) return null;
    const d = addMuzzleDevice(asm, 'steel_black', 'cavity', 'comp', m.z, m.r, m.y);
    return { crown: d.crownZ };
  },

  flashhider(asm, M) {
    const m = M.muzzle;
    if (!m) return null;
    const len = 0.052;
    const rOut = m.r + 0.0036;
    // Threaded base with wrench flats, then three tines with the slots between.
    const base = latheZ(
      [[0, m.r * 0.7], [0, m.r + 0.0012], [0.003, rOut], [0.016, rOut], [0.019, rOut * 0.92], [0.019, m.r * 0.7]],
      28
    );
    asm.add(base, 'steel_soot', { y: m.y, z: m.z, ry: Math.PI });
    base.dispose();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
      const tine = box(0.0048, 0.0032, len - 0.019, 0.0009, 1);
      asm.add(tine, 'steel_soot', {
        x: Math.sin(a) * (rOut - 0.0016), y: m.y + Math.cos(a) * (rOut - 0.0016), z: m.z - 0.019 - (len - 0.019) / 2, rz: -a,
      });
      tine.dispose();
    }
    const bore = tubeZ(m.r * 0.75, m.r * 0.5, len - 0.02, 14, 0.0002);
    asm.add(bore, 'cavity', { y: m.y, z: m.z - 0.019 - (len - 0.02) / 2 });
    bore.dispose();
    return { crown: m.z - len };
  },

  vgrip(asm, M) {
    const m = M.under;
    if (!m) return null;
    const clamp = box(0.022, 0.009, 0.036, 0.0014, 2);
    asm.add(clamp, 'polymer', { y: m.y - 0.003, z: m.z });
    clamp.dispose();
    addScrew(asm, 'steel', 0.0118, m.y - 0.003, m.z, 0.0024, 'x', 0.006);
    addForeGrip(asm, 'polymer', 'rubber', { y: m.y - 0.009, z: m.z + 0.004, angle: 0.1, len: 0.068 });
    const cap = blob(0.024, 0.008, 0.028, 0.0035, 3);
    asm.add(cap, 'polymer', { y: m.y - 0.083, z: m.z + 0.012, rx: 0.1 });
    cap.dispose();
    return {};
  },

  agrip(asm, M) {
    const m = M.under;
    if (!m) return null;
    // Profile in (forward, up): deep at the rear thumb shelf, tapering forward.
    const prof = [
      [-0.038, 0], [0.042, 0], [0.04, -0.006], [0.012, -0.016], [-0.026, -0.034], [-0.036, -0.032], [-0.041, -0.022],
    ];
    const g = extrude(prof, 0.022, { bevel: 0.0026, bevelSegments: 2 });
    asm.add(g, 'polymer', { y: m.y - 0.004, z: m.z, ry: Math.PI / 2 });
    g.dispose();
    const rail = box(0.016, 0.005, 0.07, 0.0012, 1);
    asm.add(rail, 'polymer', { y: m.y - 0.0015, z: m.z });
    rail.dispose();
    for (let i = 0; i < 4; i++) {
      const rib = box(0.0235, 0.0014, 0.004, 0.0005, 1);
      asm.add(rib, 'rubber', { y: m.y - 0.012 - i * 0.005, z: m.z + 0.012 + i * 0.008, rx: 0.55 });
      rib.dispose();
    }
    return {};
  },

  laser(asm, M) {
    const m = M.side;
    if (!m) return null;
    const under = !m.s;
    const w = 0.016, h = 0.017, len = 0.042;
    const cx = under ? 0 : m.x + m.s * (w / 2 + 0.0015);
    const cy = under ? m.y - h / 2 - 0.0005 : m.y;
    const cz = m.z;
    const housing = box(under ? 0.022 : w, h, len, 0.0022, 2);
    asm.add(housing, 'polymer', { x: cx, y: cy, z: cz });
    housing.dispose();
    // Clamp to the rail / handguard, two adjustment drums, the emitter bezel.
    const clamp = box(under ? 0.018 : 0.004, under ? 0.004 : 0.012, len * 0.7, 0.0008, 1);
    asm.add(clamp, 'alu', { x: under ? 0 : m.x + m.s * 0.0008, y: under ? m.y + 0.0012 : m.y, z: cz + 0.003 });
    clamp.dispose();
    const drum = latheZ([[0, 0], [0, 0.0034], [0.0006, 0.0038], [0.004, 0.0038], [0.004, 0]], 14);
    asm.add(drum, 'steel_black', { x: cx, y: cy + h / 2, z: cz + 0.008, rx: -Math.PI / 2 });
    asm.add(drum, 'steel_black', { x: cx + (under ? 0.011 : m.s * (w / 2)), y: cy, z: cz + 0.008, ry: (under ? 1 : m.s) * Math.PI / 2 });
    drum.dispose();
    const zFront = cz - len / 2;
    const bezel = tubeZ(0.0052, 0.0036, 0.006, 18, 0.0004);
    asm.add(bezel, 'alu', { x: cx, y: cy - (under ? 0.002 : 0), z: zFront - 0.002 });
    bezel.dispose();
    const lens = rodZ(0.0036, 0.0036, 0.001, 18, 0.0002);
    asm.add(lens, 'glass', { x: cx, y: cy - (under ? 0.002 : 0), z: zFront - 0.003 });
    lens.dispose();
    return { emitter: [cx, cy - (under ? 0.002 : 0), zFront - 0.004] };
  },

  fastmag(asm, M, floor) {
    if (!floor) return null;
    // Pull loop under the baseplate, in magazine space.
    const loop = extrude(roundRect(0.022, 0.017, 0.005, 3), 0.0042, {
      bevel: 0.0009, holes: [roundRect(0.013, 0.008, 0.0032, 3).reverse()],
    });
    asm.add(loop, 'rubber', { x: floor.x, y: floor.y - 0.0085, z: floor.z, ry: Math.PI / 2 });
    loop.dispose();
    const plate = box(0.02, 0.004, 0.03, 0.0012, 1);
    asm.add(plate, 'polymer', { x: floor.x, y: floor.y - 0.0005, z: floor.z });
    plate.dispose();
    return {};
  },
};

/* ========================================================================== */
/*  the rig: applies a kit to a viewmodel entry                               */
/* ========================================================================== */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Laser beam segments: [length m, opacity] from the emitter out. */
const BEAM = [
  [0.35, 0.55],
  [0.8, 0.3],
  [1.8, 0.14],
  [4.0, 0.06],
];

export class Gunsmith {
  /**
   * @param {object} ctx
   * @param {import('./viewmodel.js').Viewmodel} vm
   * @param {object} mats WeaponMaterials
   */
  constructor(ctx, vm, mats) {
    this.ctx = ctx;
    this.vm = vm;
    this.mats = mats;
    this._owned = [];
    this.laserOn = false;
    this._laserEntry = null;
    this.dotVisible = false;
    this._hitPayload = null;

    // Laser beam: four additive segments with stepped opacity (one program,
    // the reticle's), built once and reparented onto the active laser.
    this.beam = new THREE.Object3D();
    this.beam.name = 'ow-laser-beam';
    this.beamSegs = [];
    let z = 0;
    for (let i = 0; i < BEAM.length; i++) {
      const [len, op] = BEAM[i];
      const g = new THREE.CylinderGeometry(0.00085, 0.00085 + len * 0.0005, len, 6, 1, true);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, -z - len / 2);
      this._owned.push(g);
      const mesh = new THREE.Mesh(g, mats.reticle(0xff1408 + i, 1.6 * op));
      mesh.frustumCulled = false;
      mesh.userData.owNoPrepass = true;
      mesh.userData.owNoShadow = true;
      mesh.renderOrder = 18;
      this.beam.add(mesh);
      this.beamSegs.push({ mesh, z0: z, len });
      z += len;
    }
    this.beamLen = z;

    // The dot, in the WORLD scene so walls occlude it properly.
    const dotGeo = new THREE.CircleGeometry(1, 16);
    const haloGeo = new THREE.CircleGeometry(2.6, 16);
    this._owned.push(dotGeo, haloGeo);
    this.dot = new THREE.Object3D();
    this.dot.name = 'ow-laser-dot';
    this.dot.visible = false;
    const core = new THREE.Mesh(dotGeo, mats.reticle(0xff1810, 4));
    const halo = new THREE.Mesh(haloGeo, mats.reticle(0xff2010, 0.5));
    for (const m of [core, halo]) {
      m.frustumCulled = false;
      m.userData.owNoPrepass = true;
      m.userData.owNoShadow = true;
      m.renderOrder = 30;
      this.dot.add(m);
    }
    ctx.scene.add(this.dot);
  }

  /** Stock values of an entry, captured the first time it is kitted. */
  _stock(w) {
    if (w.stock) return w.stock;
    const p = w.parts;
    w.stock = {
      sight: w.sight.clone(),
      ironSight: w.ironSight.clone(),
      optic: w.optic,
      muzzle: w.muzzle.clone(),
      magLen: w.magLen,
      mounts: w.model.nodes.mounts ?? {},
      groups: new Map(), // attachment id -> { group, info }
      barrelGeo: new Map(), // ext -> [geometry per barrel mesh]
      barrelMeshes: p.barrel ? p.barrel.children.filter((o) => o.isMesh) : [],
      floor: null,
    };
    if (w.stock.barrelMeshes.length) w.stock.barrelGeo.set(0, w.stock.barrelMeshes.map((m) => m.geometry));
    return w.stock;
  }

  /** Lazily build (and cache) one attachment's mesh group for an entry. */
  _group(w, id) {
    const st = this._stock(w);
    let g = st.groups.get(id);
    if (g) return g;
    const a = ATTACHMENTS[id];
    const fn = BUILD[a?.model];
    if (!fn) return null;
    const asm = new Assembly(`${w.id}-kit-${id}`);
    let parent = w.group;
    let extra = null;
    if (a.model === 'fastmag') {
      if (!w.parts.magazine) return null;
      extra = st.floor ?? (st.floor = this._magFloor(w));
      parent = w.parts.magazine;
    }
    const info = fn(asm, st.mounts, extra);
    if (!info) {
      st.groups.set(id, (g = { group: null, info: null }));
      return g;
    }
    const group = this.vm.buildAssembly(asm, parent, `${w.id}-kit-${id}`);
    group.visible = false;
    if (a.model === 'laser') group.userData.emitter = new THREE.Vector3().fromArray(info.emitter);
    st.groups.set(id, (g = { group, info }));
    return g;
  }

  /** Bottom of the magazine in magazine space: centroid of its lowest vertices. */
  _magFloor(w) {
    let minY = Infinity;
    const meshes = w.parts.magazine.children.filter((o) => o.isMesh);
    for (const m of meshes) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    }
    let n = 0;
    _v.set(0, 0, 0);
    for (const m of meshes) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < minY + 0.004) {
          _v.x += pos.getX(i);
          _v.z += pos.getZ(i);
          n++;
        }
      }
    }
    if (!n || !Number.isFinite(minY)) return null;
    return { x: _v.x / n, y: minY, z: _v.z / n };
  }

  /** Barrel geometry with everything forward of the pivot stretched by `ext`. */
  _barrelGeo(st, ext) {
    let list = st.barrelGeo.get(ext);
    if (list) return list;
    const b = st.mounts.barrel;
    const stock = st.barrelGeo.get(0);
    const exposed = b.pivot - b.end; // positive: -Z is forward
    const s = (exposed + ext) / exposed;
    list = stock.map((g0) => {
      const g = g0.clone();
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z < b.pivot) pos.setZ(i, b.pivot + (z - b.pivot) * s);
      }
      pos.needsUpdate = true;
      g.computeBoundingSphere();
      this._owned.push(g);
      return g;
    });
    st.barrelGeo.set(ext, list);
    return list;
  }

  /** How far a barrel attachment moves the crown (metres, positive = longer). */
  _ext(st, id) {
    const a = id ? ATTACHMENTS[id] : null;
    const b = st.mounts.barrel;
    if (!a || !b || !st.barrelMeshes.length) return 0;
    const exposed = b.pivot - b.end;
    return a.ext < 0 ? Math.max(a.ext, -exposed * 0.6) : a.ext;
  }

  /**
   * Put a resolved kit on a viewmodel entry: show / hide the stock parts and the
   * attachment meshes, move the muzzle node, retarget the sight. `def` is the
   * modded def (applyKit); it becomes the entry's def so the rig's ADS time,
   * eye relief and recoil follow the kit.
   */
  apply(w, def) {
    const kit = def.kit;
    const st = this._stock(w);
    const p = w.parts;
    // Hide every attachment group of this entry; the kit re-shows its own.
    for (const g of st.groups.values()) if (g.group) g.group.visible = false;
    const show = (id) => {
      if (!id) return null;
      const g = this._group(w, id);
      if (!g?.group) return null;
      g.group.visible = true;
      return g;
    };

    // ---- optic ----
    const og = show(kit.optic);
    if (p.stockOptic) p.stockOptic.visible = !og;
    if (og) {
      w.sight.fromArray(og.info.sight);
      w.ironSight.fromArray(og.info.sight);
      w.optic = og.info.optic;
    } else {
      w.sight.copy(st.sight);
      w.ironSight.copy(st.ironSight);
      w.optic = st.optic;
    }
    def.eyeRelief = og ? og.info.eyeRelief : def.eyeRelief;

    // ---- barrel ----
    const ext = this._ext(st, kit.barrel);
    if (st.barrelMeshes.length) {
      const geos = this._barrelGeo(st, ext);
      st.barrelMeshes.forEach((m, i) => (m.geometry = geos[i]));
    }
    const dz = -ext;

    // ---- muzzle ----
    const mg = show(kit.muzzle);
    if (p.stockMuzzle) {
      p.stockMuzzle.visible = !mg;
      p.stockMuzzle.position.z = dz;
    }
    if (mg) {
      mg.group.position.z = dz;
      w.muzzle.set(st.muzzle.x, st.mounts.muzzle.y, mg.info.crown + dz);
    } else {
      w.muzzle.copy(st.muzzle);
      w.muzzle.z += dz;
    }

    // ---- underbarrel ----
    show(kit.underbarrel);

    // ---- magazine ----
    if (p.magazine) {
      const ext = kit.magazine === 'extmag';
      p.magazine.scale.set(1, ext ? 1.3 : 1, 1);
      w.magLen = st.magLen * (ext ? 1.3 : 1);
      if (kit.magazine === 'fastmag') show('fastmag');
    }

    // ---- laser ----
    const lg = show(kit.laser);
    w.laserGroup = lg?.group ?? null;

    w.def = def;
    if (this.vm.active === w) this.onActive(w);
    return def;
  }

  /** The active weapon changed: move the beam onto its laser. */
  onActive(w) {
    const lg = w?.laserGroup ?? null;
    this._laserEntry = lg ? w : null;
    this.laserOn = !!lg;
    if (lg) {
      lg.add(this.beam);
      this.beam.position.copy(lg.userData.emitter);
    } else {
      this.beam.removeFromParent();
      this.dot.visible = false;
    }
  }

  /**
   * Per frame, after the rig has posed: clip the beam at the first surface and
   * put the dot on it. One raycast, no allocation.
   */
  update(physics, show) {
    const w = this.vm.active;
    if (this._laserEntry !== w) this.onActive(w);
    if (!this.laserOn || !show) {
      this.dot.visible = false;
      return;
    }
    const lg = w.laserGroup;
    _o.copy(lg.userData.emitter).applyMatrix4(lg.matrixWorld);
    _d.set(0, 0, -1).transformDirection(lg.matrixWorld).normalize();
    let dist = 80;
    let hit = null;
    if (physics?.raycast) {
      hit = physics.raycast(_o, _d, dist, physics.MASK?.BULLET);
      if (hit?.hit) dist = hit.distance;
      else hit = null;
    }
    // A wall inside the beam: the segment that crosses it is cut to length.
    for (const s of this.beamSegs) {
      s.mesh.visible = s.z0 < dist;
      s.mesh.scale.z = 1;
      if (s.z0 < dist && s.z0 + s.len > dist) {
        const k = (dist - s.z0) / s.len;
        // Segments are authored centred on their own span; rescale about z0.
        s.mesh.scale.z = k;
        s.mesh.position.z = -s.z0 * (1 - k);
      } else {
        s.mesh.position.z = 0;
      }
    }
    if (hit && dist < 79) {
      const cam = this.ctx.camera;
      this.dot.visible = true;
      if (hit.normal) _v.copy(hit.normal);
      else _v.copy(_d).negate();
      this.dot.position.copy(hit.point).addScaledVector(_v, 0.006);
      _v2.copy(cam.position);
      this.dot.lookAt(_v2);
      const camD = this.dot.position.distanceTo(cam.position);
      this.dot.scale.setScalar(0.0045 + camD * 0.0009);
    } else {
      this.dot.visible = false;
    }
  }

  dispose() {
    this.dot.removeFromParent();
    this.beam.removeFromParent();
    for (const g of this._owned) g.dispose();
    this._owned.length = 0;
  }
}

export { AMMO };
