'use strict';
// SCENE 4 — SOMETHING COMPLETELY STUPID. Rocket launcher fired with your back to a wall indoors:
// the backblast launches the shooter across the room, spinning, into the far wall.
// + AFTERMATH tag for the "give me your worst idea" card.

const ROOM = { L: 150, R: 2200, C: 520, F: 1300 };
const SHOOT = { x: 380, h: 430 };
const ENEMY = { x: 1330, h: 420 };
const T_FIRE = 0.72, T_HIT = 1.8;

function drawRoom(ctx, st) {
  const { L, R, C, F } = ROOM;
  seed(1);
  // cut-away slabs above/below
  sfill(ctx, [[-600, -900], [3000, -900], [3000, C], [-600, C]], PAL.oliveDD, 0);
  sfill(ctx, [[-600, F], [3000, F], [3000, 2900], [-600, 2900]], PAL.oliveDD, 0);
  const slabT = [[-600, C - 90], [3000, C - 90], [3000, C], [-600, C]], slabB = [[-600, F], [3000, F], [3000, F + 90], [-600, F + 90]];
  shape(ctx, slabT, '#3a3a2c', PAL.ink, 5); hatch(ctx, slabT, 0.8, 9, 1.5, PAL.ink, 0.9);
  shape(ctx, slabB, '#3a3a2c', PAL.ink, 5); hatch(ctx, slabB, -0.8, 9, 1.5, PAL.ink, 0.9);
  // back wall: wallpaper + wainscot
  sfill(ctx, [[L, C], [R, C], [R, F], [L, F]], '#5b5338', 0);
  ctx.save(); ctx.globalAlpha = 0.35;
  for (let x = L + 30; x < R; x += 60) sline(ctx, x, C + 5, x + rs() * 3, 1040, 6, '#4a432c', 1);
  ctx.restore();
  const wain = [[L, 1050], [R, 1050], [R, F], [L, F]];
  shape(ctx, wain, '#3b3423', PAL.ink, 3.5);
  for (let x = L + 40; x < R - 100; x += 180) spath(ctx, [[x, 1085], [x + 140, 1085], [x + 140, 1255], [x, 1255]], 2, PAL.ink, true);
  hatch(ctx, wain, 0.7, 10, 1.4, PAL.ink, 0.5);
  sline(ctx, L, F - 18, R, F - 18, 4, PAL.ink);
  // window (night) on the far side
  const wx = 1800, wy = 690;
  shape(ctx, [[wx, wy], [wx + 230, wy], [wx + 230, wy + 270], [wx, wy + 270]], PAL.slateD, PAL.ink, 5);
  sline(ctx, wx + 115, wy, wx + 115, wy + 270, 5, PAL.ink); sline(ctx, wx, wy + 135, wx + 230, wy + 135, 5, PAL.ink);
  glow(ctx, wx + 60, wy + 60, 60, PAL.bone, 0.25);
  // clock
  const cl = circlePts(1560, 650, 42, 14);
  shape(ctx, cl, PAL.bone, PAL.ink, 3.5);
  sline(ctx, 1560, 650, 1560, 622, 3, PAL.ink, 0.5); sline(ctx, 1560, 650, 1582, 660, 3, PAL.ink, 0.5);
  // picture frame (can fall)
  ctx.save();
  const pf = st.picFall || 0;
  ctx.translate(1060, 760 + ease.in2(pf) * 470); ctx.rotate((st.picTilt || 0) + pf * 0.6);
  shape(ctx, [[-90, -70], [90, -70], [90, 70], [-90, 70]], PAL.khaki, PAL.ink, 5);
  sfill(ctx, [[-70, -50], [70, -50], [70, 50], [-70, 50]], PAL.olive, 1);
  spath(ctx, [[-60, 40], [-20, -10], [10, 20], [40, -30], [65, 40]], 3, PAL.ink); // little mountain
  ctx.restore();
  // ceiling lamp
  const sw = st.lamp || 0;
  const lx = 840 + Math.sin(sw) * 170, ly = C + Math.cos(sw) * 170;
  sline(ctx, 840, C, lx, ly, 3, PAL.ink, 1);
  ctx.save(); ctx.translate(lx, ly); ctx.rotate(-sw);
  shape(ctx, [[-20, 0], [20, 0], [60, 55], [-60, 55]], PAL.bone, PAL.ink, 3.5);
  ctx.restore();
  glow(ctx, lx, ly + 90, 300, PAL.amber, 0.22);
  // plant
  const pl = st.plantTip || 0;
  ctx.save(); ctx.translate(620, F - 18); ctx.rotate(pl);
  shape(ctx, [[-38, 0], [38, 0], [46, -80], [-46, -80]], PAL.amberD, PAL.ink, 3.5);
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.32 + Math.sin(st.t * 6 + k) * 0.05 * (st.wind || 0);
    const len = 110 + sr(k, 1) * 70;
    const tip = [Math.cos(a) * len, -80 + Math.sin(a) * len];
    shape(ctx, [[0, -80], [tip[0] * 0.5 - 14, -80 + (tip[1] + 80) * 0.5], tip, [tip[0] * 0.5 + 14, -80 + (tip[1] + 80) * 0.5]], PAL.olive, PAL.ink, 2.5);
  }
  ctx.restore();
  // table (enemy hides behind it)
  shape(ctx, [[1170, 1080], [1490, 1080], [1490, 1110], [1170, 1110]], '#4a3a26', PAL.ink, 4);
  for (const x of [1190, 1450]) shape(ctx, [[x, 1110], [x + 22, 1110], [x + 22, F - 18], [x, F - 18]], '#3a2d1e', PAL.ink, 3);
  // end walls (cut)
  const lw_ = [[L - 90, C - 90], [L, C - 90], [L, F + 90], [L - 90, F + 90]], rw = [[R, C - 90], [R + 90, C - 90], [R + 90, F + 90], [R, F + 90]];
  shape(ctx, lw_, '#3a3a2c', PAL.ink, 5); hatch(ctx, lw_, 0.8, 9, 1.5, PAL.ink, 0.9);
  shape(ctx, rw, '#3a3a2c', PAL.ink, 5); hatch(ctx, rw, 0.8, 9, 1.5, PAL.ink, 0.9);
  // scorch on the left wall after firing
  if (st.scorch) {
    ctx.save(); ctx.globalAlpha = 0.85;
    sfill(ctx, blobPts(L + 30, 880, 120, 190, 14, 0.3, 5), PAL.ink, 2);
    ctx.restore();
  }
  // impact crater in the right wall
  if (st.crater) {
    const cx = R, cy = st.craterY;
    for (let k = 0; k < 9; k++) {
      const a = Math.PI / 2 + (k / 8 - 0.5) * Math.PI * 1.6;
      const L1 = 60 + sr(k, 3) * 160;
      spath(ctx, [[cx - 10, cy], [cx - 10 + Math.cos(a) * L1 * 0.5 - 20, cy + Math.sin(a) * L1 * 0.5], [cx - 10 + Math.cos(a) * L1 - 30, cy + Math.sin(a) * L1]], 3, PAL.ink, false);
    }
    sfill(ctx, blobPts(cx - 6, cy, 34, 120, 10, 0.25, 8), PAL.ink, 1.5);
  }
}

