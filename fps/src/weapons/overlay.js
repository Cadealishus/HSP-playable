/**
 * Screen-space overlays owned by the weapons subsystem, drawn as DOM layers
 * over the canvas (the HUD is DOM too, so they stack with it cleanly):
 *
 *   scope    black mask + reticle + lens-edge vignette while a scoped weapon is
 *            fully aimed (the viewmodel is hidden underneath it)      z 8
 *   flash    the flashbang white-out: a full-white frame that decays
 *            exponentially, with a blur that outlives the white        z 9
 *   cook     a small ring around the crosshair while a grenade is cooked z 11
 *
 * Every style write is change-guarded (see `_set`), so an idle frame costs a
 * handful of number comparisons and no DOM work at all.
 */

const SVGNS = 'http://www.w3.org/2000/svg';

function div(parent, css) {
  const d = document.createElement('div');
  d.style.cssText = css;
  parent.appendChild(d);
  return d;
}

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/**
 * Reticles, authored in a -100..100 box that maps onto the scope's clear
 * aperture (radius 100 = the edge of the glass).
 */
function buildReticle(svg, style) {
  const ink = 'rgba(6,6,6,0.94)';
  if (style === 'marksman') {
    // 4x combat optic: a chevron with an illuminated tip over a thin horizontal
    // stadia line and a bullet-drop post.
    const g = svgEl('g', { fill: 'none', stroke: ink, 'stroke-linecap': 'butt' }, svg);
    svgEl('line', { x1: -100, y1: 0, x2: -18, y2: 0, 'stroke-width': 0.9 }, g);
    svgEl('line', { x1: 18, y1: 0, x2: 100, y2: 0, 'stroke-width': 0.9 }, g);
    svgEl('line', { x1: 0, y1: 10, x2: 0, y2: 100, 'stroke-width': 1.2 }, g);
    for (const y of [22, 34, 46]) svgEl('line', { x1: -4 + y * 0.05, y1: y, x2: 4 - y * 0.05, y2: y, 'stroke-width': 0.8 }, g);
    svgEl('path', { d: 'M -7 9 L 0 0 L 7 9', 'stroke-width': 1.6, stroke: ink }, g);
    // Illuminated tip: fibre-optic amber, with a soft glow.
    svgEl('path', { d: 'M -3.2 4.1 L 0 0 L 3.2 4.1', 'stroke-width': 1.1, stroke: 'rgba(255,110,40,0.95)', fill: 'none' }, svg);
    svgEl('circle', { cx: 0, cy: 1.5, r: 3.2, fill: 'rgba(255,90,30,0.16)' }, svg);
    return;
  }
  // Sniper: a mil-dot duplex. Heavy outer posts pointing at a fine centre cross,
  // mil dots every 10 units on both axes.
  const g = svgEl('g', { fill: ink, stroke: 'none' }, svg);
  const post = 3.4;
  svgEl('rect', { x: -100, y: -post / 2, width: 62, height: post }, g);
  svgEl('rect', { x: 38, y: -post / 2, width: 62, height: post }, g);
  svgEl('rect', { x: -post / 2, y: 38, width: post, height: 62 }, g);
  svgEl('rect', { x: -post / 2, y: -100, width: post, height: 62 }, g);
  svgEl('rect', { x: -38, y: -0.3, width: 76, height: 0.6 }, g);
  svgEl('rect', { x: -0.3, y: -38, width: 0.6, height: 76 }, g);
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    svgEl('ellipse', { cx: i * 10, cy: 0, rx: 0.9, ry: 1.2 }, g);
    svgEl('ellipse', { cx: 0, cy: i * 10, rx: 1.2, ry: 0.9 }, g);
  }
}

