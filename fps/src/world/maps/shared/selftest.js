/**
 * Collision and clearance self-test for the mission maps, after
 * airport/selftest.js. Run from a capture eval:
 *   window.__ENGINE__.ctx.peek('world').selfTest()
 *
 * Families, all against the live physics world:
 *   floor     a downward ray lands on the authored floor height
 *   wall      a horizontal ray hits inside the expected distance
 *   headroom  every door has >= 2.4 m clear above its floor
 *   door      the real player controller, stepped at 120 Hz standing, walks
 *             through every door without the stance leaving `stand`
 *   route     scripted walks (stairs, ramps, train cars) end where they should
 *   blocked   walking into a wall does not get through it
 *
 * `spec` = { floors, walls, openings, routes, blocked } in LEVEL space:
 *   floors   [name, x, z, y]
 *   walls    [name, x, y, z, dx, dz, maxDistance]
 *   openings [name, x, z, floorY, nx, nz]          (n = the walking direction)
 *   routes   [name, [x, y, z], [[dx, dz, seconds, stance?]...], (p) => bool]
 *   blocked  [name, [x, y, z], [dx, dz]]
 * It moves the player, so it is a dev tool: call it in capture mode only.
 */

const CLEAR = 2.4;

export function runMapSelfTest(ctx, world, spec) {
  const phys = ctx.peek('physics');
  const player = ctx.peek('player');
  const V = ctx.camera.position.constructor;
  const W = (x, y, z) => world.levelToWorld(x, y, z, new V());
  const o0 = world.levelToWorld(0, 0, 0, new V());
  const WD = (dx, dz) => {
    const p = world.levelToWorld(dx, 0, dz, new V());
    return [p.x - o0.x, p.z - o0.z];
  };
  const toLevel = (p) => world.worldToLevel(p.x, p.y, p.z, new V());
  const MASK = phys.MASK.CHARACTER;
  const results = [];
  const rec = (kind, name, ok, info) => results.push({ kind, name, ok, info });

  for (const [name, x, z, y] of spec.floors ?? []) {
    const o = W(x, y + 1.2, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, -1, 0, 3, MASK);
    const got = h.hit ? toLevel(h.point).y : null;
    rec('floor', name, h.hit && Math.abs(got - y) < 0.12, got === null ? 'miss' : `y=${got.toFixed(2)} want ${y.toFixed(2)}`);
  }
  for (const [name, x, y, z, dx, dz, max] of spec.walls ?? []) {
    const o = W(x, y, z);
    const [wx, wz] = WD(dx, dz);
    const h = phys.raycast(o.x, o.y, o.z, wx, 0, wz, max + 1, MASK);
    rec('wall', name, h.hit && h.distance <= max, h.hit ? `d=${h.distance.toFixed(2)} max ${max}` : 'miss');
  }
  const findFloor = (x, z, yHint) => {
    const o = W(x, yHint + 1.0, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, -1, 0, 2.5, MASK);
    return h.hit ? toLevel(h.point).y : null;
  };
  for (const [name, x, z, y] of spec.openings ?? []) {
    const f = findFloor(x, z, y) ?? y;
    const o = W(x, f + 0.1, z);
    const h = phys.raycast(o.x, o.y, o.z, 0, 1, 0, 6, MASK);
    const clear = h.hit ? h.distance + 0.1 : 99;
    rec('headroom', name, clear >= CLEAR, clear >= 99 ? 'open' : `${clear.toFixed(2)} m`);
  }

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
  for (const [name, x, z, y, nx, nz] of spec.openings ?? []) {
    const f = findFloor(x - nx * 1.4, z - nz * 1.4, y) ?? y;
    const r = walk([x - nx * 1.4, f, z - nz * 1.4], [[nx, nz, 1.0]]);
    const crossed = (r.p.x - x) * nx + (r.p.z - z) * nz;
    rec('door', name, crossed > 0.6 && !r.crouched, `past=${crossed.toFixed(2)}${r.crouched ? ' CROUCHED' : ''}`);
  }
  for (const [name, start, legs, ok] of spec.routes ?? []) {
    const r = walk(start, legs);
    const lastStance = legs[legs.length - 1][3] ?? 'stand';
    rec('route', name, ok(r.p) && (lastStance !== 'stand' || !r.crouched), `end ${r.p.x.toFixed(1)},${r.p.y.toFixed(2)},${r.p.z.toFixed(1)}${r.crouched ? ' CROUCHED' : ''}`);
  }
  for (const [name, start, [dx, dz]] of spec.blocked ?? []) {
    const r = walk(start, [[dx, dz, 1.5]]);
    const moved = (r.p.x - start[0]) * dx + (r.p.z - start[2]) * dz;
    rec('blocked', name, moved < 1.5, `moved ${moved.toFixed(2)}`);
  }
  player.setControlEnabled?.(prevCtl ?? false);
  player.respawn?.(world.playerSpawnIndex ?? 0);
  return summarise(results);
}

/** Door voids -> openings: each door is walked across its short axis. */
export function doorOpenings(voids) {
  const out = [];
  for (const v of voids) {
    if (!v.door) continue;
    const cx = (v.x0 + v.x1) / 2;
    const cz = (v.z0 + v.z1) / 2;
    const alongZ = v.z1 - v.z0 < v.x1 - v.x0; // thin in z: walk along z
    out.push([`${v.id} (+)`, cx, cz, v.y, alongZ ? 0 : 1, alongZ ? 1 : 0]);
    out.push([`${v.id} (-)`, cx, cz, v.y, alongZ ? 0 : -1, alongZ ? -1 : 0]);
  }
  return out;
}

function summarise(results) {
  const fail = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - fail.length, failed: fail, results };
}
