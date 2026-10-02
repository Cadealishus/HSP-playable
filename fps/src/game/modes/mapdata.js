import * as THREE from 'three';

/**
 * MAP DATA FOR MODES — team spawns and objective zones (docs/EXPANSION.md §5).
 *
 * The contract has every built map expose
 *   world.spawns     { esf: [{pos, yaw}], hostile: [{pos, yaw}] }
 *   world.objectives { dom: {A,B,C}, hp: [zone...], sd: {A, B, attackers}, survival: zone }
 * with zone = { pos: Vector3, radius }. When a map publishes them they are used
 * as-is. When it does not (yet), this derives a sane, symmetric layout from what
 * every map already publishes (`spawnPoints`, `objective`), so a mode never has
 * to know which map it is on:
 *
 *   - the two spawn points furthest apart define the map's long axis; every
 *     spawn point is projected on it and the near half becomes ESF's, the far
 *     half the hostiles'
 *   - Domination A / B / C sit at 25 / 50 / 75 % between the two team centroids
 *   - Hardpoint rotates B, A, C, then the map's own objective (when distinct)
 *   - Search & Destroy puts both sites in the defenders' half
 *
 * Every derived point is snapped onto the AI's walkable nav grid (when it has
 * one) so a zone never lands inside a wall or on a roof.
 *
 * The result is plain data owned by the caller: resolve once per mode start.
 */

const TEAMS = ['esf', 'hostile'];

/** Accept {pos,yaw} | {position,yaw} | Vector3 and return {pos: Vector3, yaw}. */
function toSpawn(s) {
  if (!s) return null;
  const p = s.pos ?? s.position ?? (s.isVector3 ? s : null);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  return { pos: new THREE.Vector3(p.x, p.y ?? 0, p.z), yaw: Number.isFinite(s.yaw) ? s.yaw : 0 };
}

/** Accept {pos,radius} | {position,radius} | Vector3 and return a zone. */
function toZone(z, radius = 4, id = null) {
  if (!z) return null;
  const p = z.pos ?? z.position ?? (z.isVector3 ? z : null);
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
  return {
    id,
    pos: new THREE.Vector3(p.x, p.y ?? 0, p.z),
    radius: Number.isFinite(z.radius) && z.radius > 0.5 ? z.radius : radius,
    label: z.label ?? id,
    name: z.name ?? null,
  };
}

function centroid(list) {
  const c = new THREE.Vector3();
  if (!list.length) return c;
  for (const s of list) c.add(s.pos);
  return c.multiplyScalar(1 / list.length);
}

/**
 * Snap a point onto the AI nav grid (walkable, outdoors or in) when there is
 * one; otherwise drop it onto the ground. Mutates and returns `p`.
 */
export function snapToNav(ctx, p, search = 8) {
  const ai = ctx?.peek?.('ai');
  const g = ai?.grid;
  if (g && typeof g.nearest === 'function') {
    try {
      const ci = g.nearest(p.x, p.z, p.y, search, 1.4);
      if (ci >= 0) {
        p.set(g.worldX(ci % g.nx), g.floor[ci], g.worldZ((ci / g.nx) | 0));
        return p;
      }
    } catch {
      /* grid shape changed: fall through to the ground */
    }
  }
  const phys = ctx?.peek?.('physics');
  const gy = phys?.groundHeight?.(p.x, p.z, p.y + 6);
  if (Number.isFinite(gy)) p.y = gy;
  else {
    const wy = ctx?.peek?.('world')?.groundHeight?.(p.x, p.z);
    if (Number.isFinite(wy)) p.y = wy;
  }
  return p;
}

/** Derive team spawns from a flat spawn list: split along the long axis. */
function deriveSpawns(points) {
  const pts = points.map(toSpawn).filter(Boolean);
  if (pts.length < 2) {
    const one = pts[0] ?? { pos: new THREE.Vector3(), yaw: 0 };
    return { esf: [one], hostile: [one], axis: new THREE.Vector3(0, 0, 1) };
  }
  // The pair furthest apart: the map's long axis.
  let a = 0;
  let b = 1;
  let best = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = pts[i].pos.distanceToSquared(pts[j].pos);
      if (d > best) {
        best = d;
        a = i;
        b = j;
      }
    }
  }
  const origin = pts[a].pos;
  const axis = new THREE.Vector3().subVectors(pts[b].pos, origin).setY(0).normalize();
  const ranked = pts
    .map((s) => ({ s, t: (s.pos.x - origin.x) * axis.x + (s.pos.z - origin.z) * axis.z }))
    .sort((u, v) => u.t - v.t);
  const half = Math.ceil(ranked.length / 2);
  const esf = ranked.slice(0, half).map((r) => r.s);
  const hostile = ranked.slice(ranked.length - half).map((r) => r.s);
  // Face the other side: a spawn that faces the wall wastes the first second.
  const cE = centroid(esf);
  const cH = centroid(hostile);
  for (const s of esf) s.yaw = Math.atan2(cH.x - s.pos.x, cH.z - s.pos.z) + Math.PI;
  for (const s of hostile) s.yaw = Math.atan2(cE.x - s.pos.x, cE.z - s.pos.z) + Math.PI;
  return { esf, hostile, axis };
}

