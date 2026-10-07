/**
 * Procedural texture kit for the bottle generator. Everything is seeded and
 * deterministic, works on Float32 fields, and ends as a 2D canvas the
 * generator saves as PNG (and the GLTF exporter embeds).
 */

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Tileable value noise on a period-p lattice (wraps in x and y). */
function makeLattice(p, seed) {
  const r = rng(seed);
  const g = new Float32Array(p * p);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return g;
}

export class Field {
  constructor(w, h, fill = 0) {
    this.w = w;
    this.h = h;
    this.a = new Float32Array(w * h).fill(fill);
  }
  get(x, y) {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    return this.a[(y | 0) * this.w + (x | 0)];
  }
  /** Add tileable fBm; periods are multiples of the texture so it wraps. */
  fbm({ cellsX = 8, cellsY = 8, octaves = 5, gain = 0.5, amp = 1, seed = 1, ridged = false }) {
    const { w, h, a } = this;
    let A = amp;
    for (let o = 0; o < octaves; o++) {
      const px = cellsX << o, py = cellsY << o;
      const lat = makeLattice(Math.max(px, py), seed * 131 + o * 17);
      const P = Math.max(px, py);
      for (let y = 0; y < h; y++) {
        const fy = (y / h) * py, iy = Math.floor(fy), ty = fy - iy;
        const sy = ty * ty * (3 - 2 * ty);
        const y0 = iy % py, y1 = (iy + 1) % py;
        for (let x = 0; x < w; x++) {
          const fx = (x / w) * px, ix = Math.floor(fx), tx = fx - ix;
          const sx = tx * tx * (3 - 2 * tx);
          const x0 = ix % px, x1 = (ix + 1) % px;
          const v00 = lat[y0 * P + x0], v10 = lat[y0 * P + x1], v01 = lat[y1 * P + x0], v11 = lat[y1 * P + x1];
          let v = (v00 + (v10 - v00) * sx) + ((v01 + (v11 - v01) * sx) - (v00 + (v10 - v00) * sx)) * sy;
          if (ridged) v = 1 - Math.abs(v * 2 - 1);
          a[y * w + x] += (v - 0.5) * A;
        }
      }
      A *= gain;
    }
    return this;
  }
  map(fn) {
    const { w, a } = this;
    for (let i = 0; i < a.length; i++) a[i] = fn(a[i], i % w, (i / w) | 0);
    return this;
  }
  /** Draw a soft line segment (scratch) into the field, wrapping horizontally. */
  line(x0, y0, x1, y1, width, value, mode = 'max') {
    const { w, h, a } = this;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.ceil(len * 1.5));
    const rad = Math.ceil(width + 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      const taper = Math.sin(Math.PI * t) ** 0.6;
      for (let oy = -rad; oy <= rad; oy++) {
        for (let ox = -rad; ox <= rad; ox++) {
          const d = Math.hypot(ox, oy);
          const k = Math.max(0, 1 - d / (width + 0.5)) * taper;
          if (k <= 0) continue;
          const X = (((Math.round(cx) + ox) % w) + w) % w, Y = Math.round(cy) + oy;
          if (Y < 0 || Y >= h) continue;
          const i = Y * w + X;
          a[i] = mode === 'max' ? Math.max(a[i], value * k) : a[i] + value * k;
        }
      }
    }
    return this;
  }
  /** Gaussian-ish blob. */
  blob(cx, cy, rx, ry, value, mode = 'add') {
    const { w, h, a } = this;
    for (let y = Math.floor(cy - ry * 2); y <= cy + ry * 2; y++) {
      if (y < 0 || y >= h) continue;
      for (let x = Math.floor(cx - rx * 2); x <= cx + rx * 2; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const k = Math.exp(-(dx * dx + dy * dy) * 1.6);
        const X = ((x % w) + w) % w;
        const i = y * w + X;
        a[i] = mode === 'max' ? Math.max(a[i], value * k) : a[i] + value * k;
      }
    }
    return this;
  }
  /** Separable box blur (wraps in x). */
  blur(r = 1) {
    const { w, h } = this;
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += this.a[y * w + ((((x + k) % w) + w) % w)];
      tmp[y * w + x] = s / (2 * r + 1);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const Y = y + k; if (Y < 0 || Y >= h) continue; s += tmp[Y * w + x]; n++; }
      this.a[y * w + x] = s / n;
    }
    return this;
  }
}

/** Fingerprint: concentric whorl ridges inside an oval, as a roughness/dirt mask. */
export function fingerprint(field, cx, cy, size, angle, strength, seed) {
  const r = rng(seed);
  const { w, h, a } = field;
  const ex = size * 0.62, ey = size;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const freq = 9 + r() * 3;
  const swirl = r() * 2 - 1;
  for (let y = Math.floor(cy - ey * 1.2); y <= cy + ey * 1.2; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = Math.floor(cx - ey * 1.2); x <= cx + ey * 1.2; x++) {
      const dx = x - cx, dy = y - cy;
      const u = (dx * ca + dy * sa) / ex, v = (-dx * sa + dy * ca) / ey;
      const rr = Math.hypot(u, v);
      if (rr > 1) continue;
      const ridge = 0.5 + 0.5 * Math.sin(rr * freq * Math.PI * 2 + Math.atan2(v, u) * swirl * 0.6 + v * 3);
      const fall = Math.pow(1 - rr, 0.45) * (0.65 + 0.35 * Math.sin(u * 4 + v * 2));
      const X = ((x % w) + w) % w;
      a[y * w + X] += ridge * fall * strength;
    }
  }
}

/** Height field -> tangent-space normal map canvas (OpenGL / glTF convention, +Y up). */
export function normalCanvas(height, strength) {
  const { w, h } = height;
  const cv = canvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (height.get(x + 1, y) - height.get(x - 1, y)) * strength;
      const dy = (height.get(x, Math.min(h - 1, y + 1)) - height.get(x, Math.max(0, y - 1))) * strength;
      // canvas y runs down, glTF v runs up: flip dy
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/**
 * glTF metallicRoughness texture: G = roughness, B = metalness (R = occlusion
 * when packed as ORM). Fields are 0..1.
 */
export function ormCanvas(occl, rough, metal) {
  const w = rough.w, h = rough.h;
  const cv = canvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = clamp01(occl ? occl.a[i] : 1) * 255;
    img.data[i * 4 + 1] = clamp01(rough.a[i]) * 255;
    img.data[i * 4 + 2] = clamp01(metal ? metal.a[i] : 0) * 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Grey field to an RGBA canvas (for thickness maps: glTF reads G). */
export function greyCanvas(f) {
  const cv = canvas(f.w, f.h);
  const g = cv.getContext('2d');
  const img = g.createImageData(f.w, f.h);
  for (let i = 0; i < f.w * f.h; i++) {
    const v = clamp01(f.a[i]) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
