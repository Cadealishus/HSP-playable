// Automated movement checks, run in the harness:
//   node tools/shoot.mjs --eval "import('/src/player/movementTests.js').then(m => m.run(__fps))"
// Every test drives the real input path with __fps.hold([...actions], seconds) on the test course
// (course.js) and reports measured numbers against CoD-derived targets.
import { STATIONS, coursePos, COURSE_ORIGIN } from './course.js';
const OZ = COURSE_ORIGIN.z;

export async function run(fps, only = null) {
  const game = fps.game;
  const p = game.player;
  const T = p.tuning;
  const results = [];
  const P = (x, y, z) => coursePos(x, y, z);
  const hs = () => Math.hypot(p.velocity.x, p.velocity.z);
  const frame = (actions, look) => fps.hold(actions, 1 / 60, look);
  // Hold actions for `sec`, calling fn after every 1/60 s frame.
  const track = (actions, sec, fn) => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      frame(actions);
      fn?.(i / 60 + 1 / 60, i);
    }
  };
  const add = (name, pass, value, target) => results.push({ test: name, pass: !!pass, value, target });
  const want = (name) => !only || only.some((o) => name.includes(o));
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const events = [];
  const offs = ['player:footstep', 'player:jump', 'player:land', 'player:slide', 'player:damaged', 'player:died', 'player:respawn', 'player:mantle'].map((n) =>
    game.events.on(n, (e) => events.push({ n, t: game.time.now, e })),
  );
  const pose = (x, y, z, yaw = 0, pitch = 0) => {
    p.setPose({ pos: P(x, y, z), yaw, pitch });
    fps.hold([], 0.1);
  };
  const origZ = STATIONS.start.pos[2];

  // ---- locomotion speeds + accel
  if (want('walk')) {
    pose(0, 0, origZ);
    let t90 = null;
    track(['forward'], 1.5, (t) => {
      if (t90 === null && hs() >= 0.9 * T.speed.walk) t90 = t;
    });
    const v = hs();
    add('walk speed (m/s)', Math.abs(v - 4.9) < 0.1, r2(v), '4.9 (MWII base ~4.9-5.1)');
    add('walk 0→90% time (s)', t90 > 0.08 && t90 < 0.25, r2(t90), '0.10-0.25 (weighty, not instant)');
    const z0 = p.position.z;
    let tStop = null;
    track([], 0.6, (t) => {
      if (tStop === null && hs() < 0.05) tStop = t;
    });
    add('walk stop time (s)', tStop > 0.08 && tStop < 0.3, r2(tStop), '0.10-0.30 (no ice skating, no instant stop)');
    add('walk stop distance (m)', Math.abs(p.position.z - z0) < 0.6, r2(Math.abs(p.position.z - z0)), '< 0.6');
  }
  if (want('strafe')) {
    pose(0, 0, origZ);
    fps.hold(['right'], 1.0);
    add('strafe speed (m/s)', Math.abs(hs() - T.speed.walk * T.strafeMult) < 0.1, r2(hs()), '~4.4 (0.9x)');
    pose(0, 0, 10);
    fps.hold(['back'], 1.0);
    add('backpedal speed (m/s)', Math.abs(hs() - T.speed.walk * T.backMult) < 0.1, r2(hs()), '~3.7 (0.75x)');
  }
  if (want('ads')) {
    pose(0, 0, origZ);
    const w = game.weapons;
    const saved = Object.getOwnPropertyDescriptor(w, 'adsAmount');
    fps.hold(['forward', 'ads'], 1.2);
    const v = hs();
    add('ADS walk speed (m/s)', v < 3.2 && v > 2.2, r2(v), `~2.7 (adsAmount=${r2(w.adsAmount)})`);
    if (saved) Object.defineProperty(w, 'adsAmount', saved);
    fps.hold([], 0.5);
  }
  if (want('crouch')) {
    pose(0, 0, origZ);
    fps.hold(['crouch'], 0.05);
    fps.hold([], 0.05);
    fps.hold(['forward'], 1.0);
    add('crouch walk speed (m/s)', Math.abs(hs() - T.speed.crouch) < 0.1, r2(hs()), '~2.3');
    add('crouch toggle (tap)', p.state.crouching, p.state.stance, 'crouch');
    // eye transition time
    fps.hold([], 0.3);
    let tEye = null;
    fps.hold(['crouch'], 1 / 60);
    track([], 0.6, (t) => {
      if (tEye === null && Math.abs(p.cam.eyeHeight - T.eye.stand) < 0.03) tEye = t;
    });
    add('crouch→stand eye settle (s)', tEye > 0.1 && tEye < 0.35, r2(tEye), '0.15-0.3 smooth');
    // hold mode (hybrid): hold > 0.3 s then release stands
    pose(0, 0, origZ);
    fps.hold(['crouch'], 0.6);
    const heldCrouch = p.state.crouching;
    fps.hold([], 0.1);
    add('crouch hold-to-crouch (hybrid)', heldCrouch && !p.state.crouching, `held:${heldCrouch} released:${p.state.stance}`, 'crouch while held, stand on release');
    // blocked stand-up in the 1.4 m tunnel
    const C = STATIONS.corridor;
    pose(C.x, 0, C.z0 + 1.2, 0);
    fps.hold(['crouch'], 0.05);
    fps.hold(['forward'], 1.9);
    const inTunnel = p.position.z - OZ < C.tunnel[0] && p.position.z - OZ > C.tunnel[1];
    fps.hold(['crouch'], 0.05);
    fps.hold([], 0.3);
    add('stand blocked under 1.4 m ceiling', inTunnel && p.state.crouching, `z=${r2(p.position.z - OZ)} stance=${p.state.stance}`, 'stays crouched');
    fps.hold(['forward'], 3.2);
    add('narrow 0.9 m corridor passable', p.position.z - OZ < C.z0 - C.len + 0.5, r2(p.position.z - OZ), `z < ${C.z0 - C.len + 0.5}`);
  }
  if (want('prone')) {
    pose(0, 0, origZ);
    fps.hold(['prone'], 1 / 60);
    fps.hold([], 0.4);
    const eyeP = p.cam.eyeHeight;
    fps.hold(['forward'], 1.0);
    add('prone speed (m/s)', p.state.prone && Math.abs(hs() - T.speed.prone) < 0.1, `${r2(hs())} eye ${r2(eyeP)} m`, `~${T.speed.prone}, eye ${T.eye.prone}`);
    fps.hold(['prone'], 1 / 60);
    fps.hold([], 0.3);
    add('prone → stand', p.state.stance === 'stand', p.state.stance, 'stand');
  }
  if (want('fov')) {
    pose(0, 0, origZ);
    const hip = game.camera.fov;
    fps.hold(['ads'], 0.6);
    const ads = game.camera.fov;
    const zoom = game.weapons?.current?.adsZoom ?? 1.25;
    const expect = (2 * Math.atan(Math.tan((hip * Math.PI) / 360) / zoom) * 180) / Math.PI;
    add('ADS FOV = hip / adsZoom (tan space)', Math.abs(ads - expect) < 0.3, `${r2(hip)}° → ${r2(ads)}°`, `${r2(expect)}° (zoom ${zoom})`);
    add('ADS look sensitivity scaled', p.cam.lookScale(game) < 0.8, r2(p.cam.lookScale(game)), `adsSensitivity/zoom = ${r2((game.settings.adsSensitivity ?? 1) / zoom)}`);
    fps.hold([], 0.5);
  }
  if (want('sprint')) {
    pose(0, 0, origZ);
    let t = null;
    track(['forward', 'sprint'], 1.5, (tt) => {
      if (t === null && hs() > 0.95 * T.speed.sprint) t = tt;
    });
    add('sprint speed (m/s)', Math.abs(hs() - 6.6) < 0.1, r2(hs()), '6.6 (MWII ~6.4-6.8)');
    add('sprint 0→95% (s)', t < 0.5, r2(t), '< 0.5');
    fps.hold(['forward'], 0.5);
    add('sprint latched after releasing key', p.state.sprinting, p.state.sprinting, 'true (tap-to-sprint)');
  }
  if (want('tac')) {
    pose(0, 0, origZ + 5);
    fps.hold(['forward', 'sprint'], 0.1);
    fps.hold(['forward'], 0.05);
    fps.hold(['forward', 'sprint'], 0.05);
    const started = p.state.tacticalSprint;
    let dur = 0;
    let vmax = 0;
    track(['forward'], 3.3, (tt) => {
      if (p.state.tacticalSprint) dur = tt;
      vmax = Math.max(vmax, hs());
    });
    const sinceEnd = 3.3 - dur;
    add('tac sprint via double-tap', started, started, 'true');
    add('tac sprint speed (m/s)', Math.abs(vmax - 8.2) < 0.15, r2(vmax), '8.2 (MWII ~8.0-8.4)');
    add('tac sprint duration (s)', Math.abs(dur + 0.05 - T.tac.duration) < 0.1, r2(dur + 0.05), `${T.tac.duration} then drops to sprint`);
    add('after tac: still sprinting', p.state.sprinting && Math.abs(hs() - 6.6) < 0.15, r2(hs()), '6.6');
    // recharge: attempt re-activation each 0.1 s
    let recharge = null;
    for (let i = 0; i < 80 && recharge === null; i++) {
      fps.hold(['forward', 'sprint'], 1 / 60);
      if (p.state.tacticalSprint) recharge = sinceEnd + i * (0.1 + 1 / 60) + 1 / 60;
      fps.hold(['forward'], 0.1);
      if (p.position.z - OZ < -30) p.setPose({ pos: P(0, 0, origZ), yaw: 0 }), (p.tacMeter = p.state.tacMeter);
    }
    add('tac recharge after exhaustion (s)', recharge && recharge > 3 && recharge < 5.5, recharge && r2(recharge), `~${T.tac.rechargeTime + T.tac.rechargeDelay}`);
  }
  if (want('jump')) {
    pose(0, 0, origZ);
    const y0 = p.position.y;
    let maxY = y0, air = 0, landed = false;
    fps.hold(['jump'], 1 / 60);
    track([], 1.2, (t) => {
      maxY = Math.max(maxY, p.position.y);
      if (!landed && p.state.grounded && t > 0.1) {
        landed = true;
        air = t;
      }
    });
    add('jump height (m)', Math.abs(maxY - y0 - 1.0) < 0.06, r2(maxY - y0), '~1.0 (IW: 39 in)');
    add('jump airtime (s)', air > 0.55 && air < 0.72, r2(air), '0.6-0.7 (snappy, g≈19.5)');
    const land = events.filter((e) => e.n === 'player:land').pop();
    add('player:land emitted w/ surface', !!land && !!land.e.surface, land && `${r2(land.e.impactSpeed)} m/s on ${land.e.surface}`, 'impactSpeed + surface');
    // sprint jump distance
    pose(0, 0, origZ);
    fps.hold(['forward', 'sprint'], 1.0);
    const z0 = p.position.z;
    fps.hold(['forward', 'jump'], 1 / 60);
    track(['forward'], 1.0, () => {});
    add('sprint keeps speed through jump', p.state.sprinting && hs() > 6.2, r2(hs()), '> 6.2');
  }
  if (want('coyote')) {
    // walk off the 1.8 m stair platform side, press jump shortly after leaving the edge
    const S = STATIONS.stairs;
    const platZ = S.z0 - S.tread * S.n - 2;
    const edgeX = S.x + (S.width + 0.6) / 2;
    p.setPose({ pos: P(edgeX - 0.5, S.riser * S.n, platZ), yaw: -90 });
    fps.hold([], 0.1);
    let leftAt = null, jumped = false;
    track(['forward'], 0.6, (t) => {
      if (leftAt === null && !p.state.grounded) leftAt = t;
      if (leftAt !== null && !jumped && t - leftAt >= 0.08) {
        fps.hold(['forward', 'jump'], 1 / 60);
        jumped = p.velocity.y > 3;
      }
    });
    add('coyote jump 80 ms after leaving edge', jumped, jumped, `jump allowed within ${T.coyoteTime * 1000} ms`);
    // late jump (0.25 s) must fail
    p.setPose({ pos: P(edgeX - 0.5, S.riser * S.n, platZ), yaw: -90 });
    fps.hold([], 0.1);
    leftAt = null;
    let late = false, tried = false;
    track(['forward'], 0.7, (t) => {
      if (leftAt === null && !p.state.grounded) leftAt = t;
      if (leftAt !== null && !tried && t - leftAt >= 0.25) {
        tried = true;
        fps.hold(['forward', 'jump'], 1 / 60);
        late = p.velocity.y > 3;
      }
    });
    add('no jump 250 ms after edge', tried && !late, !late, 'false');
    // jump buffering: press jump 100 ms before landing
    pose(0, 0, origZ);
    fps.hold(['jump'], 1 / 60);
    let pressed = false, rejumped = false, firstLandT = null;
    track([], 1.3, (t) => {
      const timeToLand = p.position.y - OZ * 0 - (P(0, 0, 0)[1]);
      if (!pressed && p.velocity.y < 0 && p.position.y - P(0, 0, 0)[1] < 0.3) {
        pressed = true;
        fps.hold(['jump'], 1 / 60);
      }
      if (pressed && p.state.grounded && firstLandT === null) firstLandT = t;
      if (pressed && p.velocity.y > 3) rejumped = true;
    });
    add('jump buffer (press ~0.1 s before landing)', rejumped, rejumped, 'jumps again on touchdown');
  }
  if (want('slide')) {
    for (const tac of [false, true]) {
      pose(STATIONS.track.x, 0, origZ + 8);
      if (tac) {
        fps.hold(['forward', 'sprint'], 0.1);
        fps.hold(['forward'], 0.05);
        fps.hold(['forward', 'sprint'], 1.2);
      } else fps.hold(['forward', 'sprint'], 1.5);
      const v0 = hs();
      fps.hold(['forward', 'crouch'], 1 / 60);
      const started = p.state.sliding;
      let vmax = 0, t = 0;
      track(['forward'], 2.0, (tt) => {
        if (p.state.sliding) {
          t = tt;
          vmax = Math.max(vmax, hs());
        }
      });
      const L = p.lastSlide || {};
      const label = tac ? 'tac-sprint slide' : 'sprint slide';
      add(`${label} starts`, started, `entry ${r2(v0)} m/s → peak ${r2(vmax)}`, 'boost on entry');
      add(`${label} distance (m)`, tac ? L.distance > 5.5 && L.distance < 7.5 : L.distance > 4 && L.distance < 5.8, r2(L.distance), tac ? '5.5-7.5' : '4.0-5.8');
      add(`${label} duration (s)`, L.time > 0.7 && L.time < 1.3, r2(L.time), '0.7-1.3');
      add(`${label} ends crouched`, p.state.crouching, p.state.stance, 'crouch');
    }
    // slide cancel via jump
    pose(STATIONS.track.x, 0, origZ + 8);
    fps.hold(['forward', 'sprint'], 1.2);
    fps.hold(['forward', 'crouch'], 1 / 60);
    fps.hold(['forward'], 0.25);
    const vs = hs();
    fps.hold(['forward', 'jump'], 1 / 60);
    const jumpCancel = !p.state.sliding && p.velocity.y > 3 && hs() > vs * 0.85;
    add('slide-cancel via jump', jumpCancel, `vy=${r2(p.velocity.y)} h=${r2(hs())} (was ${r2(vs)})`, 'airborne, keeps ~95% speed');
    fps.hold([], 1.0);
    // slide cancel via crouch → stand + sprint
    pose(STATIONS.track.x, 0, origZ + 8);
    fps.hold(['forward', 'sprint'], 1.2);
    fps.hold(['forward', 'crouch'], 1 / 60);
    fps.hold(['forward'], 0.25);
    fps.hold(['forward', 'crouch'], 1 / 60);
    fps.hold(['forward'], 0.3);
    add('slide-cancel via crouch', !p.state.sliding && p.state.stance === 'stand' && p.state.sprinting, `${p.state.stance} sprint=${p.state.sprinting} v=${r2(hs())}`, 'stand + sprinting');
    const fovNow = game.camera.fov;
    add('slide/sprint FOV above base', fovNow > game.verticalFov(game.settings.fov), r2(fovNow), `> ${r2(game.verticalFov(game.settings.fov))}`);
  }
  if (want('mantle')) {
    for (const b of STATIONS.mantle) {
      pose(b.x, 0, STATIONS.mantleFrontZ + 1.4, 0);
      fps.hold(['forward'], 0.2);
      let started = false, t0 = null, dur = 0, onTop = false;
      track(['forward', 'jump'], 1.4, (t) => {
        if (p.state.mantling && !started) {
          started = true;
          t0 = t;
        }
        if (p.state.mantling) dur = t - t0;
        if (p.state.grounded && Math.abs(p.position.y - b.h) < 0.05 && p.position.z - OZ < STATIONS.mantleFrontZ) onTop = true;
      });
      if (b.h <= 0.5) add(`0.5 m box: hop/mantle onto`, onTop, `y=${r2(p.position.y)}`, 'on top');
      else if (b.h < 2.2) add(`mantle ${b.h} m box`, started && onTop, `${started ? 'mantled' : 'no mantle'} y=${r2(p.position.y)} t=${r2(dur)}s`, 'on top');
      else add(`no mantle on ${b.h} m box (too tall)`, !started && p.position.y < 0.2, `y=${r2(p.position.y)}`, 'stays on ground');
    }
    // vault the 1.0 m thin wall
    const V = STATIONS.vault;
    pose(V.x, 0, V.z + 1.5, 0);
    fps.hold(['forward'], 0.2);
    fps.hold(['forward', 'jump'], 1 / 60);
    const vaulting = p.state.vaulting;
    fps.hold(['forward'], 1.2);
    add('vault 1.0 m wall', vaulting && p.position.z - OZ < V.z - V.t - 0.3 && p.position.y < 0.05, `vault=${vaulting} z=${r2(p.position.z - OZ)}`, 'lands beyond the wall');
    // air mantle: sprint-jump at the 1.8 m platform side
    const b = STATIONS.mantle.find((m) => m.h === 1.8);
    pose(b.x, 0, STATIONS.mantleFrontZ + 4, 0);
    fps.hold(['forward', 'sprint'], 0.35);
    fps.hold(['forward', 'sprint', 'jump'], 1.0);
    add('mantle from a running jump (1.8 m)', Math.abs(p.position.y - 1.8) < 0.08, r2(p.position.y), 'on top');
  }
  if (want('stairs')) {
    const S = STATIONS.stairs;
    pose(S.x, 0, S.z0 + 1.5, 0);
    let prevCamY = game.camera.position.y, maxJerk = 0, prevDy = 0;
    let t = 0, hmin = 99;
    track(['forward'], 1.6, (tt) => {
      const cy = game.camera.position.y;
      const dy = cy - prevCamY;
      if (tt > 0.1) maxJerk = Math.max(maxJerk, Math.abs(dy));
      prevCamY = cy;
      if (p.position.y < S.riser * S.n - 0.01) t = tt;
      if (p.position.z - OZ < S.z0 && p.position.y < S.riser * S.n - 0.01) hmin = Math.min(hmin, hs());
    });
    add('stairs keep speed (min m/s on flight)', hmin > 4.3, r2(hmin), '> 4.3');
    add('stairs climbed (0.18 m risers)', Math.abs(p.position.y - S.riser * S.n) < 0.03, r2(p.position.y), `${S.riser * S.n}`);
    add('stairs climb speed', t < 1.2, `${r2(t)} s for 10 steps`, '< 1.2 s (no speed loss)');
    add('stairs camera smooth (max dy/frame)', maxJerk < 0.06, r3(maxJerk), '< 0.06 m/frame (raw step 0.18)');
    // walk down the other way
    p.setPose({ pos: P(S.x, S.riser * S.n, S.z0 - S.tread * S.n - 0.5), yaw: 180 });
    fps.hold([], 0.1);
    let airborne = 0;
    track(['forward'], 1.6, () => {
      if (!p.state.grounded) airborne++;
    });
    add('stairs descend grounded (snap)', p.position.y < 0.05 && airborne < 4, `y=${r2(p.position.y)} airborne frames=${airborne}`, 'no hopping');
  }
  if (want('kerb')) {
    const K = STATIONS.kerbs;
    K.heights.forEach((h, i) => {
      const x = K.x + i * 1.6 - 1.6;
      pose(x, 0, K.z + 1.2, 0);
      let maxY = 0;
      track(['forward'], 0.8, () => (maxY = Math.max(maxY, p.position.y)));
      const up = Math.abs(maxY - h) < 0.03;
      if (h <= T.stepHeight) add(`step up ${h} m kerb`, up, r2(maxY), `${h}`);
      else add(`${h} m ledge blocks walking`, !up && maxY < 0.1, r2(maxY), '0 (needs jump/mantle)');
    });
  }
  if (want('ramp')) {
    for (const r of STATIONS.ramps) {
      pose(r.x, 0, 1.5, 0);
      let v = 0, maxY = 0;
      track(['forward'], 2.2, (t) => {
        if (t > 0.6 && t < 0.9) v = hs();
        maxY = Math.max(maxY, p.position.y);
      });
      const h = r.deg === 58 ? 3.2 : 2.2;
      const top = maxY > h - 0.05;
      if (r.deg < T.maxSlopeClimb) add(`${r.deg}° ramp climbable`, top, `top=${r2(maxY)} v=${r2(v)}`, `reaches ${h} m`);
      else add(`${r.deg}° ramp NOT climbable`, maxY < 1.0, `max y=${r2(maxY)}`, '< 1 m');
    }
  }
  if (want('thin')) {
    const TW = STATIONS.thinWall;
    pose(TW.x, 0, TW.z + 6, 0);
    fps.hold(['forward', 'sprint'], 0.1);
    fps.hold(['forward'], 0.05);
    fps.hold(['forward', 'sprint'], 2.0);
    add('no tunnelling through 4 cm wall (tac sprint)', p.position.z - OZ > TW.z, r3(p.position.z - OZ - TW.z), '> 0');
    // brute force: 40 m/s injected velocity into the wall
    pose(TW.x, 0, TW.z + 3, 0);
    let through = false;
    for (let i = 0; i < 30; i++) {
      p.velocity.set(0, 0, -40);
      fps.hold([], 1 / 60);
      if (p.position.z - OZ < TW.z) through = true;
    }
    add('no tunnelling at 40 m/s', !through, !through, 'true');
  }
  if (want('corner')) {
    const CO = STATIONS.corners;
    const cases = [
      { name: '90° corner', pos: [CO.x - 0.5, 0, CO.z - 0.5], yaw: 45 },
      { name: '40° V corner', pos: [CO.x + 5, 0, CO.z - 2 + 2.5], yaw: 0 },
    ];
    for (const c of cases) {
      pose(...c.pos, c.yaw);
      fps.hold(['forward'], 2.0);
      const samples = [];
      const cam = [];
      track(['forward'], 1.0, () => {
        samples.push(p.position.clone());
        cam.push(game.camera.position.clone());
      });
      const mean = samples.reduce((a, b) => a.add(b), samples[0].clone().multiplyScalar(0)).multiplyScalar(1 / samples.length);
      let maxDev = 0, maxCamStep = 0;
      for (let i = 0; i < samples.length; i++) {
        maxDev = Math.max(maxDev, samples[i].distanceTo(mean));
        if (i) maxCamStep = Math.max(maxCamStep, Math.hypot(cam[i].x - cam[i - 1].x, cam[i].z - cam[i - 1].z));
      }
      add(`no jitter in ${c.name}`, maxDev < 0.002 && maxCamStep < 0.002, `pos dev ${r3(maxDev * 1000)} mm, cam step ${r3(maxCamStep * 1000)} mm`, '< 2 mm');
    }
    // wall slide: walk diagonally along a wall keeps moving
    pose(CO.x + 1, 0, CO.z - 2 + 0.6, 0);
    const x0 = p.position.x;
    fps.hold(['forward', 'right'], 1.0);
    add('slides along wall (diagonal into wall)', p.position.x - x0 > 2.5, r2(p.position.x - x0), '> 2.5 m along wall in 1 s');
  }
  if (want('fall')) {
    for (const d of STATIONS.drops) {
      pose(d.x, d.h, d.z, 90);
      p.health = p.maxHealth;
      const before = p.health;
      fps.hold(['forward'], 0.5);
      fps.hold([], 1.6);
      const dmg = before - p.health;
      if (d.h <= 4) add(`fall ${d.h} m: no damage`, dmg === 0 && p.alive, dmg, '0');
      else if (d.h < 11) add(`fall ${d.h} m: damage`, dmg > 10 && dmg < 60 && p.alive, dmg, '10-60');
      else add(`fall ${d.h} m: lethal`, !p.alive, `alive=${p.alive}`, 'dead');
      p.setPose({ pos: P(0, 0, origZ) });
    }
  }
  if (want('health')) {
    pose(0, 0, origZ);
    p.takeDamage(60, { source: { position: game.camera.position.clone().add({ x: 5, y: 0, z: 0 }) } });
    const dmgEv = events.filter((e) => e.n === 'player:damaged').pop();
    const dirOk = dmgEv && dmgEv.e.direction && dmgEv.e.direction.x > 0.9;
    add('player:damaged direction → attacker', dirOk, dmgEv?.e.direction && dmgEv.e.direction.toArray().map(r2).join(','), '+x');
    fps.hold([], 3.5);
    const h35 = p.health;
    fps.hold([], 2.0);
    add('health regen after ~4 s', h35 === 40 && p.health === 100, `at 3.5 s: ${r2(h35)}, at 5.5 s: ${r2(p.health)}`, '40 then 100');
    p.takeDamage(200, {});
    const died = events.some((e) => e.n === 'player:died');
    fps.hold([], 3.0);
    const stillDead = !p.alive;
    fps.hold([], 1.0);
    add('death → auto-respawn outside a run', died && stillDead && p.alive && p.health === 100, `dead at 3 s: ${stillDead}, alive at 4 s: ${p.alive}`, `respawn after ${T.respawnDelay}s`);
    add('player:respawn emitted', events.some((e) => e.n === 'player:respawn'), true, 'true');
  }
  if (want('run')) {
    // run lifecycle: no auto-respawn during a run; run:start redeploys at spawns.player[0]
    pose(0, 0, origZ);
    game.run.active = true;
    p.takeDamage(500, {});
    fps.hold([], 6);
    const stayedDead = !p.alive;
    game.events.emit('run:start', { difficulty: 'regular' });
    const sp = game.world.spawns.player[0].pos;
    const atSpawn = p.position.distanceTo(sp) < 0.1;
    add('run.active: death does not auto-respawn', stayedDead, stayedDead, 'dead after 6 s');
    add('run:start → full health at spawns.player[0]', p.alive && p.health === 100 && atSpawn, `alive=${p.alive} hp=${p.health} atSpawn=${atSpawn}`, 'true');
    game.run.active = false;
    // cameraOverride: camera driven by the override, input frozen, clean hand-back
    pose(0, 0, origZ);
    p.addShake(1, 5);
    const posBefore = p.position.clone();
    game.cameraOverride = (cam) => {
      cam.position.set(1, 50, 2);
      cam.lookAt(0, 0, 0);
    };
    fps.hold(['forward', 'sprint'], 0.5);
    const camOk = Math.abs(game.camera.position.y - 50) < 1e-6;
    const frozen = p.position.distanceTo(posBefore) < 0.01;
    game.cameraOverride = null;
    fps.hold([], 1 / 60);
    const back = Math.abs(game.camera.position.y - (p.position.y + T.eye.stand)) < 0.01 && p.cam.trauma === 0 && hs() === 0;
    add('cameraOverride drives camera', camOk, camOk, 'camera at override pose');
    add('cameraOverride freezes movement input', frozen, r3(p.position.distanceTo(posBefore)), '0 m moved');
    add('cameraOverride → null: clean resume', back, `eyeY ok, trauma=${r2(p.cam.trauma)}, v=${r2(hs())}`, 'no pop / shake / velocity');
  }
  if (want('footstep')) {
    pose(0, 0, origZ);
    const n0 = events.length;
    fps.hold(['forward'], 2.0);
    const steps = events.slice(n0).filter((e) => e.n === 'player:footstep');
    const rate = steps.length / 2.0;
    const alt = steps.every((s, i) => !i || s.e.foot !== steps[i - 1].e.foot);
    add('footsteps walking (steps/s)', rate > 2.4 && rate < 3.2, `${r2(rate)} (${steps[0]?.e.surface})`, '~2.8, alternating L/R');
    add('footsteps alternate L/R + surface', alt && steps.every((s) => s.e.surface), alt, 'true');
    pose(0, 0, origZ);
    const n1 = events.length;
    fps.hold(['forward', 'sprint'], 2.0);
    const s2 = events.slice(n1).filter((e) => e.n === 'player:footstep').length / 2;
    add('footsteps sprinting (steps/s)', s2 > 2.7 && s2 < 3.5, r2(s2), '~3.1');
  }
  if (want('recoil')) {
    pose(0, 0, origZ);
    const p0 = p.pitch;
    for (let i = 0; i < 10; i++) {
      p.applyRecoil(0.6, 0);
      fps.hold([], 0.075);
    }
    const climb = (game.camera.rotation.x - p0) / (Math.PI / 180);
    fps.hold([], 0.8);
    const after = (game.camera.rotation.x - p0) / (Math.PI / 180);
    add('recoil climbs during burst', climb > 2.5, `${r2(climb)}° after 10 shots of 0.6°`, '> 2.5°');
    add('recoil partially recovers', Math.abs(after - 10 * 0.6 * (1 - T.recoil.recoverFraction)) < 0.25 && after < climb * 0.75, `${r2(after)}° after 0.8 s`, `~${r2(10 * 0.6 * (1 - T.recoil.recoverFraction))}° (38% kept)`);
  }

  offs.forEach((o) => o());
  p.setPose({ pos: P(...STATIONS.start.pos), yaw: 0 });
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, results: results.map((r) => `${r.pass ? 'PASS' : 'FAIL'} | ${r.test} | ${JSON.stringify(r.value)} | target ${r.target}`) };
}
