/**
 * UI primitives: DOM construction, easing curves, pooling, formatting.
 *
 * Rules obeyed here:
 *  - No per-frame allocation. Pools hand back existing elements/records.
 *  - No Math.random(). Anything random comes from an Rng fork passed in.
 *  - No CSS keyframe animation on gameplay feedback: every animated value is
 *    driven from update() so capture frames are deterministic.
 */

/**
 * Arcade Terminal type system (NERDCON_CONTRACT).
 *
 * ONE monospace family carries the whole HUD — JetBrains Mono, loaded via the
 * Google Fonts link in index.html (weights 400/700/800, display=swap) and
 * degrading through "SF Mono" / ui-monospace on machines offline. Uppercase,
 * letterspaced labels; tabular figures on every counter. "DIN Condensed" style
 * condensed faces are gone: the terminal look wants a fixed-width grid, not a
 * military condensed. Press Start 2P (FONT_ARCADE) is reserved for the
 * title-screen wordmark + "INSERT COIN" moments only — never body HUD.
 */
export const FONT_STACK =
  '"JetBrains Mono","SF Mono",ui-monospace,"Roboto Mono",Menlo,monospace';

/** Display face: the big ammo/score numerals, banners, the menu title.
 *  Same family at weight 800 — heavier, still tabular, still on-grid. */
export const FONT_DISPLAY =
  '"JetBrains Mono","SF Mono",ui-monospace,"Roboto Mono",Menlo,monospace';

export const FONT_MONO = '"JetBrains Mono","SF Mono",ui-monospace,"Roboto Mono",Menlo,monospace';

/** Arcade accent — title wordmark + INSERT COIN only. Max 2 elements per screen. */
export const FONT_ARCADE = '"Press Start 2P","JetBrains Mono",ui-monospace,monospace';

/* ------------------------------------------------------------------ dom --- */

export function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function svg(tag, attrs, parent) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/**
 * Property-name caches for setStyle/setClass.
 *
 * MEASURED: the naive `'_ows_' + prop` built a fresh string on EVERY call, and
 * the HUD calls setStyle 4-5.5k times a second (every pooled killfeed row,
 * hitmarker, damage number and arc writes transform + opacity per frame). That
 * is thousands of short-lived strings a second for a value that only ever takes
 * a couple of dozen distinct forms. The Map lookup is a hash of a string that
 * already exists; nothing is allocated on the hot path.
 */
const STYLE_KEYS = new Map();
const CLASS_KEYS = new Map();

function styleKey(prop) {
  let k = STYLE_KEYS.get(prop);
  if (k === undefined) {
    k = '_ows_' + prop;
    STYLE_KEYS.set(prop, k);
  }
  return k;
}

function classKey(cls) {
  let k = CLASS_KEYS.get(cls);
  if (k === undefined) {
    k = '_owc_' + cls;
    CLASS_KEYS.set(cls, k);
  }
  return k;
}

/**
 * Write textContent only when it actually changed — avoids layout thrash.
 *
 * The raw value is cached alongside the rendered string so an unchanged NUMBER
 * (score, ammo, wave — every counter on the HUD, every frame) never reaches
 * String(). Both caches are kept: `_owRaw` short-circuits the common case,
 * `_owText` still guards the 3 vs '3' collision.
 */
export function setText(node, value) {
  // `_owText !== undefined` is the "has ever been written" test. Without it a
  // first call with an undefined value would short-circuit on the raw cache
  // (undefined === undefined) and silently leave whatever text the element was
  // constructed with — a different behaviour from the old code, which wrote the
  // string "undefined". Neither is desirable, but this is not the change to
  // smuggle it in with.
  if (node._owText !== undefined && node._owRaw === value) return;
  node._owRaw = value;
  const s = String(value);
  if (node._owText !== s) {
    node._owText = s;
    node.textContent = s;
  }
}

/** Write any style property only on change. */
export function setStyle(node, prop, value) {
  const key = styleKey(prop);
  if (node[key] !== value) {
    node[key] = value;
    node.style.setProperty(prop, value);
  }
}

export function setClass(node, cls, on) {
  const key = classKey(cls);
  if (node[key] !== on) {
    node[key] = on;
    node.classList.toggle(cls, on);
  }
}

/** Opacity + transform in one shot; both cached. */
export function place(node, transform, opacity) {
  setStyle(node, 'transform', transform);
  if (opacity !== undefined) setStyle(node, 'opacity', opacity < 0.001 ? '0' : opacity.toFixed(3));
}

/* --------------------------------------------------------------- easing --- */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t) => 1 - (1 - t) ** 5,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  /** Overshoot then settle — hitmarker / banner punch. */
  outBack: (t) => {
    const c = 1.9;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
  /** Damped oscillation, k = number of bounces. */
  outElastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - 2 ** (-9 * t) * Math.cos(t * 22);
  },
  /** Fast attack, slow release — good for anything that must feel "snappy". */
  punch: (t) => (t < 0.18 ? ease.outQuint(t / 0.18) : 1 - ease.inOutSine((t - 0.18) / 0.82)),
};

/* ----------------------------------------------------------------- math --- */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a || 1));
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Framerate-independent exponential approach. `rate` = 1/e per second. */
export function damp(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Critically-damped spring step, in place on {v} holder. Returns new value. */
export function spring(current, target, holder, stiffness, damping, dt) {
  const a = (target - current) * stiffness - holder.v * damping;
  holder.v += a * dt;
  return current + holder.v * dt;
}

export const TAU = Math.PI * 2;

/** Shortest signed angular difference, radians. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/* ------------------------------------------------------------- format --- */

export function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 1834 -> "1.8k", 240 -> "240" */
export function shortNum(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n | 0);
}

/** Distance readout: <10m one decimal, else integer. */
export function metres(d) {
  return d < 10 ? d.toFixed(1) + 'M' : (d | 0) + 'M';
}

export function mmss(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${(s / 60) | 0}:${pad2(s % 60)}`;
}

const CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function cardinal(deg) {
  return CARDINAL[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/* ------------------------------------------------------------------ pool --- */

/**
 * Fixed-size element pool. `make()` builds one element; records carry their own
 * animation state. Nothing is allocated after construction.
 */
export class Pool {
  constructor(count, make, parent) {
    this.items = new Array(count);
    for (let i = 0; i < count; i++) {
      const node = make(i);
      if (parent) parent.appendChild(node);
      node.style.display = 'none';
      this.items[i] = { node, alive: false, t: 0, life: 1, i, a: 0, b: 0, c: 0, d: 0, s: '' };
    }
    this.count = count;
    this._next = 0;
  }

  /** Oldest-first reuse so a burst never starves. */
  acquire() {
    let best = null;
    let bestT = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[(this._next + i) % this.count];
      if (!it.alive) {
        this._next = (it.i + 1) % this.count;
        it.alive = true;
        it.t = 0;
        it.node.style.display = '';
        return it;
      }
      const age = it.t / (it.life || 1);
      if (age > bestT) {
        bestT = age;
        best = it;
      }
    }
    best.alive = true;
    best.t = 0;
    best.node.style.display = '';
    return best;
  }

  release(it) {
    if (!it.alive) return;
    it.alive = false;
    it.node.style.display = 'none';
  }

  releaseAll() {
    for (let i = 0; i < this.count; i++) this.release(this.items[i]);
  }
}
