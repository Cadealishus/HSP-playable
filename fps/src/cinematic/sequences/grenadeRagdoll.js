import * as THREE from 'three';
import { CinematicSequence, actorCenter, actorVelocity } from '../sequence.js';

/**
 * "GRENADE, TWO SOLDIERS, TOO MUCH FORCE" — a ~9 s replay shot for Shorts.
 *
 *   1 SETUP      1.3 s  two hostiles on a clear stretch of street; a real M67
 *                       frag arcs in from off screen and lands between them
 *   2 CLOSE-UP   0.5 s  lens on the cobbles beside the grenade, men behind it
 *   3 BOOM       0.55 s the game's own frag detonation; shake; clock drops
 *   4 SLOW-MO    2.0 s  0.2x, tracking the airborne star doll
 *   5 WIDE       ~1.5 s both men in the air, blast site behind them
 *   6 IMPACT     2.0 s  follow whichever doll is about to hit something
 *   7 AFTERMATH  1.2 s  hold, back to normal speed, hand the game back
 *
 * PHYSICS IS REAL. The men are ordinary `ai` soldiers, the grenade is the
 * player's frag rigid body, the kill and the launch go through the normal
 * `explosion` event and ragdoll hand-off. The one liberty: right after the
 * blast each fresh ragdoll's launch is resized (see `launch` / `trim`) — the
 * star is sent into the wall he was lined up on, the wing a shorter hop the
 * way the blast threw him. Flight, tumble and impact are all simulated.
 * Nothing global is retuned — BLAST and the frag defs are untouched — so
 * normal grenades play exactly as before.
 *
 * SET SCOUTING. The street is chosen at runtime by raycasts: every candidate
 * site x 24 launch directions, scored for a tall wall 7-13 m down-range and
 * open ground on the camera side. So a map edit moves the set rather than
 * breaking the shot.
 */

/** Level-space candidate sites (town). The first is the `flop` capture set. */
const SITES = [
  [0.1, 36.4], [0, 30], [0, 24], [0, 18], [0, 12], [-2, 42], [3, 30], [-3, 30], [0, 6], [0, 0],
];

const STAR_FLIGHT = 1.1; // sim seconds from blast to wall contact (preferred)
const STAR_HIT_HEIGHT = 2.5; // centre-of-mass height above the street at the wall
const WING_FLIGHT = 1.05;
const WING_DIST = 5.5;
/**
 * Ragdoll.step clamps every particle to 24 m/s (MAX_PARTICLE_STEP). The blast
 * already cartwheels the doll at ~8 rad/s, so limbs run ~7 m/s faster than the
 * centre: plan the centre under this or the clamp silently eats the launch.
 */
const MAX_LAUNCH = 16;

export function createGrenadeRagdoll(ctx, opts = {}) {
  const seq = new CinematicSequence({
    name: 'grenade-ragdoll',
    seed: 0x6e7a,
    setup: (s) => setup(s, ctx, opts),
    teardown: (s) => teardown(s, ctx),
    shake: { decay: 0.9, amplitude: 0.16, rotation: 2.6, frequency: 20 },
    shots: buildShots(ctx, opts),
    onUpdate: (s) => {
      // `ai` decides shadow casting from the bind-pose sphere at the spawn
      // point; a doll 6 m up the street is still very much on screen.
      for (const a of s.data.men ?? []) a.mesh.userData.owNoShadow = false;
    },
  });
  return seq;
}

/* ====================================================================== */
/* set                                                                    */
/* ====================================================================== */

/** Soldiers from the previous take (disposed when the next take starts). */
let _lastTake = null;

