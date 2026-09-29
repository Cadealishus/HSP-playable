import { el, svg, setText, setStyle, setClass, damp, ease } from './util.js';
import { ACTIONS } from '../core/input.js';
import { mapPreview, crest } from './screens.js';

/**
 * ===========================================================================
 * MAIN MENU — the front end (replaces the single-page title/loadout screen).
 * ===========================================================================
 *
 *   FLOP OPS
 *     SPECIAL OPERATIONS    missions in the build (src/game/missions/*.js)
 *     MULTIPLAYER / BOTS    mode → map (filtered by the registry's `modes`)
 *     SURVIVAL              map → deploy
 *     LOADOUT               primary / secondary / lethal / tactical, persisted
 *     SETTINGS              the pause menu's settings, persisted
 *     CONTROLS              every binding, read off src/core/input.js ACTIONS
 *
 * Keyboard: ↑ ↓ (W S) move, ENTER / SPACE select, ← → (A D) change a value,
 * ESC / BACKSPACE back. Mouse: hover focuses, click selects, right-click back.
 *
 * Every entry is capability-gated through `host` (the UI system), which asks
 * the game what is actually playable in this build: a mode or mission that
 * would not work end to end is not listed. Launching goes through
 * `host.launch(session)` → `ui:launch` → the game, which starts in place on
 * the current map or reloads onto another one via localStorage.
 *
 * The same look as the old title: the wordmark, the amber rule, the mission
 * card grid and the map cards with their minimap plans. DOM is rebuilt only
 * on navigation (menu time, never per frame); update() only fades.
 */

export const DIFF = [
  ['recruit', 'RECRUIT', 'Hostiles are recruits too. Command considers this fair.'],
  ['regular', 'REGULAR', 'The standard ESF experience. Doug recommends it.'],
  ['hardened', 'HARDENED', 'Hostiles aim first and apologise never.'],
  ['veteran', 'VETERAN', 'Command has filed the paperwork in advance.'],
];

/* Action → label, in the order the CONTROLS page lists them. */
const MOVE_ACTIONS = [
  ['forward', 'MOVE FORWARD'],
  ['back', 'MOVE BACK'],
  ['left', 'STRAFE LEFT'],
  ['right', 'STRAFE RIGHT'],
  ['sprint', 'SPRINT'],
  ['jump', 'JUMP · MANTLE · VAULT'],
  ['crouch', 'CROUCH · SLIDE WHILE SPRINTING'],
  ['prone', 'PRONE'],
  ['leanLeft', 'LEAN LEFT'],
  ['leanRight', 'LEAN RIGHT'],
  ['turnLeft', 'TURN LEFT (KEYBOARD)'],
  ['turnRight', 'TURN RIGHT (KEYBOARD)'],
];
const KNOWN_LABELS = {
  reload: 'RELOAD',
  use: 'INTERACT · PLANT · DEFUSE',
  grenade: 'FRAG GRENADE (HOLD TO COOK)',
  lethal: 'FRAG GRENADE (HOLD TO COOK)',
  frag: 'FRAG GRENADE (HOLD TO COOK)',
  tactical: 'FLASHBANG',
  flash: 'FLASHBANG',
  flashbang: 'FLASHBANG',
  melee: 'MELEE',
  pause: 'PAUSE · SETTINGS',
  swapWeapon: 'SWITCH WEAPON',
  nextWeapon: 'NEXT WEAPON',
  inspect: 'INSPECT WEAPON',
  fireMode: 'FIRE MODE',
  aiDebug: 'AI DEBUG OVERLAY',
  scoreboard: 'SCOREBOARD',
  flashlight: 'WEAPON LIGHT',
};
const KEY_NAMES = {
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  Alt: 'ALT',
  Tab: 'TAB',
  Escape: 'ESC',
  Enter: 'ENTER',
  Backspace: 'BACKSPACE',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'MOUSE 4',
  Mouse4: 'MOUSE 5',
  WheelUp: 'WHEEL',
  WheelDown: 'WHEEL',
};

