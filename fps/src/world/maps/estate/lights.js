import * as THREE from 'three';
import { slab, cylAt } from '../airport/kit.js';
import { V, Y } from './layout.js';

/**
 * ESTATE: night lighting and the alarm.
 *
 * The sky is on the `night` preset (moonlit 01:30). On top of it:
 *   interior   warm pendant practicals, one per room (lamp_interior)
 *   flood      exterior floodlights on the house, the gate and the yards
 *   alarmFlood floods that only come on with the alarm (flood_alarm)
 *   beacon     red rotating beacons on the gate piers and the terrace corners;
 *              dark until the alarm, then a spinning reflector and a red light
 *              whose intensity sweeps with it
 *
 * `setAlarm(on)` switches the alarm floods and beacons and turns the alarm
 * panel's status lamp from green to red. Every light stays `visible`; the
 * alarm only drives intensities, so the shader permutation never changes.
 */

const G = Y.ground;
const U = Y.upper;

function roomLamp(id, dy = 0.45) {
  const v = V[id];
  return [(v.x0 + v.x1) / 2, v.y + v.h - dy, (v.z0 + v.z1) / 2];
}

const INTERIOR = [
  ['hallG', 0.9, 9],
  ['westCorr', 0.35, 8],
  ['office', 0.45, 8],
  ['library', 0.45, 8],
  ['dining', 0.6, 9],
  ['lounge', 0.45, 8],
  ['eastCorr', 0.35, 8],
  ['security', 0.35, 7],
  ['kitchen', 0.35, 8],
  ['pantry', 0.35, 7],
  ['hallU', 0.35, 9],
  ['bed1', 0.45, 8],
  ['bed2', 0.45, 8],
  ['study', 0.45, 8],
  ['master', 0.45, 9],
  ['serviceHall', 0.3, 9],
  ['cellar', 0.3, 7],
  ['garage', 0.3, 9],
  ['plantRoom', 0.3, 7],
  ['guardPost', 0.3, 7],
];

// [x, y, z, range, intensity]
const FLOODS = [
  [-18, 2.7, 10.45, 20, 26],
  [8, 2.7, 10.45, 20, 26],
  [-3.3, 3.9, 48.9, 18, 20],
  [3.3, 3.9, 48.9, 18, 20],
  [10.5, 2.9, 45.0, 14, 12],
  [0, G + 3.0, 0.45, 16, 18],
  [43.4, 3.2, -20, 20, 22],
  [0, 3.2, -35.4, 20, 20],
  [-43.6, G + 1.3, -8, 18, 16],
  [20.8, G + 2.7, 0.45, 14, 12],
];
const ALARM_FLOODS = [
  [-30, 3.2, 47.4, 22, 30],
  [30, 3.2, 47.4, 22, 30],
  [43.4, 3.2, 2, 20, 26],
  [-20, 3.2, -35.4, 20, 26],
];
const BEACONS = [
  [-3.3, 3.85, 48.2],
  [3.3, 3.85, 48.2],
  [-26.0, G + 1.05, 10.05],
  [31.85, G + 1.05, 10.05],
];

export class EstateLights {
  constructor() {
    this.interior = [];
    this.floods = [];
    this.alarmFloods = [];
    this.beacons = [];
    this.alarm = false;
    this.mats = {};
  }

