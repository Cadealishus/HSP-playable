import { Assembly, box, blob, dome, latheZ, rodZ, ring, tubeZ } from '../geometry.js';

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

/* ========================================================================== */
/*  the comment-pass throwables (EXPANSION §10.4)                             */
/* ========================================================================== */

/**
 * Semtex: a 70 x 45 x 26 mm block of plastic explosive in a tan wrapper, a
 * black detonator/timer unit strapped across the top with a red status LED,
 * and a rubber adhesive pad underneath (the bit that does the sticking).
 * Authored centred on its centre of mass, +Y through the detonator.
 */
export function buildSemtex() {
  const asm = new Assembly('semtex');
  const W = 0.045;
  const H = 0.026;
  const L = 0.07;
  const block = box(W, H, L, 0.005, 2);
  asm.add(block, 'polymer_tan', {});
  block.dispose();
  // Two straps of black tape round the block.
  for (const z of [-0.022, 0.022]) {
    const strap = box(W + 0.0016, H + 0.0016, 0.009, 0.0012, 1);
    asm.add(strap, 'rubber', { z });
    strap.dispose();
  }
  // Adhesive pad on the underside.
  const pad = box(W * 0.86, 0.0034, L * 0.86, 0.0014, 1);
  asm.add(pad, 'rubber', { y: -H / 2 - 0.0012 });
  pad.dispose();
  // Detonator / timer unit.
  const det = box(0.03, 0.013, 0.036, 0.0024, 2);
  asm.add(det, 'polymer', { y: H / 2 + 0.006 });
  det.dispose();
  const face = box(0.018, 0.0016, 0.012, 0.0005, 1);
  asm.add(face, 'steel_black', { y: H / 2 + 0.0128, z: 0.006 });
  face.dispose();
  // The LED: a small dome on the timer face, emissive red (see equipment.js).
  const led = dome(0.0024, 10, 0.5);
  asm.add(led, 'eq_led', { y: H / 2 + 0.0128, z: -0.008, rx: -Math.PI / 2 });
  led.dispose();
  // Detonator cap going into the block, and its leads.
  const cap = rodZ(0.0032, 0.0032, 0.03, 10, 0.0006);
  asm.add(cap, 'alu', { x: 0.012, y: H / 2 + 0.004, z: 0.024 });
  cap.dispose();
  for (const s of [-1, 1]) {
    const lead = rodZ(0.0008, 0.0008, 0.024, 6, 0.0002);
    asm.add(lead, s > 0 ? 'copper' : 'steel_black', { x: 0.006 * s, y: H / 2 + 0.011, z: 0.022, rx: 0.4 });
    lead.dispose();
  }
  return { asm, radius: 0.03, halfHeight: 0 };
}

/**
 * Molotov: a 0.5 l bottle (68 mm body, 230 mm tall with the neck) about half
 * full of fuel, a rag stuffed in the neck and hanging down the shoulder.
 * Origin near the centre of mass (low, where the fuel is); +Y up the neck.
 */
export function buildMolotov() {
  const asm = new Assembly('molotov');
  const R = 0.034;
  const y0 = -0.07;
  // Outer glass, lathed bottom-to-top: heel, body, shoulder, neck, lip.
  const glass = latheZ(
    [
      [y0, 0],
      [y0, R * 0.78],
      [y0 + 0.004, R * 0.97],
      [y0 + 0.012, R],
      [y0 + 0.13, R],
      [y0 + 0.15, R * 0.86],
      [y0 + 0.17, R * 0.5],
      [y0 + 0.182, 0.0128],
      [y0 + 0.218, 0.0124],
      [y0 + 0.221, 0.0146],
      [y0 + 0.227, 0.0146],
      [y0 + 0.229, 0.011],
      [y0 + 0.229, 0],
    ],
    28
  );
  asm.add(glass, 'eq_bottle', UP);
  glass.dispose();
  // Fuel inside, just under the glass.
  const fuel = latheZ(
    [
      [y0 + 0.004, 0],
      [y0 + 0.004, R * 0.9],
      [y0 + 0.011, R - 0.0026],
      [y0 + 0.098, R - 0.0026],
      [y0 + 0.098, 0],
    ],
    24
  );
  asm.add(fuel, 'eq_fuel', UP);
  fuel.dispose();
  // A scrap of label.
  const label = tubeZ(R + 0.0004, R - 0.001, 0.05, 28, 0.0002);
  asm.add(label, 'polymer_tan', { ...UP, y: y0 + 0.07 });
  label.dispose();
  // Rag: wadded into the neck, a knot on top and a tail down the shoulder.
  const wad = rodZ(0.0118, 0.0135, 0.034, 10, 0.002);
  asm.add(wad, 'sleeve', { ...UP, y: y0 + 0.226 });
  wad.dispose();
  const knot = blob(0.03, 0.022, 0.026, 0.009, 3);
  asm.add(knot, 'sleeve', { y: y0 + 0.248, rz: 0.4, ry: 0.5 });
  knot.dispose();
  const tail = [
    { x: 0.016, y: y0 + 0.236, rz: -0.9, len: 0.03 },
    { x: 0.03, y: y0 + 0.21, rz: -0.35, len: 0.034 },
    { x: 0.038, y: y0 + 0.18, rz: -0.1, len: 0.03 },
  ];
  for (const s of tail) {
    const g = box(0.012, s.len, 0.026, 0.0035, 2);
    asm.add(g, 'sleeve', { x: s.x, y: s.y, rz: s.rz, ry: 0.15 });
    g.dispose();
  }
  return { asm, radius: R, halfHeight: 0.06 };
}

