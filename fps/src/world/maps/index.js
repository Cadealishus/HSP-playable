/**
 * WORLD — the map registry.
 *
 * The world system builds exactly one map per page load. Which one comes from
 * `?map=<id>`, else the last choice the player made on the title screen
 * (localStorage), else `town`. Choosing a different map on the title screen
 * saves it and reloads the page with `?map=<id>`: a map is a whole level build
 * (geometry, collision, nav grid, prewarm), so a reload is the honest way to
 * swap one, and it keeps the capture harness deterministic.
 *
 * This module is plain data plus two tiny helpers, with no three.js in it, so
 * main.js can resolve the id before the engine boots and hand the list to the
 * title screen. Each map's builder is loaded lazily through `load()` so the
 * town never pays for the airport's code and vice versa.
 *
 * Entry shape:
 *   id              url / storage id
 *   name            the map's name ("HOLDING PATTERN")
 *   subtitle        where it is
 *   operation       the operation name the mission card, death card and
 *                   after-action report carry
 *   objectiveLabel  the one-line objective
 *   heldNoun        what Doug is holding, for Command's assessment ("The square")
 *   mission         [key, value] rows for the title's mission card
 *   preview         top-down minimap for the map card: a viewBox and a list of
 *                   [x, z, w, d, kind] rects in the map's own level metres
 *                   (x east, z south). kind: 'floor' | 'block' | 'apron' |
 *                   'plane' | 'objective'
 *   load()          -> Promise<module> with the map's `build*` entry point
 *                   (absent for `town`, which is the world system's own path)
 */

export const MAP_STORAGE_KEY = 'flopops.map';

