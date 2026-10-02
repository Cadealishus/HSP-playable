import { door, WALL } from '../shared/voids.js';

/**
 * UNDERGROUND: the plan. LEVEL metres, x east, z south, y up. Level yaw 0.
 *
 * Four storeys that never overlap in plan (the AI's nav grid is one layer: a
 * downward ray per cell takes the first floor it meets), stepping down from
 * the street in the north-west to the command facility in the south-east:
 *
 *   STREET   y 15    the kerb, the entrance canopy
 *   HALL     y 10    ticket hall, fare gates, booth
 *   PLATFORM y 5.1   platforms A (north) and B (south), service corridors,
 *                    electrical / maintenance rooms, the tunnel walkway
 *   TRACK    y 4.0   both tracks, the east and west tunnels, the side room
 *   DEEP     y 0     deep service tunnel, command facility, exit shaft
 *
 *   x -66 ........ -30 ...... -20 ................ 40 .............. 84 ... 96
 *   z -56  STREET
 *   z -44    | S0 stair
 *   z -32  TICKET HALL
 *   z -16        S1 stair ->  | north corridor, E2, pump room
 *   z -14                     PLATFORM A (5.1) ====== walkway (5.1) ======
 *   z  -8   WEST TUNNEL (4.0) TRACK 1 / TRACK 2 (4.0) === EAST TUNNEL === |
 *   z   2    side room        PLATFORM B (5.1)                    R1 ramp
 *   z   8                     maintenance corridor, E1, M1, M2    |
 *   z  11                                             S2 stair    |
 *   z  21                                             DEEP SERVICE TUNNEL
 *   z  29                                          COMMAND FACILITY  | shaft
 *   z  56
 */

export const Y = { street: 15, hall: 10, plat: 5.1, track: 4.0, deep: 0 };

/** Track centrelines (z) and the station's car line. */
export const TRACK1_Z = -6.1;
export const TRACK2_Z = -0.1;
export const CAR = { w: 3.0, h: 2.75, len: 16.0, gap: 0.8, floor: Y.plat, doorW: 1.5, doorH: 2.45 };

/** Train consists: [x of the first car's west end, cars, z centreline, id]. */
export const TRAINS = [
  { id: 'station', x: 1.0, cars: 2, z: TRACK1_Z, doors: 'north' },
  { id: 'tunnel', x: 46.0, cars: 2, z: TRACK1_Z, doors: 'north' },
];

const P = Y.plat;
const T = Y.track;
const D = Y.deep;
const W = WALL;

// palette shorthands
const TILE = { wall: 'wall_tile', ceil: 'ceiling_ug' };
const SVC = { wall: 'service_paint', ceil: 'ceiling_ug', floor: 'service_floor' };
const TUN = { wall: 'tunnel_concrete', ceil: 'ceiling_ug', floor: 'track_bed' };

