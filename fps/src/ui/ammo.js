import { el, svg, setText, setStyle, setClass, clamp01, damp, ease } from './util.js';

const MAX_PIPS = 30;

/** Tracking / size steps the weapon name falls back through when it overflows. */
const NAME_FIT = [
  ['.22em', 'calc(12.5px * var(--k))'],
  ['.14em', 'calc(12.5px * var(--k))'],
  ['.1em', 'calc(11px * var(--k))'],
  ['.06em', 'calc(9.5px * var(--k))'],
];

function fragIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('path', { d: 'M6.4 0h3.2v2.1h1.5l1.1 2H3.8l1.1-2h1.5z' }, s);
  svg(
    'path',
    {
      d:
        'M8 4.6c3.1 0 5.6 2.9 5.6 7.1S11.1 20 8 20 2.4 15.9 2.4 11.7 4.9 4.6 8 4.6z',
    },
    s
  );
  const g = svg('g', { stroke: 'rgba(0,0,0,.5)', 'stroke-width': 0.9 }, s);
  for (const y of [9.5, 13, 16.2]) svg('line', { x1: 3, y1: y, x2: 13, y2: y }, g);
  svg('line', { x1: 8, y1: 5, x2: 8, y2: 19.6 }, g);
  return s;
}

function flashIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('path', { d: 'M6.2 0h3.6v2.4H6.2z' }, s);
  svg('path', { d: 'M4.2 3.1h7.6c.5 0 .9.4.9.9v13.4c0 1.4-1.1 2.6-2.6 2.6H5.9c-1.4 0-2.6-1.2-2.6-2.6V4c0-.5.4-.9.9-.9z' }, s);
  svg('rect', { x: 4.6, y: 6.2, width: 6.8, height: 1.2, fill: 'rgba(0,0,0,.45)' }, s);
  svg('rect', { x: 4.6, y: 9.1, width: 6.8, height: 1.2, fill: 'rgba(0,0,0,.45)' }, s);
  return s;
}

/* EXPANSION §10.4: one icon per throwable kind, same 16 x 20 cell. */
function semtexIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('rect', { x: 2, y: 7, width: 12, height: 11, rx: 1.6 }, s);
  svg('rect', { x: 4.5, y: 3.6, width: 7, height: 3.6, rx: 0.8 }, s);
  svg('circle', { cx: 9.6, cy: 5.4, r: 1, fill: 'rgba(0,0,0,.55)' }, s);
  const g = svg('g', { stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1 }, s);
  svg('line', { x1: 2, y1: 10.5, x2: 14, y2: 10.5 }, g);
  svg('line', { x1: 2, y1: 14.5, x2: 14, y2: 14.5 }, g);
  return s;
}

function molotovIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('path', { d: 'M6.6 5h2.8v3.2c2.2.8 3.4 2.3 3.4 4.6V18c0 1.1-.9 2-2 2H5.2c-1.1 0-2-.9-2-2v-5.2c0-2.3 1.2-3.8 3.4-4.6z' }, s);
  svg('path', { d: 'M7 0.6c1.6 1 2.8 2.2 2.2 4.4H6.6C6 3.4 6.2 1.8 7 .6z' }, s);
  svg('rect', { x: 3.2, y: 12.6, width: 9.6, height: 3, fill: 'rgba(0,0,0,.4)' }, s);
  return s;
}

function throwingKnifeIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('path', { d: 'M8 0l2.4 6.4v5.2H5.6V6.4z' }, s);
  svg('rect', { x: 6.1, y: 11.6, width: 3.8, height: 8, rx: 0.9 }, s);
  svg('circle', { cx: 8, cy: 14.4, r: 0.9, fill: 'rgba(0,0,0,.6)' }, s);
  svg('circle', { cx: 8, cy: 17.2, r: 0.9, fill: 'rgba(0,0,0,.6)' }, s);
  return s;
}

function smokeIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('rect', { x: 4.4, y: 8, width: 7.2, height: 12, rx: 1 }, s);
  svg('rect', { x: 6.4, y: 6, width: 3.2, height: 2.2 }, s);
  svg('circle', { cx: 5, cy: 3.4, r: 2.4, fill: 'rgba(255,255,255,.55)' }, s);
  svg('circle', { cx: 9.4, cy: 2.6, r: 2.6, fill: 'rgba(255,255,255,.55)' }, s);
  svg('rect', { x: 4.4, y: 10, width: 7.2, height: 1.6, fill: 'rgba(0,0,0,.45)' }, s);
  return s;
}

