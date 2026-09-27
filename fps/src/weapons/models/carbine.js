import * as THREE from 'three';
import { Assembly } from '../geometry.js';
import { profileX, sectionZ, planY, latheZ, latheX, lathe, cyl, rbox, xf, at, roundContour, rrect, extrude } from '../mmgeo.js';

/**
 * THE CARBINE — an M4A1-pattern 5.56 carbine with a free-float M-LOK rail, an
 * A2 birdcage, FDE furniture and a holographic sight (circle-dot reticle).
 *
 * Ported from the standalone weapon prototype. That model was authored in
 * MILLIMETRES in "gun space" from real AR-15 drawings:
 *
 *   u  forward along the bore (mm), 0 = rear face of the upper receiver
 *   v  up (mm), 0 = bore axis
 *   x  right (mm)            model space: (x, v, -u)
 *
 * and it is kept that way, because every number in it is a dimension off a
 * drawing. The port is the `MM` adapter below: each piece is scaled to metres
 * and moved into THIS engine's weapon-local frame (origin at the web of the
 * shooting hand, bore at y = +0.075, -Z to the muzzle), then handed to the
 * engine's `Assembly`, so the carbine goes through exactly the same material
 * buckets, curvature-mask bake, contact-AO bake and draw-call merge as the
 * other three guns. The prototype's own materials are gone; every part maps to
 * a key in materials.js (see MAT).
 *
 * PLACEMENT: the carbine's back strap at 55 mm below the bore lands on the
 * rifle's back strap (z = +0.0305), so the receiver starts at z = +0.032 and the
 * free-float rail runs z = -0.156 .. -0.396, within 11 mm of the rifle's. That
 * is what lets the support-hand reach, the hipfire convergence and the reload
 * clip carry over; the grip is 12 deg more upright than the rifle's A2 grip, so
 * the shooting hand is rotated onto it rather than copied (see gripR).
 *
 * Layout (weapon-local metres):
 *   bore axis        y = +0.075
 *   rail top         y = +0.1025   (27.5 mm over bore)
 *   holo axis        y = +0.1405   (65.5 mm over bore)
 *   front window     z = -0.104
 *   muzzle crown     z = -0.543
 *   butt pad         z = +0.270
 */

const BORE = 0.075;
/** Engine z of gun-space u = 0 (rear face of the upper receiver). */
const Z0 = 0.032;
/** Holo: rail top above the bore, and window centre above the rail top (mm). */
const RAIL_V = 27.5;
const WC = 38;
/** The front (holographic) window: clear aperture and its u station. */
const WIN_W = 35;
const WIN_H = 27.5;
const WIN_U = 137;

/**
 * Prototype material names -> engine material keys (materials.js).
 *
 * Black hard-anodised receiver, rail and optic; phosphate steel barrel group;
 * FDE polymer furniture (stock, grip, trigger guard, magazine). The FDE is the
 * carbine's identity next to the all-black rifle, and it is also the colour
 * break in the lower-right of the hipfire frame, where the magazine sits.
 */
const MAT = {
  alu: 'alu',
  aluRail: 'alu',
  optic: 'alu_fine',
  inner: 'cavity',
  tunnel: 'optic_tube',
  steel: 'steel',
  steelSoot: 'steel_soot',
  steelDark: 'steel_black',
  steelBright: 'steel_bright',
  polymer: 'polymer_tan',
  polymerGrip: 'polymer_tan',
  polymerBlack: 'polymer',
  rubber: 'rubber',
  mag: 'polymer_tan',
  brass: 'brass',
  copper: 'copper',
  knurl: 'steel_black',
  glass: 'glass',
};

/**
 * Collects millimetre gun-space geometry into an engine Assembly.
 * `origin` is the engine-space point (metres) that becomes this assembly's
 * local origin — the rest node of a moving part, or [0,0,0] for the body.
 */
class MM {
  constructor(asm, origin = [0, 0, 0]) {
    this.asm = asm;
    this.t = {
      x: -origin[0],
      y: BORE - origin[1],
      z: Z0 - origin[2],
      sx: 0.001,
      sy: 0.001,
      sz: 0.001,
    };
  }
  add(mat, g) {
    if (!g) return g;
    const key = MAT[mat] ?? mat;
    this.asm.add(g, key, this.t);
    g.dispose();
    return g;
  }
}

/** Gun-space millimetres -> engine weapon-local metres. */
const P = (u, v, x = 0) => [x / 1000, BORE + v / 1000, Z0 - u / 1000];

const stadium = (cx, cy, len, wid) => rrect(cx, cy, len, wid, wid / 2 - 0.01);

/** Picatinny rail from u0 to u1 with its base at height v0 (top of rail = v0 + 9.1). */
function picatinny(S, mat, u0, u1, v0) {
  const lower = [[-7.8, 0], [7.8, 0], [7.8, 3.0], [10.6, 5.4, 0.4], [10.6, 6.2, 0.3], [-10.6, 6.2, 0.3], [-10.6, 5.4, 0.4], [-7.8, 3.0]];
  // 45-degree crown chamfers (see geometry.js picatinny: a dead-flat 21 mm crown
  // catches the whole GGX lobe of the viewmodel key and reads as a bright comb).
  const tooth = [[-7.8, 4.0], [7.8, 4.0], [10.6, 5.4, 0.3], [10.6, 7.6, 0.4], [9.1, 9.1, 0.3], [-9.1, 9.1, 0.3], [-10.6, 7.6, 0.4], [-10.6, 5.4, 0.3]];
  S.add(mat, xf(sectionZ(lower, u0, u1, { bevel: 0.5 }), [0, v0, 0]));
  for (let u = u0 + 2.2; u + 5.2 <= u1 - 1.5; u += 10.55) {
    S.add(mat, xf(sectionZ(tooth, u, u + 5.2, { bevel: 0.45 }), [0, v0, 0]));
  }
}

