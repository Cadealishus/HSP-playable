import * as THREE from 'three';
import { MissionMode, obj } from './_core.js';
import { MISSION_INFO } from '../missions.js';

/**
 * HOSTAGE TAKER (mission `hostage`, map THE RESIDENCE / estate). Night.
 *
 * A VIP is held in the residence on the hill. Doug comes in through the front
 * gate, clears the court, enters the house, clears the ground floor and finds
 * the hostage-taker in the library holding the VIP as a shield
 * (`ai.spawn(..., { holding: civ })`): one precise shot, before his nerve goes.
 * Then the alarm, a response team from the back of the estate, and the walk to
 * the west-lawn LZ with the VIP following (`spawnCivilian` behaviour 'follow').
 *
 * The map's level yaw is 0 (level metres are world metres; y: court 0, ground
 * floor 3.4). Anchors used: insertion, entryPoints, rooms, patrolRoutes,
 * extractionLZ, estate, guardPost. Encounter spots are authored from
 * src/world/maps/estate/layout.js, behind doors and walls; the chassis also
 * refuses any spot in Doug's view.
 *
 * Fail: Doug down; the VIP killed (by anyone); two hits on the VIP from Doug;
 * standing in the library too long without taking the shot (the taker's nerve
 * is on a difficulty-scaled clock).
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
const at = (x, y, z, dx = 0, dz = -1) => ({ pos: V(x, y, z), yaw: yawOf(dx, dz) });
const hold = (x, y, z, r = 2.5) => ({ kind: 'hold', pos: V(x, y, z), radius: r });
const G = 3.4;

/** Seconds the taker holds his nerve once Doug is in the room, by difficulty. */
const NERVE = { recruit: 22, regular: 15, hardened: 11, veteran: 8 };

export class HostageMission extends MissionMode {
  static id = 'hostage';
  static label = 'HOSTAGE TAKER';
  static par = 600;
  static civLimit = 2;
  static loadout = MISSION_INFO.hostage.loadout;

  startSpot() {
    return this.anchors.insertion?.front ?? at(0, 0, 53);
  }

