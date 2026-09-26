// Weapons + first-person viewmodel (STUB — owned by the weapons agent). Contract: docs/CONTRACTS.md#weapons
import * as THREE from 'three';

export function createWeapons() {
  const _dir = new THREE.Vector3();
  return {
    name: 'weapons',
    adsAmount: 0, // 0 = hip, 1 = fully aimed. Player reads this for FOV + move speed.
    current: null,
    cooldown: 0,

    async init(game) {
      this.current = { id: 'ar', name: 'M4 Carbine', mag: 30, magSize: 30, reserve: 120, rpm: 800, damage: 34, adsZoom: 1.3 };
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 }));
      gun.position.set(0.16, -0.16, -0.4);
      game.viewmodel.root.add(gun);
      this.gun = gun;
      game.registerShot('weapon-hip', {
        description: 'Hip-fire idle with the rifle',
        setup: () => window.__fps.pose({ pos: [0, 0, 8], yaw: 0, pitch: 0 }),
      });
    },

    update(dt, game) {
      const inp = game.input;
      this.adsAmount = THREE.MathUtils.damp(this.adsAmount, inp.down('ads') ? 1 : 0, 14, dt);
      this.gun.position.x = THREE.MathUtils.lerp(0.16, 0, this.adsAmount);
      this.cooldown -= dt;
      const w = this.current;
      if (inp.down('fire') && this.cooldown <= 0 && w.mag > 0) {
        this.cooldown = 60 / w.rpm;
        w.mag--;
        game.camera.getWorldDirection(_dir);
        game.events.emit('weapon:fire', {
          weapon: w,
          origin: game.camera.position.clone(),
          direction: _dir.clone(),
          muzzleWorld: game.camera.position.clone().add(_dir.clone().multiplyScalar(0.8)),
          ads: this.adsAmount > 0.5,
          source: 'player',
        });
        game.events.emit('weapon:ammo', { weapon: w, mag: w.mag, reserve: w.reserve, magSize: w.magSize });
      }
      if (inp.pressed('reload') && w.reserve > 0) {
        const n = Math.min(w.magSize - w.mag, w.reserve);
        w.mag += n;
        w.reserve -= n;
        game.events.emit('weapon:ammo', { weapon: w, mag: w.mag, reserve: w.reserve, magSize: w.magSize });
      }
    },
  };
}
