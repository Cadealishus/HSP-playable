import * as THREE from 'three';

/**
 * Canvas signage for the mission maps: every sign painted into one atlas and
 * drawn by two merged meshes (backlit / painted), after airport/signs.js.
 *
 * Sign spec (LEVEL space): { x, y, z, w, h, ry, two?, tilt?, style, lines, title? }
 * `ry` 0 faces +z. `tilt` rolls the board about its facing axis (a sign hanging
 * off one chain). Styles:
 *   'metro'   navy board, white caps, a red band (station wayfinding)
 *   'name'    the station name bar: white on navy with red rules
 *   'way'     black, white caps, yellow arrow (last line is the arrow)
 *   'warn'    safety yellow, black caps
 *   'board'   dark information board (title + rows)
 *   'plaque'  brass plate, dark serif caps (painted, not lit)
 *   'stencil' painted lettering on the wall, transparent ground (not lit)
 *   'dark'    a dead lightbox: grey face, faint lettering (not lit)
 *
 * Returns `{ litMat }` so a map can dim the backlit boards with its power.
 */

const SANS = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const ATLAS = 2048;
const PX_PER_M = 150;

function fit(g, lines, W, H, weight, fill = 0.8, pad = 0.06, face = SANS) {
  const lineH = (H * fill) / lines.length;
  let px = Math.floor(lineH * 0.9);
  const maxW = W * (1 - pad * 2);
  const measure = (p) => {
    g.font = `${weight} ${p}px ${face}`;
    let m = 0;
    for (const L of lines) m = Math.max(m, g.measureText(L).width);
    return m;
  };
  while (px > 8 && measure(px) > maxW) px--;
  g.font = `${weight} ${px}px ${face}`;
  return { px, lineH };
}

function centred(g, lines, W, H, lineH, y0 = 0, align = 'center', x = W / 2) {
  g.textAlign = align;
  g.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) g.fillText(lines[i], x, y0 + H / 2 + (i - (lines.length - 1) / 2) * lineH);
}

function paint(g, s, W, H) {
  const lines = s.lines;
  switch (s.style) {
    case 'metro': {
      g.fillStyle = '#16233a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#b3261e';
      g.fillRect(0, H * 0.86, W, H * 0.14);
      const { lineH } = fit(g, lines, W, H * 0.86, 600, 0.66);
      g.fillStyle = '#eef1f4';
      centred(g, lines, W, H * 0.86, lineH);
      break;
    }
    case 'name': {
      g.fillStyle = '#eef1f4';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#b3261e';
      g.fillRect(0, 0, W, H * 0.12);
      g.fillRect(0, H * 0.88, W, H * 0.12);
      g.fillStyle = '#16233a';
      g.fillRect(0, H * 0.18, W, H * 0.64);
      const { lineH } = fit(g, lines, W, H * 0.64, 700, 0.8);
      g.fillStyle = '#eef1f4';
      centred(g, lines, W, H * 0.64, lineH, H * 0.18);
      break;
    }
    case 'way': {
      g.fillStyle = '#101214';
      g.fillRect(0, 0, W, H);
      const arrow = lines.length > 1 ? lines[lines.length - 1] : null;
      const text = arrow ? lines.slice(0, -1) : lines;
      const aw = arrow ? H : 0;
      const { lineH } = fit(g, text, W - aw, H, 600, 0.62);
      g.fillStyle = '#f2f2ee';
      centred(g, text, W - aw, H, lineH, 0, 'left', W * 0.05);
      if (arrow) {
        g.fillStyle = '#f2b233';
        g.fillRect(W - aw, 0, aw, H);
        g.fillStyle = '#101214';
        g.font = `700 ${Math.floor(H * 0.8)}px ${SANS}`;
        g.textAlign = 'center';
        g.fillText(arrow, W - aw / 2, H / 2 + H * 0.04);
      }
      break;
    }
    case 'warn': {
      g.fillStyle = '#e0b21e';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#141414';
      g.fillRect(H * 0.06, H * 0.06, W - H * 0.12, H * 0.03);
      g.fillRect(H * 0.06, H * 0.91, W - H * 0.12, H * 0.03);
      const { lineH } = fit(g, lines, W, H * 0.8, 700, 0.8);
      centred(g, lines, W, H, lineH);
      break;
    }
    case 'board': {
      g.fillStyle = '#07090c';
      g.fillRect(0, 0, W, H);
      let y0 = 0;
      if (s.title) {
        const th = H * 0.2;
        g.fillStyle = '#16233a';
        g.fillRect(0, 0, W, th);
        g.font = `700 ${Math.floor(th * 0.7)}px ${SANS}`;
        g.fillStyle = '#eef1f4';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(s.title, W * 0.02, th / 2);
        y0 = th;
      }
      const rowsH = H - y0;
      const { lineH } = fit(g, lines, W, rowsH, 600, 0.9, 0.02);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      for (let i = 0; i < lines.length; i++) {
        g.fillStyle = i === 0 ? '#f2b233' : '#e9d9a8';
        g.fillText(lines[i], W * 0.02, y0 + rowsH * 0.05 + lineH * (i + 0.5));
      }
      break;
    }
    case 'plaque': {
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, '#9c7a3c');
      gr.addColorStop(0.5, '#c8a45a');
      gr.addColorStop(1, '#8a6a30');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#4a3718';
      g.lineWidth = Math.max(2, H * 0.04);
      g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
      const { lineH } = fit(g, lines, W, H * 0.8, 600, 0.7, 0.1, SERIF);
      g.fillStyle = '#2e210c';
      centred(g, lines, W, H, lineH);
      break;
    }
    case 'dark': {
      g.fillStyle = '#2a2d31';
      g.fillRect(0, 0, W, H);
      const { lineH } = fit(g, lines, W, H, 600, 0.66);
      g.fillStyle = '#4a4f55';
      centred(g, lines, W, H, lineH);
      break;
    }
    default: {
      // stencil
      g.clearRect(0, 0, W, H);
      const { lineH } = fit(g, lines, W, H, 800, 0.85, 0.02);
      g.fillStyle = s.color ?? '#d9d3c4';
      centred(g, lines, W, H, lineH);
    }
  }
}