/**
 * The spawn yaw convention: world spawnPoints carry the yaw the PLAYER system
 * uses (camera looks down -Z at yaw 0), so "face target" is atan2(-dx, -dz).
 * The derived yaws above are written in that convention (atan2(dx,dz) + PI).
 */
export function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/**
 * Resolve spawns + objective zones for the current map.
 * @returns {{
 *   spawns: {esf: Array<{pos,yaw}>, hostile: Array<{pos,yaw}>},
 *   dom: {A,B,C}, hp: Array<zone>, sd: {A, B, attackers}, survival: zone|null,
 *   derived: {spawns:boolean, dom:boolean, hp:boolean, sd:boolean}
 * }}
 */
export function resolveMapData(ctx) {
  const world = ctx?.peek?.('world');
  const derived = { spawns: false, dom: false, hp: false, sd: false };

  // ---- spawns -------------------------------------------------------------
  let spawns = null;
  const ws = world?.spawns;
  if (ws && Array.isArray(ws.esf) && Array.isArray(ws.hostile) && ws.esf.length && ws.hostile.length) {
    spawns = {
      esf: ws.esf.map(toSpawn).filter(Boolean),
      hostile: ws.hostile.map(toSpawn).filter(Boolean),
    };
    if (!spawns.esf.length || !spawns.hostile.length) spawns = null;
  }
  if (!spawns) {
    const d = deriveSpawns(world?.spawnPoints ?? []);
    spawns = { esf: d.esf, hostile: d.hostile };
    derived.spawns = true;
  }
  const cE = centroid(spawns.esf);
  const cH = centroid(spawns.hostile);
  const along = (t) => snapToNav(ctx, new THREE.Vector3().lerpVectors(cE, cH, t));

  const objs = world?.objectives ?? {};

  // ---- domination -----------------------------------------------------------
  let dom = null;
  if (objs.dom && objs.dom.A && objs.dom.B && objs.dom.C) {
    dom = { A: toZone(objs.dom.A, 4.5, 'A'), B: toZone(objs.dom.B, 4.5, 'B'), C: toZone(objs.dom.C, 4.5, 'C') };
    if (!dom.A || !dom.B || !dom.C) dom = null;
  }
  if (!dom) {
    dom = {
      A: { id: 'A', label: 'A', pos: along(0.24), radius: 4.5 },
      B: { id: 'B', label: 'B', pos: along(0.5), radius: 4.5 },
      C: { id: 'C', label: 'C', pos: along(0.76), radius: 4.5 },
    };
    derived.dom = true;
  }

  // ---- hardpoint -------------------------------------------------------------
  let hp = null;
  if (Array.isArray(objs.hp) && objs.hp.length) {
    hp = objs.hp.map((z, i) => toZone(z, 5, 'P' + (i + 1))).filter(Boolean);
    if (!hp.length) hp = null;
  }
  if (!hp) {
    hp = [
      { id: 'P1', pos: dom.B.pos.clone(), radius: 5 },
      { id: 'P2', pos: dom.A.pos.clone(), radius: 5 },
      { id: 'P3', pos: dom.C.pos.clone(), radius: 5 },
    ];
    const home = world?.objective?.position;
    if (home && hp.every((z) => z.pos.distanceTo(home) > 9)) {
      hp.push({ id: 'P4', pos: snapToNav(ctx, home.clone(), 4), radius: 5 });
    }
    derived.hp = true;
  }
  hp.forEach((z, i) => {
    z.index = i;
    z.label = z.label ?? String(i + 1);
  });

  // ---- search & destroy ------------------------------------------------------
  let sd = null;
  if (objs.sd && objs.sd.A && objs.sd.B) {
    sd = {
      A: toZone(objs.sd.A, 3, 'A'),
      B: toZone(objs.sd.B, 3, 'B'),
      attackers: TEAMS.includes(objs.sd.attackers) ? objs.sd.attackers : 'hostile',
    };
    if (!sd.A || !sd.B) sd = null;
  }
  if (!sd) {
    // Hostiles attack first, so both sites sit in ESF's half, apart from each
    // other and clear of the ESF spawns.
    const a = along(0.3);
    let b = along(0.12);
    if (a.distanceTo(b) < 10) b = along(0.05);
    sd = {
      A: { id: 'A', label: 'A', pos: a, radius: 3 },
      B: { id: 'B', label: 'B', pos: b, radius: 3 },
      attackers: 'hostile',
    };
    derived.sd = true;
  }

  // ---- survival ---------------------------------------------------------------
  const survival = toZone(objs.survival, 4, 'A') ?? (world?.objective ? toZone(world.objective, 4, 'A') : null);

  return { spawns, dom, hp, sd, survival, derived, centroids: { esf: cE, hostile: cH } };
}
