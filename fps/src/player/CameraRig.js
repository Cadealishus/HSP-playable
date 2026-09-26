// First-person camera feel: eye height transitions, stair smoothing, landing dip, footstep-synced
// head bob, sprint/slide FOV, slide roll, trauma shake (gradient noise), recoil with partial
// recovery, damage flinch, mantle dip, ADS zoom + sensitivity scaling, and the death camera.
import * as THREE from 'three';
import { TUNING as T } from './config.js';
import { Spring, makeNoise1D, clamp, lerp, damp, DEG, smoothstep } from './util.js';

export class CameraRig {
  constructor(player) {
    this.player = player;
    this.noise = [makeNoise1D(11), makeNoise1D(23), makeNoise1D(37), makeNoise1D(41), makeNoise1D(53), makeNoise1D(67)];
    this.eye = Spring.of(20, 1.0); // eye height (critically damped, ~0.2 s)
    this.step = Spring.of(26, 1.0); // stair / kerb smoothing offset
    this.landY = Spring.of(15, 0.5); // landing dip (metres)
    this.landP = Spring.of(13, 0.55); // landing pitch dip (degrees)
    this.slideRoll = Spring.of(11, 0.85);
    this.punchP = Spring.of(40, 0.42); // per-shot visual punch (degrees)
    this.punchR = Spring.of(32, 0.5);
    this.flinchP = Spring.of(17, 0.6);
    this.flinchY = Spring.of(17, 0.6);
    this.flinchR = Spring.of(15, 0.6);
    this.mantleP = Spring.of(12, 0.8);
    this.mantleR = Spring.of(11, 0.8);
    this.mantleY = Spring.of(12, 0.8);
    this.reset();
  }

  init(game) {
    this.game = game;
  }

  reset() {
    const p = this.player;
    const e = T.eye[p.stance === 'slide' ? 'slide' : p.stance] ?? T.eye.stand;
    this.eye.reset(e);
    for (const s of [this.step, this.landY, this.landP, this.slideRoll, this.punchP, this.punchR, this.flinchP, this.flinchY, this.flinchR, this.mantleP, this.mantleR, this.mantleY]) s.reset(0);
    this.fovAdd = 0;
    this.recP = 0;
    this.recY = 0;
    this.lastRecoilAt = -10;
    this.shakes = [];
    this.trauma = 0;
    this.time = 0;
    this.death = null;
    this.leanRoll = 0;
    this.lastFov = -1;
    this.eyeHeight = e;
  }

  // ---------------------------------------------------------------- events from the controller
  onStep(dy) {
    this.step.x = clamp(this.step.x - dy, -0.5, 0.5);
  }

  onJump() {
    this.landP.impulse(6); // small upward nod on take-off
    this.landY.impulse(0.25);
  }

  onLand(impact) {
    const v = 0.15 * impact + 0.0045 * impact * impact;
    this.landY.impulse(-Math.min(v, 3.2));
    this.landP.impulse(-Math.min(impact * 2.6, 45));
  }

  onSlideStart() {
    this.shake(0.12, 0.25);
  }

  onSlideEnd() {}

  onMantleStart(m) {
    this.shake(0.1 + 0.05 * m.height, 0.2);
  }

  onMantleEnd() {
    this.landY.impulse(-0.35);
  }

  onDeath(dir) {
    const p = this.player;
    let side = this.game.random() < 0.5 ? -1 : 1;
    if (dir) {
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const s = dir.x * rx + dir.z * rz; // attacker on the right → fall to the left
      if (Math.abs(s) > 0.2) side = s > 0 ? 1 : -1;
    }
    this.death = { t: 0, side, eye0: this.eyeHeight, pitch0: p.pitch, twist: (this.game.random() - 0.5) * 0.5 };
    this.shake(0.35, 0.35);
  }

  // ---------------------------------------------------------------- inputs from other systems
  recoil(pitchDeg, yawDeg) {
    const p = this.player;
    const r = T.recoil.recoverFraction;
    p.pitch = clamp(p.pitch + pitchDeg * (1 - r) * DEG, -1.5, 1.5);
    p.yaw += yawDeg * (1 - r) * DEG;
    this.recP += pitchDeg * r;
    this.recY += yawDeg * r;
    this.lastRecoilAt = this.time;
    this.punchP.impulse(pitchDeg * T.recoil.punch * 40);
    this.punchR.impulse((this.game.random() - 0.5) * pitchDeg * 30);
  }

