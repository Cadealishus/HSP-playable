import * as THREE from 'three';
import { PaletteAssembler } from '../shared/kit.js';
import { voidAt, floorAt } from '../shared/voids.js';
import { buildSigns } from '../shared/signs.js';
import { runMapSelfTest, doorOpenings } from '../shared/selftest.js';
import { UG_PALETTE } from '../underground/palette.js';
import { ES_PALETTE } from './palette.js';
import { VOIDS, V, Y, PERIM, OUTER, TERRACES, STAIRS, FOUNTAIN, PLAY } from './layout.js';
import { buildEstate } from './build.js';
import { EstateLights } from './lights.js';

/**
 * MAP 04: THE RESIDENCE. A walled embassy residence on a hillside, at night.
 * Hosts the mission "Hostage Taker" (EXPANSION.md §8, mission id `hostage`)
 * and the bot-match modes.
 *
 * The house steps up the hill in three rows (layout.js): basement + garages
 * under the front terrace, the ground floor behind it, the upper floor behind
 * that. Approaches: the front gate and front door, the west pedestrian gate
 * and the side door off the west garden, the garage (bay 1 is open), the
 * service entrance in the basement front, and the roof route (east service
 * gate -> steel stair -> garage roof -> kitchen door).
 *
 * ------------------------------------------------------------------------
 * ANCHORS (world.anchors). World space; the level yaw is 0 so level metres
 * are world metres (x east, z south, y up). yaw = camera-convention facing.
 *
 *   insertion       { front, side, garage, service, rooftop } -> {pos, yaw}
 *                   where a team starts for each approach, all OUTSIDE the
 *                   perimeter wall, facing in
 *   entryPoints     { frontGate, frontDoor, sideGate, sideDoor, garageBay,
 *                     serviceDoor, roofStair, roofDoor } -> {pos, yaw}
 *                   the thresholds themselves (yaw faces into the building)
 *   securityRoom    Vector3     ground floor, east of the entrance hall
 *   alarmPanel      {pos, yaw}  on the security room's east wall; stand at
 *                               pos facing yaw to use it
 *   hostageRooms    {id, pos, floor}[]  candidates: 'cellar' (basement),
 *                               'library' (ground), 'master' (upper)
 *   rooms           {id: Vector3} centre of every room (floor height)
 *   patrolRoutes    { perimeter, court, house, upper } -> Vector3[] loops
 *   extractionLZ    { pos, radius }  the west lawn, clear of trees
 *   chokepoints     {name, pos}[]  gate, grand stair, front door, side door,
 *                               garage bay, service door, roof door, main
 *                               stair, service stair, upper hall
 *   guardPost       Vector3     inside the gatehouse
 *   estate          Box3        inside the perimeter wall
 *   house           Box3        the house (all three rows)
 *
 * Also published: spawns / objectives (EXPANSION.md §5), lighting 'night',
 * setAlarm(on), spawnPoints / objective (survival's legacy shape), selfTest().
 *
 * NAV NOTE: the front terrace is the roof of the basement and the garages, so
 * the AI's single-layer nav grid does not reach those two (everything else,
 * both house floors included, is on the grid). Script basement/garage actors
 * with 'hold' orders.
 * ------------------------------------------------------------------------
 */

const G = Y.ground;
const U = Y.upper;
const ESF_SPAWNS = [
  [0, 0, 53, 0, -1],
  [-10, 0, 54, 0.3, -1],
  [12, 0, 53, -0.3, -1],
  [-47.5, 0, 24, 1, 0],
  [47.5, 0, -4, -1, 0],
  [-20, 0, 40, 0.2, -1],
  [26, 0, 44, -0.3, -1],
];
const HOSTILE_SPAWNS = [
  [0, G, -5, 0, 1],
  [-15, G, -7.5, 1, 0],
  [18, G, -3, -0.5, 1],
  [-10, U, -18.8, 1, 0],
  [12, U, -26, 0, 1],
  [0, 0, -34, 1, 0],
  [36, 0, -24, 0, 1],
  [-35, G, -8, 1, 0.3],
];

