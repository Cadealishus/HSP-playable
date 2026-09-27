import { el, setStyle, setText } from './util.js';

/**
 * CABINET MODE — `?cabinet=1`.
 *
 * What a booth machine needs that a browser tab does not:
 *   fullscreen   on the first real input (browsers refuse it any earlier)
 *   attract loop title card → GLOBAL board → TODAY board, on a timer, with
 *                "PRESS ANY BUTTON" over the boards. TODAY is the featured
 *                board at the con, so it holds the screen longest.
 *   idle reset   60 s with nobody touching it and the machine goes back to
 *                attract — but NEVER mid-run. A player who stops to talk to a
 *                sponsor does not lose their wave.
 *
 * This class owns no game state. It calls back into the UI, which owns the
 * screens, and the UI emits `ui:attract` for the reset. Everything is driven
 * from `update(rawDt)` on unscaled time, like the rest of src/ui.
 *
 * There is deliberately no recorded-run attract background. `tools/demo-driver.js`
 * only runs under `?capture=1&lockstep=1`, where the engine has no loop of its
 * own and frames are hand-pumped by node — wiring that into a live cabinet
 * would mean shipping a second frame-scheduling path for a background. The
 * title screen's own animated backdrop is what the loop plays over.
 */

/** Seconds each attract page holds the screen. */
const PAGES = [
  { id: 'title', hold: 11 },
  { id: 'global', hold: 9 },
  { id: 'today', hold: 13 },
];

const IDLE_RESET_S = 60;

export class CabinetMode {
  /**
   * @param {HTMLElement} parent
   * @param {{onPage:(id:string)=>void, onIdleReset:()=>void}} cbs
   */
  constructor(parent, { onPage, onIdleReset }) {
    this.onPage = onPage;
    this.onIdleReset = onIdleReset;

    let active = false;
    try {
      active = new URLSearchParams(location.search).get('cabinet') === '1';
    } catch {
      active = false;
    }
    /** Public: the UI checks this before doing anything cabinet-shaped. */
    this.active = active;

    this.pageIndex = 0;
    this.pageT = 0;
    this.idleT = 0;
    /** 'attract' while the loop is cycling; null while a human is driving. */
    this.mode = null;
    this._wentFullscreen = false;

    this.prompt = el('div', 'ow-cab-prompt', parent);
    setText(this.prompt, 'PRESS ANY BUTTON');
    setStyle(this.prompt, 'display', 'none');
    this._promptOn = false;
    this._blink = 0;

    if (!active) return;

    this._onInput = () => this._input();
    for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
      addEventListener(type, this._onInput, { passive: true, capture: true });
    }
    // A mouse being nudged counts as presence; a mouse sitting still does not.
    this._onMove = (e) => {
      if ((e.movementX ?? 0) || (e.movementY ?? 0)) this.idleT = 0;
    };
    addEventListener('mousemove', this._onMove, { passive: true, capture: true });

    console.info('[cabinet] armed — attract loop, 60s idle reset, fullscreen on first input');
  }

  /* -------------------------------------------------------------- input -- */

  _input() {
    this.idleT = 0;
    this._goFullscreen();
    // Any input during the attract loop jumps straight back to the title card,
    // because the title card is also the job select — that is where a person
    // who just walked up needs to be.
    if (this.mode === 'attract' && PAGES[this.pageIndex].id !== 'title') {
      this._setPage(0);
    }
  }

  _goFullscreen() {
    if (this._wentFullscreen || !this.active) return;
    this._wentFullscreen = true;
    try {
      const root = document.documentElement;
      const req = root.requestFullscreen ?? root.webkitRequestFullscreen;
      const p = req?.call(root, { navigationUI: 'hide' });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* refused (no gesture, iframe, kiosk already fullscreen) — carry on */
    }
  }

  /* ------------------------------------------------------------ attract -- */

  /** Called by the UI whenever game:state changes. */
  setGameState(state) {
    if (!this.active) return;
    this.idleT = 0;
    if (state === 'attract') {
      if (this.mode !== 'attract') {
        this.mode = 'attract';
        this._setPage(0);
      }
    } else {
      if (this.mode === 'attract') this._setPage(0, true);
      this.mode = state;
    }
  }

  _setPage(i, silent = false) {
    this.pageIndex = i % PAGES.length;
    this.pageT = 0;
    const id = PAGES[this.pageIndex].id;
    this._showPrompt(this.mode === 'attract' && id !== 'title');
    if (!silent) this.onPage?.(id);
  }

  _showPrompt(on) {
    if (this._promptOn === on) return;
    this._promptOn = on;
    this._blink = 0;
    setStyle(this.prompt, 'display', on ? '' : 'none');
  }

  /* -------------------------------------------------------------- frame -- */

  update(rawDt) {
    if (!this.active) return;

    if (this._promptOn) {
      this._blink += rawDt;
      setStyle(this.prompt, 'opacity', this._blink % 1.5 < 0.85 ? '1' : '.25');
    }

    if (this.mode === 'attract') {
      this.pageT += rawDt;
      if (this.pageT >= PAGES[this.pageIndex].hold) this._setPage(this.pageIndex + 1);
      this.idleT = 0; // the loop IS the idle state
      return;
    }

    // Idle reset arms on every non-play state: the game-over card, the death
    // card, the pause menu, the boards. Never during a wave.
    if (this.mode === 'play') {
      this.idleT = 0;
      return;
    }
    this.idleT += rawDt;
    if (this.idleT >= IDLE_RESET_S) {
      this.idleT = 0;
      console.info('[cabinet] idle 60s → attract');
      this.onIdleReset?.();
    }
  }

  dispose() {
    if (this.active) {
      for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
        removeEventListener(type, this._onInput, { capture: true });
      }
      removeEventListener('mousemove', this._onMove, { capture: true });
    }
    this.prompt.remove();
  }
}