/** Hex socket cap screw head facing +x. */
function screwHead(r = 2.4, h = 1.6) {
  const body = lathe([[0, 0], [r, 0, 0.2], [r, h * 0.8, 0.5], [r * 0.62, h, 0.2], [0, h]], 18);
  body.rotateZ(-Math.PI / 2);
  return body;
}

export function buildCarbine() {
  const body = new Assembly('carbine-body');
  const S = new MM(body);

  /* ---------------- upper receiver ---------------- */
  const upperPts = [[0, -17, 0.8], [166, -17, 2], [174, -13.5, 3], [183, -13.5, 0.8], [183, 18.5, 0.8], [4, 18.5, 1.5], [0, 15, 1]];
  const port = rrect(103, 1.5, 54, 19, 2.6);
  S.add('alu', profileX(upperPts, -14.6, 0, { bevel: [1.2, 0] }));
  S.add('alu', profileX(upperPts, 0, 14.6, { bevel: [0, 1.2], holes: [port] }));
  S.add('inner', profileX([[74, -9], [132, -9], [132, 12], [74, 12]], -3, 3, { bevel: 0 }));
  S.add('steel', at(cyl(1.25, 62, { seg: 10, bevel: 0.3 }), 72, -11.2, 15.3));
  // brass deflector
  S.add('alu', planY([[14, 56], [19.8, 60, 2], [19.8, 70, 3], [14.3, 76.5, 1]], -4.5, 17.5, { bevel: 1.4, bevelSeg: 3 }));
  // forward assist housing + button
  const faRot = [0, 0.42, 0];
  S.add('alu', xf(cyl(8.8, 27, { seg: 24, bevel: 1.2 }), [21.5, 4.5, -15], faRot));
  S.add('alu', planY([[12, 18], [21, 18, 3], [16, 46, 3], [12, 46]], -4, 12, { bevel: 1.5 }));
  S.add('steelDark', xf(cyl(7.3, 8, { seg: 24, bevel: 0.8 }), [24.6, 4.5, -7.8], faRot));
  for (let i = 0; i < 5; i++) {
    const g = rbox(1.1, 13, 1.2, 0.3);
    g.translate((i - 2) * 2.6, 0, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(0.42));
    g.translate(25.1, 4.5, -7.2);
    S.add('steelDark', g);
  }
  picatinny(S, 'aluRail', 4, 181, 18.5);
  S.add('steel', latheZ([[0, 180], [17.5, 180, 0.6], [17.5, 190, 0.6], [0, 190]], 32));

  /* ---------------- lower receiver ---------------- */
  const lowerPts = [
    [-14, -17, 1], [181, -17, 1], [181, -27, 3], [176, -31, 2], [100, -31, 0], [99, -46, 2],
    [50, -46, 3], [44, -50, 4], [16, -50, 3], [4, -40, 6], [-14, -33, 4],
  ];
  S.add('alu', profileX(lowerPts, -15.25, 15.25, { bevel: 1.1 }));
  const wellOuter = [[-15.3, 99, 3.5], [15.3, 99, 3.5], [15.3, 176.5, 4], [-15.3, 176.5, 4]];
  const wellHole = [[-12.2, 102.5, 1.5], [12.2, 102.5, 1.5], [12.2, 173, 1.5], [-12.2, 173, 1.5]];
  S.add('alu', planY(wellOuter, -76, -24, { bevel: { outer: [1.2, 0], holes: [0.8, 0] }, holes: [wellHole] }));
  S.add('alu', planY([[-17.5, 96, 5], [17.5, 96, 5], [17.5, 178.5, 5], [-17.5, 178.5, 5]], -84, -74, { bevel: { outer: 1.4, holes: 1.2 }, bevelSeg: 3, holes: [[[-12.4, 102, 1.5], [12.4, 102, 1.5], [12.4, 173.5, 1.5], [-12.4, 173.5, 1.5]]] }));
  S.add('inner', planY([[-12.3, 102.5], [12.3, 102.5], [12.3, 173], [-12.3, 173]], -33, -30, { bevel: 0 }));
  for (const s of [-1, 1]) S.add('alu', profileX([[106, -72, 3], [168, -72, 3], [168, -38, 3], [106, -38, 3]], s > 0 ? 15.2 : -15.9, s > 0 ? 15.9 : -15.2, { bevel: [s > 0 ? 0 : 0.5, s > 0 ? 0.5 : 0] }));
  // buffer tower
  S.add('alu', latheZ([[0, -14], [16.5, -14, 1.2], [16.5, 0, 0.5], [0, 0]], 36));
  // mag release button + fence (right)
  S.add('steelDark', latheX([[0, 0], [5.2, 0, 0.3], [5.2, 2.2, 0.8], [0, 2.4]], 20).translate(15.25, -36, -97));
  S.add('alu', profileX([[88, -44, 3], [96, -44, 2], [98, -28, 3], [90, -28, 3]], 15.2, 17.6, { bevel: [0, 0.9] }));
  // pins (both sides): front pivot, rear takedown, trigger, hammer
  const pin = (u, v, r) => {
    S.add('steel', latheX([[0, 0], [r, 0, 0.2], [r, 0.9, 0.5], [0, 1.1]], 16).translate(15.1, v, -u));
    S.add('steel', latheX([[0, 0], [r, 0, 0.2], [r, 0.9, 0.5], [0, 1.1]], 16).rotateZ(Math.PI).translate(-15.1, v, -u));
  };
  pin(177, -23, 3.2); pin(6, -24, 3.2); pin(72, -36, 2.2); pin(53, -33, 2.2);
  // selector (left lever + right nub)
  S.add('steelDark', latheX([[0, 0], [6.5, 0, 0.5], [6.5, 2, 0.8], [0, 2.4]], 20).rotateZ(Math.PI).translate(-15.2, -30, -41));
  S.add('steelDark', profileX([[36, -33, 2], [66, -31, 3], [66, -27, 2], [38, -27, 2]], -19.8, -17.4, { bevel: 0.6 }));
  S.add('steelDark', latheX([[0, 0], [4.2, 0, 0.3], [4.2, 1.6, 0.6], [0, 1.9]], 16).translate(15.2, -30, -41));
  // bolt catch (left)
  S.add('steelDark', profileX([[92, -30, 1], [104, -27, 2], [106, -18, 2], [96, -16, 1], [92, -22, 2]], -18.2, -15.2, { bevel: 0.6 }));
  // Engraved safe/fire witness marks and a plain serial block on the left of the
  // magwell (the flank the camera sees in hipfire). Recessed strokes, no text.
  for (let i = 0; i < 7; i++) {
    const w = [3.2, 1.2, 2.4, 2.4, 1.2, 3.6, 2.0][i];
    S.add('inner', profileX(rrect(114 + i * 5.2, -52, w, 3.6, 0.4), -16.05, -15.75, { bevel: 0 }));
  }
  S.add('inner', profileX(rrect(137, -57.5, 44, 0.7, 0.3), -16.05, -15.75, { bevel: 0 }));

  // trigger guard (dropped curve)
  S.add('polymer', profileX(
    [[46, -46, 1], [99, -46, 1], [99, -57, 3], [93, -65, 6], [60, -71, 14], [45, -58, 4]], -5.6, 5.6,
    { bevel: 1.6, bevelSeg: 3, holes: [[[52, -50, 3], [94, -50, 3], [89.5, -61, 5], [61, -66, 9], [51.5, -57, 3]]] }));

  // pistol grip (stippled polymer, K2-style: 12 deg more upright than an A2)
  S.add('polymerGrip', profileX([
    [47, -48, 2], [44, -62, 8], [38, -86, 12], [36.5, -100, 5], [33, -110, 8], [27, -146, 5], [22, -152, 4],
    [-4, -150, 5], [-9.5, -141, 6], [-3, -98, 30], [5, -64, 14], [1.5, -55, 4], [9, -48, 2],
  ], -13.8, 13.8, { bevel: 7, bevelSeg: 4 }));
  S.add('polymerBlack', profileX([[-6, -148, 4], [22, -150, 4], [23, -155, 3], [-5, -153, 3]], -12.6, 12.6, { bevel: 2 }));

  /* ---------------- buffer tube + stock ---------------- */
  S.add('alu', latheZ([[0, -205], [14.6, -205, 1.5], [14.6, -14, 0.5], [0, -14]], 32));
  S.add('steel', latheZ([[14.5, -24], [17.2, -24, 0.6], [17.2, -15, 0.6], [14.5, -15]], 32, { closed: true }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    S.add('inner', xf(rbox(2.2, 2.4, 4, 0.2), [Math.cos(a) * 17, Math.sin(a) * 17, 19.5], [0, 0, a]));
  }
  S.add('steel', latheZ([[14.6, -15], [19, -15, 0.8], [19, -13, 0.6], [14.6, -13]], 32, { closed: true }));
  S.add('alu', sectionZ([[-4, -12], [4, -12], [4.6, -16.5, 1], [-4.6, -16.5, 1]], -200, -30, { bevel: 0.6 }));
  // Stock two detents in from full extension (45 mm): the CQB length of pull,
  // and it keeps the butt 0.27 m behind the grip rather than 0.32.
  const ST = 45;
  const stockPts = [
    [-102, 21, 4], [-102, -21, 5], [-150, -27, 12], [-205, -60, 18], [-262, -93, 5], [-272, -91, 3],
    [-272, 27, 5], [-250, 31, 9], [-190, 27, 20], [-140, 24, 12],
  ].map(([u, v, r]) => [u + ST, v, r]);
  const stockHole = [[-176 + ST, -26, 7], [-226 + ST, -62, 9], [-240 + ST, -18, 9]];
  S.add('polymer', profileX(stockPts, -19.5, 19.5, { bevel: 6, bevelSeg: 4, holes: [stockHole] }));
  S.add('polymer', profileX([[-104 + ST, 25, 5], [-160 + ST, 27, 8], [-160 + ST, 17, 4], [-104 + ST, 17, 3]], -14, 14, { bevel: 4, bevelSeg: 3 }));
  S.add('rubber', profileX([[-270 + ST, 29, 5], [-283 + ST, 29, 5], [-283 + ST, -95, 5], [-270 + ST, -95, 4]], -20.5, 20.5, { bevel: 3, bevelSeg: 3 }));
  S.add('steelDark', profileX([[-112 + ST, -20, 1], [-142 + ST, -24, 2], [-143 + ST, -29, 2], [-114 + ST, -25, 2]], -4.5, 4.5, { bevel: 1 }));
  S.add('steel', xf(latheZ([[0, 0], [5.5, 0, 0.5], [5.5, 3, 0.5], [0, 3]], 20), [0, -50, 190 - ST]));

  /* ---------------- handguard (free-float M-LOK) ---------------- */
  const hgU0 = 188, hgU1 = 428, hgC = -3.5, R = 22, C = 11;
  const slotUs = [];
  for (let u = 205; u + 18 < hgU1; u += 40) slotUs.push(u + 12);
  const faces = [
    { ang: 0, w: 2 * (R - C), slots: true },
    { ang: -Math.PI / 4, w: C * Math.SQRT2, slots: true },
    { ang: -Math.PI / 2, w: 2 * (R - C), slots: true },
    { ang: (-3 * Math.PI) / 4, w: C * Math.SQRT2, slots: true },
    { ang: Math.PI, w: 2 * (R - C), slots: true },
    { ang: (3 * Math.PI) / 4, w: C * Math.SQRT2, slots: false },
    { ang: Math.PI / 2, w: 2 * (R - C), slots: false },
    { ang: Math.PI / 4, w: C * Math.SQRT2, slots: false },
  ];
  for (const f of faces) {
    const axial = Math.abs(Math.round(Math.cos(f.ang) * 1e6) / 1e6) === 1 || Math.abs(Math.round(Math.sin(f.ang) * 1e6) / 1e6) === 1;
    const ap = axial ? R : (2 * R - C) / Math.SQRT2;
    const hw = f.w / 2 - 2.2;
    const holes = f.slots ? slotUs.map((u) => stadium(u, 0, 32, 7)) : [];
    const cs = [roundContour([[hgU0 + 3, -hw], [hgU1 - 3, -hw], [hgU1 - 3, hw], [hgU0 + 3, hw]], 0)].concat(holes.map((h) => roundContour(h, 0, { hole: true })));
    const g = extrude(cs, ap - 3, ap, { bevel: { outer: 0, holes: [0.4, 0.7] }, bevelSeg: 2 });
    const m = new THREE.Matrix4().set(
      0, -Math.sin(f.ang), Math.cos(f.ang), 0,
      0, Math.cos(f.ang), Math.sin(f.ang), hgC,
      -1, 0, 0, 0,
      0, 0, 0, 1);
    g.applyMatrix4(m);
    S.add('alu', g);
  }
  const octV = [[R - C, R], [R, R - C], [R, -(R - C)], [R - C, -R], [-(R - C), -R], [-R, -(R - C)], [-R, R - C], [-(R - C), R]];
  for (let k = 0; k < 8; k++) {
    const V = new THREE.Vector2(...octV[k]);
    const Pv = new THREE.Vector2(...octV[(k + 7) % 8]);
    const Nv = new THREE.Vector2(...octV[(k + 1) % 8]);
    const t1 = Pv.clone().sub(V).normalize();
    const t2 = Nv.clone().sub(V).normalize();
    const n1 = new THREE.Vector2(-t1.y, t1.x);
    const n2 = new THREE.Vector2(t2.y, -t2.x);
    if (n1.dot(V) < 0) n1.negate();
    if (n2.dot(V) < 0) n2.negate();
    const m = n1.clone().add(n2).divideScalar(1 + n1.dot(n2));
    const L = 2.2, T = 3;
    const pts = [
      [V.x + t1.x * L, V.y + t1.y * L], [V.x, V.y, 2.4], [V.x + t2.x * L, V.y + t2.y * L],
      [V.x + t2.x * L - n2.x * T, V.y + t2.y * L - n2.y * T], [V.x - m.x * T, V.y - m.y * T],
      [V.x + t1.x * L - n1.x * T, V.y + t1.y * L - n1.y * T],
    ].map(([x, y, r]) => [x, y + hgC, r]);
    S.add('alu', sectionZ(pts, hgU0 + 3, hgU1 - 3, { bevel: 0 }));
  }
  const ringOuter = octV.map(([x, y]) => [x, y + hgC, 2.4]);
  const ringHole = octV.map(([x, y]) => [x * 0.84, y * 0.84 + hgC, 2]);
  S.add('alu', sectionZ(ringOuter, hgU1 - 3.5, hgU1 + 0.5, { bevel: 1.2, holes: [ringHole] }));
  S.add('alu', sectionZ(ringOuter, hgU0 - 1, hgU0 + 3.5, { bevel: 1.0, holes: [ringHole] }));
  picatinny(S, 'aluRail', hgU0 - 0.5, hgU1, 18.5);
  for (const s of [-1, 1]) for (const u of [195, 207]) {
    const g = screwHead(2.3, 1.5);
    if (s < 0) g.rotateZ(Math.PI);
    g.translate(s * 21.9, hgC - 7, -u);
    S.add('steelDark', g);
  }
  // front hand stop at 6 o'clock
  S.add('polymer', profileX([[380, -25.5, 1], [420, -25.5, 1], [417, -34, 5], [398, -31, 12]], -8, 8, { bevel: 2.5, bevelSeg: 3 }));
  // QD sling socket on the left rear of the rail
  S.add('steelDark', latheX([[0, 0], [5.4, 0, 0.4], [5.4, 3.2, 0.8], [2.4, 3.6], [0, 3.6]], 20).rotateZ(Math.PI).translate(-21.6, hgC - 4, -214));
  S.add('inner', latheX([[0, 0], [2.3, 0], [2.3, 0.6], [0, 0.6]], 14).rotateZ(Math.PI).translate(-24.9, hgC - 4, -214));

  /* ---------------- barrel, gas system, muzzle ---------------- */
  S.add('steel', latheZ([[0, 186], [9.3, 186, 0.3], [9.3, 432, 1], [8.0, 436, 0.5], [7.6, 440], [7.6, 469, 0.4], [6.9, 470.5, 0.3], [6.9, 476, 0.3], [7.6, 477.5, 0.4], [7.6, 521], [0, 521]], 28));
  S.add('steel', latheZ([[0, 180], [2.6, 180], [2.6, 441], [0, 441]], 10).translate(0, 13, 0));
  // Gas block + A2 birdcage are sooted: combustion products vent there by design.
  S.add('steelSoot', latheZ([[0, 440], [12.2, 440, 1.4], [12.2, 463, 1.4], [0, 463]], 28));
  S.add('steelSoot', profileX([[440, 4, 1], [463, 4, 1], [463, 17.5, 3], [440, 17.5, 3]], -8, 8, { bevel: 1.2 }));
  for (const u of [446, 457]) S.add('steelDark', screwHead(2.4, 1.4).rotateZ(-Math.PI / 2).translate(0, -12, -u));
  const fr = 11.1, fi = 6.6;
  S.add('steelSoot', latheZ([[fi, 520], [11.6, 520, 0.4], [11.6, 523.5, 0.4], [fi, 523.5]], 32, { closed: true }));
  S.add('steelSoot', latheZ([[fi, 523.5], [fr, 523.5, 0.8], [fr, 547, 0.6], [fi, 547]], 32, { closed: true }));
  S.add('steelSoot', latheZ([[fi, 569], [fr, 569, 0.6], [10.2, 575, 1.2], [fi, 575, 0.6]], 32, { closed: true }));
  const slotW = 0.34;
  const slotCenters = [0, 1, 2, 4, 5].map((k) => (k * Math.PI) / 3);
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const hasSlot = slotCenters.includes(a);
    const start = a + (hasSlot ? slotW / 2 : -slotW / 2);
    const next = a + Math.PI / 3 - (slotCenters.includes(a + Math.PI / 3) || k === 5 ? slotW / 2 : -slotW / 2);
    const g = lathe([[fi, 546.5], [fr, 546.5], [fr, 569.5], [fi, 569.5]], 6, { closed: true, phi0: start, phiLen: next - start });
    g.rotateX(-Math.PI / 2);
    S.add('steelSoot', g);
  }
  S.add('inner', latheZ([[0, 523], [fi - 0.05, 523], [fi - 0.05, 575.5], [0, 575.5]], 16));

  /* ---------------- folded front BUIS ---------------- */
  // No rear BUIS: at the ADS eye point a folded rear leaf on the receiver is
  // closer to the eye than the optic and fills the bottom of the sight picture
  // (see the rifle's addRearSight note). The front leaf sits at the bottom of the
  // holo window, which is where a co-witnessed front sight belongs.
  S.add('polymerBlack', profileX([[398, 27.5, 1], [424, 27.5, 1], [424, 35, 3], [418, 36, 2], [398, 33, 2]], -10.5, 10.5, { bevel: 1.2 }));
  S.add('steelDark', profileX([[392, 34, 1], [420, 34, 1], [420, 37, 1.5], [392, 36.2, 1.5]], -5, 5, { bevel: 0.6 }));

  /* ---------------- dust cover (open) ---------------- */
  {
    const dc = new Assembly('tmp');
    const D = new MM(dc);
    const g = [];
    g.push(profileX([[75, 0.2, 2], [131, 0.2, 2], [131, 22, 3], [75, 22, 3]], -0.2, 1.1, { bevel: 0.4 }));
    g.push(profileX([[80, 17, 1], [90, 17, 1], [90, 20, 1], [80, 20, 1]], 1.0, 2.4, { bevel: 0.4 }));
    for (const u of [95, 105, 115]) g.push(profileX([[u, 3, 0.8], [u + 3, 3, 0.8], [u + 3, 19, 0.8], [u, 19, 0.8]], 0.9, 1.6, { bevel: 0.3 }));
    // hinge at (x 15.3, v -11.2), swung down 1.9 rad
    const m = new THREE.Matrix4().makeTranslation(15.3, -11.2, 0).multiply(new THREE.Matrix4().makeRotationZ(-1.9));
    for (const gg of g) {
      gg.applyMatrix4(m);
      S.add('alu', gg);
    }
    void D;
  }

  /* ---------------- holographic sight ---------------- */
  const holo = buildHolo(S);

  /* ---------------- moving parts ---------------- */
  // Magazine: rest node at the magwell mouth (u 137, v -26).
  const magNode = P(137, -26);
  const magazine = new Assembly('carbine-mag');
  buildStanag(new MM(magazine, magNode));

  // Bolt carrier: authored in place, rest node at its rear face.
  const boltNode = P(20, 0);
  const bolt = new Assembly('carbine-bolt');
  {
    const B = new MM(bolt, boltNode);
    const sec = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      sec.push([Math.min(Math.cos(a) * 12.3, 10.4), Math.sin(a) * 12.3 + 1.5]);
    }
    B.add('steelDark', sectionZ(sec, 20, 136, { r: 0.8, bevel: 1.2 }));
    for (let i = 0; i < 9; i++) B.add('steelDark', xf(rbox(1.2, 8, 1.4, 0.3), [10.6, 1.5, -(84 + i * 3.2)]));
    B.add('steelBright', latheZ([[0, 133], [7.2, 133, 0.5], [7.2, 152, 0.8], [0, 152]], 20).translate(0, 1.5, 0));
    B.add('steelDark', profileX([[136, 6, 1], [150, 6, 1], [150, 9.5, 1], [136, 9.5, 1]], 3, 8.2, { bevel: 0.4 }));
  }

  // Charging handle: rest node at the T-latch behind the upper.
  const chargeNode = P(-6, 20.5);
  const charging = new Assembly('carbine-charging');
  {
    const C2 = new MM(charging, chargeNode);
    C2.add('alu', planY([[-6, 3], [6, 3], [6, -3, 1.5], [17, -5, 3], [20.5, -10, 3], [17, -13.5, 2.5], [-17, -13.5, 2.5], [-20.5, -10, 3], [-17, -5, 3], [-6, -3, 1.5]], 17, 24, { bevel: 1.1 }));
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) C2.add('alu', xf(rbox(1.0, 1.0, 8, 0.3), [s * (10 + i * 2.2), 24.2, 9]));
    C2.add('alu', sectionZ(rrect(0, 20.5, 11, 7, 1.5), 3, 40, { bevel: 0.6 }));
  }

  // Trigger: rest node at the trigger pin, so the rig's rotation.x is the pull.
  const trigNode = P(72, -36);
  const trigger = new Assembly('carbine-trigger');
  new MM(trigger, trigNode).add('steelBright', profileX(
    [[74, -42, 1], [81, -43, 1], [81.5, -50, 3], [80.5, -57, 5], [77, -63.5, 2], [75.5, -63, 1], [77.8, -57, 5], [77.5, -50, 3], [75, -46, 1]],
    -3.4, 3.4, { bevel: 1.2, bevelSeg: 2 }));

  /* ---------------- nodes ---------------- */
  /**
   * SHOOTING HAND — the rifle's solved grip, carried onto this grip.
   *
   * The rifle's hand target (see models/rifle.js gripR) is solved against an A2
   * grip raked 0.38 rad whose back strap passes (y 0.035, z 0.0305). This grip is
   * a K2-pattern raked 0.174 rad, back strap through (y 0.020, z 0.0305). So the
   * rifle's wrist target and hand basis are rotated about X by the difference
   * (+0.206 rad) around the rifle's back-strap point and translated onto this
   * one: the palm stays on the back strap and the metacarpals ride the new rake.
   */
  const gripR = carryGrip(
    { pos: [0.0251, 0.06, 0.1223], finger: [0.05, -0.55, -0.833], back: [1, 0.03, 0.04] },
    [0.035, 0.0305],
    [0.02, 0.0305],
    0.206
  );

  const muzzleZ = Z0 - 0.5755;
  return {
    id: 'carbine',
    label: 'KESTREL 556',
    fxClass: 'carbine',
    body,
    moving: { magazine, charging, bolt, trigger },
    nodes: {
      muzzle: [0, BORE, muzzleZ],
      chamber: P(103, 0),
      eject: P(103, 2, 16),
      ejectDir: [0.86, 0.44, 0.26],
      sight: holo.sight,
      sightAxis: [0, 0, -1],
      ironSight: holo.sight,
      gripR,
      /**
       * Support hand: the rifle's solved under-handguard grip (clock 250 deg,
       * see rifle.js gripL), moved onto this rail. The rail here is an octagon
       * 44 mm across flats centred 3.5 mm BELOW the bore rather than a 54 mm
       * round-ish polymer shell on it, so the wrist target moves 3.6 mm in along
       * the contact normal (-0.342,-0.940) and 3.5 mm down; the build-time
       * fingertip fit (Arm.fitToCylinder) then re-curls against `handguard`.
       */
      gripL: {
        pos: [-0.1 + 0.0012, 0.0734 + 0.0034 - 0.0035, -0.235 + 0.0252],
        finger: [0.8977, -0.3267, -0.2955],
        back: [-0.2784, -0.7648, 0.581],
      },
      handguard: {
        axis: [0, BORE - 0.0035, 0],
        dir: [0, 0, 1],
        // between the octagon's apothem (22 mm) and its filleted corners (~23.3 mm)
        r: 0.0228,
        z0: Z0 - hgU0 / 1000,
        z1: Z0 - hgU1 / 1000,
      },
      magSeat: { pos: magNode, rot: [0, 0, 0] },
      magDrop: [0, -0.4, 0.02],
      chargeRest: { pos: chargeNode, rot: [0, 0, 0] },
      chargePull: [0, 0, 0.068],
      boltRest: { pos: boltNode, rot: [0, 0, 0] },
      boltTravel: [0, 0, 0.066],
      triggerPivot: { pos: trigNode, rot: [0, 0, 0] },
      triggerPull: -0.3,
      opticGlass: holo.optic,
    },
    shell: { caseLen: 0.0446, rimR: 0.00495 },
    magSize: { len: 0.17, w: 0.0224, d: 0.064 },
  };
}

