import * as THREE from 'three';
import { MissionMode, obj } from './_core.js';
import { MISSION_INFO } from '../missions.js';

/**
 * OPERATION LAST TRAIN (mission `underground`, map UNDERGROUND).
 *
 * Grand Arcade station, closed in 1998 "for a few weeks". Hostiles run a
 * command facility under the platforms. Doug goes down from the street, takes
 * the ticket hall, reaches Platform A (where they cut the mains), throws the
 * power back on at the south electrical room, clears both platforms, pushes the
 * east tunnel (ambush in the abandoned train), breaches the command facility,
 * switches off the comms console and leaves by shaft E-3 with a rearguard on
 * his heels.
 *
 * The map's level yaw is 0, so level metres ARE world metres: the encounter
 * spots below are authored straight from src/world/maps/underground/layout.js
 * (y: street 15, hall 10, platform 5.1, track 4, deep 0). The named anchors
 * (entry, ticketHall, platformA, powerSwitch, lightsFailTrigger, serviceRamp,
 * commandFacility, commsConsole, extraction, ambushSpots) come from the map.
 *
 * Every squad spot is behind a door, inside the tunnel train, round a corner or
 * a level away from where Doug is when it spawns; the chassis also refuses any
 * spot in his view.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
const at = (x, y, z, dx = 0, dz = 1) => ({ pos: V(x, y, z), yaw: yawOf(dx, dz) });
const hold = (x, y, z, r = 2.5) => ({ kind: 'hold', pos: V(x, y, z), radius: r });

const P = 5.1;
const T = 4.0;
const H = 10;

export class UndergroundMission extends MissionMode {
  static id = 'underground';
  static label = 'OPERATION LAST TRAIN';
  static par = 720;
  static civLimit = 0;
  static loadout = MISSION_INFO.underground.loadout;

  startSpot() {
    return this.anchorSpot('entry') ?? at(-49.5, 15, -46.5, 0, 1);
  }

  build() {
    const A = this.anchors;
    const amb = A.ambushSpots ?? [];
    const ambush = (i, fallback) => amb[i] ?? fallback;
    this.points = {
      hallBox: this.box(-62, H - 1, -32, -30, H + 4, -12),
      platformBox: this.box(-20, P - 1, -14.5, 40, P + 3.5, -7.9),
      rampTop: this.box(71.5, T - 1, 1.5, 76.5, T + 3, 9),
      rampTopCentre: at(74, T - 0.2, 4.5, 0, 1),
      hallCheckpoint: at(-33, H, -14, 1, 0),
      platformCheckpoint: at(-16, P, 5, 1, 0),
      rampCheckpoint: at(74, T, 1.5, 0, 1),
      facilityCheckpoint: at(52, 0, 30.5, 0, 1),
      extractionZone: { pos: A.extraction?.pos ?? V(92, 0, 41.8), r: 3, h: 2.5 },
    };
    const pts = this.points;

    const encounters = {
      // Ticket hall: four holding the gate line. Doug is on the street (5 m up,
      // behind the stair's roof) when they spawn.
      hall: {
        members: [
          { at: at(-38, H, -28, -1, 0), role: 'rifleman', order: hold(-38, H, -27) },
          { at: at(-58, H, -28, 1, 0), role: 'smg', order: hold(-57, H, -27) },
          { at: at(-42, H, -16, 0, -1), role: 'rifleman', order: hold(-43, H, -17) },
          { at: at(-56, H, -14, 0, -1), role: 'shotgun', weapon: 'shotgun', order: hold(-55, H, -15), alert: 'attack' },
        ],
      },
      // Platforms: they come out of the service rooms either side and take up
      // positions on platform B and the tracks. Spawned while Doug is upstairs.
      platforms: {
        members: [
          { at: at(-12, P, 10, 1, 0), role: 'rifleman', order: hold(-4, P, 5) },
          { at: at(19, P, 15.5, 0, -1), role: 'smg', order: hold(22, P, 4.5) },
          { at: at(6, P, 15.5, 0, -1), role: 'rifleman', order: hold(8, P, 4) },
          { at: at(10, P, -16, 0, 1), role: 'shotgun', weapon: 'shotgun', order: hold(15, P, -11), alert: 'attack' },
          { at: at(25, P, -22, 0, 1), role: 'rifleman', order: hold(30, T, -3) },
          { at: at(-10, P, 16, 0, -1), role: 'smg', order: hold(-9, P, 15.5, 1.5), tag: 'electrician', name: 'THE ELECTRICIAN' },
        ],
      },
      // East tunnel ambush: inside the abandoned train, behind the trolley, at
      // the bulkhead. Woken when Doug walks into the tunnel mouth.
      tunnel: {
        members: [
          { at: ambush(0, at(64.5, P, -6.1, -1, 0)), role: 'rifleman', order: hold(64.5, P, -6.1, 1.5), snap: false },
          { at: ambush(1, at(55.5, T, 1.2, -1, 0)), role: 'smg', order: hold(55.5, T, 1.2, 1.5) },
          { at: ambush(2, at(81.5, T, 0.6, -1, 0)), role: 'lmg', weapon: 'lmg', order: hold(79, T, 0.6, 2) },
        ],
      },
      // Deep service tunnel, either side of the blast door.
      deep: {
        members: [
          { at: ambush(4, at(37, 0, 23.2, 1, 0)), role: 'rifleman', order: hold(44, 0, 23) },
          { at: ambush(5, at(61, 0, 22.2, -1, 0)), role: 'smg', order: hold(58, 0, 23) },
        ],
      },
      // The command facility. Spawned while Doug is on the ramp, behind the
      // facility walls; they hold until the blast door opens on them.
      facility: {
        members: [
          { at: at(40, 0, 35, 1, 0), role: 'rifleman', order: hold(40, 0, 35) },
          { at: at(44, 0, 48, 0, -1), role: 'smg', order: hold(46, 0, 46) },
          { at: at(58, 0.45, 47.5, 0, -1), role: 'commander', order: hold(56, 0.45, 47, 1.5), tag: 'supervisor', name: 'SHIFT SUPERVISOR', alert: 'stay' },
          { at: at(70, 0, 46, -1, 0), role: 'lmg', weapon: 'lmg', order: hold(68, 0, 45) },
          { at: at(66, 0, 34, -1, 0), role: 'rifleman', order: hold(64, 0, 35) },
          { at: at(74, 0, 53, -1, 0), role: 'shotgun', weapon: 'shotgun', order: hold(72, 0, 50), alert: 'attack' },
        ],
      },
      // The rearguard down the deep tunnel and the S2 stair, hunting.
      rearguard: {
        members: [
          { at: at(26, 0, 23, 1, 0), role: 'rifleman', order: { kind: 'hunt' } },
          { at: at(30, 2.6, 15, 0, 1), role: 'smg', order: { kind: 'hunt' } },
          { at: at(28, 0, 22.2, 1, 0), role: 'rifleman', order: { kind: 'hunt' } },
        ],
      },
    };

    const objectives = [
      obj.reach('descend', 'DESCEND TO THE TICKET HALL', pts.hallBox, {
        at: 'ticketHall',
        spawn: ['hall'],
        complete: (m) => m.say('You are in the ticket hall. Command reminds you that ESF does not reimburse fares.', "Wasn't going to."),
      }),
      obj.clear('hall', 'CLEAR THE TICKET HALL', 'hall', {
        marker: (m) => m.anchorSpot('fareGates')?.pos ?? null,
        complete: (m) => m.say('Ticket hall clear. The fare gates remain undefeated.', null),
      }),
      obj.reach('platform', 'GO DOWN TO PLATFORM A', pts.platformBox, {
        at: 'platformA',
        checkpoint: pts.hallCheckpoint,
        spawn: ['platforms'],
        start: (m) => m.say('Platform A is down the stair. Mind the gap. There is no train, so the gap is quite large.', 'Noted.'),
        complete: (m) => m._cutPower(),
        restore: (m) => m.setPower('emergency'),
      }),
      obj.interact('power', 'RESTORE POWER AT THE SWITCHBOARD', 'powerSwitch', 3, 'RESTORE MAINS POWER', {
        spawn: ['platforms'],
        complete: (m) => {
          m.setPower('normal');
          m.say("Power restored. The station's electricity bill is now technically ESF's problem.", 'Not mine.');
        },
        skip: (m) => m.setPower('normal'),
        restore: (m) => m.setPower('normal'),
      }),
      obj.clear('platforms', 'CLEAR THE PLATFORMS', 'platforms', {
        checkpoint: pts.platformCheckpoint,
        complete: (m) => m.say('Platforms clear. The next train is still not coming.', 'Figured.'),
      }),
      obj.reach('tunnel', 'PUSH THROUGH THE EAST TUNNEL', pts.rampTop, {
        at: 'serviceRamp',
        start: (m) => m.say('The facility is through the east tunnel and down the service ramp. The tunnel section runs on battery. It has run on battery since 1998. It is very tired.', null),
        update: (m) => {
          if (!m._tunnelSprung && (m.inside(A.lightsFailTrigger) || m.inside(A.tunnelAmbush?.[0]))) {
            m._tunnelSprung = true;
            m.ensure('tunnel');
            m.alert('tunnel');
            m.say('Movement in the tunnel train. Command would like to stress that it is not a passenger service.', 'Copy.');
          }
          return m.inside(pts.rampTop);
        },
        complete: (m) => m.say('Ramp secured. The facility is at the bottom. Command expects resistance and has expected it confidently.', null),
      }),
      obj.reach('breach', 'BREACH THE COMMAND FACILITY', 'commandFacility', {
        at: 'blastDoor',
        markerName: 'BREACH',
        checkpoint: pts.rampCheckpoint,
        spawn: ['deep', 'facility'],
        complete: (m) => m.say("You're in. Command would like a copy of their floor plan. Purely for envy.", null),
      }),
      obj.clear('secure', 'SECURE THE COMMAND FACILITY', 'facility', {
        complete: (m) => m.say('Facility secure. Find the comms console and switch it off. Not off and on again. Off.', 'Off.'),
      }),
      obj.interact('console', 'SHUT DOWN THE COMMS CONSOLE', 'commsConsole', 4, 'SHUT DOWN THE CONSOLE', {
        checkpoint: pts.facilityCheckpoint,
        spawn: ['facility'],
        complete: (m) => m.say('Console offline. It was running a screensaver of a fish. Intelligence is analysing the fish.', "It's a fish."),
      }),
      obj.reach('extract', 'EXTRACT VIA SHAFT E-3', pts.extractionZone, {
        markerName: 'EXTRACT',
        spawn: ['rearguard'],
        start: (m) => m.say('Extraction is shaft E-3. Hostiles are coming down the service tunnel behind you. Command suggests a brisk but dignified pace.', 'Brisk.'),
      }),
    ];

    const intro = [
      ['Doug, Command. Operation Last Train. Hostiles have occupied Grand Arcade station, closed in 1998 for "a few weeks".', 'Copy.'],
      ['They are running something from a command facility under the platforms. Intelligence would like to know how they got planning permission.', null],
      ['Phase one: go downstairs. Phase two: Doug.', 'Noted.'],
    ];
    return { encounters, objectives, intro };
  }

  /** world.setPower through one door, so the state is known (debug/tests read it). */
  setPower(mode) {
    const r = this.world?.setPower?.(mode);
    this.power = typeof r === 'string' ? r : mode;
    return this.power;
  }

  _cutPower() {
    this.setPower('emergency');
    this.say('Someone has turned the station off.', 'Noticed.');
    this.say('The mains switchboard is in the south electrical room, through the maintenance corridor. Command has been told it is the big one.', 'Copy.');
  }

  onKill(rec) {
    if (rec.tag === 'electrician') this.say('That was their electrician. Command is confident nobody else knew how the switchboard worked either.', null);
    else if (rec.tag === 'supervisor') this.say('The shift supervisor is down. Their rota is now everyone\'s problem.', null);
  }

  successLine() {
    return 'Operation Last Train complete. The command facility is closed, like the rest of the station.';
  }

  failLine(reason) {
    return reason === 'kia' ? 'Doug was lost below Grand Arcade. Command has added him to the list of things the station is waiting for.' : null;
  }

  onSuccess() {
    this.say('Doug is out. Operation Last Train is complete. The last train remains, as ever, not coming.', 'Good.', 'command', 5);
  }

  dispose() {
    // Leave the station as the map builds it.
    try {
      if (this.power === 'emergency') this.world?.setPower?.('normal');
    } catch {
      /* world gone */
    }
    super.dispose();
  }
}

export default UndergroundMission;
