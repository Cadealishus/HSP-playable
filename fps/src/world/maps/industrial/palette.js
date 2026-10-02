import { YARD_PALETTE, painted, ribbed } from '../yardkit.js';

/**
 * INDUSTRIAL YARD — surfaces. Same contract as src/world/palette.js; the map's
 * Assembler looks here first, then the airport palette, then the town's.
 * Readability: yard floor mid-grey, containers saturated but dusty, warehouse
 * cladding a stop lighter than the floor, safety yellow only on the things you
 * climb.
 */
export const INDUSTRIAL_PALETTE = {
  ...YARD_PALETTE,
  yard_concrete: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: {
      vertexMasks: true,
      tint: 0xa19d95,
      scale: 5.0,
      detile: 0.45,
      roughness: [0.9, 0, 0.3],
      weather: [0.45, 0.1, 0.15, 0.45],
      wear: [0, 0.55, 0.5, 0],
    },
  },
  yard_asphalt: {
    name: 'asphalt',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x75716a, scale: 3.4, detile: 0.6, wear: [0, 0.6, 0.5, 0] },
  },
  oil_stain: {
    name: 'asphalt',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x3a3733, scale: 1.4, roughness: [0.5, 0, 0.2] },
  },
  dock_concrete: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x9b968c, scale: 2.4, weather: [0.35, 0.5, 0.45, 0.5] },
  },
  wh_floor: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8d8a84, scale: 4.0, roughness: [0.65, 0, 0.25], weather: [0.2, 0.3, 0.3, 0.4] },
  },
  cladding: ribbed(0x9aa1a3),
  cladding_blue: ribbed(0x4a6076),
  roof_sheet: ribbed(0x6f7374),
  brick_yard: { name: 'brick', surface: 'concrete', opts: { vertexMasks: true, scale: 1.1, tint: 0xa0776a } },
  pipe_silver: { name: 'metal_brushed', surface: 'metal', opts: { vertexMasks: true, scale: 1.1 } },
  pipe_green: painted(0x4b6650),
  pipe_red: painted(0x86352a),
  pipe_ochre: painted(0x9b7a3a),
  tank_white: painted(0xc8c4b8, { scale: 3 }),
  rack_orange: painted(0xb2582a),
  rack_blue: painted(0x2f4f78),
  shutter: ribbed(0x80868a),
  crane_yellow: painted(0xc8a032, { scale: 2 }),
  office_panel: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xb9b5aa, scale: 1.8, weather: [0.2, 0.3, 0.3, 0.4] },
  },
  /** Translucent roof lights and the site office's window. */
  glazing: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 3.0, roughness: [0.4, 0.05], three: { opacity: 0.35, envMapIntensity: 1.2, color: 0xe8eee8 } },
  },
  light_panel: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xfff2dc, three: { emissive: 0xffd8a8, emissiveIntensity: 5, toneMapped: true } },
  },
};