function setup(s, ctx, opts) {
  const ai = ctx.get('ai');
  const phys = ctx.get('physics');
  const host = ctx.get('cinematic');
  const d = s.data;

  // ---- reset: clear the previous take's bodies and grenade --------------
  if (_lastTake) {
    for (const a of _lastTake.men) {
      a.dispose();
    }
    ai.agents = ai.agents.filter((a) => !_lastTake.men.includes(a));
    _lastTake = null;
  }
  if (ai._navPending) ai._buildNav?.();
  for (const a of ai.agents) host.isolate(a);

  // ---- scout the set ----------------------------------------------------
  const set = scout(ctx, opts);
  d.set = set;
  const { G, D, S } = set;
  const L = (x, y, z, out = new THREE.Vector3()) =>
    out.set(G.x + D.x * x + S.x * z, G.y + y, G.z + D.z * x + S.z * z);
  d.L = L;
  /** local offset vector [x, y, z] in world axes */
  d.O = (x, y, z) => [D.x * x + S.x * z, y, D.z * x + S.z * z];

  // ---- the two hostiles --------------------------------------------------
  const watch = L(-6, 1.5, 18);
  const place = (variant, x, z, name) => {
    const p = L(x, 0, z);
    p.y = ai.groundAt(p.x, p.z, G.y + 2);
    const face = new THREE.Vector3().subVectors(watch, p);
    const a = ai.spawn(variant, p, Math.atan2(face.x, face.z));
    a.cinematic = true;
    a.name = name;
    // The skinned mesh's bounds are the bind pose at the spawn point: once
    // the ragdoll carries the body away, three would cull it the moment the
    // spawn point leaves the frame. Two meshes; draw them always.
    a.mesh.frustumCulled = false;
    a.staged = {
      crouch: false, speed: 0, fire: false, noDamage: true, aimWeight: 0.35,
      heading: new THREE.Vector3(0, 0, 1), lookAt: watch.clone(),
    };
    a.animator.update(0.016, 0);
    return a;
  };
  // Both on the down-range side of the charge, a little apart: the blast
  // fans them out ~20° either side of the wall line, so they fly together
  // and stay in the middle of a vertical crop.
  const star = place('vanguard', 1.0, -0.42, 'GARY');
  const wing = place('breacher', 1.28, 0.52, 'GARY II');
  d.men = [star, wing];
  d.star = star;
  d.wing = wing;
  // The point on the wall the star is sent into: straight down the scouted
  // line from where he stands, at contact height.
  const sp = star.position;
  const wr = phys.raycast(sp.x, G.y + STAR_HIT_HEIGHT, sp.z, D.x, 0, D.z, 16, phys.MASK.WORLD);
  d.starWall = wr.hit ? wr.point.clone() : L(Math.min(set.wall, 12), STAR_HIT_HEIGHT, -0.42);
  _lastTake = { men: d.men };
  host.ignoreForVisibility(d.men.map((a) => a.mesh));
  host.buildOccluders(G, 45);

  // ---- the grenade: the player's real frag, thrown in from off screen ----
  const weapons = ctx.get('weapons');
  const eq = weapons.equipment;
  const from = L(-4.6, 3.9, -3.4);
  const to = L(-0.3, 0.05, 0.12);
  to.y = ai.groundAt(to.x, to.z, G.y + 2) + 0.04;
  const T = 1.0;
  const gy = phys.gravity * (eq.defs?.frag?.gravityScale ?? 1);
  const vel = new THREE.Vector3(
    (to.x - from.x) / T,
    (to.y - from.y - 0.5 * gy * T * T) / T,
    (to.z - from.z) / T
  );
  const rec = eq.spawnLive('frag', from, vel, 60, null);
  if (rec) {
    rec.marked = true; // no HUD danger marker
    rec.body.angularVelocity.set(S.x * -9, 2, S.z * -9);
  }
  d.grenade = rec;
  d.grenadePos = new THREE.Vector3().copy(to);
  s.mark('grenade', to);
  s.mark('blast', to);
}

