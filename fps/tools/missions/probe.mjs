// Dev probe: the HOSTAGE TAKER escort. Skip to the rescue, drop the taker,
// then move Doug along a route and log where the following VIP gets to.
import { openMission } from './lib.mjs';
const t = await openMission('hostage', { base: process.argv[2] });
await t.until('window.FLOP?.mission?.state?.started === true', 'started', 600);
await t.eval(() => window.FLOP.god(true));
for (let i = 0; i < 4; i++) {
  await t.eval(() => window.FLOP.mission.skip());
  await t.frames(2);
}
await t.until("!!FLOP.mission.agent('taker')", 'taker', 300);
await t.eval(() => window.FLOP.mission.kill('taker', true));
await t.until('FLOP.mission.state.objective === "escort"', 'escort', 100);
const route = process.argv[3] === 'front'
  ? [[-6, 3.4, -7.5], [0, 3.4, -3], [0, 3.4, 4], [0, 0, 19], [-15, 0, 30], [-27, 0, 40]]
  : [[-21, 3.4, -7.5], [-27.5, 3.4, -7.5], [-35, 3.4, -8], [-38, 3.4, -1], [-38, 0, 13], [-30, 0, 30], [-27, 0, 40]];
for (const [x, y, z] of route) {
  await t.eval((p) => window.FLOP.mission.teleport(p), { x, y, z, yaw: 0 });
  for (let k = 0; k < 8; k++) {
    await t.frames(15);
    const v = await t.eval(() => {
      const c = window.FLOP.mission.mode.civs.get('vip');
      return c ? { x: +c.position.x.toFixed(1), y: +c.position.y.toFixed(1), z: +c.position.z.toFixed(1), b: c.behavior, st: c.state, path: c.path?.length ?? null } : null;
    });
    console.log(`doug (${x},${z})  vip`, JSON.stringify(v));
    if (v && Math.hypot(v.x - x, v.z - z) < 6) break;
  }
}
console.log(JSON.stringify(await t.state()));
await t.close();
