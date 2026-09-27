/**
 * HOLDING PATTERN — the plan, in LEVEL metres.
 *
 * Transcribed from §0 of docs/maps/HOLDING_PATTERN.md (the user's own floor
 * plan): x runs east, z runs SOUTH (down the plan image), y up, origin near the
 * middle of the terminal. Everything the builders place reads its numbers from
 * here, so a zone moves in one edit.
 *
 * Two deliberate departures from the §0 numbers, both forced by physics rather
 * than taste:
 *  - The airliner's centreline sits at z = 25 rather than ~17.5. At 17.5 its
 *    building-side wing would pass through the terminal; at 25 the wingtip
 *    stops a metre short of the concourse glass, which is the shot.
 *  - The Roundhouse moves south to (8, 46) for the same reason: the §0 spot is
 *    under the wing.
 *
 * WORLD PLACEMENT: the level is rotated a quarter turn (see LEVEL_YAW) so the
 * apron glazing faces the game's late-afternoon sun (azimuth ~280, WNW). That
 * is what puts the golden-hour key through the curtain wall and across the
 * terrazzo, and backlights the airliner seen from the gate.
 */

/** Level -> world yaw. Level +z (south, the apron) becomes world -x (west). */
export const LEVEL_YAW = -Math.PI / 2;

/** Main roof height (underside). */
export const ROOF_Y = 10;
/** Upper overlook deck, floor top. */
export const DECK_Y = 4.5;
/** Back-of-house ceiling height. */
export const LOW_CEIL = 3.8;
/** Exterior wall thickness. */
export const WALL_T = 0.4;

/**
 * The exterior outline, clockwise from the north-west corner. Each wall is
 * [x0, z0, x1, z1, kind, openings] where openings are [from, to] distances
 * along the wall (door gaps, 2.6 m tall) and kind is 'solid' | 'glass'.
 */
export const OUTLINE = [
  // north façade (landside): the main entrance bays in the entry hall
  [-22, -26, 38, -26, 'solid', [[-17.5, -14.5], [-11.5, -8.5]]],
  // service rooms, east side: the staff door onto the east apron
  [38, -26, 38, -8, 'solid', [[12.5, 14.3]]],
  // service rooms, south side: a door into the gap between service and gate
  [38, -8, 29, -8, 'solid', [[3.2, 4.8]]],
  // the gate's east glass: the jet-bridge door
  [29, -8, 29, 12, 'glass', [[15.6, 17.4]]],
  // the concourse and gate south glass, facing the airliner
  [29, 12, 1, 12, 'glass', []],
  // south hall east wall: apron doors
  [1, 12, 1, 23, 'solid', [[3.6, 6.0]]],
  // the angled south-east corner
  [1, 23, -3, 27, 'solid', []],
  // south hall and kitchen: baggage apron doors and the kitchen service door
  [-3, 27, -31, 27, 'solid', [[7.0, 10.0], [23.0, 24.6]]],
  // kitchen west: the south-west apron door
  [-31, 27, -31, 11, 'solid', [[6.0, 7.6]]],
  [-31, 11, -37, 11, 'solid', []],
  // food court west glazing
  [-37, 11, -37, -6, 'glass', []],
  [-37, -6, -22, -6, 'solid', []],
  [-22, -6, -22, -26, 'solid', []],
];

/**
 * Interior partitions: [x0, z0, x1, z1, height, openings, key]. Height is
 * the wall's top; openings as for OUTLINE (2.6 m high door gaps, or full-height
 * where the opening is wider than 3 m).
 */
export const PARTITIONS = [
  // Main Terminal / Security: the security queue opening
  [-2, -26, -2, -13, ROOF_Y, [[3.0, 7.5]], 'concrete_white'],
  // Security / Retail
  [7, -26, 7, -16, LOW_CEIL + 0.4, [[4.0, 5.6]], 'wall_paint'],
  // Retail / Service: the staff door (the flank)
  [27, -26, 27, -8, ROOF_Y, [[5.0, 6.6], [16.2, 18.0]], 'concrete_white'],
  // Retail back wall along the deck's north edge (full height above the deck)
  [7, -16, 27, -16, ROOF_Y, [[1.2, 2.8], [10.2, 11.8]], 'concrete_white'],
  // Food court / west hall: a wide colonnade opening
  [-22, -6, -22, 11, ROOF_Y, [[1.6, 15.4]], 'concrete_white'],
  // Food court / kitchen: the pass door
  [-31, 11, -22, 11, LOW_CEIL + 0.4, [[3.8, 5.4]], 'wall_paint'],
  // Kitchen / south hall
  [-21, 11, -21, 27, LOW_CEIL + 0.4, [[6.4, 8.2]], 'wall_paint'],
  // West hall + check-in / south hall: two wide openings and a door
  [-22, 11, 1, 11, ROOF_Y, [[2.5, 7.5], [13.0, 19.0], [20.6, 23.0]], 'concrete_white'],
  // Service corridor west wall is the Retail/Service partition; east rooms:
  [30.6, -26, 30.6, -8, LOW_CEIL + 0.4, [[2.0, 3.4], [8.2, 9.6], [13.4, 14.8]], 'wall_paint'],
  [30.6, -20.5, 38, -20.5, LOW_CEIL + 0.4, [], 'wall_paint'],
  [30.6, -14.8, 38, -14.8, LOW_CEIL + 0.4, [], 'wall_paint'],
];

