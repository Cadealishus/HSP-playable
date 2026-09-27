import { el, setText, setStyle, setClass, clamp01, damp, ease } from './util.js';
import { InitialsEntry } from './initials.js';

/**
 * ===========================================================================
 * Arcade meta-screens: ATTRACT (title / job select), the death (INSUFFICIENT
 * FUNDS) beat, and the RUN SETTLED game-over card.
 * ===========================================================================
 *
 * These are DOM overlays that live over the HUD chrome. Each fades via a damped
 * `update(rawDt)` — driven from the HUD's lateUpdate on UNSCALED time so they
 * still animate while the game clock is frozen — and nothing here uses a CSS
 * transition on a number, keeping capture frames deterministic.
 *
 * They talk to the rest of the game only through the callbacks handed in by the
 * UI system, which turn them into the contract's `ui:startRun` / `ui:continue`
 * / `ui:restart` events. The screens never import another subsystem.
 */

const JOBS = [
  {
    id: 'fraud-analyst',
    idx: '01',
    name: 'FRAUD ANALYST',
    role: 'RIFLE · RANGE',
    kit: 'Balanced rifle. Reads the pattern and declines the fraud at range.',
    weapon: 'RULES ENGINE MK4',
  },
  {
    id: 'payments-engineer',
    idx: '02',
    name: 'PAYMENTS ENGINEER',
    role: 'SMG · ASSAULT',
    kit: 'Full-auto SMG. High throughput, sub-second settlement up close.',
    weapon: 'VELOCITY-9',
  },
  {
    id: 'compliance-officer',
    idx: '03',
    name: 'COMPLIANCE OFFICER',
    role: 'PISTOL · TANK',
    kit: 'Sidearm and max armour. Slow, audited, and very hard to put down.',
    weapon: 'SIDECAR',
  },
];

/* Shared damped-fade backbone for a pointer-events overlay. */
function fade(node, shown, open) {
  const vis = shown;
  if (vis < 0.004) {
    setStyle(node, 'display', 'none');
    setStyle(node, 'pointer-events', 'none');
    return;
  }
  setStyle(node, 'display', '');
  setStyle(node, 'pointer-events', open ? 'auto' : 'none');
  setStyle(node, 'opacity', ease.outQuad(vis).toFixed(3));
}

/* -------------------------------------------------------------- attract --- */

export class AttractScreen {
  /**
   * @param {(jobId:string)=>void} onSelect
   * @param {()=>void} [onBoards] title-screen route to the leaderboard
   */
  constructor(parent, onSelect, onBoards) {
    this.onSelect = onSelect;
    this.onBoards = onBoards;
    this.root = el('div', 'ow-attract', parent);
    const inner = el('div', 'ow-att-inner', this.root);

    el('div', 'ow-att-mode', inner, 'HOLD THE LEDGER');
    el('div', 'ow-att-title', inner, 'NERD OF DUTY');
    el('div', 'ow-att-sub', inner, 'A FINTECH NERDCON GAME');

    const sel = el('div', 'ow-att-jobsel', inner);
    el('div', 'ln', sel);
    el('div', 'lbl-x', sel, 'SELECT YOUR JOB');
    el('div', 'ln r', sel);

    const cards = el('div', 'ow-att-cards', inner);
    for (const job of JOBS) {
      const card = el('div', 'ow-att-card', cards);
      el('div', 'ow-card-idx', card, job.idx);
      el('div', 'ow-card-name', card, job.name);
      el('div', 'ow-card-role', card, job.role);
      el('div', 'ow-card-kit', card, job.kit);
      el('div', 'ow-card-weapon', card, job.weapon);
      el('div', 'ow-card-cta', card, 'DEPLOY ▸');
      card.addEventListener('click', () => this.onSelect?.(job.id));
    }

    el('div', 'ow-att-hint', inner, 'CREDIT 1 · CLICK TO DEPLOY');

    // One input from the title to the board — the loop quality bar's "<= 2
    // inputs to any screen" applies to the social object too.
    const meta = el('div', 'ow-att-meta', inner);
    this.boardBtn = el('button', 'ow-att-link', meta, 'SEE THE BOARD ▸');
    this.boardBtn.type = 'button';
    this.boardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onBoards?.();
    });

    el('div', 'ow-att-footer', inner, 'NOV 19–20 · SAN DIEGO · FINTECHNERDCON.COM');

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
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
    this.root.remove();
  }
}

/* ---------------------------------------------------------------- death --- */

