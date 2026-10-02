/**
 * INDUSTRIAL YARD — multiplayer spawns and objective zones (level metres;
 * format: src/world/maps/modes.js). Point-symmetric like the yard itself:
 * every hostile entry is the ESF one turned 180 degrees about the origin.
 */
const esf = [
  [-61, -46, 1, 0, 'truck park north'],
  [-60, -28, 1, 0.1, 'weighbridge'],
  [-62, -10, 1, 0, 'haul road north'],
  [-62, 4, 1, 0, 'haul road'],
  [-61, 16, 1, -0.1, 'trailer park'],
  [-60, 30, 1, 0, 'gatehouse'],
  [-58, 48, 1, 0, 'south alley mouth'],
];
const mirror = ([x, z, fx, fz, tag, y]) => [-x, -z, -fx, -fz, tag, y];
const tags = ['rail siding south', 'tank lane', 'haul road south', 'haul road east', 'reefer park', 'east gate', 'north alley mouth'];

export const INDUSTRIAL_MODES = {
  spawns: {
    esf,
    hostile: esf.map((s, i) => {
      const m = mirror(s);
      m[4] = tags[i];
      return m;
    }),
  },
  dom: {
    A: [-16, -34, 4.5, 'BONDED STORE', 1.2],
    B: [0, 0, 5.5, 'GANTRY'],
    C: [16, 34, 4.5, 'COLD STORE', 1.2],
  },
  hp: [
    [0, 0, 5.5, 'GANTRY'],
    [-16, -34, 4.5, 'BONDED STORE', 1.2],
    [26, -31, 4.5, 'TANK FARM'],
    [16, 34, 4.5, 'COLD STORE', 1.2],
    [-26, 31, 4.5, 'SCALE YARD'],
  ],
  sd: {
    A: [-10.5, -33.5, 2.5, 'BONDED STORE', 1.2],
    B: [-33.5, 12.5, 2.5, 'STACKS'],
    attackers: 'hostile',
  },
  survival: [0, 0, 6.0, 'GANTRY'],
  anchors: {},
};
