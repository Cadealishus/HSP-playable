import { MissionMode, obj } from './_core.js';
import { MISSION_INFO } from '../missions.js';

/**
 * FLIGHT 717 (mission `flight717`, map HOLDING PATTERN / airport).
 *
 * Hijackers hold Port Ellery International and Flight 717 at Gate 12, with
 * passengers aboard. Doug breaches the terminal from the kerb, clears check-in,
 * fights through to the gate, boards the aircraft (jet bridge to door L1, or the
 * belt loader and the cargo hatch), clears the cabin without shooting the
 * passengers cowering in their seats, and removes the self-appointed captain,
 * who is using the pilot as a shield in the cockpit.
 *
 * Every spot comes from the map's anchors (src/world/maps/airport/modes.js,
 * authored in level metres and published in world space: the level is rotated a
 * quarter turn, so nothing here does its own coordinate maths). Volumes are
 * cylinders around anchors, or the cabin Box3 built from its two corners.
 *
 * Rules: passengers are civilians (ai.spawnCivilian, behaviour 'cower'); three
 * hits from Doug and Command pulls him out; killing one is an immediate fail.
 * The pilot is a VIP (the leader holds him: ai.spawn(..., { holding })).
 */


export class Flight717Mission extends MissionMode {
  static id = 'flight717';
  static label = 'FLIGHT 717';
  static par = 660;
  static civLimit = 3;
  static loadout = MISSION_INFO.flight717.loadout;

  startSpot() {
    return this.anchorSpot('kerbStart');
  }