/** Every void in the level. See src/world/maps/shared/voids.js. */
export const VOIDS = [
  // ---------------------------------------------------------------- street --
  { id: 'street', x0: -66, z0: -58, x1: -38, z1: -44, y: Y.street, h: 12, open: true, wallH: 13, floor: 'street_paving', wall: 'facade_brick' },
  // street stair: 15 at the north end down to 10 at the south
  { id: 'S0', x0: -52, z0: -44, x1: -47, z1: -32, y: Y.hall, h: 3.4, slope: { axis: 'z', y0: Y.street, y1: Y.hall, stairs: true }, floor: 'stair_tread', ...TILE },

  // ----------------------------------------------------------- ticket hall --
  { id: 'hall', x0: -62, z0: -32, x1: -30, z1: -12, y: Y.hall, h: 4.6, floor: 'hall_floor', ...TILE },
  // hall stair: 10 at the west end down to 5.1 at the east
  { id: 'S1', x0: -30, z0: -16, x1: -20, z1: -12, y: P, h: 3.4, slope: { axis: 'x', y0: Y.hall, y1: P, stairs: true }, floor: 'stair_tread', ...TILE },
  { id: 'landing', x0: -20, z0: -16, x1: -14, z1: -14, y: P, h: 3.4, floor: 'platform_tile', ...TILE },

  // --------------------------------------------------------------- station --
  { id: 'platA', x0: -20, z0: -14, x1: 40, z1: -8, y: P, h: 4.5, floor: 'platform_tile', ...TILE },
  { id: 'tracks', x0: -20, z0: -8, x1: 40, z1: 2, y: T, h: 5.6, ...TUN, wall: 'wall_tile' },
  { id: 'platB', x0: -20, z0: 2, x1: 40, z1: 8, y: P, h: 4.5, floor: 'platform_tile', ...TILE },

  // --------------------------------------------------------------- tunnels --
  { id: 'eastTunnel', x0: 40, z0: -8, x1: 84, z1: 2, y: T, h: 5.0, ...TUN },
  { id: 'walkway', x0: 40, z0: -9.2, x1: 84, z1: -8, y: P, h: 3.9, floor: 'service_floor', wall: 'tunnel_concrete', ceil: 'ceiling_ug' },
  { id: 'westTunnel', x0: -44, z0: -8, x1: -20, z1: 2, y: T, h: 5.0, ...TUN },
  door('D_mw', 'z', 2, -37.4, -35.2, T, 2.6),
  { id: 'sideRoom', x0: -40, z0: 2 + W, x1: -31, z1: 10, y: T, h: 3.2, ...SVC },

  // ---------------------------------------------- north utility (platform A) --
  door('D_nc1', 'z', -14 - W, -4, -1.8, P, 2.6),
  door('D_nc2', 'z', -14 - W, 27, 29.2, P, 2.6),
  { id: 'northCorr', x0: -10, z0: -17.4, x1: 36, z1: -14 - W, y: P, h: 3.2, ...SVC },
  door('D_e2', 'z', -17.4 - W, 6, 8.2, P, 2.6),
  { id: 'elecNorth', x0: 2, z0: -25, x1: 13, z1: -17.4 - W, y: P, h: 3.4, ...SVC, floor: 'service_floor' },
  door('D_pump', 'z', -17.4 - W, 25, 27.2, P, 2.6),
  { id: 'pumpRoom', x0: 18, z0: -27, x1: 33, z1: -17.4 - W, y: P, h: 4.2, ...SVC, floor: 'wet_floor' },

  // ------------------------------------------ maintenance (platform B side) --
  door('D_mc1', 'z', 8, -7.4, -5.2, P, 2.6),
  door('D_mc2', 'z', 8, 21, 23.2, P, 2.6),
  { id: 'maintCorr', x0: -16, z0: 8 + W, x1: 36, z1: 11.4, y: P, h: 3.2, ...SVC },
  door('D_e1', 'z', 11.4, -10.2, -8, P, 2.6),
  { id: 'elecSouth', x0: -14, z0: 11.4 + W, x1: -3, z1: 19, y: P, h: 3.4, ...SVC },
  door('D_m1', 'z', 11.4, 5.8, 8, P, 2.6),
  { id: 'staffRoom', x0: 1, z0: 11.4 + W, x1: 11, z1: 19, y: P, h: 3.2, ...SVC },
  door('D_m2', 'z', 11.4, 17.8, 20, P, 2.6),
  { id: 'storeRoom', x0: 13, z0: 11.4 + W, x1: 25, z1: 19, y: P, h: 3.2, ...SVC, floor: 'wet_floor' },
  // stair down to the deep level: 5.1 at the north end, 0 at the south
  { id: 'S2', x0: 28, z0: 11.4, x1: 32, z1: 21, y: D, h: 3.1, slope: { axis: 'z', y0: P, y1: D, stairs: true }, floor: 'stair_tread', wall: 'service_paint', ceil: 'ceiling_ug' },

  // ------------------------------------------------------------------ deep --
  // service ramp from the east tunnel (track level) down to the deep tunnel
  { id: 'R1', x0: 72, z0: 2, x1: 76, z1: 21, y: D, h: 3.6, slope: { axis: 'z', y0: T, y1: D }, floor: 'service_floor', wall: 'tunnel_concrete', ceil: 'ceiling_ug' },
  { id: 'deepTunnel', x0: 24, z0: 21, x1: 76, z1: 25, y: D, h: 3.8, floor: 'wet_floor', wall: 'tunnel_concrete', ceil: 'ceiling_ug' },
  { id: 'blastDoor', x0: 50, z0: 25, x1: 54, z1: 29, y: D, h: 3.0, floor: 'threshold', wall: 'facility_wall', ceil: 'ceiling_ug' },
  { id: 'serviceDoor', x0: 68, z0: 25, x1: 70.4, z1: 29, y: D, h: 2.7, floor: 'service_floor', wall: 'facility_wall', ceil: 'ceiling_ug' },
  { id: 'facility', x0: 34, z0: 29, x1: 78, z1: 56, y: D, h: 7.0, floor: 'service_floor', wall: 'facility_wall', ceil: 'ceiling_ug' },
  { id: 'exitCorr', x0: 78, z0: 40, x1: 88, z1: 43, y: D, h: 3.0, floor: 'service_floor', wall: 'tunnel_concrete', ceil: 'ceiling_ug' },
  { id: 'exitShaft', x0: 88, z0: 36, x1: 96, z1: 47, y: D, h: 14, floor: 'service_floor', wall: 'tunnel_concrete', ceil: 'ceiling_ug' },
];

/** Void by id. */
export const V = Object.fromEntries(VOIDS.map((v) => [v.id, v]));

/** Walkable extent, for bounds and the nav grid. */
export const PLAY = { x0: -66, z0: -58, x1: 96, z1: 56, y0: -1, y1: 27 };

/** Command-facility set pieces. */
export const CF = {
  console: { x: 56, z: 47.2, ry: Math.PI },
  dais: { x0: 51, z0: 44, x1: 61, z1: 50, h: 0.45 },
  office: { x0: 36, z0: 31, x1: 46, z1: 39 },
  generator: { x: 72, z: 50 },
};
