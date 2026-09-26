// World / level (STUB — owned by the world agent). Contract: docs/CONTRACTS.md#world
import * as THREE from 'three';

export function createWorld() {
  return {
    name: 'world',
    spawns: { player: [], enemies: [] },
    coverPoints: [],
    bounds: new THREE.Box3(new THREE.Vector3(-100, -5, -100), new THREE.Vector3(100, 50, 100)),

    async init(game) {
      const mats = game.materials;
      const root = new THREE.Group();
      root.name = 'world';
      game.scene.add(root);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), mats.get('dirt'));
      ground.receiveShadow = true;
      root.add(ground);

      const rand = game.random;
      for (let i = 0; i < 24; i++) {
        const w = 4 + rand() * 8, h = 3 + rand() * 9, d = 4 + rand() * 8;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.get(i % 2 ? 'plaster' : 'concrete'));
        const a = rand() * Math.PI * 2, r = 15 + rand() * 50;
        b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
        b.castShadow = b.receiveShadow = true;
        root.add(b);
      }
      for (const m of root.children) {
        game.physics.addStaticMesh(m, { type: 'world', surface: game.materials.surfaceOf(m.material) });
      }

      this.spawns.player.push({ pos: new THREE.Vector3(0, 0, 0), yaw: 0 });
      for (let i = 0; i < 6; i++) this.spawns.enemies.push({ pos: new THREE.Vector3(-20 + i * 8, 0, -30), yaw: 180 });

      game.registerShot('overview', {
        description: 'Player spawn looking down the main street',
        setup: (g) => window.__fps.pose({ pos: [0, 0, 8], yaw: 0, pitch: -5 }),
      });
    },
  };
}
