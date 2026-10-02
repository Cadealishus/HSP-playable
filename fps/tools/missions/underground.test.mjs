#!/usr/bin/env node
/**
 * OPERATION LAST TRAIN, headless, start to finish.
 *
 *   node tools/missions/underground.test.mjs [--base=http://127.0.0.1:5291/]
 *
 * Every reach objective is completed by putting Doug inside its trigger volume,
 * every clear objective by killing its squad through the real damage path
 * (damage:dealt -> the AI's own listener -> actor:death -> the mission), every
 * interaction by holding the real F key through the input layer. Then the
 * debrief is checked, and a second run dies after a checkpoint and retries
 * from it.
 */
import { argv, openMission } from './lib.mjs';
import { walkThrough, failAndRetry } from './flow.mjs';

const args = argv();
const t = await openMission('underground', { base: args.base });

await walkThrough(t, [
  { id: 'descend', groups: ['hall'], go: 'ticketHall' },
  { id: 'hall', kill: 'hall' },
  { id: 'platform', go: 'platformA', after: async () => t.check((await t.state()).power === 'emergency', 'power cut on Platform A (world.power = emergency)') },
  { id: 'power', go: 'powerSwitch', hold: true, after: async () => t.check((await t.state()).power === 'normal', 'mains restored (world.power = normal)') },
  { id: 'platforms', kill: 'platforms' },
  {
    id: 'tunnel',
    go: { x: 43, y: 4.0, z: -3, yaw: Math.PI / 2 },
    waitGroup: 'tunnel',
    then: 'rampTopCentre',
  },
  { id: 'breach', groups: ['facility', 'deep'], go: 'facilityCheckpoint' },
  { id: 'secure', kill: 'facility' },
  { id: 'console', go: 'commsConsole', hold: true },
  { id: 'extract', groups: ['rearguard'], go: 'extraction' },
]);

await failAndRetry(t, { skipTo: 3, expectCheckpoint: 2 });

process.exit((await t.close()) ? 0 : 1);
