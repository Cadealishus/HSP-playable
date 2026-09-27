/**
 * SHARE CARD — a 1200×630 PNG rendered on a canvas, in Arcade Terminal.
 *
 * "Every share is a conference ad" (DESIGN.md). The card therefore carries the
 * run AND the show, in the contract's exact strings:
 *
 *   NERD OF DUTY · [AAA] · [JOB] · WAVE [n] · [score] PTS ·
 *   FINTECH NERDCON · NOV 19–20 · SAN DIEGO · fintechnerdcon.com
 *
 * Delivery is Web Share API with the file attached where that exists (every
 * modern mobile browser, Safari on macOS), and a plain download everywhere
 * else. `copyLink` is always offered separately, because a link that unfurls
 * (see api/og.js) travels further than an image in most of fintech's group
 * chats.
 *
 * Nothing here runs per frame — the card is built once, on a button press.
 */

const W = 1200;
const H = 630;

const C = {
  void: '#050505',
  panel: '#0D0D0D',
  blue: '#3568FF',
  cyan: '#00E5FF',
  green: '#39FF14',
  gold: '#FFD700',
  magenta: '#FF2D78',
  white: '#F0F0F0',
  gray: '#888888',
};

const JOB_LABELS = {
  'fraud-analyst': 'FRAUD ANALYST',
  'payments-engineer': 'PAYMENTS ENGINEER',
  'compliance-officer': 'COMPLIANCE OFFICER',
};

const MONO = '"JetBrains Mono","SF Mono",ui-monospace,Menlo,monospace';

function font(weight, size) {
  return `${weight} ${size}px ${MONO}`;
}

/** Uppercase letterspaced run — canvas has no letter-spacing before Chrome 99. */
function tracked(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return total;
}

/**
 * @param {{initials:string, job:string, wave:number, score:number,
 *          kills?:number, accuracy?:number|null}} run
 * @returns {Promise<Blob|null>}
 */
