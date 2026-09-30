import { el, svg, setText, setStyle, setClass, damp, ease } from './util.js';

/**
 * ===========================================================================
 * Front-end screens: the TITLE (mission card + ESF loadout select), the
 * DOUG IS DOWN beat, and the AFTER-ACTION REPORT.
 * ===========================================================================
 *
 * DOM overlays over the HUD chrome. Each fades via a damped `update(rawDt)`
 * driven from the HUD's lateUpdate on UNSCALED time, so they still animate
 * while the game clock is slowed or frozen; nothing uses a CSS transition on a
 * number, which keeps capture frames deterministic.
 *
 * They talk to the rest of the game only through callbacks handed in by the UI
 * system, which turns them into `ui:startRun` / `ui:continue` / `ui:accept` /
 * `ui:restart` / `ui:attract`. The screens never import another subsystem.
 *
 * Tone: the presentation is completely straight. The jokes are in the copy.
 */

/**
 * ESF loadouts. Ids are what `ui:startRun {job}` carries to src/game, which
 * maps them to a weapon and an armour multiplier. `stats` are 0..1 bars for the
 * card, relative to each other, not to any real number.
 */
export const LOADOUTS = [
  {
    id: 'alpha',
    weapon: 'rifle',
    idx: '01',
    code: 'ALPHA',
    name: 'STANDARD ISSUE',
    kit: 'ASSAULT RIFLE',
    desc: "Accurate at range. Command's first choice, and also its second.",
    stats: { RANGE: 0.82, 'RATE OF FIRE': 0.62, PROTECTION: 0.5 },
  },
  {
    id: 'bravo',
    weapon: 'smg',
    idx: '02',
    code: 'BRAVO',
    name: 'ROOM SERVICE',
    kit: 'SUBMACHINE GUN',
    desc: 'High rate of fire. Recommended for rooms, corridors and disagreements.',
    stats: { RANGE: 0.4, 'RATE OF FIRE': 0.94, PROTECTION: 0.5 },
  },
  {
    id: 'charlie',
    weapon: 'pistol',
    idx: '03',
    code: 'CHARLIE',
    name: 'CONTINGENCY',
    kit: 'SIDEARM · DOUBLE PLATING',
    desc: 'One pistol, twice the armour. Command calls it a contingency. Doug calls it a pistol.',
    stats: { RANGE: 0.46, 'RATE OF FIRE': 0.34, PROTECTION: 1 },
  },
  {
    id: 'delta',
    weapon: 'sniper',
    idx: '04',
    code: 'DELTA',
    name: 'LONG WEEKEND',
    kit: 'BOLT SNIPER · SIDEARM',
    desc: 'One shot, one kill, one very long reload. Shift holds your breath. Doug holds his anyway.',
    stats: { RANGE: 1, 'RATE OF FIRE': 0.1, PROTECTION: 0.5 },
  },
  {
    id: 'echo',
    weapon: 'shotgun',
    idx: '05',
    code: 'ECHO',
    name: 'DOOR POLICY',
    kit: 'PUMP SHOTGUN · SIDEARM',
    desc: 'Nine pellets of conflict resolution. Loads a shell at a time; firing cancels the reload.',
    stats: { RANGE: 0.2, 'RATE OF FIRE': 0.25, PROTECTION: 0.6 },
  },
  {
    id: 'foxtrot',
    weapon: 'lmg',
    idx: '06',
    code: 'FOXTROT',
    name: 'ENTHUSIASM',
    kit: 'LIGHT MACHINE GUN · SIDEARM',
    desc: 'A hundred rounds and no plan. Slow to aim, slow to move, slow to reload. Fast everywhere else.',
    stats: { RANGE: 0.7, 'RATE OF FIRE': 0.78, PROTECTION: 0.6 },
  },
  {
    id: 'golf',
    weapon: 'carbine_sd',
    idx: '07',
    code: 'GOLF',
    name: 'QUIET PART',
    kit: 'SUPPRESSED CARBINE · MACHINE PISTOL',
    desc: 'Suppressed. Bots hear it at a quarter of the range. Doug still narrates everything out loud.',
    stats: { RANGE: 0.66, 'RATE OF FIRE': 0.7, PROTECTION: 0.5 },
  },
  {
    id: 'hotel',
    weapon: 'marksman',
    idx: '08',
    code: 'HOTEL',
    name: 'SECOND OPINION',
    kit: 'MARKSMAN RIFLE · SIDEARM',
    desc: 'Semi-auto, 4x scope. For when the first opinion needed to be louder and further away.',
    stats: { RANGE: 0.9, 'RATE OF FIRE': 0.4, PROTECTION: 0.5 },
  },
  {
    id: 'india',
    weapon: 'carbine',
    idx: '09',
    code: 'INDIA',
    name: 'PROPORTIONAL RESPONSE',
    kit: 'CARBINE · ROCKET LAUNCHER',
    desc: 'Carbine for problems. Rocket for bigger problems. Arms at 6 m, so do not rocket your own shoes.',
    stats: { RANGE: 0.74, 'RATE OF FIRE': 0.68, PROTECTION: 0.5 },
  },
];