function teardown(s, ctx) {
  const d = s.data;
  // Aborted before the bang: take the grenade back, and let the men resume
  // being ordinary (still harmless-to-Doug-free) patrol-less statues.
  if (d.grenade?.active) ctx.get('weapons').equipment.discard(d.grenade);
  for (const a of d.men ?? []) {
    if (a.alive) a.staged = { ...a.staged, lookAt: null };
  }
}

/** Live grenade position, or where it was when it went off. */
function grenadeAt(s, out) {
  const d = s.data;
  if (d.grenade?.active && d.grenade.body) d.grenadePos.copy(d.grenade.body.position);
  return out.copy(d.grenadePos);
}

/* ====================================================================== */
/* scouting                                                               */
/* ====================================================================== */

const _p = new THREE.Vector3();

function scout(ctx, opts) {
  const world = ctx.peek('world');
  const ai = ctx.get('ai');
  const phys = ctx.get('physics');
  const M = phys.MASK.WORLD;
  const V = THREE.Vector3;
  const ray = (p, dx, dz, y, max) => {
    const r = phys.raycast(p.x, p.y + y, p.z, dx, 0, dz, max, M);
    return r.hit ? r.distance : Infinity;
  };

  let best = null;
  const sites = opts.sites ?? SITES;
  const candidates = sites.map(([x, z]) => (world?.levelToWorld ? world.levelToWorld(x, 0, z, new V()) : new V(x, 0, z)));
  // Fallback candidate: in front of whatever the camera was looking at.
  const cam = ctx.camera;
  const f = new V(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize();
  candidates.push(cam.position.clone().addScaledVector(f, 9));

  for (let ci = 0; ci < candidates.length; ci++) {
    const G = candidates[ci];
    G.y = ai.groundAt(G.x, G.z, G.y + 3);
    if (!Number.isFinite(G.y)) continue;
    const up = phys.raycast(G.x, G.y + 0.5, G.z, 0, 1, 0, 12, M);
    if (up.hit) continue; // under a roof
    // no clutter right round the charge (stalls, cars)
    let clutter = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (ray(G, Math.sin(a), Math.cos(a), 0.6, 2.6) < 2.6) clutter++;
    }
    if (clutter > 1) continue;

    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      const w2 = ray(G, dx, dz, 2.0, 16);
      const w4 = ray(G, dx, dz, 4.0, 16);
      const w6 = ray(G, dx, dz, 6.0, 16);
      if (!(w4 >= 5.5 && w4 <= 11)) continue;
      if (Math.abs(w2 - w4) > 1.2) continue; // a vertical face, not an awning
      // ...and a wide one, not a telephone pole: the same face 1 m either side
      const px = dz, pz = -dx;
      const wl = ray(_p.set(G.x + px, G.y, G.z + pz), dx, dz, 4.0, 16);
      const wr = ray(_p.set(G.x - px, G.y, G.z - pz), dx, dz, 4.0, 16);
      if (Math.abs(wl - w4) > 1.0 || Math.abs(wr - w4) > 1.0) continue;
      const tall = Math.abs(w6 - w4) < 1.2 ? 1 : 0;
      // near side of the flight must be clear at head height
      if (ray(G, dx, dz, 1.6, 6) < 6) continue;
      for (const side of [1, -1]) {
        const sx = dz * side, sz = -dx * side; // perpendicular
        // camera positions: side, side-behind, behind
        const cSide = ray(G, sx, sz, 1.6, 14);
        const bx = sx * 0.8 - dx * 0.6, bz = sz * 0.8 - dz * 0.6;
        const cBack = ray(G, bx, bz, 1.6, 20);
        if (cSide < 7 || cBack < 9) continue;
        const score =
          3 - Math.abs(w4 - 7.8) * 0.4 + tall * 1.5 + Math.min(cSide, 14) * 0.08 + Math.min(cBack, 20) * 0.06 - ci * 0.05;
        if (!best || score > best.score) {
          best = { score, G: G.clone(), D: new V(dx, 0, dz), S: new V(sx, 0, sz), wall: w4, tall, site: ci };
        }
      }
    }
  }
  if (!best) {
    // Nothing scored: stage it in front of the camera, launch across view.
    const G = candidates[candidates.length - 1];
    best = { score: 0, G, D: new V(f.z, 0, -f.x), S: f.clone().negate(), wall: Infinity, tall: 0, site: -1 };
  }
  console.info(
    `[cinematic] set: site ${best.site} at ${best.G.x.toFixed(1)},${best.G.y.toFixed(2)},${best.G.z.toFixed(1)} ` +
      `wall ${Number.isFinite(best.wall) ? best.wall.toFixed(1) : 'none'} m (tall ${best.tall}) score ${best.score.toFixed(2)}`
  );
  return best;
}