export const MAPS = [
  {
    id: 'town',
    idx: '01',
    name: 'BORDER TOWN',
    subtitle: 'Border town · the square',
    operation: 'OPERATION TOTAL CONFIDENCE',
    objectiveLabel: 'Hold the town square for as long as it takes.',
    heldNoun: 'The square',
    mission: [
      ['LOCATION', 'Border town. The square in the middle of it.'],
      ['OBJECTIVE', 'Hold the town square for as long as it takes.'],
      ['DURATION', 'About a wave. (Command estimate.)'],
      ['PLAN', 'Phase one: hold the square. Phase two: Doug.'],
      ['ASSETS', 'Doug.'],
    ],
    // A main street running north-south with the market square a third of the
    // way down, blocks either side, the gate at the south end.
    preview: {
      box: [-40, -48, 80, 96],
      rects: [
        [-40, -48, 80, 96, 'apron'],
        [-6, -46, 12, 92, 'floor'],
        [-12, 2, 24, 14, 'floor'],
        [-34, -10, 40, 4, 'floor'],
        [-32, -44, 22, 30, 'block'],
        [10, -44, 22, 30, 'block'],
        [-32, -6, 20, 8, 'block'],
        [14, -6, 18, 8, 'block'],
        [-32, 18, 22, 26, 'block'],
        [10, 18, 22, 26, 'block'],
        [-2.2, 7.4, 3, 3, 'objective'],
      ],
    },
  },
  {
    id: 'airport',
    idx: '02',
    name: 'HOLDING PATTERN',
    subtitle: 'Port Ellery International · Gate 12',
    operation: 'OPERATION CARRY-ON',
    objectiveLabel: 'Hold Gate 12. Boarding will not complete.',
    heldNoun: 'Gate 12',
    mission: [
      ['LOCATION', 'Port Ellery International. Gate 12. The airport is closed.'],
      ['OBJECTIVE', 'Hold Gate 12 until boarding completes.'],
      ['DURATION', 'Boarding will not complete.'],
      ['PLAN', 'Phase one: hold the gate. Phase two: remain seated.'],
      ['ASSETS', 'Doug. One (1) airliner, parked.'],
    ],
    // The §0 plan: terminal zones, the west food-court wing, the airliner
    // alongside the south-east edge, the Roundhouse on the apron.
    preview: {
      box: [-42, -30, 124, 92],
      rects: [
        [-42, -30, 124, 92, 'apron'],
        [-22, -26, 60, 18, 'floor'],
        [-37, -6, 15, 17, 'floor'],
        [-22, -8, 51, 20, 'floor'],
        [-31, 11, 10, 15, 'floor'],
        [-21, 11, 22, 16, 'floor'],
        [27, -26, 11, 18, 'block'],
        [7, -26, 20, 10, 'block'],
        [6, 21.5, 45, 5, 'plane'],
        [18, 12, 9, 25, 'plane'],
        [29, 7.5, 9, 2, 'floor'],
        [37, 7.5, 2, 14, 'floor'],
        [-2, 38, 16, 16, 'block'],
        [20.5, -2.5, 3, 3, 'objective'],
      ],
    },
    load: () => import('./airport/index.js'),
  },
  {
    id: 'underground',
    idx: '03',
    name: 'UNDERGROUND',
    subtitle: 'Grand Arcade station · Line 4 (closed)',
    operation: 'OPERATION LAST TRAIN',
    objectiveLabel: 'Hold Platform A. The train is not coming.',
    heldNoun: 'Platform A',
    lighting: 'underground',
    modes: ['tdm', 'dom', 'hp', 'sd', 'survival'],
    mission: [
      ['LOCATION', 'Grand Arcade. Closed in 1998 for "a few weeks".'],
      ['OBJECTIVE', 'Hold Platform A.'],
      ['DURATION', 'Until the next train. (See: LOCATION.)'],
      ['PLAN', 'Phase one: go downstairs. Phase two: Doug.'],
      ['ASSETS', 'Doug. The stairs.'],
    ],
    // Street and hall in the north-west, the station box across the middle,
    // the east tunnel, and the command facility in the south-east.
    preview: {
      box: [-66, -58, 162, 114],
      rects: [
        [-66, -58, 162, 114, 'apron'],
        [-66, -58, 28, 14, 'floor'],
        [-62, -32, 32, 20, 'floor'],
        [-20, -14, 60, 22, 'floor'],
        [-44, -8, 128, 10, 'floor'],
        [-16, 8.4, 52, 3, 'floor'],
        [-10, -17.4, 46, 3, 'floor'],
        [24, 21, 52, 4, 'floor'],
        [72, 2, 4, 19, 'floor'],
        [34, 29, 44, 27, 'floor'],
        [78, 36, 18, 11, 'floor'],
        [1, -7.6, 32.8, 3, 'plane'],
        [46, -7.6, 32.8, 3, 'plane'],
        [2, -25, 31, 7.2, 'block'],
        [-14, 11.8, 39, 7.2, 'block'],
        [8.5, -12.5, 3, 3, 'objective'],
      ],
    },
    load: () => import('./underground/index.js'),
  },
];

/** Registry entry for an id, or null. */
export function getMap(id) {
  for (const m of MAPS) if (m.id === id) return m;
  return null;
}

/**
 * The active map id: `?map=` wins, then the stored choice, then `town`. Every
 * storage access is wrapped: a private window or a blocked site-data policy
 * throws on the accessor itself, and the game must still boot.
 */
export function resolveMapId(params) {
  let id = null;
  try {
    id = params?.get?.('map') ?? null;
  } catch {
    id = null;
  }
  if (!getMap(id)) {
    // Capture runs never read the stored choice: a shot must render the same
    // map on every machine, whatever the last human picked.
    let capture = false;
    try {
      capture = params?.get?.('capture') === '1';
    } catch {
      capture = false;
    }
    id = null;
    if (!capture) {
      try {
        id = globalThis.localStorage?.getItem(MAP_STORAGE_KEY) ?? null;
      } catch {
        id = null;
      }
    }
  }
  return getMap(id) ? id : 'town';
}

/** Remember the choice and reload onto it. */
export function switchMap(id) {
  if (!getMap(id)) return false;
  try {
    globalThis.localStorage?.setItem(MAP_STORAGE_KEY, id);
  } catch {
    /* storage blocked: the URL still carries the choice */
  }
  try {
    const url = new URL(location.href);
    url.searchParams.set('map', id);
    location.assign(url.toString());
  } catch {
    return false;
  }
  return true;
}