// shooter: ragdoll-ish flight in local space, then embedded headfirst in the far wall
function shooterPose(ctx, tq, st) {
  const h = SHOOT.h;
  if (st.phase === 'kneel') {
    return sideFigure(ctx, { x: SHOOT.x, y: ROOM.F - 18 - h * 0.3, h, dir: 1, lean: 0.05, fN: [SHOOT.x + 0.17 * h, ROOM.F - 18 - 0.03 * h], fF: [SHOOT.x - 0.2 * h, ROOM.F - 18 - 0.02 * h],
      weapon: { kind: 'rpg', ang: -0.04 }, gear: 'op', body: PAL.ink, rim: PAL.amber, rimOff: [5, -4], detail: '#3b372a' });
  }
  ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot);
  if (st.clipX) {
    // only the part outside the wall is visible
    ctx.restore(); ctx.save();
    ctx.beginPath(); ctx.rect(-5000, -5000, st.clipX + 5000, 10000); ctx.clip();
    ctx.translate(st.x, st.y); ctx.rotate(st.rot);
  }
  const fl = st.flail;
  const fN = [Math.sin(fl * 1.3) * 0.28 * h + st.legFwd * h, 0.38 * h + Math.cos(fl) * 0.1 * h];
  const fF = [Math.sin(fl * 1.3 + 2) * 0.28 * h + st.legFwd * h, 0.4 * h + Math.cos(fl + 1) * 0.1 * h];
  const info = sideFigure(ctx, { x: 0, y: 0, h, dir: 1, lean: 0, fN, fF, kneeBend: -1,
    weapon: st.launcher ? { kind: 'rpg', ang: -0.15 + Math.sin(fl) * 0.2 } : null,
    hN: st.launcher ? null : [Math.sin(fl * 1.7) * 0.3 * h, -0.5 * h + Math.cos(fl) * 0.1 * h],
    hF: st.launcher ? null : [Math.sin(fl * 1.7 + 1) * 0.3 * h - 0.1 * h, -0.55 * h],
    gear: st.helmet ? 'op' : 'none', body: PAL.ink, rim: PAL.amber, rimOff: [-5, -4], detail: '#3b372a' });
  ctx.restore();
  return info;
}

