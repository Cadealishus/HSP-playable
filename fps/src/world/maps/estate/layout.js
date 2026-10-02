import { door, WALL } from '../shared/voids.js';

/**
 * ESTATE: the plan. LEVEL metres, x east, z south, y up. Level yaw 0.
 *
 * A walled hillside compound. The house steps up the hill in three rows so the
 * storeys sit side by side in plan rather than on top of each other (the AI's
 * nav grid is one layer; see airport/kit.js):
 *
 *   BASEMENT  y 0    z 0..10    service hall, laundry, plant, cellar, store,
 *                               the garages (under the front terrace)
 *   GROUND    y 3.4  z -16..0   entrance hall, offices, library, dining,
 *                               lounge, SECURITY ROOM, kitchen, pantry
 *   UPPER     y 6.8  z -32..-17 bedrooms, study, master suite
 *
 * The basement's roof is the FRONT TERRACE (y 3.4, walkable), which is also
 * the garage roof and the roof route: an external steel stair from the east
 * yard lands on it, and a door leads from it into the kitchen. The terrace
 * owns the nav cells over the basement and the garages, so those two are the
 * only rooms the grid does not reach. The ground floor's roof and the upper
 * floor's roof are not walkable and carry no collision.
 *
 *   z -42 .. -36   outer lane (north)          perimeter wall z -36
 *   z -36 .. -32   rear yard (y 0)
 *   z -32 .. -17   UPPER row                    east yard x 22..44 (y 0)
 *   z -16 .. 0     GROUND row, west garden (y 3.4) x -44..-26
 *   z 0 .. 10      BASEMENT row + garages, front terrace over them
 *   z 10 .. 48     the court: drive, fountain, hedges, guard post
 *   z 48           front gate                   perimeter wall z 48
 *   z 48 .. 58     the road outside
 */

export const Y = { court: 0, base: 0, ground: 3.4, upper: 6.8 };
const B = Y.base;
const G = Y.ground;
const U = Y.upper;
const W = WALL;

const SVC = { wall: 'service_wall', ceil: 'ceiling_white', floor: 'kitchen_tile' };
const RM = { wall: 'interior_paint', ceil: 'ceiling_white', floor: 'parquet' };
const HALL = { wall: 'villa_plaster', ceil: 'ceiling_white', floor: 'travertine' };

// windows: { side, a, b, y0, y1 } along the edge from its min corner
const win = (side, a, b, y, sill = 0.9, head = 2.5) => ({ side, a, b, y0: y + sill, y1: y + head });

