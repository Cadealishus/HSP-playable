// Small math helpers for the player: seeded 1D gradient noise (Perlin-style) and springs.

// 1D gradient noise in [-1, 1], smooth (quintic fade), period 256.
export function makeNoise1D(seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rnd() * 2 - 1;
  return (x) => {
    const i0 = Math.floor(x);
    const f = x - i0;
    const g0 = grad[i0 & 255], g1 = grad[(i0 + 1) & 255];
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    const n0 = g0 * f, n1 = g1 * (f - 1);
    return (n0 + (n1 - n0) * u) * 2; // gradient noise peaks near ±0.5, rescale to ~±1
  };
}

// Damped spring x'' = -k (x - target) - c x'. Sub-steps internally so large frame dt stays stable.
export class Spring {
  constructor(stiffness = 120, damping = 16) {
    this.k = stiffness;
    this.c = damping;
    this.x = 0;
    this.v = 0;
  }

  // Build from angular frequency (rad/s) and damping ratio.
  static of(omega, zeta) {
    return new Spring(omega * omega, 2 * zeta * omega);
  }

  update(dt, target = 0) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.x - target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  impulse(v) {
    this.v += v;
  }

  reset(x = 0) {
    this.x = x;
    this.v = 0;
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const DEG = Math.PI / 180;
