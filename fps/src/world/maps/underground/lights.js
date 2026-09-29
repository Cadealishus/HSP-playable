import * as THREE from 'three';
import { slab, boxAt, cylAt } from '../airport/kit.js';
import { flicker } from '../shared/kit.js';
import { V, Y } from './layout.js';

/**
 * UNDERGROUND: the practical lighting, and the power switch.
 *
 * The level has no sun and almost no sky, so what you see is what these
 * fixtures light. Every fixture is an emissive mesh (free, blooms, reads at
 * any distance); a minority also carry a shadowless point light, distance
 * culled by `render` at 11-16 m, so only a handful are ever live at once and
 * the world's light ballast (src/world/index.js) holds the count constant.
 *
 * Fixture kinds:
 *   tube     fluorescent batten on mains       cool white   (tube_white)
 *   flickA/B failing batten, mains              cool white   (tube_flicker_a/b)
 *   red      emergency bulkhead, battery        red          (lamp_red_ug)
 *   work     caged tungsten / tripod lamp       warm         (lamp_work)
 *   sodium   the street lamp                    orange       (lamp_sodium)
 *   arc      the shorting junction box          blue-white   (arc_blue)
 *
 * POWER. `setPower('normal' | 'emergency')`:
 *   normal     mains fixtures on (two batches flicker), emergency-section
 *              fixtures red (the east tunnel and the deep level already run
 *              on battery), work lamps on their own generator.
 *   emergency  mains dies: tubes go dark except those marked `backup`, which
 *              drop to a dim red; red bulkheads brighten; work lamps stay (they
 *              are on the facility generator); signs go dark.
 */

// [x, y, z, kind, light?, opts]. y is the fixture's height. Level metres.
const P = Y.plat;
const H = Y.hall;
const TUBES = [
  // ticket hall
  [-54, H + 4.3, -27, 'tube', 1, { backup: true }],
  [-40, H + 4.3, -27, 'flickA', 1],
  [-48, H + 4.3, -17, 'tube', 1, { backup: true }],
  [-36, H + 4.3, -17, 'tube', 0],
  [-58, H + 4.3, -17, 'tube', 0],
  // stairs
  [-49.5, 16.0, -38, 'flickB', 1, { range: 10 }],
  [-25, 12.6, -14, 'tube', 1, { range: 11, backup: true }],
  // platform A (the tubes hang on rods, 3.3 m above the platform)
  [-14, P + 3.3, -11.6, 'tube', 1, { backup: true }],
  [-2, P + 3.3, -11.6, 'tube', 0],
  [4, P + 3.3, -11.6, 'flickA', 1],
  [10, P + 3.3, -11.6, 'tube', 0],
  [16, P + 3.3, -11.6, 'tube', 1],
  [22, P + 3.3, -11.6, 'tube', 0],
  [28, P + 3.3, -11.6, 'tube', 0],
  [34, P + 3.3, -11.6, 'tube', 1, { backup: true }],
  // platform B (the east half is dead: that section is on battery)
  [-14, P + 3.3, 5.6, 'tube', 1],
  [-2, P + 3.3, 5.6, 'tube', 0],
  [4, P + 3.3, 5.6, 'flickB', 1, { backup: true }],
  [10, P + 3.3, 5.6, 'tube', 0],
  [16, P + 3.3, 5.6, 'dead', 0],
  [28, P + 2.6, 7.7, 'red', 1],
  // corridors and rooms
  [0, P + 3.05, -15.9, 'tube', 1, { range: 11, backup: true }],
  [24, P + 3.05, -15.9, 'flickA', 1, { range: 11 }],
  [7.5, P + 3.25, -21.4, 'tube', 1, { range: 10 }],
  [25.5, P + 4.05, -22.4, 'work', 1, { range: 13 }],
  [-8, P + 3.05, 9.9, 'tube', 1, { range: 11 }],
  [18, P + 3.05, 9.9, 'flickB', 1, { range: 11, backup: true }],
  [-8.5, P + 3.25, 15.2, 'flickA', 1, { range: 10 }],
  [6, P + 3.05, 15.2, 'tube', 1, { range: 10, backup: true }],
  [19, P + 3.05, 15.2, 'tube', 1, { range: 10 }],
  [30, P - 1.0, 16, 'red', 1, { range: 10 }],
  // west tunnel and its side room
  [-26, 8.4, 1.6, 'red', 1, { range: 12 }],
  [-35.5, Y.track + 3.0, 6.2, 'work', 1, { range: 10 }],
  // east tunnel: emergency section, red bulkheads on the south wall
  [48, 7.0, 1.7, 'red', 1, { range: 13 }],
  [60, 7.0, 1.7, 'red', 0],
  [70, 7.0, 1.7, 'red', 1, { range: 13 }],
  [80, 7.0, 1.7, 'red', 0],
  [51, P + 2.6, -6.1, 'trainFlick', 1, { range: 8 }],
  // ramp, deep tunnel
  [74, 5.4, 11, 'red', 1, { range: 12 }],
  [34, 3.5, 23, 'red', 1, { range: 12 }],
  [48, 3.5, 23, 'tube', 1, { range: 12, backup: true }],
  [64, 3.5, 23, 'red', 0],
  // command facility: work lamps on tripods and caged fittings
  [40, 6.6, 42, 'work', 1, { range: 16 }],
  [56, 6.6, 36, 'work', 1, { range: 16 }],
  [70, 6.6, 42, 'work', 1, { range: 16 }],
  [56, 6.6, 51, 'work', 1, { range: 14 }],
  [41, 2.9, 35, 'tube', 0],
  // exit shaft
  [92, 5.0, 41.5, 'work', 1, { range: 12 }],
  // the street
  [-56.6, Y.street + 6.05, -50.5, 'sodium', 1, { range: 20 }],
];