/**
 * Re-seat a solved hand target on a differently raked grip: rotate about X by
 * `da` around the old back-strap point (y,z) and translate to the new one.
 */
function carryGrip(g, from, to, da) {
  const c = Math.cos(da);
  const s = Math.sin(da);
  const rot = (y, z) => [y * c - z * s, y * s + z * c];
  const [py, pz] = rot(g.pos[1] - from[0], g.pos[2] - from[1]);
  const [fy, fz] = rot(g.finger[1], g.finger[2]);
  const [by, bz] = rot(g.back[1], g.back[2]);
  return {
    pos: [g.pos[0], to[0] + py, to[1] + pz],
    finger: [g.finger[0], fy, fz],
    back: [g.back[0], by, bz],
  };
}

/**
 * HOLOGRAPHIC SIGHT — an EXPS-pattern holo: QD rail clamp, transverse battery
 * housing under the hood, rear button pod, and a thick protective hood around a
 * single rectangular window.
 *
 * Re-proportioned from the prototype for the ADS frame, which is what this part
 * exists for. The prototype's hood was a 56 mm tunnel with glass at both ends;
 * seen from the eye point that tunnel's far mouth was the stop and it shrank the
 * sight picture to a slot. A real holo has ONE window at the front of the hood and
 * the hood is open at the back, so:
 *
 *   window   35 x 27.5 mm clear, glass at u 137 (4 mm inside the front lip)
 *   hood     u 99 .. 141, 48 mm wide, arched top, 6.5 mm walls
 *   relief   0.105 m from the eye to the window (defs.js eyeRelief)
 *
 * which frames, at the 51.6 deg ADS viewmodel FOV: the window at ~34% of frame
 * height, the hood's rear mouth well outside it (so the walls read as a tunnel
 * in perspective, not as a second frame), and the hood top inside the frame.
 *
 * The reticle is NOT a texture on this glass. It is the viewmodel's collimated
 * reticle in its `holo` style (viewmodel.js _updateReticle): drawn along the
 * sight axis at optical infinity, so at full ADS it sits exactly on screen centre
 * whatever the sway, and it vignettes against this window's clear aperture.
 */
