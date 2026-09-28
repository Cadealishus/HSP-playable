#!/usr/bin/env node
/**
 * WORLD doorway check: walks a STANDING player through every walkable door in
 * the town (street -> interior on the ground floor, interior -> interior
 * through every partition door) against the level's real collision proxies,
 * and fails if any of them would need a crouch.
 *
 *   node src/world/doorcheck.mjs            # prints a table, exit 1 on failure
 *
 * No browser: the level is assembled in Node exactly as WorldSystem.init does
 * (same RNG seed, same order), minus the canvas-lettered FLOP OPS dress, with
 * the level transform left at identity so level axes are world axes. The
 * standing body is the player's: 1.78 m tall, 0.36 m radius, 0.42 m step.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { Assembler } from './builder.js';
import { BUILDINGS } from './layout.js';
import { buildGround } from './ground.js';
import { buildBuilding, collapseRoof, DOOR_H } from './buildings.js';
import { registerProps } from './props.js';
import {
  registerDressingProps,
  dressStreet,
  dressBuildings,
  scatterDebris,
  buildGate,
  buildPerimeter,
} from './dressing.js';

const HEIGHT = 1.78;
const RADIUS = 0.36;
const STEP = 0.42;

// ---- build the level exactly as WorldSystem.init does ----------------------
const rng = new Rng(1337).fork();
const fakeMaterials = { get: () => null, setGroundLevel() {} };
const A = new Assembler({ materials: fakeMaterials, rng, render: null });
registerProps(A, rng);
registerDressingProps(A, rng);
buildGround(A, rng);
const infos = [];
for (const spec of BUILDINGS) {
  const info = buildBuilding(A, rng, spec);
  infos.push(info);
  if (spec.collapse) collapseRoof(A, rng, spec, info, { x: spec.x + rng.range(-2, 2), z: spec.z + rng.range(-2, 2) });
}
buildGate(A, rng);
buildPerimeter(A, rng);
dressStreet(A, rng);
dressBuildings(A, rng, infos);
scatterDebris(A, rng);

// ---- collision triangles ----------------------------------------------------
const tris = [];
for (const acc of A._collide.values()) {
  const p = acc.pos;
  const ix = acc.idx;
  for (let i = 0; i < ix.length; i += 3) {
    const t = new THREE.Triangle(
      new THREE.Vector3(p[ix[i] * 3], p[ix[i] * 3 + 1], p[ix[i] * 3 + 2]),
      new THREE.Vector3(p[ix[i + 1] * 3], p[ix[i + 1] * 3 + 1], p[ix[i + 1] * 3 + 2]),
      new THREE.Vector3(p[ix[i + 2] * 3], p[ix[i + 2] * 3 + 1], p[ix[i + 2] * 3 + 2])
    );
    const bb = new THREE.Box3().setFromPoints([t.a, t.b, t.c]);
    tris.push({ t, bb });
  }
}

const near = (x, z, r) => tris.filter(({ bb }) => bb.max.x > x - r && bb.min.x < x + r && bb.max.z > z - r && bb.min.z < z + r);
const ray = new THREE.Ray();
const hit = new THREE.Vector3();
const box = new THREE.Box3();

/** Highest walkable surface under (x, z) at or below `top`. */
function floorAt(list, x, z, top) {
  ray.origin.set(x, top, z);
  ray.direction.set(0, -1, 0);
  let best = -Infinity;
  for (const { t } of list) {
    if (ray.intersectTriangle(t.a, t.b, t.c, false, hit) && hit.y > best) best = hit.y;
  }
  return best;
}

/**
 * Walk a standing body along a straight line through a doorway. Returns null
 * if it gets through, or the reason it would not.
 */
