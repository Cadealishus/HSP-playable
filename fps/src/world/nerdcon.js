import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { newTrs, clothGeometry, chamferBox } from './util.js';
import { BOX, BOX_FINE, BOX_THIN, IDENT, LL } from './kit.js';
import { STREET, SET_PIECES } from './layout.js';
import { groundY } from './dressing.js';

/**
 * WORLD — NERD OF DUTY re-dressing pass.
 *
 * This street is a dense Middle-East market re-cast as "the old financial
 * quarter" of fintech satire. It is a SET-DRESSING pass on top of the existing
 * world — it adds signage, NerdCon banners, THE LEDGER set piece and a few
 * flavour props, and it MOVES NOTHING. Everything here is additive:
 *
 *   - Blade signs / banners / the ATM screen are standalone meshes with unique
 *     canvas-text materials, added straight to the world root. They carry no
 *     collision (every one sits above head height on a bracket, or hugs a wall).
 *   - Brackets, the Ledger monolith + plinth and the ATM body are merged into
 *     the Assembler's static batches so they cost near-nothing and weather with
 *     the street. Only the Ledger and the ATM add a collision proxy, and both
 *     are hand-placed clear of every lane, doorway and alley — the Ledger like
 *     a plaza monument, the ATM flat against a facade.
 *
 * The joke lives in the TEXT. The signs are sized, weathered and mounted like
 * real shopfront signage; the material logic of the world is untouched.
 */

// ---- brand palette (canvas text only — the world keeps its real materials) --
const C = {
  blue: '#3568FF',
  cyan: '#00E5FF',
  magenta: '#FF2D78',
  gold: '#FFD700',
  white: '#F0F0F0',
  cream: '#e7d9b6',
  ink: '#20242b',
};

// Muted, hand-mixed sign-board colours for the legacy trades.
const LEGACY_BOARDS = [
  { board: '#5a2a24', ink: C.cream }, // oxblood
  { board: '#20423a', ink: '#e8dcbf' }, // deep forest
  { board: '#20484d', ink: '#ecdfbe' }, // teal
  { board: '#3a3f5c', ink: '#e4d7b4' }, // indigo
  { board: '#5f4a1c', ink: '#f0e4c0' }, // ochre
  { board: '#402a2a', ink: '#d9c79a' }, // dark brick
];

// ============================================================ canvas signs ==

/**
 * A CanvasTexture from a painted canvas, colour-managed and mip-mapped.
 * `aniso` comes from `ctx.config.q.anisotropy` — every sign in here is read at
 * a grazing angle from up-street, which is exactly the case anisotropic
 * filtering exists for, and hard-coding 8 either over-spends on `low` or
 * throws away half the sharpness the `ultra` preset already paid for.
 */
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
 * Lay one or more centred lines of caps into the panel, auto-shrinking the
 * font until the widest line fits. `condense` squeezes glyphs horizontally so a
 * long legacy trade name still reads big — the hand-painted trade-sign move.
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
  g.translate(W / 2, H / 2);
  if (condense !== 1) g.scale(condense, 1);
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * lineH;
    if (o.shadow) {
      g.fillStyle = o.shadow;
      g.fillText(lines[i], (o.shadowDx ?? 2) / condense, y + (o.shadowDy ?? 2));
    }
    if (o.glow) {
      g.shadowColor = o.glow;
      g.shadowBlur = o.glowBlur ?? 0;
    }
    g.fillStyle = o.ink;
    g.fillText(lines[i], 0, y);
  }
  g.restore();
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
}

/** Scratches, flaked paint, grime gradient and a soft vignette. */
function weather(g, W, H, boardColor, rng, opts = {}) {
  const light = opts.light === true;
  // flecks of dust/paint
  const flecks = light ? 90 : 220;
  for (let i = 0; i < flecks; i++) {
    g.globalAlpha = 0.03 + rng.float() * (light ? 0.05 : 0.1);
    g.fillStyle = rng.float() < 0.5 ? '#000' : '#fff';
    const r = rng.float() * 2 + 0.4;
    g.fillRect(rng.float() * W, rng.float() * H, r, r);
  }
  if (!light) {
    // flaked paint: bits of the board showing back through the lettering
    g.fillStyle = boardColor;
    for (let i = 0; i < 46; i++) {
      g.globalAlpha = 0.35 + rng.float() * 0.4;
      const s = 1 + rng.float() * 4;
      g.fillRect(rng.float() * W, rng.float() * H, s, s);
    }
    // long weather scratches
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
  }
  g.globalAlpha = 1;
  // grime settling from the top and pooling at the bottom
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.22)');
  grd.addColorStop(0.35, 'rgba(0,0,0,0.0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.24)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // corner vignette
  const rad = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
  rad.addColorStop(0, 'rgba(0,0,0,0)');
  rad.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = rad;
  g.fillRect(0, 0, W, H);
}

const CONDENSED = '"Arial Narrow", "Helvetica Neue", "Roboto Condensed", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
const PX_PER_M = 300;