/** 'KeyQ' → 'Q', 'AltLeft+KeyQ' → 'ALT + Q', 'Digit1' → '1'. */
export function keyName(code) {
  return String(code)
    .split('+')
    .map((c) => {
      if (KEY_NAMES[c]) return KEY_NAMES[c];
      if (c.startsWith('Key')) return c.slice(3);
      if (c.startsWith('Digit')) return c.slice(5);
      if (c.startsWith('Numpad')) return 'NUM ' + c.slice(6);
      return c.toUpperCase();
    })
    .join(' + ');
}

function prettyAction(name) {
  return KNOWN_LABELS[name] ?? name.replace(/([A-Z])/g, ' $1').toUpperCase();
}

/** Keys of an action, as display strings (ALT + Q style combos kept together). */
function keysOf(action) {
  const codes = ACTIONS[action];
  if (!Array.isArray(codes)) return [];
  return codes.map(keyName);
}

const fmt = (n) => Math.max(0, Math.round(n || 0)).toLocaleString('en-US');

export class MainMenu {
  /**
   * @param {HTMLElement} parent
   * @param {object} host  {
   *   launch(session)         start a session (ui:launch)
   *   modes()                 [{id,label,blurb,rules,available,maps}]   (game)
   *   missions()              [{id,label,blurb,map}]                    (game)
   *   maps()                  [{id,name,…,preview,modes?}]              (__FLOP_MAPS__)
   *   activeMap()             current map id
   *   session()               { difficulty, loadout, … }
   *   setDifficulty(id)       persist
   *   weapons()               [{id,displayName,class,slot?,…}]          (weapons)
   *   equipment()             { lethal:[{id,label}], tactical:[…] } | null
   *   saveLoadout(l)          persist
   *   openSettings(onBack)    the settings panel
   *   extraControls()         [[keys, label]] bindings owned by other systems
   * }
   */
  constructor(parent, host) {
    this.host = host;
    this.root = el('div', 'ow-attract ow-mm', parent);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.open) this.back();
    });

    const top = el('div', 'ow-att-top', this.root);
    const unit = el('div', 'ow-att-unit', top);
    crest(unit);
    el('span', null, unit, 'EXTRA SPECIAL FORCES');
    el('div', 'ow-att-net', top, 'SECURE NET · COMMAND');

    const left = el('div', 'ow-mm-left', this.root);
    el('div', 'ow-att-title', left, 'FLOP OPS');
    el('div', 'ow-att-rule', left);
    this.crumb = el('div', 'ow-mm-crumb', left, 'MAIN MENU');
    this.list = el('div', 'ow-mm-list', left);

    this.panel = el('div', 'ow-mm-panel', this.root);

    const foot = el('div', 'ow-att-foot', this.root);
    this.best = el('div', 'ow-att-best', foot, '');
    this.hint = el('div', 'ow-mm-hint', foot, '↑ ↓ SELECT · ENTER CONFIRM · ESC BACK');
    el('div', 'ow-att-build', foot, 'FLOP OPS · ESF INTERNAL BUILD');

    this.stack = [];
    this.page = null;
    this.items = [];
    this.rows = [];
    this.focus = 0;
    this.deploy = null;

    this._onKey = (e) => this._key(e);
    addEventListener('keydown', this._onKey, true);

    this.open = false;
    this.shown = 0;
    setStyle(this.root, 'display', 'none');
  }

  /* ----------------------------------------------------------- navigation */

  go(page, arg) {
    if (this.page) this.stack.push([this.page, this.arg, this.focus]);
    this._render(page, arg, 0);
  }

  back() {
    if (this.deploy) {
      this.deploy = null;
      this.stack.length = 0;
      this._render('root', null, 0);
      return;
    }
    const prev = this.stack.pop();
    if (prev) this._render(prev[0], prev[1], prev[2]);
  }

  home() {
    this.stack.length = 0;
    this.deploy = null;
    this._render('root', null, 0);
  }

  _render(page, arg, focus) {
    this.page = page;
    this.arg = arg;
    const build = this[`_page_${page}`];
    const { crumb, items } = build.call(this, arg);
    this.items = items;
    setText(this.crumb, crumb);
    this.list.textContent = '';
    this.rows = items.map((it, i) => {
      const r = el('div', 'ow-mm-row' + (it.kind === 'back' ? ' back' : '') + (it.kind === 'value' ? ' value' : ''), this.list);
      if (it.idx) el('span', 'ow-mm-idx', r, it.idx);
      r._label = el('span', 'ow-mm-label', r, it.label);
      if (it.kind === 'value') {
        const v = el('span', 'ow-mm-val', r);
        el('i', 'ow-mm-arr', v, '‹');
        r._val = el('b', null, v, it.value?.() ?? '');
        el('i', 'ow-mm-arr', v, '›');
      } else if (it.tag) {
        el('span', 'ow-mm-tag', r, it.tag);
      }
      r.addEventListener('mouseenter', () => this._focus(i));
      r.addEventListener('click', (e) => {
        this._focus(i);
        if (it.kind === 'value') {
          const rect = r.getBoundingClientRect();
          this._change(e.clientX < rect.left + rect.width * 0.55 ? -1 : 1);
        } else this._select();
      });
      return r;
    });
    this.focus = -1;
    this._focus(Math.max(0, Math.min(items.length - 1, focus | 0)));
  }

  _focus(i) {
    if (i === this.focus && this.rows[i]) return;
    this.focus = i;
    for (let j = 0; j < this.rows.length; j++) setClass(this.rows[j], 'on', j === i);
    const it = this.items[i];
    this.panel.textContent = '';
    (it?.panel ?? this._pagePanel)?.call(this, this.panel, it);
  }

  _select() {
    const it = this.items[this.focus];
    if (!it) return;
    if (it.kind === 'back') return this.back();
    if (it.kind === 'value') return this._change(1);
    it.onSelect?.();
  }

  _change(dir) {
    const it = this.items[this.focus];
    if (!it || it.kind !== 'value') return;
    it.onChange?.(dir);
    const r = this.rows[this.focus];
    if (r?._val) setText(r._val, it.value?.() ?? '');
    this.panel.textContent = '';
    (it.panel ?? this._pagePanel)?.call(this, this.panel, it);
  }

  _key(e) {
    if (!this.open || this.host.settingsOpen?.()) return;
    const c = e.code;
    let used = true;
    if (c === 'ArrowDown' || c === 'KeyS') this._focus((this.focus + 1) % this.rows.length);
    else if (c === 'ArrowUp' || c === 'KeyW') this._focus((this.focus + this.rows.length - 1) % this.rows.length);
    else if (c === 'ArrowLeft' || c === 'KeyA') this._change(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') this._change(1);
    else if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') {
      if (!e.repeat) this._select();
    } else if (c === 'Escape' || c === 'Backspace') {
      if (!e.repeat) this.back();
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /* ---------------------------------------------------------------- pages */

  _page_root() {
    const items = [];
    const missions = this.host.missions?.() ?? [];
    const modes = (this.host.modes?.() ?? []).filter((m) => m.id !== 'survival' && m.available && m.maps.length);
    let n = 0;
    const idx = () => String(++n).padStart(2, '0');
    if (missions.length) {
      items.push({
        idx: idx(),
        label: 'SPECIAL OPERATIONS',
        tag: `${missions.length} AVAILABLE`,
        onSelect: () => this.go('missions'),
        panel: (p) => this._blurb(p, 'SPECIAL OPERATIONS', 'Scripted operations. Real objectives. Plans written by Command, which is the problem.', missions.map((m) => [m.label, m.blurb])),
      });
    }
    if (modes.length) {
      items.push({
        idx: idx(),
        label: 'MULTIPLAYER / BOTS',
        tag: `${modes.length} MODES`,
        onSelect: () => this.go('mp'),
        panel: (p) =>
          this._blurb(p, 'MULTIPLAYER / BOTS', 'Doug and five ESF operators against six hostiles. Command has assured everyone the bots are on our side.', modes.map((m) => [m.label, m.blurb])),
      });
    }
    items.push({
      idx: idx(),
      label: 'SURVIVAL',
      tag: 'WAVES',
      onSelect: () => this.go('survival'),
      panel: (p) => {
        const info = (this.host.modes?.() ?? []).find((m) => m.id === 'survival');
        this._blurb(p, 'SURVIVAL', info?.blurb ?? 'Hold the position against escalating waves.', (info?.rules ?? []).map((r) => ['', r]));
      },
    });
    items.push({
      idx: idx(),
      label: 'LOADOUT',
      tag: this._loadoutTag(),
      onSelect: () => this.go('loadout'),
      panel: (p) => this._loadoutPanel(p),
    });
    items.push({
      idx: idx(),
      label: 'SETTINGS',
      onSelect: () => this.host.openSettings?.(() => this._focus(this.focus)),
      panel: (p) => this._blurb(p, 'SETTINGS', 'Graphics preset, mouse sensitivity, field of view, invert look. Saved on this machine.'),
    });
    items.push({
      idx: idx(),
      label: 'CONTROLS',
      onSelect: () => this.go('controls'),
      panel: (p) => this._blurb(p, 'CONTROLS', 'Every binding in the current build. Command has memorised none of them.'),
    });
    return { crumb: 'MAIN MENU', items };
  }

  _difficultyItem() {
    const cur = () => {
      const d = this.host.session?.()?.difficulty ?? 'regular';
      return DIFF.findIndex((x) => x[0] === d);
    };
    return {
      kind: 'value',
      label: 'DIFFICULTY',
      value: () => DIFF[Math.max(0, cur())][1],
      onChange: (dir) => {
        const i = (Math.max(0, cur()) + dir + DIFF.length) % DIFF.length;
        this.host.setDifficulty?.(DIFF[i][0]);
      },
      panel: (p) => {
        const d = DIFF[Math.max(0, cur())];
        this._blurb(p, 'DIFFICULTY · ' + d[1], d[2], DIFF.map((x) => [x[1], x[2]]));
      },
    };
  }

  _page_survival() {
    const maps = (this.host.maps?.() ?? []).filter((m) => this._supports(m, 'survival'));
    const items = maps.map((m) => ({
      idx: m.idx,
      label: m.name,
      tag: m.id === this.host.activeMap?.() ? 'LOADED' : '',
      onSelect: () => this.host.launch?.({ kind: 'survival', mode: 'survival', map: m.id, mission: null }),
      panel: (p) => this._mapPanel(p, m, 'survival'),
    }));
    items.push(this._difficultyItem());
    items.push({ kind: 'back', label: 'BACK' });
    return { crumb: 'MAIN MENU  ›  SURVIVAL', items };
  }

  _page_mp() {
    const modes = (this.host.modes?.() ?? []).filter((m) => m.id !== 'survival' && m.available && m.maps.length);
    const items = modes.map((m, i) => ({
      idx: String(i + 1).padStart(2, '0'),
      label: m.label,
      tag: m.short,
      onSelect: () => this.go('mpmap', m),
      panel: (p) => this._modePanel(p, m),
    }));
    items.push({ kind: 'back', label: 'BACK' });
    return { crumb: 'MAIN MENU  ›  MULTIPLAYER / BOTS', items };
  }

  _page_mpmap(mode) {
    const maps = (this.host.maps?.() ?? []).filter((m) => mode.maps.includes(m.id));
    const items = maps.map((m) => ({
      idx: m.idx,
      label: m.name,
      tag: m.id === this.host.activeMap?.() ? 'LOADED' : '',
      onSelect: () => this.host.launch?.({ kind: 'mp', mode: mode.id, map: m.id, mission: null }),
      panel: (p) => this._mapPanel(p, m, mode.id, mode),
    }));
    items.push(this._difficultyItem());
    items.push({ kind: 'back', label: 'BACK' });
    return { crumb: `MULTIPLAYER  ›  ${mode.label}`, items };
  }

  _page_missions() {
    const missions = this.host.missions?.() ?? [];
    const items = missions.map((m, i) => ({
      idx: String(i + 1).padStart(2, '0'),
      label: m.label,
      onSelect: () => this.host.launch?.({ kind: 'mission', mission: m.id, mode: null, map: m.map }),
      panel: (p) => {
        const map = (this.host.maps?.() ?? []).find((x) => x.id === m.map);
        this._blurb(p, m.label, m.blurb, m.briefing ?? (map ? [['LOCATION', map.subtitle ?? map.name]] : []));
        if (map?.preview) this._plan(p, map);
        el('div', 'ow-mm-go', p, 'ENTER TO DEPLOY');
      },
    }));
    items.push(this._difficultyItem());
    items.push({ kind: 'back', label: 'BACK' });
    return { crumb: 'MAIN MENU  ›  SPECIAL OPERATIONS', items };
  }

  _page_loadout() {
    const items = [];
    const slots = this._loadoutSlots();
    for (const s of slots) {
      items.push({
        kind: 'value',
        label: s.label,
        value: () => this._optLabel(s, this._loadout()[s.key]),
        onChange: (dir) => {
          const L = { ...this._loadout() };
          const i = Math.max(0, s.options.findIndex((o) => o.id === L[s.key]));
          L[s.key] = s.options[(i + dir + s.options.length) % s.options.length].id;
          this.host.saveLoadout?.(L);
        },
        panel: (p) => this._slotPanel(p, s),
      });
    }
    items.push({ kind: 'back', label: 'BACK' });
    return { crumb: 'MAIN MENU  ›  LOADOUT', items };
  }

  _page_controls() {
    return {
      crumb: 'MAIN MENU  ›  CONTROLS',
      items: [{ kind: 'back', label: 'BACK', panel: (p) => this._controlsPanel(p) }],
    };
  }

  /* --------------------------------------------------------------- panels */

  _card(p, kicker, title) {
    const c = el('div', 'ow-mm-card', p);
    el('div', 'ow-ms-head', c).append(el('span', 'ow-ms-tag', null, kicker));
    el('div', 'ow-ms-name', c, title);
    return c;
  }

  _blurb(p, title, text, rows = null) {
    const c = this._card(p, 'BRIEFING', title);
    el('div', 'ow-mm-text', c, text);
    if (rows?.length) {
      const g = el('div', 'ow-ms-grid', c);
      for (const [k, v] of rows) {
        el('div', 'k', g, k);
        el('div', 'v', g, v);
      }
    }
    return c;
  }

  _plan(p, m) {
    const w = el('div', 'ow-mm-plan', p);
    mapPreview(w, m);
    return w;
  }

  _mapPanel(p, m, modeId, mode = null) {
    const c = this._card(p, `MAP ${m.idx ?? ''}`, m.name);
    el('div', 'ow-mm-sub', c, m.subtitle ?? '');
    this._plan(c, m);
    const g = el('div', 'ow-ms-grid', c);
    if (mode) {
      el('div', 'k', g, 'MODE');
      el('div', 'v', g, mode.label);
      for (const r of mode.rules ?? []) {
        el('div', 'k', g, '');
        el('div', 'v', g, r);
      }
    } else {
      el('div', 'k', g, 'OPERATION');
      el('div', 'v', g, m.operation ?? '');
      for (const [k, v] of m.mission ?? []) {
        el('div', 'k', g, k);
        el('div', 'v', g, v);
      }
    }
    const d = DIFF.find((x) => x[0] === (this.host.session?.()?.difficulty ?? 'regular')) ?? DIFF[1];
    el('div', 'k', g, 'DIFFICULTY');
    el('div', 'v', g, d[1]);
    el('div', 'ow-mm-go', c, m.id === this.host.activeMap?.() ? 'ENTER TO DEPLOY' : 'ENTER TO DEPLOY · LOADS THE MAP');
  }

  _modePanel(p, m) {
    const c = this._card(p, m.short, m.label);
    el('div', 'ow-mm-text', c, m.blurb);
    const g = el('div', 'ow-ms-grid', c);
    for (const r of m.rules ?? []) {
      el('div', 'k', g, 'RULE');
      el('div', 'v', g, r);
    }
    el('div', 'k', g, 'MAPS');
    el('div', 'v', g, (this.host.maps?.() ?? []).filter((x) => m.maps.includes(x.id)).map((x) => x.name).join(' · '));
  }

  _loadout() {
    return this.host.session?.()?.loadout ?? { primary: 'carbine', secondary: 'pistol', lethal: 'frag', tactical: 'flash' };
  }

  /** Slots with real options. Equipment rows only when the build has equipment. */
  _loadoutSlots() {
    const ws = this.host.weapons?.() ?? [];
    const slotOf = (w) => w.slot ?? (/pistol|sidearm|handgun|revolver|launcher/.test(String(w.class ?? '').toLowerCase()) ? 'secondary' : 'primary');
    const opt = (w) => ({ id: w.id, label: w.displayName ?? w.id, info: w });
    const out = [];
    const prim = ws.filter((w) => slotOf(w) === 'primary').map(opt);
    const sec = ws.filter((w) => slotOf(w) === 'secondary').map(opt);
    if (prim.length) out.push({ key: 'primary', label: 'PRIMARY', options: prim });
    if (sec.length) out.push({ key: 'secondary', label: 'SECONDARY', options: sec });
    const eq = this.host.equipment?.();
    if (eq?.lethal?.length) out.push({ key: 'lethal', label: 'LETHAL', options: eq.lethal });
    if (eq?.tactical?.length) out.push({ key: 'tactical', label: 'TACTICAL', options: eq.tactical });
    return out;
  }

  _optLabel(s, id) {
    return (s.options.find((o) => o.id === id) ?? s.options[0])?.label ?? '—';
  }

  _loadoutTag() {
    const slots = this._loadoutSlots();
    const L = this._loadout();
    const p = slots.find((s) => s.key === 'primary');
    return p ? this._optLabel(p, L.primary) : '';
  }

  _loadoutPanel(p) {
    const c = this._card(p, 'ESF KIT', 'LOADOUT');
    el('div', 'ow-mm-text', c, 'Carried into every mode. Command signs for it; Doug carries it.');
    const g = el('div', 'ow-ms-grid', c);
    const L = this._loadout();
    for (const s of this._loadoutSlots()) {
      el('div', 'k', g, s.label);
      el('div', 'v', g, this._optLabel(s, L[s.key]));
    }
  }

  _slotPanel(p, s) {
    const L = this._loadout();
    const o = s.options.find((x) => x.id === L[s.key]) ?? s.options[0];
    const w = o?.info;
    const c = this._card(p, s.label, o?.label ?? '—');
    if (w?.blurb || o?.blurb) el('div', 'ow-mm-text', c, w?.blurb ?? o.blurb);
    const g = el('div', 'ow-ms-grid', c);
    const row = (k, v) => {
      if (v === undefined || v === null || v === '') return;
      el('div', 'k', g, k);
      el('div', 'v', g, String(v));
    };
    if (w) {
      row('CLASS', String(w.class ?? '').toUpperCase());
      row('CALIBRE', w.caliber);
      row('RATE OF FIRE', w.rpm ? `${w.rpm} RPM` : null);
      row('MAGAZINE', w.magSize);
      row('FIRE MODES', Array.isArray(w.modes) ? w.modes.join(' · ').toUpperCase() : null);
    } else if (o?.desc) {
      row('EFFECT', o.desc);
    }
    el('div', 'ow-mm-go', c, '‹ ›  TO CHANGE');
  }

  _controlsPanel(p) {
    const c = this._card(p, 'KEYBOARD · MOUSE', 'CONTROLS');
    const cols = el('div', 'ow-mm-keys', c);
    const group = (title, rows) => {
      const g = el('div', 'ow-mm-kgroup', cols);
      el('div', 'ow-mm-khead', g, title);
      for (const [keys, label] of rows) {
        if (!keys?.length) continue;
        const r = el('div', 'ow-mm-krow', g);
        const kk = el('span', 'ow-mm-kk', r);
        for (const k of keys) el('b', 'ow-key', kk, k);
        el('span', 'ow-mm-kl', r, label);
      }
    };
    const used = new Set();
    const act = (name, label) => {
      used.add(name);
      return [keysOf(name), label ?? prettyAction(name)];
    };
    group('MOVEMENT', MOVE_ACTIONS.filter(([a]) => ACTIONS[a]).map(([a, l]) => act(a, l)));
    const combat = [[['LMB'], 'FIRE'], [['RMB'], 'AIM DOWN SIGHTS']];
    for (const a of ['reload', 'use', 'melee']) if (ACTIONS[a] && this.host.bindingLive?.(a) !== false) combat.push(act(a));
    const extra = this.host.extraControls?.() ?? [];
    for (const r of extra) combat.push(r);
    group('COMBAT', combat);
    const equip = [];
    for (const a of ['grenade', 'lethal', 'frag', 'tactical', 'flash', 'flashbang']) {
      if (ACTIONS[a] && this.host.bindingLive?.(a) !== false) equip.push(act(a));
    }
    // Anything else the input map binds that the build uses (debug keys, …).
    const rest = [];
    for (const a of Object.keys(ACTIONS)) {
      if (used.has(a) || MOVE_ACTIONS.some(([m]) => m === a)) continue;
      if (['swapWeapon', 'pause', 'grenade', 'lethal', 'frag', 'tactical', 'flash', 'flashbang', 'reload', 'use', 'melee'].includes(a)) continue;
      if (this.host.bindingLive?.(a) === true) rest.push(act(a));
    }
    if (equip.length) group('EQUIPMENT', equip);
    group('INTERFACE', [act('pause'), ...rest, [['SPACE', 'LMB'], 'NEXT TEAMMATE (SPECTATING)']]);
  }

  /* ------------------------------------------------------------ deploy card */

  /** One-click deploy after a launch reload (also the pointer-lock gesture). */
  showDeploy(session, info) {
    this.deploy = session;
    this.stack.length = 0;
    this.page = 'deploy';
    this.items = [
      {
        idx: '▸',
        label: 'DEPLOY',
        onSelect: () => this.host.launch?.({ ...session }),
        panel: (p) => {
          const c = this._card(p, info.kicker ?? 'READY', info.title);
          if (info.blurb) el('div', 'ow-mm-text', c, info.blurb);
          if (info.map) this._plan(c, info.map);
          const g = el('div', 'ow-ms-grid', c);
          for (const [k, v] of info.rows ?? []) {
            el('div', 'k', g, k);
            el('div', 'v', g, v);
          }
          el('div', 'ow-mm-go', c, 'CLICK OR ENTER TO DEPLOY');
        },
      },
      { label: 'MAIN MENU', onSelect: () => this.home(), panel: (p) => this._blurb(p, 'MAIN MENU', 'Back to the menu. Command will wait. Command is good at waiting.') },
    ];
    setText(this.crumb, 'READY');
    this.list.textContent = '';
    this.rows = this.items.map((it, i) => {
      const r = el('div', 'ow-mm-row' + (i === 0 ? ' deploy' : ''), this.list);
      el('span', 'ow-mm-idx', r, it.idx ?? '');
      el('span', 'ow-mm-label', r, it.label);
      r.addEventListener('mouseenter', () => this._focus(i));
      r.addEventListener('click', () => {
        this._focus(i);
        this._select();
      });
      return r;
    });
    this.focus = -1;
    this._focus(0);
  }

  /* ------------------------------------------------------------------ misc */

  _supports(m, mode) {
    if (m.missionOnly) return false;
    return Array.isArray(m.modes) ? m.modes.includes(mode) : true;
  }

  setBest(b) {
    if (!b || !(b.score > 0)) {
      setText(this.best, 'NO PREVIOUS OPERATIONS ON FILE');
      return;
    }
    setText(this.best, `SURVIVAL BEST  ${fmt(b.score)}  ·  WAVE ${Math.max(1, b.wave | 0)}`);
  }

  /** Kept for the old title API (weapon names now come from the LOADOUT page). */
  setWeaponNames() {}

  show(instant = false) {
    this.open = true;
    if (instant) this.shown = 1;
    if (!this.page || this.page === 'deploy') {
      if (!this.deploy) this.home();
    } else {
      // Re-evaluate capabilities (modes, missions) every time the menu opens.
      this._render(this.page, this.arg, this.focus);
    }
    setStyle(this.root, 'display', '');
  }

  hide() {
    this.open = false;
    this.deploy = null;
  }

  update(rawDt) {
    this.shown = damp(this.shown, this.open ? 1 : 0, 13, rawDt);
    if (this.shown < 0.004) {
      setStyle(this.root, 'display', 'none');
      setStyle(this.root, 'pointer-events', 'none');
      return;
    }
    setStyle(this.root, 'display', '');
    setStyle(this.root, 'pointer-events', this.open ? 'auto' : 'none');
    setStyle(this.root, 'opacity', ease.outQuad(this.shown).toFixed(3));
  }

  dispose() {
    removeEventListener('keydown', this._onKey, true);
    this.root.remove();
  }
}
