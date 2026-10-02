/**
 * SESSION — what the player launched (docs/EXPANSION.md §1).
 *
 * Plain data plus storage helpers, no three.js and no engine references, so
 * main.js can resolve the session BEFORE the engine boots (the world needs the
 * map id to build) and a Node test can import it.
 *
 * RESOLUTION ORDER
 *   1. URL params  `?mode=&map=&mission=&difficulty=`  (dev / capture only)
 *   2. localStorage `flopops.session`                  (what the menu wrote)
 *   3. defaults: survival on `town`
 *
 * LAUNCHING
 *   Menus launch by writing localStorage and calling `location.reload()` with
 *   NO query string: the shared artifact link strips query strings, so a
 *   `?map=` reload is exactly what cannot work there. `launchSession()` marks
 *   the stored session `pending`; the next boot resolves it, clears the flag
 *   (so a plain refresh returns to the menu) and the UI puts up a one-click
 *   deploy card, which is also the user gesture pointer lock needs.
 *
 * Every storage access is try/catch wrapped: a private window or a blocked
 * site-data policy throws on the accessor itself, and the game must still boot.
 */

export const SESSION_KEY = 'flopops.session';
/** The loadout the LOADOUT screen saved; every mode reads it. */
export const LOADOUT_KEY = 'flopops.loadout';
/** Settings persisted across the launch reload (quality, sensitivity, FOV, invert). */
export const SETTINGS_KEY = 'flopops.settings';
/** The pre-session map picker's key: still honoured so an old choice survives. */
export const LEGACY_MAP_KEY = 'flopops.map';

export const KINDS = ['mp', 'survival', 'mission'];
export const MP_MODE_IDS = ['tdm', 'dom', 'hp', 'sd'];
export const MODE_IDS = [...MP_MODE_IDS, 'survival'];
export const MISSION_IDS = ['underground', 'flight717', 'hostage'];
/** A mission forces its own map. */
export const MISSION_MAP = { underground: 'underground', flight717: 'airport', hostage: 'estate' };
export const DIFFICULTIES = ['recruit', 'regular', 'hardened', 'veteran'];

/**
 * Difficulty → AI skill offset and a 0..1 bot skill. `offset` is added to the
 * survival wave intensity (clamped 0..1); `skill` is what MP bots are given.
 */
export const DIFFICULTY = {
  recruit: { label: 'RECRUIT', offset: -0.25, skill: 0.15, blurb: 'Hostiles are recruits too. Command considers this fair.' },
  regular: { label: 'REGULAR', offset: 0, skill: 0.45, blurb: 'The standard ESF experience. Doug recommends it.' },
  hardened: { label: 'HARDENED', offset: 0.2, skill: 0.7, blurb: 'Hostiles aim first and apologise never.' },
  veteran: { label: 'VETERAN', offset: 0.4, skill: 0.95, blurb: 'Command has filed the paperwork in advance.' },
};

export const DEFAULT_LOADOUT = Object.freeze({ primary: 'carbine', secondary: 'pistol', lethal: 'frag', tactical: 'flash' });

export const DEFAULT_SESSION = Object.freeze({
  kind: 'survival',
  mode: 'survival',
  map: 'town',
  mission: null,
  loadout: DEFAULT_LOADOUT,
  difficulty: 'regular',
});

/* ------------------------------------------------------------------ storage */

