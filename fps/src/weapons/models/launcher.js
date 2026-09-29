import { Assembly, box, blob, extrude, latheZ, rodZ, tubeZ, ring } from '../geometry.js';
import { addPistolGrip, addScrew, addRail, buildMiniReflex, addSlingLoop, triggerPart } from '../parts.js';
import { rifleGrips } from '../kit.js';

/**
 * PELICAN RL — an 84 mm recoilless-pattern shoulder launcher: an olive-drab
 * tube with a venturi at the back, a shoulder pad and a firing grip under the
 * front third, a forward grip, a reflex sight on a side rail, and the round's
 * warhead standing proud of the muzzle. The warhead is the "magazine" moving
 * part, so the reload clip visibly takes it off and seats a new one.
 */
export const TUBE_Y = 0.088;
export const TUBE_R = 0.046;

/** The round: warhead ogive + body + tail fins. Shared with rockets.js. */
export function buildRocketRound(asm, t = {}) {
  const war = latheZ(
    [[0, 0], [0.006, 0.012], [0.03, 0.028], [0.07, 0.038], [0.11, 0.041], [0.13, 0.041], [0.13, 0.035], [0.15, 0.035], [0.15, 0]],
    28
  );
  // Authored nose-first along +Z; flip so the nose points -Z.
  asm.add(war, 'paint_od', { ...t, ry: Math.PI, z: (t.z ?? 0) + 0.15 });
  war.dispose();
  const tip = latheZ([[0, 0], [0, 0.006], [0.012, 0.005], [0.014, 0]], 12);
  asm.add(tip, 'steel', { ...t, ry: Math.PI, z: (t.z ?? 0) + 0.002 });
  tip.dispose();
  const band = tubeZ(0.0414, 0.036, 0.008, 28, 0.0004);
  asm.add(band, 'brass', { ...t, z: (t.z ?? 0) + 0.118 });
  band.dispose();
  return 0.15;
}

export function buildLauncher() {
  const y = TUBE_Y;
  const r = TUBE_R;
  const zFront = -0.56;
  const zRear = 0.42;
  const body = new Assembly('rocket-body');

  /* ---- the tube --------------------------------------------------------- */
  const len = zRear - zFront;
  const tube = latheZ(
    [
      [0, r - 0.004], [0, r + 0.004], [0.006, r + 0.006], [0.02, r + 0.006], [0.024, r],
      [len - 0.1, r], [len - 0.08, r + 0.004], [len - 0.02, r + 0.018], [len, r + 0.02], [len, r + 0.012],
    ],
    40
  );
  body.add(tube, 'paint_od', { y, z: zFront });
  tube.dispose();
  const bore = tubeZ(r - 0.003, r - 0.0045, len - 0.03, 32, 0.0004);
  body.add(bore, 'cavity', { y, z: (zFront + zRear) / 2 });
  bore.dispose();
  // Reinforcing bands and the stencil band.
  for (const bz of [-0.44, -0.12, 0.18]) {
    const b = tubeZ(r + 0.0035, r - 0.001, 0.02, 40, 0.0006);
    body.add(b, 'polymer', { y, z: bz });
    b.dispose();
  }
  const stencil = tubeZ(r + 0.0008, r - 0.001, 0.05, 40, 0.0003);
  body.add(stencil, 'polymer_tan', { y, z: -0.3 });
  stencil.dispose();
  // Shoulder pad under the rear third.
  const pad = blob(0.05, 0.03, 0.2, 0.01, 3);
  body.add(pad, 'rubber', { y: y - r - 0.006, z: 0.12 });
  pad.dispose();

  /* ---- firing grip + forward grip --------------------------------------- */
  const gripBlock = box(0.034, 0.03, 0.09, 0.004, 2);
  body.add(gripBlock, 'polymer', { y: 0.042, z: 0.0 });
  gripBlock.dispose();
  addPistolGrip(body, 'polymer', 'rubber', { y: 0.035, z: 0.015, angle: 0.3, len: 0.108, w: 0.032 });
  const guard = extrude(
    [[-0.026, 0], [0.026, 0], [0.028, -0.008], [0.022, -0.024], [-0.018, -0.026], [-0.026, -0.018]],
    0.016,
    { bevel: 0.0012, holes: [[[-0.021, -0.003], [0.022, -0.003], [0.023, -0.009], [0.018, -0.02], [-0.015, -0.022], [-0.021, -0.016]]] }
  );
  body.add(guard, 'polymer', { y: 0.03, z: -0.002, ry: Math.PI / 2 });
  guard.dispose();
  // Safety and cocking lever on the left of the grip block.
  const lever = box(0.006, 0.012, 0.04, 0.0015, 1);
  body.add(lever, 'steel', { x: -0.02, y: 0.048, z: -0.03 });
  lever.dispose();
  addScrew(body, 'steel', 0.0175, 0.045, 0.02, 0.0024, 'x', 0.005);
  addSlingLoop(body, 'steel', 0, y - r - 0.004, -0.4, 0.008, { rx: Math.PI / 2, ry: Math.PI / 2 });

  /* ---- sight: a reflex on a short top rail ------------------------------ */
  const railTop = y + r + 0.012;
  const mount = box(0.03, 0.014, 0.08, 0.002, 1);
  body.add(mount, 'alu', { y: y + r + 0.004, z: -0.06 });
  mount.dispose();
  addRail(body, 'alu', -0.095, -0.025, railTop - 0.009);
  const reflex = buildMiniReflex(body, { w: 0.028, h: 0.024, len: 0.05, y: railTop, z: -0.06, matBody: 'alu_fine' });
  const opticY = railTop + 0.024 * 0.56;
  const opticZ = -0.06 + 0.05 * 0.14;

  /* ---- the round (magazine part), seated in the muzzle ------------------ */
  const magazine = new Assembly('rocket-round');
  buildRocketRound(magazine, { z: -0.15 + 0.035 });

  const trigger = new Assembly('rocket-trigger');
  const trg = triggerPart('steel_bright');
  trigger.add(trg.geo, 'steel_bright', {});
  trg.geo.dispose();

  const grips = rifleGrips(r, -0.2, y);
  return {
    id: 'rocket',
    label: 'PELICAN RL',
    fxClass: 'launcher',
    body,
    moving: { magazine, trigger },
    nodes: {
      muzzle: [0, y, zFront - 0.12],
      chamber: [0, y, -0.2],
      eject: [0, y, zRear],
      ejectDir: [0, 0, 1],
      sight: [0, opticY, opticZ],
      sightAxis: [0, 0, -1],
      ironSight: [0, opticY, opticZ],
      gripR: grips.gripR,
      gripL: grips.gripL,
      handguard: { axis: [0, y, 0], dir: [0, 0, 1], r, z0: -0.14, z1: -0.3 },
      magSeat: { pos: [0, y, zFront], rot: [0, 0, 0] },
      magDrop: [0, -0.4, 0.02],
      triggerPivot: { pos: [0, 0.03, -0.0055], rot: [0, 0, 0] },
      triggerPull: -0.3,
      opticGlass: reflex,
    },
    shell: null,
    magSize: { len: 0.3, w: 0.08, d: 0.08 },
  };
}