export const VOIDS = [
  // ============================================================ basement ==
  { id: 'serviceHall', x0: -26, z0: 6.4, x1: 14, z1: 10, y: B, h: 3.0, ...SVC, wall: 'villa_stone', windows: [win('s', 4, 6, B, 1.1, 2.4), win('s', 12, 14, B, 1.1, 2.4), win('s', 28, 30, B, 1.1, 2.4)] },
  door('D_service', 'z', 10, -19.2, -17.2, B, 2.6, { depth: 0.2 }),
  door('D_laundry', 'z', 6, -22, -20, B),
  { id: 'laundry', x0: -26, z0: 0, x1: -16.4, z1: 6, y: B, h: 3.0, ...SVC },
  door('D_plant', 'z', 6, -12, -10, B),
  { id: 'plantRoom', x0: -16, z0: 0, x1: -6.4, z1: 6, y: B, h: 3.0, ...SVC, floor: 'service_floor' },
  door('D_cellar', 'z', 6, -2, 0, B),
  { id: 'cellar', x0: -6, z0: 0, x1: 4, z1: 6, y: B, h: 3.0, wall: 'villa_stone', ceil: 'villa_stone', floor: 'paving_stone' },
  door('D_store', 'z', 6, 6, 8, B),
  { id: 'store', x0: 4.4, z0: 0, x1: 9.6, z1: 6, y: B, h: 3.0, ...SVC, floor: 'service_floor' },
  { id: 'bCorr', x0: 10, z0: 0, x1: 12.6, z1: 6.4, y: B, h: 3.0, ...SVC },
  door('D_garage', 'x', 14, 7.4, 9.6, B),
  { id: 'garage', x0: 14.4, z0: 0, x1: 30, z1: 10, y: B, h: 3.0, wall: 'villa_stone', ceil: 'roof_flat', floor: 'service_floor' },
  // three garage bays on the court: the west one open, the others shut
  door('D_bay1', 'z', 10, 15.6, 18.6, B, 2.7, { depth: 0.2 }),
  door('D_bay2', 'z', 10, 20.6, 23.6, B, 2.7, { depth: 0.2 }),
  door('D_bay3', 'z', 10, 25.6, 28.6, B, 2.7, { depth: 0.2 }),
  // service stair: basement (south) up to the ground floor east corridor
  { id: 'SB', x0: 10, z0: -6, x1: 12.6, z1: 0, y: B, h: 2.8, slope: { axis: 'z', y0: G, y1: B, stairs: true }, floor: 'kitchen_tile', wall: 'service_wall', ceil: 'ceiling_white' },

  // ============================================================== ground ==
  { id: 'hallG', x0: -6, z0: -10, x1: 6, z1: 0, y: G, h: 4.2, ...HALL, windows: [win('s', 1.5, 4, G, 0.9, 3.2), win('s', 8, 10.5, G, 0.9, 3.2)] },
  door('D_front', 'z', 0, -1.4, 1.4, G, 3.0, { depth: 0.2, floor: null }),
  door('D_hw', 'x', -6.4, -8.6, -6.4, G),
  { id: 'westCorr', x0: -25.6, z0: -9, x1: -6.4, z1: -6, y: G, h: 3.2, ...HALL, floor: 'carpet_red' },
  door('D_side', 'x', -25.8, -8.4, -6.6, G, 2.6, { depth: 0.2 }),
  door('D_office', 'z', -6, -10, -8, G),
  { id: 'office', x0: -16, z0: -5.6, x1: -6.4, z1: 0, y: G, h: 3.2, ...RM, windows: [win('s', 2, 4.5, G), win('s', 5.5, 8, G)] },
  door('D_library', 'z', -6, -22, -20, G),
  { id: 'library', x0: -25.6, z0: -5.6, x1: -16.4, z1: 0, y: G, h: 3.2, ...RM, wall: 'interior_green', windows: [win('s', 2, 4.5, G), win('w', 1.5, 4, G)] },
  door('D_dining', 'z', -9.4, -20, -18, G),
  { id: 'dining', x0: -25.6, z0: -16, x1: -14, z1: -9.4, y: G, h: 3.2, ...RM, windows: [win('w', 1.5, 5, G)] },
  door('D_lounge', 'z', -9.4, -11, -9, G),
  { id: 'lounge', x0: -13.6, z0: -16, x1: -6.4, z1: -9.4, y: G, h: 3.2, ...RM, floor: 'carpet_red' },
  door('D_he', 'x', 6, -8.6, -6.4, G),
  { id: 'eastCorr', x0: 6.4, z0: -9, x1: 21.6, z1: -6, y: G, h: 3.2, ...HALL, windows: [win('e', 0.6, 2.4, G)] },
  door('D_security', 'z', -6, 7.0, 8.8, G),
  { id: 'security', x0: 6.4, z0: -5.6, x1: 9.6, z1: 0, y: G, h: 3.2, wall: 'service_wall', ceil: 'ceiling_white', floor: 'kitchen_tile', windows: [win('s', 0.6, 2.6, G, 1.2, 2.4)] },
  door('D_kitchen', 'z', -6, 16, 18, G),
  { id: 'kitchen', x0: 13, z0: -5.6, x1: 21.6, z1: 0, y: G, h: 3.2, ...SVC, windows: [win('e', 1, 4, G, 1.1, 2.4)] },
  door('D_roof', 'z', 0, 18.6, 20.4, G, 2.6, { depth: 0.2, floor: null }),
  door('D_pantry', 'z', -9.4, 16, 18, G),
  { id: 'pantry', x0: 13, z0: -16, x1: 21.6, z1: -9.4, y: G, h: 3.2, ...SVC, windows: [win('e', 2, 4.5, G, 1.1, 2.4)] },
  door('D_cloak', 'z', -10.4, 3.2, 5.0, G),
  { id: 'cloak', x0: 2.4, z0: -16, x1: 6, z1: -10.4, y: G, h: 3.2, ...RM },
  // main stair: ground hall (south) up to the upper hall (north)
  { id: 'SU', x0: -2, z0: -17, x1: 2, z1: -10, y: G, h: 3.2, slope: { axis: 'z', y0: U, y1: G, stairs: true }, floor: 'travertine', ...{ wall: 'villa_plaster', ceil: 'ceiling_white' } },

  // =============================================================== upper ==
  { id: 'hallU', x0: -24, z0: -20.6, x1: 20, z1: -17, y: U, h: 3.0, ...HALL, floor: 'carpet_red', windows: [win('e', 0.6, 3.0, U)] },
  door('D_bed1', 'z', -21, -20, -18, U),
  { id: 'bed1', x0: -24, z0: -32, x1: -14.4, z1: -21, y: U, h: 3.0, ...RM, windows: [win('n', 2, 4.5, U), win('n', 6, 8.5, U), win('w', 3, 6, U)] },
  door('D_bed2', 'z', -21, -10, -8, U),
  { id: 'bed2', x0: -14, z0: -32, x1: -4.4, z1: -21, y: U, h: 3.0, ...RM, wall: 'interior_green', windows: [win('n', 2, 4.5, U), win('n', 6, 8.5, U)] },
  door('D_study', 'z', -21, 1, 3, U),
  { id: 'study', x0: -4, z0: -32, x1: 4, z1: -21, y: U, h: 3.0, ...RM, windows: [win('n', 1.5, 3.5, U), win('n', 4.5, 6.5, U)] },
  door('D_master', 'z', -21, 8, 10, U),
  { id: 'master', x0: 4.4, z0: -32, x1: 20, z1: -21, y: U, h: 3.0, ...RM, floor: 'carpet_red', windows: [win('n', 3, 6, U), win('n', 9, 12, U), win('e', 3, 7, U)] },

  // ========================================================== guard post ==
  { id: 'guardPost', x0: 8, z0: 40, x1: 13, z1: 44.6, y: B, h: 2.8, wall: 'villa_plaster', ceil: 'ceiling_white', floor: 'kitchen_tile', windows: [win('s', 0.8, 4.2, B, 1.0, 2.2), win('e', 0.8, 3.8, B, 1.0, 2.2), win('n', 1.2, 4.2, B, 1.0, 2.2)] },
  door('D_guard', 'x', 7.8, 41.2, 42.8, B, 2.5, { depth: 0.2 }),
];