const KIND = {
  tube: { key: 'tube_white', color: 0xdce8ff, intensity: 7.0, range: 12 },
  flickA: { key: 'tube_flicker_a', color: 0xdce8ff, intensity: 7.0, range: 12, flicker: 0.13 },
  flickB: { key: 'tube_flicker_b', color: 0xdce8ff, intensity: 7.0, range: 12, flicker: 0.71 },
  trainFlick: { key: null, color: 0xd8e4f4, intensity: 3.0, range: 8, flicker: 0.71 },
  dead: { key: 'train_panel', color: 0, intensity: 0, range: 1 },
  red: { key: 'lamp_red_ug', color: 0xff2a14, intensity: 5.5, range: 12, emergency: true },
  work: { key: 'lamp_work', color: 0xffc27e, intensity: 11, range: 14, generator: true },
  sodium: { key: 'lamp_sodium', color: 0xffa24a, intensity: 18, range: 20, street: true },
  arc: { key: null, color: 0xaec8ff, intensity: 0, range: 7 },
};

const RED = new THREE.Color(0xff2a14);

export class UndergroundLights {
  constructor() {
    this.entries = [];
    this.mode = 'normal';
    this.mats = {};
    this.signMat = null;
    this.arc = null;
    this.t = 0;
  }

  /** Fixture meshes and point lights. Call during the build, before finalize. */
  build(A) {
    for (const [x, y, z, kind, lit, o = {}] of TUBES) {
      const k = KIND[kind];
      fixture(A, x, y, z, kind, k.key);
      if (!lit || !k.intensity) continue;
      const range = o.range ?? k.range;
      const l = new THREE.PointLight(k.color, k.intensity, range, 2);
      l.position.set(x, y - (kind === 'red' ? 0.05 : 0.25), z);
      l.castShadow = false;
      l.name = `ug_${kind}`;
      A.light(l, { range, priority: 2 });
      this.entries.push({
        light: l,
        kind,
        base: k.intensity,
        color: new THREE.Color(k.color),
        flicker: k.flicker ?? null,
        backup: !!o.backup,
        emergency: !!k.emergency,
        generator: !!k.generator,
        street: !!k.street,
      });
    }
    // the shorting junction box in the east tunnel: blue-white flashes
    const ax = 66;
    const ay = 5.3;
    const az = 1.72;
    boxAt(A, 'cabinet_grey', ax, ay, az, 0.7, 0.9, 0.28, 0, { collide: 'metal' });
    slab(A, 'arc_blue', ax - 0.12, ay - 0.1, az - 0.16, ax + 0.12, ay + 0.1, az - 0.14);
    slab(A, 'cable_black', ax - 0.05, ay - 1.3, az - 0.1, ax + 0.05, ay - 0.45, az - 0.05);
    const al = new THREE.PointLight(0xaec8ff, 0, 7, 2);
    al.position.set(ax, ay, az - 0.5);
    al.castShadow = false;
    al.name = 'ug_arc';
    A.light(al, { range: 7, priority: 2 });
    this.arc = { light: al, pos: new THREE.Vector3(ax, ay, az - 0.2) };
  }