function concussionIcon(parent) {
  const s = svg('svg', { viewBox: '0 0 16 20', fill: 'rgba(255,255,255,.92)' }, parent);
  svg('rect', { x: 3.6, y: 6.4, width: 8.8, height: 13.6, rx: 1.4 }, s);
  svg('rect', { x: 6.2, y: 3.4, width: 3.6, height: 3.2 }, s);
  const g = svg('g', { stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1.1, fill: 'none' }, s);
  svg('circle', { cx: 8, cy: 13.2, r: 2.6 }, g);
  svg('line', { x1: 3.6, y1: 9, x2: 12.4, y2: 9 }, g);
  return s;
}

const EQUIP_ICONS = {
  frag: fragIcon,
  semtex: semtexIcon,
  molotov: molotovIcon,
  throwing_knife: throwingKnifeIcon,
  flash: flashIcon,
  smoke: smokeIcon,
  concussion: concussionIcon,
};

/**
 * Ammo / weapon readout, bottom right.
 *
 *              ▲ 2   ✦ 1     equipment — its OWN row
 *   [AUTO]        ASSAULT RIFLE
 *              28 / 210
 *   ▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯        magazine state, one pip per round
 *
 * Layout contract: the panel is a single column of fixed width pinned to the
 * right margin (`--ammo-w` in style.js) and every row is an explicit grid with
 * an 8 px gutter, so all rows share one left edge and no run can grow sideways
 * into another. The equipment counts used to be an absolutely positioned strip
 * that happened to land on the head row and collided with it.
 *
 * Deliberately understated: three ink levels, no boxes, no icons bigger than
 * the type. The only colour is the low-ammo amber and the empty-mag red.
 */
export class AmmoPanel {
  constructor(parent) {
    this.root = el('div', 'ow-ammo', parent);

    this.equip = el('div', 'ow-equip', this.root);
    // Every kind's icon is built once; the slot shows the one it holds.
    this.slotL = el('div', 'ow-slot', this.equip);
    this.iconsL = {};
    for (const k of ['frag', 'semtex', 'molotov', 'throwing_knife']) {
      this.iconsL[k] = EQUIP_ICONS[k](this.slotL);
      setStyle(this.iconsL[k], 'display', k === 'frag' ? '' : 'none');
    }
    this.slotLn = el('span', null, this.slotL, '0');
    this.slotT = el('div', 'ow-slot', this.equip);
    this.iconsT = {};
    for (const k of ['flash', 'smoke', 'concussion']) {
      this.iconsT[k] = EQUIP_ICONS[k](this.slotT);
      setStyle(this.iconsT[k], 'display', k === 'flash' ? '' : 'none');
    }
    this.slotTn = el('span', null, this.slotT, '0');
    this._kindL = 'frag';
    this._kindT = 'flash';

    const head = el('div', 'ow-ammo-head', this.root);
    this.mode = el('div', 'ow-ammo-mode', head, 'AUTO');
    this.name = el('div', 'ow-ammo-name', head, 'ASSAULT RIFLE');

    const row = el('div', 'ow-ammo-row', this.root);
    this.cur = el('div', 'ow-ammo-cur', row, '30');
    this.sep = el('div', 'ow-ammo-sep', row, '/');
    this.res = el('div', 'ow-ammo-res', row, '210');

    this.mag = el('div', 'ow-mag', this.root);
    this.pips = new Array(MAX_PIPS);
    for (let i = 0; i < MAX_PIPS; i++) this.pips[i] = el('b', null, this.mag);

    this.reload = el('div', 'ow-reload', this.root, 'RELOADING');
    const bar = el('div', 'ow-reload-bar', this.root);
    this.reloadFill = el('i', null, bar);
    this.reloadBar = bar;

    this.punch = 0;
    this._lastAmmo = -1;
    this._lastPips = -1;
    this._lastCount = -1;
    this._lastName = null;
    this._nameFit = 0;
    setStyle(this.reload, 'display', 'none');
    setStyle(this.reloadBar, 'display', 'none');
  }

