/**
 * AI — civilian bodies: the soldier rig and part library re-dressed in plain
 * clothes. No helmet, no plate carrier, no pouches, no rifle: trousers, a
 * shirt or light jacket, shoes, bare hands and head. One geometry per look,
 * shared by every civilian wearing it (exactly like a soldier variant).
 *
 * Material slots are a subset of MATERIAL_SLOTS in its own order (cloth, boot,
 * rubber, plate, polymer, skin), so the draw-order guarantee soldier.js
 * documents still holds:
 *   cloth   -> trousers (plain cordura set, tinted)
 *   plate   -> the shirt/jacket (the smooth laminate set, tinted)
 *   boot    -> shoes, rubber -> soles, polymer -> eyes, skin -> head and hands
 */

import * as THREE from 'three';
import { RIG } from './rig.js';
import { CharacterBuilder, Noise } from './geo.js';
import * as P from './parts.js';

export const CIV_LOOKS = {
  civ_a: { shirt: [0.42, 0.55, 0.78], trousers: [0.78, 0.7, 0.52], shoes: [0.25, 0.2, 0.17], skin: [1.0, 0.92, 0.84], bulk: 0.86 },
  civ_b: { shirt: [0.92, 0.9, 0.86], trousers: [0.3, 0.32, 0.36], shoes: [0.14, 0.13, 0.13], skin: [0.78, 0.6, 0.48], bulk: 0.9 },
  civ_c: { shirt: [0.72, 0.26, 0.22], trousers: [0.36, 0.42, 0.6], shoes: [0.45, 0.42, 0.38], skin: [0.95, 0.82, 0.7], bulk: 0.84 },
  civ_d: { shirt: [0.5, 0.52, 0.4], trousers: [0.55, 0.5, 0.44], shoes: [0.2, 0.17, 0.15], skin: [0.62, 0.46, 0.36], bulk: 0.95 },
};

export const CIV_IDS = Object.keys(CIV_LOOKS);

const TILE = { cloth: { tile: 0.4 }, plate: { tile: 0.42 }, boot: { tile: 0.26 }, rubber: { tile: 0.11 }, polymer: { tile: 0.15 }, skin: { tile: 0.2 } };

const bp = (name) => {
  const v = RIG.bindPos[RIG.index(name)];
  return [v.x, v.y, v.z];
};

export function isCivLook(name) {
  return !!CIV_LOOKS[name];
}

