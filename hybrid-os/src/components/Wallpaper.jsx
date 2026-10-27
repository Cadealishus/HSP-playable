import { useEffect, useRef, useState, useMemo } from 'react';
import { metrics } from '../os/store';

// ---------- Procedural wallpaper renderer (canvas, seeded, no external images) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Midpoint-displacement ridge, normalised to 0..1
function ridge(rand, levels, rough) {
  const n = 1 << levels;
  const a = new Float32Array(n + 1);
  a[0] = rand();
  a[n] = rand();
  let step = n;
  let amp = 1;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < n; i += step) a[i] = (a[i - half] + a[i + half]) / 2 + (rand() * 2 - 1) * amp;
    amp *= rough;
    step = half;
  }
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of a) {
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  return Array.from(a, (v) => (v - mn) / (mx - mn || 1));
}

const SPECS = {
  'midnight-lake': {
    seed: 11,
    horizon: 0.655,
    sky: [[0, '#02030c'], [0.3, '#060a26'], [0.58, '#15154f'], [0.8, '#322584'], [1, '#5b3db2']],
    glows: [[0.7, 0.98, 0.42, 'rgba(70,225,255,.45)'], [0.25, 0.95, 0.5, 'rgba(150,90,255,.42)'], [0.5, 0.45, 0.8, 'rgba(50,40,150,.22)']],
    stars: 560,
    milky: { a: -0.42, y: 0.34, c: [150, 160, 255] },
    aurora: [
      { y: 0.47, c: [70, 245, 255], amp: 0.07, h: 0.26, ph: 1.3, a: 0.2 },
      { y: 0.4, c: [165, 105, 255], amp: 0.05, h: 0.2, ph: 4.1, a: 0.16 },
    ],
    layers: [
      { base: 0.66, amp: 0.3, rough: 0.56, top: '#2b2a7d', bot: '#191856', light: 'rgba(120,205,255,.28)', haze: 'rgba(60,50,150,.35)' },
      { base: 0.78, amp: 0.36, rough: 0.54, top: '#1c1a55', bot: '#0f0e36', light: 'rgba(90,225,255,.34)', rim: 'rgba(110,235,255,.75)' },
      { base: 0.9, amp: 0.2, rough: 0.5, top: '#0d0c2c', bot: '#07071d', light: 'rgba(170,120,255,.28)', rim: 'rgba(180,140,255,.5)' },
      { base: 0.99, amp: 0.07, rough: 0.45, top: '#05061a', bot: '#030312' },
    ],
    lake: [3, 6, 28],
    ripple: [140, 225, 255],
    reflect: 0.62,
  },
  'nebula-rift': {
    seed: 23,
    horizon: 0.68,
    sky: [[0, '#05020e'], [0.35, '#160733'], [0.7, '#3f0f5c'], [1, '#7c2a7c']],
    glows: [[0.3, 0.95, 0.5, 'rgba(255,90,200,.38)'], [0.72, 0.9, 0.45, 'rgba(90,200,255,.3)']],
    nebula: [[0.3, 0.3, 0.42, [255, 80, 200]], [0.55, 0.22, 0.36, [100, 120, 255]], [0.18, 0.45, 0.3, [80, 230, 255]], [0.45, 0.5, 0.3, [190, 80, 255]]],
    stars: 640,
    planet: { x: 0.76, y: 0.28, r: 0.11 },
    layers: [
      { base: 0.72, amp: 0.3, rough: 0.58, top: '#3a1660', bot: '#24104a', light: 'rgba(255,120,220,.25)', haze: 'rgba(120,40,140,.35)' },
      { base: 0.86, amp: 0.3, rough: 0.55, top: '#1d0a3a', bot: '#110726', light: 'rgba(120,200,255,.25)', rim: 'rgba(255,120,220,.6)' },
      { base: 0.98, amp: 0.1, rough: 0.45, top: '#0a0418', bot: '#06020f' },
    ],
    lake: [10, 4, 24],
    ripple: [255, 150, 230],
    reflect: 0.58,
  },
  obsidian: {
    seed: 5,
    horizon: 0.66,
    sky: [[0, '#020203'], [0.55, '#08090c'], [0.85, '#10131b'], [1, '#18202f']],
    glows: [[0.56, 1, 0.5, 'rgba(61,139,255,.26)']],
    stars: 200,
    starDim: 0.6,
    layers: [
      { base: 0.62, amp: 0.3, rough: 0.6, top: '#1b1d23', bot: '#121318', light: 'rgba(120,170,255,.10)', haze: 'rgba(20,26,40,.35)' },
      { base: 0.76, amp: 0.38, rough: 0.56, top: '#121317', bot: '#0a0b0e', light: 'rgba(90,150,255,.16)', rim: 'rgba(80,150,255,.7)' },
      { base: 0.92, amp: 0.16, rough: 0.5, top: '#08090b', bot: '#050506' },
    ],
    lake: [4, 5, 8],
    ripple: [110, 165, 255],
    reflect: 0.5,
  },
  glacier: {
    seed: 3,
    horizon: 0.66,
    sky: [[0, '#6aa6ea'], [0.42, '#a9d0f7'], [0.78, '#e8eefa'], [1, '#ffe7dc']],
    glows: [[0.68, 0.92, 0.36, 'rgba(255,244,228,.95)'], [0.3, 0.98, 0.5, 'rgba(255,200,230,.35)']],
    clouds: true,
    stars: 0,
    layers: [
      { base: 0.6, amp: 0.32, rough: 0.58, top: '#b3c8e8', bot: '#c7d6ee', light: 'rgba(255,255,255,.7)', haze: 'rgba(225,235,250,.45)' },
      { base: 0.74, amp: 0.4, rough: 0.55, top: '#88a5d2', bot: '#a7bde0', light: 'rgba(255,255,255,.6)', rim: 'rgba(255,255,255,.9)' },
      { base: 0.9, amp: 0.2, rough: 0.5, top: '#6a88bb', bot: '#86a0cb', light: 'rgba(255,240,230,.35)' },
      { base: 0.99, amp: 0.07, rough: 0.45, top: '#56729f', bot: '#6c86b2' },
    ],
    lake: [150, 185, 228],
    ripple: [255, 255, 255],
    reflect: 0.7,
    light: true,
  },
};

