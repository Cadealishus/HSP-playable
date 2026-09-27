import { el, setText, setStyle, setClass, ease, clamp01, damp, Pool } from './util.js';

/** Interaction prompt: keycap + verb, with an optional hold-progress rule. */
export class Prompt {
  constructor(parent) {
    this.root = el('div', 'ow-prompt', parent);
    this.key = el('div', 'ow-key', this.root, 'F');
    const col = el('div', null, this.root);
    this.txt = el('div', 'ow-prompt-txt', col, 'INTERACT');
    this.sub = el('div', 'ow-prompt-sub', col, '');
    const bar = el('div', null, col);
    bar.style.cssText =
      'margin-top:calc(var(--u)*1);height:calc(1.5px * var(--k));background:rgba(255,255,255,.16);width:100%';
    this.fill = el('i', null, bar);
    this.fill.style.cssText =
      'display:block;height:100%;width:100%;background:var(--amber);transform-origin:left;transform:scaleX(0)';
    this.bar = bar;

    this.shown = 0;
    this.active = false;
    this.progress = 0;
    setStyle(this.root, 'display', 'none');
  }

  /** @param {object} p { key, text, sub, progress } */
  set(p) {
    this.active = true;
    setText(this.key, p.key ?? 'F');
    setText(this.txt, (p.text ?? 'INTERACT').toUpperCase());
    setText(this.sub, (p.sub ?? '').toUpperCase());
    setStyle(this.sub, 'display', p.sub ? '' : 'none');
    this.progress = p.progress ?? 0;
    setStyle(this.bar, 'display', p.progress !== undefined ? '' : 'none');
  }

  clear() {
    this.active = false;
  }

  update(dt) {
    this.shown = damp(this.shown, this.active ? 1 : 0, 18, dt);
    const vis = this.shown;
    setStyle(this.root, 'display', vis < 0.005 ? 'none' : '');
    if (vis < 0.005) return;
    setStyle(this.root, 'opacity', vis.toFixed(3));
    const y = (1 - ease.outCubic(vis)) * 7;
    setStyle(this.root, 'transform', `translate(-50%,calc(-50% + ${y.toFixed(2)}px))`);
    setStyle(this.fill, 'transform', `scaleX(${clamp01(this.progress).toFixed(3)})`);
  }

  dispose() {
    this.root.remove();
  }
}

/** Kill confirmation / objective banner. One at a time, newest wins. */
export class Banner {
  constructor(parent) {
    this.root = el('div', 'ow-banner', parent);
    this.title = el('div', 'ow-banner-t', this.root, '');
    this.sub = el('div', 'ow-banner-s', this.root, '');
    el('div', 'ow-banner-rule', this.root);
    this.t = 1;
    this.life = 2.1;
    setStyle(this.root, 'display', 'none');
  }

  /**
   * @param {string} title
   * @param {string} sub
   * @param {number} life  seconds on screen
   * @param {'info'|'threat'|'clear'} [kind]  colour variant (see style.js)
   */
  show(title, sub, life = 2.1, kind = 'info') {
    setText(this.title, (title ?? '').toUpperCase());
    setText(this.sub, (sub ?? '').toUpperCase());
    setStyle(this.sub, 'display', sub ? '' : 'none');
    setClass(this.root, 'threat', kind === 'threat');
    setClass(this.root, 'clear', kind === 'clear');
    this.life = life;
    this.t = 0;
  }

  update(dt) {
    if (this.t >= 1) {
      setStyle(this.root, 'display', 'none');
      return;
    }
    this.t = Math.min(1, this.t + dt / this.life);
    const u = this.t;
    const inT = clamp01(u / (0.16 / this.life));
    const a = u > 0.78 ? 1 - ease.inQuad((u - 0.78) / 0.22) : ease.outQuad(inT);
    const s = 0.965 + 0.035 * ease.outBack(inT);
    setStyle(this.root, 'display', '');
    setStyle(this.root, 'opacity', a.toFixed(3));
    setStyle(this.root, 'transform', `translate(-50%,-50%) scale(${s.toFixed(4)})`);
  }

  dispose() {
    this.root.remove();
  }
}

/**
 * Score callouts under the reticle: `+100  HOSTILE NEUTRALISED`.
 *
 * The modern-shooter placement: small, just below and right of centre, newest
 * line on top, three visible. It deliberately does NOT share the Banner — the
 * banner is the wave beat and has one slot; a kill every second would stamp
 * all over it. Four pooled rows, built once; update() only writes transform
 * and opacity.
 */
export class ScorePop {
  constructor(parent) {
    this.root = el('div', 'ow-xp', parent);
    this.pool = new Pool(
      4,
      () => {
        const row = el('div', 'ow-xp-row');
        row._pts = el('b', null, row, '+100');
        row._lbl = el('span', null, row, '');
        return row;
      },
      this.root
    );
    this.life = 1.9;
  }

  /**
   * @param {string} label  uppercase callout
   * @param {number} points
   * @param {'kill'|'head'|'bonus'} [kind]
   */
  push(label, points, kind = 'kill') {
    const it = this.pool.acquire();
    it.life = this.life;
    const n = it.node;
    this.root.prepend(n);
    setText(n._pts, points ? '+' + Math.round(points).toLocaleString('en-US') : '');
    setStyle(n._pts, 'display', points ? '' : 'none');
    setText(n._lbl, label);
    setClass(n, 'head', kind === 'head');
    setClass(n, 'bonus', kind === 'bonus');
    return it;
  }

  update(dt) {
    const items = this.pool.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.alive) continue;
      it.t += dt;
      if (it.t >= it.life) {
        this.pool.release(it);
        continue;
      }
      const inT = clamp01(it.t / 0.12);
      const outT = clamp01((it.t - (it.life - 0.4)) / 0.4);
      // 120 ms fade-in; the line rises 12 px as it settles.
      const y = (1 - ease.outCubic(clamp01(it.t / 0.45))) * 12;
      const a = ease.outQuad(inT) * (1 - ease.inQuad(outT));
      setStyle(it.node, 'transform', `translateY(${y.toFixed(2)}px)`);
      setStyle(it.node, 'opacity', a.toFixed(3));
    }
  }

  clear() {
    this.pool.releaseAll();
  }

  dispose() {
    this.root.remove();
  }
}