/** The town's mission card: the fallback when no map registry is published. */
const TOWN_MISSION = [
  ['LOCATION', 'Border town. The square in the middle of it.'],
  ['OBJECTIVE', 'Hold the town square for as long as it takes.'],
  ['DURATION', 'About a wave. (Command estimate.)'],
  ['PLAN', 'Phase one: hold the square. Phase two: Doug.'],
  ['ASSETS', 'Doug.'],
];

/**
 * The map registry, as main.js publishes it on `window.__FLOP_MAPS__`
 * (`{ active, list, select(id) }`, see src/world/maps/index.js). The screens
 * never import the world; without a registry they fall back to the town.
 */
function mapRegistry() {
  const r = globalThis.__FLOP_MAPS__;
  if (r && Array.isArray(r.list) && r.list.length) return r;
  return {
    active: 'town',
    list: [
      {
        id: 'town',
        idx: '01',
        name: 'BORDER TOWN',
        subtitle: 'Border town · the square',
        operation: 'OPERATION TOTAL CONFIDENCE',
        heldNoun: 'The square',
        mission: TOWN_MISSION,
      },
    ],
    select: () => false,
  };
}

/** The active map's registry entry. */
export function activeMap() {
  const r = mapRegistry();
  return r.list.find((m) => m.id === r.active) ?? r.list[0];
}

/** A small top-down plan of a map, from its registry preview rects. */
function mapPreview(parent, m) {
  const pv = m.preview;
  const s = svg('svg', { class: 'ow-mp-plan', viewBox: pv ? pv.box.join(' ') : '0 0 1 1', preserveAspectRatio: 'xMidYMid meet' }, parent);
  if (!pv) return s;
  const fill = { apron: 'rgba(255,255,255,.05)', floor: 'rgba(214,220,226,.34)', block: 'rgba(214,220,226,.16)', plane: 'rgba(236,240,244,.62)', objective: 'currentColor' };
  for (const [x, z, w, d, kind] of pv.rects) {
    const a = { x, y: z, width: w, height: d, fill: fill[kind] ?? fill.block };
    if (kind === 'objective') a.class = 'obj';
    svg('rect', a, s);
  }
  return s;
}

/* Shared damped-fade backbone for a pointer-events overlay. */
function fade(node, shown, open) {
  if (shown < 0.004) {
    setStyle(node, 'display', 'none');
    setStyle(node, 'pointer-events', 'none');
    return;
  }
  setStyle(node, 'display', '');
  setStyle(node, 'pointer-events', open ? 'auto' : 'none');
  setStyle(node, 'opacity', ease.outQuad(shown).toFixed(3));
}

