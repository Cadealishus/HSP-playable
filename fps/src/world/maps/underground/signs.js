import { Y } from './layout.js';

/**
 * UNDERGROUND: the signage. Serious municipal wayfinding, a station closed in
 * 1998 "for a few weeks", and the stencils of whoever moved in afterwards.
 * `ry` 0 faces +z (south), PI faces north, PI/2 faces east, -PI/2 west.
 */
const P = Y.plat;
const H = Y.hall;
const S = Y.street;
const N = Math.PI;
const E = Math.PI / 2;
const W = -Math.PI / 2;

export function signList() {
  return [
    // --- street
    { x: -49.5, y: S + 4.25, z: -44.45, w: 5.4, h: 0.9, ry: N, style: 'name', lines: ['GRAND ARCADE'] },
    { x: -49.5, y: S + 3.25, z: -44.95, w: 3.2, h: 0.36, ry: N, style: 'metro', lines: ['LINE 4 · STATION CLOSED'] },
    { x: -52.45, y: S + 0.8, z: -45.6, w: 1.6, h: 0.5, ry: W, style: 'warn', lines: ['SERVICE SUSPENDED', 'UNTIL FURTHER NOTICE'], box: false },
    { x: -46.55, y: S + 0.8, z: -45.6, w: 1.6, h: 0.5, ry: E, style: 'warn', lines: ['NOTICE DATED 1998'], box: false },
    // --- ticket hall
    { x: -46, y: H + 3.6, z: -31.9, w: 4.4, h: 1.5, ry: 0, style: 'board', title: 'NEXT TRAIN', lines: ['LINE 4  EASTBOUND   —', 'LINE 4  WESTBOUND   —', 'SERVICE SUSPENDED SINCE 1998', 'WE APOLOGISE FOR THE DELAY'] },
    { x: -38, y: H + 3.4, z: -22, w: 3.4, h: 0.55, ry: N, two: true, style: 'metro', lines: ['TO ALL PLATFORMS  →'] },
    { x: -50, y: H + 3.2, z: -22.2, w: 2.6, h: 0.55, ry: 0, tilt: 0.34, style: 'dark', lines: ['WAY OUT'] },
    { x: -58.5, y: H + 3.35, z: -14.35, w: 3.6, h: 0.5, ry: N, style: 'dark', lines: ['TICKETS'] },
    { x: -30.05, y: H + 4.0, z: -14, w: 2.6, h: 0.5, ry: W, style: 'metro', lines: ['PLATFORMS A · B'] },
    { x: -44, y: H + 1.4, z: -31.95, w: 1.4, h: 0.9, ry: 0, style: 'warn', lines: ['THIS STATION', 'IS CLOSED'] },
    // --- platforms: name bars on both back walls, platform idents hanging
    { x: -8, y: P + 2.3, z: -13.97, w: 4.8, h: 0.75, ry: 0, style: 'name', lines: ['GRAND ARCADE'] },
    { x: 20, y: P + 2.3, z: -13.97, w: 4.8, h: 0.75, ry: 0, style: 'name', lines: ['GRAND ARCADE'] },
    { x: -14, y: P + 2.3, z: 7.97, w: 4.8, h: 0.75, ry: N, style: 'name', lines: ['GRAND ARCADE'] },
    { x: 14, y: P + 2.3, z: 7.97, w: 4.8, h: 0.75, ry: N, style: 'name', lines: ['GRAND ARCADE'] },
    { x: 8, y: P + 3.0, z: -10.2, w: 3.6, h: 0.5, ry: 0, two: true, style: 'metro', lines: ['PLATFORM A · EASTBOUND'] },
    { x: 8, y: P + 3.0, z: 3.9, w: 3.6, h: 0.5, ry: 0, two: true, style: 'metro', lines: ['PLATFORM B · WESTBOUND'] },
    { x: -12, y: P + 1.6, z: -10.64, w: 0.68, h: 0.9, ry: 0, style: 'warn', lines: ['STAND', 'BEHIND THE', 'YELLOW', 'LINE'] },
    { x: 24, y: P + 1.6, z: 4.64, w: 0.68, h: 0.9, ry: N, style: 'warn', lines: ['STAND', 'BEHIND THE', 'YELLOW', 'LINE'] },
    // --- staff doors
    { x: -2.9, y: P + 2.9, z: -13.97, w: 2.0, h: 0.34, ry: 0, style: 'warn', lines: ['STAFF ONLY'] },
    { x: 28.1, y: P + 2.9, z: -13.97, w: 2.0, h: 0.34, ry: 0, style: 'warn', lines: ['STAFF ONLY'] },
    { x: -6.3, y: P + 2.9, z: 7.97, w: 2.0, h: 0.34, ry: N, style: 'warn', lines: ['STAFF ONLY'] },
    { x: 22.1, y: P + 2.9, z: 7.97, w: 2.0, h: 0.34, ry: N, style: 'warn', lines: ['STAFF ONLY'] },
    { x: 7.1, y: P + 2.85, z: -17.37, w: 1.8, h: 0.45, ry: 0, style: 'warn', lines: ['DANGER', 'HIGH VOLTAGE'] },
    { x: -9.1, y: P + 2.85, z: 11.37, w: 1.8, h: 0.45, ry: N, style: 'warn', lines: ['DANGER', 'HIGHER VOLTAGE'] },
    { x: 26.1, y: P + 2.85, z: -17.37, w: 1.8, h: 0.34, ry: 0, style: 'stencil', lines: ['PUMP ROOM 2'] },
    { x: 6.9, y: P + 2.85, z: 11.37, w: 1.8, h: 0.34, ry: N, style: 'stencil', lines: ['MESS'] },
    { x: 18.9, y: P + 2.85, z: 11.37, w: 1.8, h: 0.34, ry: N, style: 'stencil', lines: ['STORES'] },
    // --- tunnels and deep level (stencils: the new tenants)
    { x: 46, y: 6.6, z: 1.66, w: 3.4, h: 0.5, ry: N, style: 'stencil', lines: ['SECTION 4-E · EMERGENCY LIGHTING ONLY'] },
    { x: 74, y: 8.1, z: 1.66, w: 2.6, h: 0.5, ry: N, style: 'stencil', lines: ['↓ DEEP LEVEL'] },
    { x: 83.68, y: Y.track + 3.8, z: -5, w: 3.4, h: 0.5, ry: W, style: 'stencil', lines: ['SECTION CLOSED 1998'] },
    { x: 26, y: 2.4, z: 21.02, w: 2.8, h: 0.45, ry: 0, style: 'stencil', lines: ['DEEP LEVEL · NO ENTRY'] },
    { x: 52, y: 3.5, z: 24.98, w: 3.0, h: 0.55, ry: N, style: 'stencil', color: '#c9b37a', lines: ['OPERATIONS'] },
    { x: 69.2, y: 3.1, z: 24.98, w: 2.2, h: 0.4, ry: N, style: 'stencil', color: '#c9b37a', lines: ['KNOCK'] },
    { x: 56, y: 5.2, z: 29.12, w: 5.0, h: 0.7, ry: 0, style: 'stencil', color: '#c9b37a', lines: ['COMMAND'] },
    { x: 56, y: 1.05, z: 46.68, w: 1.6, h: 0.3, ry: N, style: 'warn', lines: ['DO NOT TOUCH'] },
    { x: CFGEN(), y: 1.8, z: 55.95, w: 3.2, h: 0.45, ry: N, style: 'stencil', color: '#c9b37a', lines: ['GENERATOR (DO NOT TURN OFF)'] },
    { x: 77.97, y: 2.6, z: 44.6, w: 1.8, h: 0.4, ry: W, style: 'metro', lines: ['EXIT E-3'] },
    { x: 95.95, y: 2.3, z: 43.5, w: 1.6, h: 0.5, ry: W, style: 'warn', lines: ['LADDER 13 M', 'ONE AT A TIME'] },
  ];
}

function CFGEN() {
  return 73.5;
}
