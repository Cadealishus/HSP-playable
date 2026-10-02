// Dev probe: boot a mission URL and dump what the page publishes.
import { openMission } from './lib.mjs';
const id = process.argv[2] ?? 'underground';
const t = await openMission(id, { base: process.argv[3] });
const w0 = Date.now();
await t.frames(5);
console.log('fps', (5 / ((Date.now() - w0) / 1000)).toFixed(2));
console.log(
  JSON.stringify(
    await t.eval(() => {
      const c = window.__ENGINE__.ctx;
      const w = c.peek('world');
      const ai = c.peek('ai');
      return {
        map: w.mapId,
        anchors: Object.keys(w.anchors || {}),
        aiProto: Object.getOwnPropertyNames(Object.getPrototypeOf(ai)),
        state: window.FLOP.state,
        mission: window.FLOP.mission?.state ?? null,
        p: c.peek('player').position,
      };
    }),
    null,
    1
  )
);
await t.close();
