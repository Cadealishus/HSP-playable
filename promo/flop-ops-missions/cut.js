'use strict';
// Scene runner, the assembled cut, and the (optional) caption overlay.

function renderScene(ctx, id, t, o = {}) {
  const sc = SCENES[id];
  const n = Math.floor(t * FPS_DRAW + 1e-6);
  const tq = n / FPS_DRAW;
  RNG.boil = n + (sc.seed || 0) * 1000;
  RNG.J = 2;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  sc.draw(ctx, t, tq);
  ctx.restore();
  ctx.save();
  post(ctx, sc.post || {});
  ctx.restore();
}

// Scene order for the assembled short. `cap` = caption at the bottom.
const CUT = [
  { id: 'plane', cap: 'Plane raid?' },
  { id: 'tunnel', cap: 'Underground survival?' },
  { id: 'hostage', cap: 'Hostage rescue?' },
  { id: 'stupid', cap: 'Something completely stupid?' },
  { id: 'aftermath', cap: null, outro: 'Give me your worst idea.' },
];
let CUT_DUR = 0;
function cutStarts() { let a = 0; return CUT.map((c) => { const s = a; a += SCENES[c.id].dur; CUT_DUR = a; return s; }); }
let CUT_T0 = null;
function ensureCut() { if (!CUT_T0) CUT_T0 = cutStarts(); return CUT_DUR; }

function renderCut(ctx, t, o = {}) {
  ensureCut();
  let i = CUT.length - 1;
  for (let k = 0; k < CUT.length; k++) if (t < CUT_T0[k] + SCENES[CUT[k].id].dur) { i = k; break; }
  const lt = t - CUT_T0[i];
  renderScene(ctx, CUT[i].id, lt, o);
  if (o.text) drawCaptions(ctx, t, i, lt);
}

// ---------------------------------------------------------------- captions (reference layout only)
function tapeText(ctx, txt, x, y, size, ang, pop, o = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  const s = 0.6 + 0.4 * ease.outBack(clamp(pop));
  ctx.scale(s, s);
  ctx.globalAlpha = clamp(pop * 3);
  ctx.font = `${size}px ${o.font || 'Marker'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const m = ctx.measureText(txt), w = m.width + size * 0.9, h = size * 1.35;
  seed(9000 + txt.length);
  const tp = [[-w / 2, -h / 2], [w / 2, -h / 2 + rs() * 3], [w / 2 + 6, h / 2], [-w / 2 - 4, h / 2 + rs() * 3]];
  sfill(ctx, tp.map(([a, b]) => [a + 8, b + 9]), 'rgba(0,0,0,0.55)', 0);
  sfill(ctx, tp, o.tape || PAL.paper, 1.5);
  // torn ends
  for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) {
    const yy = -h / 2 + (k + 0.5) * (h / 6);
    ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.moveTo(sd * w / 2, yy - h / 12); ctx.lineTo(sd * (w / 2 - 7), yy); ctx.lineTo(sd * w / 2, yy + h / 12); ctx.fill();
  }
  ctx.fillStyle = o.ink || PAL.ink;
  ctx.fillText(txt, 0, size * 0.06);
  ctx.restore();
}
function titleText(ctx, txt, x, y, size, pop, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.ang ?? -0.03);
  const s = 0.7 + 0.3 * ease.outBack(clamp(pop)); ctx.scale(s, s);
  ctx.font = `${size}px Anton`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const jx = rs() * 2, jy = rs() * 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16; ctx.strokeStyle = PAL.ink; ctx.strokeText(txt, jx + 6, jy + 8);
  ctx.fillStyle = PAL.ink; ctx.fillText(txt, jx + 6, jy + 8);
  ctx.strokeText(txt, jx, jy);
  ctx.fillStyle = o.col || PAL.paper; ctx.fillText(txt, jx, jy);
  if (o.bar) {
    const w = ctx.measureText(txt).width;
    sline(ctx, -w / 2, size * 0.6, w / 2, size * 0.56, size * 0.13, PAL.red, 2);
  }
  ctx.restore();
}
function drawCaptions(ctx, t, i, lt) {
  seed(8800 + Math.floor(t * 12));
  const c = CUT[i];
  if (!c.outro) {
    titleText(ctx, 'MISSION IDEAS???', 540, 250, 128, (t - 0.0) * 5, { bar: true });
  }
  if (c.cap) {
    const size = c.cap.length > 20 ? 62 : 74;
    const wob = c.id === 'stupid' ? Math.sin(t * 30) * 0.03 : 0;
    tapeText(ctx, c.cap, 540, 1580, size, -0.025 + (i % 2 ? 0.035 : 0) + wob, (lt - 0.05) * 5);
  }
  if (c.outro) {
    titleText(ctx, 'Give me your', 540, 230, 104, (lt - 0.1) * 5, { ang: -0.04 });
    titleText(ctx, 'WORST IDEA.', 540, 360, 132, (lt - 0.25) * 5, { ang: -0.02, col: PAL.amber, bar: true });
  }
}