/**
 * Keep a click on a screen from reaching src/core/input, which grabs pointer
 * lock on any left mousedown that bubbles to window. Screens that deploy the
 * player request the lock themselves, inside the click gesture.
 */
function guard(node) {
  node.addEventListener('mousedown', (e) => e.stopPropagation());
}

/** The ESF mark: a plain chevron-over-bar in a square. Not a parody of anything. */
function crest(parent) {
  const s = svg('svg', { viewBox: '0 0 24 24', class: 'ow-crest' }, parent);
  svg('rect', { x: 1, y: 1, width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, s);
  svg('path', { d: 'M6 13.5 12 8l6 5.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linejoin': 'miter' }, s);
  svg('rect', { x: 6, y: 16, width: 12, height: 2.2, fill: 'currentColor' }, s);
  return s;
}

const fmt = (n) => Math.max(0, Math.round(n || 0)).toLocaleString('en-US');

/* ---------------------------------------------------------------- title --- */

export class AttractScreen {
  /** @param {(loadoutId:string)=>void} onSelect */
  constructor(parent, onSelect) {
    this.onSelect = onSelect;
    this.root = el('div', 'ow-attract', parent);
    guard(this.root);

    // ---- top bar -----------------------------------------------------------
    const top = el('div', 'ow-att-top', this.root);
    const unit = el('div', 'ow-att-unit', top);
    crest(unit);
    el('span', null, unit, 'EXTRA SPECIAL FORCES');
    el('div', 'ow-att-net', top, 'SECURE NET · COMMAND');

    // ---- left column: wordmark + mission card ------------------------------
    const left = el('div', 'ow-att-left', this.root);
    el('div', 'ow-att-title', left, 'FLOP OPS');
    el('div', 'ow-att-rule', left);

    const ms = el('div', 'ow-mission', left);
    const mh = el('div', 'ow-ms-head', ms);
    const map = activeMap();
    el('span', 'ow-ms-tag', mh, `MISSION ${map.idx ?? '01'}`);
    el('span', 'ow-ms-sep', mh);
    el('span', 'ow-ms-tag dim', mh, 'BRIEFING');
    el('div', 'ow-ms-name', ms, map.operation);
    const grid = el('div', 'ow-ms-grid', ms);
    for (const [k, v] of map.mission ?? TOWN_MISSION) {
      el('div', 'k', grid, k);
      el('div', 'v', grid, v);
    }

    /** Empty slot under the mission card, reserved for a map / mission picker. */
    this.slot = el('div', 'ow-att-slot', left);
    // ---- map select --------------------------------------------------------
    // One card per registry map. Picking a different one saves the choice and
    // reloads onto it (a map is a whole level build); the active card is lit.
    const reg = mapRegistry();
    this.maps = reg;
    const mp = el('div', 'ow-att-maps', this.root);
    const mph = el('div', 'ow-lo-head', mp);
    el('span', null, mph, 'MAP');
    el('span', 'ow-lo-hint', mph, reg.list.length > 1 ? 'M OR ↑ ↓ TO CHANGE' : '');
    this.mapCards = [];
    reg.list.forEach((m) => {
      const card = el('div', 'ow-mp-card', mp);
      setClass(card, 'on', m.id === reg.active);
      mapPreview(card, m);
      const tx = el('div', 'ow-mp-text', card);
      const t = el('div', 'ow-lo-top', tx);
      el('span', 'ow-lo-idx', t, m.idx ?? '');
      el('span', 'ow-lo-code', t, m.id === reg.active ? 'SELECTED' : 'AVAILABLE');
      el('div', 'ow-mp-name', tx, m.name);
      el('div', 'ow-lo-kit', tx, m.operation);
      el('div', 'ow-mp-sub', tx, m.subtitle ?? '');
      card.addEventListener('click', () => this._pickMap(m.id));
      this.mapCards.push(card);
    });
    // If the title layout reserves a slot for the picker (an element with the
    // class `ow-att-mapslot`, e.g. under the mission card), dock it there and
    // let the slot own the position instead of the top-right default.
    const slot = this.slot ?? this.root.querySelector('.ow-att-slot, .ow-att-mapslot');
    if (slot) {
      slot.appendChild(mp);
      setClass(mp, 'docked', true);
    }

    // ---- loadout select ----------------------------------------------------
    const lo = el('div', 'ow-att-loadouts', this.root);
    const lh = el('div', 'ow-lo-head', lo);
    el('span', null, lh, 'SELECT LOADOUT');
    el('span', 'ow-lo-hint', lh, `CLICK OR PRESS 1 – ${Math.min(9, LOADOUTS.length)} TO DEPLOY`);
    // More than three kits: compact cards, with the focused kit's brief and
    // stats in one detail strip under the grid.
    const compact = LOADOUTS.length > 3;
    setClass(lo, 'compact', compact);
    const cards = el('div', 'ow-lo-cards', lo);
    this.cards = [];
    this.kitEls = [];
    LOADOUTS.forEach((L, i) => {
      const card = el('div', 'ow-lo-card', cards);
      const t = el('div', 'ow-lo-top', card);
      el('span', 'ow-lo-idx', t, L.idx);
      el('span', 'ow-lo-code', t, L.code);
      const tick = el('div', 'ow-lo-tick', card);
      const ts = svg('svg', { viewBox: '0 0 20 20' }, tick);
      svg('rect', { x: 0.75, y: 0.75, width: 18.5, height: 18.5, fill: 'none', stroke: '#E9B64A', 'stroke-width': 1.5 }, ts);
      svg('path', { d: 'M5 10.4 8.4 13.6 15 6.6', fill: 'none', stroke: '#E9B64A', 'stroke-width': 2 }, ts);
      el('div', 'ow-lo-name', card, L.name);
      this.kitEls.push(el('div', 'ow-lo-kit', card, L.kit));
      el('div', 'ow-lo-desc', card, L.desc);
      const st = el('div', 'ow-lo-stats', card);
      for (const key in L.stats) {
        const r = el('div', 'ow-lo-stat', st);
        el('span', null, r, key);
        const bar = el('i', null, r);
        const fill = el('b', null, bar);
        fill.style.transform = `scaleX(${L.stats[key].toFixed(3)})`;
        el('em', null, r, String(Math.round(L.stats[key] * 100)));
      }
      el('div', 'ow-lo-cta', card, 'DEPLOY');
      card.addEventListener('mouseenter', () => this._focus(i));
      card.addEventListener('click', () => this._deploy(i));
      this.cards.push(card);
    });
    if (compact) {
      const d = el('div', 'ow-lo-detail', lo);
      this.detailDesc = el('div', 'ow-lo-desc', d, '');
      const st = el('div', 'ow-lo-stats', d);
      this.detailStats = Object.keys(LOADOUTS[0].stats).map((key) => {
        const r = el('div', 'ow-lo-stat', st);
        el('span', null, r, key);
        const bar = el('i', null, r);
        return { key, fill: el('b', null, bar), num: el('em', null, r, '') };
      });
    }

    // ---- footer ------------------------------------------------------------
    const foot = el('div', 'ow-att-foot', this.root);
    this.best = el('div', 'ow-att-best', foot, '');
    el('div', 'ow-att-build', foot, 'FLOP OPS · ESF INTERNAL BUILD');

    this.focus = 0;
    this._focus(0);

    this._onKey = (e) => {
      if (!this.open || e.repeat) return;
      if (/^Digit[1-9]$/.test(e.code)) {
        this._deploy(e.code.charCodeAt(5) - 49);
      } else if (e.code === 'ArrowRight') {
        this._focus((this.focus + 1) % this.cards.length);
      } else if (e.code === 'ArrowLeft') {
        this._focus((this.focus + this.cards.length - 1) % this.cards.length);
      } else if (e.code === 'Enter') {
        this._deploy(this.focus);
      } else if (e.code === 'KeyM' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        this._stepMap(e.code === 'ArrowUp' ? -1 : 1);
      }
    };
    addEventListener('keydown', this._onKey);

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  _focus(i) {
    this.focus = i;
    for (let j = 0; j < this.cards.length; j++) setClass(this.cards[j], 'on', j === i);
    const L = LOADOUTS[i];
    if (this.detailDesc && L) {
      setText(this.detailDesc, L.desc);
      for (const s of this.detailStats) {
        const v = L.stats[s.key] ?? 0;
        s.fill.style.transform = `scaleX(${v.toFixed(3)})`;
        setText(s.num, String(Math.round(v * 100)));
      }
    }
  }

  _stepMap(dir) {
    const list = this.maps.list;
    if (list.length < 2) return;
    let i = list.findIndex((m) => m.id === this.maps.active);
    i = (i + dir + list.length) % list.length;
    this._pickMap(list[i].id);
  }

  /** Save the choice and reload onto the map. No-op for the active one. */
  _pickMap(id) {
    if (!this.open || id === this.maps.active) return;
    for (let j = 0; j < this.mapCards.length; j++) setClass(this.mapCards[j], 'on', this.maps.list[j].id === id);
    this.maps.select?.(id);
  }

  _deploy(i) {
    if (!this.open || !LOADOUTS[i]) return;
    this._focus(i);
    this.onSelect?.(LOADOUTS[i].id);
  }

  /**
   * Weapon designations from src/weapons (`loadoutInfo()` → def.displayName),
   * so the card reads `HARRIER 556 · ASSAULT RIFLE` from the same source as
   * the HUD. @param {Array<{id:string, displayName:string}>|null} info
   */
  setWeaponNames(info) {
    if (!Array.isArray(info)) return;
    LOADOUTS.forEach((L, i) => {
      const w = info.find((x) => x.id === L.weapon);
      if (!w?.displayName) return;
      // Drop a leading class word the designation already says (P19 SIDEARM · SIDEARM …).
      const first = L.kit.split(' · ')[0];
      const kit = w.displayName.includes(first) ? L.kit.split(' · ').slice(1).join(' · ') : L.kit;
      setText(this.kitEls[i], kit ? `${w.displayName} · ${kit}` : w.displayName);
    });
  }

  /** Local best, shown bottom-left. @param {{score:number, wave:number}|null} b */
  setBest(b) {
    if (!b || !(b.score > 0)) {
      setText(this.best, 'NO PREVIOUS OPERATIONS ON FILE');
      return;
    }
    setText(this.best, `PERSONAL BEST  ${fmt(b.score)}  ·  WAVE ${Math.max(1, b.wave | 0)}`);
  }

  show(instant = false) {
    this.open = true;
    if (instant) this.shown = 1;
    setStyle(this.root, 'display', '');
  }

  hide() {
    this.open = false;
  }

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 13, rawDt);
    fade(this.root, this.shown, this.open);
  }

  dispose() {
    removeEventListener('keydown', this._onKey);
    this.root.remove();
  }
}