/* ====================================================================== */
/* launch                                                                 */
/* ====================================================================== */

/**
 * Launch velocity (m/s) that carries a doll `dist` metres out and `rise`
 * metres up in `time` seconds, integrating exactly what Ragdoll.step does
 * in the air: Verlet with a per-step `damp` and gravity.
 */
function planLaunch(dist, rise, time, gravity, damp, h = 1 / 120) {
  let best = solveLaunch(dist, rise, time, gravity, damp, h);
  if (best.speed <= MAX_LAUNCH) return best;
  // Too fast for the particle clamp at the preferred time: take the flight
  // time that needs the least speed instead.
  for (let t = 0.7; t <= 1.8; t += 0.05) {
    const p = solveLaunch(dist, rise, t, gravity, damp, h);
    if (p.speed < best.speed) best = p;
  }
  return best;
}

function solveLaunch(dist, rise, time, gravity, damp, h) {
  const N = Math.max(1, Math.round(time / h));
  let Sx = 0, Gy = 0, dn = 1, gdisp = 0;
  for (let n = 1; n <= N; n++) {
    dn *= damp;
    Sx += dn * h;
    gdisp = gdisp * damp + gravity * h * h;
    Gy += gdisp;
  }
  const vh = dist / Sx;
  const vy = (rise - Gy) / Sx;
  return { vh, vy, time, speed: Math.hypot(vh, vy) };
}

/**
 * Set a fresh ragdoll's centre-of-mass velocity to a planned launch: `plan.vh`
 * along `dir` (horizontal unit) and `plan.vy` up. The real blast has already
 * killed, thrown and cartwheeled the doll; this only resizes that throw.
 * Returns the desired velocity so the launch can be re-trimmed next steps.
 */
function launch(actor, dir, plan, spin, v) {
  const rd = actor?.ragdoll;
  if (!rd) return null;
  const want = new THREE.Vector3(dir.x * plan.vh, plan.vy, dir.z * plan.vh);
  const cur = actorVelocity(actor, v);
  rd.addVelocity(want.x - cur.x, want.y - cur.y, want.z - cur.z);
  // extra cartwheel about the axis across the throw, plus a little yaw
  rd.addSpin(-dir.z, 0, dir.x, -spin);
  rd.addSpin(0, 1, 0, spin * 0.25);
  rd.limp?.(0.35);
  return { actor, want, damp: rd.airDamping ?? 0.997 };
}

/**
 * Re-trim a launch for the first few physics steps. Feet dragging on the
 * street and the per-particle speed clamp both shave the throw on its first
 * steps; compare the centre's velocity with where the plan says it should be
 * `dt` seconds in, and make up the difference.
 */
function trim(l, dt, gravity, v) {
  const rd = l.actor.ragdoll;
  if (!rd) return;
  const k = Math.pow(l.damp, dt * 120);
  const cur = actorVelocity(l.actor, v);
  const ex = l.want.x * k - cur.x;
  const ey = l.want.y * k + gravity * dt - cur.y;
  const ez = l.want.z * k - cur.z;
  if (Math.hypot(ex, ey, ez) > 0.25) rd.addVelocity(ex, ey, ez);
}

