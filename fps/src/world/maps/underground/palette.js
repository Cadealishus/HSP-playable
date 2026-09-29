/**
 * UNDERGROUND: the surface palette. Same contract as src/world/palette.js.
 *
 * Readability in the dark: floors mid-value, walls a stop lighter (white tile
 * holds the little light there is), cover darker than both. Everything that
 * glows is its own key so `setPower()` can drive its material without touching
 * anything else in the level.
 */
const WET = [0.1, 0, 0.03];

export const UG_PALETTE = {
  // --------------------------------------------------------------- floors --
  platform_tile: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8e8a82, scale: 1.2, detile: 0.5, roughness: [0.55, 0, 0.1], weather: [0.35, 0.1, 0.2, 0.55], wear: [0, 0.6, 0.5, 0] },
  },
  hall_floor: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x7d766c, scale: 2.4, detile: 0.5, roughness: [0.5, 0, 0.1], weather: [0.35, 0.1, 0.2, 0.55], wear: [0, 0.6, 0.5, 0] },
  },
  service_floor: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x77736b, scale: 3.0, roughness: [0.75, 0, 0.2], weather: [0.4, 0.1, 0.3, 0.6] },
  },
  /** Standing water / leak-soaked concrete: dark, near-mirror. */
  wet_floor: {
    name: 'concrete_floor',
    surface: 'water',
    opts: { vertexMasks: true, tint: 0x3a3833, scale: 2.2, roughness: WET, weather: [0.1, 0, 0, 0.2] },
  },
  puddle: {
    name: 'concrete_floor',
    surface: 'water',
    opts: { tint: 0x2a2926, scale: 1.4, roughness: [0.05, 0, 0.02], three: { envMapIntensity: 2.2 } },
  },
  ballast: { name: 'gravel', surface: 'dirt', opts: { vertexMasks: true, tint: 0x6d675e, scale: 1.1 } },
  track_bed: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x5e5a53, scale: 3.0, roughness: [0.85, 0, 0.3], weather: [0.5, 0.2, 0.3, 0.7] },
  },
  threshold: { name: 'metal_brushed', surface: 'metal', opts: { vertexMasks: true, tint: 0x9a9690, scale: 0.8 } },
  stair_tread: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8c877d, scale: 1.4, weather: [0.35, 0.1, 0.2, 0.6] },
  },
  street_paving: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x7f7b73, scale: 2.2, detile: 0.5, roughness: [0.35, 0, 0.06], weather: [0.3, 0.2, 0.2, 0.5] },
  },
  street_asphalt: {
    name: 'asphalt',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x55524d, scale: 3.0, roughness: [0.4, 0, 0.08], wear: [0, 0.5, 0.45, 0] },
  },

  // ---------------------------------------------------------------- walls --
  /** Cream subway tile, grimy: the station box and the ticket hall. */
  wall_tile: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xbdb6a2, scale: 0.6, roughness: [0.45, 0, 0.1], weather: [0.3, 0.55, 0.4, 0.75] },
  },
  /** The dark green dado band. */
  wall_tile_band: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x2e4a3e, scale: 0.6, roughness: [0.45, 0, 0.1], weather: [0.3, 0.5, 0.4, 0.7] },
  },
  tunnel_concrete: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x6f6b64, scale: 3.2, weather: [0.5, 0.7, 0.5, 0.8], patch: [0.25, 2.6, 0.1, -0.05] },
  },
  blockwork: {
    name: 'brick',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8d8a84, scale: 1.1, weather: [0.35, 0.5, 0.4, 0.6] },
  },
  service_paint: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x9aa39b, scale: 2.0, weather: [0.35, 0.6, 0.6, 0.7] },
  },
  facility_wall: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8a8880, scale: 2.4, weather: [0.25, 0.4, 0.3, 0.5] },
  },
  ceiling_ug: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x55524c, scale: 3.0, weather: [0.2, 0.4, 0, 0.5] },
  },
  facade_brick: {
    name: 'brick',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x7a5a48, scale: 1.4, weather: [0.35, 0.4, 0.6, 0.6] },
  },
  rubble: { name: 'concrete', surface: 'concrete', opts: { vertexMasks: true, tint: 0x807b72, scale: 0.8 } },

  // ---------------------------------------------------------------- props --
  edge_yellow: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xc9a23a, scale: 0.8, roughness: [0.7, 0, 0.3], wear: [0, 0.8, 0.6, 0] },
  },
  rail_steel: { name: 'metal_brushed', surface: 'metal', opts: { vertexMasks: true, tint: 0x8a8580, scale: 0.6, roughness: [0.6, 0, 0.2] } },
  sleeper: { name: 'concrete', surface: 'concrete', opts: { vertexMasks: true, tint: 0x6a665f, scale: 0.6 } },
  pipe_paint: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x5c6a5a, scale: 0.8, weather: [0.4, 0.6, 0.4, 0.7] } },
  pipe_red: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x7a2a22, scale: 0.8, weather: [0.4, 0.6, 0.4, 0.7] } },
  cabinet_grey: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x6e726f, scale: 0.8, weather: [0.35, 0.5, 0.4, 0.6] } },
  cabinet_olive: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x4d5440, scale: 0.8, weather: [0.35, 0.5, 0.4, 0.6] } },
  crate_green: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x3e4a36, scale: 0.7 } },
  gate_steel: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x55595c, scale: 0.8, weather: [0.3, 0.4, 0.3, 0.5] } },
  /** Train body: silver with a blue band. */
  train_body: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0xa7aaac, scale: 1.6, roughness: [0.6, 0, 0.15], weather: [0.4, 0.5, 0.3, 0.6] },
  },
  train_band: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x2c3f66, scale: 1.2, roughness: [0.6, 0, 0.2] } },
  train_floor: { name: 'rubber', surface: 'rubber', opts: { vertexMasks: true, tint: 0x4a4744, scale: 0.6 } },
  train_panel: { name: 'metal_painted', surface: 'plaster', opts: { vertexMasks: true, tint: 0xc8c4b8, scale: 1.0, roughness: [0.7, 0, 0.3] } },
  train_seat: { name: 'fabric', surface: 'fabric', opts: { vertexMasks: true, tint: 0x5a3b35, scale: 0.35 } },
  train_glass: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 1.0, roughness: [0.25, 0.04], three: { color: 0x1c2126, transparent: false, opacity: 1, depthWrite: true, envMapIntensity: 1.2 } },
  },
  wood_bench: { name: 'wood', surface: 'wood', opts: { vertexMasks: true, tint: 0x6b4a32, scale: 0.8 } },
  tarp_blue: { name: 'fabric', surface: 'fabric', opts: { vertexMasks: true, tint: 0x2e4a66, scale: 0.8 } },
  sandbag: { name: 'burlap', surface: 'fabric', opts: { vertexMasks: true, tint: 0x8a7a5c, scale: 0.5 } },
  cable_black: { name: 'rubber', surface: 'rubber', opts: { vertexMasks: true, tint: 0x222222, scale: 0.4 } },

  // ------------------------------------------------------------- emissive --
  // Each glowing key is unique (its own tint) so the material is its own cache
  // entry: setPower() drives emissiveIntensity on these and nothing else moves.
  /** Fluorescent tube, mains. */
  tube_white: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xf2f5f6, three: { emissive: 0xdfeaf5, emissiveIntensity: 4.2, toneMapped: true } },
  },
  /** Two independently failing tube batches. */
  tube_flicker_a: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xf1f5f6, three: { emissive: 0xdce8f0, emissiveIntensity: 4.2, toneMapped: true } },
  },
  tube_flicker_b: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xf0f4f6, three: { emissive: 0xe2ecf2, emissiveIntensity: 4.2, toneMapped: true } },
  },
  /** Emergency bulkhead lamp: red. */
  lamp_red_ug: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xff6a5a, three: { emissive: 0xff2a12, emissiveIntensity: 6, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Caged work lamp: warm tungsten (command facility, maintenance). */
  lamp_work: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xffe4c0, three: { emissive: 0xffc27a, emissiveIntensity: 8, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Street sodium lamp head. */
  lamp_sodium: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xffd9a0, three: { emissive: 0xffa040, emissiveIntensity: 10, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Command-facility screens: cold green-blue glow. */
  screen_cf: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.6, three: { color: 0x0a1012, emissive: 0x3aa890, emissiveIntensity: 1.6, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Status LEDs on racks and panels. */
  led_amber: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.3, tint: 0xffc070, three: { emissive: 0xffa020, emissiveIntensity: 6, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Electrical arc glow at the broken junction box. */
  arc_blue: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.3, tint: 0xd8e8ff, three: { emissive: 0x9cc4ff, emissiveIntensity: 0, transparent: false, opacity: 1, depthWrite: true } },
  },
};
