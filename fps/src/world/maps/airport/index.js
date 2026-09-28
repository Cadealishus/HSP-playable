import * as THREE from 'three';
import { AirportAssembler } from './kit.js';
import { LEVEL_YAW, ZONES, GATE, PLANE, ROOF_Y, LOW_CEIL, PLAY } from './layout.js';
import { buildTerminal, FLOORS } from './terminal.js';
import { buildPlane, buildBridge } from './plane.js';
import { buildApron, TARMAC, KERB } from './apron.js';
import { dressTerminal } from './dress.js';
import { buildSigns } from './signs.js';

/**
 * MAP 02 — HOLDING PATTERN. Port Ellery International, Gate 12.
 *
 * Built in the order the design doc's blockout plan asks for: the shell and
 * its walkable levels, the airliner with all three entrances, the connectors,
 * then the cover and dressing, then signage. `buildMap()` returns everything
 * the world system publishes (see src/world/index.js `_initMap`).
 *
 * Coordinates: LEVEL metres, x east, z south (the plan's orientation). The
 * Assembler rotates the whole level a quarter turn into the world so the apron
 * glazing faces the late-afternoon sun (layout.js LEVEL_YAW).
 */

/** Spawn points in LEVEL space: [x, z, facing-dx, facing-dz, tag]. Index 0 is Doug's. */
const SPAWNS = [
  [25.0, 0.6, -1, -0.35, 'gate 12'],
  [-13, -30.5, 0.1, 1, 'kerb doors'],
  [-18.5, -22, 0.6, 1, 'entry hall'],
  [-32.5, 9.3, 1, -0.3, 'food court'],
  [-36, 20, 1, 0, 'kitchen yard'],
  [-12, 22, 1, -0.4, 'arrivals'],
  [-4, 40, 0.4, -1, 'south apron'],
  [22, 54, 0, -1, 'service road'],
  [62, 22, -1, 0, 'east apron'],
  [58, -18, -1, 0.3, 'service yard'],
  [35.5, -2, -1, 0.5, 'bridge yard'],
];

export async function buildMap({ ctx, materials, render, rng, root, disp, fonts, anisotropy }) {
  const A = new AirportAssembler({ materials, rng, render });
  A.setTransform(LEVEL_YAW, 0, 0);

  // 1. walkable blockout: terminal shell, deck, escalators; the airliner and
  //    its bridge; the apron and the playable edge
  buildTerminal(A);
  buildPlane(A, rng);
  buildBridge(A);
  buildApron(A, rng);
  // 2. cover + dressing
  dressTerminal(A, rng);
  // 3. signage (canvas text, standalone meshes) once the webfonts settle
  await fonts;
  buildSigns(A, root, disp, { anisotropy });

  // ------------------------------------------------------------ published --
  const spawnPoints = SPAWNS.map(([x, z, dx, dz, tag]) => ({
    position: A.toWorld(x, 0, z),
    yaw: Math.atan2(-dx, -dz) + LEVEL_YAW,
    tag,
  }));
  const d = GATE.desk;
  const objective = {
    position: A.toWorld(d.x, 0, d.z),
    yaw: LEVEL_YAW,
    radius: 1.2,
    label: 'GATE 12',
  };
  // world-space bounds of the playable area (nav grid extent)
  const bounds = new THREE.Box3();
  for (const [x, z] of [
    [PLAY.x0, PLAY.kerb.z0],
    [PLAY.x1, PLAY.kerb.z0],
    [PLAY.x0, PLAY.z1],
    [PLAY.x1, PLAY.z1],
  ]) {
    bounds.expandByPoint(A.toWorld(x, -2, z));
    bounds.expandByPoint(A.toWorld(x, 14, z));
  }

  // Footprints for the minimap (dark blocks) and the render's interior gate.
  // Only the enclosed back-of-house rooms are tagged `enterable`: the public
  // terminal is a glass box and should keep its skylight.
  const buildings = [];
  for (const [key, z] of Object.entries(ZONES)) {
    const enclosed = key === 'service' || key === 'kitchen';
    buildings.push({
      spec: {
        id: key,
        x: (z.x0 + z.x1) / 2,
        z: (z.z0 + z.z1) / 2,
        w: z.x1 - z.x0,
        d: z.z1 - z.z0,
        floors: enclosed ? 1 : 2,
        enterable: enclosed,
      },
      roofY: enclosed ? LOW_CEIL : ROOF_Y,
    });
  }
  buildings.push({
    spec: { id: 'airliner', x: (PLANE.x0 + PLANE.x1) / 2, z: PLANE.fz, w: PLANE.x1 - PLANE.x0, d: 5, floors: 1 },
    roofY: 7,
  });

  const inRect = (x, z, r, m = 0) => x > r[0] + m && x < r[2] - m && z > r[1] + m && z < r[3] - m;
  return {
    A,
    spawnPoints,
    playerSpawnIndex: 0,
    objective,
    bounds,
    buildings,
    /** Analytic floor hint (physics owns the exact answer). */
    groundY: () => 0,
    /** Outdoors and walkable: the apron and the kerb. */
    isOpen: (x, z, m = 0.3) => {
      for (const r of TARMAC) if (inRect(x, z, r, m)) return true;
      return inRect(x, z, KERB, m);
    },
    floors: FLOORS,
    /**
     * Glazing must not cast into the shadow cascades (the cascade pass draws
     * with an opaque override material, so a curtain wall would black out the
     * sun it exists to let in) nor write the prepass (SSR and AO would read
     * the pane as a wall).
     */
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
