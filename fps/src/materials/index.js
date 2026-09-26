// Material library (STUB — owned by the materials agent). Contract: docs/CONTRACTS.md#materials
// get(name) returns a cached PBR material. UVs are expected in METRES (1 UV unit = 1 m);
// the library sets texture repeat so each material tiles at a physically sensible size.
import * as THREE from 'three';

// name -> [base colour, roughness, metalness, surface]
const CATALOG = {
  concrete: [0x8a8680, 0.9, 0, 'concrete'],
  concrete_dirty: [0x6f6a62, 0.95, 0, 'concrete'],
  plaster: [0xc9b89a, 0.9, 0, 'plaster'],
  plaster_painted: [0xb7a07a, 0.85, 0, 'plaster'],
  brick: [0x8a4a36, 0.9, 0, 'brick'],
  asphalt: [0x3a3a3c, 0.95, 0, 'asphalt'],
  dirt: [0x6b5842, 1, 0, 'dirt'],
  gravel: [0x77716a, 1, 0, 'gravel'],
  sand: [0xb89f78, 1, 0, 'sand'],
  wood: [0x7a5a3c, 0.8, 0, 'wood'],
  wood_painted: [0x55707a, 0.75, 0, 'wood'],
  metal_painted: [0x5b6b52, 0.6, 0.3, 'metal'],
  metal_rusty: [0x6b4030, 0.85, 0.4, 'metal'],
  metal_corrugated: [0x8a8f92, 0.55, 0.6, 'metal'],
  metal_steel: [0x9a9ca0, 0.35, 1, 'metal'],
  tiles: [0xb0a590, 0.6, 0, 'tile'],
  roof_tiles: [0x8a4432, 0.8, 0, 'tile'],
  fabric_sandbag: [0x9a8a66, 1, 0, 'sand'],
  fabric_tarp: [0x4b5a3a, 0.9, 0, 'fabric'],
  glass: [0x88aabb, 0.05, 0, 'glass'],
  rubber: [0x1c1c1c, 0.9, 0, 'rubber'],
  car_paint: [0x7a7f6a, 0.4, 0.5, 'metal'],
  plastic: [0x2a2a2a, 0.6, 0, 'plastic'],
};

export function createMaterials() {
  const cache = new Map();
  return {
    name: 'materials',
    catalog: Object.keys(CATALOG),

    async init() {},

    get(name, opts = {}) {
      const key = name + JSON.stringify(opts);
      if (cache.has(key)) return cache.get(key);
      const [color, roughness, metalness, surface] = CATALOG[name] || [0xff00ff, 0.5, 0, 'concrete'];
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...opts });
      m.name = name;
      m.userData.surface = surface;
      cache.set(key, m);
      return m;
    },

    surfaceOf(material) {
      return material?.userData?.surface || 'concrete';
    },
  };
}
