'use strict';
// FLOP OPS — hand-inked procedural animation engine.
// Everything is drawn from code: brush strokes, hatching, rim-lit silhouettes,
// paper grain. Line "boil" is seeded per drawing so the art re-draws itself on twos.

const W = 1080, H = 1920, TAU = Math.PI * 2;
const FPS_DRAW = 12; // drawings per second (animated on twos at 24fps)

const PAL = {
  ink: '#14120e', ink2: '#221e18', paper: '#ebe0c6', bone: '#cdbd94', khaki: '#8c7e57',
  olive: '#4d5336', oliveD: '#2c301f', oliveDD: '#191b12',
  slate: '#2a333b', slateD: '#161c22', steel: '#5d6b72', steelL: '#93a19f',
  red: '#d6402f', redM: '#8e2219', redD: '#4a120d', redDD: '#220907',
  amber: '#f5b23d', amberD: '#c26b1f', hot: '#fff4d6',
};

// ---------------------------------------------------------------- randomness
function h32(a) {
  a = a | 0;
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  a ^= a >>> 16;
  return (a >>> 0) / 4294967296;
}
const RNG = { boil: 0, base: 0, c: 0, J: 2 };
function seed(id) { RNG.base = Math.imul(id | 0, 0x9E3779B1) ^ Math.imul((RNG.boil | 0) + 7, 0x85EBCA77); RNG.c = 0; }
function r() { return h32(RNG.base + Math.imul(++RNG.c, 0x27d4eb2f)); }
function rs() { return r() * 2 - 1; }
// stable (non-boiling) randomness for layout
function sr(i, k = 0) { return h32(Math.imul(i | 0, 0x9E3779B1) + Math.imul(k | 0, 0x632BE5AB) + 12345); }

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = {
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u) => 1 - Math.pow(1 - u, 3),
  in: (u) => u * u * u,
  in2: (u) => u * u,
  outBack: (u) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
  outExpo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
};
function noise1(x, s = 0) {
  const i = Math.floor(x), f = x - i;
  const a = sr(i, s) * 2 - 1, b = sr(i + 1, s) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
function shake(t, amp, freq, s = 0) { return [noise1(t * freq, s) * amp, noise1(t * freq, s + 77) * amp]; }
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mix(h1, h2, u) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const c = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, u));
  return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
}
function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

