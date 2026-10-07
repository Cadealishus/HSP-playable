/**
 * The ONE bottle every version is built from. All three builders sample these
 * numbers, so shape, dimensions, colours, cap, label design and fill level are
 * identical; only tessellation, materials, textures and rendering differ.
 *
 * Units are metres (glTF convention). Y is up, the bottle stands on y = 0.
 */
export const SPEC = {
  name: 'FLOP OPS reference bottle',
  height: 0.236, // glass base to cap top
  glass: {
    color: '#2f6a2a', // sRGB tint of the glass
    ior: 1.52,
    wall: 0.0026, // wall thickness
    base: 0.0065, // base thickness
  },
  /**
   * Outer silhouette as [y, radius] control points. Builders resample it with a
   * Catmull-Rom curve at their own density (the low-poly baseline uses a few
   * rings, the realistic versions use many).
   */
  profile: [
    [0.0, 0.0335], // base edge (rounded heel below)
    [0.004, 0.0362],
    [0.012, 0.0365],
    [0.128, 0.0365], // body top
    [0.142, 0.0352],
    [0.158, 0.0295], // shoulder
    [0.172, 0.0205],
    [0.184, 0.0152],
    [0.196, 0.0138], // neck
    [0.204, 0.0138],
  ],
  finish: { y0: 0.204, y1: 0.214, radius: 0.0147 }, // threaded lip under the cap
  cap: {
    color: '#121212',
    y0: 0.2, // skirt bottom (overlaps the finish)
    y1: 0.236,
    radius: 0.0159,
    ridges: 60, // knurling count for the versions that model it
  },
  label: {
    paper: '#e9e1cc',
    ink: '#7a1e1b',
    y0: 0.052,
    y1: 0.124,
    radius: 0.0367, // sits just proud of the glass
    // the printed design, in label-space units (0..1 around, 0..1 up)
    design: {
      front: 0.5, // u of the label front (faces +Z)
      diamond: { cy: 0.6, half: 0.16 }, // half-diagonal as a fraction of label height
      bars: [{ cy: 0.31, h: 0.055 }, { cy: 0.2, h: 0.055 }],
      barHalfWidth: 0.055, // fraction of label circumference
    },
  },
  liquid: {
    color: '#a8661a',
    fill: 0.05, // liquid surface height
  },
};

export const VERSIONS = [
  {
    id: 'flopops',
    label: 'FLOP OPS / current style',
    short: 'Current',
    blurb: 'The game as it ships: CylinderGeometry props (10/8 sides), alpha-blended glass, the game\'s own baked 512² surface maps, 300 px/m canvas label.',
  },
  {
    id: 'aaa',
    label: 'Call of Duty–inspired',
    short: 'AAA',
    blurb: 'Modern AAA prop: smooth lathed silhouette with real wall thickness, transmissive glass, knurled cap, 1K PBR maps with restrained wear.',
  },
  {
    id: 'bodycam',
    label: 'Bodycam-inspired',
    short: 'Bodycam',
    blurb: 'Photoreal target: thick refractive glass with dispersion, mould seams and punt, fingerprints and dust in the roughness, fibrous label with worn edges, 2K maps.',
  },
];

/** Catmull-Rom resample of SPEC.profile into `n` points. */
export function sampleProfile(n) {
  const P = SPEC.profile;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (P.length - 1);
    const k = Math.min(P.length - 2, Math.floor(t));
    const f = t - k;
    const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)];
    const cr = (a, b, c, d) =>
      0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}