/* ---------------------------------------------------------------- death --- */

const DOWN_BODY = {
  canContinue:
    'Command has been notified. Command has approved one (1) additional chance, pending paperwork.',
  final: 'Command has been notified. Command is out of additional chances. Command had one.',
};

export class DeathScreen {
  /** @param {{onContinue:()=>void, onAccept:()=>void}} cbs */
  constructor(parent, { onContinue, onAccept }) {
    this.onContinue = onContinue;
    this.onAccept = onAccept;
    this.root = el('div', 'ow-screen death', parent);
    guard(this.root);
    const band = el('div', 'ow-death', this.root);

    el('div', 'ow-sc-kicker', band, activeMap().operation);
    el('div', 'ow-sc-title', band, 'DOUG IS DOWN');
    this.killer = el('div', 'ow-death-killer', band, '');
    this.body = el('div', 'ow-sc-body', band, DOWN_BODY.canContinue);

    const actions = el('div', 'ow-sc-actions', band);
    this.contBtn = el('button', 'ow-btn primary', actions, 'REQUEST ONE (1) MORE CHANCE');
    this.contBtn.type = 'button';
    this.contBtn.addEventListener('click', () => {
      if (this._settled) return;
      this._settled = true;
      this.onContinue?.();
    });
    this.acceptBtn = el('button', 'ow-sc-ghost', actions, 'ACCEPT THE OUTCOME');
    this.acceptBtn.type = 'button';
    this.acceptBtn.addEventListener('click', () => {
      if (this._settled) return;
      this._settled = true;
      // Emits ui:accept; the report arrives with game:over.
      setStyle(this.acceptBtn, 'opacity', '.4');
      setStyle(this.contBtn, 'opacity', '.4');
      setText(this.acceptBtn, 'FILING REPORT…');
      this.onAccept?.();
    });

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /** @param {{canContinue?:boolean, killer?:string|null}} opts */
  show({ canContinue = true, killer = null } = {}) {
    this.open = true;
    this._settled = false;
    setStyle(this.contBtn, 'display', canContinue ? '' : 'none');
    setStyle(this.contBtn, 'opacity', '1');
    setStyle(this.acceptBtn, 'opacity', '1');
    setText(this.acceptBtn, canContinue ? 'ACCEPT THE OUTCOME' : 'FILE THE REPORT');
    setText(this.body, canContinue ? DOWN_BODY.canContinue : DOWN_BODY.final);
    if (killer) {
      setText(this.killer, 'KILLED BY  ' + killer);
      setStyle(this.killer, 'display', '');
    } else if (killer === null) {
      setStyle(this.killer, 'display', 'none');
    }
    setStyle(this.root, 'display', '');
  }

  hide() {
    this.open = false;
  }

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 15, rawDt);
    fade(this.root, this.shown, this.open);
  }

  dispose() {
    this.root.remove();
  }
}

