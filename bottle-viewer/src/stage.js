import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PRESETS, envFor } from './lighting.js';

/**
 * One render stage = one canvas + renderer + scene. Every stage is configured
 * identically (camera, light, floor, exposure, post chain, resolution); only the
 * bottle differs. The viewer runs three for side-by-side and creates a fresh one
 * for each isolated benchmark.
 */
export class Stage {
  constructor(canvas, { width, height, pixelRatio = 1, preserve = false } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: preserve });
    const r = this.renderer;
    r.setPixelRatio(pixelRatio);
    r.toneMapping = THREE.ACESFilmicToneMapping; // same operator the game uses
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.camera.position.set(0, 0.16, 0.62);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.92, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = '__floor';
    this.floor = floor;
    this.scene.add(floor);

    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.002;
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -0.6; sc.right = sc.top = 0.6; sc.near = 0.05; sc.far = 6;
    this.scene.add(this.key, this.key.target);

    this.content = new THREE.Group();
    this.scene.add(this.content);

    // post chain: render -> subtle bloom -> [bodycam] -> output (tone map + sRGB)
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.12, 0.35, 0.92);
    this.bodycamPass = new ShaderPass(BODYCAM_SHADER);
    this.bodycamPass.enabled = false;
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.bodycamPass);
    this.composer.addPass(this.output);

    this.post = true;
    this.view = 'final';
    this.wire = false;
    this.preset = null;
    this.setSize(width ?? 640, height ?? 640);
    this.setPreset('studio');
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bodycamPass.uniforms.uAspect.value = w / h;
  }

  setPreset(id) {
    const P = PRESETS[id];
    this.preset = id;
    const env = envFor(this.renderer, id);
    this.scene.environment = env;
    this.scene.environmentIntensity = P.envIntensity;
    if (P.background) {
      this.scene.background = new THREE.Color(P.background);
    } else {
      this.scene.background = env;
      this.scene.backgroundBlurriness = 0.35;
      this.scene.backgroundIntensity = 1.0;
    }
    this.renderer.toneMappingExposure = P.exposure;
    this.floor.material.color.set(P.floor);
    this.key.color.set(P.key.color);
    this.key.intensity = P.key.intensity;
    const d = new THREE.Vector3(...P.key.dir).normalize();
    this.key.position.copy(d.multiplyScalar(2.5));
  }

  /** Replace the displayed content (a bottle, or a stress-test group). */
  setContent(obj) {
    this.content.clear();
    if (obj) this.content.add(obj);
    this._applyView();
  }

  setPost(on) { this.post = on; }
  setBodycam(on) { this.bodycamPass.enabled = on; }

  setWireframe(on) { this.wire = on; this._applyView(); }

  /** 'final' | 'albedo' | 'normal' | 'orm' | 'uv' */
  setView(mode) { this.view = mode; this._applyView(); }

  _applyView() {
    this.content.traverse((o) => {
      if (!o.isMesh || o.userData.__wire) return;
      if (!o.userData.__orig) o.userData.__orig = o.material;
      const m = o.userData.__orig;
      o.material = this.view === 'final' ? m : debugMaterial(m, this.view);
      // wire overlay child
      let w = o.children.find((c) => c.userData.__wire);
      if (this.wire && !w) {
        w = new THREE.Mesh(o.geometry, WIRE_MAT);
        w.userData.__wire = true;
        w.renderOrder = 10;
        o.add(w);
      }
      if (w) w.visible = this.wire;
    });
  }

  render(dt = 0) {
    if (this.bodycamPass.enabled) this.bodycamPass.uniforms.uTime.value += dt;
    if (this.post) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

const WIRE_MAT = new THREE.MeshBasicMaterial({ color: 0x35d0ff, wireframe: true, transparent: true, opacity: 0.55, depthTest: true });

const debugCache = new WeakMap();
function debugMaterial(m, view) {
  let c = debugCache.get(m);
  if (!c) debugCache.set(m, (c = {}));
  if (c[view]) return c[view];
  let mat;
  const side = m.side;
  if (view === 'albedo') {
    mat = new THREE.MeshBasicMaterial({ color: m.color, map: m.map ?? null, side });
  } else if (view === 'normal') {
    mat = m.normalMap ? new THREE.MeshBasicMaterial({ map: m.normalMap, side }) : new THREE.MeshBasicMaterial({ color: 0x8080ff, side });
  } else if (view === 'orm') {
    const t = m.roughnessMap ?? m.metalnessMap;
    mat = t ? new THREE.MeshBasicMaterial({ map: t, side }) : new THREE.MeshBasicMaterial({ color: new THREE.Color(1, m.roughness ?? 1, m.metalness ?? 0), side });
  } else {
    mat = new THREE.MeshBasicMaterial({ map: uvChecker(), side });
  }
  mat.toneMapped = false;
  return (c[view] = mat);
}

let _checker = null;
function uvChecker() {
  if (_checker) return _checker;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = (x + y) % 2 ? '#ddd' : '#333';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  g.fillStyle = '#e33'; g.fillRect(0, 0, 32, 4);
  _checker = new THREE.CanvasTexture(cv);
  _checker.colorSpace = THREE.SRGBColorSpace;
  _checker.wrapS = _checker.wrapT = THREE.RepeatWrapping;
  return _checker;
}

/**
 * Optional bodycam camera effect (off by default): wide barrel distortion,
 * chromatic fringe, sensor noise, vignette and a rolling exposure wobble. It is
 * a camera model only; the bottles are judged with it OFF.
 */
const BODYCAM_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.0) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; c.x *= uAspect;
      float r2 = dot(c,c);
      vec2 d = c * (1.0 + 0.28*r2 + 0.12*r2*r2); d.x /= uAspect;
      vec2 uv = d*0.9 + 0.5;
      vec2 ca = (uv-0.5)*0.006;
      vec3 col = vec3(texture2D(tDiffuse, uv+ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv-ca).b);
      col *= 1.0 + 0.04*sin(uTime*1.7);
      col = mix(col, vec3(dot(col, vec3(0.299,0.587,0.114))), 0.18);
      col += (h(vUv*vec2(1920.0,1080.0)) - 0.5) * 0.06;
      col *= smoothstep(1.05, 0.25, length(c));
      if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