  build() {
    const A = this.anchors;
    const lz = A.extractionLZ ?? { pos: V(-27, 0, 40), radius: 5 };
    this.points = {
      insideGate: this.box(-44, -0.5, -36, 44, 6, 46.5),
      courtCheckpoint: at(1.5, 0, 44.5, 0, -1),
      hallBox: this.box(-6, G - 0.5, -10, 6, G + 3, 0),
      hallCentre: at(2.5, G, -4, -1, 0),
      library: this.box(-25.6, G - 0.5, -5.6, -16.4, G + 3, 0),
      libraryDoor: at(-21, G, -7.4, 0, 1),
      lz: { pos: lz.pos, r: (lz.radius ?? 5) + 1, h: 3 },
      // the walk out: library -> west corridor -> side door -> west garden ->
      // west stair -> the lawn
      escortPath: [V(-21, G, -7.5), V(-27.5, G, -7.5), V(-35, G, -8), V(-38, G, -1), V(-38, 0, 13), V(-30, 0, 30), lz.pos.clone()],
    };
    const pts = this.points;
    const routes = A.patrolRoutes ?? {};

    const encounters = {
      // The court: the guard post, two behind the hedges, one on the terrace,
      // one walking the court loop. Doug is outside a 3 m wall.
      court: {
        members: [
          { at: A.guardPost ? { pos: A.guardPost, yaw: yawOf(-1, 0) } : at(10.5, 0, 42.3, -1, 0), role: 'smg', order: hold(10.5, 0, 42.3, 1.5), alert: 'attack' },
          { at: at(-12, 0, 27, 1, 0), role: 'rifleman', order: hold(-9, 0, 27) },
          { at: at(12, 0, 25, -1, 0), role: 'rifleman', order: hold(9, 0, 26) },
          { at: at(-12, G, 5, 0, 1), role: 'marksman', weapon: 'marksman', order: hold(-10, G, 6, 1.5), alert: 'stay' },
          { at: at(-20, 0, 13, 1, 0), role: 'rifleman', order: routes.court ? { kind: 'patrol', pos: routes.court } : hold(-8, 0, 26) },
        ],
      },
      // Inside: corridors, the office, the kitchen, the security room.
      house: {
        members: [
          { at: at(-14, G, -7.5, 1, 0), role: 'smg', order: hold(-12, G, -7.5, 1.5) },
          { at: at(14, G, -7.5, -1, 0), role: 'rifleman', order: hold(12, G, -7.5, 1.5) },
          { at: at(-11, G, -3, 1, 0), role: 'shotgun', weapon: 'shotgun', order: hold(-11, G, -3, 1.5), alert: 'attack' },
          { at: at(17, G, -3, -1, 0), role: 'rifleman', order: hold(16.5, G, -3, 1.5) },
          { at: at(8, G, -3, 0, -1), role: 'smg', order: hold(8, G, -3, 1), tag: 'security', name: 'NIGHT SECURITY' },
        ],
      },
      // The library: the hostage-taker and his shield.
      library: {
        members: [{ at: at(-21, G, -1.6, 0, -1), role: 'commander', weapon: 'pistol', tag: 'taker', name: 'THE HOSTAGE TAKER', holding: 'vip', order: hold(-21, G, -1.6, 0.6), alert: 'stay', snap: false }],
        onEnsure: (m) => m._placeVip(),
      },
      // The response team, from the back of the estate once the alarm goes.
      response: {
        members: [
          { at: at(0, 0, -34, 0, 1), role: 'rifleman', order: { kind: 'hunt' } },
          { at: at(36, 0, -24, -1, 0), role: 'smg', order: { kind: 'hunt' } },
          { at: at(-30, 0, -34, 1, 0), role: 'rifleman', order: { kind: 'hunt' } },
          { at: at(36, 0, -16, -1, 0), role: 'shotgun', weapon: 'shotgun', order: { kind: 'hunt' } },
        ],
      },
    };

    const objectives = [
      obj.reach('gate', 'GET PAST THE GATE', pts.insideGate, {
        at: () => this.anchors.entryPoints?.frontGate ?? at(1.5, 0, 48.2),
        spawn: ['court'],
        complete: (m) => m.say('You are inside the wall. Command notes that the sign said "by appointment" and Doug did not have one.', 'I do now.'),
      }),
      obj.clear('court', 'CLEAR THE FRONT COURT', 'court', {
        complete: (m) => m.say('Court clear. The fountain is still running. Command finds that reassuring.', null),
      }),
      obj.reach('house', 'ENTER THE RESIDENCE', pts.hallBox, {
        at: () => this.anchors.entryPoints?.frontDoor ?? at(0, G, 0.1),
        markerName: 'ENTER',
        checkpoint: pts.courtCheckpoint,
        spawn: ['house', 'library'],
        start: (m) => m.say('Front door is up the grand stair. Command recommends using it, since it is there.', 'Sure.'),
        complete: (m) => m.say('You are in. The VIP is somewhere on the ground floor. Intelligence says "a room with books".', 'Library.'),
      }),
      obj.clear('ground', 'CLEAR THE GROUND FLOOR', 'house', {
        complete: (m) => m.say('Ground floor clear. One left: the library. He has the VIP.', 'Copy.'),
      }),
      obj.kill('rescue', 'RESCUE THE VIP · TAKE THE SHOT', 'taker', {
        spawn: ['library'],
        checkpoint: pts.hallCentre,
        markerName: 'TARGET',
        start: (m) => {
          m._nerve = NERVE[m.session.difficulty] ?? NERVE.regular;
          m._inRoomT = 0;
          m._warned = false;
          m.say('He is using the VIP as a shield. Command needs you to hit the part of him that is not the VIP.', 'One shot.');
        },
        update: (m, dt) => m._tickRescue(dt),
        complete: (m) => {
          m.say('Hostage-taker down. The VIP is unharmed and has asked to speak to a manager.', 'Later.');
          m._freeVip();
        },
      }),
      obj.reach('escort', 'ESCORT THE VIP TO THE LZ', pts.lz, {
        markerName: 'LZ',
        spawn: ['response'],
        escort: (m) => m.civs.get('vip') ?? null,
        sub: (m) => m._escortSub(),
        start: (m) => {
          m.alarm = m.world?.setAlarm?.(true) ?? true;
          m.say('The house alarm is going off. It is a recording of a dog. A response team is moving in from the back of the estate.', 'Noted.');
          m.say('Extraction is the west lawn. Keep the VIP with you. He walks at the speed of a man who has never walked anywhere.', 'Copy.');
        },
        update: (m) => m._tickEscort(),
        complete: (m) => m.say('VIP at the LZ. The helicopter is inbound. It is a small helicopter. Command apologises for the helicopter.', 'Fine.'),
      }),
    ];

    const intro = [
      ['Doug, Command. A VIP is being held at the Residence. He is the Deputy Undersecretary for Agricultural Exports. Command did not know that was a job either.', 'Copy.'],
      ['One hostage-taker, several friends. The VIP must come back alive. Command has promised him to a committee.', null],
      ['Phase one: ring the bell. Phase two: Doug.', 'Noted.'],
    ];
    return { encounters, objectives, intro };
  }

