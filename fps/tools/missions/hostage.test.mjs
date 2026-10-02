#!/usr/bin/env node
/**
 * HOSTAGE TAKER, headless, start to finish (see underground.test.mjs for the
 * method). The escort is walked for real: Doug is moved along the route in
 * steps and the VIP (an AI civilian on 'follow') must catch up at each one.
 * The fail run stands in the library until the taker's nerve goes (VIP shot ->
 * failed) and retries from the rescue checkpoint.
 */
import { argv, openMission } from './lib.mjs';
import { walkThrough, failAndRetry, teleport } from './flow.mjs';

const args = argv();
const t = await openMission('hostage', { base: args.base });

await walkThrough(t, [
  { id: 'gate', groups: ['court'], go: { x: 1.5, y: 0, z: 43, yaw: 0 } },
  { id: 'court', kill: 'court' },
  { id: 'house', groups: ['house', 'library'], go: 'hallCentre' },
  { id: 'ground', kill: 'house' },
  {
    id: 'rescue',
    wait: async () => {
      const vip = await t.eval(() => window.FLOP.mission.civ('vip'));
      const taker = await t.eval(() => window.FLOP.mission.agent('taker'));
      t.check(vip?.alive && taker?.alive, 'the hostage-taker holds the VIP in the library');
      await teleport(t, 'libraryDoor');
    },
    killTag: 'taker',
    after: async () => t.check((await t.eval(() => window.FLOP.mission.civ('vip')))?.alive, 'VIP survived the shot'),
  },
  {
    id: 'escort',
    groups: ['response'],
    maxFrames: 900,
    wait: async () => {
      const s = await t.state();
      t.check(s.alarm === true, 'alarm raised');
      const path = await t.eval(() => window.FLOP.mission.mode.points.escortPath.map((v) => ({ x: v.x, y: v.y, z: v.z })));
      for (const p of path) {
        await teleport(t, p);
        await t.until(
          `(() => { const v = FLOP.mission.civ('vip'); const q = window.__ENGINE__.ctx.peek('player').position; return v && v.alive && Math.hypot(v.x - q.x, v.z - q.z) < 7; })()`,
          `VIP followed to (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`,
          500
        );
      }
    },
  },
]);

await failAndRetry(t, {
  skipTo: 4,
  expectCheckpoint: 4,
  reason: 'vip',
  label: "lingered in the library (taker's nerve)",
  fail: async () => {
    await t.eval(() => window.FLOP.mission.teleport({ x: -21, y: 3.4, z: -5, yaw: Math.PI }));
  },
});

process.exit((await t.close()) ? 0 : 1);
