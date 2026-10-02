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
  // FLIGHT 717 (mission `flight717`, src/game/missions/flight717.js). Level
  // metres [x, y, z] or [x, y, z, faceX, faceZ]; lists publish as arrays. The
  // cabin floor is y 3.4 (layout.js PLANE.floorY), the bridge rises 0 -> 3.4.
  anchors: {
    kerbStart: [-13.0, 0, -31.0, 0, 1],
    entryHall: [-13.0, 0, -21.0, 0, 1],
    checkIn: [-6.0, 0, -5.0, 1, 0],
    gateDesk: [21.6, 0, -1.0],
    gateLounge: [23.0, 0, 3.0, 1, 0.4],
    bridgeDoor: [29.0, 0, 8.5, 1, 0],
    bridgeRotunda: [37.5, 1.4, 8.5, 0, 1],
    doorL1: [37.5, 3.4, 22.2, 0, 1],
    cargoHatch: [10.6, 3.4, 25.0, 1, 0],
    cabinAft: [12.5, 3.4, 25.0, 1, 0],
    cabinMid: [25.0, 3.4, 25.0, 1, 0],
    cabinFront: [37.0, 3.4, 25.0, 1, 0],
    cockpit: [47.0, 3.4, 25.0, -1, 0],
    // the cabin volume (aft bulkhead to cockpit, wall to wall), two corners
    cabinMin: [8.8, 2.9, 22.75],
    cabinMax: [45.2, 6.2, 27.25],
    // hostile posts out of the approach sightlines: security lanes, the check-in
    // counters, the west hall, the food court
    terminalPosts: [
      [4.0, 0, -15.5, -1, 0],
      [-5.0, 0, -1.5, 0, -1],
      [-18.0, 0, 4.0, 0, -1],
      [-28.0, 0, 2.0, 1, 0],
    ],
    // the gate: lounge north end, behind the desk, the overlook deck, the
    // service corridor (flank), the boarding lane
    gatePosts: [
      [24.5, 0, -7.0, -1, 0],
      [26.5, 0, 3.5, -1, 0],
      [13.0, 4.5, -13.0, 0, 1],
      [33.5, 0, -11.0, 0, 1],
      [21.0, 0, 9.0, -1, 0],
    ],
    // in the jet bridge, round the rotunda's corner
    bridgePost: [37.5, 2.35, 15.5, 0, -1],
    // the aisle and galleys of the cabin
    cabinPosts: [
      [11.0, 3.4, 23.6, 1, 0],
      [16.5, 3.4, 25.0, 1, 0],
      [25.5, 3.4, 25.0, -1, 0],
      [33.5, 3.4, 25.0, -1, 0],
      [38.5, 3.4, 24.6, 0, -1],
    ],
    // window seats (passengers keep their heads down), rows 2..23
    cabinSeats: [
      [16.92, 3.4, 23.68, 1, 0],
      [19.38, 3.4, 26.32, 1, 0],
      [21.84, 3.4, 23.68, 1, 0],
      [23.48, 3.4, 26.32, 1, 0],
      [25.94, 3.4, 23.68, 1, 0],
      [28.40, 3.4, 26.32, 1, 0],
      [30.04, 3.4, 23.68, 1, 0],
      [31.68, 3.4, 26.32, 1, 0],
      [33.32, 3.4, 23.68, 1, 0],
      [34.96, 3.4, 26.32, 1, 0],
    ],
    galleyCrew: [38.8, 3.4, 26.4, -1, 0],
    pilotSpot: [46.4, 3.4, 25.0, -1, 0],
  },
};