// ---------------------------------------------------------------- ink primitives
// Tapered, slightly bowed brush stroke with overshoot at the ends.
function sline(ctx, x1, y1, x2, y2, w = 3, col = PAL.ink, j = RNG.J) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  if (L < 0.5) return;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const ov = Math.min(L * 0.07, 10);
  const o1 = r() * ov, o2 = r() * ov;
  const ax = x1 - ux * o1 + rs() * j, ay = y1 - uy * o1 + rs() * j;
  const bx = x2 + ux * o2 + rs() * j, by = y2 + uy * o2 + rs() * j;
  const bow = rs() * (j + L * 0.01);
  const mx = (ax + bx) / 2 + nx * bow, my = (ay + by) / 2 + ny * bow;
  ctx.fillStyle = col; ctx.strokeStyle = col;
  if (w < 1.8) {
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
    return;
  }
  const N = Math.max(3, Math.min(14, (L / 14) | 0));
  const ws = 0.2 + r() * 0.35, we = 0.15 + r() * 0.35;
  const Lp = [], Rp = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = 1 - u;
    const px = a * a * ax + 2 * a * u * mx + u * u * bx, py = a * a * ay + 2 * a * u * my + u * u * by;
    let tx = 2 * a * (mx - ax) + 2 * u * (bx - mx), ty = 2 * a * (my - ay) + 2 * u * (by - my);
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const prof = u < 0.5 ? lerp(ws, 1, ease.out(u * 2)) : lerp(1, we, ease.in((u - 0.5) * 2));
    const hw = w * 0.5 * prof;
    Lp.push(px - ty * hw, py + tx * hw); Rp.push(px + ty * hw, py - tx * hw);
  }
  ctx.beginPath(); ctx.moveTo(Lp[0], Lp[1]);
  for (let i = 2; i < Lp.length; i += 2) ctx.lineTo(Lp[i], Lp[i + 1]);
  for (let i = Rp.length - 2; i >= 0; i -= 2) ctx.lineTo(Rp[i], Rp[i + 1]);
  ctx.closePath(); ctx.fill();
}
function spath(ctx, pts, w = 3, col = PAL.ink, closed = false, j = RNG.J) {
  const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    sline(ctx, a[0], a[1], b[0], b[1], w, col, j);
  }
}
function tracePts(ctx, pts, j = 0, off = [0, 0]) {
  ctx.moveTo(pts[0][0] + off[0] + rs() * j, pts[0][1] + off[1] + rs() * j);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + off[0] + rs() * j, pts[i][1] + off[1] + rs() * j);
  ctx.closePath();
}
function sfill(ctx, pts, col, j = RNG.J * 0.6, off = [0, 0]) {
  if (!pts || pts.length < 3) return;
  ctx.fillStyle = col; ctx.beginPath(); tracePts(ctx, pts, j, off); ctx.fill();
}
// fill + inked edges (fill misregistered a touch, like cheap print)
function shape(ctx, pts, fill, line = PAL.ink, w = 3, o = {}) {
  if (!pts || pts.length < 2) return;
  if (fill) sfill(ctx, pts, fill, o.fj ?? RNG.J * 0.5, o.off || [rs() * 2, rs() * 2]);
  if (line && w > 0) spath(ctx, pts, w, line, o.closed !== false, o.j ?? RNG.J);
}
function bbox(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
}
// Hatching inside a polygon (or a clip callback)
function hatch(ctx, clip, ang, gap, w, col, alpha = 1, bb = null, j = 1.6, broken = 0.25) {
  if (!clip) return;
  const pts = Array.isArray(clip) ? clip : null;
  if (pts && pts.length < 3) return;
  bb = bb || (pts ? bbox(pts) : [0, 0, W, H]);
  if (bb[2] - bb[0] < 2 || bb[3] - bb[1] < 2) return;
  ctx.save();
  ctx.beginPath();
  if (pts) tracePts(ctx, pts, 0); else clip(ctx);
  ctx.clip();
  ctx.globalAlpha *= alpha; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath();
  const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, rad = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 6;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  gap = Math.max(gap, 1.5);
  for (let d = -rad; d <= rad; d += gap) {
    const g = d + rs() * gap * 0.22;
    const px = cx + nx * g, py = cy + ny * g;
    let a = -rad * (0.85 + r() * 0.2);
    const end = rad * (0.85 + r() * 0.2);
    while (a < end) {
      const len = (rad * 0.4 + r() * rad * 1.2);
      const b = Math.min(end, a + len);
      ctx.moveTo(px + dx * a + rs() * j, py + dy * a + rs() * j);
      ctx.lineTo(px + dx * b + rs() * j, py + dy * b + rs() * j);
      a = b + (r() < broken ? gap * (0.6 + r() * 1.5) : 0.01);
    }
  }
  ctx.stroke();
  ctx.restore();
}
function blobPts(cx, cy, rx, ry, n, irr, s) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + irr * (sr(s, i) * 2 - 1) + irr * 0.5 * Math.sin(a * 3 + s);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
function circlePts(cx, cy, rad, n = 14) { return blobPts(cx, cy, rad, rad, n, 0, 0); }
function glow(ctx, x, y, rad, col, a = 1, mode = 'lighter') {
  if (rad <= 1 || a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = mode;
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.35, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  ctx.restore();
}
// directional muzzle flash (ang = barrel direction). radial=true for flashes seen end-on
function muzzle(ctx, x, y, ang, sz, radial = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  glow(ctx, 0, 0, sz * 4.2, PAL.amber, 0.6);
  glow(ctx, 0, 0, sz * 1.6, PAL.hot, 0.6);
  const n = 7, pts = [], core = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU + rs() * 0.12;
    let len;
    if (i % 2) len = sz * (0.22 + r() * 0.12);
    else {
      const fwd = radial ? 1 : 1 + 2.4 * Math.pow(Math.max(0, Math.cos(a)), 3) + 0.9 * Math.pow(Math.abs(Math.sin(a)), 8);
      len = sz * (0.55 + r() * 0.5) * fwd;
    }
    const ox = radial ? 0 : sz * 0.25;
    pts.push([ox + Math.cos(a) * len, Math.sin(a) * len]);
    core.push([ox + Math.cos(a) * len * 0.45, Math.sin(a) * len * 0.45]);
  }
  sfill(ctx, pts, PAL.amber, 1);
  sfill(ctx, core, PAL.hot, 1);
  spath(ctx, pts, 2.2, PAL.ink, true, 1);
  ctx.restore();
}
function puff(ctx, x, y, rad, fill, shade, line, s, lw = 2.5, shadeDir = [0.3, 0.35]) {
  if (rad < 1) return;
  const pts = blobPts(x, y, rad, rad * 0.92, 12, 0.2, s);
  sfill(ctx, pts, fill, 1.5);
  if (shade) {
    ctx.save(); ctx.beginPath(); tracePts(ctx, pts, 0); ctx.clip();
    sfill(ctx, blobPts(x + rad * shadeDir[0], y + rad * shadeDir[1], rad * 0.85, rad * 0.75, 10, 0.2, s + 3), shade, 1);
    ctx.restore();
  }
  if (line) spath(ctx, pts.filter((_, i) => sr(s, i + 40) > 0.25), lw, line, false, 1.2);
}
function speedRadial(ctx, cx, cy, n, r0, r1, col, w, alpha, s = 0) {
  ctx.save(); ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, a0 = r0 * (0.8 + r() * 0.6), a1 = r1 * (0.7 + r() * 0.5);
    sline(ctx, cx + Math.cos(a) * a0, cy + Math.sin(a) * a0, cx + Math.cos(a) * a1, cy + Math.sin(a) * a1, w * (0.4 + r()), col, 1);
  }
  ctx.restore();
}
function speedLinear(ctx, ang, n, col, w, alpha, area = [0, 0, W, H]) {
  ctx.save(); ctx.globalAlpha = alpha;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const x = lerp(area[0], area[2], r()), y = lerp(area[1], area[3], r()), L = 120 + r() * 380;
    sline(ctx, x, y, x + dx * L, y + dy * L, w * (0.4 + r()), col, 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 3D-ish camera
class Cam3 {
  constructor(o) { Object.assign(this, { x: 0, y: 0, z: 0, f: 800, cx: W / 2, cy: H / 2, near: 0.08 }, o); }
  p(x, y, z) {
    const d = z - this.z;
    if (d < this.near) return null;
    const s = this.f / d;
    return [this.cx + (x - this.x) * s, this.cy + (y - this.y) * s, s];
  }
  // project a polygon with near-plane clipping
  poly(pts3) {
    const nz = this.z + this.near, out = [];
    for (let i = 0; i < pts3.length; i++) {
      const a = pts3[i], b = pts3[(i + 1) % pts3.length];
      const ain = a[2] >= nz, bin = b[2] >= nz;
      if (ain) out.push(a);
      if (ain !== bin) {
        const u = (nz - a[2]) / (b[2] - a[2]);
        out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u), nz]);
      }
    }
    return out.length >= 3 ? out.map((q) => this.p(q[0], q[1], q[2] + 1e-6)).filter(Boolean) : null;
  }
}

