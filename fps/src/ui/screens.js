import { el, svg, setText, setStyle, setClass, damp, ease } from './util.js';

/**
 * ===========================================================================
 * Front-end screens: the DOUG IS DOWN beat, the AFTER-ACTION REPORT (survival)
 * and the MATCH REPORT (bot matches and missions). The main menu lives in
 * mainmenu.js and borrows `mapPreview` / `crest` from here.
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
export function mapPreview(parent, m) {
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
export function crest(parent) {
  const s = svg('svg', { viewBox: '0 0 24 24', class: 'ow-crest' }, parent);
  svg('rect', { x: 1, y: 1, width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }, s);
  svg('path', { d: 'M6 13.5 12 8l6 5.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linejoin': 'miter' }, s);
  svg('rect', { x: 6, y: 16, width: 12, height: 2.2, fill: 'currentColor' }, s);
  return s;
}

const fmt = (n) => Math.max(0, Math.round(n || 0)).toLocaleString('en-US');

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

/* ---------------------------------------------------------- match report --- */

function mmssFmt(sec) {
  const t = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Command's read on a bot match. Deterministic from the numbers. */
export function matchAssessment(d = {}) {
  const lines = [];
  const won = d.winner === 'esf';
  const draw = d.winner === 'draw';
  const mode = d.label ?? 'The operation';
  if (d.ffa) {
    if (draw) lines.push(`${mode} ended level. Command has declared everyone the winner, which is to say nobody.`);
    else if (won) lines.push(`${mode} won. Doug finished first out of ${d.of ?? 8}. Command had money on it, retroactively.`);
    else lines.push(`${mode} went to ${d.winnerName ?? 'someone else'}. Doug placed ${d.place ?? '?'} of ${d.of ?? 8}. Command calls that a placement.`);
  } else if (draw) lines.push(`${mode} ended level. Command has declared this a victory for morale.`);
  else if (won) lines.push(`${mode} won ${d.scoreEsf ?? 0} to ${d.scoreHostile ?? 0}. Command is already drafting the press release.`);
  else lines.push(`${mode} lost ${d.scoreEsf ?? 0} to ${d.scoreHostile ?? 0}. Command is calling it a strategic repositioning.`);
  const k = d.kills | 0;
  const de = d.deaths | 0;
  if (k === 0) lines.push('Doug recorded no kills. Command assumes he was doing something important elsewhere.');
  else if (k > de * 2) lines.push(`${k} kills against ${de} deaths. Command has asked Doug to leave some for the others.`);
  else if (k >= de) lines.push(`${k} kills against ${de} deaths. Within ESF norms, which are generous.`);
  else lines.push(`${k} kills against ${de} deaths. Command is treating the deaths as a learning opportunity.`);
  if (d.reason === 'time') lines.push('The clock ran out. Command would like a longer clock.');
  else if (d.mode === 'sd') lines.push(`${d.rounds ?? 0} rounds played. The charge was handled with appropriate respect.`);
  else lines.push('The paperwork will be filed in the order the incidents occurred.');
  return lines;
}

export class MatchOverScreen {
  /** @param {{onRestart:()=>void, onReturn:()=>void}} cbs */
  constructor(parent, cbs = {}) {
    const { onRestart, onReturn } = cbs;
    this.root = el('div', 'ow-screen report match', parent);
    guard(this.root);
    const card = el('div', 'ow-report', this.root);
    const head = el('div', 'ow-rp-head', card);
    this.kicker = el('span', 'ow-rp-kicker', head, 'MATCH REPORT');
    this.op = el('span', 'ow-rp-op', head, '');
    this.title = el('div', 'ow-sc-title', card, 'VICTORY');
    const sc = (this.scoreRow = el('div', 'ow-rp-score ow-mr-score', card));
    this.esf = el('div', 'ow-sc-score esf', sc, '0');
    this.unitE = el('div', 'ow-rp-unit', sc, 'ESF');
    el('div', 'ow-mr-dash', sc, '—');
    this.unitH = el('div', 'ow-rp-unit', sc, 'HOSTILE');
    this.hos = el('div', 'ow-sc-score hos', sc, '0');
    // Missions: the rank instead of a score line (SPECIAL OPERATIONS debrief).
    this.rankRow = el('div', 'ow-rp-score ow-mr-rank', card);
    this.rank = el('div', 'ow-sc-score esf', this.rankRow, '—');
    this.rankLabel = el('div', 'ow-rp-unit', this.rankRow, '');
    setStyle(this.rankRow, 'display', 'none');
    this.delta = el('div', 'ow-sc-delta', card, '');
    // FREE FOR ALL / GUN GAME: the top of the standings
    this.standings = el('div', 'ow-mr-standings', card);
    this.standRows = [];
    for (let i = 0; i < 3; i++) {
      const r = el('div', 'ow-mr-srow', this.standings);
      r._p = el('span', 'p', r, '');
      r._n = el('span', 'n', r, '');
      r._s = el('b', 's', r, '');
      this.standRows.push(r);
    }
    setStyle(this.standings, 'display', 'none');
    const stats = el('div', 'ow-sc-stats', card);
    this.stat = {};
    this.statK = {};
    for (const [key, label] of [
      ['KILLS', 'KILLS'],
      ['DEATHS', 'DEATHS'],
      ['KD', 'K / D'],
      ['ACCURACY', 'ACCURACY'],
    ]) {
      const s = el('div', 'ow-sc-stat', stats);
      this.statK[key] = el('div', 'k', s, label);
      this.stat[key] = el('div', 'v', s, '—');
    }
    const as = el('div', 'ow-rp-assess', card);
    el('div', 'ow-rp-lbl', as, 'COMMAND ASSESSMENT');
    this.assess = [];
    for (let i = 0; i < 3; i++) this.assess.push(el('p', null, as, ''));
    const actions = el('div', 'ow-sc-actions', card);
    this.restartBtn = el('button', 'ow-btn primary', actions, 'REMATCH');
    this.restartBtn.type = 'button';
    this.restartBtn.addEventListener('click', () => onRestart?.());
    this.returnBtn = el('button', 'ow-sc-ghost', actions, 'RETURN TO MENU');
    this.returnBtn.type = 'button';
    this.returnBtn.addEventListener('click', () => onReturn?.());
    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  setData(d = {}) {
    const mission = d.kind === 'mission';
    setText(this.kicker, mission ? 'MISSION DEBRIEF' : 'MATCH REPORT');
    setStyle(this.scoreRow, 'display', mission ? 'none' : '');
    setStyle(this.rankRow, 'display', mission ? '' : 'none');
    setText(this.restartBtn, mission ? d.retryLabel ?? 'REPLAY MISSION' : 'REMATCH');
    setText(this.statK.DEATHS, mission ? 'TIME' : 'DEATHS');
    setText(this.statK.KD, mission ? 'CIVILIANS' : 'K / D');
    if (mission) return this._setMission(d);
    const won = d.winner === 'esf';
    const draw = d.winner === 'draw';
    setText(this.op, `${d.label ?? ''}${d.mapName ? ' · ' + d.mapName : ''}`);
    const ffa = !!d.ffa;
    const ORD = ['1ST', '2ND', '3RD'];
    setText(this.title, draw ? 'DRAW' : won ? 'VICTORY' : ffa ? `${d.place ? (ORD[d.place - 1] ?? d.place + 'TH') + ' PLACE' : 'DEFEAT'}` : 'DEFEAT');
    setText(this.unitE, ffa ? 'YOU' : 'ESF');
    setText(this.unitH, ffa ? (won ? 'RUNNER-UP' : d.winnerName ?? 'LEADER') : 'HOSTILE');
    setStyle(this.standings, 'display', ffa && d.standings?.length ? '' : 'none');
    if (ffa) {
      for (let i = 0; i < this.standRows.length; i++) {
        const r = this.standRows[i];
        const s = d.standings?.[i];
        setStyle(r, 'display', s ? '' : 'none');
        if (!s) continue;
        setText(r._p, ORD[i]);
        setText(r._n, s.name);
        setText(r._s, d.gun ? `TIER ${Math.min(d.tiers ?? 11, s.score + (s.score < (d.tiers ?? 11) ? 1 : 0))}` : String(s.score));
        setClass(r, 'me', !!s.isPlayer);
      }
    }
    setClass(this.root, 'won', won);
    setClass(this.root, 'lost', !won && !draw);
    setText(this.esf, fmt(d.scoreEsf));
    setText(this.hos, fmt(d.scoreHostile));
    setText(
      this.delta,
      d.mode === 'sd' ? `ROUNDS · FIRST TO ${d.limit ?? 4}` : d.reason === 'time' ? 'TIME LIMIT REACHED' : d.gun ? `${d.tiers ?? 11} TIERS · FINISHED WITH THE KNIFE` : d.kc ? `CONFIRMED ${d.confirms ?? 0} · DENIED ${d.denies ?? 0}` : `SCORE LIMIT ${fmt(d.limit)}`
    );
    const k = d.kills | 0;
    const de = d.deaths | 0;
    setText(this.stat.KILLS, k);
    setText(this.stat.DEATHS, de);
    setText(this.stat.KD, (de ? k / de : k).toFixed(2));
    let acc = d.accuracy;
    setText(this.stat.ACCURACY, acc === null || acc === undefined ? '—' : Math.round(acc <= 1 ? acc * 100 : acc) + '%');
    const lines = matchAssessment(d);
    for (let i = 0; i < this.assess.length; i++) setText(this.assess[i], lines[i] ?? '');
  }

  /** SPECIAL OPERATIONS: time, kills, accuracy, civilians, the rank, Command's summary. */
  _setMission(d) {
    const won = d.winner === 'esf';
    setText(this.op, `${d.label ?? ''}${d.mapName ? ' · ' + d.mapName : ''}`);
    setText(this.title, won ? 'MISSION COMPLETE' : 'MISSION FAILED');
    setClass(this.root, 'won', won);
    setClass(this.root, 'lost', !won);
    setText(this.rank, d.grade ?? '—');
    setText(this.rankLabel, d.gradeLabel ? `RANK · ${d.gradeLabel}` : 'RANK');
    const obj = `OBJECTIVES ${d.objectivesDone ?? 0} / ${d.objectivesTotal ?? 0}`;
    setText(this.delta, won ? `${obj} · PAR ${mmssFmt(d.par)}` : `${obj}${d.failedAt ? ' · FAILED AT: ' + d.failedAt : ''}`);
    setText(this.stat.KILLS, d.kills | 0);
    setText(this.stat.DEATHS, mmssFmt(d.timeS ?? d.durationS));
    const civ = (d.civHits | 0) + (d.civKills | 0);
    setText(this.stat.KD, civ === 0 ? 'UNHARMED' : `${d.civHits | 0} HIT${d.civKills ? ` · ${d.civKills} KILLED` : ''}`);
    const acc = d.accuracy;
    setText(this.stat.ACCURACY, acc === null || acc === undefined ? '—' : Math.round(acc <= 1 ? acc * 100 : acc) + '%');
    const lines = d.debrief ?? [];
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
