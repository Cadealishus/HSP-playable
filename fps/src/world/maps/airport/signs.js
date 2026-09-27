import * as THREE from 'three';
import { PLANE, GATE, DECK } from './layout.js';
import { hullHalfWidth } from './plane.js';

/**
 * HOLDING PATTERN — signage.
 *
 * Every board in the terminal is painted into ONE canvas atlas at load time and
 * drawn by two merged meshes (backlit boards with an emissive map, painted
 * lettering without), so the whole wayfinding layer costs two draw calls. The
 * departures board is where the jokes live; it is set in the same flat,
 * municipal type as everything else and nobody on it is joking.
 */

const SANS = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
const ATLAS = 2048;
const PX_PER_M = 160;

const NAVY = '#16233a';
const INK = '#eef1f4';
const AMBER = '#f2b233';

/**
 * Sign specs in LEVEL space. `ry` turns the face (0 = faces +z / south,
 * PI/2 = faces +x / east). `two` hangs a second face back to back.
 * style: 'way' (navy, white caps, amber arrow), 'board' (departures),
 * 'gate' (the big 12), 'shop' (dark fascia, warm letters), 'paint' (hull).
 */
function signList() {
  const fz = PLANE.fz;
  const d = GATE.desk;
  const list = [
    // --- overhead wayfinding
    { x: 8.5, y: 6.2, z: -0.2, w: 5.2, h: 0.8, ry: Math.PI / 2, two: true, style: 'way', lines: ['GATES 10 – 14', '→'] },
    { x: 0.8, y: 5.6, z: 3.5, w: 4.2, h: 0.8, ry: Math.PI / 2, two: true, style: 'way', lines: ['CHECK-IN · ARRIVALS', '←'] },
    { x: -6.8, y: 5.2, z: -12.8, w: 4.4, h: 0.8, ry: 0, two: true, style: 'way', lines: ['SECURITY · ALL GATES', '↑'] },
    { x: -14.5, y: 5.2, z: -13.2, w: 4.6, h: 0.8, ry: 0, two: true, style: 'way', lines: ['FOOD COURT · ARRIVALS', '↓'] },
    { x: -22.2, y: 4.2, z: 2.5, w: 4.0, h: 0.75, ry: Math.PI / 2, two: true, style: 'way', lines: ['FOOD COURT', '←'] },
    { x: -10, y: 4.6, z: 11.3, w: 4.4, h: 0.8, ry: 0, two: true, style: 'way', lines: ['ARRIVALS · BAGGAGE', '↓'] },
    { x: 22.2, y: 3.4, z: 6.3, w: 3.2, h: 0.7, ry: 0, two: true, style: 'way', lines: ['BOARDING', '→'] },
    { x: 2.2, y: 4.3, z: -21.6, w: 2.6, h: 0.7, ry: -Math.PI / 2, two: true, style: 'way', lines: ['SECURITY', '↓'] },
    { x: 28.8, y: 2.9, z: -9.6, w: 2.2, h: 0.5, ry: 0, style: 'way', lines: ['STAFF ONLY'] },
    // --- Gate 12: the big number on the pylon, both faces, and the flight header
    { x: d.x, y: 2.35, z: d.z + 0.49, w: 0.66, h: 1.2, ry: Math.PI, style: 'gate', lines: ['12'] },
    { x: d.x, y: 2.35, z: d.z + 1.01, w: 0.66, h: 1.2, ry: 0, style: 'gate', lines: ['12'] },
    { x: 22.2, y: 4.6, z: -1.0, w: 6.0, h: 1.0, ry: Math.PI, two: true, style: 'board', lines: ['GATE 12 · FA 612 · BOARDING (DOUG)'] },
    // --- departures board on the deck fascia, facing the concourse
    {
      x: 16.5,
      y: 3.35,
      z: DECK.z1 + 0.34,
      w: 7.6,
      h: 2.2,
      ry: 0,
      style: 'board',
      title: 'DEPARTURES',
      lines: [
        'FA 612   ANYWHERE        12   BOARDING (DOUG)',
        'FA 404   ELSEWHERE       —    CANCELLED',
        'FA 007   PORT ELLERY     9    DELAYED — REASON: YES',
        'FA 118   THE COAST       11   ON TIME (NOT HERE)',
        'FA 220   INLAND          14   GATE CHANGE: NO',
        'FA 351   NORTH           10   DEPARTED (PROBABLY)',
      ],
    },
    // --- a second departures bank over the check-in islands
    {
      x: -4.0,
      y: 3.6,
      z: -11.35,
      w: 2.4,
      h: 1.5,
      ry: Math.PI / 2,
      style: 'board',
      title: 'CHECK-IN',
      lines: ['FA 612   DESKS 1–8   OPEN', 'FA 404   —           CLOSED', 'FA 007   DESK 9      ASK'],
    },
    // --- shop fascias under the deck
    { x: 9.9, y: 3.35, z: -10.3, w: 3.0, h: 0.55, ry: 0, style: 'shop', lines: ['PHARMACY'] },
    { x: 16.2, y: 3.35, z: -10.3, w: 3.8, h: 0.55, ry: 0, style: 'shop', lines: ['DUTY FREE'] },
    { x: 23.6, y: 3.35, z: -10.3, w: 3.6, h: 0.55, ry: 0, style: 'shop', lines: ['BOOKS & PRESS'] },
    { x: -31, y: 2.9, z: -5.55, w: 4.0, h: 0.6, ry: 0, style: 'shop', lines: ['GATE CAFÉ'] },
    { x: -31, y: 3.9, z: -4.9, w: 4.4, h: 0.5, ry: 0, style: 'way', lines: ['TODAY: SOUP'] },
    // --- baggage belts
    { x: -14, y: 3.4, z: 17.2, w: 1.8, h: 0.8, ry: 0, two: true, style: 'way', lines: ['BELT 1'] },
    { x: -6, y: 3.4, z: 17.2, w: 1.8, h: 0.8, ry: 0, two: true, style: 'way', lines: ['BELT 2'] },
    // --- the airline name on the hull, both sides, painted
    { x: 30, y: PLANE.floorY + 1.75, z: fz - hullHalfWidth(PLANE.floorY + 1.75) - 0.03, w: 6.0, h: 0.9, ry: Math.PI, style: 'paint', lines: ['FINE AIR'] },
    { x: 30, y: PLANE.floorY + 1.75, z: fz + hullHalfWidth(PLANE.floorY + 1.75) + 0.03, w: 6.0, h: 0.9, ry: 0, style: 'paint', lines: ['FINE AIR'] },
    // --- gate number on the bridge cab, and the stand number on the apron
    { x: 37.5, y: 3.9, z: 9.78, w: 1.4, h: 0.8, ry: Math.PI, style: 'gate', lines: ['12'] },
  ];
  return list;
}