// ---------------------------------------------------------------- figures
function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const maxd = (l1 + l2) * 0.999;
  if (d < 1e-3) { dx = 0; dy = 1; d = 1e-3; }
  const ux = dx / d, uy = dy / d;
  if (d > maxd) d = maxd;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { kx: ax + ux * a - uy * hh * bend, ky: ay + uy * a + ux * hh * bend, ex: ax + ux * d, ey: ay + uy * d };
}

// Parts are built once with jitter baked in, then rendered as rim pass + body pass.
function Parts() { this.list = []; }
Parts.prototype.limb = function (pts, w, far = false) {
  this.list.push({ k: 'L', pts: pts.map((p) => [p[0] + rs() * 0.8, p[1] + rs() * 0.8]), w, far });
};
Parts.prototype.poly = function (pts, far = false, j = 1) {
  this.list.push({ k: 'P', pts: pts.map((p) => [p[0] + rs() * j, p[1] + rs() * j]), far });
};
Parts.prototype.circ = function (x, y, rad, far = false) {
  this.list.push({ k: 'P', pts: blobPts(x, y, rad, rad, 12, 0.04, (r() * 1000) | 0), far });
};
Parts.prototype.render = function (ctx, body, farCol, rim, rimOff, outline) {
  const draw = (col, colFar, off) => {
    ctx.save(); ctx.translate(off[0], off[1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of this.list) {
      const c = p.far ? colFar : col;
      if (p.k === 'L') {
        ctx.strokeStyle = c; ctx.lineWidth = p.w; ctx.beginPath();
        ctx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0], p.pts[i][1]);
        ctx.stroke();
      } else {
        ctx.fillStyle = c; ctx.beginPath(); tracePts(ctx, p.pts, 0); ctx.fill();
      }
    }
    ctx.restore();
  };
  if (rim) draw(rim, rim, rimOff);
  if (outline) {
    // thick ink pass slightly larger than body for an outline
    ctx.save();
    for (const p of this.list) if (p.k === 'L') p.w += outline * 2;
    draw(PAL.ink, PAL.ink, [0, 0]);
    for (const p of this.list) if (p.k === 'L') p.w -= outline * 2;
    ctx.restore();
  }
  draw(body, farCol || body, [0, 0]);
};