const LIT = new Set(['metro', 'name', 'way', 'warn', 'board']);

export function buildSigns(A, root, disp, signs, opts = {}) {
  if (typeof document === 'undefined') return { litMat: null };
  const cv = document.createElement('canvas');
  cv.width = ATLAS;
  cv.height = ATLAS;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, ATLAS, ATLAS);
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  const pad = 4;
  for (const s of signs) {
    let W = Math.round(s.w * PX_PER_M);
    let H = Math.round(s.h * PX_PER_M);
    const k = Math.min(1, (ATLAS - 2 * pad) / W);
    W = Math.floor(W * k);
    H = Math.floor(H * k);
    if (cx + W + pad > ATLAS) {
      cx = 0;
      cy += rowH + pad;
      rowH = 0;
    }
    s.px = [cx, cy, W, H];
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    paint(g, s, W, H);
    g.restore();
    cx += W + pad;
    rowH = Math.max(rowH, H);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy ?? 8;
  tex.flipY = false;
  tex.needsUpdate = true;

  const lit = [];
  const flat = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const addQuad = (list, s, ry) => {
    const [px, py, W, H] = s.px;
    const u0 = px / ATLAS;
    const u1 = (px + W) / ATLAS;
    const v0 = py / ATLAS;
    const v1 = (py + H) / ATLAS;
    e.set(0, ry, s.tilt ?? 0);
    q.setFromEuler(e);
    pos.set(s.x, s.y, s.z);
    m.compose(pos, q, one);
    m.premultiply(A.xform);
    const pts = [
      [-s.w / 2, s.h / 2, u0, v0],
      [s.w / 2, s.h / 2, u1, v0],
      [s.w / 2, -s.h / 2, u1, v1],
      [-s.w / 2, -s.h / 2, u0, v1],
    ].map(([x, y, u, v]) => {
      const p = new THREE.Vector3(x, y, 0.004).applyMatrix4(m);
      return [p.x, p.y, p.z, u, v];
    });
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).transformDirection(A.xform);
    list.push({ pts, n });
  };
  for (const s of signs) {
    const list = LIT.has(s.style) ? lit : flat;
    addQuad(list, s, s.ry ?? 0);
    if (s.two) addQuad(list, s, (s.ry ?? 0) + Math.PI);
    // a thin backing box so a board has an edge and a back
    if (s.box !== false && s.style !== 'stencil') {
      const c = Math.cos(s.ry ?? 0);
      const sn = Math.sin(s.ry ?? 0);
      const d = s.two ? 0 : -0.03;
      const tr = new THREE.Matrix4();
      e.set(0, s.ry ?? 0, s.tilt ?? 0);
      q.setFromEuler(e);
      tr.compose(pos.set(s.x + sn * d, s.y, s.z + c * d), q, new THREE.Vector3(s.w + 0.04, s.h + 0.04, s.two ? 0.006 : 0.05));
      A.add(opts.frameKey ?? 'metal_dark', unitBox(A), tr);
    }
  }
  const build = (list) => {
    const P = [];
    const N = [];
    const U = [];
    const I = [];
    for (const { pts, n } of list) {
      const b = P.length / 3;
      for (const p of pts) {
        P.push(p[0], p[1], p[2]);
        N.push(n.x, n.y, n.z);
        U.push(p[3], p[4]);
      }
      I.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setIndex(I);
    geo.computeBoundingSphere();
    return geo;
  };
  const litMat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: opts.litIntensity ?? 0.9,
    roughness: 0.35,
    metalness: 0,
  });
  const flatMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.2,
    depthWrite: false,
    roughness: 0.6,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const add = (geo, mat, name) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.owNoShadow = true;
    root.add(mesh);
    disp.meshes.push(mesh);
    disp.geometries.push(geo);
    disp.materials.push(mat);
  };
  let outLit = null;
  if (lit.length) {
    add(build(lit), litMat, `${opts.name ?? 'map'}_signs`);
    outLit = litMat;
  } else litMat.dispose();
  if (flat.length) add(build(flat), flatMat, `${opts.name ?? 'map'}_paint`);
  else flatMat.dispose();
  disp.textures.push(tex);
  return { litMat: outLit };
}

function unitBox(A) {
  return A.cache('sg:box', () => new THREE.BoxGeometry(1, 1, 1));
}
