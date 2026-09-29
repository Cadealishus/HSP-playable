import * as THREE from 'three';
import { makeAssembler, inRect } from '../yardkit.js';
import { registerProps } from '../../props.js';
import { INDUSTRIAL_PALETTE } from './palette.js';
import { LEVEL_YAW, PLAY, WAREHOUSE, DOCK_Y } from './layout.js';
import { buildWarehouse } from './warehouse.js';
import { buildYard } from './yard.js';
import { INDUSTRIAL_MODES } from './modes.js';
import { runSelfTest } from './selftest.js';

/**
 * MAP 03 — DEMURRAGE. Harrow Point Freight Terminal, Yard 4.
 *
 * A point-symmetric container terminal for team play: two warehouses with real
 * interiors, container stacks under a gantry crane, pipe racks and catwalks
 * along both fences, a tank farm and a loading-rack perch on each side. See
 * layout.js for the lanes. `buildMap()` returns what the world system
 * publishes (src/world/index.js `_initMap`).
 */
export async function buildMap({ materials, render, rng }) {
  const A = makeAssembler(INDUSTRIAL_PALETTE, 'industrial', { materials, rng, render });
  A.setTransform(LEVEL_YAW, 0, 0);

  // the town's instanced prop library: pallets, drums, blocks, jerseys, skirts
  registerProps(A, rng);
  buildWarehouse(A, rng, 1);
  buildWarehouse(A, rng, -1);
  buildYard(A, rng);

  // ---------------------------------------------------------- published --
  const spawnPoints = [...INDUSTRIAL_MODES.spawns.esf, ...INDUSTRIAL_MODES.spawns.hostile].map(([x, z, fx, fz, tag]) => ({
    position: A.toWorld(x, 0, z),
    yaw: Math.atan2(-fx, -fz) + LEVEL_YAW,
    tag,
  }));
  const objective = { position: A.toWorld(0, 0, 0), yaw: LEVEL_YAW, radius: 1.2, label: 'THE GANTRY' };
  const bounds = new THREE.Box3();
  for (const [x, z] of [
    [PLAY.x0, PLAY.z0],
    [PLAY.x1, PLAY.z0],
    [PLAY.x0, PLAY.z1],
    [PLAY.x1, PLAY.z1],
  ]) {
    bounds.expandByPoint(A.toWorld(x, -2, z));
    bounds.expandByPoint(A.toWorld(x, 16, z));
  }
  const W = WAREHOUSE;
  const wh = (s) => {
    const xs = [s * W.x0, s * W.x1];
    const zs = [s * W.z0, s * W.z1];
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  };
  const docks = [1, -1].map((s) => {
    const xs = [s * W.x0, s * W.x1];
    const zs = [s * W.z0, s * W.apronZ];
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  });
  const buildings = [1, -1].map((s, i) => {
    const r = wh(s);
    return {
      spec: { id: i ? 'cold_store' : 'bonded_store', x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, w: r[2] - r[0], d: r[3] - r[1], floors: 1, enterable: true },
      roofY: W.eave,
    };
  });
  const whs = [wh(1), wh(-1)];
  return {
    A,
    modeData: INDUSTRIAL_MODES,
    levelYaw: LEVEL_YAW,
    lighting: 'dusk',
    // late afternoon over the yard: a low warm sun across the lanes, hazier
    // than the town (diesel and dust)
    timeOfDay: 17.6,
    weather: { turbidity: 2.3 },
    spawnPoints,
    playerSpawnIndex: 0,
    objective,
    bounds,
    buildings,
    groundY: (x, z) => (docks.some((r) => inRect(x, z, r)) ? DOCK_Y : 0),
    isOpen: (x, z, m = 0.3) => inRect(x, z, [PLAY.x0, PLAY.z0, PLAY.x1, PLAY.z1], m + 0.5) && !whs.some((r) => inRect(x, z, r, -m)),
    selfTest: (c, world) => runSelfTest(c, world),
    /** Roof lights must not cast into the cascades or write the prepass. */
    afterFinalize: (root) => {
      for (const o of root.children) {
        if (o.name === 'world_glazing') {
          o.castShadow = false;
          o.userData.owNoShadow = true;
          o.userData.owNoPrepass = true;
        }
      }
    },
  };
}