  /** After finalize: grab the emissive materials this rig drives. */
  bind(A, signMat) {
    for (const key of ['tube_white', 'tube_flicker_a', 'tube_flicker_b', 'lamp_red_ug', 'lamp_work', 'lamp_sodium', 'arc_blue']) {
      const m = A.mat(key);
      this.mats[key] = { m, base: m.emissiveIntensity };
    }
    this.signMat = signMat ?? null;
    this.signBase = signMat?.emissiveIntensity ?? 0;
    this.setPower('normal');
  }

  setPower(mode) {
    this.mode = mode === 'emergency' ? 'emergency' : 'normal';
    const em = this.mode === 'emergency';
    for (const e of this.entries) {
      if (e.emergency) {
        e.light.color.copy(RED);
        e.target = e.base * (em ? 1.5 : 1);
      } else if (e.generator || e.street) {
        e.light.color.copy(e.color);
        e.target = e.base;
      } else if (em && e.backup) {
        e.light.color.copy(RED);
        e.target = e.base * 0.45;
      } else {
        e.light.color.copy(e.color);
        e.target = em ? 0 : e.base;
      }
      e.light.intensity = e.target;
    }
    const set = (key, k) => {
      const q = this.mats[key];
      if (q) q.m.emissiveIntensity = q.base * k;
    };
    set('tube_white', em ? 0.02 : 1);
    set('tube_flicker_a', em ? 0.02 : 1);
    set('tube_flicker_b', em ? 0.02 : 1);
    set('lamp_red_ug', em ? 1.6 : 1);
    if (this.signMat) this.signMat.emissiveIntensity = em ? this.signBase * 0.04 : this.signBase;
  }

  /** Per frame: flicker and the arc. Allocation-free. */
  update(t, fx) {
    this.t = t;
    const em = this.mode === 'emergency';
    let fa = 1;
    let fb = 1;
    if (!em) {
      fa = flicker(t, 0.13);
      fb = flicker(t, 0.71);
      const qa = this.mats.tube_flicker_a;
      const qb = this.mats.tube_flicker_b;
      if (qa) qa.m.emissiveIntensity = qa.base * fa;
      if (qb) qb.m.emissiveIntensity = qb.base * fb;
    }
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (e.flicker === null || em) continue;
      e.light.intensity = e.target * (e.flicker < 0.5 ? fa : fb);
    }
    // the arc: short blue-white bursts every few seconds
    if (this.arc) {
      const ph = (t * 0.37) % 1;
      const burst = ph < 0.06 ? flicker(t * 3.1, 0.37) : 0;
      this.arc.light.intensity = burst * 9;
      const q = this.mats.arc_blue;
      if (q) q.m.emissiveIntensity = burst * 30;
    }
  }
}

/** The fixture mesh for a light of this kind at (x, y, z). */
function fixture(A, x, y, z, kind, key) {
  if (kind === 'tube' || kind === 'flickA' || kind === 'flickB' || kind === 'dead') {
    // 1.5 m batten: steel body, a diffuser strip, two drop rods
    slab(A, 'gate_steel', x - 0.8, y, z - 0.09, x + 0.8, y + 0.07, z + 0.09);
    slab(A, key, x - 0.75, y - 0.035, z - 0.05, x + 0.75, y, z + 0.05);
    for (const dx of [-0.6, 0.6]) slab(A, 'gate_steel', x + dx - 0.01, y + 0.07, z - 0.01, x + dx + 0.01, y + 1.2, z + 0.01);
  } else if (kind === 'red') {
    // bulkhead: a cage box with a red lens facing down/out
    slab(A, 'metal_dark', x - 0.18, y - 0.02, z - 0.1, x + 0.18, y + 0.18, z + 0.1);
    slab(A, key, x - 0.13, y - 0.08, z - 0.07, x + 0.13, y - 0.02, z + 0.07);
  } else if (kind === 'work') {
    slab(A, 'metal_dark', x - 0.22, y, z - 0.22, x + 0.22, y + 0.12, z + 0.22);
    slab(A, key, x - 0.16, y - 0.1, z - 0.16, x + 0.16, y, z + 0.16);
    slab(A, 'cable_black', x - 0.01, y + 0.12, z - 0.01, x + 0.01, y + 0.9, z + 0.01);
  } else if (kind === 'sodium') {
    slab(A, 'metal_dark', x - 0.35, y + 0.02, z - 0.15, x + 0.35, y + 0.14, z + 0.15);
    slab(A, key, x - 0.28, y - 0.04, z - 0.1, x + 0.28, y + 0.02, z + 0.1);
  }
  void cylAt;
}

export { V };