export const V = Object.fromEntries(VOIDS.map((v) => [v.id, v]));

/** Perimeter wall rectangle and its gates [a, b] along each side. */
export const PERIM = {
  x0: -44,
  x1: 44,
  z0: -36,
  z1: 48,
  h: 3.0,
  gates: { s: [[-3, 3], [4.4, 5.8]], w: [[18, 20]], e: [[-12, -8]] },
};
/** The outer boundary (the road and lanes outside the wall). */
export const OUTER = { x0: -52, x1: 52, z0: -42, z1: 58 };

/** Raised gardens and terraces (walkable, collide): [x0, z0, x1, z1, y, key]. */
export const TERRACES = [
  // front terrace over the basement and the garages (and the roof route)
  [-26.2, -0.2, 32, 10.2, G, 'paving_stone'],
  // west garden, both halves either side of its stair
  [-44, -16, -25.8, 0, G, 'lawn'],
  [-44, 0, -40, 10.2, G, 'lawn'],
  [-36, 0, -26.2, 10.2, G, 'lawn'],
];

/** Stairs in the open: the grand stair, the west garden stair, the roof stair. */
export const STAIRS = {
  grand: { x: 0, w: 8, zLow: 17.0, run: 0.34 }, // climbs north to the terrace edge z 10.2
  west: { x: -38, w: 4, zLow: 10.2, run: 0.5 }, // climbs north to z 0
  roof: { z: 2.25, w: 2.5, xLow: 42, run: 0.5 }, // climbs west to x 32
};

export const FOUNTAIN = { x: 0, z: 31, r: 3.4 };
export const PLAY = { x0: OUTER.x0, z0: OUTER.z0, x1: OUTER.x1, z1: OUTER.z1, y0: -1, y1: 12 };
