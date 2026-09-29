/**
 * HOLDING PATTERN (map id `airport`) — multiplayer spawns and objective zones.
 *
 * LEVEL metres, the plan's frame (layout.js): x east, z south. Format:
 * src/world/maps/modes.js.
 *
 * ESF deploy landside (the kerb and the entry hall, behind the solid north
 * façade); the hostiles airside, across the apron south and east of the
 * airliner. Domination: A in check-in, B in the gate lounge, C on the stand
 * under the airliner's tail. Search & Destroy is a terminal defence: the
 * hostiles attack from the apron into the food court (A) or the retail band
 * under the overlook (B).
 */
export const AIRPORT_MODES = {
  spawns: {
    esf: [
      [-13.0, -30.5, 0.1, 1, 'kerb doors'],
      [-3.0, -31.0, -0.1, 1, 'kerb east'],
      [-19.5, -23.0, 0.4, 1, 'entry hall west'],
      [-8.0, -23.0, 0.2, 1, 'entry hall'],
      [11.0, -23.5, 0.3, 1, 'retail'],
      [20.0, -23.5, -0.2, 1, 'retail east'],
      [3.0, -30.0, -0.3, 1, 'kerb far east'],
    ],
    hostile: [
      [-20.0, 50.0, 0.3, -1, 'south apron west'],
      [-4.0, 54.0, 0.2, -1, 'service road'],
      [22.0, 55.0, 0, -1, 'service road east'],
      [45.0, 50.0, -0.4, -1, 'stand 13'],
      [68.0, 36.0, -0.7, -0.7, 'east apron south'],
      [70.0, 6.0, -1, -0.2, 'east apron'],
      [58.0, 56.0, -0.6, -1, 'east service road'],
    ],
  },
  dom: {
    A: [-7.0, -3.0, 5.0, 'CHECK-IN'],
    B: [21.0, 4.0, 5.0, 'GATE 12'],
    C: [18.0, 38.0, 5.5, 'STAND 12'],
  },
  hp: [
    [21.5, 2.0, 5.0, 'GATE 12'],
    [-7.0, -3.0, 5.0, 'CHECK-IN'],
    [5.0, 40.0, 5.0, 'BAGGAGE APRON'],
    [-29.5, 2.5, 5.0, 'FOOD COURT'],
    [-8.0, 22.0, 5.0, 'ARRIVALS'],
  ],
  sd: {
    A: [-29.0, 3.0, 2.5, 'FOOD COURT'],
    B: [16.0, -20.5, 2.5, 'RETAIL'],
    attackers: 'hostile',
  },
  survival: [21.6, -1.0, 4.0, 'GATE 12'],
  anchors: {},
};