// profile figure. o.x,o.y = hip. feet are ankle positions.
function sideFigure(ctx, o) {
  const h = o.h, d = o.dir || 1, lean = o.lean || 0;
  const P = new Parts();
  const U = [Math.sin(lean) * d, -Math.cos(lean)], F = [Math.cos(lean) * d, Math.sin(lean)];
  const T = (f, u) => [o.x + F[0] * f * h + U[0] * u * h, o.y + F[1] * f * h + U[1] * u * h];
  const hip = [o.x, o.y];
  const sh = T(0.0, 0.29);
  const hr = 0.066 * h;
  const ha = lean * 0.6 + (o.headTilt || 0);
  const head = [sh[0] + Math.sin(ha) * hr * 1.5 * d + 0.015 * h * d, sh[1] - Math.cos(ha) * hr * 1.45];
  const L = { th: 0.25 * h, sh: 0.25 * h, ua: 0.165 * h, fa: 0.165 * h };

  // weapon geometry
  let hN = o.hN, hF = o.hF, wpn = null, muzzlePt = null, rearPt = null, wAng = 0;
  if (o.weapon) {
    const a = o.weapon.ang || 0; wAng = d > 0 ? a : Math.PI - a;
    const b = [Math.cos(a) * d, Math.sin(a)], dn = [-b[1] * d, b[0] * d];
    const base = o.weapon.kind === 'rpg' ? [sh[0] + d * 0.02 * h, sh[1] - 0.005 * h] : [sh[0] + d * 0.035 * h, sh[1] + 0.035 * h];
    const W_ = (u, v) => [base[0] + b[0] * u * h + dn[0] * v * h, base[1] + b[1] * u * h + dn[1] * v * h];
    if (o.weapon.kind === 'rifle') {
      wpn = [[-0.03, -0.02], [0.12, -0.022], [0.13, -0.05], [0.16, -0.062], [0.25, -0.062], [0.27, -0.03], [0.41, -0.026], [0.41, -0.016], [0.54, -0.014], [0.54, 0.0], [0.37, 0.002], [0.37, 0.022], [0.235, 0.022], [0.225, 0.085], [0.19, 0.085], [0.19, 0.022], [0.15, 0.022], [0.135, 0.07], [0.11, 0.07], [0.112, 0.022], [0.0, 0.03], [-0.03, 0.045]].map(([u, v]) => W_(u, v));
      hN = hN || W_(0.12, 0.05); hF = hF || W_(0.32, 0.02);
      muzzlePt = W_(0.55, -0.007);
    } else if (o.weapon.kind === 'pistol') {
      const pb = [sh[0] + b[0] * 0.27 * h, sh[1] + 0.06 * h + b[1] * 0.27 * h];
      const Wp = (u, v) => [pb[0] + b[0] * u * h + dn[0] * v * h, pb[1] + b[1] * u * h + dn[1] * v * h];
      wpn = [[0, -0.02], [0.1, -0.02], [0.1, 0.005], [0.03, 0.005], [0.02, 0.05], [-0.005, 0.05], [0, 0.0]].map(([u, v]) => Wp(u, v));
      hN = hN || Wp(0.01, 0.01); hF = hF || Wp(0.0, 0.02);
      muzzlePt = Wp(0.11, -0.008);
    } else if (o.weapon.kind === 'rpg') {
      wpn = [[-0.33, -0.075], [-0.25, -0.05], [0.38, -0.05], [0.42, -0.07], [0.55, -0.03], [0.57, -0.01], [0.55, 0.01], [0.42, 0.05], [0.38, 0.03], [-0.25, 0.03], [-0.33, 0.055]].map(([u, v]) => W_(u, v));
      const grip = [[0.04, 0.03], [0.07, 0.03], [0.06, 0.1], [0.035, 0.1]].map(([u, v]) => W_(u, v));
      wpn.grip = grip;
      hN = hN || W_(0.05, 0.085); hF = hF || W_(0.22, 0.04);
      muzzlePt = W_(0.57, -0.01); rearPt = W_(-0.34, -0.01);
    }
  }
  hN = hN || [sh[0] + d * 0.05 * h, sh[1] + 0.3 * h];
  hF = hF || [sh[0] - d * 0.03 * h, sh[1] + 0.3 * h];

  const fN = o.fN || [hip[0] + d * 0.03 * h, hip[1] + 0.48 * h];
  const fF = o.fF || [hip[0] - d * 0.05 * h, hip[1] + 0.48 * h];
  const leg = (f, far) => {
    const k = ik(hip[0], hip[1], f[0], f[1], L.th, L.sh, o.kneeBend ?? -d);
    P.limb([hip, [k.kx, k.ky]], 0.105 * h, far);
    P.limb([[k.kx, k.ky], [k.ex, k.ey]], 0.08 * h, far);
    const fd = o.footDir ?? d, ex = k.ex, ey = k.ey;
    const fa = o.footAng || 0;
    const bp = [[-0.03, -0.02], [0.02, -0.03], [0.075, 0.0], [0.085, 0.035], [-0.035, 0.035]].map(([u, v]) => {
      const [ru, rv] = rot(u * fd, v, fa * fd); return [ex + ru * h, ey + rv * h];
    });
    P.poly(bp, far);
    return [k.kx, k.ky];
  };
  const arm = (s, hd, far) => {
    const k = ik(s[0], s[1], hd[0], hd[1], L.ua, L.fa, o.elbowBend ?? d);
    P.limb([s, [k.kx, k.ky]], 0.072 * h, far);
    P.limb([[k.kx, k.ky], [k.ex, k.ey]], 0.06 * h, far);
    P.circ(k.ex, k.ey, 0.032 * h, far);
    return [k.kx, k.ky];
  };
  const shF = [sh[0] - d * 0.02 * h, sh[1] + 0.01 * h];
  // far side
  arm(shF, hF, true);
  const kF = leg(fF, true);
  // torso
  const tor = [[0.06, -0.06], [0.07, 0.04], [0.085, 0.12], [0.09, 0.24], [0.05, 0.305], [-0.02, 0.32], [-0.08, 0.3], [-0.1, 0.27], [-0.105, 0.12], [-0.075, 0.04], [-0.065, -0.06]];
  if (o.gear !== 'goon' && o.gear !== 'hostage') tor.splice(9, 0, [-0.13, 0.25], [-0.135, 0.12]);
  P.poly(tor.map(([f, u]) => T(f, u)), false, 1.2);
  P.limb([T(0, 0.3), [head[0] - d * 0.01 * h, head[1] + hr * 0.6]], 0.055 * h);
  // head + gear
  P.circ(head[0], head[1], hr);
  const g = o.gear || 'op';
  const hel = (pts) => P.poly(pts.map(([u, v]) => { const [ru, rv] = rot(u * d, v, ha * d * 0.6); return [head[0] + ru * hr, head[1] + rv * hr]; }));
  if (g === 'op') {
    hel([[-1.35, 0.25], [-1.3, -0.5], [-0.8, -1.2], [0, -1.42], [0.75, -1.2], [1.2, -0.6], [1.25, -0.15], [0.6, -0.25], [-0.4, -0.1]]);
    hel([[0.95, -0.7], [1.6, -0.75], [1.65, -0.35], [1.05, -0.3]]); // nvg mount
  } else if (g === 'mask') {
    hel([[-1.25, 0.2], [-1.2, -0.7], [-0.6, -1.25], [0.3, -1.25], [1.0, -0.8], [1.2, -0.2], [1.1, 0.4], [1.75, 0.55], [1.8, 1.05], [1.2, 1.15], [0.4, 0.9], [-0.6, 0.7]]);
  } else if (g === 'goon') {
    hel([[-1.15, -0.1], [-1.05, -0.9], [-0.4, -1.35], [0.4, -1.3], [1.0, -0.85], [1.15, -0.3], [0.2, -0.45]]);
  }
  // near side
  const kN = leg(fN, false);
  if (wpn) { P.poly(wpn, false, 0.6); if (wpn.grip) P.poly(wpn.grip, false, 0.5); }
  const eN = arm(sh, hN, false);

  P.render(ctx, o.body || PAL.ink, o.far || o.body || PAL.ink, o.rim, o.rimOff || [-4, -4], o.outline);

  // details
  if (o.detail) {
    const dc = o.detail;
    const a = T(0.07, 0.2), b = T(0.07, 0.07);
    sline(ctx, a[0], a[1], b[0], b[1], 2, dc, 1);
    const c1 = T(-0.08, 0.3), c2 = T(0.06, 0.06);
    sline(ctx, c1[0], c1[1], c2[0], c2[1], 1.6, dc, 1);
    if (g === 'op') {
      const p1 = [head[0] - d * hr * 1.2, head[1] - hr * 0.1], p2 = [head[0] + d * hr * 1.1, head[1] - hr * 0.45];
      sline(ctx, p1[0], p1[1], p2[0], p2[1], 1.6, dc, 1);
    }
    sline(ctx, kN[0] - 0.03 * h, kN[1], kN[0] + 0.03 * h, kN[1] + 0.01 * h, 2, dc, 1);
  }
  if (o.eyes) {
    const ex = head[0] + d * hr * 0.65, ey = head[1] - hr * 0.05;
    glow(ctx, ex, ey, hr * 1.6, o.eyes, 0.8);
    ctx.fillStyle = o.eyes; ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.32, hr * 0.22, 0, 0, TAU); ctx.fill();
  }
  return { head, sh, hip, muzzle: muzzlePt, rear: rearPt, wAng, hN, hF, hr };
}