export async function renderShareCard(run) {
  // Wait for JetBrains Mono; without it the card silently renders in Menlo.
  try {
    await document.fonts?.ready;
  } catch {
    /* no font loading API — draw with whatever we have */
  }

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return null;

  // ---- substrate -----------------------------------------------------------
  g.fillStyle = C.void;
  g.fillRect(0, 0, W, H);

  const glowTop = g.createRadialGradient(W * 0.5, H * 0.02, 0, W * 0.5, H * 0.02, W * 0.7);
  glowTop.addColorStop(0, 'rgba(53,104,255,.30)');
  glowTop.addColorStop(1, 'rgba(53,104,255,0)');
  g.fillStyle = glowTop;
  g.fillRect(0, 0, W, H);

  const glowBot = g.createRadialGradient(W * 0.5, H * 1.04, 0, W * 0.5, H * 1.04, W * 0.6);
  glowBot.addColorStop(0, 'rgba(255,45,120,.20)');
  glowBot.addColorStop(1, 'rgba(255,45,120,0)');
  g.fillStyle = glowBot;
  g.fillRect(0, 0, W, H);

  // CRT scanlines — the cabinet substrate, same as the attract screen.
  g.fillStyle = 'rgba(0,0,0,.26)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

  // frame
  g.strokeStyle = 'rgba(0,229,255,.30)';
  g.lineWidth = 2;
  g.strokeRect(28, 28, W - 56, H - 56);
  g.fillStyle = C.gold;
  for (const [cx, cy] of [
    [28, 28],
    [W - 44, 28],
    [28, H - 44],
    [W - 44, H - 44],
  ]) {
    g.fillRect(cx, cy, 16, 2);
    g.fillRect(cx, cy, 2, 16);
  }

  g.textBaseline = 'alphabetic';

  // ---- header --------------------------------------------------------------
  g.fillStyle = C.cyan;
  g.font = font(700, 19);
  tracked(g, 'HOLD THE LEDGER', W / 2, 92, 9, 'center');

  g.fillStyle = C.white;
  g.font = font(800, 72);
  g.shadowColor = 'rgba(53,104,255,.55)';
  g.shadowBlur = 34;
  tracked(g, 'NERD OF DUTY', W / 2, 168, 8, 'center');
  g.shadowBlur = 0;

  g.fillStyle = 'rgba(240,240,240,.55)';
  g.font = font(400, 16);
  tracked(g, 'A FINTECH NERDCON GAME', W / 2, 202, 8, 'center');

  // ---- the run: [AAA] · [JOB] ---------------------------------------------
  const initials = /^[A-Z]{3}$/.test(run.initials ?? '') ? run.initials : 'AAA';
  const job = JOB_LABELS[run.job] ?? 'FRAUD ANALYST';

  const initY = 312;
  g.fillStyle = C.gold;
  g.font = font(800, 86);
  const initW = tracked(g, initials, W / 2, initY, 18, 'center');

  // hairlines flanking the initials, on the cap-height centre line
  g.strokeStyle = 'rgba(255,215,0,.45)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(W / 2 - initW / 2 - 200, initY - 30);
  g.lineTo(W / 2 - initW / 2 - 46, initY - 30);
  g.moveTo(W / 2 + initW / 2 + 46, initY - 30);
  g.lineTo(W / 2 + initW / 2 + 200, initY - 30);
  g.stroke();

  g.fillStyle = C.cyan;
  g.font = font(700, 21);
  tracked(g, job, W / 2, 356, 10, 'center');

  // ---- stat rail: WAVE n · [score] PTS -------------------------------------
  const wave = Math.max(1, Math.round(run.wave ?? 1));
  const score = Math.max(0, Math.round(run.score ?? 0)).toLocaleString('en-US');

  const railY = 404;
  g.strokeStyle = 'rgba(240,240,240,.14)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(150, railY);
  g.lineTo(W - 150, railY);
  g.stroke();

  const cells = [
    { k: 'WAVE', v: String(wave), color: C.white },
    { k: 'SCORE', v: score, color: C.gold, suffix: 'PTS' },
  ];
  if (Number.isFinite(run.kills)) cells.splice(1, 0, { k: 'KILLS', v: String(run.kills), color: C.white });

  const slot = (W - 300) / cells.length;
  const labelY = railY + 34;
  const valueY = railY + 86;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const cx = 150 + slot * (i + 0.5);

    g.fillStyle = 'rgba(240,240,240,.42)';
    g.font = font(400, 14);
    tracked(g, cell.k, cx, labelY, 6, 'center');

    // The value and its unit are measured together so the pair stays centred
    // in its slot — "184,250 PTS" must not drift off-axis as the score grows.
    g.font = font(800, 44);
    let width = 0;
    for (const ch of cell.v) width += g.measureText(ch).width + 3;
    width -= 3;
    let suffixW = 0;
    if (cell.suffix) {
      g.font = font(400, 16);
      for (const ch of cell.suffix) suffixW += g.measureText(ch).width + 4;
      suffixW += 18; // gap between number and unit
    }
    const startX = cx - (width + suffixW) / 2;

    g.fillStyle = cell.color;
    g.font = font(800, 44);
    tracked(g, cell.v, startX, valueY, 3, 'left');
    if (cell.suffix) {
      g.fillStyle = 'rgba(240,240,240,.42)';
      g.font = font(400, 16);
      tracked(g, cell.suffix, startX + width + 18, valueY, 4, 'left');
    }
  }

  // ---- footer: the ad ------------------------------------------------------
  g.fillStyle = C.gold;
  g.font = font(700, 19);
  tracked(g, 'FINTECH NERDCON', W / 2, H - 76, 10, 'center');
  g.fillStyle = 'rgba(240,240,240,.62)';
  g.font = font(400, 15);
  tracked(g, 'NOV 19–20 · SAN DIEGO · FINTECHNERDCON.COM', W / 2, H - 46, 6, 'center');

  return new Promise((resolve) => {
    try {
      cv.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

const FILE_NAME = (run) => `nerd-of-duty-${(run.initials ?? 'AAA').toLowerCase()}-wave-${run.wave ?? 1}.png`;

/**
 * Share the card. Web Share API with the file where supported, download
 * otherwise.
 * @returns {Promise<'shared'|'downloaded'|'cancelled'|'failed'>}
 */
export async function shareRun(run, url) {
  const blob = await renderShareCard(run);
  if (!blob) return 'failed';
  const name = FILE_NAME(run);
  const text = `NERD OF DUTY · ${run.initials} · ${JOB_LABELS[run.job] ?? ''} · WAVE ${run.wave} · ${Math.round(
    run.score ?? 0
  ).toLocaleString('en-US')} PTS`;

  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'NERD OF DUTY', text, url });
      return 'shared';
    }
  } catch (err) {
    // AbortError = the user closed the sheet. Anything else falls back.
    if (err?.name === 'AbortError') return 'cancelled';
  }

  try {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** @returns {Promise<boolean>} */
export async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    /* clipboard blocked (insecure context / no permission) — fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
