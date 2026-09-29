import { Assembly, box, latheZ, rodZ, ring, tubeZ } from '../geometry.js';

/**
 * Hand grenades: the frag (lethal) and the flashbang (tactical).
 *
 * Both are authored centred on their centre of mass with +Y through the fuze,
 * which is also the physics body's local frame (the frag is a sphere, the
 * flashbang a capsule whose axis is local Y), so the same geometry serves the
 * world copy riding a rigid body and the viewmodel copy in the throwing hand.
 *
 * Real dimensions: an M67-pattern frag is a 64 mm steel sphere with a 20 mm
 * fuze body, a spoon down one side and a 22 mm pull ring; an M84-pattern stun
 * grenade is a 44 mm x 110 mm perforated tube on the same fuze.
 */

/** Lathe authored along +Z, stood up so +Z becomes +Y. */
const UP = { rx: -Math.PI / 2 };

/** The shared M204-style fuze: body, spoon, pin and ring. `top` = y of the body top. */
function addFuze(asm, top, bodyR) {
  // Fuze body: a knurled-looking stepped cylinder on the neck.
  const fuze = latheZ(
    [
      [0, 0],
      [0, 0.0098],
      [0.004, 0.0101],
      [0.013, 0.0101],
      [0.015, 0.0086],
      [0.0205, 0.0086],
      [0.0215, 0.0062],
      [0.0215, 0],
    ],
    18
  );
  asm.add(fuze, 'steel_black', { ...UP, y: top - 0.003 });
  fuze.dispose();

  // Spoon (safety lever): a strip from the fuze head down the body's flank,
  // following the curve in three facets.
  const segs = [
    { y: top + 0.012, z: 0.0112, len: 0.016, rx: 0.0 },
    { y: top - 0.004, z: bodyR * 0.72 + 0.004, len: 0.02, rx: 0.55 },
    { y: top - 0.022, z: bodyR * 0.95 + 0.002, len: 0.02, rx: 0.12 },
  ];
  for (const s of segs) {
    const g = box(0.0105, s.len, 0.0016, 0.0005, 1);
    asm.add(g, 'steel', { y: s.y, z: s.z, rx: s.rx });
    g.dispose();
  }
  // Cross pin through the fuze, and the pull ring hanging off it.
  const pin = rodZ(0.0011, 0.0011, 0.03, 8, 0.0003);
  asm.add(pin, 'steel_bright', { y: top + 0.008, x: 0, ry: Math.PI / 2 });
  pin.dispose();
  const pull = ring(0.0105, 0.00115, 20, 6);
  asm.add(pull, 'steel_bright', { x: -0.021, y: top + 0.004, ry: Math.PI / 2, rx: 0.35 });
  pull.dispose();
}

/**
 * Frag: a 64 mm sphere on a 16 mm neck, olive drab, lot stencil as an
 * engraved band. Returns the assembly and the body radius used for physics.
 */
export function buildFrag() {
  const asm = new Assembly('frag');
  const R = 0.032;
  const prof = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    // Slightly flattened pole at the base, as the pressed shell is.
    const a = -Math.PI / 2 + (i / N) * Math.PI * 0.94;
    const z = Math.sin(a) * R * (a < 0 ? 0.96 : 1);
    const r = Math.cos(a) * R;
    prof.push([z, Math.max(0, r)]);
  }
  prof.push([R * 0.99, 0.0095]);
  prof.push([R * 0.99, 0]);
  const shell = latheZ(prof, 28);
  asm.add(shell, 'paint_od', UP);
  shell.dispose();
  // A thin raised seam band at the equator (the two pressed halves).
  const seam = tubeZ(R + 0.0006, R - 0.002, 0.003, 32, 0.0003);
  asm.add(seam, 'paint_od', { ...UP, y: -0.002 });
  seam.dispose();
  // Neck.
  const neck = latheZ([[0, 0], [0, 0.0095], [0.006, 0.0095], [0.006, 0]], 16);
  asm.add(neck, 'steel', { ...UP, y: R * 0.93 });
  neck.dispose();
  addFuze(asm, R * 0.93 + 0.006, R);
  return { asm, radius: R, halfHeight: 0 };
}

/**
 * Flashbang: a perforated 44 mm tube with end caps; the charge vents through
 * the holes, which are real cavities so the silhouette reads at arm's length.
 */
export function buildFlash() {
  const asm = new Assembly('flash');
  const R = 0.022;
  const H = 0.105;
  const body = tubeZ(R, R - 0.0025, H, 28, 0.0008);
  asm.add(body, 'alu', UP);
  body.dispose();
  const core = rodZ(R - 0.0026, R - 0.0026, H - 0.006, 20, 0.0005);
  asm.add(core, 'cavity', UP);
  core.dispose();
  // End caps.
  for (const s of [-1, 1]) {
    const cap = latheZ(
      [
        [0, 0],
        [0, R + 0.0008],
        [0.0015, R + 0.0012],
        [0.0075, R + 0.0012],
        [0.009, R * 0.8],
        [0.009, 0],
      ],
      28
    );
    asm.add(cap, 'steel_black', s > 0 ? { ...UP, y: H / 2 - 0.004 } : { rx: Math.PI / 2, y: -H / 2 + 0.004 });
    cap.dispose();
  }
  // Vent holes: three rows of eight dark ports around the tube.
  for (let row = 0; row < 3; row++) {
    const y = -0.028 + row * 0.028;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (row % 2) * (Math.PI / 8);
      const hole = box(0.0078, 0.0115, 0.004, 0.0012, 2);
      asm.add(hole, 'cavity', {
        x: Math.sin(a) * (R - 0.0008),
        y,
        z: Math.cos(a) * (R - 0.0008),
        ry: a,
      });
      hole.dispose();
    }
  }
  // A band of tape marks it as a trainer-coloured stun round for the reader.
  const band = tubeZ(R + 0.0005, R - 0.001, 0.009, 28, 0.0002);
  asm.add(band, 'polymer_tan', { ...UP, y: -0.046 });
  band.dispose();
  addFuze(asm, H / 2 + 0.004, R);
  return { asm, radius: R, halfHeight: H / 2 - R };
}
