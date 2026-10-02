import * as THREE from 'three';
import { PaletteAssembler } from '../shared/kit.js';
import { voidAt, floorAt } from '../shared/voids.js';
import { buildSigns } from '../shared/signs.js';
import { runMapSelfTest, doorOpenings } from '../shared/selftest.js';
import { UG_PALETTE } from './palette.js';
import { VOIDS, V, Y, PLAY, CF, TRACK1_Z, TRACK2_Z } from './layout.js';
import { buildShell } from './structure.js';
import { buildTrains } from './trains.js';
import { dressUnderground } from './dress.js';
import { UndergroundLights } from './lights.js';
import { signList } from './signs.js';

/**
 * MAP 03: UNDERGROUND. Grand Arcade station, Line 4, closed since 1998, and
 * what has moved in underneath it. Hosts the mission "Underground"
 * (EXPANSION.md §8) and the bot-match modes.
 *
 * Flow: the street entrance (NW, y 15) -> stair -> ticket hall (y 10, fare
 * gates) -> stair -> platform A (y 5.1) -> the tracks / platform B / service
 * corridors -> the east tunnel with the abandoned train (emergency lighting)
 * -> the service ramp -> the deep tunnel (y 0) -> the blast door -> the
 * COMMAND FACILITY (comms console on its dais) -> exit shaft E-3.
 * Plan and levels: layout.js. Lighting and the power switch: lights.js.
 *
 * ------------------------------------------------------------------------
 * ANCHORS (world.anchors). World space. Level yaw is 0, so level metres ARE
 * world metres here (x east, z south, y up). {pos, yaw}: yaw is the facing
 * (camera convention: 0 looks toward -z).
 *
 *   entry               {pos, yaw}  street, at the top of the entrance stair
 *   ticketHall          Vector3     middle of the hall, south of the gates
 *   fareGates           Box3        the gate line (a chokepoint)
 *   platformA           Vector3     platform A centre (north platform)
 *   platformB           Vector3     platform B centre (south platform)
 *   lightsFailTrigger   Box3        the east tunnel mouth: walking into it is
 *                                   where the mission cuts the power
 *                                   (world.setPower('emergency'))
 *   tunnelAmbush        Box3[]      ambush volumes: [0] east tunnel along the
 *                                   abandoned train, [1] west tunnel by the
 *                                   rubble plug, [2] deep service tunnel
 *   ambushSpots         {pos,yaw}[] where an ambush squad stands (out of the
 *                                   player's approach view): inside the tunnel
 *                                   train, behind the tunnel trolley, the
 *                                   side room, the deep-tunnel crates
 *   maintenanceRooms    {id,pos}[]  elecNorth, pumpRoom, elecSouth, staffRoom,
 *                                   storeRoom, sideRoom (room centres)
 *   trainCars           {id,train,pos,yaw,x0,x1,z,doors}[]  station1/2 (in
 *                                   the station, track 1), tunnel1/2 (east
 *                                   tunnel). doors: [{pos, side, open}]
 *   serviceRamp         Vector3     top of the ramp down to the deep level
 *   deepTunnel          Vector3     deep service tunnel centre
 *   blastDoor           {pos, yaw}  the main facility door (chokepoint);
 *                                   yaw faces into the facility
 *   serviceDoor         {pos, yaw}  the facility's second door
 *   commandFacility     Box3        the whole facility floor volume
 *   commsConsole        {pos, yaw}  the target equipment (stand here, face yaw)
 *   powerSwitch         {pos, yaw}  the south electrical room switchboard: where
 *                                   the mission throws the mains back on
 *                                   (world.setPower('normal'))
 *   extraction          {pos, yaw}  exit shaft E-3, foot of the ladder
 *   chokepoints         {name,pos}[] fare gates, hall stair, tunnel mouth,
 *                                   ramp, blast door, service door
 *
 * Also published: spawns / objectives (EXPANSION.md §5), lighting
 * 'underground', setPower('normal'|'emergency'), spawnPoints/objective (the
 * survival loop's legacy shape), selfTest().
 * ------------------------------------------------------------------------
 */

/** Spawns in level space: [x, y, z, facing dx, dz]. */
const ESF_SPAWNS = [
  [-49.5, Y.street, -50, 0, 1],
  [-45, Y.hall, -29, 0, 1],
  [-58, Y.hall, -27, 1, 0.3],
  [-40, Y.hall, -16, 1, 0],
  [-17, Y.plat, -12, 1, 0],
  [-16, Y.plat, 5, 1, 0],
  [-35.5, Y.track, 6, 0, -1],
];
const HOSTILE_SPAWNS = [
  [56, Y.deep, 42, 0, -1],
  [40, Y.deep, 50, 1, -0.5],
  [72, Y.deep, 44, -1, -0.3],
  [40, Y.deep, 23, 1, 0],
  [66, Y.deep, 23, -1, 0],
  [80, Y.track, -1, -1, 0],
  [19, Y.plat, 16, 0, -1],
  [25, Y.plat, -20, 0, 1],
];

