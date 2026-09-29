/**
 * URBAN PLAZA (map id `town`) — multiplayer spawns and objective zones.
 *
 * LEVEL metres, the town's own frame (src/world/layout.js): the main street
 * runs along z, north (+z) to the barricade at z 47, south to the gate arch at
 * z -42.5 and the cross street beyond it. Format: src/world/maps/modes.js.
 *
 * ESF deploy from the north lane (between the north row and the back blocks);
 * the hostiles from the far cross street, either side of the gate arch so the
 * arch never frames one spawn from the other. Domination runs down the spine
 * of the street (north street, mid street, the south street) with the alleys
 * as the flanks; hardpoints rotate through the square, both alleys, the south
 * street and the roof of W1 (the exterior stair in the west alley).
 */
export const TOWN_MODES = {
  spawns: {
    esf: [
      [-3.0, 42.0, 0, -1, 'north barricade'],
      [3.4, 41.4, 0, -1, 'north street'],
      [-13.5, 40.8, 0.3, -1, 'north lane west'],
      [-22.0, 40.6, 0.5, -1, 'north lane far west'],
      [12.5, 42.0, -0.3, -1, 'north lane east'],
      [22.5, 37.0, -0.5, -1, 'north yard east'],
      [-30.0, 41.0, 0.6, -1, 'north-west lot'],
      [30.0, 38.5, -0.6, -1, 'north-east lot'],
    ],
    hostile: [
      [-12.0, -46.8, 0.2, 1, 'cross street west'],
      [-20.0, -47.0, 0.4, 1, 'cross street far west'],
      [12.5, -48.0, -0.2, 1, 'cross street east'],
      [20.0, -48.0, -0.4, 1, 'cross street far east'],
      [-30.0, -45.0, 0.5, 1, 'south-west lot'],
      [30.0, -47.0, -0.5, 1, 'south-east lot'],
      [-38.0, -48.0, 0.6, 1, 'west lot'],
      [40.0, -44.0, -0.6, 1, 'east lot'],
    ],
  },
  dom: {
    A: [-1.0, 21.5, 5.0, 'NORTH STREET'],
    B: [0.2, -11.0, 5.0, 'MID STREET'],
    C: [0.0, -27.5, 5.0, 'SOUTH STREET'],
  },
  hp: [
    [-0.5, 7.5, 5.5, 'THE SQUARE'],
    [-23.5, 22.4, 3.5, 'WEST ALLEY'],
    [0.0, -27.5, 5.0, 'SOUTH STREET'],
    [11.5, 4.6, 3.5, 'EAST ALLEY'],
    [-15.5, -10.2, 3.5, 'MID ALLEY'],
  ],
  sd: {
    A: [-23.5, 22.4, 2.5, 'WEST ALLEY'],
    B: [11.5, 4.6, 2.5, 'EAST ALLEY'],
    attackers: 'hostile',
  },
  survival: [0.2, 6.8, 7.0, 'THE SQUARE'],
  anchors: {},
};