/** Build the CanvasTexture for one sign face. Returns { texture, canvas }. */
function makeSignTexture(sign, rng, aniso) {
  const W = Math.min(1024, Math.round(sign.w * PX_PER_M));
  const H = Math.min(768, Math.round(sign.h * PX_PER_M));
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  const lines = sign.lines;

  if (sign.style === 'glow') {
    // A garish modern intruder: neon on a black panel. STABLECOIN LIQUORS.
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#161018');
    grd.addColorStop(1, '#060406');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const neon = sign.neon ?? C.magenta;
    g.strokeStyle = neon;
    g.lineWidth = Math.max(2.5, H * 0.03);
    g.shadowColor = neon;
    g.shadowBlur = H * 0.12;
    const m = H * 0.09;
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    g.shadowBlur = 0;
    drawLines(g, W, H, lines, {
      family: MONO,
      weight: '700',
      condense: sign.condense ?? 0.98,
      track: 0.06,
      ink: neon,
      glow: neon,
      glowBlur: H * 0.14,
    });
    weather(g, W, H, '#0b0b0d', rng, { light: true });
    return { texture: texFrom(cv, aniso), canvas: cv };
  }

  if (sign.style === 'wayfind') {
    // NerdCon-blue wayfinding: white mono on brand blue. NERDCON EXPO HALL →.
    g.fillStyle = C.blue;
    g.fillRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(240,240,240,0.85)';
    g.lineWidth = Math.max(3, H * 0.05);
    const m = H * 0.1;
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    drawLines(g, W, H, lines, {
      family: MONO,
      weight: '800',
      condense: sign.condense ?? 0.94,
      track: 0.04,
      ink: C.white,
    });
    weather(g, W, H, C.blue, rng, { light: true });
    return { texture: texFrom(cv, aniso), canvas: cv };
  }

  // legacy hand-painted trade sign (the default — most of the quarter is old).
  const skin = sign.skin ?? LEGACY_BOARDS[0];
  g.fillStyle = skin.board;
  g.fillRect(0, 0, W, H);
  // faint painted planks / brush drag
  for (let i = 0; i < 46; i++) {
    g.globalAlpha = 0.04 + rng.float() * 0.06;
    g.fillStyle = rng.float() < 0.5 ? '#000' : '#fff';
    g.fillRect(rng.float() * W, 0, 1 + rng.float() * 2, H);
  }
  g.globalAlpha = 1;
  // painted keyline frame, inset
  g.strokeStyle = skin.ink;
  g.globalAlpha = 0.8;
  const fl = Math.max(3, H * 0.035);
  g.lineWidth = fl;
  g.strokeRect(fl * 1.6, fl * 1.6, W - fl * 3.2, H - fl * 3.2);
  g.globalAlpha = 1;
  drawLines(g, W, H, lines, {
    family: CONDENSED,
    weight: '800',
    condense: sign.condense ?? 0.8,
    track: 0.015,
    ink: skin.ink,
    shadow: 'rgba(0,0,0,0.5)',
    shadowDx: 2.5,
    shadowDy: 3,
  });
  weather(g, W, H, skin.board, rng);
  return { texture: texFrom(cv, aniso), canvas: cv };
}

