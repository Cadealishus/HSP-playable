import { P, D } from './atlas.js';
import { resetSpawn } from './particles.js';
import { V, V2, cone, discOn } from './util.js';

/**
 * Explosions.
 *
 * Ordered the way a real detonation is ordered, because the order is the whole
 * effect:
 *   t=0      white-hot core, gone in 60 ms, plus a real light flash
 *   0-0.4 s  fireball expanding on a decelerating curve, rising on its own heat
 *   0-0.3 s  shockwave: a refraction ring that outruns the fireball
 *   0-0.6 s  debris cone and a ground dust ring thrown radially
 *   0.1-2 s  smoke column that keeps rising and dissipating long after the fire
 *            has gone out, which is what makes the aftermath read
 */

const TWO_PI = Math.PI * 2;

export function explode(fx, o) {
  const rng = fx.rng;
  const q = fx.pScale;
  const p = o.position ?? o;
  // VISUAL radius. `o.radius` is the damage radius (6.5 m for a frag), and
  // scaling the fireball by it put a 10 m white disc over the frame; a frag's
  // fireball is 2-3 m across. The damage radius still drives the force.
  const R = Math.min(3.0, Math.max(0.6, o.radius ?? 5));
  const up = o.up ?? { x: 0, y: 1, z: 0 };
  const px = p.x;
  const py = p.y;
  const pz = p.z;

  // ---- core flash ---------------------------------------------------------
  let s = resetSpawn();
  s.x = px; s.y = py; s.z = pz;
  s.tile = P.FLASH_CORE;
  s.size0 = R * 0.3;
  s.size1 = R * 1.1;
  s.sizeCurve = 0.3;
  s.life = 0.07;
  s.drag = 5;
  s.r0 = 1; s.g0 = 0.95; s.b0 = 0.85; s.i0 = 40;
  s.r1 = 1; s.g1 = 0.42; s.b1 = 0.1; s.i1 = 0;
  s.alphaCurve = 0.5;
  s.soft = 0.5;
  s.seed = rng.float();
  fx.emitAdd(s);

  // second flash layer: a wider, cooler-orange bloom that outlives the core
  s = resetSpawn();
  s.x = px; s.y = py + R * 0.15; s.z = pz;
  s.tile = P.FLASH_CORE;
  s.size0 = R * 0.6;
  s.size1 = R * 1.6;
  s.sizeCurve = 0.4;
  s.life = 0.16;
  s.drag = 4;
  s.r0 = 1; s.g0 = 0.6; s.b0 = 0.25; s.i0 = 9;
  s.r1 = 1; s.g1 = 0.3; s.b1 = 0.06; s.i1 = 0;
  s.alphaCurve = 0.8;
  s.soft = 0.6;
  s.seed = rng.float();
  fx.emitAdd(s);

  // ---- fireball -----------------------------------------------------------
  const nFire = Math.round(12 * q) + 5;
  for (let i = 0; i < nFire; i++) {
    cone(V, rng, up.x, up.y, up.z, 1.5, 0.6);
    const sp = rng.range(1.5, 5.5) * (R / 4);
    s = resetSpawn();
    discOn(V2, rng, up.x, up.y, up.z, R * 0.16);
    s.x = px + V2.x; s.y = py + V2.y + R * 0.05; s.z = pz + V2.z;
    s.vx = V.x * sp; s.vy = V.y * sp + 1.4; s.vz = V.z * sp;
    s.tile = P.FIRE;
    s.size0 = R * rng.range(0.18, 0.34);
    s.size1 = R * rng.range(0.7, 1.15);
    s.sizeCurve = 0.34; // most of the expansion happens immediately
    s.life = rng.range(0.3, 0.62);
    s.delay = rng.range(0, 0.06);
    s.drag = rng.range(2.6, 4.2);
    s.gravity = 2.2; // buoyant
    s.rot = rng.float() * TWO_PI;
    s.spin = rng.signed() * 2.2;
    s.r0 = 1; s.g0 = rng.range(0.7, 0.92); s.b0 = rng.range(0.4, 0.62);
    s.i0 = rng.range(4, 9);
    s.r1 = 1; s.g1 = 0.22; s.b1 = 0.04; s.i1 = 0.3;
    s.alphaCurve = 0.55;
    s.soft = 0.6;
    s.turb = R * 0.05; s.turbFreq = 2.4; s.seed = rng.float();
    fx.emitAdd(s);
  }

  // ---- dark smoke ---------------------------------------------------------
  // 12-20 sprites of dark brown-grey (#3a3530) that start ~1 m across and
  // grow to ~6 m over 2.5 s, drifting up and out: the body of the blast once
  // the fire is gone. `size` is the sprite diameter.
  const nSmoke = Math.min(20, Math.round(8 * q) + 12);
  for (let i = 0; i < nSmoke; i++) {
    cone(V, rng, up.x, up.y, up.z, 1.3, 0.6);
    const sp = rng.range(0.8, 3.2);
    s = resetSpawn();
    s.x = px + V.x * 0.3; s.y = py + 0.3 + rng.float() * 0.5; s.z = pz + V.z * 0.3;
    s.vx = V.x * sp; s.vy = V.y * sp * 0.6 + 0.6; s.vz = V.z * sp;
    s.tile = i % 2 ? P.SMOKE_A : P.SMOKE_B;
    s.size0 = rng.range(0.8, 1.2);
    s.size1 = rng.range(5.0, 6.5);
    s.sizeCurve = 0.55;
    s.life = rng.range(2.2, 2.8);
    s.delay = rng.range(0.02, 0.12);
    s.drag = 1.6;
    s.gravity = 0.35;
    s.rot = rng.float() * TWO_PI;
    s.spin = rng.signed() * 0.5;
    // #3a3530 in linear
    s.r0 = 0.042; s.g0 = 0.036; s.b0 = 0.030;
    s.r1 = 0.07; s.g1 = 0.064; s.b1 = 0.058;
    s.alpha = rng.range(0.6, 0.85);
    s.alphaCurve = 1.6;
    s.soft = 0.8;
    s.turb = 0.25; s.turbFreq = 0.9; s.seed = rng.float();
    fx.emitLit(s);
  }

  // ---- shockwave ----------------------------------------------------------
  fx.hazeRing(px, py, pz, R * 0.25, 9.0, 0.34, 2.2);
  s = resetSpawn();
  s.x = px; s.y = py; s.z = pz;
  s.tile = P.RING;
  s.size0 = R * 0.35;
  s.size1 = R * 2.4;
  s.sizeCurve = 0.42;
  s.life = 0.2;
  s.drag = 6;
  s.r0 = 1; s.g0 = 0.9; s.b0 = 0.78; s.i0 = 3.2;
  s.r1 = 1; s.g1 = 0.6; s.b1 = 0.3; s.i1 = 0;
  s.alphaCurve = 1.1;
  s.soft = 1.2;
  s.seed = rng.float();
  fx.emitAdd(s);

  // ---- ground dust ring ---------------------------------------------------
  const nRing = Math.round(11 * q) + 5;
  for (let i = 0; i < nRing; i++) {
    const a = (i / nRing) * TWO_PI + rng.range(-0.2, 0.2);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const sp = rng.range(4, 9) * (R / 4);
    s = resetSpawn();
    s.x = px + dx * R * 0.2; s.y = py - R * 0.05; s.z = pz + dz * R * 0.2;
    s.vx = dx * sp; s.vy = rng.range(0.3, 1.4); s.vz = dz * sp;
    s.tile = i % 3 === 0 ? P.SMOKE_B : P.DUST;
    s.size0 = R * rng.range(0.12, 0.22);
    s.size1 = R * rng.range(0.55, 0.95);
    s.sizeCurve = 0.45;
    s.life = rng.range(0.9, 1.8);
    s.drag = rng.range(2.4, 3.6);
    s.gravity = -0.5;
    s.rot = rng.float() * TWO_PI;
    s.spin = rng.signed() * 1;
    s.r0 = 0.42; s.g0 = 0.36; s.b0 = 0.29;
    s.r1 = 0.34; s.g1 = 0.3; s.b1 = 0.25;
    s.alpha = rng.range(0.4, 0.7);
    s.alphaCurve = 1.5;
    s.soft = 0.5;
    s.turb = 0.1; s.turbFreq = 1.4; s.seed = rng.float();
    fx.emitLit(s);
  }

  // ---- debris cone --------------------------------------------------------
  const nDeb = Math.round(26 * q) + 10;
  for (let i = 0; i < nDeb; i++) {
    cone(V, rng, up.x, up.y, up.z, 1.35, 0.8);
    const sp = rng.range(6, 20) * (0.6 + R / 8);
    s = resetSpawn();
    s.x = px; s.y = py + 0.05; s.z = pz;
    s.vx = V.x * sp; s.vy = V.y * sp; s.vz = V.z * sp;
    s.tile = rng.float() < 0.3 ? P.SPLINTER : P.CHIP;
    s.size0 = rng.range(0.01, 0.05);
    s.size1 = s.size0;
    s.life = rng.range(0.7, 1.8);
    s.drag = 0.4;
    s.gravity = -19;
    s.rot = rng.float() * TWO_PI;
    s.spin = rng.signed() * 26;
    s.r0 = 0.24; s.g0 = 0.21; s.b0 = 0.18;
    s.r1 = 0.2; s.g1 = 0.18; s.b1 = 0.16;
    s.alphaCurve = 0.3;
    s.soft = 0.06;
    s.seed = rng.float();
    fx.emitLit(s);
  }
  // embers riding the debris
  for (let i = 0; i < Math.round(14 * q) + 5; i++) {
    cone(V, rng, up.x, up.y, up.z, 1.4, 0.9);
    const sp = rng.range(4, 14);
    s = resetSpawn();
    s.x = px; s.y = py + 0.05; s.z = pz;
    s.vx = V.x * sp; s.vy = V.y * sp; s.vz = V.z * sp;
    s.tile = P.STREAK;
    s.size0 = rng.range(0.012, 0.03);
    s.size1 = s.size0 * 0.4;
    s.stretch = 1.1;
    s.life = rng.range(0.5, 1.4);
    s.drag = 1.1;
    s.gravity = -13;
    s.r0 = 1; s.g0 = 0.6; s.b0 = 0.22; s.i0 = rng.range(8, 20);
    s.r1 = 1; s.g1 = 0.18; s.b1 = 0.03; s.i1 = 0.2;
    s.flags = 1;
    s.alphaCurve = 0.6;
    s.soft = 0.06;
    s.seed = rng.float();
    fx.emitAdd(s);
  }

  // ---- lingering smoke column --------------------------------------------
  fx.addSmokeColumn(px, py + R * 0.1, pz, {
    radius: R * 0.35,
    duration: 1.5,
    rate: 9,
    rise: 1.6,
    dark: 0.12,
    life: 3.4,
    growth: 3.2,
  });

  // ---- light + ground scorch ---------------------------------------------
  if (fx.lights) {
    // intensity 40, 15 m reach, ~150 ms decay
    fx.lights.flash(px, py + 0.6, pz, 1, 0.72, 0.4, 40, 0.15, 12, 15, 4);
  }
  // a 2.5 m scorch
  fx.scorch(px, py, pz, 2.4);
  return true;
}