export class DeathScreen {
  /** @param {{onContinue:()=>void, onAccept:()=>void}} cbs */
  constructor(parent, { onContinue, onAccept }) {
    this.onContinue = onContinue;
    this.onAccept = onAccept;
    this.root = el('div', 'ow-screen death', parent);
    const card = el('div', 'ow-screen-card', this.root);

    el('div', 'ow-sc-kicker', card, 'SETTLEMENT FAILED');
    el('div', 'ow-sc-title', card, 'INSUFFICIENT FUNDS');
    el(
      'div',
      'ow-sc-body',
      card,
      'The ledger came up short. File a dispute to reopen the position — one continue per run — or accept the loss and settle.'
    );

    const actions = el('div', 'ow-sc-actions', card);
    this.contBtn = el('button', 'ow-btn primary', actions, 'FILE A DISPUTE — CONTINUE');
    this.contBtn.type = 'button';
    this.contBtn.addEventListener('click', () => {
      if (this._settled) return;
      this._settled = true;
      this.onContinue?.();
    });
    this.acceptBtn = el('button', 'ow-sc-ghost', actions, 'ACCEPT THE LOSS');
    this.acceptBtn.type = 'button';
    this.acceptBtn.addEventListener('click', () => {
      if (this._settled) return;
      this._settled = true;
      // Emits nothing per contract — waits for game:over to arrive.
      setStyle(this.acceptBtn, 'opacity', '.4');
      setStyle(this.contBtn, 'opacity', '.4');
      setText(this.acceptBtn, 'SETTLING…');
      this.onAccept?.();
    });

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /** @param {{canContinue:boolean}} opts */
  show({ canContinue = true } = {}) {
    this.open = true;
    this._settled = false;
    setStyle(this.contBtn, 'display', canContinue ? '' : 'none');
    setStyle(this.contBtn, 'opacity', '1');
    setStyle(this.acceptBtn, 'opacity', '1');
    setText(this.acceptBtn, canContinue ? 'ACCEPT THE LOSS' : 'SETTLE THE RUN');
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

/* ------------------------------------------------------------ game over --- */

/**
 * RUN SETTLED, plus everything the run turns into: initials → the board →
 * a share card. The card has four states, driven by the UI system:
 *
 *   entry     initials selector armed (the default)
 *   filed     "RANK #12 OF 1,204" + share row
 *   queued    offline; the submit is in localStorage and will drain later
 *   closed    the player skipped, or there is no network at all
 *
 * Only the score/stat block is ever visible in all four — the rest swaps.
 */
export class GameOverScreen {
  /**
   * @param {HTMLElement} parent
   * @param {{onRestart:()=>void, onSubmit:(initials:string)=>void,
   *          onSkip:()=>void, onShare:()=>void, onCopy:()=>void,
   *          onBoards:()=>void}} cbs
   */
  constructor(parent, cbs = {}) {
    const { onRestart, onSubmit, onSkip, onShare, onCopy, onBoards } = cbs;
    this.onRestart = onRestart;
    this.onBoards = onBoards;
    this.root = el('div', 'ow-screen nod-modal', parent);
    const card = el('div', 'ow-screen-card', this.root);

    this.kicker = el('div', 'ow-sc-kicker', card, 'THE LEDGER HELD');
    this.title = el('div', 'ow-sc-title', card, 'RUN SETTLED');
    this.score = el('div', 'ow-sc-score', card, '0');
    this.delta = el('div', 'ow-sc-delta', card, '');

    const stats = el('div', 'ow-sc-stats', card);
    this.stat = {};
    for (const key of ['WAVE', 'KILLS', 'ACCURACY', 'BEST']) {
      const s = el('div', 'ow-sc-stat', stats);
      el('div', 'k', s, key);
      this.stat[key] = el('div', 'v', s, '—');
    }

    this.tease = el('div', 'ow-sc-tease', card, 'COMPLIANCE OFFICER — REACH WAVE 8 TO PREVIEW');

    // ---- initials → board ------------------------------------------------
    this.initials = new InitialsEntry(card, {
      onSubmit: (v) => onSubmit?.(v),
      onSkip: () => onSkip?.(),
    });

    // ---- share row (revealed once the run is filed or queued) ------------
    this.shareRow = el('div', 'ow-sc-share', card);
    this.shareBtn = el('button', 'ow-btn', this.shareRow, 'SHARE THE CARD');
    this.shareBtn.type = 'button';
    this.shareBtn.addEventListener('click', () => onShare?.());
    this.copyBtn = el('button', 'ow-btn', this.shareRow, 'COPY LINK');
    this.copyBtn.type = 'button';
    this.copyBtn.addEventListener('click', () => onCopy?.());
    setStyle(this.shareRow, 'display', 'none');

    const actions = el('div', 'ow-sc-actions', card);
    this.restartBtn = el('button', 'ow-btn primary', actions, 'RUN IT BACK');
    this.restartBtn.type = 'button';
    this.restartBtn.addEventListener('click', () => this.onRestart?.());
    this.boardsBtn = el('button', 'ow-sc-ghost', actions, 'SEE THE BOARD');
    this.boardsBtn.type = 'button';
    this.boardsBtn.addEventListener('click', () => this.onBoards?.());

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /* ------------------------------------------------------ submit states -- */

  /** Arm the initials selector. @param {string|null} lastInitials */
  armEntry(lastInitials) {
    setStyle(this.shareRow, 'display', 'none');
    setStyle(this.tease, 'display', 'none');
    this.initials.show(lastInitials);
  }

  /** No network client at all (capture mode) — hide the whole submit block. */
  disableEntry() {
    this.initials.hide();
    setStyle(this.shareRow, 'display', 'none');
    setStyle(this.tease, 'display', '');
  }

  setSubmitting() {
    this.initials.setBusy(true, 'FILING…');
    this.initials.setStatus('');
  }

  /** @param {{rank:number,total:number}} r */
  setFiled({ rank, total }) {
    const pos = rank ? `RANK #${rank.toLocaleString('en-US')}` : 'FILED';
    const of = total ? ` OF ${total.toLocaleString('en-US')}` : '';
    this.initials.settle(`${pos}${of} · ON THE BOARD`, 'ok');
    setStyle(this.shareRow, 'display', '');
    setStyle(this.copyBtn, 'display', '');
  }

  setQueued() {
    this.initials.settle('QUEUED — IT SETTLES WHEN THE WIFI DOES', 'ok');
    setStyle(this.shareRow, 'display', '');
    setStyle(this.copyBtn, 'display', 'none'); // no row id yet, so no link
  }

  /** @param {string} message uppercase, terse */
  setRejected(message) {
    this.initials.setBusy(false, 'FILE IT WITH THE BOARD');
    this.initials.setStatus(message, 'err');
  }

  setSkipped() {
    this.initials.hide();
    setStyle(this.shareRow, 'display', 'none');
    setStyle(this.tease, 'display', '');
  }

  setShareStatus(message) {
    this.initials.setStatus(message, 'ok');
  }

  /** @param {object} d game:over payload */
  setData(d = {}) {
    const score = Math.max(0, Math.round(d.score ?? 0));
    const best = Math.max(0, Math.round(d.best ?? 0));
    const newBest = !!d.newBest;

    setClass(this.root, 'best', newBest);
    setText(this.kicker, newBest ? 'YOU MOVED THE MARKET' : 'THE LEDGER HELD');
    setText(this.title, newBest ? 'NEW BEST' : 'RUN SETTLED');
    setText(this.score, score.toLocaleString('en-US'));

    if (newBest) {
      setClass(this.delta, 'miss', false);
      this.delta.innerHTML = 'NEW RECORD · <b>BEST SCORE ON THE FLOOR</b>';
    } else {
      const gap = Math.max(0, best - score);
      setClass(this.delta, 'miss', gap > 0);
      this.delta.innerHTML = gap > 0
        ? '<b>' + gap.toLocaleString('en-US') + '</b> FROM BEST · ' + best.toLocaleString('en-US')
        : 'MATCHED YOUR BEST · ' + best.toLocaleString('en-US');
    }

    let acc = d.accuracy ?? 0;
    if (acc <= 1) acc *= 100;
    setText(this.stat.WAVE, Math.max(1, Math.round(d.wave ?? 1)));
    setText(this.stat.KILLS, Math.max(0, Math.round(d.kills ?? 0)));
    setText(this.stat.ACCURACY, Math.round(acc) + '%');
    setText(this.stat.BEST, best.toLocaleString('en-US'));
  }

  show(d) {
    if (d) this.setData(d);
    this.open = true;
    setStyle(this.root, 'display', '');
  }

  hide() {
    this.open = false;
    this.initials.hide();
  }

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 15, rawDt);
    fade(this.root, this.shown, this.open);
    this.initials.update(rawDt);
  }

  dispose() {
    this.initials.dispose();
    this.root.remove();
  }
}