/* -------------------------------------------------------- after-action --- */

/**
 * Command's assessment. Deterministic from the run's numbers, so the same run
 * always reads the same report.
 */
export function assessment(d = {}) {
  const wave = Math.max(1, Math.round(d.wave ?? 1));
  const held = wave - 1;
  const lines = [];
  const noun = activeMap().heldNoun ?? 'The square';

  if (held <= 0) {
    lines.push(
      `${noun} was held for less than one wave against an estimate of about one wave. Command considers the estimate broadly accurate.`
    );
  } else if (held === 1) {
    lines.push(`${noun} was held for one wave, exactly as estimated. Command would like that noted.`);
  } else if (held <= 3) {
    lines.push(`${noun} was held for ${held} waves against an estimate of about one. Command considers this within tolerance.`);
  } else {
    lines.push(`${noun} was held for ${held} waves. Command's estimate was "about a wave". Command is not taking questions.`);
  }

  let acc = d.accuracy;
  if (acc === null || acc === undefined) {
    lines.push('No rounds were fired. Command admires the restraint.');
  } else {
    if (acc <= 1) acc *= 100;
    const a = Math.round(acc);
    if (a < 20) lines.push(`Accuracy was ${a}%. The remaining rounds are being treated as a message.`);
    else if (a < 45) lines.push(`Accuracy was ${a}%. Ammunition expenditure is within ESF norms, which are generous.`);
    else lines.push(`Accuracy was ${a}%. Command has asked Doug to stop making everyone else look bad.`);
  }

  lines.push(
    d.continued
      ? 'One (1) additional chance was requested and used. It has been filed under "chances".'
      : 'No additional chances were requested. Command is unsure whether to be proud.'
  );
  return lines;
}

