import { Assembly, box, blob, extrude, latheZ, rodZ, tubeZ, dome } from '../geometry.js';
import {
  addBarrel,
  addMuzzleDevice,
  addHandguard,
  addRail,
  addPistolGrip,
  addCarbineStock,
  addPin,
  addScrew,
  addQdSocket,
  buildMagazine,
  triggerPart,
  cartridge,
} from '../parts.js';
import { buildScope, addBipod, rifleGrips } from '../kit.js';

/**
 * OSPREY 338 — a bolt-action precision rifle on an aluminium chassis: a round
 * steel action with a full-length rail, a 26" fluted heavy barrel under a
 * free-float tube, a three-port brake, a detachable 5-round box, a folded
 * bipod and a 12x scope in two rings.
 *
 * The BOLT is a moving part: it translates rearward and its handle lifts 60 deg
 * on every cycle (viewmodel.js `_updateParts`, driven by the `cycle` clip).
 */
export function buildSniper(opts = {}) {
  const marksman = opts.marksman === true;
  const bore = 0.075;
  const rAct = 0.0175;
  const zActRear = 0.07;
  const zActFront = -0.15;
  const railTop = bore + 0.03;
  const zBarrelEnd = marksman ? -0.56 : -0.68;
  const hgZ0 = -0.152;
  const hgZ1 = marksman ? -0.43 : -0.47;
  const hgR = 0.027;
  const handZ = -0.235;

  const body = new Assembly(marksman ? 'marksman-body' : 'sniper-body');

  /* ---- action ---------------------------------------------------------- */
  const act = latheZ(
    [[0, rAct * 0.6], [0, rAct * 0.96], [0.003, rAct], [zActRear - zActFront - 0.003, rAct], [zActRear - zActFront, rAct * 0.9], [zActRear - zActFront, rAct * 0.6]],
    32
  );
  body.add(act, marksman ? 'alu' : 'alu', { y: bore, z: zActRear, ry: Math.PI });
  act.dispose();
  const port = box(0.008, 0.016, 0.07, 0.001, 1);
  body.add(port, 'cavity', { x: rAct - 0.003, y: bore + 0.004, z: -0.02 });
  port.dispose();
  addRail(body, 'alu', zActFront + 0.004, zActRear - 0.004, railTop);
  const railBase = box(0.02, railTop - bore - rAct + 0.004, zActRear - zActFront - 0.01, 0.001, 1);
  body.add(railBase, 'alu', { y: bore + rAct + (railTop - bore - rAct) / 2 - 0.002, z: (zActRear + zActFront) / 2 });
  railBase.dispose();

  /* ---- chassis: bedding block, mag well, trigger guard ----------------- */
  const chassis = extrude(
    [[0.08, 0], [-0.16, 0], [-0.16, -0.022], [-0.085, -0.03], [-0.085, -0.048], [-0.03, -0.048], [-0.02, -0.03], [0.075, -0.026]],
    0.034,
    { bevel: 0.0022 }
  );
  body.add(chassis, 'alu', { y: bore - 0.006, ry: -Math.PI / 2 });
  chassis.dispose();
  const guard = extrude(
    [[-0.026, 0], [0.026, 0], [0.028, -0.008], [0.022, -0.024], [-0.018, -0.026], [-0.026, -0.018]],
    0.016,
    { bevel: 0.0012, holes: [[[-0.021, -0.003], [0.022, -0.003], [0.023, -0.009], [0.018, -0.02], [-0.015, -0.022], [-0.021, -0.016]]] }
  );
  body.add(guard, 'alu', { y: bore - 0.03, z: -0.002, ry: Math.PI / 2 });
  guard.dispose();
  addPin(body, 'steel', 0, bore - 0.018, -0.12, 0.003, 0.036);
  addPin(body, 'steel', 0, bore - 0.018, 0.05, 0.003, 0.036);
  addPistolGrip(body, 'polymer', 'rubber', { y: 0.035, z: 0.015, angle: 0.38, len: 0.108, w: 0.031 });
  addCarbineStock(body, 'alu', 'polymer', 'rubber', { bore, zFront: zActRear + 0.003, zRear: 0.27, y: bore - 0.012 });
  // Adjustable cheek piece on top of the stock.
  const cheek = blob(0.03, 0.022, 0.11, 0.006, 3);
  body.add(cheek, 'polymer', { y: bore + 0.012, z: 0.18 });
  cheek.dispose();

  /* ---- barrel + handguard + brake -------------------------------------- */
  addBarrel(body, 'alu', 'cavity', {
    y: bore, zBreech: zActFront + 0.005, zMuzzle: zBarrelEnd,
    rChamber: 0.0142, rBarrel: marksman ? 0.0088 : 0.0112, rGas: marksman ? 0.0105 : 0.0112, gasAt: -0.4, knurl: false,
  });
  if (!marksman) {
    // Flutes on the exposed barrel.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fl = box(0.0026, 0.0016, 0.14, 0.0004, 1);
      body.add(fl, 'cavity', { x: Math.sin(a) * 0.0108, y: bore + Math.cos(a) * 0.0108, z: hgZ1 - 0.085, rz: -a });
      fl.dispose();
    }
  }
  const muzzle = addMuzzleDevice(body, 'steel_soot', 'cavity', 'brake', zBarrelEnd, marksman ? 0.0088 : 0.0112, bore);
  addHandguard(body, 'alu', {
    matPanel: marksman ? 'polymer_tan' : 'polymer',
    y: bore, z0: hgZ0, z1: hgZ1, r: hgR - 0.0036, sides: 8, slatW: 0.019, slatT: 0.0036, slots: 5, braces: 3,
    topFrom: handZ + 0.05, topTo: hgZ1 + 0.06,
  });
  addRail(body, 'alu', hgZ1 + 0.004, hgZ0 - 0.002, railTop);
  addQdSocket(body, 'alu', 'steel', -hgR + 0.001, bore - 0.008, hgZ0 - 0.035, 'x', 0.005);
  if (!marksman) addBipod(body, bore - hgR - 0.008, hgZ1 + 0.03, { len: 0.2 });

  /* ---- scope ----------------------------------------------------------- */
  const scope = buildScope(body, marksman
    ? { y: railTop + 0.03, z: -0.03, len: 0.2, rTube: 0.015, rObj: 0.021, rOc: 0.02, railTop }
    : { y: railTop + 0.034, z: -0.035, len: 0.34, rTube: 0.017, rObj: 0.029, rOc: 0.021, railTop });

  /* ---- moving parts ------------------------------------------------------ */
  const magazine = new Assembly('sniper-mag');
  const mag = buildMagazine(magazine, null, marksman
    ? { w: 0.027, d: 0.072, len: 0.14, curve: 0.006, segs: 6, witness: 3, poly: 'polymer', caseLen: 0.051, rimR: 0.006, bulletLen: 0.022 }
    : { w: 0.03, d: 0.098, len: 0.09, curve: 0.0, segs: 4, witness: 2, poly: 'alu', caseLen: 0.0693, rimR: 0.0075, bulletLen: 0.03 });

  // Bolt: body inside the action, handle out of the right side with a tactical
  // knob. Its rest node is the rear of the bolt body; the handle root is on
  // the bolt axis so the lift is a rotation about Z.
  const bolt = new Assembly('sniper-bolt');
  if (!marksman) {
    const bb = rodZ(rAct * 0.8, rAct * 0.8, 0.13, 20, 0.001);
    bolt.add(bb, 'steel_bright', { z: -0.065 });
    bb.dispose();
    const shroud = latheZ([[0, 0], [0, rAct * 0.9], [0.028, rAct * 0.86], [0.034, rAct * 0.5], [0.034, 0]], 24);
    bolt.add(shroud, 'alu', { z: 0 });
    shroud.dispose();
    const arm = rodZ(0.004, 0.0035, 0.052, 12, 0.0006);
    bolt.add(arm, 'alu', { x: 0.03, y: -0.008, z: -0.01, ry: Math.PI / 2, rx: 0.3 });
    arm.dispose();
    const knob = dome(0.0095, 16, 1.0);
    bolt.add(knob, 'polymer', { x: 0.056, y: -0.016, z: -0.01 });
    knob.dispose();
    const round = cartridge(0.0693, 0.0075, 0.03);
    bolt.add(round.brass, 'brass', { z: -0.2, ry: Math.PI });
    round.brass.dispose();
    round.bullet.dispose();
  } else {
    // Semi-auto: an AR-10 style carrier visible through the port.
    const bc = rodZ(rAct * 0.75, rAct * 0.75, 0.09, 18, 0.001);
    bolt.add(bc, 'steel_bright', { z: -0.045 });
    bc.dispose();
  }

  const trigger = new Assembly('sniper-trigger');
  const trg = triggerPart('steel_bright');
  trigger.add(trg.geo, 'steel_bright', {});
  trg.geo.dispose();

  const grips = rifleGrips(hgR, handZ, bore);
  return {
    id: marksman ? 'marksman' : 'sniper',
    label: marksman ? 'FALCON 762' : 'OSPREY 338',
    fxClass: marksman ? 'marksman' : 'sniper',
    body,
    moving: { magazine, bolt, trigger },
    nodes: {
      muzzle: [0, bore, muzzle.crownZ],
      chamber: [0, bore, -0.02],
      eject: [rAct + 0.008, bore + 0.004, -0.02],
      ejectDir: [0.86, 0.46, 0.22],
      sight: scope.sight,
      sightAxis: [0, 0, -1],
      ironSight: scope.sight,
      gripR: grips.gripR,
      gripL: grips.gripL,
      handguard: { axis: [0, bore, 0], dir: [0, 0, 1], r: hgR, z0: hgZ0, z1: hgZ1 },
      magSeat: { pos: [0, bore - 0.028, -0.055], rot: [0, 0, 0] },
      magDrop: [0, -0.4, 0.02],
      boltRest: { pos: [0, bore, zActRear], rot: [0, 0, 0] },
      boltTravel: [0, 0, marksman ? 0.05 : 0.085],
      boltLift: marksman ? 0 : 1.05,
      triggerPivot: { pos: [0, 0.0455, -0.0055], rot: [0, 0, 0] },
      triggerPull: -0.28,
      opticGlass: null,
      scope: true,
    },
    shell: marksman ? { caseLen: 0.051, rimR: 0.006 } : { caseLen: 0.0693, rimR: 0.0075 },
    magSize: { len: mag.len, w: mag.w, d: mag.d },
  };
}

export function buildMarksman() {
  return buildSniper({ marksman: true });
}