// frontal / back figure. o.x,o.y = hip center.
function frontFigure(ctx, o) {
  const h = o.h, tilt = o.tilt || 0;
  const P = new Parts();
  const U = [Math.sin(tilt), -Math.cos(tilt)], R = [Math.cos(tilt), Math.sin(tilt)];
  const T = (x, u) => [o.x + R[0] * x * h + U[0] * u * h, o.y + R[1] * x * h + U[1] * u * h];
  const hipL = T(-0.065, 0), hipR = T(0.065, 0);
  const shL = T(-0.13, 0.28), shR = T(0.13, 0.28);
  const hr = 0.066 * h;
  const head = T((o.headX || 0), 0.395 + (o.headDrop || 0));
  const fL = o.fL || T(-0.08, -0.49), fR = o.fR || T(0.08, -0.49);
  const legs = () => {
    for (const [hp, f, s] of [[hipL, fL, -1], [hipR, fR, 1]]) {
      const lift = clamp((o.y + 0.49 * h - f[1]) / (0.25 * h));
      const kx = (hp[0] + f[0]) / 2 + s * (0.025 + lift * 0.02) * h, ky = (hp[1] + f[1]) / 2 - lift * 0.03 * h;
      if (o.seated) {
        const k = [hp[0] + s * 0.05 * h, hp[1] + 0.05 * h];
        P.limb([hp, k], 0.12 * h); P.limb([k, f], 0.085 * h);
      } else {
        P.limb([hp, [kx, ky]], 0.11 * h); P.limb([[kx, ky], f], 0.085 * h);
      }
      const bw = 0.05 * h * (1 - lift * 0.2), bh = o.back ? 0.03 * h + lift * 0.035 * h : 0.035 * h;
      P.poly([[f[0] - bw, f[1] - bh * 0.4], [f[0] + bw, f[1] - bh * 0.4], [f[0] + bw * 0.9, f[1] + bh], [f[0] - bw * 0.9, f[1] + bh]]);
    }
  };
  const armsBehind = [], armsFront = [];
  const pose = o.arms || 'none';
  let muzzlePt = null;
  if (pose === 'rifleBack') {
    // back view, rifle shouldered on the right, pointing into the scene
    const el = T(0.2, 0.17), hd = T(0.08, 0.24);
    armsBehind.push(() => { P.limb([shR, el], 0.08 * h); P.limb([el, hd], 0.068 * h); });
    const elL = T(-0.19, 0.16);
    armsBehind.push(() => { P.limb([shL, elL], 0.08 * h); P.limb([elL, T(-0.06, 0.25)], 0.068 * h); });
    const vp = o.vp || [o.x, o.y - 0.6 * h];
    const base = T(0.07, 0.3);
    const dx = vp[0] - base[0], dy = vp[1] - base[1], dl = Math.hypot(dx, dy) || 1;
    const len = Math.min(dl, (o.rifleLen || 0.2) * h);
    muzzlePt = [base[0] + (dx / dl) * len, base[1] + (dy / dl) * len];
    const mid = [base[0] + (dx / dl) * len * 0.45, base[1] + (dy / dl) * len * 0.45];
    const mg = [lerp(base[0], mid[0], 0.6), lerp(base[1], mid[1], 0.6)];
    armsBehind.unshift(() => { P.limb([base, mid], 0.05 * h); P.limb([mid, muzzlePt], 0.022 * h); P.limb([mg, [mg[0], mg[1] + 0.06 * h]], 0.028 * h); });
  } else if (pose === 'pistolFront') {
    const hd = o.hand || T(0.24, 0.3);
    armsFront.push(() => { const el = [lerp(shR[0], hd[0], 0.5) + 0.03 * h, lerp(shR[1], hd[1], 0.5) + 0.04 * h]; P.limb([shR, el], 0.075 * h); P.limb([el, hd], 0.065 * h); P.poly([[hd[0], hd[1] - 0.02 * h], [hd[0] + 0.09 * h, hd[1] - 0.025 * h], [hd[0] + 0.09 * h, hd[1] + 0.005 * h], [hd[0] + 0.02 * h, hd[1] + 0.06 * h], [hd[0] - 0.01 * h, hd[1] + 0.05 * h]]); muzzlePt = [hd[0] + 0.09 * h, hd[1] - 0.012 * h]; });
    armsBehind.push(() => { const el = T(-0.2, 0.12); P.limb([shL, el], 0.075 * h); P.limb([el, T(-0.16, 0.0)], 0.065 * h); });
  } else if (pose === 'handsUp') {
    for (const [s, sg] of [[shL, -1], [shR, 1]]) {
      const el = T(sg * 0.25, 0.36 + (o.handsUp ?? 0.0)), hd = T(sg * 0.22, 0.52 + (o.handsUp ?? 0));
      armsFront.push(() => { P.limb([s, el], 0.075 * h); P.limb([el, hd], 0.065 * h); P.circ(hd[0], hd[1], 0.035 * h); });
    }
  } else if (pose === 'tied') {
    for (const [s, sg] of [[shL, -1], [shR, 1]]) armsBehind.push(() => { const el = T(sg * 0.17, 0.14); P.limb([s, el], 0.075 * h); P.limb([el, T(sg * 0.06, 0.04)], 0.065 * h); });
  } else if (pose === 'down') {
    for (const [s, sg] of [[shL, -1], [shR, 1]]) armsFront.push(() => { const el = T(sg * 0.17, 0.13); P.limb([s, el], 0.075 * h); P.limb([el, T(sg * 0.15, -0.02)], 0.065 * h); });
  }
  armsBehind.forEach((f) => f());
  legs();
  // torso
  const tw = o.back && o.gear === 'op' ? 0.015 : 0;
  P.poly([T(-0.09, -0.05), T(0.09, -0.05), T(0.1, 0.08), T(0.14 + tw, 0.2), T(0.15 + tw, 0.27), T(0.1, 0.315), T(-0.1, 0.315), T(-0.15 - tw, 0.27), T(-0.14 - tw, 0.2), T(-0.1, 0.08)], false, 1.2);
  P.limb([T(0, 0.3), head], 0.06 * h);
  P.circ(head[0], head[1], hr);
  const g = o.gear || 'op';
  const H_ = (pts) => P.poly(pts.map(([x, y]) => [head[0] + (x * Math.cos(tilt) - y * Math.sin(tilt)) * hr, head[1] + (x * Math.sin(tilt) + y * Math.cos(tilt)) * hr]));
  if (g === 'op') {
    H_([[-1.3, 0.25], [-1.3, -0.5], [-0.85, -1.2], [0, -1.42], [0.85, -1.2], [1.3, -0.5], [1.3, 0.25], [0.9, 0.1], [-0.9, 0.1]]);
    if (o.back) H_([[-0.45, -0.6], [0.45, -0.6], [0.4, 0.05], [-0.4, 0.05]]);
  } else if (g === 'goon') {
    H_([[-1.15, -0.1], [-1.05, -0.9], [-0.4, -1.35], [0.4, -1.35], [1.05, -0.9], [1.15, -0.1]]);
  } else if (g === 'sack') {
    // drawn separately in light colour
  }
  armsFront.forEach((f) => f());
  P.render(ctx, o.body || PAL.ink, o.body || PAL.ink, o.rim, o.rimOff || [0, -4], o.outline);

  if (o.back && o.detail) {
    const dc = o.detail;
    const a = T(-0.09, 0.27), b = T(0.09, 0.27), c = T(0.09, 0.08), e = T(-0.09, 0.08);
    spath(ctx, [a, b, c, e], 1.8, dc, true, 1);
    const s1 = T(-0.05, 0.05), s2 = T(0.05, 0.05);
    sline(ctx, s1[0], s1[1], s2[0], s2[1], 1.6, dc, 1);
    const hb1 = [head[0] - hr * 1.2, head[1] + hr * 0.05], hb2 = [head[0] + hr * 1.2, head[1] + hr * 0.05];
    sline(ctx, hb1[0], hb1[1], hb2[0], hb2[1], 1.6, dc, 1);
  }
  if (g === 'sack') {
    const sk = blobPts(head[0], head[1] - hr * 0.15, hr * 1.25, hr * 1.4, 11, 0.08, 9);
    shape(ctx, sk, o.sackCol || PAL.bone, PAL.ink, 3);
    hatch(ctx, sk, 0.9, 6, 1.4, PAL.khaki, 0.9, null, 1.2);
    sline(ctx, head[0] - hr * 0.9, head[1] + hr * 0.95, head[0] + hr * 0.9, head[1] + hr * 0.95, 4, PAL.ink, 1);
  }
  if (o.eyes) {
    for (const s of [-1, 1]) {
      const ex = head[0] + s * hr * 0.4, ey = head[1] - hr * 0.05;
      ctx.fillStyle = o.eyes; ctx.beginPath(); ctx.ellipse(ex, ey, hr * 0.2, hr * 0.12, 0, 0, TAU); ctx.fill();
    }
  }
  return { head, hr, shL, shR, muzzle: muzzlePt, hipL, hipR };
}