/**
 * Smoke: an M18-pattern canister, 63 mm x 114 mm, olive drab with a tan top
 * band (the colour of the smoke), four emission ports in the top face, on the
 * same fuze as the frag.
 */
export function buildSmoke() {
  const asm = new Assembly('smoke');
  const R = 0.0315;
  const H = 0.114;
  const body = rodZ(R, R, H, 30, 0.0016);
  asm.add(body, 'paint_od', UP);
  body.dispose();
  const band = tubeZ(R + 0.0005, R - 0.002, 0.022, 30, 0.0002);
  asm.add(band, 'polymer_tan', { ...UP, y: H / 2 - 0.022 });
  band.dispose();
  // Rolled seams top and bottom.
  for (const s of [-1, 1]) {
    const seam = ring(R - 0.0002, 0.0012, 30, 6);
    asm.add(seam, 'paint_od', { y: s * (H / 2 - 0.001), rx: Math.PI / 2 });
    seam.dispose();
  }
  // Emission ports in the top face.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const port = rodZ(0.004, 0.004, 0.003, 10, 0.0004);
    asm.add(port, 'cavity', { x: Math.sin(a) * R * 0.62, y: H / 2 + 0.0004, z: Math.cos(a) * R * 0.62, rx: -Math.PI / 2 });
    port.dispose();
  }
  addFuze(asm, H / 2 + 0.002, R);
  return { asm, radius: R, halfHeight: H / 2 - R };
}

/**
 * Concussion: a stubby 52 mm x 96 mm black steel body with alloy end caps,
 * grip ribs and two tan identification bands; no vent holes (all bang, no light).
 */
export function buildConcussion() {
  const asm = new Assembly('concussion');
  const R = 0.026;
  const H = 0.096;
  const body = rodZ(R, R, H - 0.012, 28, 0.001);
  asm.add(body, 'steel_black', UP);
  body.dispose();
  for (const s of [-1, 1]) {
    const cap = latheZ(
      [
        [0, 0],
        [0, R + 0.001],
        [0.002, R + 0.0014],
        [0.007, R + 0.0014],
        [0.009, R * 0.84],
        [0.009, 0],
      ],
      28
    );
    asm.add(cap, 'alu', s > 0 ? { ...UP, y: H / 2 - 0.009 } : { rx: Math.PI / 2, y: -H / 2 + 0.009 });
    cap.dispose();
  }
  for (const y of [-0.016, 0.004]) {
    const band = tubeZ(R + 0.0005, R - 0.001, 0.008, 28, 0.0002);
    asm.add(band, 'polymer_tan', { ...UP, y });
    band.dispose();
  }
  // Raised grip ribs.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rib = box(0.004, 0.03, 0.002, 0.0006, 1);
    asm.add(rib, 'steel_black', { x: Math.sin(a) * (R + 0.0006), y: 0.03, z: Math.cos(a) * (R + 0.0006), ry: a });
    rib.dispose();
  }
  addFuze(asm, H / 2 + 0.002, R);
  return { asm, radius: R, halfHeight: H / 2 - R };
}
