/**
 * ESTATE: the surface palette. A hillside villa-embassy: warm limestone
 * plaster, travertine floors, timber in the private rooms, clipped box hedges.
 * Shared prop keys (cabinets, crates, sandbags...) fall through to the
 * UNDERGROUND palette (see estate/index.js).
 */
export const ES_PALETTE = {
  // --------------------------------------------------------------- ground --
  lawn: { name: 'foliage', surface: 'foliage', opts: { vertexMasks: true, tint: 0x4d6a3a, scale: 1.6, roughness: [0.9, 0, 0.4] } },
  gravel_drive: { name: 'gravel', surface: 'dirt', opts: { vertexMasks: true, tint: 0xa39a8a, scale: 1.4 } },
  paving_stone: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xb3aa98, scale: 2.8, detile: 0.5, roughness: [0.7, 0, 0.2], weather: [0.3, 0.2, 0.3, 0.5] },
  },
  road_lane: { name: 'asphalt', surface: 'concrete', opts: { vertexMasks: true, tint: 0x5c5953, scale: 3.0, wear: [0, 0.5, 0.45, 0] } },
  soil_bed: { name: 'dirt', surface: 'dirt', opts: { vertexMasks: true, tint: 0x5a4a3a, scale: 1.0 } },
  hedge: { name: 'foliage', surface: 'foliage', opts: { vertexMasks: true, tint: 0x3a5530, scale: 0.9 } },
  water_pool: {
    name: 'glass',
    surface: 'water',
    opts: { scale: 2.0, roughness: [0.08, 0.02], three: { color: 0x1c2a2e, transparent: false, opacity: 1, depthWrite: true, envMapIntensity: 1.6 } },
  },

  // ---------------------------------------------------------- architecture --
  villa_plaster: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xd9ccb2, scale: 2.4, weather: [0.25, 0.3, 0.6, 0.45] },
  },
  villa_stone: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xb9ab90, scale: 1.6, weather: [0.3, 0.35, 0.5, 0.5], patch: [0.2, 2.2, 0.08, -0.04] },
  },
  perimeter_wall: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xc8b898, scale: 2.2, weather: [0.35, 0.45, 1.0, 0.55] },
  },
  interior_paint: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xe2dccd, scale: 2.0, weather: [0.05, 0.05, 0.1, 0.25] },
  },
  interior_green: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x8e9c86, scale: 2.0, weather: [0.05, 0.05, 0.1, 0.25] },
  },
  service_wall: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xb4b2aa, scale: 2.0, weather: [0.2, 0.35, 0.3, 0.5] },
  },
  travertine: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xcfc3a8, scale: 1.8, detile: 0.5, roughness: [0.35, 0, 0.08], weather: [0.05, 0, 0, 0.25] },
  },
  parquet: { name: 'wood', surface: 'wood', opts: { vertexMasks: true, tint: 0x8a6444, scale: 0.9, roughness: [0.55, 0, 0.15] } },
  carpet_red: { name: 'fabric', surface: 'fabric', opts: { vertexMasks: true, tint: 0x6a2a26, scale: 0.6 } },
  kitchen_tile: {
    name: 'tile',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x9a968e, scale: 0.8, roughness: [0.45, 0, 0.1], weather: [0.1, 0.05, 0.05, 0.3] },
  },
  ceiling_white: { name: 'plaster', surface: 'plaster', opts: { vertexMasks: true, tint: 0xd6d2c8, scale: 2.6, weather: [0.02, 0.02, 0, 0.15] } },
  roof_tile: { name: 'brick', surface: 'concrete', opts: { vertexMasks: true, tint: 0x8a4a34, scale: 0.9, weather: [0.35, 0.3, 0.2, 0.5] } },
  roof_flat: { name: 'concrete', surface: 'concrete', opts: { vertexMasks: true, tint: 0x8e8a82, scale: 3.0, weather: [0.4, 0.4, 0.3, 0.5] } },
  dark_timber: { name: 'wood', surface: 'wood', opts: { vertexMasks: true, tint: 0x4a3222, scale: 0.8 } },
  window_frame: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x2e302f, scale: 0.8 } },
  gate_black: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x1f2122, scale: 0.8, roughness: [0.6, 0, 0.2] } },
  garage_door: { name: 'corrugated', surface: 'metal', opts: { vertexMasks: true, tint: 0xa9a59c, scale: 1.2 } },
  brass: { name: 'metal_brushed', surface: 'metal', opts: { vertexMasks: true, tint: 0xb89a5a, scale: 0.6 } },

  // --------------------------------------------------------------- props --
  sofa_fabric: { name: 'fabric', surface: 'fabric', opts: { vertexMasks: true, tint: 0x5a5448, scale: 0.4 } },
  bed_linen: { name: 'fabric', surface: 'fabric', opts: { vertexMasks: true, tint: 0xcfc8b8, scale: 0.4 } },
  car_black: { name: 'metal_painted', surface: 'metal', opts: { vertexMasks: true, tint: 0x16181a, scale: 1.2, roughness: [0.35, 0, 0.08] } },
  bark: { name: 'wood', surface: 'wood', opts: { vertexMasks: true, tint: 0x4d3b2c, scale: 0.5 } },
  tree_leaves: { name: 'foliage', surface: 'foliage', opts: { vertexMasks: true, tint: 0x3f5a34, scale: 0.8 } },

  // ------------------------------------------------------------ emissive --
  /** Warm interior practical (lamp shades, pendants). */
  lamp_interior: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.4, tint: 0xfff0d8, three: { emissive: 0xffc88a, emissiveIntensity: 7, toneMapped: true } },
  },
  /** Exterior floodlight lens. */
  flood_lens: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xf4f4ee, three: { emissive: 0xfff4e0, emissiveIntensity: 12, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Floods that only come on with the alarm. */
  flood_alarm: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xf2f4f6, three: { emissive: 0xf0f6ff, emissiveIntensity: 0, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Garden path bollards / wall uplights: warm, low. */
  garden_lamp: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xffe8c8, three: { emissive: 0xffc27a, emissiveIntensity: 5, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** Security monitors. */
  screen_sec: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.6, three: { color: 0x0a0e12, emissive: 0x6a8aa8, emissiveIntensity: 1.4, transparent: false, opacity: 1, depthWrite: true } },
  },
  /** The alarm panel status lamp: green when quiet, red on alarm. */
  alarm_led: {
    name: 'glass',
    surface: 'glass',
    opts: { scale: 0.3, tint: 0xc0ffc0, three: { emissive: 0x30ff60, emissiveIntensity: 5, transparent: false, opacity: 1, depthWrite: true } },
  },
};