  shake(intensity, duration) {
    if (!(intensity > 0)) return;
    if (this.shakes.length > 24) this.shakes.shift();
    this.shakes.push({ a: Math.min(1, intensity), t: 0, d: Math.max(0.05, duration || 0.3) });
  }

  flinch(dir, amount) {
    const p = this.player;
    const s = clamp(amount / 35, 0.3, 1.4);
    let side = (this.game.random() - 0.5) * 0.6, front = 1;
    if (dir) {
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      side = dir.x * rx + dir.z * rz;
      front = dir.x * fx + dir.z * fz;
    }
    // Pushed away from the hit: pitch up for frontal hits, yaw/roll away from the attacker's side.
    this.flinchP.impulse((0.6 + 0.9 * Math.max(0, front)) * s * 30);
    this.flinchY.impulse(side * 1.1 * s * 30);
    this.flinchR.impulse(-side * 2.2 * s * 30 + (this.game.random() - 0.5) * 20 * s);
    this.shake(0.16 * s, 0.25);
  }

  // Mouse sensitivity multiplier (ADS scales by the zoom ratio × settings.adsSensitivity).
  lookScale(game) {
    const ads = clamp(game.weapons?.adsAmount ?? 0, 0, 1);
    if (ads <= 0) return 1;
    const zoom = Math.max(1, game.weapons?.current?.adsZoom ?? 1.25);
    return lerp(1, (game.settings.adsSensitivity ?? 1) / zoom, ads);
  }

