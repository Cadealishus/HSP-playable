// Keyboard + mouse input with pointer lock, mapped to named actions.
// Systems read `game.input.down(action)`, `pressed(action)` (edge this frame),
// `released(action)`, and consume `lookDelta` (pixels since last frame).
// The harness can drive everything via `setVirtual()` without a real pointer lock.

export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  prone: ['KeyZ'],
  reload: ['KeyR'],
  interact: ['KeyF'],
  melee: ['KeyV'],
  grenade: ['KeyG'],
  tactical: ['KeyQ'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  swap: ['KeyX'],
  inspect: ['KeyI'],
  leanLeft: [],
  leanRight: [],
  scoreboard: ['Tab'],
  pause: ['Escape', 'KeyP'],
  fire: ['Mouse0'],
  ads: ['Mouse2'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); // physical codes currently held
    this.virtual = new Set(); // actions held by harness / scripts
    this.prevActions = new Set();
    this.actions = new Set();
    this.lookDelta = { x: 0, y: 0 };
    this.wheel = 0;
    this.sensitivity = 0.0022; // radians per pixel at 1.0 scale
    this.locked = false;
    this.enabled = true;

    const onKey = (down) => (e) => {
      if (!this.enabled) return;
      if (down) this.keys.add(e.code);
      else this.keys.delete(e.code);
      if (this.locked && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    };
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.keys.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
    });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => this.canvas.requestPointerLock());
  }

  exitLock() {
    if (this.locked) document.exitPointerLock();
  }

  // Called once per frame by the core loop, before systems update.
  poll() {
    this.prevActions = this.actions;
    this.actions = new Set(this.virtual);
    for (const [action, codes] of Object.entries(BINDINGS)) {
      for (const c of codes) if (this.keys.has(c)) this.actions.add(action);
    }
  }

  // Called once per frame after systems update.
  endFrame() {
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    this.wheel = 0;
  }

  down(action) {
    return this.actions.has(action);
  }

  pressed(action) {
    return this.actions.has(action) && !this.prevActions.has(action);
  }

  released(action) {
    return !this.actions.has(action) && this.prevActions.has(action);
  }

  // Harness / scripting: hold a set of actions (replaces previous virtual set) and optionally add look.
  setVirtual(actions = [], look = null) {
    this.virtual = new Set(actions);
    if (look) {
      this.lookDelta.x += look.x || 0;
      this.lookDelta.y += look.y || 0;
    }
  }
}
