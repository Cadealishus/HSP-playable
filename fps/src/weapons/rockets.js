import * as THREE from 'three';
import { Assembly, latheZ, box, rodZ } from './geometry.js';
import { buildRocketRound } from './models/launcher.js';

/**
 * ROCKETS — the launcher's projectile.
 *
 * A rocket is not a bullet: it leaves the tube at `speed`, the motor burns for
 * `burn` seconds adding `thrust` up to `maxSpeed`, and it droops under a
 * fraction of gravity. It is swept every physics step with a ray from where it
 * was to where it is (so it cannot tunnel), starting at the MUZZLE and on the
 * bullet mask, which does not contain the player's capsule: the shooter can
 * never be the thing it hits.
 *
 * ARMING. The fuze arms after `armDistance` metres (6 m), measured in a straight line from the launch point. Anything
 * it strikes before that is a DUD: the round breaks up with a clang, a spark
 * and a `rocket:dud` event, and nothing explodes. So a rocket fired into a wall
 * one metre away is safe, and one fired at a wall four metres away is not —
 * consistently, on every frame rate, because both are decided on the physics
 * clock by distance travelled.
 *
 * EVENTS  rocket:fire { position, direction, owner }
 *         explosion   { position, radius, damage, impulse, owner, kind:'rocket' }
 *         rocket:dud  { position, owner }
 */

const MAX_LIVE = 4;
const GRAVITY = 20.6;
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3(0, 0, -1);