function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function softDot(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawLandscape(ctx, w, h, spec) {
  const rand = rng(spec.seed);
  const hy = Math.round(h * spec.horizon);
  const u = Math.min(w, h * 1.78); // size unit, keeps detail proportional

  // Sky
  ctx.fillStyle = linear(ctx, 0, 0, 0, hy, spec.sky);
  ctx.fillRect(0, 0, w, hy + 2);

  // Nebula haze
  if (spec.nebula) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [nx, ny, nr, c] of spec.nebula) {
      for (let i = 0; i < 70; i++) {
        const x = nx * w + (rand() - 0.5) * nr * w * 1.4;
        const y = ny * hy + (rand() - 0.5) * nr * hy * 0.9;
        softDot(ctx, x, y, u * (0.03 + rand() * 0.09), c.join(','), 0.035 + rand() * 0.035);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Horizon glows
  for (const [gx, gy, gr, c] of spec.glows) {
    const g = ctx.createRadialGradient(gx * w, gy * hy, 0, gx * w, gy * hy, gr * w);
    g.addColorStop(0, c);
    g.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hy + 2);
  }

  // Clouds (daylight)
  if (spec.clouds) {
    for (let i = 0; i < 14; i++) {
      const cx = rand() * w;
      const cy = hy * (0.15 + rand() * 0.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.22);
      softDot(ctx, 0, 0, u * (0.08 + rand() * 0.14), '255,255,255', 0.28 + rand() * 0.25);
      ctx.restore();
    }
  }

  // Milky way band + stars
  if (spec.milky) {
    ctx.save();
    ctx.translate(w * 0.5, hy * spec.milky.y);
    ctx.rotate(spec.milky.a);
    ctx.scale(1, 0.16);
    softDot(ctx, 0, 0, w * 0.6, spec.milky.c.join(','), 0.14);
    ctx.restore();
  }
  const dim = spec.starDim || 1;
  for (let i = 0; i < spec.stars; i++) {
    let x = rand() * w;
    let y = Math.pow(rand(), 1.4) * hy * 0.92;
    if (spec.milky && rand() < 0.45) {
      const t = rand() - 0.5;
      const off = (rand() - 0.5) * hy * 0.16;
      x = w * 0.5 + Math.cos(spec.milky.a) * t * w * 1.2 - Math.sin(spec.milky.a) * off;
      y = hy * spec.milky.y + Math.sin(spec.milky.a) * t * w * 1.2 + Math.cos(spec.milky.a) * off;
      if (y < 0 || y > hy) continue;
    }
    const r = (rand() < 0.04 ? 1.4 : 0.35 + rand() * 0.75) * (u / 1400);
    const tint = rand();
    const col = tint < 0.15 ? '170,200,255' : tint < 0.25 ? '210,180,255' : '255,255,255';
    ctx.fillStyle = `rgba(${col},${(0.35 + rand() * 0.65) * dim * (1 - (y / hy) * 0.6)})`;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, 7);
    ctx.fill();
    if (r > 1.2 * (u / 1400)) softDot(ctx, x, y, r * 6, col, 0.25 * dim);
  }

  // Aurora curtains
  if (spec.aurora) {
    ctx.globalCompositeOperation = 'lighter';
    for (const band of spec.aurora) {
      const step = Math.max(1, Math.round(w / 900));
      for (let x = 0; x < w; x += step) {
        const t = x / w;
        const yb = hy * band.y + Math.sin(t * 6.2 + band.ph) * hy * band.amp + Math.sin(t * 17 + band.ph * 2) * hy * band.amp * 0.3;
        const hgt = hy * band.h * (0.55 + 0.45 * Math.sin(t * 9 + band.ph * 3) ** 2);
        const fade = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.05) / 0.9)));
        const stri = 0.55 + 0.45 * Math.abs(Math.sin(x * 0.045 + Math.sin(x * 0.011) * 3));
        const a = band.a * fade * stri;
        if (a < 0.01) continue;
        const g = ctx.createLinearGradient(0, yb, 0, yb - hgt);
        g.addColorStop(0, `rgba(${band.c},0)`);
        g.addColorStop(0.06, `rgba(${band.c},${a})`);
        g.addColorStop(0.35, `rgba(${band.c},${a * 0.45})`);
        g.addColorStop(1, `rgba(${band.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x, yb - hgt, step, hgt);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Ringed planet
  if (spec.planet) {
    const { x, y, r } = spec.planet;
    const px = x * w;
    const py = y * hy;
    const pr = r * u;
    const ring = (front) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-0.32);
      ctx.scale(1, 0.24);
      ctx.beginPath();
      if (front) ctx.arc(0, 0, pr * 2, 0, Math.PI);
      else ctx.arc(0, 0, pr * 2, Math.PI, Math.PI * 2);
      ctx.lineWidth = pr * 0.42;
      ctx.strokeStyle = 'rgba(255,190,240,.22)';
      ctx.stroke();
      ctx.lineWidth = pr * 0.08;
      ctx.strokeStyle = 'rgba(255,230,250,.35)';
      ctx.stroke();
      ctx.restore();
    };
    softDot(ctx, px, py, pr * 2.4, '255,120,220', 0.18);
    ring(false);
    const g = ctx.createRadialGradient(px - pr * 0.45, py - pr * 0.45, pr * 0.1, px, py, pr);
    g.addColorStop(0, '#ffc6ef');
    g.addColorStop(0.45, '#b25bd6');
    g.addColorStop(1, '#2a0d4a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, 7);
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(255,${180 + i * 8},240,${0.025 + rand() * 0.03})`;
      ctx.fillRect(px - pr, py - pr + (i / 7) * 2 * pr + rand() * 6, pr * 2, pr * 0.12);
    }
    const sh = ctx.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
    sh.addColorStop(0.35, 'rgba(10,0,30,0)');
    sh.addColorStop(1, 'rgba(10,0,30,.75)');
    ctx.fillStyle = sh;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    ctx.restore();
    ring(true);
  }

  // Mountain layers
  for (const L of spec.layers) {
    const pts = ridge(rand, 9, L.rough);
    const N = pts.length - 1;
    const lay = document.createElement('canvas');
    lay.width = w;
    lay.height = hy + 4;
    const lc = lay.getContext('2d');
    const path = new Path2D();
    path.moveTo(0, hy + 4);
    for (let i = 0; i <= N; i++) {
      const v = Math.pow(pts[i], 1.25);
      path.lineTo((i / N) * w, hy * (L.base - L.amp * v));
    }
    path.lineTo(w, hy + 4);
    path.closePath();
    const topY = hy * (L.base - L.amp);
    lc.fillStyle = linear(lc, 0, topY, 0, hy, [[0, L.top], [1, L.bot]]);
    lc.fill(path);
    lc.globalCompositeOperation = 'source-atop';
    if (L.light) {
      const gx = spec.glows[0][0] * w;
      const g = lc.createRadialGradient(gx, hy, 0, gx, hy, w * 0.55);
      g.addColorStop(0, L.light);
      g.addColorStop(1, L.light.replace(/[\d.]+\)$/, '0)'));
      lc.fillStyle = g;
      lc.fillRect(0, 0, w, hy + 4);
    }
    if (L.haze) {
      lc.fillStyle = linear(lc, 0, topY, 0, hy, [[0, 'rgba(0,0,0,0)'], [1, L.haze]]);
      lc.fillRect(0, 0, w, hy + 4);
    }
    // Broad slope shading: faces turned toward the main glow catch light, the rest fall into shadow
    const gxs = spec.glows[0][0] * w;
    const depth = hy * L.amp * 0.8;
    const ys = pts.map((v) => hy * (L.base - L.amp * Math.pow(v, 1.25)));
    const K = 26;
    for (let i = 0; i < N; i++) {
      const a0 = Math.max(0, i - K);
      const a1 = Math.min(N, i + K);
      const slope = (ys[a1] - ys[a0]) / (((a1 - a0) / N) * w);
      const x0 = (i / N) * w;
      const facing = Math.sign(gxs - x0) * -slope;
      const a = Math.min(0.22, Math.abs(facing) * 0.18);
      if (a < 0.015) continue;
      const top = ys[i];
      const g = lc.createLinearGradient(0, top, 0, top + depth);
      const c = facing > 0 ? (spec.light ? '255,255,255' : '150,205,255') : spec.light ? '40,60,110' : '0,0,12';
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      lc.fillStyle = g;
      lc.fillRect(x0, top, w / N + 0.8, depth);
    }
    lc.globalCompositeOperation = 'source-over';
    if (L.rim) {
      const rimPath = new Path2D();
      for (let i = 0; i <= N; i++) {
        const v = Math.pow(pts[i], 1.25);
        rimPath[i ? 'lineTo' : 'moveTo']((i / N) * w, hy * (L.base - L.amp * v) + 0.5);
      }
      lc.save();
      lc.strokeStyle = L.rim;
      lc.lineWidth = Math.max(1, u / 1100);
      lc.shadowColor = L.rim;
      lc.shadowBlur = u / 140;
      lc.globalAlpha = 0.75;
      const gx = spec.glows[0][0] * w;
      lc.strokeStyle = linear(lc, 0, 0, w, 0, [[0, L.rim.replace(/[\d.]+\)$/, '0.08)')], [Math.max(0, gx / w - 0.25), L.rim.replace(/[\d.]+\)$/, '0.15)')], [gx / w, L.rim], [Math.min(1, gx / w + 0.3), L.rim.replace(/[\d.]+\)$/, '0.12)')], [1, L.rim.replace(/[\d.]+\)$/, '0.05)')]]);
      lc.stroke(rimPath);
      lc.restore();
    }
    ctx.drawImage(lay, 0, 0);
  }

  // Lake: mirrored sky + mountains, tinted, with ripples
  const lakeH = h - hy;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = hy;
  src.getContext('2d').drawImage(ctx.canvas, 0, 0, w, hy, 0, 0, w, hy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hy, w, lakeH);
  ctx.clip();
  ctx.translate(0, hy);
  ctx.scale(1, -1);
  ctx.globalAlpha = spec.reflect;
  try {
    ctx.filter = `blur(${Math.max(1, u / 900)}px)`;
  } catch {}
  ctx.drawImage(src, 0, -hy, w, hy);
  ctx.filter = 'none';
  ctx.restore();
  const lk = spec.lake.join(',');
  ctx.fillStyle = linear(ctx, 0, hy, 0, h, [[0, `rgba(${lk},${spec.light ? 0.1 : 0.12})`], [0.45, `rgba(${lk},${spec.light ? 0.35 : 0.5})`], [1, `rgba(${lk},${spec.light ? 0.75 : 0.9})`]]);
  ctx.fillRect(0, hy, w, lakeH);

  // Light column under the main glow + ripple strokes
  const gx = spec.glows[0][0] * w;
  const rp = spec.ripple.join(',');
  for (let i = 0; i < 520; i++) {
    const t = rand();
    const y = hy + Math.pow(t, 1.6) * lakeH;
    const near = rand() < 0.55;
    const cx = near ? gx + (rand() - 0.5) * w * 0.22 * (0.3 + t) : rand() * w;
    const len = u * (0.01 + rand() * 0.06) * (0.4 + t);
    const a = (near ? 0.22 : 0.08) * (1 - t * 0.6) * (0.4 + rand() * 0.6);
    ctx.fillStyle = `rgba(${rp},${a})`;
    ctx.fillRect(cx - len / 2, y, len, Math.max(1, u / 1600) * (0.6 + t));
  }
  // Horizon seam
  ctx.fillStyle = linear(ctx, 0, 0, w, 0, [[0, `rgba(${rp},0)`], [gx / w, `rgba(${rp},${spec.light ? 0.5 : 0.35})`], [1, `rgba(${rp},0)`]]);
  ctx.fillRect(0, hy - 1, w, Math.max(1, u / 900));

  // Shoreline
  const shore = ridge(rand, 7, 0.5);
  ctx.fillStyle = spec.light ? 'rgba(60,84,124,.55)' : 'rgba(1,1,8,.85)';
  ctx.beginPath();
  ctx.moveTo(0, h);
  shore.forEach((v, i) => ctx.lineTo((i / (shore.length - 1)) * w, h - h * (0.012 + v * 0.03 * (Math.abs(i / shore.length - 0.5) * 2.4))));
  ctx.lineTo(w, h);
  ctx.fill();

  // Vignette
  const vg = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, spec.light ? 'rgba(30,50,90,.18)' : 'rgba(0,0,6,.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// Windows-inspired bloom: folded translucent ribbons around a centre point