  /** The VIP stands where the taker will hold him (spawned before the taker). */
  _placeVip() {
    if (this.civs.has('vip')) return;
    this.spawnCivilian('vip', at(-21, G, -2.5, 0, -1), { behavior: 'hostage', vip: true, name: 'THE VIP' });
  }

  _tickRescue(dt) {
    const done = this._ensuredTag('taker') && !this.tagged.get('taker');
    if (done) return true;
    if (this.inside(this.points.library)) {
      this._inRoomT += dt;
      if (!this._warned && this._inRoomT > this._nerve * 0.5) {
        this._warned = true;
        this.say('Stay back! I have the VIP and I am not afraid to keep holding him!', null, 'hostage taker', 4);
        this.say('He is getting nervous, Doug. Command recommends the shot within the next several seconds.', null);
      }
      if (this._inRoomT >= this._nerve) this._executeVip();
    }
    return false;
  }

  /** The taker's nerve went: the VIP is shot, through the AI's damage path. */
  _executeVip() {
    const vip = this.civs.get('vip');
    const taker = this.tagged.get('taker');
    if (vip && vip.alive !== false) {
      this.ctx.events.emit('damage:dealt', { target: vip, amount: 1e6, headshot: false, killed: false, point: vip.position, source: taker ?? null });
    }
    this.fail('vip', 'He has shot the VIP. Command needed that shot to come from the other direction.', '...');
  }

  /** Release the VIP and set him to follow Doug. */
  _freeVip() {
    const vip = this.civs.get('vip');
    if (!vip || vip.alive === false) return;
    const target = 'player';
    if (this.setCivBehavior(vip, 'follow', { target })) return;
    // No behaviour switch in this AI build: re-issue the same man as a follower
    // on the spot he stands on (an in-place swap; Doug is with him). Only where
    // the AI can remove the old one, so there are never two VIPs.
    const ai = this.ctx.peek('ai');
    if (typeof ai?.despawnCivilian !== 'function') {
      console.warn('[mission:hostage] the AI cannot switch a civilian to follow; the VIP stays put');
      return;
    }
    const pos = vip.position.clone();
    ai.despawnCivilian(vip);
    this.civs.delete('vip');
    this._civRecs.delete(vip);
    this.spawnCivilian('vip', { pos, yaw: 0 }, { behavior: 'follow', target, vip: true, name: 'THE VIP' });
  }

  _vipDist() {
    const vip = this.civs.get('vip');
    const p = this.playerPos();
    if (!vip?.position || !p) return Infinity;
    return Math.hypot(vip.position.x - p.x, vip.position.z - p.z);
  }

  _escortSub() {
    const d = this._vipDist();
    return Number.isFinite(d) ? (d > 8 ? `VIP ${Math.round(d)} M BEHIND · WAIT FOR HIM` : 'VIP WITH YOU') : '';
  }

  _tickEscort() {
    const vip = this.civs.get('vip');
    if (!vip || vip.alive === false) return false;
    const d = this._vipDist();
    if (d > 25 && !this._laggedWarned) {
      this._laggedWarned = true;
      this.say('Doug, you have left the VIP behind. He has been told to keep up and has taken it personally.', 'Waiting.');
    } else if (d < 10) this._laggedWarned = false;
    return this.inside(this.points.lz) && this.inside(this.points.lz, vip.position);
  }

  onKill(rec) {
    if (rec.tag === 'security') this.say('That was night security. Command would like to know who hired them and whether they are available.', null);
  }

  successLine() {
    return 'The VIP has been returned to the committee in his original condition. The committee has asked if he can be returned again.';
  }

  failLine(reason) {
    if (reason === 'vip') return 'The VIP did not survive. Command is drafting a letter to Agricultural Exports, who will be unaffected.';
    if (reason === 'civilians') return 'Doug hit the VIP. Twice. Command would like to discuss the difference between the VIP and the man holding him.';
    if (reason === 'kia') return 'Doug was lost at the Residence. Visitors remain by appointment.';
    return null;
  }

  onSuccess() {
    this.say('Wheels up. Operation complete. The Residence is accepting appointments again.', 'Good.', 'command', 5);
  }

  dispose() {
    try {
      if (this.alarm) this.world?.setAlarm?.(false);
    } catch {
      /* world gone */
    }
    super.dispose();
  }
}

export default HostageMission;
