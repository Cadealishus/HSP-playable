import * as THREE from 'three';

/**
 * WORLD — multiplayer mode data (docs/EXPANSION.md §5).
 *
 * Every MP map authors its spawns and objective zones as plain data in its own
 * LEVEL metres (the same frame its builder uses), and this turns them into what
 * `ctx.get('world')` publishes, in world space:
 *
 *   world.spawns      { esf: [{ pos, yaw, tag }], hostile: [...] }
 *   world.objectives  { dom: { A, B, C }, hp: [zone...], sd: { A, B, attackers },
 *                       survival: zone }
 *                     zone = { pos: Vector3 (on the floor), radius, name }
 *   world.anchors     { name: Vector3 | { pos, yaw } }
 *
 * Authoring format (level space; `y` is optional and defaults to the map's
 * analytic floor, so only an elevated spot needs one):
 *
 *   spawns:   { esf: [[x, z, faceX, faceZ, tag, y?]], hostile: [...] }
 *   dom:      { A: [x, z, radius, name, y?], B: [...], C: [...] }
 *   hp:       [[x, z, radius, name, y?], ...]           (4-5, in rotation order)
 *   sd:       { A: [...], B: [...], attackers: 'esf' | 'hostile' }
 *   survival: [x, z, radius, name, y?]
 *   anchors:  { name: [x, y, z] | [x, y, z, faceX, faceZ] | [[x, y, z, ...], ...] }
 *
 * `face` is a level-space direction the spawn looks along; the yaw follows the
 * player/camera convention (yaw 0 looks down -Z) plus the level's own yaw.
 */

/** Every mode an MP map in this build supports. */
export const MP_MODES = ['tdm', 'dom', 'hp', 'sd', 'survival'];

/**
 * @param {{ toWorld(x, y, z, out?): THREE.Vector3 }} A   the map's Assembler
 * @param {number} levelYaw                              level -> world yaw
 * @param {object} data                                  authoring data (above)
 * @param {(x:number, z:number) => number} groundY       analytic floor, level space
 */
export function publishModeData(A, levelYaw, data, groundY = () => 0) {
  const at = (x, z, y) => A.toWorld(x, y ?? groundY(x, z), z, new THREE.Vector3());
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz) + levelYaw;
  const spawn = ([x, z, fx, fz, tag, y]) => ({ pos: at(x, z, y), yaw: yawOf(fx, fz), tag: tag ?? '' });
  const zone = (z) => (z ? { pos: at(z[0], z[1], z[4]), radius: z[2], name: z[3] ?? '' } : null);

  const out = {
    spawns: {
      esf: (data.spawns?.esf ?? []).map(spawn),
      hostile: (data.spawns?.hostile ?? []).map(spawn),
    },
    objectives: {},
    anchors: {},
  };
  const o = out.objectives;
  if (data.dom) o.dom = { A: zone(data.dom.A), B: zone(data.dom.B), C: zone(data.dom.C) };
  if (data.hp) o.hp = data.hp.map(zone);
  if (data.sd) o.sd = { A: zone(data.sd.A), B: zone(data.sd.B), attackers: data.sd.attackers ?? 'hostile' };
  if (data.survival) o.survival = zone(data.survival);
  const anchor = (v) => {
    const pos = A.toWorld(v[0], v[1], v[2], new THREE.Vector3());
    return v.length >= 5 ? { pos, yaw: yawOf(v[3], v[4]) } : pos;
  };
  for (const [name, v] of Object.entries(data.anchors ?? {})) {
    // a list of points ([[x, y, z, fx?, fz?], ...]) publishes as an array
    out.anchors[name] = Array.isArray(v[0]) ? v.map(anchor) : anchor(v);
  }
  return out;
}