function drawBloom(ctx, w, h, light) {
  const u = Math.min(w, h * 1.78);
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
  if (light) {
    bg.addColorStop(0, '#e9f2fd');
    bg.addColorStop(0.55, '#c6dbf5');
    bg.addColorStop(1, '#9fbfe8');
  } else {
    bg.addColorStop(0, '#0d3478');
    bg.addColorStop(0.5, '#061a44');
    bg.addColorStop(1, '#020818');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.6;
  const petals = [
    [-2.55, 0.95, 0.9],
    [-2.05, 1.12, 1],
    [-1.57, 1.22, 1],
    [-1.09, 1.12, 1],
    [-0.59, 0.95, 0.9],
    [-2.95, 0.7, 0.7],
    [-0.19, 0.7, 0.7],
  ];
  ctx.globalCompositeOperation = light ? 'multiply' : 'screen';
  for (const [ang, len, wd] of petals) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.scale(1, 0.92);
    const L = u * 0.23 * len;
    const W = u * 0.06 * wd;
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(L * 0.3, -W * 1.6, L * 0.8, -W * 1.2, L, 0);
    p.bezierCurveTo(L * 0.75, W * 0.9, L * 0.35, W * 1.2, 0, 0);
    const g = ctx.createLinearGradient(0, 0, L, 0);
    if (light) {
      g.addColorStop(0, 'rgba(0,70,200,.95)');
      g.addColorStop(0.6, 'rgba(40,130,240,.75)');
      g.addColorStop(1, 'rgba(140,200,255,.5)');
    } else {
      g.addColorStop(0, 'rgba(20,90,255,.95)');
      g.addColorStop(0.6, 'rgba(40,150,255,.8)');
      g.addColorStop(1, 'rgba(130,220,255,.75)');
    }
    ctx.fillStyle = g;
    ctx.shadowColor = light ? 'rgba(0,60,180,.35)' : 'rgba(40,140,255,.6)';
    ctx.shadowBlur = u / 40;
    ctx.fill(p);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = Math.max(1, u / 900);
    ctx.stroke(p);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  softDot(ctx, cx, cy, u * 0.12, light ? '255,255,255' : '120,200,255', light ? 0.5 : 0.35);
}

export function renderWallpaper(canvas, id, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (id === 'bloom-dark' || id === 'bloom-light') drawBloom(ctx, w, h, id === 'bloom-light');
  else drawLandscape(ctx, w, h, SPECS[id] || SPECS['midnight-lake']);
}

const thumbCache = new Map();
export function wallpaperThumb(id, w = 192, h = 108) {
  const key = `${id}:${w}x${h}`;
  if (!thumbCache.has(key)) {
    const c = document.createElement('canvas');
    renderWallpaper(c, id, w * 2, h * 2);
    thumbCache.set(key, c.toDataURL('image/jpeg', 0.85));
  }
  return thumbCache.get(key);
}

export const hasStars = (id) => (SPECS[id]?.stars || 0) > 0;

// ---------- Live wallpaper layer ----------
function WallCanvas({ id, W, H, entering }) {
  const ref = useRef(null);
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const t = setTimeout(() => renderWallpaper(ref.current, id, Math.round(W * metrics.scale * dpr), Math.round(H * metrics.scale * dpr)), entering ? 0 : 120);
    return () => clearTimeout(t);
  }, [id, W, H]);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      style={entering ? { animation: 'wpIn calc(var(--anim) * 900ms) cubic-bezier(.2,.8,.3,1) both' } : undefined}
    />
  );
}

