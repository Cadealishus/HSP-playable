// Dev probe: boot a mission URL, check the use key reaches the input layer.
import { openMission } from './lib.mjs';
const id = process.argv[2] ?? 'underground';
const t = await openMission(id, { base: process.argv[3] });
await t.until('window.FLOP?.mission?.state?.started === true', 'started', 600);
const w0 = Date.now();
await t.frames(5);
console.log('fps', (5 / ((Date.now() - w0) / 1000)).toFixed(2));
await t.page.keyboard.down('KeyF');
await t.frames(3);
console.log(
  JSON.stringify(
    await t.eval(() => {
      const c = window.__ENGINE__.ctx;
      const i = c.input;
      return { use: i.action('use'), down: [...i.down], enabled: i.enabled, frozen: i.frozen, focus: document.hasFocus(), state: window.FLOP.state.mode };
    })
  )
);
await t.page.keyboard.up('KeyF');
await t.close();
