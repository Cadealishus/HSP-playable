import { el, setText, setStyle, setClass, damp, ease } from './util.js';
import { InputGuard } from './inputguard.js';

/**
 * THE BOARD — global / today / per-job leaderboards.
 *
 * Reachable in one input from the title screen and one from the game-over
 * card, then one more to change board: every screen is <= 2 inputs deep, per
 * the loop quality bar.
 *
 * Palette law (NERDCON_CONTRACT): score is Loot Gold, tabs and interactive
 * chrome are Cyan Pulse, the player's own freshly-filed row is XP Green
 * (a gain), and nothing here is magenta — magenta is threat only.
 *
 * The data client lives in src/game/leaderboard.js and is reached at runtime
 * through `ctx.peek('game').leaderboard`; this file never imports it.
 */

const TABS = [
  { id: 'global', label: 'GLOBAL', scope: 'global', job: null },
  { id: 'today', label: 'TODAY', scope: 'today', job: null },
  { id: 'fraud-analyst', label: 'FRAUD', scope: 'global', job: 'fraud-analyst' },
  { id: 'payments-engineer', label: 'PAYMENTS', scope: 'global', job: 'payments-engineer' },
  { id: 'compliance-officer', label: 'COMPLIANCE', scope: 'global', job: 'compliance-officer' },
];

const JOB_SHORT = {
  'fraud-analyst': 'FRAUD',
  'payments-engineer': 'PAYMENTS',
  'compliance-officer': 'COMPLIANCE',
};

const SUBTITLE = {
  global: 'TOP 100 · ALL TIME · EVERY JOB',
  today: 'TOP 100 · TODAY IN SAN DIEGO',
  'fraud-analyst': 'TOP 100 · FRAUD ANALYST',
  'payments-engineer': 'TOP 100 · PAYMENTS ENGINEER',
  'compliance-officer': 'TOP 100 · COMPLIANCE OFFICER',
};

/** Rows are pooled: a board redraw must not churn 100 elements. */
const ROW_POOL = 100;

export class BoardsScreen {
  /**
   * @param {HTMLElement} parent
   * @param {{fetchBoard:(opts:object)=>Promise<object>, onClose:()=>void}} cbs
   */
  constructor(parent, { fetchBoard, onClose }) {
    this.fetchBoard = fetchBoard;
    this.onClose = onClose;

    this.root = el('div', 'ow-screen boards nod-modal', parent);
    const card = el('div', 'ow-board-card', this.root);

    const head = el('div', 'ow-board-head', card);
    el('div', 'ow-sc-kicker', head, 'HOLD THE LEDGER');
    this.title = el('div', 'ow-board-title', head, 'THE BOARD');
    this.sub = el('div', 'ow-board-sub', head, SUBTITLE.global);

    const tabs = el('div', 'ow-board-tabs', card);
    this.tabBtns = new Map();
    for (const t of TABS) {
      const b = el('button', 'ow-board-tab', tabs, t.label);
      b.type = 'button';
      b.addEventListener('click', () => this.select(t.id));
      this.tabBtns.set(t.id, b);
    }

    const cols = el('div', 'ow-board-cols', card);
    el('div', 'c-rank', cols, '#');
    el('div', 'c-who', cols, 'OPERATOR');
    el('div', 'c-job', cols, 'JOB');
    el('div', 'c-wave', cols, 'WAVE');
    el('div', 'c-score', cols, 'SCORE');

    this.list = el('div', 'ow-board-list', card);
    this.rows = [];
    for (let i = 0; i < ROW_POOL; i++) {
      const r = el('div', 'ow-board-row', this.list);
      const cells = {
        rank: el('div', 'c-rank', r),
        who: el('div', 'c-who', r),
        job: el('div', 'c-job', r),
        wave: el('div', 'c-wave', r),
        score: el('div', 'c-score', r),
      };
      setStyle(r, 'display', 'none');
      this.rows.push({ node: r, cells });
    }

    this.note = el('div', 'ow-board-note', card, 'LOADING THE LEDGER…');

    const actions = el('div', 'ow-board-actions', card);
    this.backBtn = el('button', 'ow-btn primary', actions, 'BACK');
    this.backBtn.type = 'button';
    this.backBtn.addEventListener('click', () => this.onClose?.());
    el('div', 'ow-board-foot', actions, 'NOV 19–20 · SAN DIEGO · FINTECHNERDCON.COM');

    this.open = false;
    this.shown = 0;
    this.tab = 'global';
    this.highlightId = null;
    this._reqId = 0;

    this.guard = new InputGuard(
      () => this.open,
      (e) => {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          this.onClose?.();
          return true;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const i = TABS.findIndex((t) => t.id === this.tab);
          const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
          this.select(TABS[n].id);
          return true;
        }
        return false;
      }
    );

