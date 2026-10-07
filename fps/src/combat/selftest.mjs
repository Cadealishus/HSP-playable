#!/usr/bin/env node
/**
 * Armour self-test: resolveDamage over every zone x tier x ammo, plus the
 * rules the contract promises (EXPANSION §10.3). Pure node, no browser.
 *
 *   node src/combat/selftest.mjs          tables + checks
 *   node src/combat/selftest.mjs --quiet  checks only
 */
import {
  ARMOR, ARMOR_TIERS, createArmor, resolveDamage, armorForRole, armorMoveMult, restoreArmor,
} from './armor.js';
import { AMMO } from '../weapons/ammo.js';

const quiet = process.argv.includes('--quiet');
const AMMOS = Object.keys(AMMO);
const ZONES = ['head', 'torso', 'limb'];
let fails = 0;
const check = (name, ok, got = '') => {
  if (!ok) fails++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${got !== '' ? `  (${got})` : ''}`);
};
const hit = (amount, zone, ammo, armor, kind) => ({ ...resolveDamage({ amount, zone, ammo, armor, kind }, {}) });

/* ---- tables: one fresh plate per cell, a 33-damage rifle round (Doug's carbine) ---- */
for (const amount of [33, 132]) {
  if (quiet) break;
  console.log(`\nresolveDamage, ${amount} damage, fresh armour: health dealt / plate wear${amount === 132 ? '  (132 = a rifle headshot at x4)' : ''}`);
  console.log('zone   tier   ' + AMMOS.map((a) => a.padEnd(13)).join(''));
  for (const zone of ZONES) {
    for (const t of ARMOR_TIERS) {
      const cells = AMMOS.map((am) => {
        const r = hit(amount, zone, AMMO[am], createArmor(t, t));
        return `${r.health.toFixed(1)}/${r.armorDamage.toFixed(0)}${r.deflected ? 'D' : ''}${r.broke ? 'B' : ''}`.padEnd(13);
      });
      console.log(`${zone.padEnd(7)}${t.padEnd(7)}${cells.join('')}`);
    }
  }
}

/* ---- the rules ---- */
// limbs are never covered
for (const t of ARMOR_TIERS) check(`limb ignores ${t} armour`, hit(30, 'limb', 'fmj', createArmor(t, t)).health === 30);
// bare flesh: hollow point bites harder, AP a little less
check('hp on bare torso x1.25', Math.abs(hit(40, 'torso', AMMO.hp, createArmor('none', 'none')).health - 50) < 1e-9);
check('ap on bare torso x0.9', Math.abs(hit(40, 'torso', AMMO.ap, createArmor('none', 'none')).health - 36) < 1e-9);
// hollow point is WEAK against plates: worse than fmj into a heavy vest
{
  const f = hit(33, 'torso', AMMO.fmj, createArmor('light', 'heavy')).health;
  const h = hit(33, 'torso', AMMO.hp, createArmor('light', 'heavy')).health;
  const a = hit(33, 'torso', AMMO.ap, createArmor('light', 'heavy')).health;
  check('heavy vest: hp < fmj < ap', h < f && f < a, `hp ${h.toFixed(1)} fmj ${f.toFixed(1)} ap ${a.toFixed(1)}`);
}
// AP ignores most protection
{
  const a = hit(33, 'torso', AMMO.ap, createArmor('light', 'heavy')).health;
  check('ap through a heavy vest keeps > 75 % of the round', a > 33 * 0.75, a.toFixed(1));
}
// incendiary hands back a burn
{
  const r = hit(30, 'torso', AMMO.incendiary, createArmor('light', 'light'));
  check('incendiary returns a burn DOT', r.burnDps === 9 && r.burnDur === 2.5, `${r.burnDps}/${r.burnDur}`);
  const f = hit(9, 'torso', null, createArmor('light', 'heavy'), 'fire');
  check('fire gets only a fraction of vest protection', f.health > 9 * 0.9 && f.health < 9, f.health.toFixed(2));
}
// plates break
{
  const A = createArmor('light', 'light');
  let n = 0, broke = false;
  while (!broke && n < 20) { broke = hit(33, 'torso', AMMO.fmj, A).broke; n++; }
  check('light vest breaks after 2 carbine rounds', broke && n === 2 && A.vest.hp === 0, `${n} rounds`);
  check('broken vest no longer protects', hit(33, 'torso', AMMO.fmj, A).health === 33);
  restoreArmor(A);
  check('restoreArmor refills plates', A.vest.hp === ARMOR.vest.light.hp && A.helmet.hp === ARMOR.helmet.light.hp);
}
// heavy helmet saves ONE sniper headshot, then breaks
{
  const A = createArmor('heavy', 'light');
  const sniperHead = 125 * 4; // defs sniper damage x the head hitbox scale
  const r1 = hit(sniperHead, 'head', AMMO.fmj, A);
  check('heavy helmet deflects a sniper headshot', r1.deflected && r1.health <= 40 && r1.broke, `dealt ${r1.health}, broke ${r1.broke}`);
  const r2 = hit(sniperHead, 'head', AMMO.fmj, A);
  check('the second sniper headshot goes through', r2.health === sniperHead && !r2.deflected);
  const B = createArmor('heavy', 'light');
  const r3 = hit(sniperHead, 'head', AMMO.ap, B);
  check('AP is not deflected by a heavy helmet', !r3.deflected && r3.health > 100, r3.health.toFixed(0));
  const C = createArmor('light', 'light');
  check('a light helmet does not save a sniper headshot', hit(sniperHead, 'head', AMMO.fmj, C).health > 100);
}
// default balance: Doug's carbine (33) shots to kill a 100 hp bot, light kit vs none
{
  const stk = (amount, zone, h, v) => {
    const A = createArmor(h, v);
    let hp = 100, n = 0;
    while (hp > 0 && n < 50) { hp -= hit(amount, zone, AMMO.fmj, A).health; n++; }
    return n;
  };
  for (const dmg of [33, 28, 24, 22]) {
    const a = stk(dmg, 'torso', 'none', 'none'), b = stk(dmg, 'torso', 'light', 'light');
    check(`light vest: ${dmg}-dmg torso shots-to-kill ${a} -> ${b} (at most +1)`, b - a <= 1);
  }
  // incoming bot rounds on Doug: 17 a hit
  const a = stk(17, 'torso', 'none', 'none'), b = stk(17, 'torso', 'light', 'light');
  check(`bot rounds on Doug (17): hits to kill ${a} -> ${b} with the default kit (at most +1)`, b - a <= 1);
  check('head rifle shot still kills through a light helmet', stk(132, 'head', 'light', 'light') === 1);
}
// explosions: torso, low protection
{
  const r = hit(100, 'head', null, createArmor('heavy', 'heavy'), 'blast');
  check('blast counts as torso with reduced vest protection', r.slot === 'vest' && r.health > 80 && r.health < 100, r.health.toFixed(1));
  check('melee ignores armour', hit(50, 'torso', null, createArmor('heavy', 'heavy'), 'melee').health === 50);
}
// move cost
check('light kit costs no speed', armorMoveMult(createArmor('light', 'light')) === 1);
check('heavy kit is slower, none is faster', armorMoveMult(createArmor('heavy', 'heavy')) < 0.9 && armorMoveMult(createArmor('none', 'none')) > 1);
// bots by role
{
  const lmg = armorForRole('lmg', 'hostile', 0.1, 3);
  const cmd = armorForRole('commander', 'hostile', 0.1, 5);
  check('LMG and commander wear heavy kit', lmg.helmet === 'heavy' && lmg.vest === 'heavy' && cmd.helmet === 'heavy' && cmd.vest === 'heavy');
  let early = 0, late = 0;
  for (let i = 0; i < 200; i++) {
    if (armorForRole('rifleman', 'hostile', 0.1, i).vest === 'heavy') early++;
    if (armorForRole('rifleman', 'hostile', 0.95, i).vest === 'heavy') late++;
  }
  check('riflemen get heavier in later waves', early === 0 && late > 40, `heavy vests ${early} early, ${late}/200 late`);
}
// a mutated scratch result must not leak: no allocation per call
{
  const A = createArmor('light', 'light');
  const r1 = resolveDamage({ amount: 10, zone: 'torso', ammo: 'fmj', armor: A });
  const r2 = resolveDamage({ amount: 20, zone: 'limb', ammo: 'fmj', armor: A });
  check('resolveDamage reuses its scratch result (no per-call allocation)', r1 === r2);
}

console.log(`\n${fails ? `${fails} FAILED` : 'all armour checks pass'}`);
process.exitCode = fails ? 1 : 0;
