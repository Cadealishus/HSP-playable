import { Assembly, box, extrude, latheZ, rodZ, ring } from '../geometry.js';

/**
 * Knives: the combat knife (quick melee, V) and the throwing knife (a lethal).
 *
 * Both are authored with the blade along -Z (tip forward, the camera
 * convention), the edge toward -Y, the spine toward +Y and the flats facing
 * ±X. The combat knife's origin is the middle of the grip, where the fist
 * closes; the throwing knife's is its centre of mass, which is also what the
 * spin in flight turns about.
 *
 * Real dimensions: a USMC-pattern fighting knife is 300 mm overall with a 178 mm
 * clip-point blade 30 mm deep and 4.5 mm thick, a 70 mm steel guard and a
 * 120 mm stacked-washer grip; a throwing knife is a 240 mm one-piece spear point
 * cut from 4 mm plate with three lightening holes in the handle.
 */

/** Outline authored in (length, height) and stood along -Z with flats on ±X. */
const ALONG = { ry: Math.PI / 2 };

export function buildCombatKnife() {
  const asm = new Assembly('knife');
  // Grip centre to blade root (guard face).
  const G = 0.066;
  // ---- blade: a parkerised body with a bright ground edge band ------------
  const body = extrude(
    [
      [0, 0.0122],
      [0.118, 0.0122],
      [0.152, 0.0088],
      [0.178, 0.0028],
      [0.172, -0.0012],
      [0.12, -0.0072],
      [0.02, -0.0076],
      [0, -0.0076],
    ],
    0.0046,
    { bevel: 0.0007 }
  );
  asm.add(body, 'steel_black', { ...ALONG, z: -G });
  body.dispose();
  // The grind: a thinner, bright band from the body down to the edge.
  const grind = extrude(
    [
      [0.012, -0.0072],
      [0.12, -0.0068],
      [0.172, -0.0006],
      [0.176, 0.0012],
      [0.168, -0.0052],
      [0.15, -0.0118],
      [0.12, -0.0158],
      [0.02, -0.0166],
      [0.008, -0.0142],
      [0.008, -0.0072],
    ],
    0.0024,
    { bevel: 0.0005 }
  );
  asm.add(grind, 'steel_bright', { ...ALONG, z: -G });
  grind.dispose();
  // Fuller down both flats.
  for (const s of [-1, 1]) {
    const fuller = box(0.0007, 0.0042, 0.09, 0.0003, 1);
    asm.add(fuller, 'steel_soot', { x: s * 0.0022, y: 0.0045, z: -G - 0.068 });
    fuller.dispose();
  }
  // ---- guard ---------------------------------------------------------------
  const guard = box(0.011, 0.05, 0.0062, 0.0016, 2);
  asm.add(guard, 'steel', { y: -0.004, z: -G + 0.003 });
  guard.dispose();
  // ---- grip: stacked washers, slightly oval, then the pommel --------------
  const prof = [];
  const n = 11;
  const z0 = 0.007;
  const z1 = 0.124;
  prof.push([z0, 0]);
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    const swell = 0.0128 + 0.0016 * Math.sin((i / n) * Math.PI);
    prof.push([z, swell - 0.0007]);
    if (i < n) prof.push([z + (z1 - z0) / n * 0.5, swell]);
  }
  prof.push([z1, 0]);
  const grip = latheZ(prof, 18);
  asm.add(grip, 'rubber', { z: -G, sx: 0.82 });
  grip.dispose();
  const pommel = rodZ(0.0138, 0.0118, 0.014, 18, 0.0018);
  asm.add(pommel, 'steel', { z: -G + 0.131, sx: 0.86 });
  pommel.dispose();
  const lanyard = ring(0.0055, 0.0011, 12, 6);
  asm.add(lanyard, 'steel_black', { z: -G + 0.141, ry: Math.PI / 2 });
  lanyard.dispose();
  asm.node('tip', 0, 0.003, -G - 0.178);
  return { asm };
}

export function buildThrowingKnife() {
  const asm = new Assembly('throwing_knife');
  // Centre of mass ~ 105 mm from the tip; author tip at x = 0.135.
  const L = 0.24;
  const C = 0.105;
  const outline = [
    [L - C, 0],
    [L - C - 0.05, 0.0118],
    [L - C - 0.11, 0.0122],
    [-C + 0.02, 0.0108],
    [-C, 0.0094],
    [-C - 0.002, 0],
    [-C, -0.0094],
    [-C + 0.02, -0.0108],
    [L - C - 0.11, -0.0122],
    [L - C - 0.05, -0.0118],
  ];
  const holes = [];
  for (let i = 0; i < 3; i++) {
    const cx = -C + 0.022 + i * 0.022;
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = -(k / 10) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * 0.0042, Math.sin(a) * 0.0042]);
    }
    holes.push(pts);
  }
  const plate = extrude(outline, 0.004, { bevel: 0.0006, holes });
  asm.add(plate, 'steel_black', ALONG);
  plate.dispose();
  // Bright double grind toward the point.
  const grind = extrude(
    [
      [L - C - 0.002, 0],
      [L - C - 0.05, 0.0124],
      [L - C - 0.105, 0.0128],
      [L - C - 0.105, -0.0128],
      [L - C - 0.05, -0.0124],
    ],
    0.0018,
    { bevel: 0.0004 }
  );
  asm.add(grind, 'steel_bright', ALONG);
  grind.dispose();
  // Cord wrap on the handle, between the holes and the blade.
  for (let i = 0; i < 5; i++) {
    const wrap = box(0.0058, 0.0236, 0.0034, 0.0012, 1);
    asm.add(wrap, 'rubber', { z: C - 0.088 - i * 0.0036, rz: (i % 2 ? 1 : -1) * 0.08 });
    wrap.dispose();
  }
  return { asm, radius: 0.012, halfHeight: 0.11, tip: L - C };
}
