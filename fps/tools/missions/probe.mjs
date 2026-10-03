// Dev probe: walk THE RESIDENCE escort along a route and log the following VIP.
//   node tools/missions/probe.mjs <base> side|front
import { openMission } from './lib.mjs';
const t = await openMission('hostage', { base: process.argv[2] });
await t.until('window.FLOP?.mission?.state?.started === true', 'started', 600);
await t.eval(() => window.FLOP.god(true));
for (let i = 0; i < 4; i++) {
  await t.eval(() => window.FLOP.mission.skip());
  await t.frames(2);
}
await t.until("!!FLOP.mission.agent('taker')", 'taker', 300);
await t.eval(() => window.FLOP.mission.teleport({ x: -20.8, y: 3.4, z: -7.3, yaw: 0 }));
await t.eval(() => window.FLOP.mission.kill('taker', true));
await t.until('FLOP.mission.state.objective === "escort"', 'escort', 100);
const G = 3.4;
const routes = {
  side: [[-20.8, G, -7.3], [-24.5, G, -7.5], [-27.6, G, -7.5], [-31, G, -8], [-35, G, -6], [-38, G, -1.5], [-38, 1.7, 5], [-38, 0, 11.5], [-34, 0, 19], [-30, 0, 27], [-27.5, 0, 34], [-27, 0, 40]],
  front: [[-20.8, G, -7.3], [-15, G, -7.5], [-9, G, -7.5], [-4, G, -6], [0, G, -2.5], [0, G, 1.5], [0, G, 6], [0, 1.7, 13.5], [0, 0, 19], [-8, 0, 25], [-16, 0, 30], [-22, 0, 35], [-27, 0, 40]],
};
for (const [x, y, z] of routes[process.argv[3] ?? 'front']) {
  await t.eval((p) => window.FLOP.mission.teleport(p), { x, y, z, yaw: 0 });
  let v = null;
  for (let k = 0; k < 12; k++) {
    await t.frames(10);
    v = await t.eval(() => {
      const c = window.FLOP.mission.mode.civs.get('vip');
      return c ? { x: +c.position.x.toFixed(1), y: +c.position.y.toFixed(1), z: +c.position.z.toFixed(1), st: c.state, mv: c.isMoving?.(), fail: c.moveFailed, n: c.pathLen, i: c.pathIndex } : null;
    });
    if (v && Math.hypot(v.x - x, v.z - z) < 3.6) break;
  }
  console.log(`doug (${x},${y},${z})  vip`, JSON.stringify(v));
}
console.log(JSON.stringify((await t.state()).result));
await t.close();