  build(A, root, disp) {
    const add = (list, color, x, y, z, range, intensity, prio = 2) => {
      const l = new THREE.PointLight(color, intensity, range, 2);
      l.position.set(x, y, z);
      l.castShadow = false;
      A.light(l, { range, priority: prio });
      list.push({ light: l, base: intensity });
      return l;
    };
    for (const [id, dy, range] of INTERIOR) {
      const [x, y, z] = roomLamp(id, dy);
      // pendant: a drum shade on a rod
      slab(A, 'brass', x - 0.01, y + 0.2, z - 0.01, x + 0.01, V[id].y + V[id].h, z + 0.01);
      cylAt(A, 'lamp_interior', x, y - 0.1, z, 0.22, 0.3);
      add(this.interior, 0xffc585, x, y - 0.3, z, range, 7);
    }
    for (const [x, y, z, range, intensity] of FLOODS) {
      floodHead(A, x, y, z, 'flood_lens');
      add(this.floods, 0xfff1dc, x, y - 0.2, z, range, intensity, 3);
    }
    for (const [x, y, z, range, intensity] of ALARM_FLOODS) {
      floodHead(A, x, y, z, 'flood_alarm');
      add(this.alarmFloods, 0xeef4ff, x, y - 0.2, z, range, 0, 3);
      this.alarmFloods[this.alarmFloods.length - 1].base = intensity;
    }
    // garden bollards along the drive (emissive only)
    for (let z = 18; z < 47; z += 5) {
      for (const x of [-4.6, 4.6]) {
        slab(A, 'gate_black', x - 0.08, 0, z - 0.08, x + 0.08, 0.7, z + 0.08, { collide: 'metal' });
        slab(A, 'garden_lamp', x - 0.07, 0.55, z - 0.07, x + 0.07, 0.68, z + 0.07);
      }
    }
    // beacons: standalone meshes so the reflector can spin
    const baseGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.1, 14);
    const domeGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.2, 14);
    const reflGeo = new THREE.BoxGeometry(0.16, 0.12, 0.02);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.5, metalness: 1 });
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x5a0c08, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.2, metalness: 0 });
    const reflMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, emissive: 0xff3020, emissiveIntensity: 0, roughness: 0.15, metalness: 1 });
    disp.geometries.push(baseGeo, domeGeo, reflGeo);
    disp.materials.push(baseMat, domeMat, reflMat);
    this.domeMat = domeMat;
    this.reflMat = reflMat;
    BEACONS.forEach(([x, y, z], i) => {
      const g = new THREE.Group();
      g.name = `estate_beacon_${i}`;
      const p = A.toWorld(x, y, z);
      g.position.copy(p);
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.05;
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = 0.2;
      const refl = new THREE.Mesh(reflGeo, reflMat);
      refl.position.set(0, 0.2, 0.04);
      const spin = new THREE.Group();
      spin.add(refl);
      g.add(base, dome, spin);
      for (const m of [base, dome, refl]) {
        m.castShadow = false;
        m.userData.owNoShadow = true;
      }
      root.add(g);
      disp.meshes.push(g);
      const l = add(this.beacons, 0xff2410, x, y + 0.35, z, 16, 0, 3);
      this.beacons[this.beacons.length - 1].base = 22;
      this.beacons[this.beacons.length - 1].spin = spin;
      this.beacons[this.beacons.length - 1].phase = i * 1.7;
      void l;
    });
  }

  bind(A) {
    for (const key of ['lamp_interior', 'flood_lens', 'flood_alarm', 'alarm_led']) {
      const m = A.mat(key);
      this.mats[key] = { m, base: m.emissiveIntensity };
    }
    this.floodAlarmBase = 12;
    this.ledQuiet = new THREE.Color(0x30ff60);
    this.ledAlarm = new THREE.Color(0xff2a10);
    this.setAlarm(false);
  }

  setAlarm(on) {
    this.alarm = !!on;
    for (const e of this.alarmFloods) e.light.intensity = this.alarm ? e.base : 0;
    for (const e of this.beacons) e.light.intensity = 0;
    const fa = this.mats.flood_alarm;
    if (fa) fa.m.emissiveIntensity = this.alarm ? this.floodAlarmBase : 0;
    const led = this.mats.alarm_led;
    if (led) led.m.emissive.copy(this.alarm ? this.ledAlarm : this.ledQuiet);
    if (this.domeMat) this.domeMat.emissiveIntensity = this.alarm ? 2.5 : 0;
    if (this.reflMat) this.reflMat.emissiveIntensity = this.alarm ? 1.5 : 0;
  }

  /** Per frame: spin the beacons and sweep their lights. Allocation-free. */
  update(t) {
    if (!this.alarm) return;
    for (let i = 0; i < this.beacons.length; i++) {
      const b = this.beacons[i];
      const a = t * 5.2 + b.phase;
      b.spin.rotation.y = a;
      const c = Math.max(0, Math.cos(a));
      b.light.intensity = b.base * (0.25 + 0.75 * c * c * c * c);
    }
  }
}

function floodHead(A, x, y, z, key) {
  slab(A, 'gate_black', x - 0.22, y, z - 0.12, x + 0.22, y + 0.26, z + 0.12);
  slab(A, key, x - 0.18, y - 0.03, z - 0.09, x + 0.18, y, z + 0.09);
}

export { U };