function Twinkles({ seed }) {
  const stars = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 34 }, () => ({ x: r() * 100, y: r() * 52, s: 1 + r() * 2, d: r() * 6, t: 2.5 + r() * 4 }));
  }, [seed]);
  const [shot, setShot] = useState(null);
  useEffect(() => {
    let t;
    const fire = () => {
      setShot({ k: Date.now(), x: 15 + Math.random() * 60, y: 4 + Math.random() * 22, ang: `${18 + Math.random() * 18}deg` });
      t = setTimeout(fire, 7000 + Math.random() * 9000);
    };
    t = setTimeout(fire, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, boxShadow: '0 0 6px 1px rgba(180,220,255,.7)', animation: `twinkle ${s.t}s ${s.d}s infinite ease-in-out` }}
        />
      ))}
      {shot && (
        <span
          key={shot.k}
          className="absolute h-px w-28"
          style={{ left: `${shot.x}%`, top: `${shot.y}%`, '--ang': shot.ang, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(200,240,255,.95))', transformOrigin: '0 0', animation: 'shoot 1.6s ease-out both' }}
        />
      )}
    </div>
  );
}

export default function Wallpaper({ id, W, H, motion = 1 }) {
  const [layers, setLayers] = useState([{ id, k: 0 }]);
  const wrap = useRef(null);
  useEffect(() => {
    if (layers[layers.length - 1].id === id) return;
    setLayers((l) => [...l.slice(-1), { id, k: Date.now() }]);
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 1200);
    return () => clearTimeout(t);
  }, [id]);

  // Subtle parallax that follows the pointer
  useEffect(() => {
    if (!motion) return;
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!wrap.current) return;
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        wrap.current.style.transform = `scale(1.03) translate(${(-nx * 10 * motion).toFixed(2)}px, ${(-ny * 6 * motion).toFixed(2)}px)`;
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [motion]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#03040c' }}>
      <div ref={wrap} className="absolute inset-0" style={{ transform: 'scale(1.03)', transition: 'transform 600ms cubic-bezier(.2,.8,.3,1)' }}>
        {layers.map((l, i) => (
          <WallCanvas key={l.k} id={l.id} W={W} H={H} entering={i > 0} />
        ))}
        {motion > 0 && hasStars(id) && <Twinkles seed={id.length * 7} />}
      </div>
    </div>
  );
}