function walk(x0, z0, x1, z1, y0) {
  const list = near((x0 + x1) / 2, (z0 + z1) / 2, 3.5);
  let y = floorAt(list, x0, z0, y0 + 1.0);
  if (!Number.isFinite(y)) return 'no floor at the start';
  const n = 40;
  const r = RADIUS * 0.8; // box inscribed in the capsule's circle, square to the walls
  let minClear = Infinity;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = x0 + (x1 - x0) * s;
    const z = z0 + (z1 - z0) * s;
    const f = floorAt(list, x, z, y + STEP + 0.02);
    if (!Number.isFinite(f)) return `falls through at ${s.toFixed(2)}`;
    if (f - y > STEP) return `step of ${(f - y).toFixed(2)} m at ${s.toFixed(2)}`;
    y = f;
    // anything lower than a step is climbed, not bumped into
    box.min.set(x - r, y + STEP + 0.01, z - r);
    box.max.set(x + r, y + HEIGHT, z + r);
    for (const { t, bb } of list) {
      if (!bb.intersectsBox(box)) continue;
      if (box.intersectsTriangle(t)) {
        // how much head room there actually is here
        const clear = Math.max(0, bb.min.y - y);
        minClear = Math.min(minClear, clear);
        return `blocked at ${s.toFixed(2)} by [${bb.min.toArray().map((v) => v.toFixed(2))}]..[${bb.max.toArray().map((v) => v.toFixed(2))}] (floor ${y.toFixed(2)}, head room ${clear.toFixed(2)} m)`;
      }
    }
  }
  return null;
}

/**
 * Both directions through a door at (x, z) with unit normal (nx, nz): straight
 * across first, then with the far leg bent up to 50 degrees either side. A
 * pass needs the near leg AND one far leg clear, both ways.
 */
function throughDoor(x, z, nx, nz, y, a, b) {
  // one side of the door: some approach within +-50 degrees of square must be
  // clear all the way to the centre of the opening
  const side = (dir, len) => {
    let why = null;
    for (const ang of [0, 0.45, -0.45, 0.87, -0.87]) {
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const fx = (nx * c - nz * sn) * dir;
      const fz = (nx * sn + nz * c) * dir;
      const w = walk(x + fx * len, z + fz * len, x, z, y);
      if (!w) return null;
      why ??= w;
    }
    return why;
  };
  const outer = side(1, a);
  if (outer) return `+side: ${outer}`;
  const inner = side(-1, b);
  if (inner) return `-side: ${inner}`;
  return null;
}

// ---- the doors -------------------------------------------------------------
const results = [];
for (const info of infos) {
  if (!info.spec.enterable) continue;
  for (const d of info.doors) {
    if (d.wp[1] > 0.5) continue; // balcony doors open onto a balcony slab
    const c = d.wp;
    const o = new THREE.Vector3(d.x, 0, 1).applyMatrix4(d.pm);
    const nx = o.x - c[0];
    const nz = o.z - c[2];
    // Through the opening and into the room. Furniture may sit a metre inside a
    // door (people walk round it), so the far end may turn up to 50 degrees
    // either way; the opening itself must always be passed standing.
    // +normal side is the street if it points away from the building centre;
    // the street leg is 1.4 m, the room leg 0.75 m (through the 0.34 m wall and
    // clear of it — furniture beyond that is walked round, not through)
    const out = nx * (c[0] - info.spec.x) + nz * (c[2] - info.spec.z) > 0 ? 1 : -1;
    const why = throughDoor(c[0], c[2], nx * out, nz * out, c[1], 1.4, 0.75);
    results.push({ building: info.spec.id, kind: 'street', at: `${c[0].toFixed(1)},${c[2].toFixed(1)}`, ok: !why, why });
  }
  for (const d of info.innerDoors ?? []) {
    const why = throughDoor(d.x, d.z, d.nx, d.nz, d.y, 1.0, 1.0);
    results.push({
      building: info.spec.id,
      kind: `interior @${d.y.toFixed(2)}`,
      at: `${d.x.toFixed(1)},${d.z.toFixed(1)}`,
      ok: !why,
      why,
    });
  }
}

let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.building.padEnd(6)} ${r.kind.padEnd(16)} ${r.at.padEnd(12)} ${r.why ?? ''}`);
}
console.log(`\n${results.length - bad}/${results.length} doorways walkable standing (DOOR_H ${DOOR_H} m, body ${HEIGHT} m)`);
process.exit(bad ? 1 : 0);
