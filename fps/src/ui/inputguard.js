/**
 * Keyboard/mouse guard for DOM overlays that need real input.
 *
 * `src/core/input.js` binds keydown and mousedown on `window` in the BUBBLE
 * phase, preventDefaults every key it doesn't recognise, and requests pointer
 * lock on any left click. That is correct for a first-person shooter and fatal
 * for a text field: typing "SYT" into the initials selector would strafe, and
 * clicking a leaderboard tab would hide the cursor.
 *
 * The guard registers on `window` in the CAPTURE phase, which runs before the
 * engine's bubble-phase handlers, and calls stopPropagation on events that
 * belong to the overlay. The engine therefore never sees them. Nothing in
 * src/core is touched, and the guard is fully removed the moment the overlay
 * closes.
 */
export class InputGuard {
  /**
   * @param {() => boolean} isActive   guard only bites while this is true
   * @param {(e: KeyboardEvent) => boolean} onKey  return true if consumed
   */
  constructor(isActive, onKey) {
    this._active = isActive;
    this._onKey = onKey;
    this._installed = false;

    this._key = (e) => {
      if (!this._active()) return;
      // Never swallow devtools / reload / tab-away.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (this._onKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // A click on the overlay must not be read as "player clicked the world".
    this._mouse = (e) => {
      if (!this._active()) return;
      const t = e.target;
      if (t && typeof t.closest === 'function' && t.closest('.nod-modal')) e.stopPropagation();
    };
  }

  install() {
    if (this._installed) return;
    this._installed = true;
    addEventListener('keydown', this._key, true);
    addEventListener('mousedown', this._mouse, true);
  }

  remove() {
    if (!this._installed) return;
    this._installed = false;
    removeEventListener('keydown', this._key, true);
    removeEventListener('mousedown', this._mouse, true);
  }
}
