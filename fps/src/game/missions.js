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

/** Menu copy until a module publishes its own. */
export const MISSION_INFO = {
  underground: {
    label: 'UNDERGROUND',
    blurb: 'Below the city, in the dark. Command has provided a torch. Command has provided one torch.',
  },
  flight717: {
    label: 'FLIGHT 717',
    blurb: 'Port Ellery International. A hijacked airliner at the gate. Boarding is delayed.',
  },
  hostage: {
    label: 'HOSTAGE TAKER',
    blurb: 'A private estate. One hostage, several captors. Command asks that the hostage be returned undamaged.',
  },
};

function loaderFor(id) {
  return LOADERS[`./missions/${id}.js`] ?? null;
}

/** Missions whose module exists in this build and whose map is registered. */
export function availableMissions(maps) {
  const ids = new Set((maps ?? []).map((m) => m.id));
  return MISSION_IDS.filter((id) => loaderFor(id) && ids.has(MISSION_MAP[id])).map((id) => ({
    id,
    map: MISSION_MAP[id],
    ...MISSION_INFO[id],
  }));
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