/* ====================================================================== */
/* shots                                                                  */
/* ====================================================================== */

function buildShots(ctx, opts) {
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmp3 = new THREE.Vector3();

  return [
    /* 1 ----------------------------------------------------------------- */
    {
      name: 'setup',
      duration: 1.3,
      cameraMode: 'dolly',
      position: (s) => s.data.L(-5.2, 1.55, 4.7, tmp),
      positionEnd: (s) => s.data.L(-4.5, 1.45, 4.1, tmp),
      target: (s) => s.data.L(0.7, 0.95, 0.05, tmp),
      fov: 40,
      fovEnd: 37,
      ease: 'linear',
      timeScale: 1,
      events: [
        {
          // they clock it as it lands
          at: 1.0,
          fn: (s) => {
            const g = grenadeAt(s, tmp2);
            for (const a of s.data.men) if (a.alive) a.staged.lookAt = g.clone();
          },
        },
      ],
    },
    /* 2 ----------------------------------------------------------------- */
    {
      name: 'grenade close-up',
      duration: 0.5,
      cameraMode: 'dolly',
      // low on the street behind the charge, looking up-range at both men
      position: (s) => {
        const g = grenadeAt(s, tmp);
        const o = s.data.O(-1.9, 0, 0.02);
        return tmp.set(g.x + o[0], g.y + 0.09, g.z + o[2]);
      },
      positionEnd: (s) => {
        const g = grenadeAt(s, tmp);
        const o = s.data.O(-1.2, 0, 0.02);
        return tmp.set(g.x + o[0], g.y + 0.085, g.z + o[2]);
      },
      target: (s) => {
        const g = grenadeAt(s, tmp);
        const o = s.data.O(1.3, 0, 0.05);
        return tmp.set(g.x + o[0], g.y + 0.78, g.z + o[2]);
      },
      fov: 50,
      fovEnd: 43,
      ease: 'in',
      timeScale: [[0, 0.7], [0.5, 0.45]],
      collide: false,
    },
    /* 3 ----------------------------------------------------------------- */
    {
      name: 'boom',
      duration: 0.55,
      cameraMode: 'dolly',
      position: (s) => s.data.L(-2.6, 1.0, 9.6, tmp),
      positionEnd: (s) => s.data.L(-2.4, 1.3, 9.2, tmp),
      target: (s) => s.data.L(2.2, 1.9, 0, tmp),
      targetEnd: (s) => s.data.L(2.8, 3.0, 0, tmp),
      fov: 48,
      ease: 'out',
      // full speed for the flash, then the clock falls away into slow motion
      timeScale: [[0, 1], [0.1, 1], [0.5, 0.2]],
      cameraShake: { trauma: 0.95, decay: 1.1 },
      onEnter: (s) => detonate(s, ctx, tmp, tmp2),
      onUpdate: (s) => {
        const dt = ctx.time.elapsed - (s.data.blastT ?? 0);
        if (dt > 0 && dt < 0.07) {
          const g = ctx.get('physics').gravity;
          for (const l of s.data.launches ?? []) if (l) trim(l, dt, g, tmp2);
        }
      },
    },
    /* 4 ----------------------------------------------------------------- */
    {
      name: 'slow-mo track',
      duration: 2.0,
      cameraMode: 'track',
      targetActor: (s) => s.data.star,
      offset: [0, 0, 0], // replaced in onEnter (needs the set axes)
      offsetEnd: [0, 0, 0],
      targetOffset: [0, 0.1, 0],
      fov: 46,
      fovEnd: 42,
      ease: 'inOut',
      smoothing: { position: 0.28, target: 0.12 },
      timeScale: 0.2,
      onEnter: (s) => {
        const shot = s.shot;
        shot.offset = s.data.O(-2.2, -0.5, 4.3);
        shot.offsetEnd = s.data.O(-0.4, 0.5, 4.8);
      },
    },
    /* 5 ----------------------------------------------------------------- */
    {
      name: 'wide',
      minDuration: 0.8,
      maxDuration: 2.2,
      until: (s) => nearImpact(s, 2.0),
      cameraMode: 'frame',
      actors: (s) => s.data.men,
      direction: [0, 0, 0], // set in onEnter
      fov: 50,
      safeFrame: { x: 0.34, y: 0.7 },
      padding: 0.6,
      minDistance: 7,
      maxDistance: 13,
      smoothing: { position: 0.7, target: 0.35 },
      timeScale: [[0, 0.3], [1.6, 0.45]],
      onEnter: (s) => {
        // side-behind on the open side first, then the alternatives
        const dirs = [[-0.8, 0.62], [-0.62, 0.8], [-1, 0.15], [-0.6, -0.8], [0.1, 1], [-0.3, -1]];
        s.shot.candidates = dirs.map(([x, z]) => {
          const o = s.data.O(x, 0, z);
          const o2 = s.data.O(x * 0.85 + 0.1, 0, z * 0.85 + 0.1 * Math.sign(z || 1));
          return { direction: [o[0], 0.12, o[2]], directionEnd: [o2[0], 0.18, o2[2]] };
        });
      },
    },
    /* 6 ----------------------------------------------------------------- */
    {
      name: 'impact',
      duration: 2.0,
      cameraMode: 'track',
      targetActor: (s) => pickFunniest(s, tmp3),
      offset: [0, 0, 0],
      offsetEnd: [0, 0, 0],
      targetOffset: [0, -0.2, 0],
      fov: 44,
      smoothing: { position: 0.45, target: 0.2 },
      timeScale: [[0, 0.45], [0.9, 0.55], [1.7, 1.0]],
      onEnter: (s) => {
        const O = s.data.O;
        s.shot.candidates = [
          { offset: O(-3.2, 0.9, 3.6), offsetEnd: O(-2.4, 0.4, 4.0) },
          { offset: O(-3.2, 0.9, -3.6), offsetEnd: O(-2.4, 0.4, -4.0) },
          { offset: O(-4.6, 1.4, 0.8), offsetEnd: O(-4.0, 0.9, 1.4) },
          { offset: O(-1.5, 2.6, 3.2), offsetEnd: O(-1.2, 2.0, 3.6) },
        ];
        s.data.impactSeen = false;
      },
      onExit: (s) => {
        s.data.impactActor = s.shot._actor;
        s.data.impactOffset = s.shot.offsetEnd;
      },
      onUpdate: (s) => {
        // the landing gets its own jolt
        if (!s.data.impactSeen && dollHit(s.shot._actor, tmp2)) {
          s.data.impactSeen = true;
          s.shake({ trauma: 0.5, decay: 0.6 });
        }
      },
    },
    /* 7 ----------------------------------------------------------------- */
    {
      // Hold on the aftermath from where the impact shot ended (a sightline
      // it has already proved), easing back and up if there is room.
      name: 'aftermath',
      duration: 1.2,
      cameraMode: 'dolly',
      transition: { type: 'blend', duration: 1.2 },
      position: (s) => s.data.holdFrom,
      positionEnd: (s) => s.data.holdTo,
      target: (s) => actorCenter(s.data.impactActor ?? s.data.star, tmp)?.setY(tmp.y - 0.2),
      fov: 44,
      fovEnd: 48,
      ease: 'out',
      timeScale: 1,
      collide: false,
      onEnter: (s) => {
        const d = s.data;
        d.holdFrom = s.cam.position.clone();
        const back = tmp2.subVectors(s.cam.position, s.cam.target).setY(0).normalize();
        const to = d.holdFrom.clone().addScaledVector(back, 1.8).setY(d.holdFrom.y + 0.7);
        const host = s.host;
        d.holdTo = host?.lineClear && !host.lineClear(s.cam.target, to) ? d.holdFrom.clone() : to;
      },
    },
  ];
}