export async function buildMap({ ctx, materials, render, rng, root, disp, fonts, anisotropy }) {
  const A = new PaletteAssembler({ materials, rng, render }, [ES_PALETTE, UG_PALETTE], 'estate');
  A.setTransform(0, 0, 0);
  buildEstate(A, rng);
  const lights = new EstateLights();
  lights.build(A, root, disp);
  await fonts;
  buildSigns(A, root, disp, signList(), { anisotropy, name: 'estate', frameKey: 'gate_black' });

  const W = (x, y, z) => A.toWorld(x, y, z);
  const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
  const at = (x, y, z, dx, dz) => ({ pos: W(x, y, z), yaw: yawOf(dx, dz) });
  const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(W(x0, y0, z0), W(x1, y1, z1));
  const centre = (id) => {
    const v = V[id];
    return W((v.x0 + v.x1) / 2, v.y, (v.z0 + v.z1) / 2);
  };
  const zone = (x, y, z, radius) => ({ pos: W(x, y, z), radius });
  const sp = (list) => list.map(([x, y, z, dx, dz]) => at(x, y, z, dx, dz));

  const sec = V.security;
  const anchors = {
    insertion: {
      front: at(0, 0, 53, 0, -1),
      side: at(-48, 0, 19, 1, 0),
      garage: at(48, 0, -10, -1, 0),
      service: at(-8, 0, 53.5, 0, -1),
      rooftop: at(48, 0, -6, -1, 0),
    },
    entryPoints: {
      frontGate: at(1.5, 0, 48.2, 0, -1),
      frontDoor: at(0, G, 0.1, 0, -1),
      sideGate: at(-44.2, 0, 19, 1, 0),
      sideDoor: at(-25.7, G, -7.5, 1, 0),
      garageBay: at(17.1, 0, 10.1, 0, -1),
      serviceDoor: at(-18.2, 0, 10.1, 0, -1),
      roofStair: at(41.5, 0, STAIRS.roof.z, -1, 0),
      roofDoor: at(19.5, G, 0.1, 0, -1),
    },
    securityRoom: centre('security'),
    alarmPanel: at(sec.x1 - 0.6, G, sec.z0 + 1.5, 1, 0),
    hostageRooms: [
      { id: 'cellar', pos: centre('cellar'), floor: 'basement' },
      { id: 'library', pos: centre('library'), floor: 'ground' },
      { id: 'master', pos: centre('master'), floor: 'upper' },
    ],
    rooms: Object.fromEntries(VOIDS.filter((v) => !v.door && !v.slope).map((v) => [v.id, centre(v.id)])),
    patrolRoutes: {
      perimeter: [W(-40, 0, 44), W(40, 0, 44), W(40, 0, 14), W(40, 0, -32), W(-40, 0, -32), W(-40, 0, 14)],
      court: [W(-6, 0, 44), W(-8, 0, 26), W(8, 0, 26), W(6, 0, 44), W(20, 0, 14), W(-20, 0, 13)],
      house: [W(0, G, -4), W(-15, G, -7.5), W(-24, G, -7.5), W(-15, G, -7.5), W(15, G, -7.5), W(20, G, -7.5)],
      upper: [W(-22, U, -18.8), W(18, U, -18.8)],
    },
    extractionLZ: zone(-27, 0, 40, 5),
    chokepoints: [
      { name: 'frontGate', pos: W(0, 0, 48.2) },
      { name: 'grandStair', pos: W(0, G, 10.4) },
      { name: 'frontDoor', pos: W(0, G, 0.1) },
      { name: 'sideDoor', pos: W(-25.7, G, -7.5) },
      { name: 'garageBay', pos: W(17.1, 0, 10.1) },
      { name: 'serviceDoor', pos: W(-18.2, 0, 10.1) },
      { name: 'roofDoor', pos: W(19.5, G, 0.1) },
      { name: 'mainStair', pos: W(0, (G + U) / 2, -13.5) },
      { name: 'serviceStair', pos: W(11.3, G / 2, -3) },
      { name: 'upperHall', pos: W(0, U, -18.8) },
    ],
    guardPost: centre('guardPost'),
    estate: box(PERIM.x0, -0.5, PERIM.z0, PERIM.x1, 12, PERIM.z1),
    house: box(-26.2, -0.5, -32.2, 30, 10.5, 10.2),
  };
  const spawns = { esf: sp(ESF_SPAWNS), hostile: sp(HOSTILE_SPAWNS) };
  const objectives = {
    dom: { A: zone(-26, 0, 29, 3.5), B: zone(0, 0, 21, 3.5), C: zone(36, 0, -18, 3.5) },
    hp: [zone(0, 0, 21, 4), zone(0, G, 5, 4), zone(28, 0, 31, 4), zone(-35, G, -8, 4), zone(0, 0, -34, 3.5)],
    sd: { A: zone(22, 0, 3, 2.0), B: zone(-21, G, -2.8, 2.0), attackers: 'esf' },
    survival: zone(0, 0, 21, 4),
  };
  const spawnPoints = [...ESF_SPAWNS, ...HOSTILE_SPAWNS].map(([x, y, z, dx, dz], i) => ({
    position: W(x, y, z),
    yaw: yawOf(dx, dz),
    tag: i === 0 ? 'front gate' : i < ESF_SPAWNS.length ? 'esf' : 'hostile',
  }));
  const objective = { position: W(0, 0, 21), yaw: 0, radius: 1.4, label: 'THE FOUNTAIN' };
  const bounds = new THREE.Box3(W(PLAY.x0, PLAY.y0, PLAY.z0), W(PLAY.x1, PLAY.y1, PLAY.z1));

  // interior gate volumes for the renderer (enterable footprints, roofY)
  const buildings = [
    { spec: { id: 'basement', x: -6, z: 5, w: 40.4, d: 10.4, floors: 1, enterable: true }, roofY: 3.1 },
    { spec: { id: 'garage', x: 22.2, z: 5, w: 16, d: 10.4, floors: 1, enterable: true }, roofY: 3.1 },
    { spec: { id: 'ground', x: -2, z: -8, w: 47.6, d: 16.4, floors: 2, enterable: true }, roofY: 7.9 },
    { spec: { id: 'upper', x: -2, z: -24.6, w: 44.4, d: 15.6, floors: 3, enterable: true }, roofY: 9.8 },
    { spec: { id: 'guardPost', x: 10.5, z: 42.3, w: 5.4, d: 5, floors: 1, enterable: true }, roofY: 2.95 },
  ];

  const floorVoids = VOIDS.filter((v) => v.floor);
  const inRect = (x, z, r, m) => x > r[0] + m && x < r[2] - m && z > r[1] + m && z < r[3] - m;
  return {
    A,
    spawnPoints,
    playerSpawnIndex: 0,
    objective,
    bounds,
    buildings,
    spawns,
    objectives,
    anchors,
    lighting: 'night',
    audioAnchors: { fountain: W(FOUNTAIN.x, 1, FOUNTAIN.z) },
    groundY: (x, z) => {
      for (const t of TERRACES) if (inRect(x, z, t, 0)) return t[4];
      const v = voidAt(floorVoids, x, z);
      return v ? floorAt(v, x, z) : 0;
    },
    isOpen: (x, z, m = 0.3) => {
      if (!inRect(x, z, [OUTER.x0, OUTER.z0, OUTER.x1, OUTER.z1], m)) return false;
      return !inRect(x, z, [-26.2, -32.2, 21.8, 10.2], 0) && !inRect(x, z, [14.2, -0.2, 30.2, 10.2], 0);
    },
    setAlarm: (on) => {
      lights.setAlarm(on);
      ctx.events?.emit?.('world:alarm', { on: lights.alarm });
      return lights.alarm;
    },
    get alarm() {
      return lights.alarm;
    },
    update: (dt, c) => lights.update(c.time.elapsed),
    selfTest: (c, world) => runMapSelfTest(c, world, selfTestSpec()),
    afterFinalize: (r) => {
      for (const o of r.children) {
        if (o.name === 'world_glazing') {
          o.castShadow = false;
          o.userData.owNoShadow = true;
          o.userData.owNoPrepass = true;
        }
      }
      lights.bind(A);
    },
  };
}

