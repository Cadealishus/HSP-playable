import { MISSION_IDS, MISSION_MAP } from './session.js';

/**
 * SPECIAL OPERATIONS — the hook for `src/game/missions/<id>.js` (owned by the
 * MISSIONS area, docs/EXPANSION.md §8).
 *
 * The glob is resolved by Vite at build time, so a mission is offered exactly
 * when its module is in the build AND its map is in the registry: no module, no
 * menu entry. The module is loaded lazily on launch.
 *
 * A mission module exports (default, or any named export with `static id` equal
 * to the mission id) a class with the mode interface (§4): `init(ctx, session,
 * host)`, `start()`, `update(dt)`, `orderFor(agent)`, `hudState()`,
 * `onDeath(e)`, `onPlayerDeath(e)`, `interact(actor)`, `isOver() → {winner}`,
 * optional `lateUpdate(dt)`, `summary()` and `dispose()`; plus optional static
 * `label`, `briefing: [[k, v]...]` and `blurb` for the menu.
 */
const LOADERS = import.meta.glob('./missions/*.js');

/**
 * Menu copy, briefing rows, the issued kit and what each operation needs from
 * the AI. Static data so the menu never has to load a mission module; the
 * modules read their `loadout` from here too (one source).
 *
 * `requires`: AI capabilities (missionCaps below). A mission
 * whose requirement is missing in the running build is NOT offered: if the
 * menu lists it, it launches and it can be completed.
 */
export const MISSION_INFO = {
  underground: {
    label: 'OPERATION LAST TRAIN',
    blurb: 'Below the city, in the dark. Hostiles have moved into a station that closed in 1998. Command has provided a torch. Command has provided one torch.',
    briefing: [
      ['LOCATION', 'Grand Arcade station, Line 4. Closed "for a few weeks" in 1998.'],
      ['OBJECTIVE', 'Take the station. Shut down their command facility. Leave.'],
      ['PLAN', 'Phase one: go downstairs. Phase two: Doug.'],
      ['ASSETS', 'Doug. The stairs.'],
    ],
    loadout: { primary: 'smg', secondary: 'pistol', lethal: 'frag', tactical: 'flash' },
    requires: ['spawn'],
  },
  flight717: {
    label: 'FLIGHT 717',
    blurb: 'Port Ellery International. A hijacked airliner at Gate 12 with passengers aboard. Boarding is delayed.',
    briefing: [
      ['LOCATION', 'Port Ellery International. Gate 12. Flight 717 to Ostend.'],
      ['OBJECTIVE', 'Retake the terminal, board the aircraft, remove the hijackers.'],
      ['RULES', 'Passengers are not targets. Three hits and Command pulls you out.'],
      ['PLAN', 'Phase one: board. Phase two: remain seated, everyone except Doug.'],
    ],
    loadout: { primary: 'carbine_sd', secondary: 'pistol', lethal: 'frag', tactical: 'flash' },
    requires: ['spawn', 'civilians'],
  },
  hostage: {
    label: 'HOSTAGE TAKER',
    blurb: 'A private estate, at night. One VIP, several captors. Command asks that the VIP be returned undamaged, or at least recognisable.',
    briefing: [
      ['LOCATION', 'The Residence. Visitors by appointment. There are no appointments.'],
      ['OBJECTIVE', 'Get in. Find the VIP. Take the shot. Walk him to the LZ.'],
      ['RULES', 'The VIP must survive. He is being used as a shield. Aim accordingly.'],
      ['PLAN', 'Phase one: ring the bell. Phase two: Doug.'],
    ],
    loadout: { primary: 'rifle', secondary: 'pistol', lethal: 'frag', tactical: 'flash' },
    requires: ['spawn', 'civilians'],
  },
};

function loaderFor(id) {
  return LOADERS[`./missions/${id}.js`] ?? null;
}

/**
 * Missions whose module exists in this build, whose map is registered and
 * whose AI requirements the running build meets (`caps`: { spawn, orders,
 * civilians }; omitted = not checked, e.g. a Node test).
 */
export function availableMissions(maps, caps = null) {
  const ids = new Set((maps ?? []).map((m) => m.id));
  return MISSION_IDS.filter((id) => loaderFor(id) && ids.has(MISSION_MAP[id]))
    .filter((id) => !caps || (MISSION_INFO[id].requires ?? []).every((r) => caps[r]))
    .map((id) => ({
      id,
      map: MISSION_MAP[id],
      ...MISSION_INFO[id],
    }));
}

/** What the running AI offers missions (duck-typed). */
export function missionCaps(ctx) {
  const ai = ctx?.peek?.('ai');
  return {
    spawn: typeof ai?.spawn === 'function',
    orders: typeof ai?.setOrderProvider === 'function',
    civilians: typeof ai?.spawnCivilian === 'function',
  };
}

/** Load a mission's class. Resolves null when it is not in the build. */
export async function loadMission(id) {
  const load = loaderFor(id);
  if (!load) return null;
  const mod = await load();
  if (typeof mod.default === 'function') return mod.default;
  for (const v of Object.values(mod)) {
    if (typeof v === 'function' && (v.id === id || v.missionId === id)) return v;
  }
  return null;
}
