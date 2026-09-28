import { OUTLINE, PARTITIONS, PLANE, BRIDGE, ESCALATORS, EAST_STAIR, DECK } from './layout.js';

/**
 * HOLDING PATTERN — collision and clearance self-test.
 *
 * Run from a capture eval: `window.__ENGINE__.ctx.peek('world').selfTest()`.
 * Three families, all against the live physics world:
 *   RAYS      downward rays onto every walkable level must land on the floor
 *             height the builder authored; horizontal rays at known walls,
 *             glazing, cover and vehicles must hit inside the expected range.
 *   HEADROOM  every walkable opening (terminal doors, service doors, the
 *             bridge, the airliner's doors) has at least 2.4 m clear above
 *             its floor.
 *   WALKS     the real player controller, stepped at 120 Hz standing: it must
 *             pass through every doorway and along every route without the
 *             stance ever leaving `stand`, and must be stopped by walls.
 *
 * It moves the player, so it is a dev tool: call it in capture mode only.
 */

const CLEAR = 2.4;

export function runSelfTest(ctx, world) {
  const phys = ctx.peek('physics');
  const player = ctx.peek('player');
  const V = ctx.camera.position.constructor;
  const W = (x, y, z) => world.levelToWorld(x, y, z, new V());
  const WD = (dx, dz) => [-dz, dx]; // level direction -> world direction (x, z)
  const toLevel = (p) => world.worldToLevel(p.x, p.y, p.z, new V());
  const MASK = phys.MASK.CHARACTER;
  const results = [];
  const rec = (kind, name, ok, info) => results.push({ kind, name, ok, info });

  // ------------------------------------------------------------ floors --
  const fy = PLANE.floorY;
  const escY = (z) => (ESCALATORS.y * (ESCALATORS.zTop + ESCALATORS.y / Math.tan(ESCALATORS.slope) - z)) / (ESCALATORS.y / Math.tan(ESCALATORS.slope));
  const floors = [
    ['entry hall', -16, -23, 0],
    ['gate lounge', 22, 3, 0],
    ['food court', -30, 1, 0],
    ['service corridor', 28.8, -20, 0],
    ['kitchen', -26, 22, 0],
    ['arrivals', -10, 24, 0],
    ['check-in', -7, -1.5, 0],
    ['concourse', 8, 5, 0],
    ['deck', 15, -13, DECK.y],
    ['escalator lane', ESCALATORS.lanes[0][0], -6, escY(-6)],
    ['east stair top', EAST_STAIR.x, EAST_STAIR.zTop + 0.2, EAST_STAIR.rise * EAST_STAIR.steps],
    ['cabin aisle', 30, PLANE.fz, fy],
    ['front galley', 37.5, PLANE.fz, fy],
    ['cockpit', 46.2, PLANE.fz + 0.9, fy],
    ['hold', 15.2, PLANE.fz, PLANE.holdY],
    ['bridge seg1', 33, BRIDGE.seg1.z, BRIDGE.seg1.y0 + (BRIDGE.seg1.y1 - BRIDGE.seg1.y0) * ((33 - BRIDGE.seg1.x0) / (BRIDGE.seg1.x1 - BRIDGE.seg1.x0))],
    ['rotunda', BRIDGE.rot.x, BRIDGE.rot.z, BRIDGE.rot.y],
    ['bridge seg2', BRIDGE.seg2.x, 15.8, BRIDGE.seg2.y0 + (BRIDGE.seg2.y1 - BRIDGE.seg2.y0) * ((15.8 - BRIDGE.seg2.z0) / (BRIDGE.seg2.z1 - BRIDGE.seg2.z0))],
    ['south apron', 0, 45, 0],
    ['east apron', 60, 0, 0],
    ['kerb', -10, -30, 0],
  ];
  for (const [name, x, z, y] of floors) {
    const o = W(x, y + 1.2, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, -1, 0, 3, MASK);
    const got = h.hit ? toLevel(h.point).y : null;
    rec('floor', name, h.hit && Math.abs(got - y) < 0.12, got === null ? 'miss' : `y=${got.toFixed(2)} want ${y.toFixed(2)}`);
  }

  // ------------------------------------------------------------- walls --
  const walls = [
    // name, from x,y,z, level dir, max distance
    ['north facade', 0, 1, -24, 0, -1, 2.3],
    ['south glass', 10, 1.5, 10, 0, 1, 2.3],
    ['gate east glass', 27, 1.5, 0, 1, 0, 2.3],
    ['food court glazing', -35, 1.5, 0, -1, 0, 2.3],
    ['kitchen west wall', -29, 1, 15, -1, 0, 2.3],
    ['arrivals south wall', -15, 1, 25.5, 0, 1, 2.3],
    ['service east wall', 36.5, 1, -18, 1, 0, 2.3],
    ['retail/service partition', 26, 1, -22.5, 1, 0, 1.4],
    ['security partition', -4, 1, -15, 1, 0, 2.3],
    ['deck balustrade', 20, DECK.y + 0.6, -11, 0, 1, 1.5],
    ['cabin north wall', 30, fy + 1.4, 24, 0, -1, 1.6],
    ['cabin south wall', 30, fy + 1.4, 26, 0, 1, 1.6],
    ['nose wall', 48.2, fy + 1.6, PLANE.fz, 1, 0, 1.8],
    ['aft bulkhead', 12, fy + 1.4, PLANE.fz, -1, 0, 3.3],
    ['bridge seg2 wall', BRIDGE.seg2.x, 3.9, 15.8, 1, 0, 1.3],
    ['bridge seg1 wall', 33, 2.2, BRIDGE.seg1.z, 0, -1, 1.3],
    ['hold wall', 15.2, PLANE.holdY + 0.6, PLANE.fz, 0, -1, 1.6],
    ['belly', 30, 2.4, 20, 0, 1, 3.9],
    ['engine', 23.6, 1.8, 16.0, 0, 1, 3.2],
    ['cabin seat pair', 20.2, fy + 0.7, PLANE.fz, 0, -1, 0.8],
    ['check-in island', -11.5, 0.8, -7, 1, 0, 1.6],
    ['gate desk', 20.5, 0.8, -3.2, 0, 1, 2.0],
    ['lounge seats', 20.6, 0.5, -9.2, 0, 1, 2.4],
    ['roundhouse', 18.5, 1.5, 46, -1, 0, 3.0],
    ['ULD stack', 2.0, 0.8, 29.5, 0, 1, 2.2],
    ['cart train', 5.0, 0.9, 37.2, 1, 0, 3.0],
    ['south fence', 0, 1.5, 57.5, 0, 1, 3.0],
    ['east fence', 77.5, 1.5, 20, 1, 0, 3.0],
    ['west fence', -37.5, 1.5, 40, -1, 0, 3.0],
    ['kerb edge', -10, 1.0, -32.5, 0, -1, 2.3],
  ];
  for (const [name, x, y, z, dx, dz, max] of walls) {
    const o = W(x, y, z);
    const [wx, wz] = WD(dx, dz);
    const h = phys.raycast(o.x, o.y, o.z, wx, 0, wz, max + 1, MASK);
    rec('wall', name, h.hit && h.distance <= max, h.hit ? `d=${h.distance.toFixed(2)} max ${max}` : 'miss');
  }

  // ------------------------------------------------------- the openings --
  // [name, x, z, floorY, level normal dx, dz]
  const openings = [];
  const addWallOpenings = (list, tag) => {
    for (const w of list) {
      const [x0, z0, x1, z1] = w;
      const ops = tag === 'outline' ? w[5] : w[5];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len;
      const uz = (z1 - z0) / len;
      for (const [a, b] of ops) {
        if (b - a > 3.2) continue; // colonnades are open to the roof
        const s = (a + b) / 2;
        openings.push([`${tag} ${x0},${z0}->${x1},${z1} @${s.toFixed(1)}`, x0 + ux * s, z0 + uz * s, 0, uz, -ux]);
      }
    }
  };
  addWallOpenings(OUTLINE, 'outline');
  addWallOpenings(PARTITIONS, 'partition');
  const dm = (d) => (d[0] + d[1]) / 2;
  openings.push(['door L1', dm(PLANE.doorL1), PLANE.cabinZ0 - 0.2, fy, 0, 1]);
  openings.push(['slide door', dm(PLANE.doorSlide), PLANE.cabinZ1 + 0.2, fy, 0, -1]);
  openings.push(['cockpit door', PLANE.cockpitX, PLANE.fz, fy, 1, 0]);
  openings.push(['bridge cab', BRIDGE.seg2.x, BRIDGE.seg2.z1 + 0.5, BRIDGE.seg2.y1, 0, 1]);
  openings.push(['rotunda', BRIDGE.rot.x - BRIDGE.rot.r, BRIDGE.seg1.z, BRIDGE.rot.y, 1, 0]);

  const findFloor = (x, z, yHint) => {
    const o = W(x, yHint + 1.0, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, -1, 0, 2.5, MASK);
    return h.hit ? toLevel(h.point).y : null;
  };
  for (const [name, x, z, y] of openings) {
    const f = findFloor(x, z, y) ?? y;
    const o = W(x, f + 0.1, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, 1, 0, 6, MASK);
    const clear = h.hit ? h.distance + 0.1 : 99;
    rec('headroom', name, clear >= CLEAR, `${clear >= 99 ? 'open' : clear.toFixed(2) + ' m'}`);
  }

  // -------------------------------------------------------------- walks --
  const m = player?.movement;
  if (!m) {
    rec('walk', 'player', false, 'no player movement');
    return summarise(results);
  }
  const prevCtl = player.controlEnabled;
  player.setControlEnabled?.(true);
  const walk = (start, legs) => {
    player.teleport(W(start[0], start[1] + 1.66 + 0.04, start[2]), 0);
    m.velocity.set(0, 0, 0);
    let crouched = false;
    for (const [dx, dz, seconds, stance] of legs) {
      const [wx, wz] = WD(dx, dz);
      m.yaw = Math.atan2(-wx, -wz);
      m.stanceWant = stance ?? 'stand';
      const n = Math.round(seconds * 120);
      for (let i = 0; i < n; i++) {
        m._cmdFrame = ctx.time.frame;
        m.cmd.moveX = 0;
        m.cmd.moveY = 1;
        m.cmd.sprintHeld = false;
        m.cmd.crouchPressed = false;
        m.cmd.jump = false;
        m.step(1 / 120);
        if ((stance ?? 'stand') === 'stand' && m.stance !== 'stand') crouched = true;
      }
    }
    m.stanceWant = 'stand';
    return { p: toLevel(m.position), crouched };
  };
  for (const [name, x, z, y, nx, nz] of openings) {
    const f = findFloor(x - nx * 1.4, z - nz * 1.4, y) ?? y;
    const r = walk([x - nx * 1.4, f, z - nz * 1.4], [[nx, nz, 1.0]]);
    const crossed = (r.p.x - x) * nx + (r.p.z - z) * nz;
    rec('door', name, crossed > 0.6 && !r.crouched, `past=${crossed.toFixed(2)}${r.crouched ? ' CROUCHED' : ''}`);
  }
  const routes = [
    ['slide up', [dm(PLANE.doorSlide), 0, 36.4], [[0, -1, 4.8]], (p) => p.y > fy - 0.1 && p.z < PLANE.cabinZ1],
    ['gate -> bridge -> L1', [24, 0, BRIDGE.seg1.z], [[1, 0, 3.0], [0, 1, 3.3]], (p) => p.y > fy - 0.1 && p.z > PLANE.cabinZ0],
    ['belt loader -> hold (crouched)', [dm(PLANE.cargoDoor), 0, 35.8], [[0, -1, 5.0, 'crouch']], (p) => Math.abs(p.y - PLANE.holdY) < 0.15 && p.z < PLANE.fz + 1.3],
    ['loader -> hold -> hatch -> galley', [dm(PLANE.cargoDoor), 0, 35.8], [[0, -1, 5.0, 'crouch'], [-1, 0, 0.6, 'crouch'], [0, -1, 0.35, 'crouch'], [1, 0, 0.3, 'crouch'], [1, 0, 1.5]], (p) => p.y > fy - 0.1],
    ['escalator up', [ESCALATORS.lanes[0][0], 0, 0.5], [[0, -1, 3.2]], (p) => Math.abs(p.y - DECK.y) < 0.1],
    ['east stair up', [EAST_STAIR.x, 0, -2.5], [[0, -1, 3.2]], (p) => Math.abs(p.y - DECK.y) < 0.1],
    ['aisle -> cockpit', [34, fy, PLANE.fz], [[1, 0, 3.0]], (p) => p.x > PLANE.cockpitX + 0.5],
    ['kerb -> entry hall', [-10, 0, -31], [[0, 1, 2.0]], (p) => p.z > -24],
    ['concourse -> gate', [4, 0, 8], [[1, 0, 4.0]], (p) => p.x > 18],
    ['food court -> kitchen', [-26.6, 0, 8.5], [[0, 1, 1.6]], (p) => p.z > 12],
  ];
  for (const [name, start, legs, ok] of routes) {
    const r = walk(start, legs);
    const lastStance = legs[legs.length - 1][3] ?? 'stand';
    rec('route', name, ok(r.p) && (lastStance !== 'stand' || !r.crouched), `end ${r.p.x.toFixed(1)},${r.p.y.toFixed(2)},${r.p.z.toFixed(1)}${r.crouched ? ' CROUCHED' : ''}`);
  }
  const blocked = [
    ['into north facade', [0, 0, -24.4], [0, -1]],
    ['into south glass', [10, 0, 10.4], [0, 1]],
    ['into gate east glass', [27.4, 0, 0], [1, 0]],
    ['into cabin wall', [30, fy, 24.0], [0, -1]],
    ['into bridge wall', [BRIDGE.seg2.x, 2.4, 15.8], [1, 0]],
    ['into fence', [0, 0, 58], [0, 1]],
    ['into roundhouse', [18.5, 0, 46], [-1, 0]],
    ['into kitchen wall', [-29.5, 0, 15], [-1, 0]],
  ];
  for (const [name, start, [dx, dz]] of blocked) {
    const r = walk(start, [[dx, dz, 1.5]]);
    const moved = (r.p.x - start[0]) * dx + (r.p.z - start[2]) * dz;
    rec('blocked', name, moved < 1.5, `moved ${moved.toFixed(2)}`);
  }
  player.setControlEnabled?.(prevCtl ?? false);
  player.respawn?.(world.playerSpawnIndex ?? 0);
  return summarise(results);
}

function summarise(results) {
  const fail = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - fail.length, failed: fail, results };
}
