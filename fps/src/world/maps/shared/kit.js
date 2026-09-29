import { Assembler } from '../../builder.js';
import { PALETTE } from '../../palette.js';
import { AIRPORT_PALETTE } from '../airport/palette.js';

/**
 * A map Assembler over its own palette, falling back to the airport's and then
 * the town's for anything shared (steel, glazing, screens, foliage...). Same
 * merge-by-material batches, instanced prototypes and box collision proxies as
 * every other map; see src/world/builder.js.
 */
export class PaletteAssembler extends Assembler {
  constructor(args, palette, tag = 'map') {
    super(args);
    this.palette = palette;
    this.tag = tag;
  }

  _def(key) {
    const list = Array.isArray(this.palette) ? this.palette : [this.palette];
    for (const p of list) if (p[key]) return p[key];
    return AIRPORT_PALETTE[key] ?? PALETTE[key];
  }

  mat(key) {
    let m = this._mats.get(key);
    if (m) return m;
    const def = this._def(key);
    if (!def) {
      console.warn(`[${this.tag}] unknown palette key "${key}"`);
      return this.mat('concrete');
    }
    m = this.materials.get(def.name, def.opts);
    this._mats.set(key, m);
    return m;
  }

  surfaceOf(key) {
    return this._def(key)?.surface ?? 'concrete';
  }
}

/**
 * Tiny deterministic flicker: a stepped hash of time, so a failing tube stutters
 * in bursts rather than strobing. Returns 0..1. No allocation, no Math.random.
 */
export function flicker(t, seed) {
  const step = Math.floor(t * 14 + seed * 37.1);
  const h = Math.sin(step * 12.9898 + seed * 78.233) * 43758.5453;
  const r = h - Math.floor(h);
  // a slow gate: most of the time it holds, sometimes it goes into a fit
  const g = Math.sin(t * 0.73 + seed * 5.1) + Math.sin(t * 1.91 + seed * 2.3);
  if (g < 0.9) return 1;
  return r < 0.45 ? 0.05 : r < 0.6 ? 0.5 : 1;
}
