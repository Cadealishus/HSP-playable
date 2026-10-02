import { box, blob, latheZ, tubeZ, rodZ, extrude, roundRect, ring, knurlBand, mergeAll } from './geometry.js';
import { addScrew } from './parts.js';

/**
 * Components for the extended arsenal, in the same conventions as parts.js
 * (metres, weapon-local, +X right, +Y up, -Z toward the muzzle).
 *
 *   buildScope        a riflescope in two rings (sniper 12x / marksman 4x)
 *   addSuppressor     a baffled can on the muzzle
 *   addBipod          a folded bipod under the handguard
 *   shell12           a 12-gauge shell (the shotgun's "magazine" is one of these)
 *   rifleGrips        the rifle's SOLVED hand targets, re-seated on a handguard
 *                     of a different radius / position
 */

/**
 * Riflescope. `len` overall, main tube `rTube`, objective bell `rObj`, ocular
 * bell `rOc`, turrets on top and right, two rings on a rail at `railTop`.
 * The optic axis is at (0, y); returns the ocular lens position (the sight
 * node for the ADS solve) — the scope OVERLAY takes over at full ADS, so the
 * glass here only has to read in hipfire and on the way up.
 */
export function buildScope(asm, o) {
  const y = o.y;
  const z = o.z ?? 0; // centre of the main tube
  const len = o.len ?? 0.33;
  const rT = o.rTube ?? 0.015;
  const rObj = o.rObj ?? 0.028;
  const rOc = o.rOc ?? 0.021;
  const zOc = z + len / 2; // rear (ocular) end
  const zOb = z - len / 2; // front (objective) end
  const matBody = o.matBody ?? 'alu_fine';
  // One lathe, rear to front: eyepiece with a rubber-free alloy bell, power
  // ring, main tube, turret saddle bulge, objective bell.
  const prof = [
    [0, rOc * 0.82],
    [0, rOc],
    [0.004, rOc],
    [0.05, rOc * 0.98],
    [0.058, rT * 1.25],
    [0.075, rT * 1.25],
    [0.082, rT],
    [len * 0.42, rT],
    [len * 0.44, rT * 1.18],
    [len * 0.56, rT * 1.18],
    [len * 0.58, rT],
    [len * 0.7, rT],
    [len * 0.86, rObj * 0.96],
    [len - 0.004, rObj],
    [len, rObj],
    [len, rObj * 0.86],
  ];
  const shell = latheZ(prof, 40);
  asm.add(shell, matBody, { y, z: zOc, ry: Math.PI });
  shell.dispose();
  // Knurled power ring.
  const kr = knurlBand(rT * 1.26, 0.014, 36, 0.0004, 2);
  asm.add(kr, matBody, { y, z: zOc - 0.066 });
  kr.dispose();
  // Glass: ocular and objective, set back inside their bells, plus a dark tube.
  const inner = tubeZ(rT * 0.95, rT * 0.9, len * 0.9, 24, 0.0002);
  asm.add(inner, 'optic_tube', { y, z });
  inner.dispose();
  const oc = rodZ(rOc * 0.8, rOc * 0.8, 0.002, 32, 0.0002);
  asm.add(oc, 'glass', { y, z: zOc - 0.006 });
  oc.dispose();
  const ob = rodZ(rObj * 0.84, rObj * 0.84, 0.002, 32, 0.0002);
  asm.add(ob, 'glass', { y, z: zOb + 0.008 });
  ob.dispose();
  const back = rodZ(rObj * 0.8, rObj * 0.8, 0.001, 24, 0.0002);
  asm.add(back, 'cavity', { y, z: zOb + 0.03 });
  back.dispose();
  // Turrets: elevation (top) and windage (right), with caps and knurling.
  const tz = z + len * 0.0;
  const turret = latheZ([[0, 0], [0, 0.011], [0.001, 0.012], [0.017, 0.012], [0.018, 0.0105], [0.018, 0]], 24);
  asm.add(turret, matBody, { x: 0, y: y + rT * 1.1, z: tz, rx: -Math.PI / 2 });
  asm.add(turret, matBody, { x: rT * 1.1, y, z: tz, ry: Math.PI / 2 });
  turret.dispose();
  const tk = knurlBand(0.0122, 0.008, 28, 0.00035, 2);
  asm.add(tk, 'steel_black', { y: y + rT * 1.1 + 0.012, z: tz, rx: Math.PI / 2 });
  tk.dispose();
  // Parallax knob, left.
  const pk = latheZ([[0, 0], [0, 0.009], [0.012, 0.009], [0.012, 0]], 20);
  asm.add(pk, matBody, { x: -rT * 1.1, y, z: tz, ry: -Math.PI / 2 });
  pk.dispose();
  // Rings: two clamshells on bases down to the rail.
  const railTop = o.railTop;
  for (const rz of [z + len * 0.2, z - len * 0.18]) {
    const rg = tubeZ(rT + 0.004, rT, 0.016, 32, 0.0006);
    asm.add(rg, 'alu', { y, z: rz });
    rg.dispose();
    const base = box(0.026, y - rT - railTop + 0.002, 0.016, 0.0012, 1);
    asm.add(base, 'alu', { y: railTop + (y - rT - railTop) / 2, z: rz });
    base.dispose();
    addScrew(asm, 'steel', 0.012, y - rT * 0.4, rz, 0.0022, 'x', 0.005);
    addScrew(asm, 'steel', -0.012, y - rT * 0.4, rz, 0.0022, 'x', 0.005);
  }
  return { lensZ: zOc - 0.006, sight: [0, y, zOc - 0.006], front: zOb };
}