function explosion(ctx, x, y, age, scale, s0) {
  if (age < 0) return;
  const k = age;
  seed(s0);
  glow(ctx, x, y, scale * (2.5 + k * 2), PAL.amber, clamp(0.9 - k * 0.6));
  for (let i = 0; i < 14; i++) {
    const a = sr(i, s0) * TAU, d = scale * (0.2 + ease.out(clamp(k * 2.2)) * (0.8 + sr(i, s0 + 1) * 0.9));
    const px = x + Math.cos(a) * d * 1.2, py = y + Math.sin(a) * d - k * scale * 0.4;
    const rr = scale * (0.35 + sr(i, s0 + 2) * 0.35) * (0.6 + k);
    const hot = clamp(1 - k * 1.8);
    puff(ctx, px, py, rr, mix('#6f6a5c', PAL.amber, hot), mix('#45423a', PAL.amberD, hot), PAL.ink, i + s0, 3);
  }
  if (k < 0.35) {
    const pts = [];
    for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU, L = scale * (i % 2 ? 0.5 : 1.1 + r() * 0.6) * (0.7 + k * 2); pts.push([x + Math.cos(a) * L, y + Math.sin(a) * L]); }
    sfill(ctx, pts, PAL.amber, 2); sfill(ctx, pts.map(([a, b]) => [x + (a - x) * 0.5, y + (b - y) * 0.5]), PAL.hot, 2);
    spath(ctx, pts, 3, PAL.ink, true);
  }
}

