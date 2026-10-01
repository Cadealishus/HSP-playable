'use strict';
// SCENE 3 — HOSTAGE RESCUE. Breaching charge blows the door in; the hostage sits under a swinging
// bulb, framed dead-centre by the doorway while the stack pours through.

SCENES.hostage = {
  dur: 2.6, seed: 3,
  draw(ctx, t, tq) {
    const FL = 1.55, CE = -0.92, DZ = 3.0, BZ = 8.0, DW = 0.5, DT = -0.62;
    const blast = 0.4; // lands on the music hit at 5.6s in the cut
    const bt = tq - blast;
    const camz = lerp(-1.4, 1.75, ease.out(seg(t, 0.0, 2.6)));
    const kick = bt > 0 ? Math.exp(-bt * 7) : 0;
    const sh = shake(t, 3 + kick * 40, 14, 31);
    const firing = tq >= 1.5 && tq < 1.75;
    const flashOn = firing && Math.round(tq * 12) % 2 === 0;
    const cam = new Cam3({ x: 0.12, y: -0.08, z: camz, f: 880, cx: 540, cy: 900 });
    const roll = 0.025 * Math.sin(t * 1.6) + kick * 0.05;
    const lw = (s, k = 1) => clamp(s * 0.0055 * k, 1.1, 7);
    RNG.J = 2;

    ctx.fillStyle = PAL.slateD; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(540 + sh[0], 960 + sh[1]); ctx.rotate(roll); ctx.scale(1.08, 1.08); ctx.translate(-540, -960);

    // ---------------- room interior (seen through the door)
    seed(1);
    const room = (pts, col) => { const q = cam.poly(pts); if (q) shape(ctx, q, col, PAL.ink, 3); return q; };
    room([[-2.6, CE, BZ], [2.6, CE, BZ], [2.6, FL, BZ], [-2.6, FL, BZ]], '#3a2f20');
    room([[-2.6, FL, DZ], [2.6, FL, DZ], [2.6, FL, BZ], [-2.6, FL, BZ]], '#2a2218');
    room([[-2.6, CE, DZ], [2.6, CE, DZ], [2.6, CE, BZ], [-2.6, CE, BZ]], '#120f0b');
    room([[-2.6, CE, DZ], [-2.6, CE, BZ], [-2.6, FL, BZ], [-2.6, FL, DZ]], '#251e15');
    room([[2.6, CE, DZ], [2.6, CE, BZ], [2.6, FL, BZ], [2.6, FL, DZ]], '#251e15');
    // boarded window on the back wall
    const win = cam.poly([[-1.9, -0.45, BZ], [-0.9, -0.45, BZ], [-0.9, 0.4, BZ], [-1.9, 0.4, BZ]]);
    if (win) {
      shape(ctx, win, PAL.slate, PAL.ink, 2.5);
      for (const yy of [-0.3, 0.0, 0.25]) {
        const a = cam.p(-2.0, yy, BZ), b = cam.p(-0.8, yy + 0.08, BZ);
        if (a && b) sline(ctx, a[0], a[1], b[0], b[1], 14, PAL.khaki, 1.5);
      }
    }
    const backHatch = cam.poly([[-2.6, 0.5, BZ], [2.6, 0.5, BZ], [2.6, FL, BZ], [-2.6, FL, BZ]]);
    if (backHatch) hatch(ctx, backHatch, 0.75, 8, 1.4, PAL.ink, 0.7);
    // bulb pool
    const swing = 0.08 * Math.sin(tq * 3) + (bt > 0 ? 0.6 * Math.exp(-bt * 1.6) * Math.sin(bt * 7) : 0);
    const bulb3 = [Math.sin(swing) * 0.9, -0.92 + Math.cos(swing) * 0.9, 6.6];
    const bp = cam.p(...bulb3), pool = cam.p(bulb3[0], FL, 6.6);
    if (bp && pool) {
      glow(ctx, pool[0], pool[1], pool[2] * 1.4, PAL.amber, 0.35);
      glow(ctx, bp[0], bp[1], bp[2] * 2.2, PAL.amber, 0.45);
    }

    // ---------------- people + debris inside, back to front
    const items = [];
    // hostage + chair
    items.push({ z: 6.6, f: () => {
      seed(10);
      const p = cam.p(0, FL, 6.6); if (!p) return;
      const s = p[2], h = 1.75 * s;
      // chair back + legs
      const cb = [[-0.24, 0.55], [0.24, 0.55], [0.22, -0.02], [-0.22, -0.02]].map(([x, y]) => [p[0] + x * s, p[1] - (1.45 - y) * s + 0.0]);
      shape(ctx, cb.map(([x, y]) => [x, y + 0.42 * s]), PAL.ink2, PAL.ink, lw(s));
      for (const lx of [-0.22, 0.22]) sline(ctx, p[0] + lx * s, p[1] - 0.48 * s, p[0] + lx * 1.1 * s, p[1], lw(s, 1.4), PAL.ink);
      frontFigure(ctx, { x: p[0], y: p[1] - 0.5 * s, h: h * 0.98, seated: true, arms: 'tied', gear: 'sack', body: '#2a221a', rim: PAL.amber, rimOff: [0, -3],
        fL: [p[0] - 0.12 * s, p[1] - 0.04 * s], fR: [p[0] + 0.12 * s, p[1] - 0.04 * s], tilt: Math.sin(tq * 6) * 0.03 + kick * 0.1 });
      // rope across the chest
      sline(ctx, p[0] - 0.2 * s, p[1] - 0.85 * s, p[0] + 0.2 * s, p[1] - 0.8 * s, lw(s, 1.2), PAL.bone);
      sline(ctx, p[0] - 0.2 * s, p[1] - 0.75 * s, p[0] + 0.2 * s, p[1] - 0.72 * s, lw(s, 1.2), PAL.bone);
    } });
    // captor
    items.push({ z: 6.2, f: () => {
      seed(11);
      const hitT = seg(tq, 1.58, 2.1);
      const fall = ease.out(hitT);
      const p = cam.p(1.25 + fall * 0.5, FL, 6.4 + fall * 0.6); if (!p) return;
      const s = p[2], h = 1.8 * s;
      const hand = [p[0] - 0.42 * h + fall * 0.2 * h, p[1] - 0.8 * h + fall * 0.4 * h];
      frontFigure(ctx, { x: p[0], y: p[1] - 0.52 * h + fall * 0.25 * h, h, gear: 'goon', arms: fall > 0.3 ? 'handsUp' : 'pistolFront', hand, tilt: 0.12 * Math.sin(tq * 4) * (1 - fall) + fall * 0.9,
        body: PAL.ink, rim: PAL.amber, rimOff: [-4, -3] });
    } });
    if (bt <= 0) items.push({ z: DZ + 0.02, f: () => { seed(13); const q = cam.poly([[-DW, DT, DZ + 0.02], [DW, DT, DZ + 0.02], [DW, FL, DZ + 0.02], [-DW, FL, DZ + 0.02]]); if (q) { shape(ctx, q, '#4a3a26', PAL.ink, 4); hatch(ctx, q, 0.3, 9, 1.6, PAL.ink, 0.9); } } });
    // door slab flying in
    if (bt > 0) items.push({ z: DZ + 0.4 + Math.min(bt, 0.7) * 2.3, f: () => {
      seed(12);
      const u = Math.min(bt, 0.7) / 0.7;
      const cz = DZ + 0.4 + ease.out(u) * 1.6, ang = ease.in2(u) * Math.PI / 2;
      const cyy = lerp(0.45, FL - 0.06, ease.in2(u)), cx = -ease.out(u) * 0.9;
      const corners = [[-0.48, -1.06], [0.48, -1.06], [0.48, 1.06], [-0.48, 1.06]].map(([x, y]) => [cx + x * 0.95, cyy + y * Math.cos(ang), cz + y * Math.sin(ang)]);
      const q = cam.poly(corners);
      if (q) { shape(ctx, q, '#4a3a26', PAL.ink, 4); hatch(ctx, q, 0.3, 9, 1.6, PAL.ink, 0.9); }
    } });
    // operators
    const opA = (() => {
      const u = ease.inOut(seg(tq, 0.45, 1.25));
      const x = u < 0.5 ? lerp(-0.82, -0.3, u * 2) : lerp(-0.3, -1.25, (u - 0.5) * 2);
      return { x, z: lerp(2.7, 4.9, u), run: u > 0 && u < 1 ? 1 : 0.15 };
    })();
    const opB = (() => {
      const u = ease.inOut(seg(tq, 0.85, 1.5));
      const x = u < 0.5 ? lerp(0.82, 0.32, u * 2) : lerp(0.32, 0.95, (u - 0.5) * 2);
      return { x, z: lerp(2.5, 4.2, u), run: u > 0 && u < 1 ? 1 : 0.15 };
    })();
    let infoB = null;
    const target = cam.p(1.6, 0.2, 6.2);
    items.push({ z: opA.z, f: () => { seed(20); backRunner(ctx, cam, opA.x, opA.z, tq * TAU * 2.4, { run: opA.run, crouch: true, body: PAL.ink, rim: PAL.steelL, rimOff: [5, -5], detail: '#3a4148', vp: cam.p(0.3, 0.3, 7), rifleLen: 0.26, tilt: 0.04 }); } });
    items.push({ z: opB.z, f: () => { seed(21); infoB = backRunner(ctx, cam, opB.x, opB.z, tq * TAU * 2.4 + 2, { run: opB.run, crouch: true, body: PAL.ink, rim: flashOn ? PAL.amber : PAL.steelL, rimOff: [-5, -5], detail: '#3a4148', vp: target, rifleLen: 0.26, tilt: -0.05 }); } });

    items.sort((a, b) => b.z - a.z);
    const inside = items.filter((i) => i.z >= DZ), outside = items.filter((i) => i.z < DZ);
    for (const it of inside) it.f();

    // bulb itself
    if (bp) {
      const top = cam.p(0, CE, 6.6);
      if (top) sline(ctx, top[0], top[1], bp[0], bp[1], 2, PAL.ink, 1);
      shape(ctx, blobPts(bp[0], bp[1], bp[2] * 0.06, bp[2] * 0.08, 10, 0.05, 3), PAL.hot, PAL.ink, 2);
    }

    // ---------------- end wall with doorway
    seed(30);
    const wallPts = [[-1.15, CE, DZ], [1.15, CE, DZ], [1.15, FL, DZ], [-1.15, FL, DZ]];
    const hole = [[-DW, DT, DZ], [DW, DT, DZ], [DW, FL, DZ], [-DW, FL, DZ]];
    const wq = cam.poly(wallPts), hq = cam.poly(hole);
    if (wq && hq) {
      ctx.fillStyle = '#39444b';
      ctx.beginPath(); tracePts(ctx, wq, 0.5); tracePts(ctx, hq.slice().reverse(), 0.5); ctx.fill('evenodd');
      ctx.save(); ctx.beginPath(); tracePts(ctx, wq, 0); tracePts(ctx, hq.slice().reverse(), 0); ctx.clip('evenodd');
      hatch(ctx, null, 0.8, 9, 1.5, PAL.ink, 0.6, bbox(wq)); ctx.restore();
      // splintered frame
      spath(ctx, [hq[3], hq[0], hq[1], hq[2]], 6, PAL.ink, false);
      if (bt > 0) for (let k = 0; k < 10; k++) {
        const side = k % 2 ? 1 : -1, yy = lerp(DT, FL, sr(k, 1));
        const a = cam.p(side * DW, yy, DZ);
        if (a) sline(ctx, a[0], a[1], a[0] + side * (10 + sr(k, 2) * 26), a[1] + (sr(k, 3) - 0.5) * 30, 3, PAL.bone, 1);
      }
    }
    // ---------------- hallway shell
    seed(31);
    const z0 = cam.z + 0.1;
    const hall = [
      [[[-1.15, CE, z0], [-1.15, CE, DZ], [-1.15, FL, DZ], [-1.15, FL, z0]], '#2e383f'],
      [[[1.15, CE, z0], [1.15, CE, DZ], [1.15, FL, DZ], [1.15, FL, z0]], '#2a3339'],
      [[[-1.15, FL, z0], [1.15, FL, z0], [1.15, FL, DZ], [-1.15, FL, DZ]], '#1d2328'],
      [[[-1.15, CE, z0], [1.15, CE, z0], [1.15, CE, DZ], [-1.15, CE, DZ]], '#11161a'],
    ];
    for (const [pts, col] of hall) {
      const q = cam.poly(pts);
      if (q) { shape(ctx, q, col, PAL.ink, 4); hatch(ctx, q, 1.2, 12, 1.4, PAL.ink, 0.6); }
    }
    for (let z = Math.ceil(z0 * 2) / 2; z < DZ; z += 0.5) {
      const a = cam.p(-1.15, FL, z), b = cam.p(1.15, FL, z);
      if (a && b) sline(ctx, a[0], a[1], b[0], b[1], lw(a[2], 0.5), PAL.ink);
    }
    for (const sgn of [-1, 1]) {
      const a = cam.p(sgn * 1.15, 0.55, z0), b = cam.p(sgn * 1.15, 0.55, DZ);
      if (a && b) sline(ctx, a[0], a[1], b[0], b[1], 4, PAL.ink);
    }
    // flickering ceiling tube
    const fl = sr(Math.floor(tq * 12), 5) > 0.3 ? 1 : 0.2;
    const tube = cam.poly([[-0.06, CE + 0.01, 2.2], [0.06, CE + 0.01, 2.2], [0.06, CE + 0.01, 2.85], [-0.06, CE + 0.01, 2.85]]);
    if (tube) { sfill(ctx, tube, fl > 0.5 ? PAL.steelL : PAL.steel); const c = cam.p(0, CE, 2.5); if (c) glow(ctx, c[0], c[1] + 40, 380, PAL.steelL, 0.22 * fl); }
    // exit sign
    const sg = cam.poly([[-0.25, DT - 0.12, DZ - 0.01], [0.25, DT - 0.12, DZ - 0.01], [0.25, DT - 0.02, DZ - 0.01], [-0.25, DT - 0.02, DZ - 0.01]]);
    if (sg) { shape(ctx, sg, PAL.red, PAL.ink, 2); glow(ctx, (sg[0][0] + sg[1][0]) / 2, sg[0][1], 70, PAL.red, 0.4); }

    for (const it of outside) it.f();

    // ---------------- gunfire from op B
    if (firing && infoB && infoB.muzzle && flashOn) {
      seed(40);
      muzzle(ctx, infoB.muzzle[0], infoB.muzzle[1], -Math.PI / 2, 40, true);
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba(PAL.amber, 0.12); ctx.fillRect(0, 0, W, H); ctx.restore();
    }

    // ---------------- breach smoke + splinters
    if (bt > 0) {
      seed(50);
      for (let i = 0; i < 16; i++) {
        const side = sr(i, 1) < 0.5 ? -1 : 1;
        const age = bt - sr(i, 2) * 0.15;
        if (age <= 0) continue;
        const x = side * (0.6 + age * (0.5 + sr(i, 3) * 0.5)), y = lerp(DT, FL, sr(i, 4)) - age * 0.35, z = DZ - 0.1 - age * (0.3 + sr(i, 5) * 0.6);
        const p = cam.p(x, y, z); if (!p) continue;
        const rr = p[2] * (0.18 + age * 0.35) * (0.7 + sr(i, 6) * 0.5);
        ctx.save(); ctx.globalAlpha = clamp(1.2 - age * 0.6) * 0.6;
        puff(ctx, p[0], p[1], rr, '#7d878a', '#596367', null, i);
        puff(ctx, p[0] + rr * 0.5, p[1] - rr * 0.3, rr * 0.7, '#8a9394', '#667073', null, i + 50);
        ctx.restore();
      }
      if (bt < 0.6) for (let i = 0; i < 18; i++) {
        const a = sr(i, 7) * TAU, sp = 300 + sr(i, 8) * 900;
        const p0 = cam.p(0, 0.4, DZ); if (!p0) break;
        const x = p0[0] + Math.cos(a) * sp * bt * 1.6, y = p0[1] + Math.sin(a) * sp * bt * 1.6 + 400 * bt * bt;
        sline(ctx, x, y, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 4, PAL.bone, 1);
      }
    }
    ctx.restore();
    // breach flash
    if (bt >= 0 && bt < 0.25) {
      const k = 1 - bt / 0.25;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(PAL.hot, 0.85 * k); ctx.fillRect(0, 0, W, H); ctx.restore();
      seed(60); speedRadial(ctx, 540, 860, 40, 200, 1300, PAL.ink, 8, 0.7 * k);
    }
  },
};