export function buildCivilian(name, { rng, materials }) {
  const L = CIV_LOOKS[name] ?? CIV_LOOKS.civ_a;
  const nz = new Noise(rng.fork());
  const B = new CharacterBuilder(RIG, { noise: nz, materials: TILE });
  const shR = bp('UpperArmR'), elR = bp('ForearmR'), wrR = bp('HandR');
  const shL = bp('UpperArmL'), elL = bp('ForearmL'), wrL = bp('HandL');
  const hipR = bp('UpLegR'), knR = bp('LegR'), anR = bp('FootR');
  const hipL = bp('UpLegL'), knL = bp('LegL'), anL = bp('FootL');
  const head = bp('Head');
  B.occlude([0, 0.95, -0.01], [0, 1.42, 0.0], 0.14, 1.0);
  B.occlude(shR, elR, 0.05, 0.6);
  B.occlude(shL, elL, 0.05, 0.6);
  B.occlude(hipR, knR, 0.08, 0.7);
  B.occlude(hipL, knL, 0.08, 0.7);

  // 1 trousers (cloth)
  for (const [hip, kn, an, s] of [[hipR, knR, anR, 'R'], [hipL, knL, anL, 'L']]) {
    B.add(P.limbTube(nz, hip, kn, [an[0], an[1] + 0.085, an[2] + 0.008], [0.086, 0.08, 0.07, 0.062, 0.057, 0.055, 0.058], { rings: 18, seg: 14, fold: 0.0015, crease: 0.003, bend: [0, 0, -1] }), {
      material: 'cloth', bones: ['Hips', `UpLeg${s}`, `Leg${s}`, `Foot${s}`], bias: [0.6, 1, 1, 0.5],
      colour: [1, 1, 1], grime: 0.6, dirt: 0.4, dust: 0.15, wear: 0.08, name: `leg${s}`,
    });
  }
  B.add(P.pelvis(nz), { material: 'cloth', bones: ['Hips', 'Spine', 'UpLegR', 'UpLegL'], bias: [1, 0.7, 0.5, 0.5], colour: [1, 1, 1], grime: 0.7, name: 'pelvis' });
  // 2 shoes (boot) and soles (rubber)
  for (const [an, s, side] of [[anR, 'R', -1], [anL, 'L', 1]]) {
    B.add(P.boot(nz, an, side), { material: 'boot', bones: [`Leg${s}`, `Foot${s}`, `Toe${s}`], bias: [0.55, 1, 0.6], colour: [1, 1, 1], grime: 0.7, dirt: 0.6, name: `shoe${s}` });
  }
  for (const [an, s] of [[anR, 'R'], [anL, 'L']]) {
    B.add(P.bootSole(an), { material: 'rubber', bones: [`Foot${s}`, `Toe${s}`], bias: [1, 0.8], grime: 0.8, dirt: 0.9, name: `sole${s}` });
  }
  // 3 shirt / jacket (plate slot, re-tinted)
  B.add(P.jacketTorso(nz, { bulk: L.bulk }), {
    material: 'plate', bones: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'ClavicleR', 'ClavicleL', 'UpperArmR', 'UpperArmL'],
    bias: [1, 1, 1, 1, 0.8, 0.55, 0.55, 0.3, 0.3], colour: [1, 1, 1], grime: 0.55, dirt: 0.1, dust: 0.2, wear: 0.05, name: 'shirt',
  });
  B.add(P.collar(nz), { material: 'plate', bones: ['Neck', 'Spine2', 'Head'], bias: [1, 0.8, 0.3], colour: [0.96, 0.96, 0.96], grime: 0.7, name: 'collar' });
  for (const [sh, el, wr, side, s] of [[shR, elR, wrR, -1, 'R'], [shL, elL, wrL, 1, 'L']]) {
    B.add(P.shoulderCap(nz, sh, side), { material: 'plate', bones: [`Clavicle${s}`, `UpperArm${s}`, 'Spine2'], bias: [0.8, 1, 0.4], colour: [1, 1, 1], grime: 0.5, name: `shoulder${s}` });
    B.add(P.limbTube(nz, [sh[0] + side * 0.012, sh[1] + 0.05, sh[2]], el, wr, [0.046, 0.056, 0.05, 0.045, 0.041, 0.038, 0.034], { rings: 16, seg: 12, fold: 0.0014, crease: 0.0025, bend: [0, 0, -1] }), {
      material: 'plate', bones: [`Clavicle${s}`, `UpperArm${s}`, `Forearm${s}`, `Hand${s}`, 'Spine2'], bias: [0.5, 1, 1, 0.7, 0.25],
      colour: [1, 1, 1], grime: 0.55, wear: 0.06, name: `sleeve${s}`,
    });
  }
  // 4 eyes (polymer)
  for (const side of [-1, 1]) B.add(P.eyeball(head, side), { material: 'polymer', bone: 'Head', colour: [0.55, 0.5, 0.45], grime: 0.2, name: 'eye' });
  // 5 skin: head, neck, bare hands
  B.add(P.headMesh(nz, head, {}), { material: 'skin', bone: 'Head', colour: [1, 1, 1], grime: 0.25, name: 'head' });
  B.add(P.nose(nz, head), { material: 'skin', bone: 'Head', grime: 0.2, name: 'nose' });
  B.add(P.ear(nz, head, -1), { material: 'skin', bone: 'Head', grime: 0.4, name: 'earR' });
  B.add(P.ear(nz, head, 1), { material: 'skin', bone: 'Head', grime: 0.4, name: 'earL' });
  B.add(P.limbTube(nz, [head[0], head[1] - 0.1, head[2] - 0.012], [head[0], head[1] - 0.05, head[2] - 0.008], [head[0], head[1], head[2]], [0.056, 0.054, 0.052], { rings: 5, seg: 12, fold: 0.001 }), {
    material: 'skin', bones: ['Neck', 'Head', 'Spine2'], bias: [1, 0.7, 0.4], grime: 0.4, name: 'neck',
  });
  const palmR = new THREE.Vector3(-0.55, 0.35, -0.75).normalize();
  const palmL = new THREE.Vector3(0.75, 0.3, -0.6).normalize();
  const gR = new THREE.Vector3(0.18, 0.92, -0.34).normalize();
  B.add(P.glove(nz, wrR, [gR.x, gR.y, gR.z], [palmR.x, palmR.y, palmR.z], -1), { material: 'skin', bones: ['HandR', 'ForearmR'], bias: [1, 0.35], colour: [1, 1, 1], grime: 0.4, name: 'handR' });
  B.add(P.glove(nz, wrL, [gR.x, gR.y, gR.z], [palmL.x, palmL.y, palmL.z], 1), { material: 'skin', bones: ['HandL', 'ForearmL'], bias: [1, 0.35], colour: [1, 1, 1], grime: 0.4, name: 'handL' });

  const built = B.build();
  return {
    geometry: built.geometry,
    materials: resolveCivMaterials(name, built.materialNames, materials),
    parts: built.parts,
    weapon: null,
    stats: { vertices: built.vertices, triangles: built.triangles },
    variant: { display: 'CIVILIAN', scale: 1, civilian: true },
  };
}

/** Slot names -> materials for a civilian look (pure: no RNG, no geometry). */
export function resolveCivMaterials(name, slots, materials) {
  const L = CIV_LOOKS[name] ?? CIV_LOOKS.civ_a;
  return slots.map((n) => {
    switch (n) {
      case 'cloth': return materials.get('nylon', { key: `${name}_trousers`, tint: L.trousers, rough: 1, normalScale: 0.7 });
      case 'plate': return materials.get('plate', { key: `${name}_shirt`, tint: L.shirt, rough: 1.25, normalScale: 0.6 });
      case 'boot': return materials.get('nylon', { key: `${name}_shoes`, tint: L.shoes, rough: 0.8, normalScale: 0.8 });
      case 'rubber': return materials.get('rubber', { key: name, normalScale: 1.2 });
      case 'polymer': return materials.get('polymer', { key: name, normalScale: 1.0 });
      case 'skin': return materials.get('skin', { key: name, tint: L.skin, normalScale: 0.8, ao: 0.6 });
      default: return materials.get('polymer', { key: name });
    }
  });
}