export async function buildMap({ ctx, materials, render, rng, root, disp, fonts, anisotropy }) {
  const A = new PaletteAssembler({ materials, rng, render }, UG_PALETTE, 'underground');
  A.setTransform(0, 0, 0);

  buildShell(A, rng);
  const cars = buildTrains(A);
  dressUnderground(A, rng);
  const lights = new UndergroundLights();
  lights.build(A);
  await fonts;
  const { litMat } = buildSigns(A, root, disp, signList(), { anisotropy, name: 'underground' });

  // ------------------------------------------------------------ published --
  const W = (x, y, z) => A.toWorld(x, y, z);
  const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
  const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(W(x0, y0, z0), W(x1, y1, z1));
  const sp = (list) => list.map(([x, y, z, dx, dz]) => ({ pos: W(x, y, z), yaw: yawOf(dx, dz) }));
  const spawns = { esf: sp(ESF_SPAWNS), hostile: sp(HOSTILE_SPAWNS) };
  const zone = (x, y, z, radius) => ({ pos: W(x, y, z), radius });
  const objectives = {
    dom: { A: zone(-46, Y.hall, -26, 3.5), B: zone(10, Y.plat, 5, 3.0), C: zone(50, Y.deep, 23, 2.5) },
    hp: [zone(-45, Y.hall, -16, 3.5), zone(20, Y.plat, -11, 3.0), zone(6, Y.plat, 15.2, 3.0), zone(60, Y.track, -1, 3.5), zone(56, Y.deep, 40, 4.0)],
    sd: { A: zone(-8.5, Y.plat, 15.4, 2.0), B: zone(25.5, Y.plat, -22.5, 2.0), attackers: 'esf' },
    survival: zone(10, Y.plat, -11, 4.0),
  };
  const roomC = (id) => {
    const v = V[id];
    return { id, pos: W((v.x0 + v.x1) / 2, v.y, (v.z0 + v.z1) / 2) };
  };
  const anchors = {
    entry: { pos: W(-49.5, Y.street, -46.5), yaw: yawOf(0, 1) },
    ticketHall: W(-46, Y.hall, -17),
    fareGates: box(-62, Y.hall, -23, -30, Y.hall + 2.5, -21),
    platformA: W(10, Y.plat, -11),
    platformB: W(10, Y.plat, 5),
    lightsFailTrigger: box(40, Y.track - 0.5, -9.2, 46, 9, 2),
    tunnelAmbush: [box(44, Y.track - 0.5, -9.2, 82, 9, 2), box(-40, Y.track - 0.5, -8, -20, 9, 2), box(24, -0.5, 21, 76, 3.8, 25)],
    ambushSpots: [
      { pos: W(64.5, Y.plat, TRACK1_Z), yaw: yawOf(-1, 0) },
      { pos: W(55.5, Y.track, 1.2), yaw: yawOf(-1, 0) },
      { pos: W(81.5, Y.track, 0.6), yaw: yawOf(-1, 0) },
      { pos: W(-35.5, Y.track, 7), yaw: yawOf(0, -1) },
      { pos: W(37, Y.deep, 23.2), yaw: yawOf(1, 0) },
      { pos: W(61, Y.deep, 22.2), yaw: yawOf(-1, 0) },
    ],
    maintenanceRooms: ['elecNorth', 'pumpRoom', 'elecSouth', 'staffRoom', 'storeRoom', 'sideRoom'].map(roomC),
    trainCars: cars.map((c) => ({
      id: c.id,
      train: c.train,
      pos: W((c.x0 + c.x1) / 2, Y.plat, c.z),
      yaw: yawOf(1, 0),
      x0: c.x0,
      x1: c.x1,
      z: c.z,
      doors: c.doors.map((d) => ({ pos: W(d.x, Y.plat, d.side === 'north' ? c.z - 1.5 : c.z + 1.5), side: d.side, open: d.open })),
    })),
    serviceRamp: W(74, Y.track, 3),
    deepTunnel: W(50, Y.deep, 23),
    blastDoor: { pos: W(52, Y.deep, 27), yaw: yawOf(0, 1) },
    serviceDoor: { pos: W(69.2, Y.deep, 27), yaw: yawOf(0, 1) },
    commandFacility: box(V.facility.x0, -0.5, V.facility.z0, V.facility.x1, 7, V.facility.z1),
    commsConsole: { pos: W(CF.console.x, Y.deep + CF.dais.h, CF.console.z - 1.0), yaw: yawOf(0, 1) },
    // the switchboard in the south electrical room (the open panel on the east
    // wall): stand here facing yaw to throw the mains back on
    powerSwitch: { pos: W(V.elecSouth.x1 - 1.4, Y.plat, V.elecSouth.z0 + 2.2), yaw: yawOf(1, 0) },
    extraction: { pos: W(92, Y.deep, 41.8), yaw: yawOf(1, 0) },
    chokepoints: [
      { name: 'fareGates', pos: W(-46, Y.hall, -22) },
      { name: 'hallStair', pos: W(-25, 7.5, -14) },
      { name: 'eastTunnelMouth', pos: W(41, Y.track, -3) },
      { name: 'serviceRamp', pos: W(74, 2, 11) },
      { name: 'blastDoor', pos: W(52, Y.deep, 27) },
      { name: 'serviceDoor', pos: W(69.2, Y.deep, 27) },
    ],
  };

  // legacy survival shape: every spawn, Doug's first
  const spawnPoints = [...ESF_SPAWNS, ...HOSTILE_SPAWNS].map(([x, y, z, dx, dz], i) => ({
    position: W(x, y, z),
    yaw: yawOf(dx, dz),
    tag: i === 0 ? 'street' : i < ESF_SPAWNS.length ? 'esf' : 'hostile',
  }));
  const objective = { position: W(10, Y.plat, -11), yaw: 0, radius: 1.4, label: 'PLATFORM A' };
  const bounds = new THREE.Box3(W(PLAY.x0, PLAY.y0, PLAY.z0), W(PLAY.x1, PLAY.y1, PLAY.z1));

  const floorVoids = VOIDS.filter((v) => v.floor);
  let fxDone = false;
  return {
    A,
    spawnPoints,
    playerSpawnIndex: 0,
    objective,
    bounds,
    buildings: [],
    spawns,
    objectives,
    anchors,
    lighting: 'underground',
    audioAnchors: { junctionArc: W(66, 5.3, 1.5), pumps: W(25, Y.plat + 1, -23.5), generator: W(CF.generator.x, 1, CF.generator.z) },
    groundY: (x, z) => {
      const v = voidAt(floorVoids, x, z);
      return v ? floorAt(v, x, z) : 0;
    },
    isOpen: (x, z, m = 0.3) => {
      for (const v of floorVoids) if (x > v.x0 + m && x < v.x1 - m && z > v.z0 + m && z < v.z1 - m) return true;
      return false;
    },
    setPower: (mode) => {
      lights.setPower(mode);
      ctx.peek('sky')?.setLightingPreset?.(lights.mode === 'emergency' ? 'underground_emergency' : 'underground');
      ctx.events?.emit?.('world:power', { mode: lights.mode });
      return lights.mode;
    },
    get power() {
      return lights.mode;
    },
    update: (dt, c) => {
      lights.update(c.time.elapsed);
      if (!fxDone) fxDone = startEmitters(c, W);
    },
    selfTest: (c, world) => runMapSelfTest(c, world, selfTestSpec()),
    afterFinalize: (r) => {
      for (const o of r.children) {
        if (o.name === 'world_glazing') {
          o.castShadow = false;
          o.userData.owNoShadow = true;
          o.userData.owNoPrepass = true;
        }
        if (o.name === 'world_puddle') o.userData.owNoShadow = true;
      }
      lights.bind(A, litMat);
    },
  };
}

