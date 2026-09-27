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

const CAPACITY = 40;
const LIFETIME = 9.0;
const FADE = 0.8;

/**
 * A 64² tiling concrete/plaster surface: value-noise albedo modulation (white,
 * tinted per chunk through instanceColor) with aggregate pits, and a normal
 * map derived from the same height field. Small, but it is what stops a chunk
 * reading as a flat-shaded polygon at 3 m.
 */
function rubbleTextures(rng) {
  const N = 64;
  const h = new Float32Array(N * N);
  // three octaves of tiling value noise
  let amp = 1, tot = 0;
  for (const g of [4, 8, 16]) {
    const grid = new Float32Array(g * g);
    for (let i = 0; i < grid.length; i++) grid[i] = rng.float();
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * g, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * g, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const a = grid[(y0 % g) * g + (x0 % g)], b = grid[(y0 % g) * g + ((x0 + 1) % g)];
        const c = grid[((y0 + 1) % g) * g + (x0 % g)], d = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        h[y * N + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < h.length; i++) h[i] /= tot;
  // aggregate pits
  for (let k = 0; k < 40; k++) {
    const cx = rng.float() * N, cy = rng.float() * N, r = rng.range(0.8, 2.2);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y) / r;
      if (d < 1) {
        const i = (((cy + y) | 0) + N) % N * N + ((((cx + x) | 0) + N) % N);
        h[i] -= 0.25 * (1 - d * d);
      }
    }
  }
  const alb = new Uint8Array(N * N * 4);
  const nrm = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const v = Math.max(0, Math.min(1, 0.62 + (h[i] - 0.5) * 0.9));
      alb[i * 4] = alb[i * 4 + 1] = alb[i * 4 + 2] = Math.round(v * 255);
      alb[i * 4 + 3] = 255;
      const l = h[y * N + ((x + N - 1) % N)], r = h[y * N + ((x + 1) % N)];
      const u = h[((y + N - 1) % N) * N + x], d = h[((y + 1) % N) * N + x];
      let nx = (l - r) * 5, ny = (u - d) * 5, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nrm[i * 4] = Math.round((nx / len * 0.5 + 0.5) * 255);
      nrm[i * 4 + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      nrm[i * 4 + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      nrm[i * 4 + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(alb, true), normal: mk(nrm, false) };
}

function chunkGeometry(rng) {
  // an irregular fractured lump: a subdivided icosahedron with its vertices
  // pushed in and out (shared vertices move together, so it stays closed and
  // smooth-shaded; the normal map supplies the surface breakup)
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
  const merged = mergeByPosition(g);
  g.dispose();
  merged.computeVertexNormals();
  return merged;
}

/** Weld coincident vertices so normals smooth across faces. */
function mergeByPosition(g) {
  const pos = g.attributes.position, uv = g.attributes.uv;
  const map = new Map(), P = [], U = [], idx = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = P.length / 3;
      map.set(k, j);
      P.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      // planar-ish UVs from position: the texture tiles, so seams do not show
      U.push(pos.getX(i) * 1.7 + pos.getZ(i) * 0.6, pos.getY(i) * 1.7 - pos.getZ(i) * 0.4);
    }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  out.setIndex(idx);
  return out;
}

export class RubbleSystem {
  constructor(fx) {
    this.fx = fx;
    this.rng = fx.rng.fork();
    this.geometry = chunkGeometry(this.rng);
    this.textures = rubbleTextures(this.rng);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.map,
      normalMap: this.textures.normal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.92,
      metalness: 0,
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
    this.textures.map.dispose();
    this.textures.normal.dispose();
    this.mesh.dispose();
  }
}