  /**
   * @param {object} s { name, mode, ammo, reserve, magSize, reloading,
   *                     reloadProgress, lethal, lethalCount, tacticalCount }
   */
  update(dt, s) {
    const ammo = Math.max(0, s.ammo | 0);
    const magSize = Math.max(1, s.magSize | 0 || 30);

    if (this._lastAmmo !== ammo) {
      if (this._lastAmmo >= 0 && ammo < this._lastAmmo) this.punch = 1;
      this._lastAmmo = ammo;
      setText(this.cur, ammo);
    }
    setText(this.res, Math.max(0, s.reserve | 0));
    this._fitName(String(s.weaponName ?? s.name ?? 'ASSAULT RIFLE'));
    setText(this.mode, s.fireMode ?? 'AUTO');

    this.punch = Math.max(0, this.punch - dt * 6.5);
    const p = 1 - 0.075 * ease.outQuad(this.punch);
    setStyle(this.cur, 'transform', `scale(${p.toFixed(3)})`);

    const frac = ammo / magSize;
    setClass(this.root, 'ow-ammo-low', ammo > 0 && frac <= 0.34);
    setClass(this.root, 'ow-ammo-empty', ammo === 0);

    const reloading = !!s.reloading;
    const reloadP = clamp01(s.reloadProgress ?? 0);

    // --- magazine pips ----------------------------------------------------
    // The strip shows the state of the magazine that is *in the gun*. During a
    // reload that is not the pre-reload count: the old mag leaves (strip
    // empties) and the fresh one seats (strip fills to what the gun will
    // actually hold). Drawing a nearly full strip next to RELOADING and a
    // progress bar is a straight contradiction.
    const pipCount = Math.min(MAX_PIPS, magSize);
    if (pipCount !== this._lastPips) {
      this._lastPips = pipCount;
      for (let i = 0; i < MAX_PIPS; i++)
        setStyle(this.pips[i], 'display', i < pipCount ? '' : 'none');
    }
    let pipAmmo = ammo;
    if (reloading) {
      const after = Math.min(magSize, ammo + Math.max(0, s.reserve | 0));
      pipAmmo =
        reloadP < 0.45
          ? ammo * (1 - reloadP / 0.45) // mag out
          : after * ((reloadP - 0.45) / 0.55); // mag in
    }
    const filled =
      pipAmmo <= 0.001
        ? 0
        : Math.max(1, Math.round((pipAmmo / magSize) * pipCount));
    if (filled !== this._lastCount) {
      this._lastCount = filled;
      for (let i = 0; i < pipCount; i++) {
        const on = i < filled;
        setClass(this.pips[i], 'off', !on);
        setClass(this.pips[i], 'warn', on && !reloading && filled / pipCount <= 0.34);
      }
    }

    // --- reload state -----------------------------------------------------
    setStyle(this.reload, 'display', reloading || (ammo === 0 && !reloading) ? '' : 'none');
    setText(this.reload, reloading ? 'RELOADING' : 'PRESS R TO RELOAD');
    if (!reloading && ammo === 0) {
      // pulse the prompt so an empty gun is impossible to miss
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin((s.time ?? 0) * 3.8));
      setStyle(this.reload, 'opacity', pulse.toFixed(3));
    } else {
      setStyle(this.reload, 'opacity', '1');
    }
    setStyle(this.reloadBar, 'display', reloading ? '' : 'none');
    if (reloading) setStyle(this.reloadFill, 'transform', `scaleX(${reloadP.toFixed(3)})`);

    // --- equipment --------------------------------------------------------
    // No equipment system (counts null) → no equipment row, never a made-up number.
    const hasEq = s.lethalCount != null || s.tacticalCount != null;
    setStyle(this.equip, 'display', hasEq ? '' : 'none');
    const lc = s.lethalCount ?? 0;
    const tc = s.tacticalCount ?? 0;
    setText(this.slotLn, lc);
    setText(this.slotTn, tc);
    const kl = this.iconsL[s.lethal] ? s.lethal : 'frag';
    if (kl !== this._kindL) {
      setStyle(this.iconsL[this._kindL], 'display', 'none');
      setStyle(this.iconsL[kl], 'display', '');
      this._kindL = kl;
    }
    const kt = this.iconsT[s.tactical] ? s.tactical : 'flash';
    if (kt !== this._kindT) {
      setStyle(this.iconsT[this._kindT], 'display', 'none');
      setStyle(this.iconsT[kt], 'display', '');
      this._kindT = kt;
    }
    setClass(this.slotL, 'empty', lc <= 0);
    setClass(this.slotT, 'empty', tc <= 0);
  }

  /**
   * Measure the weapon-name glyph run against the column it has to live in and
   * step tracking, then size, down until it fits. A long name is the only run
   * in the block that can push its row out of the grid, and it changes on a
   * weapon swap, so it is measured exactly once per name.
   */
  _fitName(name) {
    if (this._lastName === name) return;
    this._lastName = name;
    setText(this.name, name);
    for (let i = 0; i < NAME_FIT.length; i++) {
      setStyle(this.name, 'letter-spacing', NAME_FIT[i][0]);
      setStyle(this.name, 'font-size', NAME_FIT[i][1]);
      if (this.name.scrollWidth <= this.name.clientWidth + 1) break;
    }
  }

  dispose() {
    this.root.remove();
  }
}
