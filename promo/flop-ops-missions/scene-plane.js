'use strict';
// SCENE 1 — PLANE RAID. One-point-perspective rush down a hijacked airliner aisle under red emergency light.

const SCENES = window.SCENES = window.SCENES || {};

function backRunner(ctx, cam, x, z, phase, o = {}) {
  const pf = cam.p(x, 1.45, z);
  if (!pf) return null;
  const s = pf[2], h = 1.8 * s * (o.crouch ? 0.92 : 1);
  const floor = pf[1];
  const run = o.run ?? 1;
  const bob = Math.abs(Math.cos(phase)) * 0.025 * h * run;
  const hip = [pf[0] + Math.sin(phase) * 0.012 * h * run, floor - 0.52 * h + bob];
  const lift = (p) => Math.max(0, Math.sin(p)) * run;
  const lL = lift(phase), lR = lift(phase + Math.PI);
  const fL = [hip[0] - 0.075 * h + lL * 0.03 * h, floor - 0.03 * h - lL * 0.2 * h];
  const fR = [hip[0] + 0.075 * h - lR * 0.03 * h, floor - 0.03 * h - lR * 0.2 * h];
  return frontFigure(ctx, Object.assign({
    x: hip[0], y: hip[1], h, back: true, fL, fR, tilt: Math.sin(phase) * 0.035 * run + (o.tilt || 0),
    arms: 'rifleBack', gear: 'op',
  }, o));
}

