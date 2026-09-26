// Visual effects: impacts, decals, tracers, muzzle light, casings, explosions
// (STUB — owned by the combat/fx agent). Contract: docs/CONTRACTS.md#fx
import * as THREE from 'three';

export function createFX() {
  const live = [];
  return {
    name: 'fx',
    async init(game) {
      const geo = new THREE.SphereGeometry(0.04, 6, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffcc88 });
      game.events.on('hit', (e) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(e.point);
        game.scene.add(m);
        live.push({ m, t: 0.08 });
      });
    },
    update(dt, game) {
      for (let i = live.length - 1; i >= 0; i--) {
        if ((live[i].t -= dt) <= 0) {
          game.scene.remove(live[i].m);
          live.splice(i, 1);
        }
      }
    },
  };
}
