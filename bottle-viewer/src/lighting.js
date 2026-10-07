import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Lighting presets. Every environment is generated procedurally (no HDR
 * downloads), so each stage builds a bit-identical copy in its own WebGL
 * context and every bottle sees exactly the same light.
 */
export const PRESETS = {
  studio: {
    label: 'Neutral studio',
    exposure: 1.0,
    background: '#5b5e62',
    floor: '#6f7276',
    key: { color: '#ffffff', intensity: 2.6, dir: [-0.55, 1.0, 0.7] },
    envIntensity: 1.0,
  },
  outdoor: {
    label: 'Bright outdoor',
    exposure: 0.85,
    background: null, // sky env
    floor: '#9a8f7c',
    key: { color: '#fff3df', intensity: 6.5, dir: [-0.5, 1.15, 0.35] },
    envIntensity: 1.0,
  },
  indoor: {
    label: 'Dim indoor',
    exposure: 1.35,
    background: '#16130f',
    floor: '#2c2620',
    key: { color: '#ffcf96', intensity: 1.1, dir: [0.6, 1.0, 0.5] },
    envIntensity: 0.9,
  },
};

const cache = new WeakMap();

/** PMREM env for a preset, cached per renderer. */
export function envFor(renderer, id) {
  let m = cache.get(renderer);
  if (!m) cache.set(renderer, (m = {}));
  if (m[id]) return m[id];
  const pmrem = new THREE.PMREMGenerator(renderer);
  let rt;
  if (id === 'studio') {
    rt = pmrem.fromScene(new RoomEnvironment(), 0.02);
  } else if (id === 'outdoor') {
    rt = pmrem.fromScene(skyScene(), 0.0);
  } else {
    rt = pmrem.fromScene(roomScene(), 0.02);
  }
  pmrem.dispose();
  m[id] = rt.texture;
  return m[id];
}

function skyScene() {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD;
        void main(){
          float h = vD.y;
          vec3 zen = vec3(0.16,0.32,0.78)*1.6;
          vec3 hor = vec3(0.78,0.86,0.95)*2.2;
          vec3 gnd = vec3(0.36,0.31,0.25)*0.9;
          vec3 c = h > 0.0 ? mix(hor, zen, pow(h, 0.55)) : mix(hor*0.6, gnd, pow(-h, 0.4));
          // sun glow toward the key light direction
          vec3 sd = normalize(vec3(-0.5,1.15,0.35));
          float g = max(dot(normalize(vD), sd), 0.0);
          c += vec3(1.0,0.92,0.78) * (pow(g, 900.0) * 900.0 + pow(g, 12.0) * 1.2);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  s.add(sky);
  return s;
}

function roomScene() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0x1d1a16, side: THREE.BackSide }));
  room.position.y = 1.2;
  s.add(room);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.42).multiplyScalar(14) }));
  lamp.position.set(1.4, 2.4, 1.0);
  s.add(lamp);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.55, 0.75).multiplyScalar(1.6), side: THREE.DoubleSide }));
  win.position.set(-3.9, 1.6, -0.5);
  win.rotation.y = Math.PI / 2;
  s.add(win);
  const table = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 2), new THREE.MeshBasicMaterial({ color: 0x3a2e22 }));
  table.position.y = -0.4;
  s.add(table);
  return s;
}
