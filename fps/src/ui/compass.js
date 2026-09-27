import { el, setText, setStyle, setClass, clamp, clamp01, damp, ease, Pool } from './util.js';

const SPAN_DEG = 120; // degrees visible across the strip
const STRIP_W = 470; // css px at k=1, must match .ow-compass width
const PPD = STRIP_W / SPAN_DEG;
const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/**
 * Heading strip, top centre.
 *
 * Ticks are laid out once across two full revolutions (0-720deg) with left
 * positions written as `calc(Npx * var(--k))`, so a resolution change re-scales
 * the whole strip with zero JS work. Only the strip's translateX is touched
 * per frame — one style write for 144 ticks.
 */
export class Compass {
  constructor(parent) {
    this.root = el('div', 'ow-compass', parent);
    this.strip = el('div', 'ow-compass-strip', this.root);
    el('div', 'ow-compass-base', this.root);
    el('div', 'ow-compass-caret', this.root);

    for (let a = 0; a < 720; a += 5) {
      const t = el('div', 'ow-tick' + (a % 15 === 0 ? ' maj' : ''), this.strip);
      t.style.left = `calc(${(a * PPD).toFixed(2)}px * var(--k))`;
      const c = CARD[a % 360];
      if (c) {
        const l = el('div', 'ow-tick-l' + (c.length > 1 ? ' sub' : ''), this.strip, c);
        l.style.left = `calc(${(a * PPD).toFixed(2)}px * var(--k))`;
      }
    }
    setStyle(this.strip, 'width', `calc(${(720 * PPD).toFixed(0)}px * var(--k))`);

    this.objPool = new Pool(
      5,
      () => el('div', 'ow-compass-obj'),
      this.root
    );

    this.k = 1;
    this._heading = 0;
  }

  /**
   * @param {number} heading degrees, 0 = north, clockwise
   * @param {Array} objectives [{ bearing:deg, label:'A', color }]
   */
  update(heading, objectives) {
    this.k = this.k || 1;
    const k = this.k;
    const h = ((heading % 360) + 360) % 360;
    this._heading = h;
    const x = STRIP_W * 0.5 * k - (h + 360) * PPD * k;
    setStyle(this.strip, 'transform', `translateX(${x.toFixed(2)}px)`);

    const half = STRIP_W * 0.5 * k;
    const items = this.objPool.items;
    let n = 0;
    if (objectives) {
      for (let i = 0; i < objectives.length && n < items.length; i++) {
        const o = objectives[i];
        let rel = o.bearing - h;
        while (rel > 180) rel -= 360;
        while (rel < -180) rel += 360;
        const it = items[n++];
        if (!it.alive) {
          it.alive = true;
          setStyle(it.node, 'display', '');
        }
        const px = clamp(rel * PPD * k, -half + 8 * k, half - 8 * k);
        setText(it.node, o.label ?? '');
        setStyle(it.node, 'left', '50%');
        setStyle(it.node, 'transform', `translateX(calc(-50% + ${px.toFixed(1)}px))`);
        setStyle(it.node, 'background', o.color ?? 'var(--acc)');
        setStyle(it.node, 'opacity', Math.abs(rel) > SPAN_DEG * 0.5 ? '0.45' : '1');
      }
    }
    for (let i = n; i < items.length; i++) {
      if (items[i].alive) {
        items[i].alive = false;
        setStyle(items[i].node, 'display', 'none');
      }
    }
  }

  setScale(k) {
    this.k = k;
  }

  dispose() {
    this.root.remove();
  }
}

/**
 * Objective bar — the persistent run state, top centre under the compass:
 *
 *        WAVE 3  |  HOLD THE SQUARE
 *            18,450   ×4
 *
 * The score is TWEENED (damped toward the target) so a wave bonus reads as a
 * spin-up, never a snap. The multiplier chip punches on gain and fills with the
 * accent from ×5. Both driven from update() so capture frames stay
 * deterministic — no CSS transitions on the numbers.
 */
export class RunBar {
  constructor(parent) {
    this.root = el('div', 'ow-runbar', parent);
    const wave = el('div', 'ow-rb-wave', this.root);
    this.wave = el('b', null, wave, 'WAVE 1');
    el('span', 'dot', wave);
    this.threat = el('span', 'thr', wave, 'HOLD THE SQUARE');
    const main = el('div', 'ow-rb-main', this.root);
    this.score = el('div', 'ow-rb-score', main, '0');
    this.mult = el('div', 'ow-rb-mult hidden', main, '×1');

    this.shown = 0;
    this._lastShown = -1;
    this._lastMult = 1;
    this.pulse = 0;
  }

  update(dt, s) {
    // ---- tweened score --------------------------------------------------
    const target = Math.max(0, s.score ?? 0);
    this.shown = damp(this.shown, target, 9, Math.max(dt, 1e-3));
    if (Math.abs(target - this.shown) < 0.6) this.shown = target;
    const disp = Math.round(this.shown);
    if (disp !== this._lastShown) {
      this._lastShown = disp;
      setText(this.score, disp.toLocaleString('en-US'));
    }

    // ---- wave + threat line ---------------------------------------------
    setText(this.wave, 'WAVE ' + Math.max(1, s.wave ?? 1));
    setText(this.threat, s.waveThreat ?? 'HOLD THE SQUARE');

    // ---- multiplier chip ------------------------------------------------
    const m = Math.max(1, Math.round(s.mult ?? 1));
    if (m !== this._lastMult) {
      if (m > this._lastMult) this.pulse = 1; // punch on gain, not on reset
      this._lastMult = m;
      setText(this.mult, '×' + m);
    }
    setClass(this.mult, 'hidden', m <= 1);
    setClass(this.mult, 'hot', m >= 5);
    this.pulse = Math.max(0, this.pulse - dt * 3.6);
    const sc = 1 + 0.42 * ease.outQuad(clamp01(this.pulse));
    setStyle(this.mult, 'transform', 'scale(' + sc.toFixed(3) + ')');
  }

  dispose() {
    this.root.remove();
  }
}
