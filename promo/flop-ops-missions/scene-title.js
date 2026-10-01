'use strict';
// FINAL TITLE CARD — FLOP OPS logo slams in on the cut, pulses on the music hits,
// the helmet from scene 4 drops onto the logo, the helmetless operator is still seeing stars.

SCENES.title = {
  dur: 3.125, seed: 6,
  draw(ctx, t, tq) {
    const slam = ease.out(seg(t, 0, 0.16));
    const hits = [0.7, 1.9];
    let pulse = 0;
    for (const k of hits) if (t >= k) pulse = Math.max(pulse, Math.exp(-(t - k) * 9));
    const impact = Math.exp(-t * 10);
    const sh = shake(t, 3 + impact * 50 + pulse * 26, 18, 61);
    RNG.J = 2.4;

    ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sh[0], sh[1]);
    // diagonal hatch ground + red stamp band
    seed(1);
    hatch(ctx, [[0, 0], [W, 0], [W, H], [0, H]], -0.9, 26, 2, PAL.ink2, 1, null, 3);
    const band = [[-80, 890], [W + 80, 670], [W + 80, 910], [-80, 1130]];
    shape(ctx, band, mix(PAL.redD, PAL.red, 0.35 + pulse * 0.4), PAL.ink, 6);
    hatch(ctx, band, 0.6, 12, 1.6, PAL.redDD, 0.6);
    // rotating crosshair
    const cx = 540, cy = 770, R = 400 * (1 + pulse * 0.05);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.25);
    spath(ctx, circlePts(0, 0, R, 40), 6, PAL.red, true, 2.5);
    spath(ctx, circlePts(0, 0, R * 0.62, 32), 3, PAL.redM, true, 2);
    for (let k = 0; k < 4; k++) { const [a, b] = rot(R * 0.75, 0, k * Math.PI / 2), [c, d] = rot(R * 1.15, 0, k * Math.PI / 2); sline(ctx, a, b, c, d, 9, PAL.red, 2); }
    ctx.restore();
    // ink splatter on the slam
    seed(2);
    for (let i = 0; i < 14; i++) {
      const a = sr(i, 1) * TAU, d = (260 + sr(i, 2) * 300) * (0.6 + slam * 0.4);
      const rr = (8 + sr(i, 3) * 34) * slam;
      sfill(ctx, blobPts(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d, rr, rr, 9, 0.3, i), i % 3 ? PAL.ink : PAL.red, 2);
    }

    // logo
    const s = 1 + 1.6 * (1 - slam) + pulse * 0.06;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.07); ctx.scale(s, s);
    ctx.globalAlpha = clamp(t * 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const word = (txt, y, size, fill) => {
      ctx.font = `${size}px Anton`;
      const jx = rs() * 2.5, jy = rs() * 2.5;
      ctx.lineWidth = size * 0.14; ctx.strokeStyle = PAL.ink;
      ctx.strokeText(txt, jx + 14, y + jy + 16); ctx.fillStyle = PAL.ink; ctx.fillText(txt, jx + 14, y + jy + 16);
      ctx.strokeText(txt, jx, y + jy); ctx.fillStyle = fill; ctx.fillText(txt, jx, y + jy);
      return ctx.measureText(txt).width;
    };
    seed(3);
    const wF = word('FLOP', -150, 330, PAL.paper);
    word('OPS', 175, 330, PAL.amber);
    // sloppy underline
    sline(ctx, -wF * 0.55, 360, wF * 0.5, 335, 26, PAL.red, 3);
    ctx.restore();

    // helmet falls onto the logo at the second hit and wobbles
    const hu = seg(t, 1.55, 1.9);
    if (hu > 0) {
      const landX = cx - 120, landY = cy - 345;
      const y = hu < 1 ? lerp(-200, landY, ease.in2(hu)) : landY - Math.abs(Math.sin((t - 1.9) * 14)) * 40 * Math.exp(-(t - 1.9) * 5);
      const wob = hu < 1 ? hu * 5 : Math.sin((t - 1.9) * 16) * 0.4 * Math.exp(-(t - 1.9) * 3);
      ctx.save(); ctx.translate(landX, y); ctx.rotate(wob - 0.07); ctx.scale(1.6, 1.6);
      seed(4);
      const hel = [[-36, 0], [-34, -24], [-18, -38], [0, -42], [18, -38], [34, -24], [36, 0]];
      sfill(ctx, hel.map(([a, b]) => [a + 4, b + 5]), PAL.red, 1);
      shape(ctx, hel, PAL.olive, PAL.ink, 4);
      hatch(ctx, hel, 0.8, 5, 1.2, PAL.ink, 0.8);
      sline(ctx, -30, -26, 10, -40, 3, PAL.bone, 1);
      sline(ctx, -38, 0, 38, 0, 5, PAL.ink, 1);
      ctx.restore();
    }

    // the squad, bottom: rim-lit, middle one helmetless and seeing stars
    const sq = ease.out(seg(t, 0.15, 0.55));
    for (const [i, x] of [[0, 300], [1, 540], [2, 780]]) {
      seed(10 + i);
      const h = 400, feet = 1600 + (1 - sq) * 500;
      const dazed = i === 1;
      const info = frontFigure(ctx, { x, y: feet - 0.52 * h, h, gear: dazed ? 'none' : 'op', arms: 'down', tilt: dazed ? Math.sin(tq * 5) * 0.08 : (i - 1) * -0.04,
        body: PAL.ink, rim: PAL.red, rimOff: [i === 0 ? 5 : -5, -5], detail: '#3b1410' });
      if (dazed && sq > 0.9) {
        for (let k = 0; k < 3; k++) {
          const a = tq * 6 + k * TAU / 3;
          const px = info.head[0] + Math.cos(a) * 60, py = info.head[1] - 50 + Math.sin(a) * 16;
          const st = [];
          for (let j = 0; j < 10; j++) { const rr = j % 2 ? 6 : 15; st.push([px + Math.cos(j * Math.PI / 5) * rr, py + Math.sin(j * Math.PI / 5) * rr]); }
          shape(ctx, st, PAL.amber, PAL.ink, 2);
        }
      }
    }
    ctx.restore();
    // slam flash
    if (t < 0.12) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba(PAL.hot, 0.8 * (1 - t / 0.12)); ctx.fillRect(0, 0, W, H); ctx.restore(); }
    seed(90);
    if (impact > 0.2) speedRadial(ctx, cx, cy, 40, 300, 1400, PAL.paper, 7, impact * 0.5);
  },
};