export class GameOverScreen {
  /**
   * @param {HTMLElement} parent
   * @param {{onRestart:()=>void, onReturn:()=>void}} cbs
   */
  constructor(parent, cbs = {}) {
    const { onRestart, onReturn } = cbs;
    this.root = el('div', 'ow-screen report', parent);
    guard(this.root);
    const card = el('div', 'ow-report', this.root);

    const head = el('div', 'ow-rp-head', card);
    el('span', 'ow-rp-kicker', head, 'AFTER-ACTION REPORT');
    el('span', 'ow-rp-op', head, activeMap().operation);

    this.title = el('div', 'ow-sc-title', card, 'OPERATION CONCLUDED');

    const sc = el('div', 'ow-rp-score', card);
    this.score = el('div', 'ow-sc-score', sc, '0');
    el('div', 'ow-rp-unit', sc, 'POINTS');
    this.delta = el('div', 'ow-sc-delta', card, '');

    const stats = el('div', 'ow-sc-stats', card);
    this.stat = {};
    for (const [key, label] of [
      ['WAVE', 'WAVE REACHED'],
      ['KILLS', 'HOSTILES NEUTRALISED'],
      ['ACCURACY', 'ACCURACY'],
      ['BEST', 'PERSONAL BEST'],
    ]) {
      const s = el('div', 'ow-sc-stat', stats);
      el('div', 'k', s, label);
      this.stat[key] = el('div', 'v', s, '—');
    }

    const as = el('div', 'ow-rp-assess', card);
    el('div', 'ow-rp-lbl', as, 'COMMAND ASSESSMENT');
    this.assess = [];
    for (let i = 0; i < 3; i++) this.assess.push(el('p', null, as, ''));

    const actions = el('div', 'ow-sc-actions', card);
    this.restartBtn = el('button', 'ow-btn primary', actions, 'REDEPLOY');
    this.restartBtn.type = 'button';
    this.restartBtn.addEventListener('click', () => onRestart?.());
    this.returnBtn = el('button', 'ow-sc-ghost', actions, 'RETURN TO BASE');
    this.returnBtn.type = 'button';
    this.returnBtn.addEventListener('click', () => onReturn?.());

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /** @param {object} d game:over payload */
  setData(d = {}) {
    const score = Math.max(0, Math.round(d.score ?? 0));
    const best = Math.max(0, Math.round(d.best ?? 0));
    const newBest = !!d.newBest;

    setClass(this.root, 'best', newBest);
    setText(this.title, newBest ? 'NEW PERSONAL BEST' : 'OPERATION CONCLUDED');
    setText(this.score, fmt(score));

    if (newBest) {
      setClass(this.delta, 'miss', false);
      setText(this.delta, 'COMMAND WILL BE TAKING CREDIT FOR THIS');
    } else {
      const gap = Math.max(0, best - score);
      setClass(this.delta, 'miss', gap > 0);
      setText(this.delta, gap > 0 ? `${fmt(gap)} SHORT OF YOUR BEST` : 'MATCHED YOUR PERSONAL BEST');
    }

    let acc = d.accuracy;
    let accTxt = '—';
    if (acc !== null && acc !== undefined) {
      if (acc <= 1) acc *= 100;
      accTxt = Math.round(acc) + '%';
    }
    setText(this.stat.WAVE, Math.max(1, Math.round(d.wave ?? 1)));
    setText(this.stat.KILLS, Math.max(0, Math.round(d.kills ?? 0)));
    setText(this.stat.ACCURACY, accTxt);
    setText(this.stat.BEST, fmt(best));

    const lines = assessment(d);
    for (let i = 0; i < this.assess.length; i++) setText(this.assess[i], lines[i] ?? '');
  }

  show(d) {
    if (d) this.setData(d);
    this.open = true;
    setStyle(this.root, 'display', '');
  }

  hide() {
    this.open = false;
  }

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 15, rawDt);
    fade(this.root, this.shown, this.open);
  }

  dispose() {
    this.root.remove();
  }
}