function fitFont(g, lines, W, H, weight, fill = 0.8, pad = 0.06) {
  const lineH = (H * fill) / lines.length;
  let px = Math.floor(lineH * 0.9);
  const maxW = W * (1 - pad * 2);
  const measure = (p) => {
    g.font = `${weight} ${p}px ${SANS}`;
    let m = 0;
    for (const L of lines) m = Math.max(m, g.measureText(L).width);
    return m;
  };
  while (px > 8 && measure(px) > maxW) px--;
  g.font = `${weight} ${px}px ${SANS}`;
  return { px, lineH };
}

function paint(g, s, x, y, W, H) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  const lines = s.lines;
  if (s.style === 'way') {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, W, H);
    const arrow = lines.length > 1 ? lines[lines.length - 1] : null;
    const text = arrow ? lines.slice(0, -1) : lines;
    const aw = arrow ? H : 0;
    const { lineH } = fitFont(g, text, W - aw, H, 600, 0.62);
    g.fillStyle = INK;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let i = 0; i < text.length; i++) g.fillText(text[i], W * 0.04, H / 2 + (i - (text.length - 1) / 2) * lineH);
    if (arrow) {
      g.fillStyle = AMBER;
      g.fillRect(W - aw, 0, aw, H);
      g.fillStyle = NAVY;
      g.font = `700 ${Math.floor(H * 0.8)}px ${SANS}`;
      g.textAlign = 'center';
      g.fillText(arrow, W - aw / 2, H / 2 + H * 0.04);
    }
  } else if (s.style === 'board') {
    g.fillStyle = '#07090c';
    g.fillRect(0, 0, W, H);
    let y0 = 0;
    if (s.title) {
      const th = H * 0.16;
      g.fillStyle = NAVY;
      g.fillRect(0, 0, W, th);
      g.font = `700 ${Math.floor(th * 0.7)}px ${SANS}`;
      g.fillStyle = INK;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(s.title, W * 0.02, th / 2);
      y0 = th;
    }
    const rowsH = H - y0;
    const { lineH } = fitFont(g, lines, W, rowsH, 600, 0.92, 0.02);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
      const cy = y0 + rowsH * 0.04 + lineH * (i + 0.5);
      if (i % 2 === 1) {
        g.fillStyle = '#10141a';
        g.fillRect(0, cy - lineH / 2, W, lineH);
      }
      g.fillStyle = i === 0 ? AMBER : '#e9d9a8';
      g.fillText(lines[i], W * 0.02, cy);
    }
  } else if (s.style === 'gate') {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, W, H);
    g.fillStyle = AMBER;
    g.fillRect(0, H * 0.9, W, H * 0.1);
    fitFont(g, lines, W, H * 0.9, 700, 0.9);
    g.fillStyle = INK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(lines[0], W / 2, H * 0.47);
  } else if (s.style === 'shop') {
    g.fillStyle = '#1b1a18';
    g.fillRect(0, 0, W, H);
    fitFont(g, lines, W, H, 600, 0.7, 0.08);
    g.fillStyle = '#f3dcae';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(lines[0], W / 2, H / 2);
  } else {
    // painted hull lettering: transparent ground, italic blue caps
    g.clearRect(0, 0, W, H);
    fitFont(g, lines, W, H, 800, 0.9, 0.02);
    g.font = g.font.replace(/^(\d+)/, 'italic $1');
    g.fillStyle = '#2a4a78';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(lines[0], W / 2, H / 2);
  }
  g.restore();
}