function buildHolo(S) {
  // Holo-local offsets: v' measured up from the rail top.
  const Y = (g) => xf(g, [0, RAIL_V, 0]);
  const add = (mat, g) => S.add(mat, Y(g));
  const Wc = WC;

  // Rail clamp: base block + jaws hooking the Picatinny flanks.
  add('optic', profileX([[62, 0, 1], [150, 0, 1], [150, 11, 2], [62, 11, 2]], -16.5, 16.5, { bevel: 1.4 }));
  for (const s of [-1, 1]) add('optic', profileX([[66, -6.5, 1.5], [146, -6.5, 1.5], [146, 2, 1], [66, 2, 1]], s > 0 ? 10.4 : -16.5, s > 0 ? 16.5 : -10.4, { bevel: 1.1 }));
  // Electronics deck under the window. Its top stays 1.5 mm BELOW the window's
  // lower edge (Wc - WIN_H/2 = 24.25), or it shows as a strip across the bottom
  // of the sight picture.
  add('optic', profileX([[64, 9, 3], [146, 9, 3], [146, 22.5, 3], [64, 22.5, 3]], -19, 19, { bevel: 2, bevelSeg: 3 }));
  // Rear button pod: slopes DOWN toward the hood so it never crosses the line of
  // sight from the eye (u ~32) to the bottom of the window.
  add('optic', profileX([[62, 9, 3], [99, 9, 2], [99, 25.5, 2], [70, 29.5, 5], [62, 26, 4]], -19.5, 19.5, { bevel: 2, bevelSeg: 3 }));
  // Transverse battery tube at the front + knurled cap (right).
  add('optic', latheX([[0, -20.5], [8.8, -20.5, 1.5], [8.8, 20.5, 1.5], [0, 20.5]], 28).translate(0, 7.5, -134));
  add('knurl', latheX([[0, 0], [8.2, 0, 0.5], [8.2, 4.2, 1], [6, 5, 0.8], [0, 5]], 32).translate(20.2, 7.5, -134));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    add('knurl', xf(rbox(1.6, 0.9, 1.1, 0.25), [22.3, 7.5 + Math.sin(a) * 8.3, -134 + Math.cos(a) * 8.3], [a, 0, 0]));
  }

  // Hood: thick arched frame around the window, open at the back.
  const hoodOuter = [[-24, 14, 3], [24, 14, 3], [24, 53, 7], [17, 63, 8], [-17, 63, 8], [-24, 53, 7]];
  const hole = rrect(0, Wc, WIN_W, WIN_H, 3.5);
  add('optic', sectionZ(hoodOuter, 99, 141, { bevel: 1.6, bevelSeg: 3, holes: [hole] }));
  // Dark tunnel lining (light trap), so the inner walls read as a shaded tunnel
  // and never as a lit anodised surface at grazing incidence.
  add('tunnel', sectionZ(rrect(0, Wc, WIN_W + 0.02, WIN_H + 0.02, 3.5), 100, 140, { bevel: 0, holes: [rrect(0, Wc, WIN_W - 0.8, WIN_H - 0.8, 3.1)] }));
  // Front lip: a raised bezel around the window mouth.
  add('optic', sectionZ(rrect(0, Wc, WIN_W + 6, WIN_H + 6, 5.2), 139.5, 143.5, { bevel: 1.1, bevelSeg: 2, holes: [rrect(0, Wc, WIN_W - 1.2, WIN_H - 1.2, 3)] }));
  // Rear lip, rubber: the edge nearest the eye, same argument as the tube
  // optic's rubber eyepiece (an alloy edge at grazing incidence lights up).
  add('rubber', sectionZ(rrect(0, Wc, WIN_W + 5, WIN_H + 5, 5), 97, 100.5, { bevel: 1.0, bevelSeg: 2, holes: [rrect(0, Wc, WIN_W + 0.4, WIN_H + 0.4, 3.6)] }));
  // Top panel with two cross ribs (the hood's stiffener, no markings).
  add('optic', profileX([[106, 62, 2], [134, 62, 2], [134, 64.2, 1], [106, 64.2, 1]], -11, 11, { bevel: 0.8 }));
  // Side buttons (left, rear-facing pod): two rubber pads + a raised guard.
  for (const u of [74, 86]) add('rubber', xf(rbox(3.2, 7, 9, 1.4), [-20.2, 18, -u]));
  add('optic', profileX([[68, 12, 2], [94, 12, 2], [94, 14, 1], [68, 14, 1]], -21.4, -18.5, { bevel: 0.6 }));
  // QD lever (left) + cross-bolt nuts (right).
  add('steelDark', profileX([[100, -3, 2], [140, -1.5, 3], [142, 5, 3], [102, 6, 3]], -20.8, -16.3, { bevel: 1.1 }));
  add('steelDark', latheX([[0, 0], [3.2, 0], [3.2, 2.4, 0.5], [0, 2.8]], 6).translate(16.3, -1.5, -111));
  add('steelDark', latheX([[0, 0], [2.6, 0], [2.6, 2.0, 0.4], [0, 2.3]], 6).translate(16.3, -1.5, -82));
  // Hood screws.
  for (const s of [-1, 1]) for (const u of [104, 136]) {
    const g = latheX([[0, 0], [1.8, 0], [1.8, 0.6, 0.3], [0, 0.8]], 12);
    if (s < 0) g.rotateZ(Math.PI);
    add('steelDark', g.translate(s * 24, 30, -u));
  }

  // The window: one AR-coated pane, 4 mm inside the front lip.
  const pane = rbox(WIN_W + 1, WIN_H + 1, 1.2, 0.3);
  add('glass', pane.translate(0, Wc, -WIN_U));

  const sight = P(WIN_U, RAIL_V + Wc);
  return {
    sight,
    optic: {
      style: 'holo',
      center: sight,
      lensZ: sight[2],
      // The reticle vignettes against the SMALLER half-dimension of the window.
      apertureR: (WIN_H / 2) * 0.001,
      apertureW: (WIN_W / 2) * 0.001,
      apertureH: (WIN_H / 2) * 0.001,
    },
  };
}

