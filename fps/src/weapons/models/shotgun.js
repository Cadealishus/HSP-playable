import { Assembly, box, blob, extrude, roundRect, latheZ, rodZ, tubeZ } from '../geometry.js';
import { addBarrel, addRail, addPistolGrip, addCarbineStock, addPin, addScrew, addSlingLoop, triggerPart } from '../parts.js';
import { rifleGrips, shell12 } from '../kit.js';

/**
 * SHRIKE 12 — a pump-action 12 gauge on a tactical chassis: a steel receiver
 * with the loading port underneath, an 18.5" barrel over a full-length
 * magazine tube, a grooved polymer pump that is a MOVING PART (the support hand
 * rides it through every stroke), a ghost-ring rear sight and a bead front,
 * pistol grip and a collapsible stock on the rifle's buffer tube.
 *
 * The hand anchor, the grip and the stock are the rifle's, so the shooting-hand
 * weld and the shoulder carry over; the support hand is solved onto the pump.
 */
export function buildShotgun() {
  const bore = 0.075;
  const zRecRear = 0.058;
  const zRecFront = -0.142;
  const zBarrelEnd = -0.62;
  const tubeY = bore - 0.0255;
  const pumpR = 0.0215;
  const pumpZ = -0.265; // pump centre at rest
  const pumpLen = 0.15;
  const railTop = bore + 0.0275;

  const body = new Assembly('shotgun-body');

  /* ---- receiver: a milled steel box, loading port underneath ---------- */
  const recH = 0.066;
  const recW = 0.036;
  const rec = box(recW, recH, zRecRear - zRecFront, 0.0022, 2);
  body.add(rec, 'steel_black', { y: bore - 0.013, z: (zRecRear + zRecFront) / 2 });
  rec.dispose();
  // Ejection port (right) and loading port (bottom), real cavities.
  const port = box(0.006, 0.02, 0.062, 0.001, 1);
  body.add(port, 'cavity', { x: recW / 2 - 0.0022, y: bore + 0.004, z: -0.06 });
  port.dispose();
  const lport = box(0.022, 0.006, 0.08, 0.0015, 1);
  body.add(lport, 'cavity', { y: bore - 0.013 - recH / 2 + 0.002, z: -0.07 });
  lport.dispose();
  // Machined flutes along both flanks.
  for (const sx of [-1, 1]) {
    for (const yy of [bore - 0.02, bore - 0.03]) {
      const fl = box(0.0016, 0.0035, 0.12, 0.0005, 1);
      body.add(fl, 'cavity', { x: sx * (recW / 2 - 0.0004), y: yy, z: -0.02 });
      fl.dispose();
    }
  }
  addPin(body, 'steel', 0, bore - 0.03, -0.1, 0.0028, recW + 0.002);
  addPin(body, 'steel', 0, bore - 0.03, 0.03, 0.0028, recW + 0.002);
  // Top rail + ghost-ring rear sight at the back of it.
  addRail(body, 'alu', zRecFront + 0.01, zRecRear - 0.006, railTop - 0.009);
  const ringBase = box(0.03, 0.012, 0.02, 0.0012, 1);
  body.add(ringBase, 'steel_black', { y: railTop + 0.006, z: 0.03 });
  ringBase.dispose();
  for (const sx of [-1, 1]) {
    const ear = box(0.004, 0.02, 0.018, 0.0008, 1);
    body.add(ear, 'steel_black', { x: sx * 0.012, y: railTop + 0.019, z: 0.03 });
    ear.dispose();
  }
  const ghost = latheZ([[0, 0.0045], [0, 0.0072], [0.004, 0.0072], [0.004, 0.0045]], 24);
  body.add(ghost, 'steel', { y: railTop + 0.022, z: 0.028 });
  ghost.dispose();

  /* ---- trigger guard / grip / stock (the rifle's ergonomics) ----------- */
  const guard = extrude(
    [[-0.026, 0], [0.026, 0], [0.028, -0.008], [0.022, -0.024], [-0.018, -0.026], [-0.026, -0.018]],
    0.016,
    { bevel: 0.0012, holes: [[[-0.021, -0.003], [0.022, -0.003], [0.023, -0.009], [0.018, -0.02], [-0.015, -0.022], [-0.021, -0.016]]] }
  );
  body.add(guard, 'polymer', { y: bore - 0.046, z: -0.002, ry: Math.PI / 2 });
  guard.dispose();
  addPistolGrip(body, 'polymer', 'rubber', { y: 0.035, z: 0.015, angle: 0.38, len: 0.108, w: 0.031 });
  addCarbineStock(body, 'alu', 'polymer', 'rubber', { bore, zFront: zRecRear + 0.003, zRear: 0.245, y: bore - 0.012 });

  /* ---- barrel, magazine tube, bead ----------------------------------- */
  addBarrel(body, 'steel_black', 'cavity', {
    y: bore,
    zBreech: zRecFront + 0.01,
    zMuzzle: zBarrelEnd,
    rChamber: 0.0128,
    rBarrel: 0.0104,
    rGas: 0.0104,
    gasAt: -0.4,
    knurl: false,
  });
  const boreHole = tubeZ(0.0096, 0.0092, 0.02, 20, 0.0002);
  body.add(boreHole, 'cavity', { y: bore, z: zBarrelEnd + 0.01 });
  boreHole.dispose();
  const bead = latheZ([[0, 0], [0, 0.0022], [0.003, 0.0022], [0.0045, 0]], 12);
  body.add(bead, 'brass', { y: bore + 0.0112, z: zBarrelEnd + 0.012, rx: -Math.PI / 2 });
  bead.dispose();
  const mtube = rodZ(0.0112, 0.0112, zRecFront - (zBarrelEnd + 0.045), 20, 0.001);
  body.add(mtube, 'steel_black', { y: tubeY, z: (zRecFront + zBarrelEnd + 0.045) / 2 });
  mtube.dispose();
  const cap = latheZ([[0, 0], [0, 0.0122], [0.004, 0.0126], [0.03, 0.0122], [0.036, 0.009], [0.036, 0]], 20);
  body.add(cap, 'steel_black', { y: tubeY, z: zBarrelEnd + 0.045, ry: Math.PI });
  cap.dispose();
  // Barrel clamp tying tube to barrel, with a sling point.
  const clamp = blob(0.03, 0.05, 0.02, 0.004, 2);
  body.add(clamp, 'steel_black', { y: (bore + tubeY) / 2, z: zBarrelEnd + 0.06 });
  clamp.dispose();
  addScrew(body, 'steel', 0.0152, (bore + tubeY) / 2, zBarrelEnd + 0.06, 0.0024, 'x', 0.005);
  addSlingLoop(body, 'steel', -0.017, tubeY, zBarrelEnd + 0.06, 0.007, { ry: Math.PI / 2 });

  /* ---- the pump (moving) --------------------------------------------- */
  const pump = new Assembly('shotgun-pump');
  const pProf = [[0, pumpR * 0.62]];
  const ribs = 9;
  pProf.push([0, pumpR * 0.9], [0.006, pumpR]);
  for (let i = 0; i < ribs; i++) {
    const z0 = 0.018 + i * 0.013;
    pProf.push([z0, pumpR], [z0 + 0.002, pumpR * 0.93], [z0 + 0.0075, pumpR * 0.93], [z0 + 0.0095, pumpR]);
  }
  pProf.push([pumpLen - 0.006, pumpR], [pumpLen, pumpR * 0.9], [pumpLen, pumpR * 0.62]);
  const pg = latheZ(pProf, 28);
  pump.add(pg, 'polymer', { z: pumpLen / 2, ry: Math.PI });
  pg.dispose();
  // Action bars back to the receiver.
  for (const sx of [-1, 1]) {
    const bar = box(0.003, 0.006, 0.13, 0.0006, 1);
    pump.add(bar, 'steel', { x: sx * 0.0105, y: 0.004, z: pumpLen / 2 + 0.05 });
    bar.dispose();
  }

  /* ---- "magazine": one shell, for the shell-by-shell reload ------------ */
  const magazine = new Assembly('shotgun-shell');
  shell12(magazine, 'polymer_tan', { rx: -0.2 });

  const trigger = new Assembly('shotgun-trigger');
  const trg = triggerPart('steel_bright');
  trigger.add(trg.geo, 'steel_bright', {});
  trg.geo.dispose();

  const grips = rifleGrips(pumpR, pumpZ + 0.015, tubeY);
  return {
    id: 'shotgun',
    label: 'SHRIKE 12',
    fxClass: 'shotgun',
    body,
    moving: { magazine, pump, trigger },
    nodes: {
      muzzle: [0, bore, zBarrelEnd],
      chamber: [0, bore, -0.06],
      eject: [recW / 2 + 0.006, bore + 0.004, -0.06],
      ejectDir: [0.9, 0.35, 0.1],
      // Ghost ring aperture: the ADS solve puts it on axis at eyeRelief.
      sight: [0, railTop + 0.022, 0.028],
      sightAxis: [0, 0, -1],
      ironSight: [0, railTop + 0.022, 0.028],
      gripR: grips.gripR,
      gripL: grips.gripL,
      handguard: { axis: [0, tubeY, 0], dir: [0, 0, 1], r: pumpR, z0: pumpZ + pumpLen / 2, z1: pumpZ - pumpLen / 2 },
      // Shells go in through the loading port under the receiver.
      magSeat: { pos: [0, bore - 0.05, -0.07], rot: [0.2, 0, 0] },
      magDrop: [0, -0.4, 0.02],
      pumpRest: { pos: [0, tubeY, pumpZ], rot: [0, 0, 0] },
      pumpTravel: [0, 0, 0.078],
      triggerPivot: { pos: [0, 0.0455, -0.0055], rot: [0, 0, 0] },
      triggerPull: -0.3,
      opticGlass: null,
    },
    shell: { caseLen: 0.07, rimR: 0.0106 },
    magSize: { len: 0.07, w: 0.02, d: 0.02 },
  };
}