/** Zones, for signage, lights, the minimap and the render's interior gate. */
export const ZONES = {
  mainTerminal: { x0: -22, z0: -26, x1: -2, z1: 11, label: 'MAIN TERMINAL' },
  security: { x0: -2, z0: -26, x1: 7, z1: -13, label: 'SECURITY' },
  retail: { x0: 7, z0: -26, x1: 27, z1: -10, label: 'RETAIL' },
  service: { x0: 27, z0: -26, x1: 38, z1: -8, label: 'SERVICE' },
  foodCourt: { x0: -37, z0: -6, x1: -22, z1: 11, label: 'FOOD COURT' },
  kitchen: { x0: -31, z0: 11, x1: -21, z1: 27, label: 'KITCHEN' },
  checkIn: { x0: -12, z0: -13, x1: -1, z1: 11, label: 'CHECK-IN' },
  escalators: { x0: 2, z0: -10, x1: 13, z1: -1, label: 'ESCALATORS' },
  concourse: { x0: 1, z0: -1, x1: 16, z1: 12, label: 'CONCOURSE' },
  gate: { x0: 16, z0: -10, x1: 29, z1: 12, label: 'GATE 12' },
  southHall: { x0: -21, z0: 11, x1: 1, z1: 27, label: 'ARRIVALS' },
};

/** The overlook deck over the retail band. */
export const DECK = { x0: 2.5, z0: -16, x1: 27, z1: -10, y: DECK_Y, t: 0.45 };

/** Escalator bank: rising north from the concourse to the deck edge. */
export const ESCALATORS = {
  zTop: -10,
  y: DECK_Y,
  slope: Math.PI / 6,
  // [x-centre, width, direction ('up'|'down'|'stair')]
  lanes: [
    [3.55, 1.1, 'up'],
    [4.85, 1.1, 'down'],
    [7.0, 2.4, 'stair'],
    [9.15, 1.1, 'up'],
    [10.45, 1.1, 'up'], // runs the wrong way; nobody mentions it
  ],
};

/** The deck's east stair down into the gate lounge. */
export const EAST_STAIR = { x: 25.8, w: 2.0, zTop: -10, steps: 15, rise: DECK_Y / 15, run: 0.36 };

/** Check-in double-height atria (skylights) and the concourse skylight band. */
export const SKYLIGHTS = [
  [-10.5, -11, 7, 7],
  [-10.5, 1.5, 7, 7],
  [3, -8, 12, 3],
  [3, 1, 24, 3],
  [3, 6.5, 24, 3],
  [-19, -22, 12, 2.5],
];

/** Gate 12: the desk (the objective), the boarding lane and the bridge door. */
export const GATE = {
  desk: { x: 21.6, z: -1.0, w: 3.6, d: 1.0 },
  lane: { x0: 20, x1: 29, z: 8.5, w: 2.2 },
};

/**
 * THE AIRLINER. Centreline z = FZ, nose east. Cabin floor y = 3.4, hold floor
 * y = 2.0. Cross-section is a superellipse (a slightly square-shouldered oval)
 * so the lower lobe is wide enough to crouch through.
 */
export const PLANE = {
  x0: 6, // tail tip
  x1: 51, // nose tip
  fz: 25,
  cy: 4.5, // section centre height
  ry: 2.6, // upper half-height
  ryLow: 2.8, // lower half-height (belly at 1.7)
  rz: 2.5, // half-width
  n: 2.4, // superellipse exponent
  floorY: 3.4,
  holdY: 2.0,
  // inner faces of the cabin sidewalls
  cabinZ0: 22.75,
  cabinZ1: 27.25,
  aisle: 1.0,
  aftBulkhead: 9.0,
  cockpitX: 45.0,
  noseWallX: 49.6,
  // doors: [x0, x1, side ('N' building side / 'S' apron side)]
  doorL1: [36.95, 38.05],
  doorSlide: [14.2, 15.2],
  cargoDoor: [10.0, 11.8],
  // aft hold (the cargo bay), with the hatch up into the aft galley
  hold: { x0: 8.8, x1: 18.0, z0: 22.4, z1: 27.6 },
  hatch: { x0: 9.6, x1: 11.6, z0: 24.5, z1: 25.5 },
  // rows: first/last seat-pan centres and pitch, with the overwing exit gap
  rowsAft: [12.7, 13.52],
  rowsMain: { from: 16.1, to: 35.0, pitch: 0.82 },
  frontGalley: [35.6, 39.6],
  wing: { rootX0: 18.0, rootX1: 27.0, tipX0: 15.8, tipX1: 18.8, span: 9.9, y: 2.7, dihedral: 0.09 },
};

/** Jet bridge: boarding door -> east, rotunda, then south to door L1. */
export const BRIDGE = {
  seg1: { x0: 29, x1: 36.6, z: 8.5, y0: 0, y1: 1.4 },
  rot: { x: 37.5, z: 8.5, r: 1.3, y: 1.4 },
  seg2: { x: 37.5, z0: 9.8, z1: 21.8, y0: 1.4, y1: 3.4 },
  inner: 1.9, // inside width
  wallH: 2.4,
};

/** The Roundhouse: a circular ground-service building on the apron. */
export const ROUNDHOUSE = { x: 8, z: 46, r: 8, h: 7.5 };

/** Playable exterior limits (the blocking volumes sit on these lines). */
export const PLAY = {
  x0: -40,
  x1: 80,
  z1: 60,
  // the east apron runs north beside the service rooms to z0
  eastZ0: -26,
  // landside kerb in front of the north façade
  kerb: { x0: -24, x1: 8, z0: -34 },
};