/**
 * Curved 30-round polymer STANAG magazine, origin at the top centre (the
 * magwell mouth). Ribbed flanks follow the curve; the floorplate tilts with it.
 */
function buildStanag(M) {
  const off = (v) => (v > -60 ? 0 : 27 * Math.pow((-60 - v) / 105, 1.55));
  // Local frame: the mag was authored with its top at gun (u 137, v -26); MM
  // maps gun space, so author relative to that and shift.
  const T = (g) => xf(g, [0, -26, -137]);
  const add = (mat, g) => M.add(mat, T(g));
  const N = 14;
  const front = [];
  const rear = [];
  for (let i = 0; i <= N; i++) {
    const v = -2 - (i / N) * 163;
    front.push([32 + off(v), v]);
    rear.push([-32 + off(v) * 0.92, v]);
  }
  const bodyPts = [...rear.map(([u, v], i) => [u, v, i === 0 ? 1 : 0]), ...front.reverse().map(([u, v], i) => [u, v, i === N ? 1 : 0])];
  bodyPts[0][1] = 2;
  bodyPts[bodyPts.length - 1][1] = 2;
  add('mag', profileX(bodyPts, -11.2, 11.2, { bevel: 1.3, bevelSeg: 2 }));
  for (const s of [-1, 1]) {
    for (const t of [0.3, 0.68]) {
      const rib = [];
      const K = 12;
      for (let i = 0; i <= K; i++) {
        const v = -14 - (i / K) * 136;
        rib.push([-32 + 64 * t + off(v) * (0.92 + 0.08 * t) - 1.6, v]);
      }
      const ribB = rib.map(([u, v]) => [u + 3.2, v]).reverse();
      const pts = [...rib, ...ribB].map(([u, v], i, arr) => [u, v, i === 0 || i === arr.length - 1 || i === K || i === K + 1 ? 1.4 : 0]);
      add('mag', profileX(pts, s > 0 ? 11.0 : -11.9, s > 0 ? 11.9 : -11.0, { bevel: [s > 0 ? 0 : 0.4, s > 0 ? 0.4 : 0] }));
    }
  }
  // Witness window strip on the left flank (dark), a PMAG-style cue.
  add('inner', profileX([[-6, -30, 2], [6, -30, 2], [6 + off(-110) * 0.95, -110, 2], [-6 + off(-110) * 0.95, -110, 2]], -11.5, -11.1, { bevel: 0 }));
  const vb = -165;
  const fu = off(vb);
  const tilt = Math.atan2((27 * 1.55 * Math.pow((-60 - vb) / 105, 0.55)) / 105, 1);
  const fp = profileX([[-35, 0, 2], [35, 0, 2], [35, -5, 2], [-35, -5, 2]], -12.6, 12.6, { bevel: 1.5, bevelSeg: 2 });
  fp.rotateX(-tilt);
  fp.translate(0, vb + 1, -fu * 0.96);
  add('polymerBlack', fp);
  add('mag', profileX([[-24, 2, 1], [20, 2, 1], [20, 5, 1], [-24, 5, 1]], -11.2, -7.5, { bevel: 0.6 }));
  add('mag', profileX([[-24, 2, 1], [20, 2, 1], [20, 5, 1], [-24, 5, 1]], 7.5, 11.2, { bevel: 0.6 }));
  add('brass', latheZ([[0, -28], [4.8, -28, 0.3], [4.8, -26, 0.2], [4.2, -25], [4.8, -23.5, 0.2], [4.7, 5, 0.5], [3.1, 8, 0.5], [3.1, 14], [0, 14]], 18).translate(-2.6, 1.5, 0));
  add('copper', latheZ([[0, 13.9], [2.85, 13.9], [2.85, 20, 2], [1.2, 30, 3], [0, 31]], 16).translate(-2.6, 1.5, 0));
}
