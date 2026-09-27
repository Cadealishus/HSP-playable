import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { newTrs, clothGeometry, sackGeometry, paintMasks, fbm3 } from './util.js';
import { BOX_FINE, BOX_THIN, IDENT, LL } from './kit.js';
import { STREET, SET_PIECES } from './layout.js';
import { groundY, groundSkirt } from './dressing.js';
import {
  Parts,
  buildCargoTruck,
  buildSedan,
  buildHesco,
  buildPowerLine,
  buildConcertina,
  hedgehogGeometry,
} from './hardware.js';

/**
 * WORLD — FLOP OPS dressing pass.
 *
 * OPERATION TOTAL CONFIDENCE: Extra Special Forces have been ordered to hold the
 * square of a war-torn border town "for as long as it takes". The town is a real,
 * serious place — shopfronts, power lines, a festival that did not happen — and
 * ESF have added exactly what Command authorised: some HESCO, some tank traps,
 * and one supply crate in the middle of the square that everybody has been told,
 * in writing, not to lose.
 *
 * Like the pass it replaces, this runs LAST in the world build with its own RNG
 * stream, so nothing it does perturbs the placement of the street it sits on.
 * Canvas-lettered surfaces (shop signs, the banner, stencils) are standalone
 * meshes with their own materials on the world root; everything else merges
 * into the Assembler's static batches and carries box collision proxies.
 *
 * The humour is in the words and in one or two objects. The geometry, the
 * materials and the lighting treat all of it with complete seriousness.
 */

/** THE OBJECTIVE, in LEVEL space. `src/game` anchors its wave-clear beat here. */
export const OBJECTIVE = {
  x: -1.7,
  z: 8.6,
  ry: 0.35,
  label: 'ESF SUPPLY CRATE',
  /** Collision footprint (level metres, before the crate's yaw). */
  size: [1.62, 1.14, 1.22],
};

// Muted, hand-mixed sign-board colours for an old market street.
const BOARDS = [
  { board: '#5a2a24', ink: '#e7d9b6' }, // oxblood
  { board: '#20423a', ink: '#e8dcbf' }, // deep forest
  { board: '#20484d', ink: '#ecdfbe' }, // teal
  { board: '#3a3f5c', ink: '#e4d7b4' }, // indigo
  { board: '#5f4a1c', ink: '#f0e4c0' }, // ochre
  { board: '#402a2a', ink: '#d9c79a' }, // dark brick
  { board: '#d8cfb8', ink: '#2b2a26' }, // cream enamel, dark letters
];

const CONDENSED = '"Arial Narrow", "Helvetica Neue", "Roboto Condensed", "DejaVu Sans Condensed", sans-serif';
const STENCIL = '"Arial Black", Impact, "Helvetica Neue", "DejaVu Sans", sans-serif';
const PX_PER_M = 300;

// ============================================================ canvas kit ==

function texFrom(canvas, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function newCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/**
 * Centred lines of caps, auto-shrunk until the widest fits. `condense`
 * squeezes glyphs horizontally — the hand-painted trade-sign move.
 */
function drawLines(g, W, H, lines, o) {
  const pad = W * (o.pad ?? 0.09);
  const maxW = W - pad * 2;
  const n = lines.length;
  const lineH = (H * (o.fill ?? 0.82)) / n;
  const condense = o.condense ?? 1;
  const measure = (p) => {
    g.font = `${o.weight} ${p}px ${o.family}`;
    g.letterSpacing = `${Math.max(0, p * (o.track ?? 0.02))}px`;
    let m = 0;
    for (const L of lines) m = Math.max(m, g.measureText(L).width * condense);
    return m;
  };
  let px = Math.floor(lineH * 0.86);
  while (px > 9 && measure(px) > maxW) px -= 1;
  g.font = `${o.weight} ${px}px ${o.family}`;
  g.letterSpacing = `${Math.max(0, px * (o.track ?? 0.02))}px`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(W / 2, H / 2 + (o.dy ?? 0));
  if (condense !== 1) g.scale(condense, 1);
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * lineH;
    if (o.shadow) {
      g.fillStyle = o.shadow;
      g.fillText(lines[i], (o.shadowDx ?? 2) / condense, y + (o.shadowDy ?? 2));
    }
    g.fillStyle = o.ink;
    g.fillText(lines[i], 0, y);
  }
  g.restore();
  return px;
}