export class RocketSim {
  constructor(ctx, mats) {
    this.ctx = ctx;
    this.rngT = 0;
    this.live = [];
    this.pool = [];
    this.stats = { fired: 0, exploded: 0, duds: 0, last: null };
    const bake = mats.lib?.bakeMasks?.bind(mats.lib) ?? null;
    // World mesh: the round plus the motor tube, fins and a hot nozzle glow.
    const asm = new Assembly('rocket-world');
    buildRocketRound(asm, { z: -0.15 });
    const motor = rodZ(0.028, 0.028, 0.34, 20, 0.002);
    asm.add(motor, 'steel_black', { z: 0.17 });
    motor.dispose();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = box(0.002, 0.05, 0.08, 0.0006, 1);
      asm.add(fin, 'steel', { x: Math.sin(a) * 0.045, y: Math.cos(a) * 0.045, z: 0.3, rz: -a });
      fin.dispose();
    }
    const nozzle = latheZ([[0, 0.02], [0, 0.026], [0.03, 0.02], [0.03, 0.014]], 16);
    asm.add(nozzle, 'steel_soot', { z: 0.34 });
    nozzle.dispose();
    const map = asm.build();
    this._geos = [];
    const parts = [];
    for (const [k, g] of map) {
      if (bake) bake(g, { wear: 1, grime: 1, ao: 1, edgeThreshold: 0.16 });
      this._geos.push(g);
      parts.push([g, mats.get(k)]);
    }
    this._glowGeo = new THREE.SphereGeometry(0.05, 12, 8);
    this._glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.62, 0.25).multiplyScalar(6),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
      fog: false,
    });
    for (let i = 0; i < MAX_LIVE; i++) {
      const g = new THREE.Group();
      g.name = `ow-rocket-${i}`;
      for (const [geo, mat] of parts) {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        m.userData.owNoShadow = true;
        g.add(m);
      }
      const glow = new THREE.Mesh(this._glowGeo, this._glowMat);
      glow.position.z = 0.38;
      glow.scale.set(1, 1, 2.2);
      glow.userData.owNoPrepass = true;
      glow.userData.owNoShadow = true;
      g.add(glow);
      g.visible = false;
      ctx.scene.add(g);
      this.pool.push({
        group: g,
        glow,
        alive: false,
        pos: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        travelled: 0,
        smoke: null,
        owner: null,
        def: null,
        lightT: 0,
      });
    }
    this._firePayload = { position: new THREE.Vector3(), direction: new THREE.Vector3(), owner: null };
  }

  get physics() {
    return this._phys ?? (this._phys = this.ctx.peek('physics'));
  }

  /**
   * @param {THREE.Vector3} origin  the muzzle (not the eye)
   * @param {THREE.Vector3} dir     unit
   * @param {object} p              def.projectile
   * @param {object} owner
   */
  fire(origin, dir, p, owner) {
    let r = this.pool.find((x) => !x.alive);
    if (!r) {
      r = this.live[0];
      this._explode(r);
    }
    r.alive = true;
    r.def = p;
    r.owner = owner;
    r.pos.copy(origin);
    r.prev.copy(origin);
    r.vel.copy(dir).multiplyScalar(p.speed);
    // Inherit the shooter's motion, clamped: a teleport or a physics hiccup must
    // never throw the round sideways.
    const pv = owner?.velocity;
    if (pv) {
      const l = pv.length();
      r.vel.addScaledVector(pv, l > 8 ? 8 / l : 1);
    }
    r.origin.copy(origin);
    r.age = 0;
    r.travelled = 0;
    r.lightT = 0;
    r.group.visible = true;
    r.group.position.copy(origin);
    r.group.quaternion.setFromUnitVectors(_fwd, dir);
    const fx = this.ctx.peek('fx');
    r.smoke = fx?.addSmokeSource?.(origin, {
      object: r.group, rate: 55, radius: 0.12, rise: 0.25, dark: 0.55, life: 2.6, growth: 1.6, ember: 0.35, haze: 0.4,
    }) ?? null;
    this.live.push(r);
    this.stats.fired++;
    const fp = this._firePayload;
    fp.position.copy(origin);
    fp.direction.copy(dir);
    fp.owner = owner;
    this.ctx.events.emit('rocket:fire', fp);
    return r;
  }

  fixedUpdate(h) {
    const phys = this.physics;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const r = this.live[i];
      const p = r.def;
      r.prev.copy(r.pos);
      r.age += h;
      // Motor: thrust along the velocity until burnout or top speed.
      const sp = r.vel.length();
      if (r.age < p.burn && sp < p.maxSpeed) r.vel.multiplyScalar(Math.min(p.maxSpeed, sp + p.thrust * h) / Math.max(1e-3, sp));
      r.vel.y -= GRAVITY * (p.gravity ?? 1) * 0.1 * h;
      r.pos.addScaledVector(r.vel, h);
      _seg.copy(r.pos).sub(r.prev);
      const len = _seg.length();
      if (len > 1e-6 && phys?.raycast) {
        _dir.copy(_seg).divideScalar(len);
        const hit = phys.raycast(r.prev, _dir, len, phys.MASK?.BULLET);
        if (hit?.hit) {
          r.travelled += hit.distance;
          r.pos.copy(hit.point).addScaledVector(hit.normal, 0.08);
          // Armed by STRAIGHT-LINE distance from the launch point, so no path
          // can bring an armed round back into the shooter's face.
          if (hit.point.distanceTo(r.origin) >= p.armDistance) this._explode(r);
          else this._dud(r, hit);
          continue;
        }
      }
      r.travelled += len;
      if (r.age > p.life || r.pos.y < -60) {
        // Self-destruct at the end of the motor's range (a dud if, somehow, it
        // is still inside the arming distance).
        if (r.pos.distanceTo(r.origin) >= p.armDistance) this._explode(r);
        else this._dud(r, { normal: _seg.set(0, 1, 0) });
      }
    }
  }

  update(dt) {
    const fx = this.ctx.peek('fx');
    const alpha = this.ctx.time.alpha;
    for (const r of this.live) {
      r.group.position.lerpVectors(r.prev, r.pos, alpha);
      if (r.vel.lengthSq() > 1e-6) {
        _dir.copy(r.vel).normalize();
        _q.setFromUnitVectors(_fwd, _dir);
        r.group.quaternion.copy(_q);
      }
      const burning = r.age < r.def.burn + 0.25;
      r.glow.visible = burning;
      r.lightT -= dt;
      if (burning && r.lightT <= 0 && fx?.lights?.flash) {
        r.lightT = 0.05;
        const g = r.group.position;
        fx.lights.flash(g.x, g.y, g.z, 1, 0.55, 0.22, 900, 0.09, 12, 14, 2);
      }
    }
  }

  _retire(r) {
    r.alive = false;
    r.group.visible = false;
    const i = this.live.indexOf(r);
    if (i >= 0) this.live.splice(i, 1);
    if (r.smoke !== null) this.ctx.peek('fx')?.removeSmokeSource?.(r.smoke);
    r.smoke = null;
  }

  _explode(r) {
    const p = r.def;
    this.stats.exploded++;
    this.stats.last = { kind: 'explode', travelled: r.travelled, x: r.pos.x, y: r.pos.y, z: r.pos.z };
    const pos = new THREE.Vector3().copy(r.pos); // per event
    this.ctx.events.emit('explosion', {
      position: pos,
      radius: p.radius,
      damage: p.damage,
      impulse: p.impulse,
      owner: r.owner,
      source: r.owner,
      team: r.owner?.team ?? (r.owner?.isPlayer ? 'esf' : undefined),
      kind: 'rocket',
    });
    this._retire(r);
  }

  _dud(r, hit) {
    this.stats.duds++;
    this.stats.last = { kind: 'dud', travelled: r.travelled, x: r.pos.x, y: r.pos.y, z: r.pos.z, hit: hit.object?.name ?? (hit.body ? 'body' : hit.actor ? 'actor' : null), surface: hit.surface };
    const pos = new THREE.Vector3().copy(r.pos);
    this.ctx.events.emit('rocket:dud', { position: pos, owner: r.owner });
    this.ctx.peek('audio')?.play?.('impact', pos, { surface: 'metal', energy: 1 });
    const phys = this.physics;
    // Broken-up round: a couple of hot pieces of casing.
    if (phys?.spawnDebris) {
      for (let i = 0; i < 3; i++) {
        _dir.copy(hit.normal).multiplyScalar(2 + i).add(_seg.set(i - 1, 1.5, 1 - i));
        phys.spawnDebris(pos, _dir, { size: 0.03, surface: 'metal', lifetime: 6 });
      }
    }
    this._retire(r);
  }

  clear() {
    for (const r of [...this.live]) this._retire(r);
  }

  dispose() {
    this.clear();
    for (const r of this.pool) r.group.removeFromParent();
    for (const g of this._geos) g.dispose();
    this._glowGeo.dispose();
    this._glowMat.dispose();
  }
}
