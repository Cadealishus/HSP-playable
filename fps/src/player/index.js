// Player controller (STUB — owned by the player agent). Contract: docs/CONTRACTS.md#player
// Rapier kinematic character controller + mouse look. Owns game.camera's transform.
import * as THREE from 'three';
import { LAYER, groups } from '../core/Physics.js';

const RADIUS = 0.35, HEIGHT = 1.8, EYE = 1.62;

export function createPlayer() {
  const _move = new THREE.Vector3();
  return {
    name: 'player',
    position: new THREE.Vector3(), // feet
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    alive: true,
    state: { grounded: false, sprinting: false, tacticalSprint: false, crouching: false, sliding: false, moving: false },
    motion: { bobPhase: 0, bobAmount: 0, speed01: 0, landImpulse: 0 },
    body: null,
    collider: null,

    async init(game) {
      this.game = game;
      const { RAPIER, world } = game.physics;
      this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      this.collider = world.createCollider(
        RAPIER.ColliderDesc.capsule(HEIGHT / 2 - RADIUS, RADIUS).setTranslation(0, HEIGHT / 2, 0).setCollisionGroups(groups(LAYER.PLAYER)),
        this.body,
      );
      game.physics.setData(this.collider, { type: 'player', entity: this, surface: 'flesh' });
      this.kcc = world.createCharacterController(0.02);
      this.kcc.enableAutostep(0.45, 0.2, true);
      this.kcc.enableSnapToGround(0.4);
      this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
      const sp = game.world.spawns.player[0];
      if (sp) this.setPose({ pos: [sp.pos.x, sp.pos.y, sp.pos.z], yaw: sp.yaw || 0, pitch: 0 });
    },

    // pos = feet position array/Vector3, yaw/pitch in degrees.
    setPose({ pos, yaw = 0, pitch = 0 }) {
      const p = Array.isArray(pos) ? new THREE.Vector3(...pos) : pos;
      this.position.copy(p);
      this.body.setTranslation(p, true);
      this.body.setNextKinematicTranslation(p);
      this.yaw = THREE.MathUtils.degToRad(yaw);
      this.pitch = THREE.MathUtils.degToRad(pitch);
      this.velocity.set(0, 0, 0);
    },

    get eye() {
      return new THREE.Vector3(this.position.x, this.position.y + EYE, this.position.z);
    },

    applyRecoil(pitchDeg, yawDeg) {
      this.pitch += THREE.MathUtils.degToRad(pitchDeg);
      this.yaw += THREE.MathUtils.degToRad(yawDeg);
    },

    addShake() {},

    takeDamage(amount, { direction = null, source = null } = {}) {
      if (!this.alive) return;
      this.health = Math.max(0, this.health - amount);
      this.game.events.emit('player:damaged', { amount, health: this.health, direction, source });
      if (this.health <= 0) {
        this.alive = false;
        this.game.events.emit('player:died', {});
      }
    },

    update(dt, game) {
      const inp = game.input;
      const sens = inp.sensitivity * game.settings.sensitivity;
      this.yaw -= inp.lookDelta.x * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - inp.lookDelta.y * sens, -1.5, 1.5);

      const f = (inp.down('forward') ? 1 : 0) - (inp.down('back') ? 1 : 0);
      const s = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      this.state.sprinting = inp.down('sprint') && f > 0;
      const speed = this.state.sprinting ? 6.2 : 4.0;
      _move.set(s, 0, -f);
      if (_move.lengthSq() > 0) _move.normalize().multiplyScalar(speed);
      _move.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
      this.velocity.x = _move.x;
      this.velocity.z = _move.z;
      if (this.state.grounded && inp.pressed('jump')) this.velocity.y = 4.6;
      this.velocity.y -= 9.81 * dt;

      const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
      this.kcc.computeColliderMovement(this.collider, desired);
      const m = this.kcc.computedMovement();
      this.state.grounded = this.kcc.computedGrounded();
      if (this.state.grounded && this.velocity.y < 0) this.velocity.y = 0;
      this.position.set(this.position.x + m.x, this.position.y + m.y, this.position.z + m.z);
      this.body.setNextKinematicTranslation(this.position);
      this.state.moving = _move.lengthSq() > 0;
    },

    lateUpdate(dt, game) {
      const cam = game.camera;
      cam.position.set(this.position.x, this.position.y + EYE, this.position.z);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    },
  };
}