/** Baffled suppressor threaded onto the muzzle; returns its crown z. */
export function addSuppressor(asm, zMuzzle, y, o = {}) {
  const len = o.len ?? 0.17;
  const r = o.r ?? 0.019;
  const can = latheZ(
    [
      [0, r * 0.5],
      [0, r * 0.94],
      [0.004, r],
      [len - 0.006, r],
      [len - 0.002, r * 0.9],
      [len, r * 0.6],
      [len, r * 0.3],
    ],
    32
  );
  asm.add(can, o.mat ?? 'steel_black', { y, z: zMuzzle, ry: Math.PI });
  can.dispose();
  // Wrench flats near the mount, a thin index ring.
  const band = tubeZ(r + 0.0006, r - 0.001, 0.012, 32, 0.0003);
  asm.add(band, 'steel', { y, z: zMuzzle - 0.02 });
  band.dispose();
  const bore = tubeZ(r * 0.3, r * 0.18, 0.01, 12, 0.0002);
  asm.add(bore, 'cavity', { y, z: zMuzzle - len + 0.004 });
  bore.dispose();
  return zMuzzle - len;
}

/** Folded bipod: a clamp and two legs lying forward along the barrel. */
export function addBipod(asm, y, z, o = {}) {
  const len = o.len ?? 0.2;
  const clamp = blob(0.03, 0.02, 0.024, 0.003, 2);
  asm.add(clamp, 'alu', { y, z });
  clamp.dispose();
  for (const sx of [-1, 1]) {
    const leg = rodZ(0.0045, 0.0038, len, 12, 0.0008);
    asm.add(leg, 'alu', { x: sx * 0.011, y: y - 0.006, z: z - len / 2, ry: sx * 0.03 });
    leg.dispose();
    const foot = blob(0.012, 0.01, 0.018, 0.003, 2);
    asm.add(foot, 'rubber', { x: sx * 0.014, y: y - 0.006, z: z - len });
    foot.dispose();
  }
}

/** A 12-gauge shell, standing along -Z (brass head at z=0). */
export function shell12(asm, mat = 'polymer_tan', t = {}) {
  const hull = latheZ([[0, 0.0098], [0.012, 0.0098], [0.07, 0.0096], [0.07, 0.005], [0.07, 0]], 18);
  asm.add(hull, 'polymer', { ...t, ry: Math.PI + (t.ry ?? 0) });
  hull.dispose();
  const head = latheZ([[0, 0], [0, 0.0106], [0.0015, 0.0106], [0.0016, 0.0099], [0.015, 0.0099], [0.015, 0]], 18);
  asm.add(head, 'brass', { ...t, ry: Math.PI + (t.ry ?? 0) });
  head.dispose();
  void mat;
}

/** The rifle's solved hand targets (models/rifle.js), re-seated. */
const RIFLE_GRIP_R = { pos: [0.0251, 0.06, 0.1223], finger: [0.05, -0.55, -0.833], back: [1, 0.03, 0.04] };
const RIFLE_GRIP_L = { pos: [-0.1, 0.0734, -0.2098], finger: [0.8977, -0.3267, -0.2955], back: [-0.2784, -0.7648, 0.581] };
const RIFLE_HG_R = 0.0271;
const RIFLE_HAND_Z = -0.235;
const RIFLE_BORE = 0.075;
/** Contact normal of the under-handguard grip (clock 250 deg). */
const N = [-0.342, -0.94];

/**
 * @param {number} r      outer radius of whatever the support hand grips
 * @param {number} handZ  where the knuckles cross it (rifle: -0.235)
 * @param {number} axisY  height of that cylinder's axis (rifle: the bore, 0.075)
 */
export function rifleGrips(r, handZ = RIFLE_HAND_Z, axisY = RIFLE_BORE) {
  const dr = r - RIFLE_HG_R;
  return {
    gripR: { pos: RIFLE_GRIP_R.pos.slice(), finger: RIFLE_GRIP_R.finger.slice(), back: RIFLE_GRIP_R.back.slice() },
    gripL: {
      pos: [
        RIFLE_GRIP_L.pos[0] + N[0] * dr,
        RIFLE_GRIP_L.pos[1] + N[1] * dr + (axisY - RIFLE_BORE),
        RIFLE_GRIP_L.pos[2] + (handZ - RIFLE_HAND_Z),
      ],
      finger: RIFLE_GRIP_L.finger.slice(),
      back: RIFLE_GRIP_L.back.slice(),
    },
  };
}

export { box, blob, latheZ, tubeZ, rodZ, extrude, roundRect, ring, mergeAll };
