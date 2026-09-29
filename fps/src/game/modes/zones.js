/**
 * ZONES — capture state for Domination and Hardpoint. Pure logic, no engine.
 *
 * A capture zone carries a signed `value` in [-1, 1]: +1 is held by ESF, -1 by
 * the hostiles. Standing in a zone pushes the value toward your side; an enemy
 * zone has to be NEUTRALISED (value through 0, owner cleared) before it can be
 * taken, so flipping a held zone costs twice a neutral one. More bodies capture
 * faster (x1, x1.5, x2, capped at x2.5). Both teams inside = contested: nothing
 * moves. An empty zone drifts back to its owner's full value (or to neutral).
 */

export const TEAMS = ['esf', 'hostile'];
export const other = (team) => (team === 'esf' ? 'hostile' : 'esf');

/** Seconds for one body to take a NEUTRAL zone. */
export const CAPTURE_S = 7;
/** Per-second drift of an empty, part-captured zone back to rest. */
const DRIFT = 0.22;

export function makeZone(src, fallbackId = 'A') {
  return {
    id: src?.id ?? fallbackId,
    label: src?.label ?? src?.id ?? fallbackId,
    pos: src.pos,
    radius: src.radius ?? 4.5,
    value: 0,
    owner: null,
    contested: false,
    count: { esf: 0, hostile: 0 },
    /** The team whose colour the progress ring shows. */
    capTeam: null,
    active: true,
  };
}

/** Horizontal-inside test with a generous vertical band (stairs, crouch). */
export function inZone(z, p) {
  if (!p) return false;
  const dx = p.x - z.pos.x;
  const dz = p.z - z.pos.z;
  const dy = p.y - z.pos.y;
  return dx * dx + dz * dz <= z.radius * z.radius && dy > -2.5 && dy < 3.5;
}

/**
 * Advance one zone. `z.count` must already hold this tick's occupancy.
 * @returns {null | {type:'captured'|'neutralised', team, zone}} the transition, if any
 */
export function tickCapture(z, dt, captureS = CAPTURE_S) {
  const e = z.count.esf | 0;
  const h = z.count.hostile | 0;
  z.contested = e > 0 && h > 0;
  let ev = null;
  if (!z.contested) {
    let dir = 0;
    let n = 0;
    if (e > 0) {
      dir = 1;
      n = e;
    } else if (h > 0) {
      dir = -1;
      n = h;
    }
    if (dir === 0) {
      const rest = z.owner === 'esf' ? 1 : z.owner === 'hostile' ? -1 : 0;
      const d = rest - z.value;
      const step = DRIFT * dt;
      z.value = Math.abs(d) <= step ? rest : z.value + Math.sign(d) * step;
    } else {
      const rate = (1 + 0.5 * Math.min(3, n - 1)) / captureS;
      z.value = Math.max(-1, Math.min(1, z.value + dir * rate * dt));
      if (z.owner === 'esf' && z.value <= 0) {
        z.owner = null;
        ev = { type: 'neutralised', team: 'hostile', zone: z };
      } else if (z.owner === 'hostile' && z.value >= 0) {
        z.owner = null;
        ev = { type: 'neutralised', team: 'esf', zone: z };
      }
      if (z.value >= 1 && z.owner !== 'esf') {
        z.value = 1;
        z.owner = 'esf';
        ev = { type: 'captured', team: 'esf', zone: z };
      } else if (z.value <= -1 && z.owner !== 'hostile') {
        z.value = -1;
        z.owner = 'hostile';
        ev = { type: 'captured', team: 'hostile', zone: z };
      }
    }
  }
  z.capTeam = z.value > 0.0005 ? 'esf' : z.value < -0.0005 ? 'hostile' : null;
  return ev;
}

/** 0..1 ring fill for the HUD. */
export function zoneProgress(z) {
  return Math.min(1, Math.abs(z.value));
}
