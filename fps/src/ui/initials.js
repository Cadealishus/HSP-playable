import { el, setText, setStyle, setClass } from './util.js';
import { InputGuard } from './inputguard.js';

/**
 * Three-letter arcade initials selector.
 *
 * The 1983 interaction, not a text input: three fixed slots, a blinking
 * cursor, ▲/▼ to wheel the letter and ◀/▶ to move. Typing a letter also works
 * (and advances), because half the people who play this will be on a laptop
 * and the other half on a cabinet stick, and both have to feel native.
 *
 * The blink is driven from `update(rawDt)` like every other widget in this
 * directory — no CSS keyframes on anything the capture harness can see.
 */

const A = 'A'.charCodeAt(0);
const LETTERS = 26;

export class InitialsEntry {
  /**
   * @param {HTMLElement} parent
   * @param {{onSubmit:(v:string)=>void, onSkip:()=>void}} cbs
   */
  constructor(parent, { onSubmit, onSkip }) {
    this.onSubmit = onSubmit;
    this.onSkip = onSkip;

    this.root = el('div', 'ow-init', parent);
    el('div', 'ow-init-lbl', this.root, 'ENTER YOUR INITIALS');

    const rack = el('div', 'ow-init-rack', this.root);
    this.slots = [];
    for (let i = 0; i < 3; i++) {
      const slot = el('div', 'ow-init-slot', rack);
      const up = el('button', 'ow-init-arrow up', slot, '▲');
      up.type = 'button';
      up.tabIndex = -1;
      const ch = el('div', 'ow-init-ch', slot, 'A');
      const down = el('button', 'ow-init-arrow dn', slot, '▼');
      down.type = 'button';
      down.tabIndex = -1;

      up.addEventListener('click', () => {
        this.cursor = i;
        this._bump(i, +1);
      });
      down.addEventListener('click', () => {
        this.cursor = i;
        this._bump(i, -1);
      });
      ch.addEventListener('click', () => {
        this.cursor = i;
      });
      this.slots.push({ slot, ch, code: 0 });
    }

    this.hint = el('div', 'ow-init-hint', this.root, '▲▼ LETTER · ◀▶ SLOT · OR JUST TYPE · ENTER TO FILE');

    const actions = el('div', 'ow-init-actions', this.root);
    this.submitBtn = el('button', 'ow-btn primary', actions, 'FILE IT WITH THE BOARD');
    this.submitBtn.type = 'button';
    this.submitBtn.addEventListener('click', () => this._submit());
    this.skipBtn = el('button', 'ow-sc-ghost', actions, 'KEEP IT OFF THE RECORD');
    this.skipBtn.type = 'button';
    this.skipBtn.addEventListener('click', () => this.onSkip?.());

    this.status = el('div', 'ow-init-status', this.root, '');
    setStyle(this.status, 'display', 'none');

    this.cursor = 0;
    this.open = false;
    this.busy = false;
    this._blink = 0;

    this.guard = new InputGuard(
      () => this.open && !this.busy,
      (e) => this._onKey(e)
    );

    setStyle(this.root, 'display', 'none');
  }

  /* ------------------------------------------------------------ lifecycle */

  /** @param {string|null} initial previously used initials, if any */
  show(initial) {
    const seed = /^[A-Z]{3}$/.test(initial ?? '') ? initial : 'AAA';
    for (let i = 0; i < 3; i++) this.slots[i].code = seed.charCodeAt(i) - A;
    this.cursor = 0;
    this.open = true;
    this.busy = false;
    this._blink = 0;
    this.setStatus('');
    setText(this.submitBtn, 'FILE IT WITH THE BOARD');
    setStyle(this.submitBtn, 'display', '');
    setStyle(this.skipBtn, 'display', '');
    setStyle(this.hint, 'display', '');
    setStyle(this.root, 'display', '');
    this.guard.install();
    this._paint();
  }

  hide() {
    this.open = false;
    this.guard.remove();
    setStyle(this.root, 'display', 'none');
  }

  /** Freeze the controls while a submit is in flight. */
  setBusy(busy, label) {
    this.busy = busy;
    this.submitBtn.disabled = busy;
    setStyle(this.submitBtn, 'opacity', busy ? '.45' : '1');
    if (label) setText(this.submitBtn, label);
  }

  /** @param {string} text @param {'err'|'ok'|''} kind */
  setStatus(text, kind = '') {
    setText(this.status, text ?? '');
    setStyle(this.status, 'display', text ? '' : 'none');
    setClass(this.status, 'err', kind === 'err');
    setClass(this.status, 'ok', kind === 'ok');
  }

  /** Collapse to a result line — used once the score is filed. */
  settle(text, kind = 'ok') {
    this.open = false;
    this.guard.remove();
    setStyle(this.hint, 'display', 'none');
    setStyle(this.submitBtn, 'display', 'none');
    setStyle(this.skipBtn, 'display', 'none');
    this.setStatus(text, kind);
  }

  get value() {
    return this.slots.map((s) => String.fromCharCode(A + s.code)).join('');
  }

  /* ---------------------------------------------------------------- input */

  _bump(i, dir) {
    const s = this.slots[i];
    s.code = (s.code + dir + LETTERS) % LETTERS;
    this._blink = 0;
    this.setStatus('');
    this._paint();
  }

  _submit() {
    if (this.busy) return;
    this.onSubmit?.(this.value);
  }

  _onKey(e) {
    switch (e.key) {
      case 'ArrowUp':
        this._bump(this.cursor, +1);
        return true;
      case 'ArrowDown':
        this._bump(this.cursor, -1);
        return true;
      case 'ArrowLeft':
        this.cursor = (this.cursor + 2) % 3;
        this._blink = 0;
        this._paint();
        return true;
      case 'ArrowRight':
      case 'Tab':
        this.cursor = (this.cursor + 1) % 3;
        this._blink = 0;
        this._paint();
        return true;
      case 'Backspace':
        this.cursor = (this.cursor + 2) % 3;
        this.slots[this.cursor].code = 0;
        this._blink = 0;
        this.setStatus('');
        this._paint();
        return true;
      case 'Enter':
        this._submit();
        return true;
      default:
        break;
    }
    if (/^[a-zA-Z]$/.test(e.key)) {
      this.slots[this.cursor].code = e.key.toUpperCase().charCodeAt(0) - A;
      if (this.cursor < 2) this.cursor += 1;
      this._blink = 0;
      this.setStatus('');
      this._paint();
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- frame */

  _paint() {
    for (let i = 0; i < 3; i++) {
      const s = this.slots[i];
      setText(s.ch, String.fromCharCode(A + s.code));
      setClass(s.slot, 'on', i === this.cursor && this.open);
    }
  }

  update(rawDt) {
    if (!this.open) return;
    this._blink += rawDt;
    // 1.6 Hz square wave, integrated from dt so a paused clock can't strand it.
    const lit = this._blink % 1.25 < 0.72;
    for (let i = 0; i < 3; i++) {
      setStyle(this.slots[i].slot, '--cur', i === this.cursor && lit ? '1' : '0');
    }
  }

  dispose() {
    this.guard.remove();
    this.root.remove();
  }
}