  // ---------------------------------------------------------------- per frame
  apply(dt, game) {
    const p = this.player;
    const st = p.state;
    const cam = game.camera;
    this.time += dt;
    if (p.debugView) {
      // Harness-only fixed viewpoint (e.g. the course overview shot). Cleared by setPose.
      const v = p.debugView;
      cam.position.copy(v.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(v.target);
      if (v.fov && game.verticalFov(v.fov) !== cam.fov) {
        cam.fov = game.verticalFov(v.fov);
        cam.updateProjectionMatrix();
      }
      cam.updateMatrixWorld();
      return;
    }

    // Eye height by stance.
    let eyeTarget = p.stance === 'slide' ? T.eye.slide : T.eye[p.stance] ?? T.eye.stand;
    if (dt > 0) {
      this.eye.update(dt, eyeTarget);
      this.step.update(dt, 0);
      this.landY.update(dt, 0);
      this.landP.update(dt, 0);
      this.slideRoll.update(dt, st.sliding ? T.slideRoll : 0);
      this.punchP.update(dt, 0);
      this.punchR.update(dt, 0);
      this.flinchP.update(dt, 0);
      this.flinchY.update(dt, 0);
      this.flinchR.update(dt, 0);
    }
    let eyeY = this.eye.x;
    if (!p.mantle && p.alive) eyeY = Math.min(eyeY, p.capsuleHeight - 0.1);

    // Mantle: pull-up dip and lean.
    let mP = 0, mR = 0, mY = 0;
    if (p.mantle) {
      const m = p.mantle;
      const u = clamp(m.t / m.dur, 0, 1);
      const s = Math.sin(Math.PI * u);
      if (m.vault) {
        mP = -(3.5 + 2 * m.height) * s;
        mR = -3.5 * s;
        mY = -0.05 * s;
      } else {
        mP = -(3 + 3.2 * m.height) * Math.pow(s, 1.3);
        mR = 2.5 * s;
        mY = -0.1 * s;
      }
    }
    if (dt > 0) {
      this.mantleP.update(dt, mP);
      this.mantleR.update(dt, mR);
      this.mantleY.update(dt, mY);
    }

    // Head bob, footstep-synced (phase driven by the controller's stride model).
    const mo = p.motion;
    const ads = clamp(p.adsAmount, 0, 1);
    let amp = T.bob.walk;
    if (st.sprinting) amp = st.tacticalSprint ? T.bob.tac : T.bob.sprint;
    else if (p.stance === 'crouch') amp = T.bob.crouch;
    else if (p.stance === 'prone') amp = T.bob.prone;
    amp = lerp(amp, T.bob.ads, ads) * mo.bobAmount;
    const ph = mo.bobPhase;
    const bobY = (-amp * Math.cos(2 * ph)) / 2;
    const bobX = amp * T.bob.lateral * Math.sin(ph);
    const bobR = T.bob.roll * (amp / T.bob.walk) * Math.sin(ph) * 0.6;
    const bobP = 0.12 * (amp / T.bob.walk) * Math.sin(2 * ph);

    // Sprint / slide FOV and strafe lean.
    const hs = Math.hypot(p.velocity.x, p.velocity.z);
    let fovT = 0;
    if (st.sliding) fovT = T.fov.slide;
    else if (st.tacticalSprint) fovT = T.fov.tac * clamp(hs / T.speed.tac, 0, 1);
    else if (st.sprinting) fovT = T.fov.sprint * clamp(hs / T.speed.sprint, 0, 1);
    if (dt > 0) this.fovAdd = damp(this.fovAdd, fovT, T.fov.rate, dt);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const lateral = p.velocity.x * rx + p.velocity.z * rz;
    if (dt > 0) this.leanRoll = damp(this.leanRoll, st.grounded && !st.sliding ? clamp(-lateral / T.speed.walk, -1, 1) * 0.35 : 0, 8, dt);

    // Recoil recovery (back towards the aim point; slower while still firing).
    if (dt > 0) {
      const rate = this.time - this.lastRecoilAt > T.recoil.recoverDelay ? T.recoil.recoverRate : T.recoil.sustainedRate;
      const k = Math.exp(-rate * dt);
      this.recP *= k;
      this.recY *= k;
    }

    // Trauma shake.
    let trauma = 0;
    if (dt > 0) for (const s of this.shakes) s.t += dt;
    this.shakes = this.shakes.filter((s) => s.t < s.d);
    for (const s of this.shakes) trauma += s.a * Math.pow(1 - s.t / s.d, 1.5);
    trauma = Math.min(1, trauma);
    this.trauma = trauma;
    const sh = trauma * trauma;
    const tn = this.time * 16;
    const N = this.noise;
    const shP = sh * 3.2 * N[0](tn), shY = sh * 3.2 * N[1](tn + 31.7), shR = sh * 4.5 * N[2](tn + 63.1);
    const shX = sh * 0.035 * N[3](tn + 12.3), shYp = sh * 0.035 * N[4](tn + 44.9);

    // Death camera: collapse to the ground and tip over to one side.
    let dY = 0, dP = 0, dR = 0, dYaw = 0, dSide = 0;
    if (!p.alive && this.death) {
      const d = this.death;
      if (dt > 0) d.t += dt;
      const fall = clamp(d.t / 0.62, 0, 1);
      const drop = fall * fall;
      const bounce = d.t > 0.62 ? Math.sin((d.t - 0.62) * 18) * Math.exp(-(d.t - 0.62) * 7) * 0.035 : 0;
      eyeY = lerp(d.eye0, T.eye.dead, drop) + bounce;
      const tip = smoothstep(clamp((d.t - 0.08) / 0.75, 0, 1));
      dR = d.side * 78 * tip;
      dP = (8 * DEG - d.pitch0) / DEG * tip - 6 * Math.sin(Math.PI * fall);
      dYaw = d.side * 14 * tip + d.twist * 20 * tip;
      dSide = -d.side * 0.35 * tip;
    }

    this.eyeHeight = eyeY;
    const rp = p.renderPosition;
    const yOff = eyeY + this.step.x + this.landY.x + bobY + this.mantleY.x + shYp;
    const side = bobX + shX + dSide;
    cam.position.set(rp.x + rx * side, rp.y + yOff, rp.z + rz * side);

    const pitch =
      p.pitch +
      (this.recP + this.punchP.x + this.flinchP.x + this.landP.x + this.mantleP.x + bobP + shP + dP) * DEG;
    const yaw = p.yaw + (this.recY + this.flinchY.x + shY + dYaw) * DEG;
    const roll =
      (this.slideRoll.x + this.punchR.x + this.flinchR.x + this.mantleR.x + bobR + shR + this.leanRoll + dR) * DEG;
    cam.rotation.set(clamp(pitch, -1.55, 1.55), yaw, roll, 'YXZ');

    // FOV: CoD horizontal-at-4:3 degrees + sprint/slide add, then ADS zoom in tan space.
    const base = game.settings.fov ?? 80;
    const zoom = Math.max(1, game.weapons?.current?.adsZoom ?? 1.25);
    const tHip = Math.tan((game.verticalFov(base + this.fovAdd * (1 - ads)) * DEG) / 2);
    const tAds = Math.tan((game.verticalFov(base) * DEG) / 2) / zoom;
    const fov = (2 * Math.atan(lerp(tHip, tAds, ads))) / DEG;
    if (Math.abs(fov - cam.fov) > 1e-4) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    mo.landImpulse = clamp(-this.landY.x / 0.08, 0, 1);
  }
}