/* ====================================================================== */
/* beats                                                                  */
/* ====================================================================== */

function detonate(s, ctx, v, v2) {
  const d = s.data;
  const eq = ctx.get('weapons').equipment;
  const phys = ctx.get('physics');
  const at = grenadeAt(s, new THREE.Vector3());
  s.mark('blast', at);
  // Real frag detonation. Extras: a bigger fireball and less smoke so the
  // launch stays readable, and a harder shove on loose props for chaos.
  const extra = { fireScale: 1.35, smoke: 0.35, impulse: 108 * 2.2, cinematic: true };
  if (!eq.detonateNow(d.grenade, extra)) {
    ctx.events.emit('explosion', { position: at, radius: 7, damage: 250, kind: 'frag', ...extra });
  }
  const g = phys.gravity;
  const damp = d.star.ragdoll?.airDamping ?? 0.997;
  d.launches = [];
  d.blastT = ctx.time.elapsed;
  // star: into the wall he was lined up on, arriving at STAR_HIT_HEIGHT
  if (d.star.ragdoll) {
    const c = actorCenter(d.star, v);
    const W = d.starWall;
    const dir = new THREE.Vector3(W.x - c.x, 0, W.z - c.z);
    const dist = Math.max(3, dir.length() - 0.45);
    dir.normalize();
    const plan = planLaunch(dist, d.set.G.y + STAR_HIT_HEIGHT - c.y, STAR_FLIGHT, g, damp);
    d.starPlan = { ...plan, dist, wall: W };
    d.launches.push(launch(d.star, dir, plan, 1.2, v2));
  }
  // wing: the way the blast actually threw him, a shorter hop into the street
  if (d.wing.ragdoll) {
    const c = actorCenter(d.wing, v);
    const dir = new THREE.Vector3(c.x - at.x, 0, c.z - at.z).normalize();
    const plan = planLaunch(WING_DIST, d.set.G.y + 0.35 - c.y, WING_FLIGHT, g, damp);
    d.launches.push(launch(d.wing, dir, plan, 2.5, v2));
  }
  if (!d.star.ragdoll || !d.wing.ragdoll) console.warn('[cinematic] a soldier survived the blast');
}

