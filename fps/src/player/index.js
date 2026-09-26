// Player system entry point. Contract: docs/CONTRACTS.md#player
// Implementation: Player.js (movement / KCC), CameraRig.js (camera feel), course.js (test course
// + player-* shots), movementTests.js (automated movement checks, loaded on demand).
import { PlayerSystem } from './Player.js';

export function createPlayer() {
  return new PlayerSystem();
}
