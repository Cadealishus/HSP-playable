// Dev probe: THE RESIDENCE escort at the side door. Logs the VIP, his path and
// the lead point while Doug stands in the west garden.
import { openMission } from './lib.mjs';
const t = await openMission('hostage', { base: process.argv[2] });
await t.until('window.FLOP?.mission?.state?.started === true', 'started', 600);
await t.eval(() => window.FLOP.god(true));
for (let i = 0; i < 4; i++) {
  await t.eval(() => window.FLOP.mission.skip());
  await t.frames(2);
}
await t.until("!!FLOP.mission.agent('taker')", 'taker', 300);
await t.eval(() => window.FLOP.mission.teleport({ x: -21, y: 3.4, z: -6.6, yaw: 0 }));
await t.eval(() => window.FLOP.mission.kill('taker', true));
await t.until('FLOP.mission.state.objective === "escort"', 'escort', 100);
const dump = () =>
  t.eval(() => {
    const m = window.FLOP.mission.mode;
    const c = m.civs.get('vip');
    const ai = window.__ENGINE__.ctx.peek('ai');
    const V = c.position.constructor;
    const path = [];
    for (let i = 0; i < 40; i++) path.push(new V());
    ai._pathBudget = 99;
    const n = ai.requestPath(c.position, m._lead.position, path);
    const r = (v) => [v.x, v.y, v.z].map((q) => +q.toFixed(2));
    return {
      vip: r(c.position),
      lead: r(m._lead.position),
      nodes: [m._vipNode, m._dougNode],
      moving: c.isMoving?.(),
      failed: c.moveFailed,
      own: c.path.slice(0, c.pathLen).map(r),
      idx: c.pathIndex,
      solve: path.slice(0, Math.max(0, n)).map(r),
      n,
    };
  });
for (const p of [[-24, 3.4, -7.5], [-27.4, 3.4, -7.5], [-31, 3.4, -8]]) {
  await t.eval((q) => window.FLOP.mission.teleport({ x: q[0], y: q[1], z: q[2], yaw: 0 }), p);
  for (let k = 0; k < 6; k++) {
    await t.frames(12);
    console.log(`doug ${p}`, JSON.stringify(await dump()));
  }
}
await t.close();