SCENES.plane = {
  dur: 2.6,
  draw(ctx, t, tq) {
    const ZE = 13.5;
    const camz = -0.2 + 1.2 * t + 1.6 * ease.inOut(seg(t, 0, 2.6));
    const firing = (tq >= 1.16 && tq < 1.42) || (tq >= 1.66 && tq < 1.92);
    const flashOn = firing && Math.round(tq * 12) % 2 === 0;
    const [sx, sy] = shake(t, 8, 6, 3);
    const [fx, fy] = flashOn ? shake(t, 12, 40, 9) : [0, 0];
    const bob = Math.abs(Math.sin(t * Math.PI * 2.8)) * 0.035;
    const cam = new Cam3({ x: 0.05 * Math.sin(t * 1.3), y: -0.32 + bob, z: camz, f: 950, cx: 540, cy: 880 });
    const roll = -0.05 + 0.03 * Math.sin(t * 2.0) + 0.01 * Math.sin(t * 13);
    const alarm = 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(tq * TAU * 1.4), 2);
    const storm = tq > 0.5 && tq < 0.67 ? 1 : 0;

    ctx.fillStyle = PAL.redDD; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(540 + sx + fx, 960 + sy + fy); ctx.rotate(roll); ctx.scale(1.1, 1.1); ctx.translate(-540, -960);
    RNG.J = 2.2;

    const fogCol = '#1c0705';
    const fog = (col, z) => mix(col, fogCol, clamp((z - cam.z - 2.5) / 13) * 0.75);
    const lw = (s, k = 1) => clamp(s * 0.0055 * k, 1.1, 7);

    // ---- cockpit through the open door
    seed(1);
    const door = [[-0.42, -0.62, ZE], [0.42, -0.62, ZE], [0.42, 1.45, ZE], [-0.42, 1.45, ZE]];
    const dp = cam.poly(door);
    if (dp) {
      const [x0, y0, x1, y1] = bbox(dp);
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, PAL.amber); g.addColorStop(0.45, PAL.red); g.addColorStop(1, PAL.redD);
      ctx.fillStyle = g; ctx.fillRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
      // windscreen frames far inside
      for (const wx of [-1.0, -0.15, 0.7]) {
        const q = cam.poly([[wx, -0.3, ZE + 3], [wx + 0.12, -0.3, ZE + 3], [wx + 0.25, 0.5, ZE + 3], [wx + 0.13, 0.5, ZE + 3]]);
        if (q) sfill(ctx, q, PAL.redD);
      }
      const dash = cam.poly([[-1.5, 0.45, ZE + 2.6], [1.5, 0.45, ZE + 2.6], [1.5, 1.6, ZE + 2.6], [-1.5, 1.6, ZE + 2.6]]);
      if (dash) sfill(ctx, dash, PAL.redDD);
      glow(ctx, (x0 + x1) / 2, y0 + (y1 - y0) * 0.3, (x1 - x0) * 1.6, PAL.amber, 0.35);
    }
    // ---- hijacker in the doorway, ducks when the shooting starts
    seed(2);
    const duck = ease.out(seg(tq, 1.3, 1.6));
    const hp = cam.p(0.05 + duck * 0.42, 1.45, ZE + 0.7);
    if (hp) {
      const s = hp[2], h = 1.78 * s;
      const fl = frontFigure(ctx, {
        x: hp[0], y: hp[1] - 0.52 * h + duck * 0.18 * h, h, gear: 'goon', arms: 'pistolFront', tilt: duck * 0.35,
        hand: [hp[0] + 0.25 * h - duck * 0.1 * h, hp[1] - 0.83 * h + duck * 0.2 * h],
        body: PAL.ink, rim: PAL.amber, rimOff: [-3, -3],
      });
      if (tq >= 0.75 && tq < 0.92 && fl.muzzle) muzzle(ctx, fl.muzzle[0], fl.muzzle[1], 0.4, s * 0.18);
    }
    // ---- bulkhead with door hole
    seed(3);
    const prof = [[-1.75, 1.45], [-1.9, 0.6], [-1.9, -0.3], [-1.85, -0.38], [-1.0, -0.38], [-1.0, -0.98], [1.0, -0.98], [1.0, -0.38], [1.85, -0.38], [1.9, -0.3], [1.9, 0.6], [1.75, 1.45]];
    const bh = cam.poly(prof.map(([x, y]) => [x, y, ZE]));
    if (bh && dp) {
      ctx.fillStyle = fog(PAL.redD, ZE);
      ctx.beginPath(); tracePts(ctx, bh, 0.5); tracePts(ctx, dp.slice().reverse(), 0.5); ctx.fill('evenodd');
      spath(ctx, dp, 3, PAL.ink, true);
      hatch(ctx, bh, 0.7, 7, 1.2, PAL.redDD, 0.8);
    }

    // ---- cabin shell, sliced in depth for fog
    const z0 = cam.z + 0.1;
    const slices = [];
    for (let z = z0; z < ZE; z += 1.64) slices.push([z, Math.min(ZE, z + 1.64)]);
    const surfCol = (i) => {
      const [a, b] = [prof[i], prof[i + 1]];
      if (a[1] === 1.45 && b[1] === 1.45) return '#2c0b08';
      if (a[1] === -0.98 && b[1] === -0.98) return '#190605';
      if (a[1] === -0.38 && b[1] === -0.38) return '#330d09';
      if (Math.abs(a[0]) === 1.0 && Math.abs(b[0]) === 1.0) return mix('#4a120c', PAL.redM, 0.25 * alarm);
      return '#3d0f0b';
    };
    for (let si = slices.length - 1; si >= 0; si--) {
      const [za, zb] = slices[si];
      seed(100 + si);
      for (let i = 0; i < prof.length - 1; i++) {
        const [a, b] = [prof[i], prof[i + 1]];
        const q = cam.poly([[a[0], a[1], za], [b[0], b[1], za], [b[0], b[1], zb], [a[0], a[1], zb]]);
        if (q) sfill(ctx, q, fog(surfCol(i), (za + zb) / 2), 0.4);
      }
    }
    // ceiling strip light
    seed(5);
    const strip = cam.poly([[-0.07, -0.975, z0], [0.07, -0.975, z0], [0.07, -0.975, ZE], [-0.07, -0.975, ZE]]);
    if (strip) {
      sfill(ctx, strip, mix(PAL.redD, PAL.red, alarm * 0.8), 0.5);
      const a = cam.p(0, -0.97, z0 + 0.4), b = cam.p(0, -0.97, ZE);
      if (a && b) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(PAL.red, 0.14 * alarm); ctx.lineCap = 'round';
        for (const w of [60, 26, 10]) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        ctx.restore();
      }
    }
    // ceiling panel seams
    seed(9);
    for (let z = Math.ceil(z0); z < ZE; z += 1.0) {
      const a = cam.p(-1.0, -0.98, z), b = cam.p(1.0, -0.98, z);
      if (a && b) sline(ctx, a[0], a[1], b[0], b[1], lw(a[2], 0.6), fog(PAL.ink, z));
    }
    // bin seams + floor aisle
    seed(6);
    for (let z = 1.2; z < ZE; z += 1.64) {
      if (z < z0) continue;
      for (const sgn of [-1, 1]) {
        const a = cam.p(sgn * 1.0, -0.98, z), b = cam.p(sgn * 1.0, -0.38, z);
        if (a && b) sline(ctx, a[0], a[1], b[0], b[1], lw(a[2], 0.6), fog(PAL.ink, z));
        const c = cam.p(sgn * 1.0, -0.42, z + 0.8);
        if (c) sline(ctx, c[0] - c[2] * 0.0, c[1], c[0], c[1] - c[2] * 0.08, lw(c[2], 0.5), fog(PAL.ink, z));
      }
    }
    const aisle = cam.poly([[-0.33, 1.45, z0], [0.33, 1.45, z0], [0.33, 1.45, ZE], [-0.33, 1.45, ZE]]);
    if (aisle) { sfill(ctx, aisle, '#1e0705'); hatch(ctx, aisle, 1.45, 9, 1.4, PAL.ink, 0.7); }
    for (let z = Math.ceil(z0 / 0.6) * 0.6; z < ZE; z += 0.6) {
      for (const sgn of [-1, 1]) {
        const p = cam.p(sgn * 0.36, 1.43, z);
        if (!p) continue;
        const rr = clamp(p[2] * 0.03, 1.5, 14);
        glow(ctx, p[0], p[1], rr * 5, PAL.red, 0.5 * alarm);
        ctx.fillStyle = mix(PAL.red, PAL.hot, 0.3 * alarm); ctx.beginPath(); ctx.ellipse(p[0], p[1], rr, rr * 0.5, 0, 0, TAU); ctx.fill();
      }
    }
    // shell edges (strong perspective lines)
    seed(7);
    for (let i = 0; i < prof.length; i++) {
      const [x, y] = prof[i];
      const a = cam.p(x, y, z0 + 0.05), b = cam.p(x, y, ZE);
      if (a && b) sline(ctx, a[0], a[1], b[0], b[1], 4.5, PAL.ink, 3);
    }
    // windows
    seed(8);
    for (let z = 1.9; z < ZE - 0.4; z += 0.82) {
      if (z < z0 + 0.2) continue;
      for (const sgn of [-1, 1]) {
        const pts = [];
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU;
          const p = cam.p(sgn * 1.9, 0.08 + Math.sin(a) * 0.17, z + Math.cos(a) * 0.12);
          if (p) pts.push(p);
        }
        if (pts.length < 10) continue;
        const wc = storm ? PAL.steelL : (sr(z * 10, sgn) > 0.8 ? PAL.amberD : PAL.slateD);
        shape(ctx, pts, fog(wc, z), PAL.ink, lw(pts[0][2], 0.6));
      }
    }

    // ---- drawables sorted by depth
    const items = [];
    const ROW0 = 1.6, PITCH = 0.82;
    for (let i = 0; ROW0 + i * PITCH < ZE - 1.2; i++) {
      const z = ROW0 + i * PITCH;
      if (z < cam.z + 0.25) continue;
      for (const sgn of [-1, 1]) {
        items.push({ z: z + 0.001, f: () => drawSeats(ctx, cam, z, sgn, i, fog, lw, alarm) });
        if (sr(i, sgn + 5) > 0.45) items.push({ z: z + 0.32, f: () => drawPassenger(ctx, cam, z + 0.32, sgn, i, fog, lw, tq) });
        if (sr(i, sgn + 9) > 0.25) items.push({ z: z + 0.25, f: () => drawMask(ctx, cam, z + 0.25, sgn, i, fog, lw, tq, roll) });
      }
    }
    // operators: big over-the-shoulder pair framing the aisle
    const ph = tq * TAU * 2.4;
    const firingRun = firing ? 0.2 : 1;
    const leadZ = cam.z + 1.75 + 0.25 * t - 0.15 * ease.out(seg(tq, 1.1, 1.4));
    const opB = cam.z + 1.45 + 0.12 * t;
    let leadInfo = null;
    const vp = cam.p(0.05, 0.2, ZE);
    items.push({ z: leadZ, f: () => { seed(30); leadInfo = backRunner(ctx, cam, -0.52, leadZ, ph, { body: PAL.ink, rim: flashOn ? PAL.amber : PAL.red, rimOff: [5, -6], detail: '#4a1812', vp, rifleLen: 0.3, run: firingRun, tilt: 0.05 }); } });
    items.push({ z: opB, f: () => { seed(31); backRunner(ctx, cam, 0.56, opB, ph + 2.6, { body: PAL.ink, rim: PAL.red, rimOff: [-6, -6], detail: '#4a1812', vp, rifleLen: 0.26, tilt: -0.06 }); } });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.f();

    // ---- gunfire
    if (firing && leadInfo && leadInfo.muzzle) {
      const m = leadInfo.muzzle;
      seed(40);
      const tgt = cam.p(0.1 + rs() * 0.25, 0.3 + rs() * 0.4, ZE);
      if (tgt) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(PAL.amber, 0.8); ctx.lineWidth = 5; ctx.lineCap = 'round';
        const u0 = 0.15 + r() * 0.3;
        ctx.beginPath(); ctx.moveTo(lerp(m[0], tgt[0], u0), lerp(m[1], tgt[1], u0)); ctx.lineTo(lerp(m[0], tgt[0], u0 + 0.35), lerp(m[1], tgt[1], u0 + 0.35)); ctx.stroke();
        ctx.restore();
        // sparks on the door frame
        for (let k = 0; k < 7; k++) { const a = r() * TAU, L = 10 + r() * 30; sline(ctx, tgt[0], tgt[1], tgt[0] + Math.cos(a) * L, tgt[1] + Math.sin(a) * L, 2, PAL.amber, 1); }
      }
      if (flashOn) {
        muzzle(ctx, m[0], m[1], -Math.PI / 2, 46, true);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba(PAL.amber, 0.16); ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      // ejected casings
      for (let k = 0; k < 3; k++) {
        const u = (tq * 12 + k * 0.33) % 1;
        const cx = m[0] + 40 + u * 260, cy = m[1] + 60 - Math.sin(u * Math.PI) * 120 + u * 140;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(u * 9 + k);
        shape(ctx, [[-7, -3], [7, -3], [7, 3], [-7, 3]], PAL.amber, PAL.ink, 1.5); ctx.restore();
      }
    }
    // ---- haze + speed lines
    seed(50);
    for (let k = 0; k < 6; k++) {
      const z = cam.z + 4 + ((k * 2.3 + t * 0.6) % 12);
      const p = cam.p(-1.2 + sr(k, 1) * 2.4, -0.6 + sr(k, 2) * 0.4, z);
      if (p) {
        ctx.save(); ctx.globalAlpha = 0.45;
        puff(ctx, p[0], p[1], p[2] * (0.35 + sr(k, 3) * 0.3), fog('#5c1a12', z), fog('#3a0d09', z), null, k);
        ctx.restore();
      }
    }
    ctx.restore();
    seed(60);
    speedRadial(ctx, 540, 905, 26, 520, 1300, PAL.ink, 7, 0.55);
    speedRadial(ctx, 540, 905, 10, 560, 1200, PAL.red, 3, 0.35);
    // under-light shadow for bottom text area
    const g = ctx.createLinearGradient(0, 1250, 0, H);
    g.addColorStop(0, 'rgba(20,6,4,0)'); g.addColorStop(1, 'rgba(20,6,4,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 1250, W, H - 1250);
  },
};