function store(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJSON(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function param(params, name) {
  try {
    const v = params?.get?.(name);
    return v == null || v === '' ? null : String(v);
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- validation */

const mapIndex = (maps) => {
  const out = new Map();
  for (const m of maps ?? []) if (m?.id) out.set(m.id, m);
  return out;
};

/** Modes a registry map supports. No `modes` field yet = every mode but missions. */
export function mapModes(m) {
  if (!m) return [];
  if (Array.isArray(m.modes)) return m.modes;
  return m.missionOnly ? [] : MODE_IDS.slice();
}

/** True when `map` (registry entry) can host `mode`. */
export function mapSupports(m, mode) {
  return !!m && !m.missionOnly && mapModes(m).includes(mode);
}

/** Sanitise a loadout: string ids only, defaults for anything missing. */
export function normaliseLoadout(l) {
  const out = { ...DEFAULT_LOADOUT };
  if (l && typeof l === 'object') {
    for (const k of ['primary', 'secondary', 'lethal', 'tactical']) {
      if (typeof l[k] === 'string' && l[k]) out[k] = l[k];
    }
  }
  return out;
}

/**
 * Make a session self-consistent against the map registry: a mission forces
 * its map; a mode must be one the map supports (else the first map that
 * supports it; else survival on the town).
 */
export function normaliseSession(s, maps) {
  const idx = mapIndex(maps);
  const out = {
    kind: KINDS.includes(s?.kind) ? s.kind : DEFAULT_SESSION.kind,
    mode: MODE_IDS.includes(s?.mode) ? s.mode : null,
    map: typeof s?.map === 'string' ? s.map : null,
    mission: MISSION_IDS.includes(s?.mission) ? s.mission : null,
    loadout: normaliseLoadout(s?.loadout),
    difficulty: DIFFICULTIES.includes(s?.difficulty) ? s.difficulty : DEFAULT_SESSION.difficulty,
  };

  if (out.kind === 'mission') {
    const forced = out.mission ? MISSION_MAP[out.mission] : null;
    if (out.mission && forced && (idx.size === 0 || idx.has(forced))) {
      out.mode = null;
      out.map = forced;
      return out;
    }
    // Unknown mission or its map is not built: fall back to survival.
    out.kind = 'survival';
    out.mission = null;
  }
  out.mission = null;

  if (out.kind === 'survival') out.mode = 'survival';
  else if (!out.mode || out.mode === 'survival') {
    out.kind = out.mode === 'survival' ? 'survival' : 'mp';
    out.mode = out.mode ?? 'tdm';
  }
  if (out.mode === 'survival') out.kind = 'survival';

  if (idx.size) {
    let m = idx.get(out.map);
    if (!mapSupports(m, out.mode)) {
      m = [...idx.values()].find((e) => mapSupports(e, out.mode)) ?? null;
      if (!m) {
        out.kind = 'survival';
        out.mode = 'survival';
        m = idx.get('town') ?? [...idx.values()].find((e) => mapSupports(e, 'survival')) ?? [...idx.values()][0];
      }
      out.map = m?.id ?? 'town';
    }
  } else if (!out.map) {
    out.map = 'town';
  }
  return out;
}

/* --------------------------------------------------------------- resolution */

/**
 * Resolve the session for this page load.
 *
 * @param {URLSearchParams} params
 * @param {{ maps?: Array, storage?: Storage|null }} [opts]
 * @returns {{ kind, mode, map, mission, loadout, difficulty, pending, autostart, source }}
 *   `pending`   the menu launched this (show the one-click deploy card)
 *   `autostart` the URL named a mode/mission (dev/capture: start immediately)
 *   `source`    'url' | 'storage' | 'default'
 */
export function resolveSession(params, opts = {}) {
  const maps = opts.maps ?? [];
  const capture = param(params, 'capture') === '1';
  // Capture runs never read storage: a shot must render the same thing on every
  // machine, whatever the last human launched.
  const storage = capture ? null : store(opts.storage);

  let base = { ...DEFAULT_SESSION };
  let source = 'default';
  let pending = false;

  const stored = readJSON(storage, SESSION_KEY);
  if (stored) {
    base = { ...base, ...stored };
    pending = stored.pending === true;
    source = 'storage';
  } else {
    // The old picker saved just a map id. Honour it once.
    try {
      const legacy = storage?.getItem?.(LEGACY_MAP_KEY);
      if (legacy) base.map = legacy;
    } catch {
      /* ignore */
    }
  }
  const savedLoadout = readJSON(storage, LOADOUT_KEY);
  if (savedLoadout) base.loadout = savedLoadout;

  // URL overrides (dev / capture).
  const uMode = param(params, 'mode');
  const uMap = param(params, 'map');
  const uMission = param(params, 'mission');
  const uDiff = param(params, 'difficulty');
  let autostart = false;
  if (uMission && MISSION_IDS.includes(uMission)) {
    base.kind = 'mission';
    base.mission = uMission;
    base.mode = null;
    autostart = true;
  } else if (uMode && MODE_IDS.includes(uMode)) {
    base.kind = uMode === 'survival' ? 'survival' : 'mp';
    base.mode = uMode;
    base.mission = null;
    autostart = true;
  }
  if (uMap) base.map = uMap;
  if (uDiff && DIFFICULTIES.includes(uDiff)) base.difficulty = uDiff;
  if (uMode || uMap || uMission) {
    source = 'url';
    pending = false;
  }
  // A bare `?map=` (the old picker's reload, and every capture shot) keeps the
  // original behaviour: that map loads and the title screen comes up. The map
  // is authoritative, so the remembered mode yields to one the map supports.
  const idx = mapIndex(maps);
  const urlMap = uMap && (idx.size === 0 || idx.has(uMap)) ? uMap : null;
  if (urlMap && !uMode && !uMission) {
    const entry = idx.get(urlMap);
    if (entry && !mapSupports(entry, base.mode ?? 'survival')) {
      const modes = mapModes(entry);
      base.mode = modes.includes('survival') ? 'survival' : modes[0] ?? 'survival';
      base.kind = base.mode === 'survival' ? 'survival' : 'mp';
      base.mission = null;
    }
    if (base.kind === 'mission') {
      base.kind = 'survival';
      base.mode = 'survival';
      base.mission = null;
    }
  }

  const s = normaliseSession(base, maps);
  // Dev/capture: an explicit, real `?map=` always builds that map.
  if (urlMap && !uMission) s.map = urlMap;
  s.pending = pending;
  s.autostart = autostart;
  s.source = source;
  return s;
}

/**
 * Clear the pending-launch flag in storage (the boot that consumes it calls
 * this), so a refresh lands on the menu rather than re-deploying.
 */
export function consumePending(storage) {
  const st = store(storage);
  const s = readJSON(st, SESSION_KEY);
  if (!s || s.pending !== true) return false;
  s.pending = false;
  return writeJSON(st, SESSION_KEY, s);
}

/** Persist a session (and its loadout) without reloading. */
export function saveSession(session, storage) {
  const st = store(storage);
  const s = {
    kind: session.kind,
    mode: session.mode ?? null,
    map: session.map,
    mission: session.mission ?? null,
    loadout: normaliseLoadout(session.loadout),
    difficulty: session.difficulty,
    pending: session.pending === true,
  };
  const ok = writeJSON(st, SESSION_KEY, s);
  writeJSON(st, LOADOUT_KEY, s.loadout);
  return ok;
}

/**
 * Launch: store the session as pending and reload WITHOUT a query string.
 * @returns {boolean} false when storage is blocked (nothing would survive the reload)
 */
export function launchSession(session, opts = {}) {
  const ok = saveSession({ ...session, pending: true }, opts.storage);
  if (!ok) return false;
  try {
    const loc = opts.location ?? globalThis.location;
    const url = new URL(loc.href);
    // Keep only what the page must not lose; `map`/`mode`/`mission` would
    // override the stored choice on the next boot, so they go.
    for (const k of ['map', 'mode', 'mission', 'difficulty']) url.searchParams.delete(k);
    if ([...url.searchParams.keys()].length === 0 && url.href !== loc.href) {
      loc.assign?.(url.origin + url.pathname + url.hash);
    } else if (url.href !== loc.href) {
      loc.assign?.(url.toString());
    } else {
      loc.reload?.();
    }
  } catch {
    return false;
  }
  return true;
}

/* ----------------------------------------------------------------- settings */

/**
 * Persisted settings → `createConfig` overrides. Capture never reads them.
 * @returns {{ quality?: string, config: object }}
 */
export function resolveSettings(params, storage) {
  const capture = param(params, 'capture') === '1';
  if (capture) return { quality: undefined, config: {} };
  const s = readJSON(store(storage), SETTINGS_KEY) ?? {};
  const config = {};
  if (Number.isFinite(s.sensitivity) && s.sensitivity > 0 && s.sensitivity < 0.05) config.sensitivity = s.sensitivity;
  if (Number.isFinite(s.fov) && s.fov >= 50 && s.fov <= 130) config.fov = s.fov;
  if (typeof s.invertY === 'boolean') config.invertY = s.invertY;
  const quality = ['low', 'medium', 'high', 'ultra'].includes(s.quality) ? s.quality : undefined;
  return { quality, config };
}