function signList() {
  const N = Math.PI;
  return [
    { x: -3.3, y: 2.3, z: 48.57, w: 0.62, h: 0.5, ry: 0, style: 'plaque', lines: ['THE RESIDENCE', 'BY APPOINTMENT'], box: false },
    { x: 3.3, y: 2.3, z: 48.57, w: 0.62, h: 0.42, ry: 0, style: 'plaque', lines: ['NO', 'APPOINTMENTS'], box: false },
    { x: -9, y: 1.7, z: 48.42, w: 1.6, h: 0.5, ry: 0, style: 'warn', lines: ['PRIVATE PROPERTY', 'CCTV IN OPERATION'] },
    { x: 10.5, y: 2.55, z: 44.82, w: 1.6, h: 0.3, ry: 0, style: 'metro', lines: ['SECURITY'] },
    { x: 8.0, y: G + 2.8, z: -6.03, w: 1.4, h: 0.28, ry: N, style: 'plaque', lines: ['SECURITY'], box: false },
    { x: 22.1, y: 1.4, z: 10.17, w: 2.2, h: 0.36, ry: 0, style: 'stencil', color: '#f0ece0', lines: ['NO PARKING'] },
    { x: -18.2, y: 2.75, z: 10.22, w: 1.8, h: 0.3, ry: 0, style: 'plaque', lines: ['SERVICE'], box: false },
    { x: 19.5, y: G + 2.75, z: 0.22, w: 1.6, h: 0.28, ry: 0, style: 'warn', lines: ['STAFF ONLY'] },
    { x: 44.45, y: 1.7, z: -5.5, w: 1.4, h: 0.4, ry: Math.PI / 2, style: 'warn', lines: ['DELIVERIES', 'NOT EXPECTED'] },
  ];
}

