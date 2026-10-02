import { runChecks } from '../yardkit.js';
import { WAREHOUSE as W, DOCK_Y as Y, RACK, PERCH, CONTAINER_STAIR } from './layout.js';

/**
 * INDUSTRIAL YARD — collision / clearance self-test (see yardkit.runChecks).
 * `window.__ENGINE__.ctx.peek('world').selfTest()` from a capture eval.
 * Checks both warehouses (B is A turned round), so a mirror bug shows up.
 */
export function runSelfTest(ctx, world) {
  const floors = [];
  const walls = [];
  const doors = [];
  const routes = [];
  const blocked = [];
  const nav = [];
  for (const s of [1, -1]) {
    const t = s > 0 ? 'A' : 'B';
    const P = (x, z) => [s * x, s * z];
    const fl = (name, x, z, y) => floors.push([`${name} ${t}`, ...P(x, z), y]);
    fl('warehouse floor', -20, -40, Y);
    fl('apron', -16, -27.5, Y);
    fl('mezzanine', -18, -47.5, W.mezz.y);
    fl('mezz stair (mid)', W.mezzStairs[0], -41.6, 3.0);
    fl('catwalk', -10, (RACK.zFence + RACK.zAlley) / 2, RACK.tier);
    fl('perch', 39, PERCH.stairZ, PERCH.y);
    fl('container roof', -34.5, CONTAINER_STAIR.z, 2.59);
    fl('drive ramp (mid)', 6, W.eastDoor[0], 0.6);
    fl('yard', -40, 0, 0);
    const wl = (name, x, y, z, dx, dz, max) => walls.push([`${name} ${t}`, ...[s * x], y, s * z, s * dx, s * dz, max]);
    wl('warehouse back wall (from the mezz)', -20, 6.0, -47, 0, -1, 3.0);
    wl('warehouse west wall', -32.5, 2.5, -31.5, -1, 0, 2.0);
    wl('perimeter (north)', 30, 1.5, -54.5, 0, -1, 2.0);
    wl('perimeter (west)', -66.5, 1.5, 0, -1, 0, 2.0);
    wl('container tower', -15, 6.5, 12, 0, -1, 2.0);
    wl('pump house', 12, 1.5, -50, -1, 0, 3.2);
    wl('tank', 20, 2.0, -38.8, 0, -1, 2.3);
    wl('trailer', -27, 2.0, -13, 0, -1, 2.2);
    wl('mezz railing', -20, W.mezz.y + 0.6, -44.0, 0, -1, 1.5);
    const dr = (name, x, z, nx, nz) => doors.push([`${name} ${t}`, s * x, s * z, Y, s * nx, s * nz]);
    for (const [dx] of W.dockDoors) dr(`dock door x${dx}`, dx, W.z1, 0, -1);
    dr('personnel door', W.personnel[0], W.z1, 0, -1);
    dr('west door', W.x0, W.westDoor[0], 1, 0);
    dr('drive-in door', W.x1, W.eastDoor[0], -1, 0);
    dr('office door', -3.0, W.office.door[0], 1, 0);
    const rt = (name, start, legs, ok) =>
      routes.push([`${name} ${t}`, [s * start[0], start[1], s * start[2]], legs.map(([dx, dz, sec]) => [s * dx, s * dz, sec]), ok]);
    rt('mezzanine stair up', [W.mezzStairs[0], Y, -36.5], [[0, -1, 5.0]], (p) => p.y > W.mezz.y - 0.1);
    rt('catwalk stair up', [RACK.walk.x0 - 8.0, 0, (RACK.zFence + RACK.zAlley) / 2], [[1, 0, 6.5]], (p) => p.y > RACK.tier - 0.1);
    rt('perch stair up', [PERCH.stairX + 1.5, 0, PERCH.stairZ], [[-1, 0, 7.5]], (p) => p.y > PERCH.y - 0.1);
    rt('container stair up', [CONTAINER_STAIR.xGround + 1.2, 0, CONTAINER_STAIR.z], [[-1, 0, 4.5]], (p) => p.y > 2.5);
    rt('apron stair up', [W.x0 - 3.6, 0, (W.z1 + W.apronZ) / 2], [[1, 0, 3.0]], (p) => p.y > Y - 0.1);
    rt('drive ramp into the warehouse', [W.x1 + 9.5, 0, W.eastDoor[0]], [[-1, 0, 5.0]], (p) => Math.abs(p.x) < Math.abs(W.x1) + 50 && p.y > Y - 0.1);
    rt('west door stair in', [W.x0 - 5.0, 0, W.westDoor[0]], [[1, 0, 4.0]], (p) => p.y > Y - 0.1 && s * p.x > W.x0 + 0.5);
    const bl = (name, start, d) => blocked.push([`${name} ${t}`, [s * start[0], start[1], s * start[2]], [s * d[0], s * d[1]]]);
    bl('into the warehouse back wall', [-20, 0, -51.3], [0, 1]);
    bl('into the perimeter', [30, 0, -54.6], [0, -1]);
    bl('into a container', [-36, 0, -11], [0, 1]);
    bl('into the pump house', [10.6, 0, -50], [-1, 0]);
    bl('into the warehouse from the yard (dock face)', [-11, 0, -24.0], [0, -1]);
    const nv = (name, a, b) => nav.push([`${name} ${t}`, [s * a[0], a[1], s * a[2]], [s * b[0], b[1], s * b[2]]]);
    nv('spawn -> mezzanine', [-61, 0, -46], [-18, W.mezz.y, -47.4]);
    nv('spawn -> catwalk', [-61, 0, -46], [-10, RACK.tier, (RACK.zFence + RACK.zAlley) / 2]);
    nv('spawn -> container roof', [-62, 0, 4], [-34.5, 2.59, CONTAINER_STAIR.z]);
    nv('far spawn -> warehouse floor', [61, 0, 46], [-16, Y, -34]);
    nv('far spawn -> perch', [-61, 0, -46], [39, PERCH.y, PERCH.stairZ]);
  }
  return runChecks(ctx, world, { floors, walls, doors, routes, blocked, nav });
}