const _near = new THREE.Vector3();

/** True once the star doll is within `m` metres of its wall (or has touched something). */
function nearImpact(s, m) {
  const d = s.data;
  const wall = d.starPlan?.wall;
  if (!wall || !d.star.ragdoll) return false;
  const c = actorCenter(d.star, _near);
  return Math.hypot(c.x - wall.x, c.z - wall.z) < m;
}

/** A doll that just hit something: touching the world and decelerating hard. */
function dollHit(actor, v) {
  const rd = actor?.ragdoll;
  if (!rd) return false;
  const vel = actorVelocity(actor, v);
  const speed = vel.length();
  const prev = actor._cineSpeed ?? speed;
  actor._cineSpeed = speed;
  return rd._touching !== false && prev - speed > 2.5;
}

/**
 * Which doll to follow into the landing: the one heading into a wall inside
 * a few metres wins; otherwise the higher, faster one.
 */
function pickFunniest(s, v) {
  const d = s.data;
  const phys = s.ctx.get('physics');
  let best = d.star;
  let bestScore = -Infinity;
  for (const a of d.men) {
    if (!a.ragdoll) continue;
    const c = actorCenter(a, v).clone();
    const vel = actorVelocity(a, new THREE.Vector3());
    const hs = Math.hypot(vel.x, vel.z);
    let score = c.y - d.set.G.y + hs * 0.2;
    if (hs > 0.5) {
      const r = phys.raycast(c.x, c.y, c.z, vel.x, 0, vel.z, 5, phys.MASK.WORLD);
      if (r.hit) score += 10 - r.distance;
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}