SCENES.stupid = {
  dur: 2.8, seed: 4,
  draw(ctx, t, tq) {
    const fired = tq >= T_FIRE;
    const u = seg(tq, T_FIRE, T_HIT);
    const hit = tq >= T_HIT;
    const h = SHOOT.h;
    // flight path (hip)
    const fx = lerp(SHOOT.x, ROOM.R - 0.42 * h, Math.pow(u, 0.85));
    const fy = lerp(ROOM.F - 18 - h * 0.3, 860, Math.sin(u * Math.PI * 0.75) * 1.05);
    const rot = u * (Math.PI / 2 + Math.PI * 4);

    // camera
    let cx, cy = 930, z;
    const setup = ease.inOut(seg(t, 0, T_FIRE));
    if (!fired) { cx = lerp(860, 820, setup); z = lerp(0.98, 1.04, setup); }
    else if (!hit) { const k = ease.out(seg(t, T_FIRE, T_FIRE + 0.4)); cx = lerp(820, fx + 120, k); z = lerp(1.04, 0.86, k); }
    else { const k = ease.out(seg(t, T_HIT, T_HIT + 0.5)); cx = lerp(ROOM.R - 0.42 * h + 120, 1820, k); z = lerp(0.86, 1.02, k); }
    const blastK = fired ? Math.exp(-(t - T_FIRE) * 6) : 0, hitK = hit ? Math.exp(-(t - T_HIT) * 5) : 0;
    const sh = shake(t, 3 + blastK * 45 + hitK * 60, 16, 41);
    const roll = (fired && !hit ? 0.06 * Math.sin(t * 5) : 0) + hitK * 0.08;

    ctx.fillStyle = PAL.oliveDD; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sh[0], H / 2 + sh[1]); ctx.rotate(roll); ctx.scale(z, z); ctx.translate(-cx, -cy);
    RNG.J = 2.2;

    const st = { t: tq, lamp: Math.sin(tq * 2) * 0.05 + (fired ? 0.8 * Math.exp(-(tq - T_FIRE) * 1.4) * Math.sin((tq - T_FIRE) * 9) : 0),
      picTilt: fired ? 0.25 * Math.sin((tq - T_FIRE) * 12) * Math.exp(-(tq - T_FIRE) * 2) + (hit ? 0.2 : 0) : 0,
      plantTip: fired ? Math.min(1.35, (tq - T_FIRE) * 9) * (tq - T_FIRE > 0.05 ? 1 : 0) : 0, wind: fired ? 1 : 0,
      scorch: fired, crater: hit, craterY: fy };
    drawRoom(ctx, st);

    // enemy behind the table: aims, then ducks as the human missile passes
    seed(70);
    const passK = seg(fx, ENEMY.x - 500, ENEMY.x - 150);
    const duck = fired ? ease.out(passK) : 0;
    const eY = ROOM.F - 18;
    sideFigure(ctx, { x: ENEMY.x, y: eY - ENEMY.h * (0.5 - duck * 0.18), h: ENEMY.h, dir: -1, lean: -0.1 - duck * 0.5,
      fN: [ENEMY.x - 0.08 * ENEMY.h, eY - 0.02 * ENEMY.h], fF: [ENEMY.x + 0.06 * ENEMY.h, eY - 0.02 * ENEMY.h],
      weapon: duck < 0.3 ? { kind: 'pistol', ang: 0.05 } : null,
      hN: duck >= 0.3 ? [ENEMY.x - 0.05 * ENEMY.h, eY - ENEMY.h * 0.95 + duck * 0.2 * ENEMY.h] : null,
      hF: duck >= 0.3 ? [ENEMY.x + 0.08 * ENEMY.h, eY - ENEMY.h * 0.95 + duck * 0.2 * ENEMY.h] : null,
      gear: 'goon', body: PAL.ink, rim: PAL.bone, rimOff: [5, -4], detail: '#3b372a' });
    // table front again so he is behind it
    seed(71);
    shape(ctx, [[1170, 1080], [1490, 1080], [1490, 1110], [1170, 1110]], '#4a3a26', PAL.ink, 4);
    shape(ctx, [[1190, 1110], [1470, 1110], [1470, 1180], [1190, 1180]], '#3a2d1e', PAL.ink, 3);

    // backblast
    if (fired) {
      explosion(ctx, ROOM.L + 70, 880, (tq - T_FIRE) * 1.4, 190, 900);
    }
    // smoke trail behind the flier
    if (fired && !hit) {
      seed(80);
      for (let i = 0; i < 10; i++) {
        const uu = clamp(u - i * 0.05);
        const px = lerp(SHOOT.x, ROOM.R - 0.42 * h, Math.pow(uu, 0.85)), py = lerp(ROOM.F - 18 - h * 0.3, 860, Math.sin(uu * Math.PI * 0.75) * 1.05);
        ctx.save(); ctx.globalAlpha = 0.75 - i * 0.06;
        puff(ctx, px - 30, py - 40 + Math.sin(i * 2) * 20, 50 + i * 9, '#7a7464', '#55503f', PAL.ink, 300 + i, 2.5);
        ctx.restore();
      }
      speedLinear(ctx, Math.PI, 26, PAL.ink, 6, 0.6, [fx - 900, 560, fx + 200, 1280]);
      // flying papers
      for (let i = 0; i < 8; i++) {
        const k = (tq - T_FIRE) * (300 + sr(i, 1) * 400);
        const px = 700 + sr(i, 2) * 700 + k, py = 700 + sr(i, 3) * 400 + Math.sin(tq * 9 + i) * 40;
        ctx.save(); ctx.translate(px, py); ctx.rotate(tq * 7 + i);
        shape(ctx, [[-22, -16], [22, -16], [22, 16], [-22, 16]], PAL.paper, PAL.ink, 2); ctx.restore();
      }
    }

    // the shooter
    seed(90);
    let info;
    if (!fired) info = shooterPose(ctx, tq, { phase: 'kneel' });
    else if (!hit) {
      info = shooterPose(ctx, tq, { phase: 'fly', x: fx, y: fy, rot, flail: tq * 22, legFwd: 0, launcher: true, helmet: u < 0.25 });
      // rear of the tube keeps blasting like a jetpack
      if (info && info.rear) { /* local coords — skip */ }
      // helmet pops off and tumbles
      if (u >= 0.25) {
        const hu = (tq - lerp(T_FIRE, T_HIT, 0.25));
        ctx.save(); ctx.translate(lerp(SHOOT.x, ROOM.R, 0.3) + hu * 500, 760 - hu * 300 + hu * hu * 1400); ctx.rotate(hu * 14);
        shape(ctx, [[-36, 6], [-34, -18], [-18, -32], [0, -36], [18, -32], [34, -18], [36, 6]], PAL.ink, PAL.ink, 2);
        sline(ctx, -30, -20, 10, -34, 3, PAL.amber, 1);
        ctx.restore();
      }
    } else {
      const ht = tq - T_HIT;
      const droop = clamp(ht * 3);
      info = shooterPose(ctx, tq, { phase: 'stuck', x: ROOM.R - 0.42 * h + Math.min(ht * 40, 12), y: fy, rot: Math.PI / 2 + droop * 0.12, flail: 0.4 + Math.sin(ht * 40) * Math.exp(-ht * 4) * 1.2, legFwd: droop * 0.25, launcher: false, helmet: false, clipX: ROOM.R });
      // launcher clatters to the floor
      const lu = clamp(ht / 0.35);
      ctx.save(); ctx.translate(ROOM.R - 260 - lu * 80, lerp(fy, ROOM.F - 40, ease.in2(lu))); ctx.rotate(lu * 2.6);
      shape(ctx, [[-140, -14], [150, -14], [170, 0], [150, 14], [-140, 14]], PAL.ink, PAL.ink, 2); ctx.restore();
      // debris + dust
      seed(95);
      for (let i = 0; i < 16; i++) {
        const a = Math.PI * (0.6 + sr(i, 1) * 0.8), sp = 300 + sr(i, 2) * 700;
        const px = ROOM.R - 10 + Math.cos(a) * sp * ht, py = fy + Math.sin(a) * sp * ht * 0.6 + 1500 * ht * ht;
        if (py > ROOM.F - 20) continue;
        ctx.save(); ctx.translate(px, py); ctx.rotate(ht * 10 + i);
        shape(ctx, [[-10, -8], [12, -6], [8, 9], [-9, 7]], PAL.khaki, PAL.ink, 2); ctx.restore();
      }
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.globalAlpha = clamp(0.8 - ht);
        puff(ctx, ROOM.R - 60 - i * 40, fy - 120 + i * 50, 60 + ht * 120, '#8a8270', '#5d5848', PAL.ink, 500 + i, 2.5);
        ctx.restore();
      }
    }
    ctx.restore();

    // whip-pan smear + impact frame
    seed(99);
    if (fired && !hit) speedLinear(ctx, Math.PI, 30, PAL.ink, 7, 0.45);
    if (fired && tq - T_FIRE < 0.17) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba(PAL.amber, 0.7 * (1 - (tq - T_FIRE) / 0.17)); ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (hit && tq - T_HIT < 0.09) {
      // one inverted "impact" drawing
      ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = PAL.paper; ctx.fillRect(0, 0, W, H); ctx.restore();
      speedRadial(ctx, 700, 930, 50, 150, 1400, PAL.ink, 9, 0.8);
    }
  },
};