/** MeshStandardMaterial for a sign face, with restrained emissive where lit. */
function makeSignMaterial(sign, texture) {
  if (sign.style === 'glow') {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      // Garish is the joke (STABLECOIN LIQUORS), but held back from the bloom
      // threshold so the neon stays hue-saturated magenta instead of a white core.
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
  if (sign.style === 'wayfind') {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.2,
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.76,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

// ============================================================== placement ==

/** LEVEL -> WORLD matrix for a standalone mesh (mirrors the Assembler bake). */
function worldMatrix(A, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const m = newTrs(x, y, z, ry, sx, sy, sz, rx, rz);
  m.premultiply(A.xform);
  return m;
}

function addStandalone(root, disp, mesh) {
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  disp.meshes.push(mesh);
}

/**
 * A projecting blade sign, mounted on a bracket off a street facade and facing
 * up-street toward the hero camera. The board is a thin double-sided textured
 * plane; the bracket arm + diagonal stay are merged into the metal batch. No
 * collision — the whole thing lives above the doorway.
 */
function bladeSign(A, root, disp, rng, sign, aniso) {
  const wallX = sign.side === 'W' ? -STREET.kerb : STREET.kerb; // -6.5 / +6.5
  const dir = sign.side === 'W' ? 1 : -1; // into the street
  const w = sign.w;
  const h = sign.h;
  const gap = 0.14; // clear of the wall face
  const cx = wallX + dir * (gap + w / 2);
  const cy = sign.y; // board centre height
  const z = sign.z;
  const topY = cy + h / 2;

  // face
  const { texture } = makeSignTexture(sign, rng, aniso);
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = makeSignMaterial(sign, texture);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `nerdcon_sign_${sign.id}`;
  mesh.matrix.copy(worldMatrix(A, cx, cy, z, 0));
  addStandalone(root, disp, mesh);
  disp.geometries.push(geo);
  disp.materials.push(mat);
  disp.textures.push(texture);

  // bracket: a wall plate, a top arm out to the board, and a diagonal stay.
  // (`mat` is handed back so the runtime can drive its emissive — see below.)
  const armLen = gap + w + 0.06;
  const armY = topY + 0.05;
  A.addBox('metal_dark', BOX_FINE(A), wallX + dir * 0.06, armY, z, 0, 0.1, 0.16, 0.16, {
    masks: [0.9, 0.5, 0.1],
  });
  A.addBox('nerdcon_board', BOX_FINE(A), wallX + dir * (armLen / 2), armY, z, 0, armLen, 0.05, 0.05, {
    masks: [0.9, 0.5, 0.1],
  });
  // diagonal stay from low on the wall up to the outer end of the arm (rz tilt)
  const stayDx = armLen;
  const stayDy = 0.5;
  const stayLen = Math.hypot(stayDx, stayDy);
  const stayRz = dir * Math.atan2(stayDy, stayDx);
  A.add(
    'metal_rust',
    BOX_THIN(A),
    LL(IDENT, wallX + dir * (armLen / 2), armY - stayDy / 2, z, 0, stayLen, 0.035, 0.035, 0, stayRz),
    { masks: [0.95, 0.55, 0.1] }
  );
  return mat;
}

// ================================================================ banners ==

/** Cable y at world-x, following the same catenary the tube uses. */
function cableYAt(cable, x) {
  const [x0, y0, z0, x1, y1, z1, sag] = cable;
  const t = Math.abs(x1 - x0) < 1e-4 ? 0.5 : (x - x0) / (x1 - x0);
  const K = Math.cosh(1.5) - 1;
  const droop = (Math.cosh(1.5) - Math.cosh((t - 0.5) * 3)) / K;
  return { y: y0 + (y1 - y0) * t - sag * droop, z: z0 + (z1 - z0) * t };
}

/**
 * A NerdCon fabric banner slung under an existing overhead cable, spanning the
 * street and facing up-street. Built from the world's own cloth generator so it
 * bellies and creases like the laundry two spans over; canvas-text material,
 * hung with a few tie strings up to the wire.
 */
function banner(A, root, disp, rng, cable, spec, aniso) {
  const [x0, , z0, x1, , z1] = cable;
  const w = spec.w;
  const h = spec.h;
  const midX = (x0 + x1) / 2;
  const top = cableYAt(cable, midX);
  // Hang a clear span below the wire so the tie strings actually read as the
  // thing holding it up, instead of the banner appearing welded to the cable.
  const cy = top.y - 0.2 - h / 2;
  const cz = top.z;

  // canvas
  const W = Math.min(1400, Math.round(w * 200));
  const H = Math.min(420, Math.round(h * 220));
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');
  g.fillStyle = spec.bg;
  g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.14)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  grd.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // A faint printed trim, not a bright keyline: a low-contrast dark inset a few
  // percent in from the hem, so the banner reads as printed vinyl rather than a
  // composited UI panel with a white border.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = Math.max(2, H * 0.02);
  const m = H * 0.16;
  g.strokeRect(m, m, W - m * 2, H - m * 2);
  drawLines(g, W, H, spec.lines, {
    family: MONO,
    weight: '800',
    condense: spec.condense ?? 1,
    track: spec.track ?? 0.05,
    ink: spec.ink ?? C.white,
    fill: 0.7,
  });
  weather(g, W, H, spec.bg, rng, { light: true });
  const texture = texFrom(cv, aniso);

  const geo = clothGeometry(w, h, {
    segX: 16,
    segY: 8,
    // A deeper catenary + belly so the banner visibly hangs and creases like the
    // laundry two spans over, instead of hovering flat like a panel.
    sag: 0.28,
    wrinkle: 0.045,
    bulge: 0.09,
    twist: 0.04,
    thickness: 0.004,
    rng,
    hem: 1,
  });
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    // Scene light carries the vinyl by day; only a whisper of self-glow, so it
    // stays legible at the dusk default without reading as a lit UI panel.
    emissiveIntensity: 0.09,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `nerdcon_banner_${spec.id}`;
  mesh.matrix.copy(worldMatrix(A, midX, cy, cz, 0));
  addStandalone(root, disp, mesh);
  disp.geometries.push(geo);
  disp.materials.push(mat);
  disp.textures.push(texture);

  // Grommets laced to the wire with tie cords. Five evenly spaced ties across the
  // span, each a dark cord from a brass hem eyelet up to the cable — the visible
  // connection that seats the banner on the span instead of floating it.
  const topEdge = cy + h / 2;
  for (const f of [-0.44, -0.22, 0, 0.22, 0.44]) {
    const tx = midX + f * w;
    const cAt = cableYAt(cable, tx);
    const len = Math.max(0.05, cAt.y - topEdge + 0.02);
    // the cord
    A.addBox('metal_dark', BOX_THIN(A), tx, topEdge + len / 2, cAt.z, 0, 0.014, len, 0.014, {
      masks: [0.4, 0.6, 0.2],
    });
    // the eyelet / grommet punched through the banner hem
    A.addBox('metal_rust', BOX_FINE(A), tx, topEdge - 0.015, cz + 0.006, 0, 0.055, 0.055, 0.02, {
      masks: [0.9, 0.5, 0.2],
    });
  }
}

// =============================================================== ticker ==

/**
 * The loop. Deadpan wire-service copy for the old financial quarter: the
 * numbers move, nothing changes. Trailing separator so the string tiles into
 * itself with no join to hide.
 */
const TICKER_COPY =
  'LEGACY CORE ▼ 12.4 · INTERCHANGE ▲ 2.9 · T+2 UNCH · STABLECOIN ▲ 0.99 · ' +
  'CHARGEBACKS ▲ 18.7 · BATCH WINDOW CLOSED · MT-103 DELAYED · ' +
  'CORE MIGRATION SLIPS TO Q4 2031 · THE LEDGER HOLDS · ';

/**
 * Emissive level of the ticker glyphs at rest (before the mains-hum wobble).
 * Measured against the dusk grade: at 1.5 the tape's peak luminance is 251/255
 * and the gold starts washing toward white; at 0.75 it peaks around 245, stays
 * hue-saturated, and still sits well clear of the two blade signs (glow neon
 * 0.5, wayfinder 0.2) so the street's brightness order stays honest.
 */
const TICKER_EMISSIVE = 0.75;
/** How fast the tape reads, in metres of board per second. */
const TICKER_SPEED = 1.1;

/** Cable height at normalised span position t — the catenary `cableYAt` uses. */
function cableYAtT(cable, t) {
  const [, y0, , , y1, , sag] = cable;
  const K = Math.cosh(1.5) - 1;
  const droop = (Math.cosh(1.5) - Math.cosh((t - 0.5) * 3)) / K;
  return y0 + (y1 - y0) * t - sag * droop;
}

/**
 * Paint the ticker tape ONCE, at a size that tiles exactly.
 *
 * The whole point of a scrolling ticker is that it costs nothing per frame: the
 * canvas is rasterised at load and never touched again, and the animation is a
 * single write to `texture.offset.x` — a uniform, not an upload. That only
 * works if the canvas tiles seamlessly, so the copy is drawn ONE time,
 * horizontally scaled so a single loop is exactly `W` wide, and repeated at
 * ±W to carry any glyph overhang across the join. Nothing else painted here
 * may vary along x: a horizontal gradient or a radial vignette would put a
 * visible seam on the wall every 27 m of scroll.
 */
function tickerTexture(aniso) {
  // Its own stream. The tape's grime draws ~900 numbers, and the re-dress RNG
  // it would otherwise consume goes on to jitter the Ledger's book stack — a
  // texture detail must not move the monument.
  const rng = new Rng(0x4e4f44_05);
  const W = 8192;
  const H = 128;
  const cv = newCanvas(W, H);
  const g = cv.getContext('2d');

  // The panel ground. This canvas is BOTH the albedo and the emissive map, and
  // at the dusk exposure the emissive term dominates: a nominally "Panel Dark"
  // #0D0D0D ground measured out at sRGB ~90 on screen — a mid-grey card, not a
  // dark board. Anything that is not a lit glyph therefore has to be within a
  // couple of counts of black, and the board's actual DARK colour comes from
  // the albedo + the merged metal housing around it.
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#020202');
  grd.addColorStop(0.42, '#040404');
  grd.addColorStop(1, '#010101');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // dot-matrix ruling — the horizontal gaps between LED rows
  g.fillStyle = 'rgba(255,255,255,0.014)';
  for (let y = 3; y < H; y += 7) g.fillRect(0, y, W, 1);

  const px = Math.round(H * 0.56);
  g.font = `700 ${px}px ${MONO}`;
  g.letterSpacing = `${px * 0.05}px`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const natural = g.measureText(TICKER_COPY).width;
  g.save();
  g.translate(0, H * 0.53);
  g.scale(W / natural, 1); // one loop == exactly one canvas width
  g.fillStyle = C.gold;
  // The +-W copies exist only to carry glyph OVERHANG across the tiling join,
  // so they are drawn flat: a canvas shadow blur over an 8192 px pass costs
  // ~0.25 s each, and all three passes would buy 20 px of extra glow at one
  // wrap point. The lit pass is the one the eye reads.
  for (const k of [-1, 1]) g.fillText(TICKER_COPY, k * natural, 0);
  g.shadowColor = C.gold;
  g.shadowBlur = px * 0.3;
  g.fillText(TICKER_COPY, 0, 0);
  g.restore();
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;

  // Grime: flecks (fine enough that the tiling join is invisible) and a purely
  // vertical grade, which tiles by construction.
  for (let i = 0; i < 420; i++) {
    g.globalAlpha = 0.03 + rng.float() * 0.06;
    g.fillStyle = rng.float() < 0.55 ? '#000' : '#fff';
    const r = rng.float() * 2 + 0.4;
    g.fillRect(rng.float() * W, rng.float() * H, r, r);
  }
  g.globalAlpha = 1;
  const dirt = g.createLinearGradient(0, 0, 0, H);
  dirt.addColorStop(0, 'rgba(0,0,0,0.34)');
  dirt.addColorStop(0.4, 'rgba(0,0,0,0.0)');
  dirt.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = dirt;
  g.fillRect(0, 0, W, H);

  const t = texFrom(cv, aniso);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return { texture: t, W, H };
}

/**
 * A ticker ribbon slung under a facade-run cable, spanning the east alley mouth.
 *
 * Rigid, not cloth: an LED tape is a boxed aluminium extrusion, and giving it
 * the banners' catenary would read as a droopy printed sheet. It hangs off the
 * wire on four cords (merged, near-free) and the extrusion's end caps and top
 * hood are merged too — only the lit face is a standalone mesh.
 *
 * `repeat.x` is derived, not tuned: setting it to the board's aspect ratio over
 * the canvas's aspect ratio makes the texels square, which is the only value
 * where the type neither smears nor pinches.
 */
function tickerBoard(A, root, disp, cable, aniso) {
  const [x0, , z0, , , z1] = cable;
  const span = Math.abs(z1 - z0);
  const w = span - 1.0; // 0.5 m of bare wire at each end
  const h = 0.42;
  const midZ = (z0 + z1) / 2;
  // Hung directly under the wire, so the suspension cords land on the housing
  // instead of beside it. The wire is 10 cm off the building line and this span
  // crosses the alley MOUTH, so there is no facade here to clip into.
  const cx = x0;
  const cy = cableYAtT(cable, 0.5) - 0.2 - h / 2;

  const { texture, W, H } = tickerTexture(aniso);
  texture.repeat.set((w / h) * (H / W), 1);

  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    // Only the gold glyphs carry emission (the panel is near-black in the map),
    // so this is a glow on the type alone: over the bloom knee at dusk, well
    // under the threshold that would blow the letterforms into a white bar.
    emissiveIntensity: TICKER_EMISSIVE,
    roughness: 0.36,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'nerdcon_ticker';
  mesh.matrix.copy(worldMatrix(A, cx, cy, midZ, -Math.PI / 2));
  addStandalone(root, disp, mesh);
  disp.geometries.push(geo);
  disp.materials.push(mat);
  disp.textures.push(texture);

  // The extrusion the tape lives in: a hood over the face and a return under it,
  // plus end caps. Merged, so the whole housing is free.
  const top = cy + h / 2;
  const bot = cy - h / 2;
  A.addBox('metal_dark', BOX_FINE(A), cx + 0.045, top + 0.03, midZ, 0, 0.12, 0.06, w + 0.06, {
    masks: [0.85, 0.5, 0.15],
  });
  A.addBox('metal_dark', BOX_FINE(A), cx + 0.04, bot - 0.025, midZ, 0, 0.1, 0.05, w + 0.06, {
    masks: [0.85, 0.55, 0.2],
  });
  for (const s of [-1, 1]) {
    A.addBox('metal_rust', BOX_FINE(A), cx + 0.04, cy, midZ + s * (w / 2 + 0.02), 0, 0.1, h + 0.05, 0.04, {
      masks: [0.95, 0.5, 0.2],
    });
  }
  // Suspension cords up to the wire. The board is flat and the cable sags, so
  // the cords are all different lengths — which is what sells the wire as load
  // bearing instead of decorative.
  for (const f of [0.16, 0.38, 0.62, 0.84]) {
    const tz = z0 + (z1 - z0) * f;
    const len = Math.max(0.06, cableYAtT(cable, f) - (top + 0.06));
    A.addBox('metal_dark', BOX_THIN(A), cx + 0.04, top + 0.06 + len / 2, tz, 0, 0.014, len, 0.014, {
      masks: [0.4, 0.6, 0.2],
    });
  }

  return { material: mat, texture, rate: TICKER_SPEED * ((H / W) / h) };
}

// ============================================================== the ledger ==

/**
 * THE LEDGER — the plaza centrepiece, "the thing we're defending". A waist-high
 * gold monolith of stacked ledger-book forms on a low stone plinth, self-lit
 * with a subtle emissive the world pulses. Scenery only (no gameplay logic),
 * placed just west of the street centreline so it reads as a monument without
 * blocking the main sightline/lane through the plaza. One collision proxy, like
 * a wreck — the AI flows around it.
 */
function buildLedger(A, rng, x, z) {
  const gY = groundY(x, z);
  // two-tier stone plinth
  A.addBox('nerdcon_plinth', BOX(A), x, gY + 0.11, z, 0, 1.7, 0.22, 1.7, { masks: [0.35, 0.5, 0.6] });
  A.addBox('nerdcon_plinth', BOX(A), x, gY + 0.29, z, 0, 1.42, 0.16, 1.42, { masks: [0.3, 0.45, 0.5] });
  // a thin inlaid gold band around the plinth top — a bloom-friendly glow line
  A.addBox('nerdcon_gold', BOX_FINE(A), x, gY + 0.375, z, 0, 1.46, 0.03, 1.46, { masks: [0.2, 0.2, 0] });

  // stacked ledgers: flat gold "books", each smaller and slightly turned, so
  // the silhouette reads as a stack of ledgers rather than one gold brick.
  let y = gY + 0.4;
  const books = 6;
  for (let i = 0; i < books; i++) {
    const t = i / (books - 1);
    const bw = 1.16 - t * 0.24;
    const bd = 0.84 - t * 0.16;
    const bh = 0.115 - t * 0.012;
    const ry = (rng.float() - 0.5) * 0.16 + (i % 2 ? 0.05 : -0.05);
    const ox = (rng.float() - 0.5) * 0.05;
    const oz = (rng.float() - 0.5) * 0.05;
    const g = chamferBox(bw, bh, bd, 0.02);
    A.addBox('nerdcon_gold', g, x + ox, y + bh / 2, z + oz, ry, 1, 1, 1, {
      masks: [0.18 + rng.float() * 0.1, 0.15, 0.05],
    });
    g.dispose();
    // a slim darker "pages" fillet just under each cover reads as leaves
    A.addBox('nerdcon_plinth', BOX_FINE(A), x + ox, y + bh * 0.5, z + oz, ry, bw * 0.9, bh * 0.42, bd * 0.9, {
      masks: [0.3, 0.6, 0.4],
    });
    y += bh + 0.006;
  }
  // a small gold cap / seal on top
  A.addBox('nerdcon_gold', BOX(A), x, y + 0.06, z, 0.4, 0.34, 0.12, 0.34, { masks: [0.15, 0.15, 0] });

  // ONE collision proxy for the whole monument (waist-high, hugs its footprint)
  A.box('concrete', x, gY + 0.55, z, 1.5, 1.1, 1.5);
}

// ============================================================== flavour ==

/**
 * A cash machine flat against the FEDWIRE & SONS facade — screen faces street.
 * Returns where the display sits so `atmScreen` can hang a live one there.
 */
function buildATM(A, z, side) {
  const wallX = side === 'W' ? -STREET.kerb : STREET.kerb;
  const dir = side === 'W' ? 1 : -1;
  const depth = 0.42;
  const width = 0.66;
  const height = 1.52;
  const cx = wallX + dir * (0.03 + depth / 2);
  const gY = groundY(cx, z);
  const cyBody = gY + height / 2;
  // body
  A.addBox('nerdcon_kiosk', BOX(A), cx, cyBody, z, 0, depth, height, width, { masks: [0.5, 0.4, 0.3] });
  // dark head + shoulders
  A.addBox('metal_dark', BOX_FINE(A), cx + dir * 0.02, gY + height + 0.06, z, 0, depth + 0.05, 0.12, width + 0.05, {
    masks: [0.8, 0.5, 0.2],
  });
  // The display used to be a flat emissive box in the static batch. It is now a
  // live canvas (see `atmScreen`), so all that is merged here is the recess it
  // sits in: bezel, keypad shelf, cash slot.
  const faceX = cx + dir * (depth / 2 + 0.01);
  A.addBox('metal_dark', BOX_FINE(A), faceX - dir * 0.01, gY + 1.14, z, 0, 0.03, 0.3, 0.4, { masks: [0.8, 0.55, 0.2] });
  A.addBox('metal_dark', BOX_FINE(A), faceX, gY + 0.9, z, 0, 0.06, 0.06, 0.3, { masks: [0.7, 0.6, 0.3] });
  A.addBox('metal_dark', BOX_FINE(A), faceX, gY + 1.0, z, 0, 0.05, 0.03, 0.34, { masks: [0.7, 0.6, 0.3] });
  // collision hugging the wall
  A.box('metal', cx, cyBody, z, depth, height, width);
  // Where the glass sits: the bezel above is 3 cm deep and centred 1 cm BEHIND
  // `faceX`, so its front face lands at faceX + 0.005. Anything at faceX itself
  // is inside the bezel and invisible — which is exactly what happened the
  // first time. Sit the display 1.6 cm proud, where the old emissive box's
  // front face was.
  return { screenX: faceX + dir * 0.016, y: gY + 1.14, z, dir };
}

/**
 * Emissive level of the ATM display at rest (before the mains-hum wobble).
 * Measured on the panel ground (not the glyphs) in the dusk grade: the map is
 * both albedo and emissive map, so at 1.1 with a near-black ground the panel
 * still reads sRGB ~26 and the digits blow to a white core. 0.8 keeps the
 * numerals gold.
 */
const ATM_EMISSIVE = 0.8;
const ATM_W = 256;
const ATM_H = 128;

/**
 * The ATM display — a live 256x128 LCD showing the run's balance.
 *
 * Repainting a canvas means a full texture re-upload, so this is gated twice:
 * the caller only asks when the score actually changed, and `paint` refuses to
 * run more than once every 250 ms. Between repaints the mesh costs exactly what
 * any other sign costs. The panel is 2:1 to match the canvas — the recess
 * around it is 0.34 x 0.30 of dark bezel, so the LCD reads as inset rather than
 * stretched to the aperture.
 */
function atmScreen(A, root, disp, at, aniso) {
  const cv = newCanvas(ATM_W, ATM_H);
  const g = cv.getContext('2d');
  const texture = texFrom(cv, aniso);

  /** @param {string} label @param {string} value @param {boolean} dead */
  const paint = (label, value, dead) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Near-black glass. See ATM_EMISSIVE: this canvas is the emissive map as
    // well as the albedo, so a "dark but not black" ground self-lights into a
    // grey card at the dusk exposure. Everything that is not a glyph sits at
    // one or two counts.
    const grd = g.createLinearGradient(0, 0, 0, ATM_H);
    grd.addColorStop(0, '#020304');
    grd.addColorStop(1, '#010102');
    g.fillStyle = grd;
    g.fillRect(0, 0, ATM_W, ATM_H);
    g.fillStyle = 'rgba(255,255,255,0.012)';
    for (let y = 2; y < ATM_H; y += 4) g.fillRect(0, y, ATM_W, 1);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (dead) {
      // The death copy from the contract, in the threat hue.
      g.font = `700 26px ${MONO}`;
      g.letterSpacing = '1px';
      g.shadowColor = C.magenta;
      g.shadowBlur = 12;
      g.fillStyle = C.magenta;
      g.fillText('INSUFFICIENT', ATM_W / 2, ATM_H * 0.36);
      g.fillText('FUNDS', ATM_W / 2, ATM_H * 0.68);
    } else {
      g.font = `700 20px ${MONO}`;
      g.letterSpacing = '4px';
      g.shadowColor = C.cyan;
      g.shadowBlur = 8;
      g.fillStyle = C.cyan;
      g.fillText(label, ATM_W / 2, ATM_H * 0.29);
      // Score is value, and value is Loot Gold.
      let px = 46;
      g.shadowColor = C.gold;
      g.shadowBlur = 7;
      g.fillStyle = C.gold;
      g.letterSpacing = '2px';
      do {
        g.font = `800 ${px}px ${MONO}`;
        px -= 2;
      } while (px > 14 && g.measureText(value).width > ATM_W * 0.86);
      g.fillText(value, ATM_W / 2, ATM_H * 0.68);
    }
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    texture.needsUpdate = true;
  };

  paint('BALANCE', '0', false);

  const w = 0.34;
  const h = (w * ATM_H) / ATM_W; // 0.17 — square texels, inset in the recess
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: ATM_EMISSIVE,
    // Matte anti-glare glass. (Measured: the specular/env term is NOT what was
    // washing this panel — zeroing `envMapIntensity` moved it by 3/255, while
    // zeroing the emissive moved it by 70. The ground colour in the canvas was
    // the culprit. Kept matte anyway; a mirror-finish ATM screen would be wrong.)
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'nerdcon_atm_screen';
  // Face into the street: normal = (dir, 0, 0), and the plane's local +X lands
  // on the viewer's right so the type is not mirrored.
  mesh.matrix.copy(worldMatrix(A, at.screenX, at.y, at.z, at.dir * (Math.PI / 2)));
  addStandalone(root, disp, mesh);
  // A 34 x 17 cm panel contributes nothing to any cascade; skip four shadow draws.
  mesh.userData.owNoShadow = true;
  disp.geometries.push(geo);
  disp.materials.push(mat);
  disp.textures.push(texture);

  return { material: mat, paint };
}

/** A stack of PDF-statement boxes dumped outside a paper-heavy shop. */
function paperStack(A, rng, x, z, ry) {
  const boxes = ['box_card_a', 'box_card_b'];
  const gY = groundY(x, z);
  const n = rng.int(2, 3);
  let y = gY;
  for (let i = 0; i < n; i++) {
    const id = rng.pick(boxes);
    A.put(id, x + (rng.float() - 0.5) * 0.08, y + 0.02, z + (rng.float() - 0.5) * 0.08, ry + (rng.float() - 0.5) * 0.4, 1, [
      1,
      1.2,
      1,
    ]);
    y += 0.34;
  }
  // a loose flat one leaning at the base
  if (A.has('crate_flat')) {
    A.put('crate_flat', x + (rng.float() - 0.5) * 0.9, gY + 0.03, z + (rng.float() - 0.5) * 0.9, rng.float() * 6.28, 1, [1, 1.3, 1]);
  }
}

// ================================================================ registry ==

/**
 * The whole re-dress. Called last in the world build (after every existing
 * dressing pass) so nothing it does perturbs the placement RNG stream of the
 * street it sits on. Its own randomness comes from a dedicated seed.
 *
 * Returns the handful of materials/textures the WorldSystem drives every frame
 * (see `_animateSignage`). Handing back references rather than letting the
 * runtime go fishing through the scene graph keeps the per-frame path to a
 * fixed set of property writes with no traversal and no allocation.
 *
 * @param {object} opts { anisotropy }
 */
export function dressNerdcon(A, root, disp, opts = {}) {
  const rng = new Rng(0x4e4f44_01); // "NOD"
  const cables = SET_PIECES.cables;
  const aniso = opts.anisotropy ?? 8;
  const fx = { neon: null, wayfind: null, ticker: null, atm: null };

  // ---- shop / wall signage ------------------------------------------------
  // Legacy trades read as weathered condensed caps; two modern intruders get
  // mono glow. Placed on both facades, facing up-street toward the hero camera.
  const Y = 2.4; // board centre — above the shopfront doors, below the setback
  const SIGNS = [
    // west row (x = -6.5, facing into the street)
    { id: 'cobol', side: 'W', z: 26.5, y: Y, w: 1.35, h: 0.78, lines: ['COBOL BROS', 'SINCE 1959'], skin: LEGACY_BOARDS[4] },
    { id: 'mt103', side: 'W', z: 15.0, y: Y, w: 1.25, h: 0.62, lines: ['MT-103 CAFÉ'], skin: LEGACY_BOARDS[2] },
    { id: 'fedwire', side: 'W', z: -1.5, y: Y + 0.05, w: 1.5, h: 0.72, lines: ['FEDWIRE', '& SONS'], skin: LEGACY_BOARDS[3] },
    { id: 'chargeback', side: 'W', z: -18.5, y: Y, w: 1.4, h: 0.74, lines: ['CHARGEBACK', 'BAIL BONDS'], skin: LEGACY_BOARDS[0] },
    { id: 'tplus2', side: 'W', z: -33.5, y: Y, w: 1.35, h: 0.66, lines: ['T+2 FREIGHT CO'], skin: LEGACY_BOARDS[5] },
    // east row (x = +6.5)
    { id: 'wireroom', side: 'E', z: 27.0, y: Y, w: 1.2, h: 0.6, lines: ['WIRE ROOM'], skin: LEGACY_BOARDS[1] },
    { id: 'kyc', side: 'E', z: 15.0, y: Y, w: 1.3, h: 0.66, lines: ['KYC BODEGA'], skin: LEGACY_BOARDS[4] },
    { id: 'stablecoin', side: 'E', z: -4.0, y: Y + 0.08, w: 1.45, h: 0.72, style: 'glow', neon: C.magenta, lines: ['STABLECOIN', 'LIQUORS'] },
    { id: 'interchange', side: 'E', z: -21.0, y: Y, w: 1.45, h: 0.74, lines: ['INTERCHANGE MKT', '2.9% + 30¢'], skin: LEGACY_BOARDS[3] },
    { id: 'expo', side: 'E', z: -37.0, y: Y + 0.1, w: 1.5, h: 0.6, style: 'wayfind', lines: ['NERDCON', 'EXPO HALL →'] },
  ];
  for (const s of SIGNS) {
    const mat = bladeSign(A, root, disp, rng, s, aniso);
    if (s.id === 'stablecoin') fx.neon = mat;
    if (s.id === 'expo') fx.wayfind = mat;
  }

  // ---- NerdCon banners across the overhead cables -------------------------
  // cables (level z): #0 ~z11 (plaza), #1 ~z-1, #2 ~z-15, #3 ~z-29
  banner(A, root, disp, rng, cables[0], {
    id: 'hold', w: 5.0, h: 1.35, bg: C.magenta, lines: ['HOLD THE LEDGER'], track: 0.08,
  }, aniso);
  banner(A, root, disp, rng, cables[1], {
    id: 'nerdcon', w: 5.4, h: 1.4, bg: C.blue, lines: ['FINTECH NERDCON'], track: 0.06,
  }, aniso);
  banner(A, root, disp, rng, cables[2], {
    id: 'date', w: 5.2, h: 1.3, bg: C.blue, lines: ['NOV 19–20 · SAN DIEGO'], track: 0.03, condense: 0.96,
  }, aniso);
  banner(A, root, disp, rng, cables[3], {
    id: 'nerdcon2', w: 5.0, h: 1.3, bg: C.blue, lines: ['FINTECH NERDCON'], track: 0.06,
  }, aniso);

  // ---- the ticker ---------------------------------------------------------
  // Cable #5 runs along the east facades over the alley mouth and carried
  // nothing. It carries the tape now.
  fx.ticker = tickerBoard(A, root, disp, cables[5], aniso);

  // ---- THE LEDGER ---------------------------------------------------------
  buildLedger(A, rng, -1.7, 8.6);

  // ---- flavour props ------------------------------------------------------
  // ATM at FEDWIRE's north corner pier — clear of the shop's mid-facade doorway
  // (W2 is the enterable shop; its opening is mid-span at ~z-1.5).
  fx.atm = atmScreen(A, root, disp, buildATM(A, 3.8, 'W'), aniso);
  paperStack(A, rng, -5.85, 1.2, -0.5); // PDF statements dumped outside FEDWIRE
  paperStack(A, rng, 5.9, 13.6, 0.4); // outside KYC BODEGA
  paperStack(A, rng, 5.85, 18.6, -0.3);

  return fx;
}

// ============================================================== animation ==

/**
 * Deterministic hash of an integer, 0..1. Used for the bad-ballast flicker: the
 * sign has to look randomly faulty and be byte-identical on every capture run,
 * which rules out `Math.random()` and does not justify carrying an Rng into the
 * frame loop.
 */
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Drive every animated emissive in the re-dress. Called once per frame from
 * WorldSystem.update.
 *
 * Everything here is a write to a float uniform (`emissiveIntensity`) or to a
 * texture offset. No material is rebuilt, no texture is re-uploaded, nothing is
 * allocated, and no light exists — which is the whole reason the street can
 * move at all. A punctual light crossing a cull radius recompiles every lit
 * material in the scene (+33-36 programs, 640-900 ms); an emissive uniform is
 * free. See `_addBallast` for the measurements.
 *
 * Restraint is deliberate: this is a rotting financial quarter, not a casino.
 * One sign is properly broken, one wayfinder pulses, and everything else just
 * has the faint unsteadiness of cheap mains-driven kit.
 */
export function animateNerdcon(fx, t, dt) {
  if (!fx) return;

  // --- STABLECOIN LIQUORS: a failing ballast --------------------------------
  // Real bad neon is not a strobe. It runs clean for seconds at a time, then
  // one slot of half-second stutter while the tube fights to strike, with a
  // brief over-bright restrike on the way back. Duty cycle stays ~94% lit.
  if (fx.neon) {
    const slot = Math.floor(t * 2);
    const h = hash1(slot);
    let g = 1;
    if (h > 0.87) {
      const f = t * 2 - slot;
      g = Math.sin(f * 28.3 + h * 40) > -0.15 ? (f < 0.08 ? 1.16 : 1) : 0.16;
    } else if (h > 0.7) {
      g = 0.9 + 0.05 * Math.sin(t * 43.1);
    }
    fx.neon.emissiveIntensity = 0.5 * g;
  }

  // --- NERDCON EXPO HALL →: a directional pulse ----------------------------
  // One material means one uniform, so a per-glyph chase is off the table
  // without a custom shader. A smooth ramp up and a hard snap back is what an
  // LED arrow board actually does, and it reads as travel toward the arrow.
  if (fx.wayfind) {
    const p = (t / 1.15) % 1;
    const ramp = p * p * (3 - 2 * p);
    const tail = p > 0.86 ? (1 - p) / 0.14 : 1;
    fx.wayfind.emissiveIntensity = 0.16 + 0.2 * ramp * tail;
  }

  // --- mains hum on the two LED panels -------------------------------------
  // +-5%, two incommensurate rates so it never reads as a loop. Barely visible
  // on its own; what it kills is the "printed sticker" look of a static screen.
  const hum = 1 + 0.03 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 11.9);
  if (fx.ticker) {
    fx.ticker.material.emissiveIntensity = TICKER_EMISSIVE * hum;
    // The tape. One float write; the canvas was rasterised at load and is never
    // touched again.
    const o = fx.ticker.texture.offset;
    o.x = (o.x + fx.ticker.rate * dt) % 1;
  }
  if (fx.atm) fx.atm.material.emissiveIntensity = ATM_EMISSIVE * hum;
}
