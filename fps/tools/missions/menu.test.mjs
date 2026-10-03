#!/usr/bin/env node
/**
 * SPECIAL OPERATIONS from the main menu, the way a player gets there:
 * open the menu (no query string), go to SPECIAL OPERATIONS, check the three
 * operations are listed with their briefing and kit, click one (the launch
 * writes localStorage and reloads WITHOUT a query string), click the deploy
 * card on the new page, and check the mission is running with its issued kit.
 *
 *   node tools/missions/menu.test.mjs [--base=...] [--mission=hostage]
 */
import { argv, openPage, makeTester } from './lib.mjs';

const args = argv();
const base = args.base ?? 'http://127.0.0.1:5291/';
const want = typeof args.mission === 'string' ? args.mission : 'hostage';

const { browser, page, errors, logs } = await openPage(`${base}?q=low`);
const t = makeTester(browser, page, errors, logs);
// a clean slate: no stored session, issued kits
await t.eval(() => {
  try {
    localStorage.removeItem('flopops.session');
    localStorage.removeItem('flopops.missionKit');
  } catch {}
});

const menu = await t.eval(() => {
  const ui = window.__ENGINE__.ctx.peek('ui');
  const home = ui.attract.items.map((i) => i.label);
  ui.attract.go('missions');
  return { home, items: ui.attract.items.map((i) => ({ label: i.label, kind: i.kind ?? null })), missions: window.FLOP.mission === undefined ? ui.attract.host.missions() : null };
});
t.check(menu.home.includes('SPECIAL OPERATIONS'), `main menu lists SPECIAL OPERATIONS (${menu.home.join(' · ')})`);
const labels = menu.items.map((i) => i.label);
for (const l of ['OPERATION LAST TRAIN', 'FLIGHT 717', 'HOSTAGE TAKER', 'MISSION KIT']) t.check(labels.includes(l), `SPECIAL OPERATIONS lists ${l}`);
const ms = menu.missions ?? [];
t.check(ms.length === 3 && ms.every((m) => m.loadout?.primary && m.briefing?.length), 'each operation has a briefing and an issued kit');

// the panel shows the kit
const panel = await t.eval((label) => {
  const ui = window.__ENGINE__.ctx.peek('ui');
  const i = ui.attract.items.findIndex((x) => x.label === label);
  ui.attract._focus(i);
  return document.querySelector('.ow-mm-card')?.innerText ?? '';
}, ms.find((m) => m.id === want)?.label);
t.check(/KIT/.test(panel) && /ISSUED/.test(panel), 'mission panel shows the ISSUED kit');

// click the operation: storage + reload, no query string
const label = ms.find((m) => m.id === want)?.label;
const nav = page.waitForEvent('framenavigated', { timeout: 120_000 });
await t.eval((l) => {
  const rows = [...document.querySelectorAll('.ow-mm-row')];
  rows.find((r) => r.innerText.includes(l))?.click();
}, label);
await nav;
console.log('  ... launch reloaded the page');
await page.waitForFunction('window.__READY__ === true && !!window.__ENGINE__', null, { timeout: 900_000, polling: 500 });
const url = page.url();
t.check(!/[?&](mission|map|mode)=/.test(url), `reload carried no session query string (${url})`);
const deploy = await t.eval(() => ({
  map: window.__ENGINE__.ctx.peek('world').mapId,
  card: document.querySelector('.ow-mm-card')?.innerText ?? '',
  row: !!document.querySelector('.ow-mm-row.deploy'),
}));
t.check(deploy.row && /SPECIAL OPERATION/.test(deploy.card), `deploy card up on map '${deploy.map}'`);
await t.eval(() => document.querySelector('.ow-mm-row.deploy').click());
await t.until(`window.FLOP?.mission?.state?.started === true && FLOP.mission.state.mission === '${want}'`, `${want} deployed from the card`, 300);
const kit = await t.eval(() => window.__ENGINE__.ctx.peek('weapons')?.loadout?.primary ?? null);
const issued = ms.find((m) => m.id === want)?.loadout?.primary;
t.check(kit === issued, `issued kit equipped (${kit})`);
process.exit((await t.close()) ? 0 : 1);