/** Scratches, flaked paint, grime gradient and a soft vignette. */
function weather(g, W, H, boardColor, rng) {
  for (let i = 0; i < 220; i++) {
    g.globalAlpha = 0.03 + rng.float() * 0.1;
    g.fillStyle = rng.float() < 0.5 ? '#000' : '#fff';
    const r = rng.float() * 2 + 0.4;
    g.fillRect(rng.float() * W, rng.float() * H, r, r);
  }
  g.fillStyle = boardColor;
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = 0.35 + rng.float() * 0.4;
    const s = 1 + rng.float() * 5;
    g.fillRect(rng.float() * W, rng.float() * H, s, s * (0.5 + rng.float()));
  }
  for (let i = 0; i < 9; i++) {
    g.globalAlpha = 0.05 + rng.float() * 0.1;
    g.strokeStyle = rng.float() < 0.5 ? '#000' : '#e9e2cf';
    g.lineWidth = 0.6 + rng.float();
    g.beginPath();
    const x0 = rng.float() * W;
    const y0 = rng.float() * H;
    g.moveTo(x0, y0);
    g.lineTo(x0 + (rng.float() - 0.5) * W * 0.6, y0 + (rng.float() - 0.5) * H * 0.4);
    g.stroke();
  }
  g.globalAlpha = 1;
  // rust / water runs from the top fixings
  for (let i = 0; i < 5; i++) {
    const x = rng.float() * W;
    const grd = g.createLinearGradient(0, 0, 0, H * (0.4 + rng.float() * 0.5));
    grd.addColorStop(0, 'rgba(70,40,20,0.35)');
    grd.addColorStop(1, 'rgba(70,40,20,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 2 + rng.float() * 5, H);
  }
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.22)');
  grd.addColorStop(0.35, 'rgba(0,0,0,0.0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.26)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const rad = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
  rad.addColorStop(0, 'rgba(0,0,0,0)');
  rad.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = rad;
  g.fillRect(0, 0, W, H);
}

/** A hand-painted trade sign. Returns a CanvasTexture. */
function signTexture(sign, rng, aniso) {
  const W = Math.min(1024, Math.round(sign.w * PX_PER_M));
  const H = Math.min(768, Math.round(sign.h * PX_PER_M));
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  const skin = sign.skin ?? BOARDS[0];
  g.fillStyle = skin.board;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    g.globalAlpha = 0.04 + rng.float() * 0.06;
    g.fillStyle = rng.float() < 0.5 ? '#000' : '#fff';
    g.fillRect(rng.float() * W, 0, 1 + rng.float() * 2, H);
  }
  g.globalAlpha = 0.8;
  g.strokeStyle = skin.ink;
  const fl = Math.max(3, H * 0.035);
  g.lineWidth = fl;
  g.strokeRect(fl * 1.6, fl * 1.6, W - fl * 3.2, H - fl * 3.2);
  g.globalAlpha = 1;
  drawLines(g, W, H, sign.lines, {
    family: CONDENSED,
    weight: '800',
    condense: sign.condense ?? 0.8,
    track: 0.015,
    ink: skin.ink,
    shadow: 'rgba(0,0,0,0.45)',
    shadowDx: 2.5,
    shadowDy: 3,
  });
  weather(g, W, H, skin.board, rng);
  return texFrom(cv, aniso);
}

/**
 * A spray-stencilled marking on a transparent canvas: each line is laid in its
 * own colour, the closed counters get stencil bridges, and the paint is eroded
 * and fringed with overspray so it reads as paint on a surface, not type on a
 * screen. `spec.lines` = [{ text, size (fraction of H), y (0..1), color, font? }].
 */