SCENES.aftermath = {
  dur: 1.9, seed: 5,
  draw(ctx, t, tq) {
    const h = SHOOT.h, fy = 860;
    const cx = lerp(1640, 1660, t), z = lerp(0.78, 0.8, t), cy = 930;
    ctx.fillStyle = PAL.oliveDD; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
    RNG.J = 2.2;
    const pf = seg(tq, 0.75, 1.0);
    drawRoom(ctx, { t: tq, lamp: 0.25 * Math.sin(tq * 3.2) * Math.exp(-tq * 0.5), picTilt: 0.35, picFall: pf, plantTip: 1.35, scorch: true, crater: true, craterY: fy });
    // picture smashes
    if (pf >= 1) { seed(3); for (let i = 0; i < 8; i++) { const a = -Math.PI * (0.1 + sr(i, 1) * 0.8), d = (tq - 1.0) * 400 * (0.5 + sr(i, 2)); sline(ctx, 1060 + Math.cos(a) * d, 1280 + Math.sin(a) * d * 0.4, 1060 + Math.cos(a) * d + 12, 1280 + Math.sin(a) * d * 0.4 - 6, 3, PAL.bone, 1); } }
    // enemy slowly peeks over the table
    seed(10);
    const peek = ease.inOut(seg(tq, 0.3, 1.1)), shrug = seg(tq, 1.35, 1.6);
    const eY = ROOM.F - 18;
    sideFigure(ctx, { x: ENEMY.x, y: eY - ENEMY.h * (0.32 + peek * 0.1), h: ENEMY.h, dir: 1, lean: 0.25 - peek * 0.2, headTilt: Math.sin(tq * 2) * 0.1,
      fN: [ENEMY.x + 0.12 * ENEMY.h, eY - 0.02 * ENEMY.h], fF: [ENEMY.x - 0.14 * ENEMY.h, eY - 0.02 * ENEMY.h],
      hN: [ENEMY.x + 0.12 * ENEMY.h, eY - ENEMY.h * (0.62 + shrug * 0.25)], hF: [ENEMY.x - 0.04 * ENEMY.h, eY - ENEMY.h * (0.6 + shrug * 0.25)],
      gear: 'goon', body: PAL.ink, rim: PAL.bone, rimOff: [5, -4] });
    seed(11);
    shape(ctx, [[1170, 1080], [1490, 1080], [1490, 1110], [1170, 1110]], '#4a3a26', PAL.ink, 4);
    shape(ctx, [[1190, 1110], [1470, 1110], [1470, 1180], [1190, 1180]], '#3a2d1e', PAL.ink, 3);
    // stuck shooter, legs twitch once
    seed(20);
    const tw = tq > 1.2 && tq < 1.45 ? Math.sin(tq * 60) * 0.8 : 0;
    shooterPose(ctx, tq, { phase: 'stuck', x: ROOM.R - 0.42 * h + 12, y: fy, rot: Math.PI / 2 + 0.12, flail: 0.4 + tw, legFwd: 0.25, launcher: false, helmet: false, clipX: ROOM.R });
    // launcher on the floor, smoking
    seed(21);
    ctx.save(); ctx.translate(ROOM.R - 340, ROOM.F - 40); ctx.rotate(2.6 + Math.PI);
    shape(ctx, [[-140, -14], [150, -14], [170, 0], [150, 14], [-140, 14]], PAL.ink, PAL.ink, 2); ctx.restore();
    for (let i = 0; i < 4; i++) {
      const k = (tq * 0.7 + i * 0.25) % 1;
      ctx.save(); ctx.globalAlpha = 0.7 * (1 - k);
      puff(ctx, ROOM.R - 470 + Math.sin(k * 6 + i) * 20, ROOM.F - 60 - k * 300, 18 + k * 50, '#8a8270', '#5d5848', PAL.ink, 40 + i, 2);
      ctx.restore();
    }
    // helmet rolls in and wobbles to a stop
    const ru = ease.out(seg(tq, 0.0, 1.0));
    const hx = lerp(900, 1660, ru), wob = Math.sin(tq * 18) * 0.35 * (1 - seg(tq, 0.9, 1.5));
    ctx.save(); ctx.translate(hx, ROOM.F - 22); ctx.rotate(ru < 1 ? (hx - 900) / 36 : wob);
    if (ru >= 1 || true) ctx.rotate(0);
    shape(ctx, [[-36, 0], [-34, -24], [-18, -38], [0, -42], [18, -38], [34, -24], [36, 0]], PAL.ink, PAL.ink, 2);
    sline(ctx, -30, -26, 10, -40, 3, PAL.amber, 1);
    ctx.restore();
    ctx.restore();
  },
};