export class WeaponOverlays {
  constructor(ctx) {
    this.ctx = ctx;
    this._vals = new Map();
    const host = (typeof document !== 'undefined' && (document.getElementById('ui') ?? document.body)) || null;
    this.ok = !!host;
    if (!this.ok) return;

    /* ---------------------------------------------------------- scope */
    this.scope = div(host, 'position:fixed;inset:0;pointer-events:none;z-index:8;display:none;opacity:0;');
    this.scope.className = 'ow-scope';
    // The lens: everything inside the aperture. Sways as one piece.
    this.lens = div(this.scope, 'position:absolute;left:50%;top:50%;border-radius:50%;will-change:transform;');
    // Black mask outside the glass: one huge box-shadow around the aperture, so
    // the hole is a perfect circle at any aspect ratio with no SVG path maths.
    this.mask = div(this.lens, 'position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 200vmax #000;');
    // Lens-edge vignette: the field stop darkens the last few percent of the
    // aperture, with a faint cool coating tint across the glass.
    this.vig = div(
      this.lens,
      'position:absolute;inset:-1px;border-radius:50%;' +
        'background:radial-gradient(circle closest-side,rgba(40,60,70,0.05) 0%,rgba(0,0,0,0) 62%,' +
        'rgba(0,0,0,0.28) 84%,rgba(0,0,0,0.78) 96%,#000 100%);'
    );
    // Thin bright arc of the inner lens edge catching the light, top-left.
    this.glint = div(
      this.lens,
      'position:absolute;inset:3px;border-radius:50%;' +
        'box-shadow:inset 3px 4px 6px -3px rgba(190,215,230,0.18);'
    );
    this.reticleSvg = svgEl('svg', {
      viewBox: '-100 -100 200 200',
      preserveAspectRatio: 'xMidYMid meet',
      style: 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;',
    }, this.lens);
    this._reticleStyle = null;

    /* ---------------------------------------------------------- flash */
    this.flash = div(host, 'position:fixed;inset:0;pointer-events:none;z-index:9;display:none;');
    this.flashBlur = div(this.flash, 'position:absolute;inset:0;backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);');
    this.flashWhite = div(this.flash, 'position:absolute;inset:0;background:#fffdf8;opacity:0;');

    /* ----------------------------------------------------------- cook */
    this.cook = div(
      host,
      'position:fixed;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;' +
        'pointer-events:none;z-index:11;display:none;'
    );
    const cs = svgEl('svg', { viewBox: '-32 -32 64 64', style: 'width:100%;height:100%;overflow:visible' }, this.cook);
    svgEl('circle', { r: 22, fill: 'none', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 4 }, cs);
    this.cookArc = svgEl('circle', {
      r: 22,
      fill: 'none',
      stroke: 'rgba(243,241,235,0.92)',
      'stroke-width': 2.4,
      'stroke-dasharray': `${(2 * Math.PI * 22).toFixed(2)}`,
      'stroke-dashoffset': '0',
      transform: 'rotate(-90)',
    }, cs);
    this.cookText = svgEl('text', {
      y: 38,
      'text-anchor': 'middle',
      fill: 'rgba(243,241,235,0.9)',
      style: 'font:600 11px "Barlow Condensed",system-ui,sans-serif;letter-spacing:.12em',
    }, cs);
    this.cookText.textContent = '';
    this._cookLen = 2 * Math.PI * 22;
    this._lastW = 0;
    this._lastH = 0;
  }

  /** Change-guarded style write. */
  _set(el, prop, value) {
    let m = this._vals.get(el);
    if (!m) this._vals.set(el, (m = {}));
    if (m[prop] === value) return;
    m[prop] = value;
    el.style[prop] = value;
  }

  /**
   * @param {object} s  { scope: 0..1 visibility, style, swayX, swayY (px),
   *                      flash: 0..1 white, blur: px, cook: 0..1 | -1, cookText, danger }
   */
  update(s) {
    if (!this.ok) return;
    const w = innerWidth;
    const h = innerHeight;

    // ---- scope -----------------------------------------------------------
    if (s.scope > 0.001) {
      if (this._reticleStyle !== s.style) {
        this._reticleStyle = s.style;
        while (this.reticleSvg.firstChild) this.reticleSvg.removeChild(this.reticleSvg.firstChild);
        buildReticle(this.reticleSvg, s.style);
      }
      if (w !== this._lastW || h !== this._lastH) {
        this._lastW = w;
        this._lastH = h;
      }
      // The glass fills 92% of the screen height (a modern shooter's scope is a
      // big circle with a black surround, not a keyhole).
      const d = Math.round(Math.min(w, h) * 0.92);
      this._set(this.lens, 'width', `${d}px`);
      this._set(this.lens, 'height', `${d}px`);
      this._set(this.lens, 'marginLeft', `${-d / 2}px`);
      this._set(this.lens, 'marginTop', `${-d / 2}px`);
      // A zoom-in on entry: the tube comes up to the eye.
      const k = 1.18 - 0.18 * s.scope;
      this._set(
        this.lens,
        'transform',
        `translate(${s.swayX.toFixed(1)}px,${s.swayY.toFixed(1)}px) scale(${k.toFixed(3)})`
      );
      this._set(this.scope, 'display', 'block');
      this._set(this.scope, 'opacity', s.scope.toFixed(3));
    } else {
      this._set(this.scope, 'display', 'none');
    }

    // ---- flash -----------------------------------------------------------
    if (s.flash > 0.002 || s.blur > 0.05) {
      this._set(this.flash, 'display', 'block');
      this._set(this.flashWhite, 'opacity', Math.min(1, s.flash).toFixed(3));
      const b = `blur(${s.blur.toFixed(1)}px)`;
      this._set(this.flashBlur, 'backdropFilter', b);
      this._set(this.flashBlur, 'webkitBackdropFilter', b);
    } else {
      this._set(this.flash, 'display', 'none');
    }

    // ---- cook --------------------------------------------------------------
    if (s.cook >= 0) {
      this._set(this.cook, 'display', 'block');
      const off = (this._cookLen * Math.min(1, s.cook)).toFixed(2);
      if (this._vals.get(this.cookArc)?.off !== off) {
        this._vals.set(this.cookArc, { off });
        this.cookArc.setAttribute('stroke-dashoffset', off);
        this.cookArc.setAttribute('stroke', s.danger ? 'rgba(232,72,52,0.96)' : 'rgba(243,241,235,0.92)');
      }
      if (this.cookText.textContent !== s.cookText) this.cookText.textContent = s.cookText;
    } else {
      this._set(this.cook, 'display', 'none');
    }
  }

  dispose() {
    this.scope?.remove();
    this.flash?.remove();
    this.cook?.remove();
    this._vals.clear();
  }
}
