// window.__fps — the automation surface used by tools/shoot.mjs and by agents testing the game.
// Only installed when the page is opened with ?harness (no pointer lock, no RAF loop, seeded RNG).
export function installHarness(game) {
  const api = {
    game,
    ready: false,
    errors: [],
    listShots: () => [...game.shots.entries()].map(([name, s]) => ({ name, description: s.description || '' })),

    // Apply a registered shot, simulate `settle` seconds, render the final frames.
    async shot(name, opts = {}) {
      const def = game.shots.get(name);
      if (!def) throw new Error(`unknown shot "${name}". Known: ${[...game.shots.keys()].join(', ')}`);
      game.input.setVirtual([]);
      if (def.setup) await def.setup(game, opts);
      game.advance(opts.settle ?? def.settle ?? 0.5, opts.renderFrames ?? def.renderFrames ?? 8);
      if (def.after) await def.after(game, opts);
      return true;
    },

    // Put the player/camera somewhere. pos = feet position [x,y,z] (player) — yaw/pitch in degrees.
    pose({ pos, yaw = 0, pitch = 0 }) {
      if (game.player?.setPose) game.player.setPose({ pos, yaw, pitch });
      else {
        game.camera.position.set(pos[0], pos[1] + 1.7, pos[2]);
        game.camera.rotation.set((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0);
      }
    },

    // Hold actions (see core/Input.js BINDINGS) for `seconds` of simulation.
    hold(actions, seconds = 0.5, look = null) {
      game.input.setVirtual(actions, look);
      game.advance(seconds, 0);
      game.input.setVirtual([]);
    },

    advance: (s, renderFrames = 1) => game.advance(s, renderFrames),
    render: () => game.render?.renderFrame?.(0, game),
    stats: () => ({
      calls: game.render?.renderer?.info.render.calls,
      triangles: game.render?.renderer?.info.render.triangles,
      geometries: game.render?.renderer?.info.memory.geometries,
      textures: game.render?.renderer?.info.memory.textures,
    }),
  };
  window.__fps = api;
  addEventListener('error', (e) => api.errors.push(String(e.message || e)));
  addEventListener('unhandledrejection', (e) => api.errors.push(String(e.reason?.stack || e.reason)));
  return api;
}
