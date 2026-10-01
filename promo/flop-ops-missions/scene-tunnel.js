'use strict';
// SCENE 2 — UNDERGROUND SURVIVAL. Cut-away earth: tilt down from the surface into a black tunnel,
// one fighter in the middle, gas-masked enemies closing from both sides.

const TUN = { top: 1230, bot: 1780 };
let DARK = null;

function cam2(ctx, cx, cy, z, roll, sh) {
  ctx.translate(W / 2 + sh[0], H / 2 + sh[1]); ctx.rotate(roll); ctx.scale(z, z); ctx.translate(-cx, -cy);
}
function walker(ctx, x, floor, h, dir, ph, o) {
  const hip = [x, floor - 0.5 * h + Math.abs(Math.cos(ph)) * 0.015 * h];
  const st = (p) => [x + dir * Math.sin(p) * 0.13 * h, floor - 0.02 * h - Math.max(0, Math.cos(p)) * 0.06 * h];
  return sideFigure(ctx, Object.assign({ x: hip[0], y: hip[1], h, dir, fN: st(ph), fF: st(ph + Math.PI), lean: 0.08 }, o));
}

SCENES.tunnel = {
  dur: 2.6, seed: 2,
  draw(ctx, t, tq) {
    if (!DARK) { DARK = document.createElement('canvas'); DARK.width = W; DARK.height = H; }
    const tilt = ease.inOut(seg(t, 0.0, 0.6));
    const push = ease.inOut(seg(t, 0.6, 2.6));
    const cy = lerp(-380, 1505, tilt) + push * 10;
    const zoom = lerp(0.95, 1.0, tilt) + push * 0.1 + ease.in(seg(t, 2.2, 2.6)) * 0.1;
    const land = seg(t, 0.58, 0.8);
    const shA = 4 + (land > 0 && land < 1 ? (1 - land) * 22 : 0) + (tq > 2.2 ? 6 : 0);
    const sh = shake(t, shA, 9, 21);
    const roll = 0.03 * Math.sin(t * 1.3) - 0.02;
    const camT = (c) => cam2(c, 0, cy, zoom, roll, sh);

    ctx.fillStyle = PAL.oliveDD; ctx.fillRect(0, 0, W, H);
    ctx.save(); camT(ctx);
    RNG.J = 2.2;

    // ---- sky + surface (only seen during the tilt)
    if (cy < 600) {
      seed(1);
      ctx.fillStyle = PAL.slateD; ctx.fillRect(-1500, -2000, 3000, 2000);
      const mp = blobPts(300, -760, 120, 120, 16, 0.02, 4);
      glow(ctx, 300, -760, 420, PAL.bone, 0.25);
      shape(ctx, mp, PAL.bone, PAL.ink, 3);
      hatch(ctx, mp, 2.2, 9, 1.6, PAL.khaki, 0.8);
      for (let i = -9; i <= 9; i++) {
        const bw = 120 + sr(i, 1) * 120, bh = 160 + sr(i, 2) * 520, x = i * 155 + sr(i, 3) * 30;
        const b = [[x, 0], [x, -bh], [x + bw * 0.4, -bh - (sr(i, 4) > 0.6 ? 60 : 0)], [x + bw, -bh + sr(i, 5) * 80], [x + bw, 0]];
        shape(ctx, b, i % 2 ? PAL.ink : PAL.ink2, PAL.ink, 3);
        for (let k = 0; k < 6; k++) if (sr(i, 10 + k) > 0.7) {
          const wx = x + 20 + sr(i, 20 + k) * (bw - 50), wy = -40 - sr(i, 30 + k) * (bh - 80);
          sfill(ctx, [[wx, wy], [wx + 16, wy], [wx + 16, wy + 22], [wx, wy + 22]], PAL.amberD, 1);
        }
      }
    }
    // ---- earth strata
    seed(2);
    const bands = [[0, '#33381f'], [210, '#2a2e1a'], [560, '#22261a'], [930, '#1b1e14'], [1900, '#1b1e14']];
    for (let i = 0; i < bands.length - 1; i++) {
      const y0 = bands[i][0], y1 = bands[i + 1][0];
      const pts = [];
      for (let x = -1500; x <= 1500; x += 150) pts.push([x, y0 + (i ? (sr(x, i) - 0.5) * 40 : 0)]);
      for (let x = 1500; x >= -1500; x -= 150) pts.push([x, y1 + (sr(x, i + 1) - 0.5) * 40]);
      sfill(ctx, pts, bands[i][1], 1);
      if (Math.abs((y0 + y1) / 2 - cy) < 1600 / zoom) hatch(ctx, pts, 0.5 + i * 0.6, 26 - i * 4, 1.6, PAL.ink, 0.55, null, 2, 0.5);
      spath(ctx, pts.slice(0, 21), 3, PAL.ink, false);
    }
    // grass/rubble on the surface
    for (let x = -1400; x < 1400; x += 40) sline(ctx, x, 0, x + rs() * 10, -12 - r() * 16, 2, PAL.ink, 1);
    // rocks, roots, an old pipe
    for (let i = 0; i < 40; i++) {
      const x = -1400 + sr(i, 40) * 2800, y = 60 + sr(i, 41) * 2100;
      if (y > TUN.top - 90 && y < TUN.bot + 90) continue;
      const rr = 18 + sr(i, 42) * 50;
      const rp = blobPts(x, y, rr * 1.3, rr, 9, 0.25, i);
      shape(ctx, rp, PAL.olive, PAL.ink, 3);
      ctx.save(); ctx.beginPath(); tracePts(ctx, rp, 0); ctx.clip();
      sfill(ctx, blobPts(x + rr * 0.4, y + rr * 0.45, rr * 1.2, rr, 8, 0.2, i + 1), PAL.oliveD, 1); ctx.restore();
    }
    for (let i = 0; i < 9; i++) {
      let x = -1200 + i * 300 + sr(i, 50) * 100, y = 0;
      const pts = [[x, y]];
      for (let k = 0; k < 5; k++) { x += (sr(i, 51 + k) - 0.5) * 70; y += 40 + sr(i, 60 + k) * 50; pts.push([x, y]); }
      spath(ctx, pts, 3, PAL.ink, false);
    }
    const pipe = [[-1500, 760], [1500, 700], [1500, 760], [-1500, 820]];
    shape(ctx, pipe, PAL.steel, PAL.ink, 3.5);
    hatch(ctx, [[-1500, 795], [1500, 735], [1500, 760], [-1500, 820]], 0.4, 7, 1.4, PAL.ink, 0.9);
    for (let x = -1400; x < 1500; x += 240) sline(ctx, x, 760 - x * 0.02 - 2, x, 820 - x * 0.02 + 2, 4, PAL.ink, 1);

    // ---- tunnel shell
    seed(3);
    const T0 = TUN.top, T1 = TUN.bot;
    shape(ctx, [[-1600, T0 - 70], [1600, T0 - 70], [1600, T1 + 60], [-1600, T1 + 60]], '#3b3f33', PAL.ink, 5);
    hatch(ctx, [[-1600, T0 - 70], [1600, T0 - 70], [1600, T0], [-1600, T0]], 0.9, 8, 1.4, PAL.ink, 0.9);
    hatch(ctx, [[-1600, T1], [1600, T1], [1600, T1 + 60], [-1600, T1 + 60]], -0.9, 8, 1.4, PAL.ink, 0.9);
    sfill(ctx, [[-1600, T0], [1600, T0], [1600, T1], [-1600, T1]], '#20262b', 1);
    // ribs + arches
    for (let x = -1560; x < 1600; x += 260) {
      const rib = [[x, T0], [x + 46, T0], [x + 46, T1], [x, T1]];
      shape(ctx, rib, '#2b3238', PAL.ink, 3);
      hatch(ctx, rib, 1.4, 6, 1.3, PAL.ink, 0.8);
      const ar = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; ar.push([x + 46 + 107 + Math.cos(a) * 107, T0 + 70 + Math.sin(a) * 60]); }
      spath(ctx, ar, 2.5, PAL.ink, false);
    }
    // cables sagging along the wall
    for (const [cyy, s] of [[T0 + 105, 0], [T0 + 130, 1]]) {
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4 - s; ctx.beginPath();
      for (let x = -1560; x < 1600; x += 260) { ctx.moveTo(x + 23, cyy); ctx.quadraticCurveTo(x + 153, cyy + 40 + s * 12, x + 283, cyy); }
      ctx.stroke();
    }
    // floor + puddles
    shape(ctx, [[-1600, T1 - 18], [1600, T1 - 18], [1600, T1], [-1600, T1]], '#2c3328', PAL.ink, 3);
    for (const px of [-760, -180, 420, 980]) shape(ctx, blobPts(px, T1 - 10, 90, 9, 10, 0.2, px), PAL.steel, null, 0);

    // ---- characters
    const floor = T1 - 14;
    const fx = 0, fh = 400;
    let fdir = tq < 1.25 ? -1 : tq < 1.92 ? 1 : -1;
    const sweep = Math.sin(tq * 5.5) * 0.08;
    const aimUp = -0.12 + sweep + (tq > 2.1 ? -0.05 : 0);
    const enemies = [];
    const eh = 380;
    const ep = (x0, x1, dir, k) => ({ x: lerp(x0, x1, ease.out(seg(t, 0, 2.6)) * 0.6 + seg(t, 0, 2.6) * 0.4), dir, k });
    enemies.push(ep(-760, -300, 1, 0), ep(-1000, -440, 1, 1), ep(780, 320, -1, 2), ep(1020, 450, -1, 3));
    const chest = [fx, floor - fh * 0.52];
    const einfo = [];
    for (const e of enemies) {
      seed(400 + e.k);
      const ang = Math.atan2(chest[1] - (floor - eh * 0.78), Math.abs(chest[0] - e.x)) * 0.9;
      const info = walker(ctx, e.x, floor, eh, e.dir, tq * TAU * 1.6 + e.k * 1.3, {
        gear: 'mask', weapon: { kind: 'rifle', ang }, body: PAL.ink, rim: '#3b4a52', rimOff: [-e.dir * 3, -3],
      });
      einfo.push([e, info]);
    }

    ctx.restore();

    // ---- darkness mask with flashlight + bulb cut out
    const dk = DARK.getContext('2d');
    dk.setTransform(1, 0, 0, 1, 0, 0); dk.clearRect(0, 0, W, H);
    dk.save(); camT(dk);
    dk.fillStyle = 'rgba(4,6,8,0.94)'; dk.fillRect(-1600, T0, 3200, T1 - T0);
    dk.globalCompositeOperation = 'destination-out';
    // fighter geometry (dry run for muzzle position)
    const mz = [fx + fdir * fh * 0.62, floor - fh * 0.66 + aimUp * fh * 0.5];
    const beamA = fdir > 0 ? aimUp : Math.PI - aimUp;
    const flick = sr(Math.floor(tq * 12), 77) > 0.15 ? 1 : 0.35;
    if (t > 0.55) {
      const L = 1250, sp = 0.2;
      const g = dk.createRadialGradient(mz[0], mz[1], 0, mz[0], mz[1], L);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dk.fillStyle = g; dk.beginPath(); dk.moveTo(mz[0], mz[1]);
      for (let k = 0; k <= 10; k++) { const a = beamA - sp + (k / 10) * sp * 2; dk.lineTo(mz[0] + Math.cos(a) * L, mz[1] + Math.sin(a) * L); }
      dk.closePath(); dk.fill();
    }
    const bulb = [70, T0 + 150];
    const bg = dk.createRadialGradient(bulb[0], bulb[1], 0, bulb[0], bulb[1], 330);
    bg.addColorStop(0, `rgba(0,0,0,${0.85 * flick})`); bg.addColorStop(1, 'rgba(0,0,0,0)');
    dk.fillStyle = bg; dk.fillRect(bulb[0] - 340, bulb[1] - 340, 680, 680);
    dk.restore();
    ctx.drawImage(DARK, 0, 0);

    // ---- lit layer: beam, bulb, fighter, eyes, lasers
    ctx.save(); camT(ctx);
    seed(500);
    if (t > 0.55) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const L = 1150, sp = 0.2;
      const g = ctx.createRadialGradient(mz[0], mz[1], 0, mz[0], mz[1], L);
      g.addColorStop(0, rgba(PAL.paper, 0.16)); g.addColorStop(0.5, rgba(PAL.paper, 0.05)); g.addColorStop(1, rgba(PAL.paper, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(mz[0], mz[1]);
      ctx.lineTo(mz[0] + Math.cos(beamA - sp) * L, mz[1] + Math.sin(beamA - sp) * L);
      ctx.lineTo(mz[0] + Math.cos(beamA + sp) * L, mz[1] + Math.sin(beamA + sp) * L);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // beam edges, inked
      ctx.save(); ctx.globalAlpha = 0.5;
      sline(ctx, mz[0], mz[1], mz[0] + Math.cos(beamA - 0.2) * 700, mz[1] + Math.sin(beamA - 0.2) * 700, 2, PAL.paper, 2);
      sline(ctx, mz[0], mz[1], mz[0] + Math.cos(beamA + 0.2) * 700, mz[1] + Math.sin(beamA + 0.2) * 700, 2, PAL.paper, 2);
      ctx.restore();
    }
    // bulb
    sline(ctx, bulb[0], T0, bulb[0], bulb[1] - 16, 2, PAL.ink, 1);
    glow(ctx, bulb[0], bulb[1], 160, PAL.amber, 0.5 * flick);
    shape(ctx, blobPts(bulb[0], bulb[1], 13, 17, 10, 0.05, 2), flick > 0.5 ? PAL.hot : PAL.amberD, PAL.ink, 2);
    // enemies caught in the beam get a pale rim
    for (const [e, info] of einfo) {
      const ang = Math.atan2(info.head[1] - mz[1], info.head[0] - mz[0]);
      let da = Math.abs(((ang - beamA + Math.PI * 3) % TAU) - Math.PI);
      if (t > 0.55 && da < 0.26) {
        seed(400 + e.k);
        ctx.save(); ctx.globalAlpha = 0.9;
        const eh2 = eh;
        const ang2 = Math.atan2(chest[1] - (floor - eh2 * 0.78), Math.abs(chest[0] - e.x)) * 0.9;
        walker(ctx, e.x, floor, eh2, e.dir, tq * TAU * 1.6 + e.k * 1.3, {
          gear: 'mask', weapon: { kind: 'rifle', ang: ang2 }, body: PAL.ink, rim: PAL.paper, rimOff: [-e.dir * 6, -2], detail: '#3a4148',
        });
        ctx.restore();
      }
    }
    // the fighter, kneeling, lit by spill
    seed(600);
    const kneel = { x: fx, y: floor - fh * 0.3, h: fh, dir: fdir, lean: 0.12, headTilt: -0.05,
      fN: [fx + fdir * fh * 0.17, floor - fh * 0.03], fF: [fx - fdir * fh * 0.2, floor - fh * 0.02], footAng: 0,
      weapon: { kind: 'rifle', ang: aimUp }, gear: 'op', body: PAL.ink, rim: PAL.bone, rimOff: [-fdir * 5, -5], detail: '#3e4549' };
    const fi = sideFigure(ctx, kneel);
    // weapon light lens
    if (fi.muzzle && t > 0.55) { glow(ctx, fi.muzzle[0], fi.muzzle[1], 60, PAL.hot, 0.8); }
    // eyes + lasers
    for (const [e, info] of einfo) {
      const hr = info.hr;
      const ex = info.head[0] + e.dir * hr * 0.6, ey = info.head[1] - hr * 0.05;
      glow(ctx, ex, ey, 46, PAL.red, 0.8);
      ctx.fillStyle = PAL.red; ctx.beginPath(); ctx.ellipse(ex, ey, 7, 5, 0, 0, TAU); ctx.fill();
      const on = e.dir > 0 ? tq > 0.9 : tq > 1.5;
      if (on && info.muzzle) {
        const tgt = [chest[0] + (sr(e.k, 9) - 0.5) * 70 + Math.sin(tq * 7 + e.k) * 10, chest[1] + (sr(e.k, 8) - 0.5) * 120];
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(PAL.red, 0.25); ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(info.muzzle[0], info.muzzle[1]); ctx.lineTo(tgt[0], tgt[1]); ctx.stroke();
        ctx.strokeStyle = rgba(PAL.red, 0.95); ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
        glow(ctx, tgt[0], tgt[1], 26, PAL.red, 0.9);
        ctx.fillStyle = PAL.hot; ctx.beginPath(); ctx.arc(tgt[0], tgt[1], 4, 0, TAU); ctx.fill();
      }
    }
    // falling dust in the beam
    seed(700);
    ctx.save(); ctx.globalAlpha = 0.7;
    for (let i = 0; i < 40; i++) {
      const x = -700 + sr(i, 1) * 1400, y = T0 + ((sr(i, 2) * 560 + tq * (60 + sr(i, 3) * 80)) % 560);
      ctx.fillStyle = PAL.paper; ctx.fillRect(x, y, 2.5, 6);
    }
    ctx.restore();
    // dirt trickle from the ceiling on landing beat
    if (t > 0.55 && t < 1.6) {
      for (let i = 0; i < 6; i++) { const x = -260 + i * 110, L = 40 + (t - 0.55) * 400; sline(ctx, x, T0, x + rs() * 4, T0 + Math.min(L, 380) * sr(i, 4), 2, PAL.khaki, 1); }
    }
    ctx.restore();

    // tilt speed lines
    seed(800);
    const tv = Math.sin(seg(t, 0, 0.6) * Math.PI);
    if (tv > 0.05) speedLinear(ctx, Math.PI / 2, 40, PAL.ink, 6, tv * 0.8);
  },
};