  build() {
    const A = this.anchors;
    const list = (name) => (Array.isArray(A[name]) ? A[name] : []);
    const spot = (name) => A[name] ?? null;
    const holdAt = (s, r = 2.5) => ({ kind: 'hold', pos: s?.pos ?? s, radius: r });
    const cyl = (name, r, h = 2.6) => {
      const s = spot(name);
      return s ? { pos: s.pos ?? s, r, h } : null;
    };
    let cabinBox = null;
    if (A.cabinMin && A.cabinMax) {
      const a = A.cabinMin;
      const b = A.cabinMax;
      cabinBox = this.box(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    this.points = {
      entryZone: cyl('entryHall', 7, 3),
      gateZone: cyl('gateLounge', 7, 3),
      cabinBox,
    };
    const pts = this.points;
    this._paxTotal = list('cabinSeats').length + 1;

    const encounters = {
      terminal: {
        members: list('terminalPosts').map((s, i) => ({
          at: s,
          role: ['rifleman', 'smg', 'rifleman', 'shotgun'][i % 4],
          weapon: i === 3 ? 'shotgun' : undefined,
          order: holdAt(s, 3),
          alert: i === 3 ? 'attack' : 'hunt',
        })),
      },
      gate: {
        members: list('gatePosts').map((s, i) => ({
          at: s,
          role: ['rifleman', 'smg', 'sniper', 'rifleman', 'smg'][i % 5],
          weapon: i === 2 ? 'marksman' : undefined,
          order: i === 3 ? { kind: 'hunt' } : holdAt(s, 2.5),
          alert: i === 2 ? 'stay' : 'hunt',
        })),
      },
      bridge: {
        members: spot('bridgePost') ? [{ at: spot('bridgePost'), role: 'shotgun', weapon: 'shotgun', order: holdAt(spot('bridgePost'), 1.5), snap: false }] : [],
      },
      // The cabin crew of the hijack, and the passengers they are sitting on.
      cabin: {
        members: list('cabinPosts').map((s, i) => ({
          at: s,
          role: i === 4 ? 'shotgun' : i % 2 ? 'smg' : 'rifleman',
          weapon: i === 4 ? 'shotgun' : i % 2 ? 'smg' : 'carbine',
          order: holdAt(s, 1.2),
          alert: 'stay',
          snap: false,
        })),
        onEnsure: (m) => m._boardPassengers(),
      },
      cockpit: {
        members: spot('cockpit')
          ? [{ at: spot('cockpit'), role: 'commander', weapon: 'pistol', tag: 'leader', name: 'THE CAPTAIN', holding: 'pilot', order: holdAt(spot('cockpit'), 0.8), alert: 'stay', snap: false }]
          : [],
        onEnsure: (m) => m._seatPilot(),
      },
    };

    const objectives = [
      obj.reach('breach', 'BREACH THE TERMINAL', pts.entryZone, {
        at: 'entryHall',
        markerName: 'BREACH',
        spawn: ['terminal'],
        complete: (m) => m.say('You are in the terminal. Command reminds you that liquids over one hundred millilitres remain prohibited.', 'Noted.'),
      }),
      obj.clear('terminal', 'CLEAR THE TERMINAL', 'terminal', {
        complete: (m) => m.say('Terminal clear. Check-in is closed. It was always going to be closed.', null),
      }),
      obj.reach('gate', 'FIGHT THROUGH TO GATE 12', pts.gateZone, {
        at: 'gateDesk',
        checkpoint: () => this.anchorSpot('checkIn'),
        spawn: ['gate'],
        start: (m) => m.say('Gate 12 is past the escalators. They will have the overlook. Command recommends not standing where the overlook can see you.', 'Sure.'),
        complete: (m) => m.say('Gate 12. Flight 717 is boarding. Unfortunately it is boarding hijackers.', null),
      }),
      obj.clear('gatefight', 'CLEAR THE GATE', 'gate', {
        complete: (m) => m.say('Gate clear. Command has asked the desk to stop announcing the final call.', null),
      }),
      obj.reach('board', 'BOARD FLIGHT 717', () => pts.cabinBox, {
        at: 'doorL1',
        markerName: 'BOARD',
        checkpoint: () => this.anchorSpot('gateLounge'),
        spawn: ['bridge', 'cabin', 'cockpit'],
        start: (m) => {
          m.say('Ladies and gentlemen, this is your new captain speaking. We will be departing never.', null, 'hijacker');
          m.say('Doug, board by the jet bridge to door L1, or come up through the cargo hatch under the aft galley. There are passengers in the seats. They are not part of the operation.', 'Copy.');
        },
        complete: (m) => m.say('You are aboard. Keep your fire in the aisle. The passengers have paid for those seats.', 'Aisle.'),
      }),
      obj.clear('cabin', 'CLEAR THE CABIN · DO NOT SHOOT THE PASSENGERS', 'cabin', {
        sub: (m) => `HOSTILES ${m.groupAlive('cabin')} · PASSENGERS UNHARMED ${m._paxUnharmed()}/${m._paxTotal}`,
        complete: (m) => {
          m.say('Cabin clear. The passengers are being asked to remain seated, which they had already decided to do.', null);
          m.say("You'll never take this aircraft! I am the captain now!", null, 'hijacker');
        },
      }),
      obj.kill('leader', 'TAKE THE SHOT · ELIMINATE THE HIJACKER', 'leader', {
        spawn: ['cockpit'],
        checkpoint: () => this.anchorSpot('cabinMid'),
        markerName: 'TARGET',
        start: (m) => m.say('The leader is in the cockpit with the pilot. Command needs the pilot. Nobody else here knows how to park it.', 'One shot.'),
        complete: (m) => m.say('Hijacker down. Pilot unharmed. Flight 717 is cleared for departure. It is not departing.', 'Good.'),
      }),
    ];

    const intro = [
      ['Doug, Command. Flight 717 to Ostend has been hijacked at Gate 12. The hijackers also hijacked the airport, to be thorough.', 'Copy.'],
      ['There are passengers aboard. Command would like the same number of passengers back, in the same condition.', null],
      ['Phase one: board. Phase two: everyone remains seated, except Doug.', 'Noted.'],
    ];
    return { encounters, objectives, intro };
  }

  /** Passengers cowering in the window seats, plus a crew member in the galley. */
  _boardPassengers() {
    if (this._boarded) return;
    this._boarded = true;
    const seats = Array.isArray(this.anchors.cabinSeats) ? this.anchors.cabinSeats : [];
    seats.forEach((s, i) => this.spawnCivilian(`pax${i + 1}`, s, { behavior: 'cower', name: PAX_NAMES[i % PAX_NAMES.length] }));
    if (this.anchors.galleyCrew) this.spawnCivilian('crew', this.anchors.galleyCrew, { behavior: 'cower', name: 'CABIN CREW' });
  }

  _seatPilot() {
    if (this.civs.has('pilot') || !this.anchors.pilotSpot) return;
    this.spawnCivilian('pilot', this.anchors.pilotSpot, { behavior: 'hostage', vip: true, name: 'FIRST OFFICER' });
  }

  _paxUnharmed() {
    let n = 0;
    for (const [c, r] of this._civRecs) if (!r.vip && !r.down && !r.hit && c.alive !== false) n++;
    return n;
  }

  onCivHit(civ, rec) {
    if (rec) rec.hit = true;
  }

  onCivLost(civ, rec) {
    this.stats.paxLost = (this.stats.paxLost ?? 0) + 1;
    this.say('A passenger has been hit by hostile fire. Command will be writing the letter. Command is not good at letters.', null);
  }

  onKill(rec) {
    if (rec.tag === 'leader') return;
    if (rec.group === 'cabin' && this.groupAlive('cabin') === 1) this.say('One left in the cabin. He has started saying "please".', null);
  }

  successLine() {
    const lost = this.stats.paxLost ?? 0;
    return lost
      ? `Flight 717 recovered with ${lost} passenger ${lost === 1 ? 'casualty' : 'casualties'}. Command is calling it a partial refund.`
      : 'Flight 717 recovered with every passenger aboard. The airline has offered Doug a voucher. It expires tomorrow.';
  }

  failLine(reason) {
    if (reason === 'vip') return 'The pilot did not survive. Flight 717 is now a very expensive building.';
    if (reason === 'civilians') return 'Passengers were harmed by ESF fire. The airline is no longer offering Doug a voucher.';
    if (reason === 'kia') return 'Doug was lost aboard Flight 717. His seat has been reallocated.';
    return null;
  }

  onSuccess() {
    this.say('All units, Flight 717 is secure. Doug, please do not take the blanket.', 'Fine.', 'command', 5);
  }
}

const PAX_NAMES = ['PASSENGER 14A', 'PASSENGER 17F', 'PASSENGER 20A', 'PASSENGER 22F', 'PASSENGER 25A', 'PASSENGER 28F', 'PASSENGER 30A', 'PASSENGER 32F', 'PASSENGER 34A', 'PASSENGER 36F'];

export default Flight717Mission;
