/**
 * INDUSTRIAL YARD — the plan, in LEVEL metres (x east, z south, y up).
 *
 * The yard is POINT-SYMMETRIC about the origin: everything in the lists below
 * is authored once for the western half and built again rotated 180 degrees
 * (x, z) -> (-x, -z), so both teams get the same map, turned round. ESF deploy
 * from the truck park on the west edge, the hostiles from the east.
 *
 * Three lanes, west to east:
 *   NORTH   warehouse A (dock height 1.2 m) with its dock apron, the pipe
 *           alley and catwalk behind it, the tank farm and loading-rack perch
 *           in the north-east yard.
 *   MIDDLE  the container stacks under the gantry crane. No straight line
 *           crosses it: every row is broken or offset.
 *   SOUTH   warehouse B, its apron, the south pipe alley, the south-west yard
 *           with the second perch. (The north lane, turned round.)
 * Flanks: the pipe alleys along the fences and the catwalks above them.
 * Chokepoints: the dock doors, the drive ramps, the alley mouths past the pump
 * houses, the gaps in the spawn-side container walls.
 */

/** Level -> world yaw: the lanes run across the late sun, not into it. */
export const LEVEL_YAW = -Math.PI / 2;

/** Playable area (the perimeter wall stands on these lines). */
export const PLAY = { x0: -68, x1: 68, z0: -56, z1: 56 };

/** Dock / warehouse floor height. */
export const DOCK_Y = 1.2;

/** Warehouse A (north), authored; B is its rotation. */
export const WAREHOUSE = {
  x0: -34,
  x1: 2,
  z0: -50,
  z1: -30,
  eave: 9.0,
  ridge: 10.8,
  t: 0.3,
  apronZ: -25.5, // the dock face
  // south (dock) wall openings, [x-centre, width, head above the floor]
  dockDoors: [
    [-27, 3.6, 3.4],
    [-16, 3.6, 2.6], // shutter half down: 2.6 m clear
    [-5, 3.6, 3.4],
  ],
  personnel: [-31.5, 1.3, 2.6], // south wall
  westDoor: [-34.3, 1.4, 2.6], // z-centre on the west wall, width, head
  eastDoor: [-42, 4.0, 3.6], // z-centre on the east wall (drive-in, ramp outside)
  mezz: { x0: -33.7, x1: -4.0, z0: -49.7, z1: -45.2, y: 4.8 },
  mezzStairs: [-33.0, -4.8], // x-centres; each runs z -38 (floor) -> -45.2 (mezz)
  racks: [-26, -19.5, -13], // rack rows along z, x-centres, z -43 .. -36
  office: { x0: -3.5, x1: 1.7, z0: -37.5, z1: -30.3, door: [-34.0, 1.3] },
};

/** Containers: [x, z, length 20|40, yaw, tier, colour]. Mirrored for the east half. */
const Q = Math.PI / 2;
export const CONTAINERS = [
  // spawn-side wall, broken, with an offset blocker in front of the gap
  [-53, -14, 40, Q, 0, 'blue'],
  [-53, -14, 40, Q, 1, 'red'],
  [-53, 9, 40, Q, 0, 'green'],
  [-53, 9, 40, Q, 1, 'grey'],
  [-47, -2.5, 20, Q, 0, 'orange'],
  [-47, -2.5, 20, Q, 1, 'white'],
  // west field
  [-38, -17.5, 40, 0, 0, 'red'],
  [-36, -8.5, 40, 0, 0, 'blue'],
  [-36, -8.5, 40, 0, 1, 'tan'],
  [-38, 5, 40, 0, 0, 'grey'], // climbable: stair at its east end
  [-41.05, 5, 20, 0, 1, 'red'],
  [-27, 14, 40, Q, 0, 'orange'],
  [-27, 14, 40, Q, 1, 'blue'],
  [-24, -3, 20, 0, 0, 'green'],
  // inner ring round the gantry
  [-17, -15.5, 40, 0, 0, 'white'],
  [-17, -15.5, 40, 0, 1, 'green'],
  [-15, 9, 40, 0, 0, 'red'],
  [-15, 9, 40, 0, 1, 'blue'],
  [-15, 9, 40, 0, 2, 'grey'], // the tower: 7.8 m, breaks the long diagonal
  [-11, -4, 20, Q, 0, 'tan'],
  [-11, -4, 20, Q, 1, 'orange'],
  [-4.5, -9.5, 20, 0, 0, 'blue'],
  // the north-west yard
  [-50, -46, 20, 0, 0, 'grey'],
  [-50, -46, 20, 0, 1, 'green'],
  [-44, -49.5, 20, Q, 0, 'red'],
];

/** Stair onto the climbable container's roof: along x at z = 5, x -26.7 (ground) -> -31.9 (2.59). */
export const CONTAINER_STAIR = { z: 5, w: 1.2, xGround: -26.6, xTop: -31.85 };

/** Box trailers backed onto the dock doors: [x, z-centre]. */
export const TRAILERS = [
  [-27, -20.25],
  [-5, -20.25],
];

/** Pipe rack + catwalk along the north fence (authored north; mirrored south). */
export const RACK = {
  x0: -64,
  x1: 56,
  zFence: -55.5,
  zAlley: -53.3,
  tier: 3.3, // catwalk deck top
  top: 5.8, // pipe tier
  walk: { x0: -44, x1: 20 }, // catwalk extent; stairs down at both ends
};

/** Pump house at the east mouth of the north alley (breaks the alley sightline). */
export const PUMPHOUSE = { x0: 4, x1: 9, z0: -53.2, z1: -47.5, h: 3.6 };

/** Tank farm in the north-east yard. */
export const TANKS = [
  [20, -44, 4.0, 10.5],
  [32, -44, 4.0, 10.5],
];
export const BUND = { x0: 14, x1: 38, z0: -50.5, z1: -38.5, h: 1.0, gaps: [[25, 27]] };

/** The loading-rack perch (north-east), 5 m up; stair climbs west from x 52. */
export const PERCH = { x0: 36, x1: 42, z0: -37.5, z1: -33.5, y: 5.0, stairZ: -35.5, stairX: 52 };

/** Gantry crane legs straddle the centre. */
export const GANTRY = { lx: 3.5, lz: 12.5, h: 17.5 };

/** The ESF gatehouse (west); the hostile side has its rotation. */
export const GATEHOUSE = { x0: -66, x1: -60, z0: 36, z1: 44, h: 3.4 };