/**
 * Steam from the pipe leaks and sparks from the shorting junction box, through
 * fx's persistent smoke sources. fx initialises after the world, so this runs
 * on the first frame it is available. Returns true once done.
 */
function startEmitters(ctx, W) {
  const fx = ctx.peek('fx');
  if (!fx?.addSmokeSource) return false;
  const steam = { rate: 3.5, radius: 0.12, rise: 1.4, dark: 0.62, life: 2.4, growth: 4.5, ember: 0, haze: 0.25 };
  for (const [x, y, z] of [
    [31, Y.plat + 3.2, -26.2],
    [52, 3.1, 21.4],
    [70, 3.2, 24.6],
    [60, 8.0, -8.9],
  ]) fx.addSmokeSource(W(x, y, z), steam);
  fx.addSmokeSource(W(66, 5.3, 1.5), { rate: 1.6, radius: 0.05, rise: 0.4, dark: 0.3, life: 1.2, growth: 2.5, ember: 0.9, haze: 0 });
  return true;
}

/** The self-test data: every door, every stair, the train, the walls. */
function selfTestSpec() {
  const P = Y.plat;
  const T = Y.track;
  return {
    floors: [
      ['street', -56, -48, Y.street],
      ['ticket hall N', -46, -28, Y.hall],
      ['ticket hall S', -46, -16, Y.hall],
      ['platform A', 10, -11, P],
      ['platform B', 10, 5, P],
      ['track bed', 20, -3.1 + 1.6, T],
      ['station car aisle', 9, TRACK1_Z, P],
      ['tunnel car aisle', 54, TRACK1_Z, P],
      ['walkway', 60, -8.6, P],
      ['east tunnel', 60, -1.6, T],
      ['west tunnel', -30, -1.6, T],
      ['side room', -35, 6, T],
      ['north corridor', 10, -16, P],
      ['pump room', 25.5, -20, P],
      ['maint corridor', 10, 9.9, P],
      ['deep tunnel', 50, 23, Y.deep],
      ['facility', 45, 45, Y.deep],
      ['dais', 56, 45.5, Y.deep + CF.dais.h],
      ['exit shaft', 92, 44, Y.deep],
    ],
    walls: [
      ['hall west wall', -60, Y.hall + 1, -20, -1, 0, 2.2],
      ['platform A back wall', 10, P + 1, -12, 0, -1, 2.2],
      ['platform A edge (from bed)', 20, T + 0.5, -6.5, 0, -1, 1.7],
      ['platform B edge (from bed)', 20, T + 0.5, 0.5, 0, 1, 1.7],
      ['station car north wall', 6.5, P + 1.4, TRACK1_Z, 0, -1, 1.6],
      ['tunnel car south wall', 55.5, P + 1.4, TRACK1_Z, 0, 1, 1.6],
      ['east bulkhead', 82, T + 1, -3, 1, 0, 2.2],
      ['rubble plug', -36, T + 1, -3, -1, 0, 5],
      ['fare gate cabinet', -61.7, Y.hall + 0.6, -24, 0, 1, 2.5],
      ['facility north wall', 45, 1, 31, 0, -1, 2.2],
      ['console', 56, Y.deep + CF.dais.h + 0.6, 45.5, 0, 1, 1.4],
    ],
    openings: [
      ...doorOpenings(VOIDS),
      ['station car door', 1.0 + 8.0, -7.6, P, 0, 1],
      ['tunnel car door', 46 + 8.0, -7.6, P, 0, 1],
      ['blast door', 52, 27, Y.deep, 0, 1],
      ['service door', 69.2, 27, Y.deep, 0, 1],
      ['exit corridor', 83, 41.5, Y.deep, 1, 0],
      ['hall stair top', -30.5, -14, Y.hall, 1, 0],
    ],
    routes: [
      ['street stair down', [-49.5, Y.street, -45.5], [[0, 1, 5.5]], (p) => Math.abs(p.y - Y.hall) < 0.15 && p.z > -31.5],
      ['hall stair down', [-31, Y.hall, -14], [[1, 0, 4.8]], (p) => Math.abs(p.y - P) < 0.15 && p.x > -19.5],
      ['fare gate lane', [-49.7, Y.hall, -24.5], [[0, 1, 2.0]], (p) => p.z > -21],
      ['S2 down to deep', [30, P, 10.4], [[0, 1, 5.5]], (p) => Math.abs(p.y - Y.deep) < 0.15 && p.z > 21],
      ['ramp down to deep', [74, T, 0.8], [[0, 1, 7.0]], (p) => Math.abs(p.y - Y.deep) < 0.15 && p.z > 21],
      ['car walk-through (gangway)', [3, P, TRACK1_Z], [[1, 0, 5.0]], (p) => p.x > 17.8 + 1.0 && Math.abs(p.y - P) < 0.1],
      ['board tunnel car', [48.6, P, -8.6], [[0, 1, 0.45], [1, 0, 3.0]], (p) => p.x > 50.5 && Math.abs(p.z - TRACK1_Z) < 1.2 && Math.abs(p.y - P) < 0.1],
      ['track steps up (A)', [36.5, T, -5.6], [[0, -1, 2.2]], (p) => Math.abs(p.y - P) < 0.1 && p.z < -8.2],
      ['track steps up (B)', [36.5, T, -0.9], [[0, 1, 2.2]], (p) => Math.abs(p.y - P) < 0.1 && p.z > 2.2],
      ['dais steps', [52.5, Y.deep, 42.5], [[0, 1, 1.6]], (p) => Math.abs(p.y - (Y.deep + CF.dais.h)) < 0.1],
    ],
    blocked: [
      ['into hall wall', [-61.2, Y.hall, -20], [-1, 0]],
      ['into platform A back wall', [10, P, -13.4], [0, -1]],
      ['into car side (from bed)', [9.5, T, -3.8], [0, -1]],
      ['into rubble plug', [-37.5, T, -6.5], [-1, 0]],
      ['into east bulkhead', [83.2, T, -1.5], [1, 0]],
      ['into facility wall', [77.2, Y.deep, 50], [1, 0]],
      ['up platform B edge (no steps)', [20, T, 0.9], [0, 1]],
    ],
  };
}

export { TRACK2_Z };
