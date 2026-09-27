/**
 * HOLDING PATTERN — the airport's surface palette.
 *
 * Same contract as src/world/palette.js (a named variant of a `materials`
 * library surface, an ARCHITECTURE.md physics tag, and a linear tint that keeps
 * albedo inside 0.02-0.9), kept separate so the airport and the town can each
 * change their look without touching the other. The airport's Assembler looks
 * keys up here first and falls back to the town palette for anything shared.
 *
 * Readability rule from the design doc: floors mid-value, cover darker or
 * lighter than the floor, never the same value.
 */
export const AIRPORT_PALETTE = {
  // --------------------------------------------------------------- floors --
  /** Polished terrazzo: big tiles, low roughness so SSR picks up the glazing. */
  terrazzo: {
    name: 'tile',
    surface: 'concrete',
    opts: {
      vertexMasks: true,
      tint: 0xc9c2b4,
      scale: 4.0,
      detile: 0.5,
      roughness: [0.42, -0.04, 0.07],
      weather: [0.18, 0.05, 0.1, 0.3],
      wear: [0, 0.4, 0.4, 0],
    },
  },
  /** The dark inlay bands in the terrazzo (the "+" in the entry hall). */
  terrazzo_dark: {
    name: 'tile',
    surface: 'concrete',
    opts: {
      vertexMasks: true,
      tint: 0x5b5a57,
      scale: 1.2,
      roughness: [0.4, -0.04, 0.07],
      weather: [0.15, 0.05, 0.1, 0.3],
      wear: [0, 0.4, 0.4, 0],
    },
  },
  /** Back-of-house floors: sealed concrete. */
  floor_sealed: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8f8b84, scale: 3.0, roughness: [0.7, 0, 0.2] },
  },
  /** Cabin and lounge carpet: worn blue-grey. */
  carpet: {
    name: 'fabric',
    surface: 'fabric',
    opts: { vertexMasks: true, tint: 0x4e5866, scale: 0.6, weather: [0.2, 0.1, 0.2, 0.4] },
  },

  // ---------------------------------------------------------- architecture --
  /** Off-white board-marked concrete: columns, core walls. */
  concrete_white: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xc4bfb5, scale: 2.4, weather: [0.2, 0.25, 0.3, 0.35] },
  },
  /** Sandstone cladding on the lower walls and column bases. */
  sandstone: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xb4a489, scale: 1.3, weather: [0.2, 0.2, 0.3, 0.4] },
  },
  /** Painted plasterboard: back-of-house partitions, cabin sidewall panels. */
  wall_paint: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xcfcbc2, scale: 2.0, weather: [0.15, 0.2, 0.2, 0.35] },
  },
  wall_grey: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x8d9094, scale: 2.0, weather: [0.2, 0.3, 0.3, 0.4] },
  },
  /** Ceiling soffits and the roof underside. */
  ceiling: {
    name: 'plaster',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xb9b6ae, scale: 2.6, weather: [0.05, 0.05, 0, 0.2] },
  },
  /** Warm oak slats (café, lounge ceiling). */
  oak: {
    name: 'wood',
    surface: 'wood',
    opts: { vertexMasks: true, tint: 0xb48a5c, scale: 1.0, normalStrength: 1.2 },
  },
  /** Brushed stainless: counters, handrails, kiosk trims. */
  steel: { name: 'metal_brushed', surface: 'metal', opts: { vertexMasks: true, scale: 0.9 } },
  /** Dark anodised aluminium: mullions, frames, seat beams. */
  alu_dark: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0x3d4146, scale: 1.0, roughness: [0.8, 0, 0.25] },
  },
  /** Light aluminium: ULDs, jet bridge, belt loader frames. */
  alu: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0xa9adb0, scale: 1.2, roughness: [0.8, 0, 0.25] },
  },
  /** Curtain-wall glass: thin green tint, strong Fresnel. */
  glazing: {
    name: 'glass',
    surface: 'glass',
    opts: {
      scale: 3.0,
      roughness: [0.25, 0.02],
      three: { opacity: 0.12, envMapIntensity: 1.8, color: 0xdfeee8 },
    },
  },

  // ----------------------------------------------------------------- props --
  /** Seat upholstery and cabin seats: navy. */
  upholstery: {
    name: 'fabric',
    surface: 'fabric',
    opts: { vertexMasks: true, tint: 0x3a465c, scale: 0.3 },
  },
  /** Moulded plastic: seat shells, cabin trim, bins. */
  plastic_light: {
    name: 'metal_painted',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0xd4d0c6, scale: 0.8, roughness: [0.75, 0, 0.3] },
  },
  plastic_dark: {
    name: 'metal_painted',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x2c2e31, scale: 0.8, roughness: [0.8, 0, 0.3] },
  },
  /** Counter fronts: laminate in a warm wood. */
  laminate: {
    name: 'wood',
    surface: 'wood',
    opts: { vertexMasks: true, tint: 0x9c7552, scale: 0.8 },
  },
  planter_soil: { name: 'dirt', surface: 'dirt', opts: { vertexMasks: true, scale: 0.8, tint: 0x6a5a48 } },
  leaves: { name: 'foliage', surface: 'foliage', opts: { vertexMasks: true } },
  rubber: { name: 'rubber', surface: 'rubber', opts: { vertexMasks: true, scale: 0.45 } },
  luggage_red: {
    name: 'metal_painted',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x7a2c26, scale: 0.6, roughness: [0.7, 0, 0.3] },
  },
  luggage_blue: {
    name: 'metal_painted',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x2f4058, scale: 0.6, roughness: [0.7, 0, 0.3] },
  },
  luggage_olive: {
    name: 'metal_painted',
    surface: 'plaster',
    opts: { vertexMasks: true, tint: 0x4f5540, scale: 0.6, roughness: [0.7, 0, 0.3] },
  },

  // --------------------------------------------------------------- aircraft --
  /** Fuselage paint: warm white, a stop off pure. */
  livery_white: {
    name: 'metal_painted',
    surface: 'metal',
    opts: {
      vertexMasks: true,
      tint: 0xd6d4ce,
      scale: 2.0,
      roughness: [0.7, 0, 0.18],
      weather: [0.2, 0.35, 0.2, 0.3],
    },
  },
  /** Cheatline blue. */
  livery_blue: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0x2a4a78, scale: 2.0, roughness: [0.7, 0, 0.18] },
  },
  livery_red: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0x9a2a24, scale: 2.0, roughness: [0.7, 0, 0.18] },
  },
  /** Wing/engine bare-ish metal grey. */
  airframe_grey: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0x9ea3a8, scale: 1.6, roughness: [0.7, 0, 0.2] },
  },
  /** Evacuation slide: safety yellow fabric. */
  slide_yellow: {
    name: 'fabric',
    surface: 'rubber',
    opts: { vertexMasks: true, tint: 0xc8a33a, scale: 0.5, three: { side: 2 } },
  },
  /** Cabin window light: a sky-bright emissive pane. */
  cabin_window: {
    name: 'glass',
    surface: 'glass',
    opts: {
      scale: 1.0,
      tint: 0xdfe9f2,
      three: { emissive: 0xcfe0ee, emissiveIntensity: 2.2, transparent: false, opacity: 1, depthWrite: true },
    },
  },
  /** Outside view of the cabin windows: opaque dark tinted glass. */
  window_dark: {
    name: 'glass',
    surface: 'glass',
    opts: {
      scale: 1.0,
      roughness: [0.2, 0.02],
      three: { color: 0x1a1f26, transparent: false, opacity: 1, depthWrite: true, envMapIntensity: 1.6 },
    },
  },

  // ----------------------------------------------------------------- apron --
  apron_concrete: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: {
      vertexMasks: true,
      tint: 0xb3aea4,
      scale: 5.0,
      detile: 0.4,
      roughness: [0.9, 0, 0.3],
      weather: [0.4, 0.05, 0.1, 0.4],
      wear: [0, 0.5, 0.45, 0],
    },
  },
  apron_asphalt: {
    name: 'asphalt',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8a857c, scale: 3.2, detile: 0.6, wear: [0, 0.55, 0.45, 0] },
  },
  /** Painted markings: worn safety yellow, white. */
  paint_yellow: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xd4a93c, scale: 1.0, roughness: [0.8, 0, 0.3] },
  },
  paint_white: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xe2ded4, scale: 1.0, roughness: [0.8, 0, 0.3] },
  },
  paint_red: {
    name: 'concrete_floor',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0xa33a2e, scale: 1.0, roughness: [0.8, 0, 0.3] },
  },
  /** Ground-support-equipment paint. */
  gse_yellow: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0xc9a23a, scale: 1.0, weather: [0.4, 0.4, 0.4, 0.5] },
  },
  gse_white: {
    name: 'metal_painted',
    surface: 'metal',
    opts: { vertexMasks: true, tint: 0xcfccc4, scale: 1.0, weather: [0.4, 0.45, 0.4, 0.5] },
  },
  cone_orange: {
    name: 'rubber',
    surface: 'rubber',
    opts: { vertexMasks: true, tint: 0xff8a50, scale: 0.4 },
  },
  roof_membrane: {
    name: 'concrete',
    surface: 'concrete',
    opts: { vertexMasks: true, tint: 0x8c8880, scale: 3.0 },
  },

  // -------------------------------------------------------------- emissive --
  /** Linear ceiling fixtures: neutral cool white. */
  light_strip: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xf4f6f8, three: { emissive: 0xeef3ff, emissiveIntensity: 5, toneMapped: true } },
  },
  /** Warm practicals over the café and retail. */
  light_warm: {
    name: 'plaster',
    surface: 'glass',
    opts: { scale: 0.5, tint: 0xfff0d8, three: { emissive: 0xffc98a, emissiveIntensity: 6, toneMapped: true } },
  },
  /** Screen glow (departure boards, gate screens): dark glass with a faint blue. */
  screen: {
    name: 'glass',
    surface: 'glass',
    opts: {
      scale: 0.6,
      three: { color: 0x0c1016, emissive: 0x2a3c55, emissiveIntensity: 0.8, transparent: false, opacity: 1, depthWrite: true },
    },
  },
};