function drawSeats(ctx, cam, z, sgn, row, fog, lw, alarm) {
  seed(1000 + row * 3 + sgn);
  const face = fog(mix('#3b0f0b', '#6a1a12', 0.35 * alarm), z);
  // dark void under the seats
  const v = cam.poly([[sgn * 0.37, 0.95, z + 0.2], [sgn * 1.78, 0.95, z + 0.2], [sgn * 1.78, 1.45, z + 0.2], [sgn * 0.37, 1.45, z + 0.2]]);
  if (v) sfill(ctx, v, fog('#120403', z));
  // armrest on the aisle side
  const a = cam.p(sgn * 0.37, 0.78, z), b = cam.p(sgn * 0.37, 0.8, z + 0.5);
  if (a && b) sline(ctx, a[0], a[1], b[0], b[1], lw(a[2], 2.2), fog('#2a0907', z));
  for (let k = 0; k < 3; k++) {
    const c = sgn * (0.6 + 0.46 * k);
    const pr = [[-0.22, 0.98], [-0.22, 0.29], [-0.19, 0.235], [-0.15, 0.22], [-0.15, 0.1], [-0.1, 0.06], [0.1, 0.06], [0.15, 0.1], [0.15, 0.22], [0.19, 0.235], [0.22, 0.29], [0.22, 0.98]];
    const q = cam.poly(pr.map(([x, y]) => [c + x, y, z]));
    if (!q) continue;
    const s = q[0][2];
    shape(ctx, q, face, PAL.ink, lw(s, 0.9));
    // top surface of the headrest catching the ceiling light
    const tp = cam.poly([[c - 0.1, 0.06, z], [c + 0.1, 0.06, z], [c + 0.1, 0.06, z + 0.1], [c - 0.1, 0.06, z + 0.1]]);
    if (tp) sfill(ctx, tp, fog(mix(PAL.redM, PAL.red, alarm), z), 0.5);
    const t1 = q[4], t2 = q[7];
    sline(ctx, t1[0], t1[1] + 1, t2[0], t2[1] + 1, lw(s, 1.0), fog(mix(PAL.redM, PAL.red, alarm), z), 1);
    const lower = cam.poly([[c - 0.22, 0.6, z], [c + 0.22, 0.6, z], [c + 0.22, 0.98, z], [c - 0.22, 0.98, z]]);
    if (lower && s > 60) hatch(ctx, lower, 0.6 + sgn * 0.2, clamp(s * 0.035, 4, 14), lw(s, 0.35), PAL.ink, 0.85);
    // seat-back pocket line
    const p1 = cam.p(c - 0.17, 0.55, z), p2 = cam.p(c + 0.17, 0.55, z);
    if (p1 && p2) sline(ctx, p1[0], p1[1], p2[0], p2[1], lw(s, 0.5), fog(PAL.ink, z));
  }
}
function drawPassenger(ctx, cam, z, sgn, row, fog, lw, tq) {
  seed(2000 + row * 3 + sgn);
  const k = (sr(row, sgn + 20) * 3) | 0;
  const c = sgn * (0.59 + 0.46 * k);
  const handsUp = sr(row, sgn + 30) > 0.55;
  const p = cam.p(c, 0.2, z);
  if (!p) return;
  const s = p[2], col = fog('#2a0907', z);
  if (handsUp) {
    const wig = Math.sin(tq * 9 + row) * 0.03;
    for (const sd of [-1, 1]) {
      const a = cam.p(c + sd * 0.1, 0.3, z), b = cam.p(c + sd * (0.2 + wig), -0.12, z);
      if (a && b) { ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      if (b) { sfill(ctx, circlePts(b[0], b[1], s * 0.045, 8), col); }
    }
  }
  const hd = blobPts(p[0], p[1] - s * 0.04, s * 0.11, s * 0.12, 10, 0.06, row + sgn);
  sfill(ctx, hd, col);
  spath(ctx, hd.slice(6, 10), lw(s, 0.8), fog(PAL.redM, z));
}
function drawMask(ctx, cam, z, sgn, row, fog, lw, tq, roll) {
  seed(3000 + row * 3 + sgn);
  const x = sgn * (1.15 + sr(row, sgn) * 0.4);
  const sw = 0.35 * Math.sin(tq * 4.2 + row * 1.7 + sgn) - roll * 3;
  const a = cam.p(x, -0.38, z);
  const len = 0.36 + sr(row, sgn + 3) * 0.12;
  const b = cam.p(x + Math.sin(sw) * len, -0.38 + Math.cos(sw) * len, z);
  if (!a || !b) return;
  const s = a[2];
  sline(ctx, a[0], a[1], b[0], b[1], lw(s, 0.35), fog(PAL.ink, z), 1);
  ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(-sw * 0.8);
  const m = [[-0.05, 0], [0.05, 0], [0.065, 0.07], [-0.065, 0.07]].map(([u, v]) => [u * s, v * s]);
  shape(ctx, m, fog(PAL.bone, z), PAL.ink, lw(s, 0.5));
  ctx.restore();
}
