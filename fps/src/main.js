// Boot: build the game context, register systems in update order, init, start.
import { Game } from './core/Game.js';
import { installHarness } from './core/Harness.js';
import { createRender } from './render/index.js';
import { createMaterials } from './materials/index.js';
import { createAudio } from './audio/index.js';
import { createWorld } from './world/index.js';
import { createPlayer } from './player/index.js';
import { createWeapons } from './weapons/index.js';
import { createCombat } from './combat/index.js';
import { createFX } from './fx/index.js';
import { createAI } from './ai/index.js';
import { createUI } from './ui/index.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
const harness = game.harness ? installHarness(game) : null;
window.game = game;

// Order matters: init runs top to bottom, and so does update/lateUpdate each frame.
game.add(createRender());
game.add(createMaterials());
game.add(createAudio());
game.add(createWorld());
game.add(createPlayer());
game.add(createWeapons());
game.add(createCombat());
game.add(createFX());
game.add(createAI());
game.add(createUI());

try {
  await game.init();
  if (harness) {
    game.advance(0.25, 1);
    harness.ready = true;
    const shot = game.params.get('shot');
    if (shot) await harness.shot(shot);
  } else {
    game.start();
  }
} catch (err) {
  console.error(err);
  if (harness) harness.errors.push(String(err.stack || err));
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;color:#f66;background:#000d;font:12px monospace;white-space:pre-wrap;z-index:99';
  pre.textContent = String(err.stack || err);
  document.body.appendChild(pre);
}
