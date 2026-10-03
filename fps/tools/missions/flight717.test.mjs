#!/usr/bin/env node
/**
 * FLIGHT 717, headless, start to finish (see underground.test.mjs for the
 * method). Also checks the passengers (civilians cowering in the seats), the
 * civilian-hit rule (a hit is counted, the third fails the mission) and the
 * retry from the boarding checkpoint.
 */
import { argv, openMission } from './lib.mjs';
import { walkThrough, failAndRetry, teleport } from './flow.mjs';

const args = argv();
const t = await openMission('flight717', { base: args.base });

const civCount = async () => t.eval(() => Object.values(window.FLOP.mission.state.civs).filter((c) => c.alive).length);

await walkThrough(t, [
  { id: 'breach', groups: ['terminal'], go: 'entryHall' },
  { id: 'terminal', kill: 'terminal' },
  { id: 'gate', groups: ['gate'], go: 'gateLounge' },
  { id: 'gatefight', kill: 'gate' },
  {
    id: 'board',
    groups: ['cabin', 'cockpit'],
    wait: async () => {
      const n = await civCount();
      t.check(n === 12, `passengers aboard: ${n} civilians (10 seated, crew, the pilot)`);
      const pilot = await t.eval(() => window.FLOP.mission.civ('pilot'));
      t.check(pilot?.alive, 'the pilot is held in the cockpit');
      await teleport(t, 'cabinMid');
    },
  },
  {
    id: 'cabin',
    before: async () => {
      await t.eval(() => window.FLOP.mission.hitCivilian('pax3'));
      await t.frames(2);
      const s = await t.state();
      t.check(s.stats.civHits === 1 && !s.result, 'a civilian hit is counted (1/3), mission continues');
      const sub = await t.eval(() => window.FLOP.hud.objective.sub);
      t.check(/PASSENGERS UNHARMED 10\/11/.test(sub), `HUD: "${sub}"`);
    },
    kill: 'cabin',
  },
  {
    id: 'leader',
    killTag: 'leader',
    after: async () => t.check((await t.eval(() => window.FLOP.mission.civ('pilot')))?.alive, 'pilot survived the shot'),
  },
]);

await failAndRetry(t, {
  skipTo: 5,
  expectCheckpoint: 4,
  reason: 'civilians',
  label: 'three civilian hits',
  fail: async () => {
    for (const tag of ['pax1', 'pax2', 'pax4']) {
      await t.eval((g) => window.FLOP.mission.hitCivilian(g), tag);
      await t.frames(1);
    }
  },
});

process.exit((await t.close()) ? 0 : 1);
