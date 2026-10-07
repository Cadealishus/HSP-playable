import { SPEC } from '../../src/spec.js';

/**
 * The printed label design, identical for every version: paper ground, a
 * maroon diamond over two bars, centred on the front (u = 0.5). Realistic
 * versions pass `paperFn` / `inkFn` to texture the paper and ink; the layout
 * itself never changes.
 */
export function drawLabel(cv, { paperFn = null, inkFn = null, smooth = true } = {}) {
  const W = cv.width, H = cv.height;
  const g = cv.getContext('2d');
  const D = SPEC.label.design;
  g.imageSmoothingEnabled = smooth;
  g.fillStyle = SPEC.label.paper;
  g.fillRect(0, 0, W, H);
  if (paperFn) paperFn(g, W, H);
  // ink shapes drawn into an offscreen mask so realistic versions can texture the ink
  const ink = document.createElement('canvas');
  ink.width = W; ink.height = H;
  const k = ink.getContext('2d');
  k.fillStyle = SPEC.label.ink;
  const cx = D.front * W;
  // label is wrapped round a cylinder: convert height fractions to pixels in v, keep
  // the diamond square in metres (circumference vs height differ)
  const circ = 2 * Math.PI * SPEC.label.radius, hM = SPEC.label.y1 - SPEC.label.y0;
  const pxPerMu = W / circ, pxPerMv = H / hM;
  const half = D.diamond.half * hM; // metres
  const cy = (1 - D.diamond.cy) * H;
  k.beginPath();
  k.moveTo(cx, cy - half * pxPerMv);
  k.lineTo(cx + half * pxPerMu, cy);
  k.lineTo(cx, cy + half * pxPerMv);
  k.lineTo(cx - half * pxPerMu, cy);
  k.closePath();
  k.fill();
  for (const b of D.bars) {
    const bw = D.barHalfWidth * W;
    const bh = b.h * H;
    k.fillRect(cx - bw, (1 - b.cy) * H - bh / 2, bw * 2, bh);
  }
  if (inkFn) inkFn(k, W, H);
  g.drawImage(ink, 0, 0);
  return { inkMask: ink };
}