function stencilTexture(spec, rng, aniso) {
  const W = spec.px?.[0] ?? 1024;
  const H = spec.px?.[1] ?? 512;
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const BRIDGED = new Set(['O', 'D', 'A', 'P', 'R', 'B', 'Q', '0', '4', '6', '8', '9']);
  for (const L of spec.lines) {
    let px = Math.round(L.size * H);
    const family = L.font ?? STENCIL;
    const track = L.track ?? 0.08;
    const maxW = W * (L.maxW ?? 0.9);
    const measure = () => {
      g.font = `900 ${px}px ${family}`;
      g.letterSpacing = `${px * track}px`;
      return g.measureText(L.text).width;
    };
    while (px > 8 && measure() > maxW) px -= 1;
    const tw = measure();
    const cy = L.y * H;
    const x0 = (W - tw) / 2 + (L.dx ?? 0) * W;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    // overspray halo first, then the hard paint
    g.fillStyle = L.color;
    g.globalAlpha = 0.18;
    g.shadowColor = L.color;
    g.shadowBlur = px * 0.12;
    g.fillText(L.text, x0, cy);
    g.shadowBlur = 0;
    g.globalAlpha = L.alpha ?? 0.92;
    g.fillText(L.text, x0, cy);
    g.globalAlpha = 1;
    // stencil bridges: a vertical cut through the counter of each closed glyph
    g.save();
    g.globalCompositeOperation = 'destination-out';
    let cx = x0;
    for (const ch of L.text) {
      const w = g.measureText(ch).width;
      if (BRIDGED.has(ch)) g.fillRect(cx + w * 0.5 - px * 0.035, cy - px * 0.6, px * 0.07, px * 1.2);
      cx += w + px * track;
    }
    g.restore();
  }
  // wear: the paint has been scuffed, rained on and dragged across concrete
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const wear = spec.wear ?? 1;
  for (let i = 0; i < 900 * wear; i++) {
    g.globalAlpha = 0.25 + rng.float() * 0.75;
    const r = rng.float() * (W / 280) + 0.5;
    g.beginPath();
    g.arc(rng.float() * W, rng.float() * H, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 14 * wear; i++) {
    g.globalAlpha = 0.3 + rng.float() * 0.5;
    g.lineWidth = 1 + rng.float() * (W / 300);
    g.beginPath();
    const x = rng.float() * W;
    const y = rng.float() * H;
    g.moveTo(x, y);
    g.lineTo(x + (rng.float() - 0.5) * W * 0.3, y + (rng.float() - 0.5) * H * 0.2);
    g.stroke();
  }
  // a soft fade band where the paint ran thin
  const fade = g.createLinearGradient(0, 0, W, 0);
  const f0 = rng.float() * 0.6;
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(f0, 'rgba(0,0,0,0)');
  fade.addColorStop(Math.min(1, f0 + 0.2), 'rgba(0,0,0,0.25)');
  fade.addColorStop(Math.min(1, f0 + 0.4), 'rgba(0,0,0,0)');
  g.globalAlpha = 1;
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  g.restore();
  // drips under the biggest line
  if (spec.drips) {
    const L = spec.lines[0];
    g.fillStyle = L.color;
    for (let i = 0; i < spec.drips; i++) {
      const x = W * (0.1 + rng.float() * 0.8);
      const y0 = L.y * H + L.size * H * 0.3;
      const len = H * (0.03 + rng.float() * 0.09);
      g.globalAlpha = 0.55;
      g.fillRect(x, y0, 2 + rng.float() * 2, len);
    }
    g.globalAlpha = 1;
  }
  return texFrom(cv, aniso);
}

// ============================================================ placement ==

/** LEVEL -> WORLD matrix for a standalone mesh (mirrors the Assembler bake). */
function worldMatrix(A, m) {
  return m.premultiply(A.xform);
}

function addStandalone(root, disp, mesh, geo, mat, tex) {
  mesh.matrixAutoUpdate = false;
  root.add(mesh);
  disp.meshes.push(mesh);
  if (geo) disp.geometries.push(geo);
  if (mat) disp.materials.push(mat);
  if (tex) disp.textures.push(tex);
}

/**
 * A painted decal: a plane (or conforming grid) carrying a stencil texture,
 * pulled toward the camera with polygon offset, kept out of the prepass and
 * the shadow cascades like the FX decals are.
 */
function decal(A, root, disp, tex, geo, levelMatrix, o = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    roughness: o.roughness ?? 0.72,
    metalness: 0,
    alphaTest: 0.03,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = o.name ?? 'flop_stencil';
  mesh.matrix.copy(worldMatrix(A, levelMatrix));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.owNoShadow = true;
  mesh.renderOrder = 3;
  addStandalone(root, disp, mesh, geo, mat, tex);
  return mesh;
}

/**
 * A projecting blade sign off a street facade, facing up/down the street. The
 * board is a double-sided canvas plane; bracket, stay and frame merge into
 * the static batches. No collision — it hangs above the doorways.
 */
function bladeSign(A, root, disp, rng, sign, aniso) {
  const wallX = sign.side === 'W' ? -STREET.kerb : STREET.kerb;
  const dir = sign.side === 'W' ? 1 : -1;
  const w = sign.w;
  const h = sign.h;
  const gap = 0.14;
  const cx = wallX + dir * (gap + w / 2);
  const cy = sign.y;
  const z = sign.z;
  const topY = cy + h / 2;

  const texture = signTexture(sign, rng, aniso);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `flop_sign_${sign.id}`;
  mesh.matrix.copy(worldMatrix(A, newTrs(cx, cy, z, 0)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addStandalone(root, disp, mesh, geo, mat, texture);

  // a timber frame round the board, so it has an edge and a thickness
  const fr = 0.035;
  A.addBox('sign_board', BOX_FINE(A), cx, topY + fr / 2, z, 0, w + fr * 2, fr, 0.05, { masks: [0.8, 0.5, 0.2] });
  A.addBox('sign_board', BOX_FINE(A), cx, cy - h / 2 - fr / 2, z, 0, w + fr * 2, fr, 0.05, { masks: [0.8, 0.6, 0.3] });
  A.addBox('sign_board', BOX_FINE(A), cx - w / 2 - fr / 2, cy, z, 0, fr, h, 0.05, { masks: [0.8, 0.5, 0.2] });
  A.addBox('sign_board', BOX_FINE(A), cx + w / 2 + fr / 2, cy, z, 0, fr, h, 0.05, { masks: [0.8, 0.5, 0.2] });
  // bracket: wall plate, arm, diagonal stay, and two hanging eyes
  const armLen = gap + w + 0.06;
  const armY = topY + 0.12;
  A.addBox('metal_dark', BOX_FINE(A), wallX + dir * 0.06, armY, z, 0, 0.1, 0.16, 0.16, { masks: [0.9, 0.5, 0.1] });
  A.addBox('metal_dark', BOX_FINE(A), wallX + dir * (armLen / 2), armY, z, 0, armLen, 0.05, 0.05, { masks: [0.9, 0.5, 0.1] });
  const stayDy = 0.5;
  const stayLen = Math.hypot(armLen, stayDy);
  const stayRz = dir * Math.atan2(stayDy, armLen);
  A.add('metal_rust', BOX_THIN(A), LL(IDENT, wallX + dir * (armLen / 2), armY - stayDy / 2, z, 0, stayLen, 0.035, 0.035, 0, stayRz), {
    masks: [0.95, 0.55, 0.1],
  });
  for (const f of [-0.38, 0.38]) {
    A.addBox('metal_rust', BOX_THIN(A), cx + f * w, (armY + topY + fr) / 2, z, 0, 0.012, armY - topY - fr, 0.012, {
      masks: [0.9, 0.5, 0.2],
    });
  }
}

/** Cable y at x, following the catenary the tube uses. */
function cableYAt(cable, x) {
  const [x0, y0, z0, x1, y1, z1, sag] = cable;
  const t = Math.abs(x1 - x0) < 1e-4 ? 0.5 : (x - x0) / (x1 - x0);
  const K = Math.cosh(1.5) - 1;
  const droop = (Math.cosh(1.5) - Math.cosh((t - 0.5) * 3)) / K;
  return { y: y0 + (y1 - y0) * t - sag * droop, z: z0 + (z1 - z0) * t };
}

/**
 * A municipal cloth banner under a cross-street cable: the town's apricot
 * festival, with a paper strip pasted across it. Deadpan, faded, real.
 */
function festivalBanner(A, root, disp, rng, cable, aniso) {
  const [x0, , , x1] = cable;
  const w = 5.2;
  const h = 1.15;
  const midX = (x0 + x1) / 2;
  const top = cableYAt(cable, midX);
  const cy = top.y - 0.22 - h / 2;
  const cz = top.z;

  const W = 1400;
  const H = 310;
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  // sun-bleached cotton, once a strong terracotta
  g.fillStyle = '#b58a6a';
  g.fillRect(0, 0, W, H);
  const bleach = g.createLinearGradient(0, 0, 0, H);
  bleach.addColorStop(0, 'rgba(255,245,225,0.28)');
  bleach.addColorStop(0.6, 'rgba(255,245,225,0.08)');
  bleach.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = bleach;
  g.fillRect(0, 0, W, H);
  // painted border and two apricots, hand-done
  g.strokeStyle = '#f1e2c4';
  g.lineWidth = 7;
  g.strokeRect(22, 22, W - 44, H - 44);
  for (const ax of [120, W - 120]) {
    g.fillStyle = '#e59a45';
    g.beginPath();
    g.arc(ax, H / 2, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5d7a3a';
    g.beginPath();
    g.ellipse(ax + 20, H / 2 - 50, 26, 11, -0.5, 0, Math.PI * 2);
    g.fill();
  }
  drawLines(g, W, H, ['38TH ANNUAL', 'APRICOT FESTIVAL'], {
    family: CONDENSED,
    weight: '800',
    condense: 0.9,
    track: 0.06,
    ink: '#f4ead2',
    fill: 0.74,
    pad: 0.16,
    shadow: 'rgba(60,25,10,0.35)',
  });
  // the pasted strip, slightly crooked, with its own shadow and torn corner
  g.save();
  g.translate(W * 0.64, H * 0.56);
  g.rotate(-0.09);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(-250 + 5, -44 + 6, 500, 88);
  g.fillStyle = '#e9e3d2';
  g.fillRect(-250, -44, 500, 88);
  g.fillStyle = '#9b1f16';
  g.font = `900 64px ${STENCIL}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '6px';
  g.fillText('POSTPONED', 0, 3);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(250, -44);
  g.lineTo(212, -44);
  g.lineTo(250, -8);
  g.fill();
  g.restore();
  weather(g, W, H, '#b58a6a', rng);
  const texture = texFrom(cv, aniso);

  const geo = clothGeometry(w, h, {
    segX: 16,
    segY: 8,
    sag: 0.26,
    wrinkle: 0.05,
    bulge: 0.09,
    twist: 0.05,
    thickness: 0.004,
    rng,
    hem: 1,
  });
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'flop_banner_festival';
  mesh.matrix.copy(worldMatrix(A, newTrs(midX, cy, cz, 0)));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addStandalone(root, disp, mesh, geo, mat, texture);

  const topEdge = cy + h / 2;
  for (const f of [-0.44, -0.22, 0, 0.22, 0.44]) {
    const tx = midX + f * w;
    const cAt = cableYAt(cable, tx);
    const len = Math.max(0.05, cAt.y - topEdge + 0.02);
    A.addBox('metal_dark', BOX_THIN(A), tx, topEdge + len / 2, cAt.z, 0, 0.012, len, 0.012, { masks: [0.4, 0.6, 0.2] });
  }
}

// ============================================================ objective ==
/**
 * THE OBJECTIVE: one ESF supply container on a pallet, in the middle of the
 * square, stencilled on every face with the only instruction anybody received.
 * Olive steel with ribbed walls, corner guards, latches, handles and a cargo
 * strap. One collision proxy — the AI flows round it like any crate.
 */
function buildSupplyCrate(A, root, disp, rng, aniso) {
  const { x, z, ry } = OBJECTIVE;
  const gY = groundY(x, z);
  const P = new Parts();
  // pallet: three stringers along local Z, seven deck boards along X
  for (const sx of [-0.72, 0, 0.72]) P.box('wood_prop', 0.1, 0.1, 1.2, sx, 0.05, 0, { bevel: 0.008, grime: 0.6 });
  for (let i = 0; i < 7; i++) {
    P.box('wood_prop', 1.62, 0.022, 0.13, 0, 0.111, -0.52 + i * 0.1733, { bevel: 0.004, grime: 0.35 });
  }
  const bw = 1.44;
  const bd = 1.0;
  const bh = 0.9;
  const by = 0.122 + bh / 2;
  P.box('esf_olive', bw, bh, bd, 0, by, 0, { bevel: 0.025 });
  // lid with a lip
  P.box('esf_olive', bw + 0.05, 0.07, bd + 0.05, 0, 0.122 + bh + 0.035, 0, { bevel: 0.02, wear: 1.3 });
  // horizontal ribs pressed into the walls
  for (const yy of [0.2, 0.95]) {
    P.box('esf_olive', bw + 0.024, 0.045, 0.03, 0, yy, bd / 2, { bevel: 0.01, wear: 1.4 });
    P.box('esf_olive', bw + 0.024, 0.045, 0.03, 0, yy, -bd / 2, { bevel: 0.01, wear: 1.4 });
    P.box('esf_olive', 0.03, 0.045, bd + 0.024, bw / 2, yy, 0, { bevel: 0.01, wear: 1.4 });
    P.box('esf_olive', 0.03, 0.045, bd + 0.024, -bw / 2, yy, 0, { bevel: 0.01, wear: 1.4 });
  }
  // corner guards (steel angle) up the four vertical edges and along the lid
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.box('metal_dark', 0.07, bh + 0.05, 0.07, sx * (bw / 2), by + 0.02, sz * (bd / 2), { bevel: 0.01, wear: 1.5 });
  }
  // latches front and back, handles on the ends
  for (const sz of [-1, 1]) {
    for (const lx of [-0.45, 0.45]) {
      P.box('steel', 0.09, 0.12, 0.03, lx, 0.122 + bh - 0.05, sz * (bd / 2 + 0.03), { bevel: 0.006, wear: 1.2 });
      P.box('metal_dark', 0.05, 0.03, 0.035, lx, 0.122 + bh - 0.125, sz * (bd / 2 + 0.035), { bevel: 0.004 });
    }
  }
  for (const sx of [-1, 1]) {
    P.box('metal_dark', 0.035, 0.03, 0.34, sx * (bw / 2 + 0.07), 0.86, 0, { bevel: 0.006 });
    for (const hz of [-0.16, 0.16]) P.box('metal_dark', 0.075, 0.05, 0.03, sx * (bw / 2 + 0.035), 0.86, hz, { bevel: 0.006 });
  }
  // cargo strap over the top and down both long sides, with a ratchet
  for (const sx of [-0.63, 0.63]) {
    P.box('tarp', 0.05, 0.008, bd + 0.07, sx, 0.122 + bh + 0.074, 0, { bevel: 0.002, grime: 0.3 });
    for (const sz of [-1, 1]) {
      P.box('tarp', 0.05, bh + 0.06, 0.008, sx, by + 0.02, sz * (bd / 2 + 0.04), { bevel: 0.002, grime: 0.4 });
    }
    P.box('steel', 0.07, 0.1, 0.05, sx, 0.52, bd / 2 + 0.06, { bevel: 0.008 });
  }
  P.emit(A, x, gY, z, ry, { dustH: 0.5, dust: 0.55 });
  // pallet collision + container collision in one proxy
  const [sx, sy, sz] = OBJECTIVE.size;
  A.box('metal', x, gY + sy / 2, z, sx, sy, sz, ry);
  groundSkirt(A, rng, x, gY, z, 0.95, { pebbles: 4 });

  // ---- the stencils --------------------------------------------------------
  const white = '#e9e6da';
  const pale = '#d8d3c1';
  const long = {
    px: [1024, 640],
    lines: [
      { text: 'DO NOT LOSE', size: 0.3, y: 0.44, color: white, maxW: 0.84, track: 0.06 },
      { text: 'E.S.F.  SUPPLY  ·  QTY 1  ·  CONTENTS: YES', size: 0.075, y: 0.73, color: pale, maxW: 0.86, track: 0.04 },
      { text: 'NSN 8465-01-ESF-0001', size: 0.06, y: 0.16, color: pale, maxW: 0.5, dx: -0.2, track: 0.03 },
    ],
    wear: 0.9,
  };
  const endA = {
    px: [768, 512],
    lines: [
      { text: 'DO NOT', size: 0.28, y: 0.33, color: white, maxW: 0.8 },
      { text: 'LOSE', size: 0.28, y: 0.66, color: white, maxW: 0.8 },
    ],
    wear: 0.9,
  };
  const endB = {
    px: [768, 512],
    lines: [
      { text: '↓ THIS SIDE UP ↓', size: 0.14, y: 0.3, color: white, maxW: 0.86, track: 0.04 },
      { text: 'DO NOT LOSE', size: 0.16, y: 0.62, color: white, maxW: 0.86 },
    ],
    wear: 0.9,
  };
  const top = {
    px: [1024, 720],
    lines: [
      { text: 'ESF', size: 0.42, y: 0.46, color: white, maxW: 0.6, track: 0.12 },
      { text: 'PROPERTY OF EXTRA SPECIAL FORCES', size: 0.06, y: 0.8, color: pale, maxW: 0.8, track: 0.03 },
    ],
    wear: 1.2,
  };
  const place = (lx, ly, lz, fy, fx, w, h, spec) => {
    const tex = stencilTexture(spec, rng, aniso);
    const geo = new THREE.PlaneGeometry(w, h);
    // local face orientation: rotate the plane's +Z normal to the face normal
    const m = newTrs(lx, ly, lz, fy, 1, 1, 1, fx);
    const mm = newTrs(x, gY, z, ry).multiply(m);
    decal(A, root, disp, tex, geo, mm, { name: 'flop_objective_stencil' });
  };
  const faceY = 0.122 + bh * 0.5;
  const off = 0.003;
  // long faces (the +Z face looks up the street at the hero camera)
  place(0, faceY, bd / 2 + off, 0, 0, 1.3, 0.8, long);
  place(0, faceY, -bd / 2 - off, Math.PI, 0, 1.3, 0.8, long);
  // ends
  place(bw / 2 + off, faceY, 0, Math.PI / 2, 0, 0.9, 0.6, endA);
  place(-bw / 2 - off, faceY, 0, -Math.PI / 2, 0, 0.9, 0.6, endB);
  // lid
  place(0, 0.122 + bh + 0.071 + off, 0.02, 0, -Math.PI / 2, 1.2, 0.84, top);

  return { x, z };
}

// ============================================================== jokes ==
/** The spare sandbag: a lone bag at the end of an emplacement, stencilled. */
function spareSandbag(A, root, disp, rng, aniso, x, z, ry) {
  const gY = groundY(x, z);
  const sack = sackGeometry(rng, 0.52, 0.19, 0.34, { variant: 0, box: 4.4, lump: 1.1 });
  sack.computeBoundingBox();
  const bb = sack.boundingBox;
  paintMasks(sack, (px, py, pz, nx, ny, nz, out) => {
    const n = fbm3(px * 12, py * 12, pz * 12, 2);
    out[0] = 0.3 + n * 0.4;
    out[1] = 0.2 + Math.max(0, -ny) * 0.4 + n * 0.15;
    out[2] = 0.1 + Math.max(0, -ny) * 0.4;
  });
  // stood on its long edge and leant back against the emplacement, broad face
  // out: the only bag in the town anybody has written on
  const th = -Math.PI / 2 + 0.32;
  // lowest point of the tipped bag, so it stands ON the ground
  const c = Math.cos(th);
  const sn = Math.sin(th);
  let minY = Infinity;
  for (const yy of [bb.min.y, bb.max.y]) for (const zz of [bb.min.z, bb.max.z]) minY = Math.min(minY, c * yy - sn * zz);
  const place = newTrs(x, gY - minY - 0.015, z, ry, 1, 1, 1, th);
  A.add('burlap', sack, place);
  // the stencil conforms to the bag: raycast a grid down onto its top face
  const mesh = new THREE.Mesh(sack, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const W = 0.42;
  const H = 0.24;
  const grid = new THREE.PlaneGeometry(W, H, 12, 8);
  // lie in XZ facing +Y (the bag's broad top), turned so the lettering reads
  // upright once the bag is stood on its edge
  grid.rotateX(-Math.PI / 2);
  grid.rotateY(Math.PI);
  const pa = grid.getAttribute('position');
  const o = new THREE.Vector3();
  const d = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < pa.count; i++) {
    o.set(pa.getX(i), bb.max.y + 0.2, pa.getZ(i));
    ray.set(o, d);
    const hit = ray.intersectObject(mesh, false)[0];
    pa.setY(i, hit ? hit.point.y + 0.006 : bb.max.y);
  }
  grid.computeVertexNormals();
  mesh.material.dispose();
  const tex = stencilTexture(
    {
      px: [512, 300],
      lines: [{ text: 'SPARE', size: 0.46, y: 0.52, color: '#1f1d1a', maxW: 0.86, track: 0.1 }],
      wear: 0.7,
    },
    rng,
    aniso
  );
  decal(A, root, disp, tex, grid, place.clone(), { name: 'flop_spare_stencil', roughness: 0.9 });
  sack.dispose();
  A.box('fabric', x, gY + 0.2, z, 0.5, 0.4, 0.3, ry);
}

/**
 * A jersey barrier someone has sprayed a warning on, both faces. Authored
 * here rather than stencilled onto one of the street's barriers because those
 * carry a random yaw the decal could not follow.
 */
function chaosBarrier(A, root, disp, rng, aniso, x, z, ry) {
  const y = groundY(x, z);
  A.put('jersey', x, y, z, ry, 1, [1, 1.15, 1]);
  A.box('concrete', x, y + 0.46, z, 0.62, 0.92, 1.9, ry);
  groundSkirt(A, rng, x + Math.sin(ry) * 0.6, y, z + Math.cos(ry) * 0.6, 0.5, { pebbles: 3 });
  groundSkirt(A, rng, x - Math.sin(ry) * 0.6, y, z - Math.cos(ry) * 0.6, 0.5, { pebbles: 2 });
  const spec = {
    px: [1024, 300],
    lines: [
      { text: 'DANGER:', size: 0.38, y: 0.3, color: '#8e2014', maxW: 0.5, dx: -0.02 },
      { text: 'CHAOS', size: 0.5, y: 0.72, color: '#171513', maxW: 0.62 },
    ],
    wear: 1.1,
    drips: 5,
  };
  // the sloped upper face: 0.26..0.70 m up, leaning 8.2 degrees off vertical,
  // 1.5 cm proud of the profile where the extrusion bevel puts the real surface
  const tilt = Math.atan2(0.066, 0.46);
  for (const side of [1, -1]) {
    const tex = stencilTexture(spec, rng, aniso);
    const geo = new THREE.PlaneGeometry(1.5, 0.44);
    // plane faces +Z; yaw it onto the barrier's +/-X face, then lean it back
    const m = newTrs(x, y, z, ry)
      .multiply(newTrs(side * 0.143, 0.48, 0, side * Math.PI / 2))
      .multiply(newTrs(0, 0, 0, 0, 1, 1, 1, -tilt));
    decal(A, root, disp, tex, geo, m, { name: 'flop_chaos_stencil' });
  }
}

// ============================================================ the square ==
/**
 * Czech hedgehogs, including one that Command's procurement request was
 * apparently filled from in centimetres.
 */
function tankTraps(A, rng) {
  A.proto('hedgehog', {
    geo: hedgehogGeometry(1.9, 0.13),
    key: 'metal_rust_prop',
    skirt: 0.7,
  });
  const traps = [
    // [x, z, ry, scale]
    [0.75, 12.6, 0.45, 1.0],
    [-4.15, 4.35, 1.1, 0.95],
    [1.55, 11.55, 0.2, 0.19], // the very small one
  ];
  for (const [x, z, ry, s] of traps) {
    const y = groundY(x, z);
    A.put('hedgehog', x, y - 0.01 * s, z, ry, s, [1, 1.2, 1]);
    const f = 1.3 * s;
    A.box('metal', x, y + 0.55 * s, z, f, 1.1 * s, f, ry);
  }
}

// ================================================================ entry ==

/**
 * Shop signs: plausible trades, a couple of them slightly too honest.
 * Positions are the old blade-sign brackets on both facades.
 */
const SIGNS = [
  { id: 'hotel', side: 'W', z: 26.5, lines: ['HOTEL', 'SPLENDID'], skin: 4, w: 1.35, h: 0.78 },
  { id: 'barber', side: 'W', z: 15.0, lines: ['BARBER', '& DENTIST'], skin: 2, w: 1.3, h: 0.72 },
  { id: 'pharmacy', side: 'W', z: -1.5, lines: ['PHARMACY'], skin: 1, w: 1.45, h: 0.56 },
  { id: 'tyres', side: 'W', z: -18.5, lines: ['TYRES', '& WEDDINGS'], skin: 0, w: 1.4, h: 0.74 },
  { id: 'bakery', side: 'W', z: -33.5, lines: ['BAKERY', 'SINCE TUESDAY'], skin: 6, w: 1.4, h: 0.72 },
  { id: 'cafe', side: 'E', z: 27.0, lines: ['CAFÉ VICTORY'], skin: 5, w: 1.35, h: 0.56 },
  { id: 'phones', side: 'E', z: 15.0, lines: ['PHONE REPAIR', 'SAME WEEK'], skin: 3, w: 1.35, h: 0.7 },
  { id: 'autoparts', side: 'E', z: -4.0, lines: ['MOSTLY HONEST', 'AUTO PARTS'], skin: 6, w: 1.5, h: 0.74 },
  { id: 'butcher', side: 'E', z: -21.0, lines: ['BUTCHER'], skin: 0, w: 1.3, h: 0.56 },
  { id: 'estate', side: 'E', z: -37.0, lines: ['REAL ESTATE', 'GREAT VIEWS'], skin: 2, w: 1.45, h: 0.72 },
];

/**
 * The whole FLOP OPS dress. Called last in the world build.
 * @returns {{ objective: {x:number, z:number} }}
 */
export function dressFlopOps(A, root, disp, opts = {}) {
  const rng = new Rng(0xf10b_0b5);
  const aniso = opts.anisotropy ?? 8;

  // ---- shopfronts ------------------------------------------------------
  for (const s of SIGNS) {
    bladeSign(A, root, disp, rng, { ...s, y: 2.45, skin: BOARDS[s.skin] }, aniso);
  }

  // ---- the festival that was not ------------------------------------------
  festivalBanner(A, root, disp, rng, SET_PIECES.cables[0], aniso);

  // ---- power line down the east pavement ------------------------------------
  const PX = STREET.halfWidth + 0.45;
  buildPowerLine(
    A,
    rng,
    [
      [PX, 29.0, [6.45, 5.9, 31.5], false],
      [PX, 11.5, [6.45, 5.6, 9.0], false],
      [PX, -7.0, [6.45, 6.0, -9.5], true],
      [PX, -25.0, [6.45, 5.7, -27.5], false],
      [PX, -42.5, null, false],
    ],
    { groundY, height: 8.4, arm: 1.4, extend: 14 }
  );

  // ---- THE OBJECTIVE ------------------------------------------------------
  const objective = buildSupplyCrate(A, root, disp, rng, aniso);

  // ---- ESF works in and around the square -------------------------------------
  tankTraps(A, rng);
  chaosBarrier(A, root, disp, rng, aniso, 2.2, 14.8, Math.PI / 2);
  spareSandbag(A, root, disp, rng, aniso, -1.88, 10.95, -0.55);
  // HESCO across the north street, leaving the lane open; wire in front of it
  buildHesco(A, rng, -2.9, 27.8, 0.03, 3, { y: groundY(-2.9, 27.8) });
  buildConcertina(A, rng, -3.0, 26.5, 0.05, 3.4, { y: groundY(-3.0, 26.5) });

  // ---- vehicles ------------------------------------------------------------
  // the ESF truck that brought the crate, parked up the north street
  buildCargoTruck(A, rng, 3.0, 33.6, Math.PI, { y: groundY(3.0, 33.6) });
  // a local's saloon, abandoned where it stopped
  buildSedan(A, rng, -3.35, 38.8, 0.06, { y: groundY(-3.35, 38.8), flat: 1 });
  // and another, pulled into the east alley out of the way
  buildSedan(A, rng, 15.5, 6.6, -Math.PI / 2, { y: 0.03, paint: 'metal_blue', flat: 3 });

  return { objective };
}
