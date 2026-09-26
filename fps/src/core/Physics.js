// Rapier physics wrapper. One world, fixed 120 Hz step, collider -> gameplay data lookup,
// and a raycast that returns plain three.js vectors. See docs/CONTRACTS.md.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// Collision membership bits. Use `groups(member, filter)` to build Rapier interaction groups.
export const LAYER = {
  WORLD: 1 << 0, // static level geometry
  PROP: 1 << 1, // dynamic props, crates, barrels
  PLAYER: 1 << 2, // player capsule
  ENEMY: 1 << 3, // enemy movement capsules
  HITBOX: 1 << 4, // per-bone damage hitboxes (enemies)
  DEBRIS: 1 << 5, // shell casings, gibs, small debris (never blocks characters)
  TRIGGER: 1 << 6,
};
export const ALL = 0xffff;

export function groups(member, filter = ALL) {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

const _v = new THREE.Vector3();

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.fixedDt = 1 / 120;
    this.world.timestep = this.fixedDt;
    this.accumulator = 0;
    this.maxSubsteps = 8;
    this.data = new Map(); // collider.handle -> { surface, entity, part, type, ... }
    this.alpha = 0; // interpolation factor after step()
    this.stepListeners = []; // fn(fixedDt) called before each fixed sub-step
  }

  // Advance by a variable frame dt using fixed sub-steps.
  step(dt) {
    this.accumulator += Math.min(dt, 0.1);
    let n = 0;
    while (this.accumulator >= this.fixedDt && n < this.maxSubsteps) {
      for (const fn of this.stepListeners) fn(this.fixedDt);
      this.world.step();
      this.accumulator -= this.fixedDt;
      n++;
    }
    if (n === this.maxSubsteps) this.accumulator = 0;
    this.alpha = this.accumulator / this.fixedDt;
  }

  onStep(fn) {
    this.stepListeners.push(fn);
    return () => {
      const i = this.stepListeners.indexOf(fn);
      if (i >= 0) this.stepListeners.splice(i, 1);
    };
  }

  setData(collider, data) {
    this.data.set(collider.handle, data);
    return collider;
  }

  getData(collider) {
    return collider ? this.data.get(collider.handle) : undefined;
  }

  removeCollider(collider) {
    this.data.delete(collider.handle);
    this.world.removeCollider(collider, true);
  }

  removeBody(body) {
    for (let i = 0; i < body.numColliders(); i++) this.data.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  // Static triangle-mesh collider from a mesh (or any Object3D subtree) in world space.
  // data: { surface: 'concrete' | 'metal' | ..., type: 'world', ... }
  addStaticMesh(object, data = { type: 'world', surface: 'concrete' }, member = LAYER.WORLD) {
    object.updateWorldMatrix(true, true);
    const colliders = [];
    object.traverse((m) => {
      if (!m.isMesh || m.userData.noCollide) return;
      const geo = m.geometry;
      const pos = geo.attributes.position;
      const verts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        verts[i * 3] = _v.x;
        verts[i * 3 + 1] = _v.y;
        verts[i * 3 + 2] = _v.z;
      }
      let idx;
      if (geo.index) idx = new Uint32Array(geo.index.array);
      else {
        idx = new Uint32Array(pos.count);
        for (let i = 0; i < pos.count; i++) idx[i] = i;
      }
      const desc = RAPIER.ColliderDesc.trimesh(verts, idx).setCollisionGroups(groups(member));
      const c = this.world.createCollider(desc);
      this.setData(c, { ...data, ...(m.userData.physics || {}), object: m });
      colliders.push(c);
    });
    return colliders;
  }

  // Static oriented box. center: Vector3, half: Vector3, quat: Quaternion (optional).
  addStaticBox(center, half, quat = null, data = { type: 'world', surface: 'concrete' }, member = LAYER.WORLD) {
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups(member));
    if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const c = this.world.createCollider(desc);
    this.setData(c, data);
    return c;
  }

  // Raycast. Returns { point, normal, distance, collider, data } or null.
  // opts.filterGroups: Rapier interaction groups for the ray (default: everything but DEBRIS/TRIGGER)
  // opts.exclude: collider or rigid body to ignore
  // opts.predicate: (collider) => boolean
  raycast(origin, dir, maxDist = 1000, opts = {}) {
    const ray = new RAPIER.Ray(origin, dir);
    const filterGroups = opts.filterGroups ?? groups(ALL, ALL & ~(LAYER.DEBRIS | LAYER.TRIGGER));
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDist,
      true,
      undefined,
      filterGroups,
      opts.exclude?.handle !== undefined && opts.exclude.numColliders === undefined ? opts.exclude : undefined,
      opts.exclude?.numColliders !== undefined ? opts.exclude : undefined,
      opts.predicate,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact ?? hit.toi;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      data: this.getData(hit.collider) || {},
    };
  }
}
