// Dev probe: A* paths the AI would take out of THE RESIDENCE library.
import * as THREE from 'three';
import { openMission } from './lib.mjs';
const t = await openMission('hostage', { base: process.argv[2] });
await t.until('window.FLOP?.mission?.state?.started === true', 'started', 600);
const out = await t.eval(() => {
  const ai = window.__ENGINE__.ctx.peek('ai');
  const V = ai.player.position.constructor;
  const from = new V(-19, 3.4, -3);
  const res = {};
  for (const [name, d] of Object.entries({ garden: [-35, 3.4, -8], corridor: [-21, 3.4, -7.5], terrace: [0, 3.4, 4], hall: [0, 3.4, -4], lawn: [-27, 0, 40] })) {
    ai._pathBudget = 99;
    const dest = new V(...d);
    const snapped = new V();
    ai.snapWalkable(dest, dest.y, snapped, 4);
    const path = [];
    for (let i = 0; i < 64; i++) path.push(new V());
    const n = ai.requestPath(from, snapped, path);
    res[name] = { n, snapped: [snapped.x, snapped.y, snapped.z].map((v) => +v.toFixed(1)), path: path.slice(0, Math.max(0, n)).map((p) => [p.x, p.y, p.z].map((v) => +v.toFixed(1))) };
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
await t.close();
void THREE;
