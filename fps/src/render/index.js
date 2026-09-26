// Render system (STUB — owned by the render agent). Creates the WebGLRenderer, lights, sky,
// and composites world + viewmodel each frame. Contract: docs/CONTRACTS.md#render
import * as THREE from 'three';

export function createRender() {
  const sys = {
    name: 'render',
    renderer: null,
    sun: null,
    sunDirection: new THREE.Vector3(-0.5, 0.45, -0.3).normalize(), // direction TOWARDS the sun
    envMap: null,

    async init(game) {
      const renderer = new THREE.WebGLRenderer({ canvas: game.canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(game.canvas.clientWidth || innerWidth, game.canvas.clientHeight || innerHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.autoClear = false;
      this.renderer = renderer;

      game.scene.background = new THREE.Color(0x9fb4c8);
      game.scene.fog = new THREE.Fog(0x9fb4c8, 60, 400);
      game.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a3b2a, 0.8));
      const sun = new THREE.DirectionalLight(0xffe2b8, 2.5);
      sun.position.copy(this.sunDirection).multiplyScalar(100);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
      game.scene.add(sun, sun.target);
      this.sun = sun;

      // Viewmodel lighting mirrors the world lights (in world orientation; viewmodel camera is synced).
      const vm = game.viewmodel;
      vm.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a3b2a, 0.8));
      this.vmSun = new THREE.DirectionalLight(0xffe2b8, 2.5);
      vm.scene.add(this.vmSun, this.vmSun.target);
    },

    // Call on any Object3D added at runtime so it picks up render-specific material setup.
    prepare(object) {
      return object;
    },

    resize(w, h) {
      this.renderer.setSize(w, h, false);
    },

    renderFrame(dt, game) {
      const r = this.renderer;
      const cam = game.camera;
      // Keep the viewmodel camera + root aligned to the world camera orientation so lights match.
      const vm = game.viewmodel;
      vm.camera.quaternion.copy(cam.quaternion);
      vm.root.quaternion.copy(cam.quaternion);
      this.vmSun.position.copy(this.sunDirection).multiplyScalar(10);
      r.clear();
      r.render(game.scene, cam);
      r.clearDepth();
      r.render(vm.scene, vm.camera);
    },
  };
  return sys;
}
