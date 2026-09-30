import { Assembly, box, blob, extrude, latheZ, rodZ, tubeZ } from '../geometry.js';
import {
  addBarrel,
  addMuzzleDevice,
  addRail,
  addPistolGrip,
  addCarbineStock,
  addPin,
  addScrew,
  buildOptic,
  triggerPart,
  cartridge,
} from '../parts.js';
import { addBipod, rifleGrips } from '../kit.js';

/**
 * BUZZARD 762 — a belt-fed light machine gun: a stamped steel receiver box
 * with a hinged feed-tray cover, a heavy barrel with a carry handle and a gas
 * cylinder slung under it, a polymer heat shield where the support hand goes,
 * a folded bipod, and a 100-round soft-cornered box hung under the receiver
 * with the belt running up into the feed tray. The box is the "magazine" part,
 * so the reload clip really does pull it off and hang a fresh one.
 */
export function buildLmg() {
  const bore = 0.075;
  const recW = 0.052;
  const recH = 0.072;
  const zRecRear = 0.06;
  const zRecFront = -0.2;
  const zBarrelEnd = -0.64;
  const railTop = bore + 0.046;
  const hsR = 0.03;
  const hsZ0 = -0.2;
  const hsZ1 = -0.39;
  const handZ = -0.25;

  const body = new Assembly('lmg-body');

  /* ---- receiver box ------------------------------------------------------ */
  const rec = box(recW, recH, zRecRear - zRecFront, 0.003, 2);
  body.add(rec, 'alu', { y: bore - 0.006, z: (zRecRear + zRecFront) / 2 });
  rec.dispose();
  // Stamped ribs and rivets down the flanks.
  for (const sx of [-1, 1]) {
    const rib = box(0.0018, 0.012, zRecRear - zRecFront - 0.03, 0.0006, 1);
    body.add(rib, 'alu', { x: sx * (recW / 2 + 0.0006), y: bore - 0.02, z: (zRecRear + zRecFront) / 2 });
    rib.dispose();
    for (let i = 0; i < 6; i++) {
      const rv = latheZ([[0, 0], [0, 0.0022], [0.0008, 0.002], [0.0012, 0]], 10);
      body.add(rv, 'steel', { x: sx * (recW / 2), y: bore - 0.034, z: zRecRear - 0.02 - i * 0.042, ry: sx * Math.PI / 2 });
      rv.dispose();
    }
  }
  // Feed-tray cover with the rail on top and a latch at the rear.
  const cover = box(recW - 0.004, 0.018, 0.16, 0.003, 2);
  body.add(cover, 'alu', { y: bore + recH / 2 - 0.001, z: -0.05 });
  cover.dispose();
  addRail(body, 'alu', -0.13, 0.03, railTop - 0.009);
  const latch = box(0.02, 0.008, 0.014, 0.0015, 1);
  body.add(latch, 'steel', { y: bore + recH / 2 + 0.006, z: 0.035 });
  latch.dispose();
  // Feed tray opening on the left, where the belt goes in.
  const feed = box(0.006, 0.024, 0.05, 0.001, 1);
  body.add(feed, 'cavity', { x: -recW / 2 + 0.002, y: bore + 0.004, z: -0.05 });
  feed.dispose();
  // Ejection chute on the right, underneath.
  const chute = box(0.02, 0.006, 0.05, 0.001, 1);
  body.add(chute, 'cavity', { x: 0.01, y: bore - 0.006 - recH / 2 + 0.002, z: -0.02 });
  chute.dispose();
  // Charging handle on the right.
  const ch = box(0.018, 0.012, 0.022, 0.003, 2);
  body.add(ch, 'polymer', { x: recW / 2 + 0.009, y: bore + 0.004, z: -0.15 });
  ch.dispose();
  addPin(body, 'steel', 0, bore - 0.03, 0.04, 0.003, recW + 0.002);

  /* ---- trigger guard / grip / stock ---------------------------------------- */
  const guard = extrude(
    [[-0.028, 0], [0.028, 0], [0.03, -0.008], [0.024, -0.026], [-0.02, -0.028], [-0.028, -0.02]],
    0.018,
    { bevel: 0.0012, holes: [[[-0.022, -0.003], [0.024, -0.003], [0.025, -0.01], [0.02, -0.022], [-0.016, -0.024], [-0.022, -0.017]]] }
  );
  body.add(guard, 'polymer', { y: bore - 0.042, z: 0.0, ry: Math.PI / 2 });
  guard.dispose();
  addPistolGrip(body, 'polymer', 'rubber', { y: 0.035, z: 0.015, angle: 0.38, len: 0.108, w: 0.033 });
  addCarbineStock(body, 'alu', 'polymer', 'rubber', { bore, zFront: zRecRear + 0.003, zRear: 0.26, y: bore - 0.012 });

  /* ---- barrel, gas cylinder, heat shield, carry handle -------------------- */
  addBarrel(body, 'alu', 'cavity', {
    y: bore, zBreech: zRecFront + 0.01, zMuzzle: zBarrelEnd,
    rChamber: 0.014, rBarrel: 0.0108, rGas: 0.013, gasAt: -0.46,
  });
  const muzzle = addMuzzleDevice(body, 'steel_soot', 'cavity', 'a2', zBarrelEnd, 0.0108, bore);
  const gas = rodZ(0.0085, 0.0085, 0.28, 16, 0.001);
  body.add(gas, 'steel_soot', { y: bore - 0.024, z: -0.33 });
  gas.dispose();
  const gasBlock = blob(0.024, 0.036, 0.03, 0.003, 2);
  body.add(gasBlock, 'steel_soot', { y: bore - 0.012, z: -0.47 });
  gasBlock.dispose();
  // Heat shield / handguard: the support hand grips this.
  const hs = latheZ(
    [[0, hsR * 0.7], [0, hsR * 0.95], [0.004, hsR], [hsZ0 - hsZ1 - 0.004, hsR], [hsZ0 - hsZ1, hsR * 0.95], [hsZ0 - hsZ1, hsR * 0.7]],
    28
  );
  body.add(hs, 'polymer', { y: bore - 0.01, z: hsZ0, ry: Math.PI });
  hs.dispose();
  for (let i = 0; i < 7; i++) {
    const v = box(0.006, 0.012, 0.016, 0.002, 2);
    body.add(v, 'cavity', { x: -hsR + 0.002, y: bore - 0.004, z: hsZ0 - 0.03 - i * 0.022 });
    body.add(v, 'cavity', { x: hsR - 0.002, y: bore - 0.004, z: hsZ0 - 0.03 - i * 0.022 });
    v.dispose();
  }
  // Carry handle over the barrel.
  const handle = extrude(
    [[0.0, 0], [0.012, 0], [0.012, 0.03], [0.1, 0.034], [0.11, 0], [0.122, 0], [0.114, 0.046], [-0.004, 0.042]],
    0.014,
    { bevel: 0.002 }
  );
  body.add(handle, 'polymer', { x: 0.02, y: bore + 0.012, z: -0.48, ry: -Math.PI / 2 });
  handle.dispose();
  addBipod(body, bore - 0.03, -0.49, { len: 0.19 });

  /* ---- optic: the rifle's tube dot on the cover rail ----------------------- */
  const opticY = railTop + 0.038;
  const optic = buildOptic(body, {
    rTube: 0.0155, len: 0.052, hood: 0.007, y: opticY, z: -0.06, railTop, matBody: 'alu_fine', matSteel: 'steel',
  });

  /* ---- the box + belt (magazine part) ---------------------------------------- */
  const magazine = new Assembly('lmg-box');
  const boxW = 0.06, boxH = 0.11, boxD = 0.1;
  const bx = box(boxW, boxH, boxD, 0.008, 3);
  magazine.add(bx, 'polymer_tan', { x: -0.012, y: -boxH / 2 - 0.012, z: 0 });
  bx.dispose();
  const lid = box(boxW + 0.002, 0.012, boxD + 0.002, 0.004, 2);
  magazine.add(lid, 'polymer', { x: -0.012, y: -0.012, z: 0 });
  lid.dispose();
  const strap = box(boxW + 0.004, 0.02, 0.006, 0.002, 1);
  magazine.add(strap, 'rubber', { x: -0.012, y: -boxH * 0.6, z: boxD / 2 - 0.006 });
  magazine.add(strap, 'rubber', { x: -0.012, y: -boxH * 0.6, z: -boxD / 2 + 0.006 });
  strap.dispose();
  // Belt: a run of linked rounds from the box up the left flank into the tray.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const r = cartridge(0.051, 0.006, 0.022);
    const pos = { x: -0.03 - 0.006 * Math.sin(t * Math.PI), y: -0.004 + t * 0.07, z: -0.03 - i * 0.0095, rz: 0, ry: -Math.PI / 2 };
    magazine.add(r.brass, 'brass', { ...pos, ry: Math.PI / 2, x: pos.x + 0.02 });
    magazine.add(r.bullet, 'copper', { ...pos, ry: Math.PI / 2, x: pos.x + 0.02 });
    r.brass.dispose();
    r.bullet.dispose();
    const link = box(0.004, 0.012, 0.009, 0.0008, 1);
    magazine.add(link, 'alu', { x: pos.x - 0.002, y: pos.y, z: pos.z });
    link.dispose();
  }

  const bolt = new Assembly('lmg-bolt');
  const bc = rodZ(0.012, 0.012, 0.08, 16, 0.001);
  bolt.add(bc, 'steel_bright', { z: -0.04 });
  bc.dispose();

  const trigger = new Assembly('lmg-trigger');
  const trg = triggerPart('steel_bright');
  trigger.add(trg.geo, 'steel_bright', {});
  trg.geo.dispose();

  const grips = rifleGrips(hsR, handZ, bore - 0.01);
  return {
    id: 'lmg',
    label: 'BUZZARD 762',
    fxClass: 'lmg',
    body,
    moving: { magazine, bolt, trigger },
    nodes: {
      muzzle: [0, bore, muzzle.crownZ],
      chamber: [0, bore, -0.02],
      eject: [0.01, bore - recH / 2 - 0.01, -0.02],
      ejectDir: [0.3, -0.8, 0.2],
      sight: [0, opticY, optic.lensZ],
      sightAxis: [0, 0, -1],
      ironSight: [0, opticY, optic.lensZ],
      gripR: grips.gripR,
      gripL: grips.gripL,
      handguard: { axis: [0, bore - 0.01, 0], dir: [0, 0, 1], r: hsR, z0: hsZ0, z1: hsZ1 },
      magSeat: { pos: [0, bore - 0.006 - recH / 2, -0.07], rot: [0, 0, 0] },
      magDrop: [0, -0.4, 0.02],
      boltRest: { pos: [0, bore, 0.03], rot: [0, 0, 0] },
      boltTravel: [0, 0, 0.06],
      triggerPivot: { pos: [0, 0.0455, -0.0055], rot: [0, 0, 0] },
      triggerPull: -0.34,
      opticGlass: optic,
    },
    shell: { caseLen: 0.051, rimR: 0.006 },
    magSize: { len: 0.12, w: 0.06, d: 0.1 },
  };
}