function selfTestSpec() {
  const B = Y.base;
  const openings = doorOpenings(VOIDS).filter(([n]) => !/D_bay2|D_bay3/.test(n));
  return {
    floors: [
      ['court', 0, 21, 0],
      ['road', 0, 54, 0],
      ['front terrace', 0, 5, G],
      ['garage roof', 26, 5, G],
      ['west garden', -35, -8, G],
      ['hallG', 3, -3, G],
      ['security', 8, -3, G],
      ['kitchen', 19, -1.5, G],
      ['library', -18, -3, G],
      ['dining', -17, -12.7, G],
      ['hallU', 0, -18.8, U],
      ['master', 14, -26.5, U],
      ['bed1', -21, -26.5, U],
      ['serviceHall', -10, 8.2, B],
      ['cellar', -1, 4.5, B],
      ['garage', 22, 1.5, B],
      ['guard post', 10.5, 42.3, B],
      ['east yard', 36, -20, 0],
      ['rear yard', 0, -34, 0],
    ],
    walls: [
      ['perimeter south', -20, 1, 46.8, 0, 1, 1.6],
      ['perimeter east', 42.5, 1, 20, 1, 0, 1.8],
      ['podium face', 0, 1, -34, 0, 1, 1.9],
      ['basement front', -8, 1, 11.5, 0, -1, 1.8],
      ['hall south wall', 4, G + 1, -1, 0, 1, 1.5],
      ['upper north wall', -10, U + 1, -30.5, 0, -1, 1.8],
      ['bay 2 door', 22.1, 1, 11.5, 0, -1, 1.8],
      ['fountain basin', 0, 0.3, 36.5, 0, -1, 2.2],
      ['terrace balustrade', -12, G + 0.5, 9.0, 0, 1, 1.4],
    ],
    openings: [...openings, ['front gate', 1.5, 48.2, 0, 0, -1], ['west gate', -44.2, 19, 0, 1, 0], ['east gate', 44.2, -10, 0, -1, 0]],
    routes: [
      ['grand stair up', [0, 0, 18], [[0, -1, 3.5]], (p) => Math.abs(p.y - G) < 0.1 && p.z < 10],
      ['west stair up', [-38, 0, 11], [[0, -1, 4.0]], (p) => Math.abs(p.y - G) < 0.1 && p.z < 0],
      ['roof stair up', [43.2, 0, STAIRS.roof.z], [[-1, 0, 4.0]], (p) => Math.abs(p.y - G) < 0.1 && p.x < 31.5],
      ['main stair up', [0, G, -8], [[0, -1, 4.0]], (p) => Math.abs(p.y - U) < 0.1 && p.z < -17.2],
      ['service stair down', [11.3, G, -7.5], [[0, 1, 4.0]], (p) => Math.abs(p.y - B) < 0.1 && p.z > 0.3],
      ['gate to fountain', [1.5, 0, 50], [[0, -1, 4.0]], (p) => p.z < 45],
    ],
    blocked: [
      ['into perimeter wall', [-20, 0, 47], [0, 1]],
      ['into closed garage door', [22.1, 0, 11.2], [0, -1]],
      ['into podium', [0, 0, -33.5], [0, 1]],
      ['into house wall', [-10, G, -1], [0, 1]],
      ['into outer wall', [0, 0, 57], [0, 1]],
      ['over the balustrade', [-12, G, 8.8], [0, 1]],
    ],
  };
}

