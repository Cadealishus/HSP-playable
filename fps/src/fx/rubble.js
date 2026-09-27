import * as THREE from 'three';
import { P } from './atlas.js';
import { resetSpawn } from './particles.js';

/**
 * Explosion rubble: real rigid-body chunks thrown by a blast.
 *
 * The particle debris cone in explosions.js sells the first 200 ms; these are
 * what is still bouncing down the street a second later. Each chunk is a
 * physics body (swept CCD, so it bounces off walls rather than through them,
 * with a lifetime so it expires), drawn through one InstancedMesh. FLOP OPS
 * wants explosions with a little too much force, so they leave fast and high —
 * but a capped speed and gravity bring every one of them back down in the blast
 * neighbourhood.
 *
 * Pooled, fixed capacity, no per-frame allocation. Deterministic: every random
 * draw comes from the fx rng fork handed in.
 */

const CAPACITY = 20;
const LIFETIME = 9.0;
const FADE = 0.8;

function chunkGeometry(rng) {
  // an irregular fractured lump: a subdivided icosahedron with its vertices
  // pushed in and out, flat-shaded so every facet catches light differently
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let s = seen.get(k);
    if (s === undefined) {
      s = rng.range(0.72, 1.12);
      seen.set(k, s);
    }
    // flatten one axis a little: fractured concrete is slabby, not round
    pos.setXYZ(i, x * s, y * s * 0.72, z * s * 0.9);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

export class RubbleSystem {
  constructor(fx) {
    this.fx = fx;
    this.rng = fx.rng.fork();
    this.geometry = chunkGeometry(this.rng);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.93,
      metalness: 0,
      flatShading: true,
      dithering: true,
    });
    this.material.name = 'fx-rubble';

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // per-chunk albedo: dusty concrete, plaster and the odd dark scorched piece
    const c = new THREE.Color();
    for (let i = 0; i < CAPACITY; i++) {
      const t = this.rng.float();
      if (t < 0.55) c.setRGB(0.34, 0.31, 0.27); // concrete
      else if (t < 0.85) c.setRGB(0.46, 0.41, 0.33); // sandy plaster
      else c.setRGB(0.09, 0.085, 0.08); // scorched
      c.multiplyScalar(this.rng.range(0.8, 1.1));
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // Culling is by draw range, never `visible` — see ShellSystem: a hidden
    // mesh is skipped by the boot-time program compile.
    this.geometry.setDrawRange(0, 0);
    this.mesh.name = 'fx-rubble';
    this.mesh.userData.owNoShadow = true;

    this.slots = [];
    for (let i = 0; i < CAPACITY; i++) {
      const proxy = new THREE.Object3D();
      proxy.matrixAutoUpdate = false;
      this.slots.push({ alive: false, age: 0, body: null, proxy, size: 0.06 });
    }
    this.cursor = 0;
    this._lastCount = 0;
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._ang = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._onImpact = this._onImpact.bind(this);
  }

  /**
   * Throw `n` chunks from a blast at (px, py, pz) with radius R. The spray is
   * a wide upward cone: 7-15 m/s, peaking 1.5-4 m up.
   */
  burst(px, py, pz, R, n) {
    const physics = this.fx.physics;
    if (!physics?.addRigidBody) return;
    const rng = this.rng;
    const k = Math.min(1.4, Math.max(0.6, R / 6));
    for (let i = 0; i < n; i++) {
      const slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) % CAPACITY;
      if (slot.alive) this._release(slot);
      const a = rng.float() * Math.PI * 2;
      const tilt = rng.range(0.35, 1.1); // radians from vertical
      const sp = rng.range(7, 15) * k;
      const h = Math.sin(tilt);
      this._vel.set(Math.cos(a) * h * sp, Math.cos(tilt) * sp, Math.sin(a) * h * sp);
      const off = rng.range(0.1, 0.45) * k;
      this._p.set(px + Math.cos(a) * off, py + 0.18, pz + Math.sin(a) * off);
      this._ang.set(rng.signed() * 22, rng.signed() * 22, rng.signed() * 22);
      this._e.set(rng.float() * 6.28, rng.float() * 6.28, rng.float() * 6.28);
      this._q.setFromEuler(this._e);
      const size = rng.range(0.045, 0.12);
      slot.size = size;
      slot.alive = true;
      slot.age = 0;
      slot.proxy.position.copy(this._p);
      slot.proxy.quaternion.copy(this._q);
      slot.body = physics.addRigidBody({
        shape: 'box',
        halfExtents: { x: size * 0.45, y: size * 0.33, z: size * 0.4 },
        radius: size * 0.33,
        mass: Math.max(0.05, size * size * size * 0.5 * 2200),
        position: this._p,
        quaternion: this._q,
        velocity: this._vel,
        angularVelocity: this._ang,
        restitution: 0.22,
        friction: 0.75,
        linearDamping: 0.12,
        angularDamping: 0.6,
        lifetime: LIFETIME + 1,
        surfaceType: 'concrete',
        object3D: slot.proxy,
        onImpact: this._onImpact,
      });
    }
  }

  _release(slot) {
    if (slot.body) this.fx.physics?.removeRigidBody?.(slot.body);
    slot.body = null;
    slot.alive = false;
  }

  _onImpact(body, px, py, pz, nx, ny, nz, speed) {
    if (speed < 1.5) return;
    const fx = this.fx;
    const rng = this.rng;
    const gain = Math.min(1, speed / 8);
    const s = resetSpawn();
    s.x = px; s.y = py + 0.01; s.z = pz;
    s.vx = nx * 0.4; s.vy = ny * 0.5 + 0.2; s.vz = nz * 0.4;
    s.tile = P.DUST;
    s.size0 = 0.04; s.size1 = 0.28 * gain + 0.08; s.sizeCurve = 0.5;
    s.life = 0.6; s.drag = 4; s.gravity = -0.3;
    s.rot = rng.float() * 6.28;
    s.r0 = 0.5; s.g0 = 0.46; s.b0 = 0.4;
    s.r1 = 0.46; s.g1 = 0.43; s.b1 = 0.38;
    s.alpha = 0.45 * gain; s.alphaCurve = 1.5; s.soft = 0.2; s.seed = rng.float();
    fx.emitLit(s);
  }

  update(dt) {
    let count = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const slot = this.slots[i];
      if (!slot.alive) continue;
      slot.age += dt;
      if (slot.age > LIFETIME || (slot.body && !slot.body.active)) {
        this._release(slot);
        continue;
      }
      count = i + 1;
    }
    if (count === 0 && this._lastCount === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    this._lastCount = count;
    const fadeAt = LIFETIME - FADE;
    for (let i = 0; i < CAPACITY; i++) {
      const slot = this.slots[i];
      let sc = 0;
      if (slot.alive) {
        sc = slot.size * (slot.age > fadeAt ? Math.max(0, 1 - (slot.age - fadeAt) / FADE) : 1);
      }
      this._s.set(sc, sc, sc);
      this._m.compose(slot.proxy.position, slot.proxy.quaternion, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.geometry.setDrawRange(0, count > 0 ? Infinity : 0);
  }

  dispose() {
    for (const s of this.slots) if (s.alive) this._release(s);
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