export function buildSigns(A, root, disp, opts = {}) {
  if (typeof document === 'undefined') return;
  const signs = signList();
  const cv = document.createElement('canvas');
  cv.width = ATLAS;
  cv.height = ATLAS;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, ATLAS, ATLAS);

  // shelf packer
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
    paint(g, s, cx, cy, W, H);
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
  const q = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const addQuad = (list, s, ry, off) => {
    const [px, py, W, H] = s.px;
    const u0 = px / ATLAS;
    const u1 = (px + W) / ATLAS;
    const v0 = py / ATLAS;
    const v1 = (py + H) / ATLAS;
    quat.setFromAxisAngle(UP, ry);
    q.set(s.x, s.y, s.z);
    m.compose(q, quat, one);
    m.premultiply(A.xform);
    const corners = [
      [-s.w / 2, s.h / 2, u0, v0],
      [s.w / 2, s.h / 2, u1, v0],
      [s.w / 2, -s.h / 2, u1, v1],
      [-s.w / 2, -s.h / 2, u0, v1],
    ];
    const base = list.length;
    void base;
    const pts = corners.map(([x, y, u, v]) => {
      const p = new THREE.Vector3(x, y, off).applyMatrix4(m);
      return [p.x, p.y, p.z, u, v];
    });
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).transformDirection(A.xform);
    list.push({ pts, n });
  };
  for (const s of signs) {
    const list = s.style === 'paint' ? flat : lit;
    addQuad(list, s, s.ry, 0);
    if (s.two) addQuad(list, s, s.ry + Math.PI, 0);
  }

  const build = (list) => {
    const pos = [];
    const nrm = [];
    const uv = [];
    const idx = [];
    for (const { pts, n } of list) {
      const b = pos.length / 3;
      for (const p of pts) {
        pos.push(p[0], p[1], p[2]);
        nrm.push(n.x, n.y, n.z);
        uv.push(p[3], p[4]);
      }
      idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  };

  const litMat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    roughness: 0.35,
    metalness: 0,
    side: THREE.FrontSide,
  });
  const flatMat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.2,
    depthWrite: false,
    roughness: 0.5,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const add = (geo, mat, name, shadow) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (!shadow) mesh.userData.owNoShadow = true;
    root.add(mesh);
    disp.meshes.push(mesh);
    disp.geometries.push(geo);
    disp.materials.push(mat);
  };
  if (lit.length) add(build(lit), litMat, 'airport_signs', true);
  else litMat.dispose();
  if (flat.length) {
    const gm = build(flat);
    add(gm, flatMat, 'airport_livery_text', false);
  } else flatMat.dispose();
  disp.textures.push(tex);
}