// ---------------------------------------------------------------- post-processing
const TEX = { paper: null, grains: [], specks: [] };
function makeTextures() {
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  // paper: warm white with fibres and blotches (multiplied over the frame)
  const p = mk(), pc = p.getContext('2d');
  pc.fillStyle = '#fbf5e8'; pc.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = sr(i, 1) * W, y = sr(i, 2) * H, rr = 80 + sr(i, 3) * 380;
    const g = pc.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(170,150,115,${0.05 + sr(i, 4) * 0.08})`); g.addColorStop(1, 'rgba(170,150,115,0)');
    pc.fillStyle = g; pc.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  pc.strokeStyle = 'rgba(120,100,70,0.16)'; pc.lineWidth = 1;
  pc.beginPath();
  for (let i = 0; i < 2600; i++) {
    const x = sr(i, 5) * W, y = sr(i, 6) * H, a = sr(i, 7) * TAU, l = 3 + sr(i, 8) * 14;
    pc.moveTo(x, y); pc.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  pc.stroke();
  TEX.paper = p;
  // grain + paper specks (screen) — a few variants that cycle with the boil
  for (let v = 0; v < 3; v++) {
    const g = document.createElement('canvas'); g.width = W / 2; g.height = H / 2;
    const gc = g.getContext('2d'); const id = gc.createImageData(g.width, g.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const n = (h32(i * 31 + v * 1000003) * 255) | 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = n; id.data[i + 3] = 255;
    }
    gc.putImageData(id, 0, 0);
    TEX.grains.push(g);
    const s = mk(), sc = s.getContext('2d');
    sc.fillStyle = 'rgba(235,224,198,0.5)';
    for (let i = 0; i < 260; i++) {
      const x = sr(i + v * 999, 11) * W, y = sr(i + v * 999, 12) * H, rr = 0.6 + sr(i + v * 999, 13) * 1.8;
      sc.beginPath(); sc.arc(x, y, rr, 0, TAU); sc.fill();
    }
    sc.strokeStyle = 'rgba(235,224,198,0.25)'; sc.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = sr(i + v * 77, 14) * W, y = sr(i + v * 77, 15) * H;
      sc.beginPath(); sc.moveTo(x, y); sc.lineTo(x + (sr(i, 16) - 0.5) * 40, y + sr(i, 17) * 160); sc.stroke();
    }
    TEX.specks.push(s);
  }
}
function post(ctx, o = {}) {
  ctx.save();
  // vignette
  const v = ctx.createRadialGradient(W / 2, H * 0.5, 380, W / 2, H * 0.5, 1180);
  v.addColorStop(0, 'rgba(10,8,6,0)'); v.addColorStop(1, `rgba(10,8,6,${o.vignette ?? 0.6})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // text-safe bands (top + bottom), kept soft so the art still reads
  const tb = o.bands ?? 0.45;
  if (tb > 0) {
    let g = ctx.createLinearGradient(0, 0, 0, 470);
    g.addColorStop(0, `rgba(12,10,8,${tb})`); g.addColorStop(1, 'rgba(12,10,8,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 470);
    g = ctx.createLinearGradient(0, 1400, 0, H);
    g.addColorStop(0, 'rgba(12,10,8,0)'); g.addColorStop(1, `rgba(12,10,8,${tb * 1.15})`);
    ctx.fillStyle = g; ctx.fillRect(0, 1400, W, H - 1400);
  }
  // paper
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.55;
  ctx.drawImage(TEX.paper, 0, 0);
  const k = ((RNG.boil % 3) + 3) % 3;
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16;
  ctx.drawImage(TEX.grains[k], 0, 0, W, H);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5;
  ctx.drawImage(TEX.specks[k], 0, 0);
  ctx.restore();
}