    setStyle(this.root, 'display', 'none');
    this._paintTabs();
  }

  /* -------------------------------------------------------------- opening */

  /**
   * @param {{tab?:string, highlightId?:string|null}} opts
   *   `tab` defaults to TODAY in cabinet mode (the featured board at the con).
   */
  show({ tab = 'global', highlightId = null } = {}) {
    this.highlightId = highlightId;
    this.open = true;
    this.guard.install();
    setStyle(this.root, 'display', '');
    this.select(tab, true);
  }

  hide() {
    this.open = false;
    this.guard.remove();
  }

  select(id, force = false) {
    const tab = TABS.find((t) => t.id === id) ?? TABS[0];
    if (!force && this.tab === tab.id) return;
    this.tab = tab.id;
    this._paintTabs();
    setText(this.sub, SUBTITLE[tab.id] ?? SUBTITLE.global);
    this.load(tab);
  }

  _paintTabs() {
    for (const [id, b] of this.tabBtns) setClass(b, 'on', id === this.tab);
  }

  /* ----------------------------------------------------------------- data */

  async load(tab) {
    const req = ++this._reqId;
    this._setRows([]);
    this._note('READING THE LEDGER…');

    const res = await this.fetchBoard?.({ scope: tab.scope, job: tab.job, limit: 100 });
    if (req !== this._reqId) return; // a newer tab click won

    if (!res?.ok) {
      this._note('BOARD UNREACHABLE — THE WIFI IS THE REAL BOSS FIGHT');
      return;
    }
    if (!res.rows.length) {
      this._note(tab.scope === 'today' ? 'NOBODY HAS POSTED TODAY. BE FIRST.' : 'NO ENTRIES YET. THE LEDGER IS BLANK.');
      return;
    }
    this._note('');
    this._setRows(res.rows);
  }

  _note(text) {
    setText(this.note, text ?? '');
    setStyle(this.note, 'display', text ? '' : 'none');
  }

  _setRows(rows) {
    const n = Math.min(rows.length, ROW_POOL);
    for (let i = 0; i < ROW_POOL; i++) {
      const r = this.rows[i];
      if (i >= n) {
        setStyle(r.node, 'display', 'none');
        continue;
      }
      const d = rows[i];
      setStyle(r.node, 'display', '');
      setText(r.cells.rank, String(i + 1));
      setText(r.cells.who, d.initials ?? '—');
      setText(r.cells.job, JOB_SHORT[d.job] ?? '—');
      setText(r.cells.wave, String(d.wave ?? 1));
      setText(r.cells.score, Math.max(0, Math.round(d.score ?? 0)).toLocaleString('en-US'));
      setClass(r.node, 'mine', !!this.highlightId && d.id === this.highlightId);
      setClass(r.node, 'podium', i < 3);
    }
  }

  /* ---------------------------------------------------------------- frame */

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 15, rawDt);
    if (this.shown < 0.004) {
      setStyle(this.root, 'display', 'none');
      setStyle(this.root, 'pointer-events', 'none');
      return;
    }
    setStyle(this.root, 'display', '');
    setStyle(this.root, 'pointer-events', this.open ? 'auto' : 'none');
    setStyle(this.root, 'opacity', ease.outQuad(this.shown).toFixed(3));
  }

  dispose() {
    this.guard.remove();
    this.root.remove();
  }
}
