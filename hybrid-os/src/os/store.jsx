import { createContext, useContext, useReducer, useRef, useMemo, useEffect } from 'react';
import { APPS } from './apps';
import { THEMES, motionVars } from './themes';

// ---------- Screen metrics (set by <Screen/>; the desktop is rendered at a virtual size and scaled) ----------
export const metrics = { W: 1440, H: 900, scale: 1, root: null };

export function toLocal(clientX, clientY) {
  const r = metrics.root ? metrics.root.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: (clientX - r.left) / metrics.scale, y: (clientY - r.top) / metrics.scale };
}

// Dock / taskbar buttons register here so windows can fly to and from them.
export const iconRegistry = {};
export function iconCenter(app) {
  const el = iconRegistry[app];
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return toLocal(r.left + r.width / 2, r.top + r.height / 2);
}

export const MENUBAR_H = 50;
export const TASKBAR_H = 48;

export function workArea(state, W = metrics.W, H = metrics.H) {
  if (state.mode === 'windows') return { x: 0, y: 0, w: W, h: H - TASKBAR_H };
  const { size, autoHide, position } = state.dock;
  const d = autoHide ? 8 : size + 30;
  const top = MENUBAR_H;
  if (position === 'left') return { x: d, y: top, w: W - d - 8, h: H - top - 8 };
  if (position === 'right') return { x: 8, y: top, w: W - d - 8, h: H - top - 8 };
  return { x: 8, y: top, w: W - 16, h: H - top - d };
}

// A focused, maximized window in HYBRID mode takes the whole screen; the menu bar and dock step aside.
export function fullscreenWindow(state) {
  if (state.mode !== 'hybrid') return null;
  const w = state.windows.find((x) => x.id === state.focused);
  return w && w.max && !w.min && w.phase !== 'closing' && w.phase !== 'minimizing' ? w : null;
}

// ---------- Persisted settings ----------
const SAVE_KEY = 'hybrid-os:v1';
const SETTINGS = {
  mode: 'hybrid',
  theme: 'aurora',
  lastDark: 'aurora',
  accent: 'auto',
  wallpaper: 'midnight-lake',
  glass: 55,
  motion: 55,
  brightness: 100,
  volume: 64,
  wifi: true,
  bluetooth: true,
  focus: false,
  nightLight: false,
  airplane: false,
  perfProfile: 'balanced',
  dock: { size: 52, mag: 60, autoHide: true, position: 'bottom' },
  widgets: { clock: true, weather: true, system: true, music: true, notes: true, projects: true },
  widgetPos: {},
  showWidgets: true,
  notes: 'Ship dock physics to HYBRID Shell\n• Rocky orb idle animation\n• Test Ctrl+Alt+M on 3 monitors',
  startupMode: 'hybrid',
  transition: 'cinematic',
  modeLabel: true,
  layoutVersion: 2,
};
const PERSIST = Object.keys(SETTINGS);

function loadSettings() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw);
    const out = {};
    for (const k of PERSIST) if (k in saved) out[k] = saved[k];
    if (out.dock) out.dock = { ...SETTINGS.dock, ...out.dock };
    if (out.widgets) out.widgets = { ...SETTINGS.widgets, ...out.widgets };
    if (out.startupMode) out.mode = out.startupMode;
    if (!THEMES[out.theme]) delete out.theme;
    // v2: the dock hides until the pointer rests on the screen edge
    if (saved.layoutVersion !== 2) {
      out.dock = { ...(out.dock || SETTINGS.dock), autoHide: true };
      out.layoutVersion = 2;
    }
    return out;
  } catch {
    return {};
  }
}

function initialState() {
  let reduced = false;
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {}
  const s = { ...SETTINGS, ...(reduced ? { motion: 15 } : {}), ...loadSettings() };
  return {
    ...s,
    windows: [],
    zTop: 10,
    focused: null,
    overlay: null, // spotlight | control | launcher | start | quick | calendar | lock
    rocky: false,
    ctx: null, // context menu {x, y, items}
    toasts: [],
    switching: null, // out | in
    modeBanner: null,
    lastAction: 0,
  };
}

// ---------- Window manager reducer ----------
let winSeq = 1;
let toastSeq = 1;

function reducer(s, a) {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch };
    case 'dock':
      return { ...s, dock: { ...s.dock, ...a.patch } };
    case 'widgets':
      return { ...s, widgets: { ...s.widgets, ...a.patch } };
    case 'widgetPos':
      return { ...s, widgetPos: { ...s.widgetPos, [a.id]: a.pos } };
    case 'open': {
      const app = APPS[a.app];
      const existing = app.single && s.windows.find((w) => w.app === a.app && w.phase !== 'closing');
      if (existing) {
        const z = s.zTop + 1;
        return {
          ...s,
          zTop: z,
          focused: existing.id,
          windows: s.windows.map((w) =>
            w.id === existing.id
              ? { ...w, z, min: false, phase: w.min ? 'restoring' : w.phase, props: a.props ? { ...w.props, ...a.props, nonce: Date.now() } : w.props }
              : w
          ),
        };
      }
      const area = a.area;
      const [dw, dh] = app.size || [800, 520];
      const w = Math.min(dw, area.w - 24);
      const h = Math.min(dh, area.h - 16);
      const n = s.windows.filter((x) => x.phase !== 'closing').length % 6;
      let x = Math.round(area.x + (area.w - w) / 2 + (n - 2) * 28);
      let y = Math.round(area.y + (area.h - h) / 2 + (n - 2) * 22);
      x = Math.max(area.x, Math.min(x, area.x + area.w - w));
      y = Math.max(area.y, Math.min(y, area.y + area.h - h));
      const z = s.zTop + 1;
      const id = winSeq++;
      return {
        ...s,
        zTop: z,
        focused: id,
        windows: [
          ...s.windows,
          { id, app: a.app, title: a.title || app.name, props: a.props || {}, x, y, w, h, z, min: false, max: false, snap: null, phase: 'opening', origin: a.origin || null },
        ],
      };
    }
    case 'focus': {
      const win = s.windows.find((w) => w.id === a.id);
      if (!win) return s;
      if (s.focused === a.id && win.z === s.zTop && !win.min) return s;
      const z = s.zTop + 1;
      return {
        ...s,
        zTop: z,
        focused: a.id,
        windows: s.windows.map((w) => (w.id === a.id ? { ...w, z, min: false, phase: w.min ? 'restoring' : w.phase } : w)),
      };
    }
    case 'phase': {
      const win = s.windows.find((w) => w.id === a.id);
      if (!win) return s;
      if (a.phase === 'remove') {
        const rest = s.windows.filter((w) => w.id !== a.id);
        return { ...s, windows: rest, focused: s.focused === a.id ? topWindow(rest) : s.focused };
      }
      if (a.phase === 'minimized') {
        const rest = s.windows.map((w) => (w.id === a.id ? { ...w, min: true, phase: 'idle' } : w));
        return { ...s, windows: rest, focused: s.focused === a.id ? topWindow(rest) : s.focused };
      }
      return { ...s, windows: s.windows.map((w) => (w.id === a.id ? { ...w, phase: a.phase } : w)) };
    }
    case 'close':
      return { ...s, windows: s.windows.map((w) => (w.id === a.id ? { ...w, phase: 'closing' } : w)) };
    case 'minimize':
      return {
        ...s,
        windows: s.windows.map((w) => (w.id === a.id && !w.min ? { ...w, phase: 'minimizing', target: a.target } : w)),
      };
    case 'geom':
      return {
        ...s,
        windows: s.windows.map((w) => (w.id === a.id ? { ...w, ...a.geom, max: false, snap: null, geoAnim: !!a.anim } : w)),
      };
    case 'max':
      return {
        ...s,
        windows: s.windows.map((w) => (w.id === a.id ? { ...w, max: a.value ?? !w.max, snap: null, geoAnim: true } : w)),
      };
    case 'snap':
      return {
        ...s,
        windows: s.windows.map((w) => (w.id === a.id ? { ...w, snap: a.side, max: false, geoAnim: true } : w)),
      };
    case 'closeApp':
      return { ...s, windows: s.windows.map((w) => (w.app === a.app ? { ...w, phase: 'closing' } : w)) };
    case 'toast':
      return { ...s, toasts: [...s.toasts.slice(-3), a.toast] };
    case 'untoast':
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    default:
      return s;
  }
}

function topWindow(list) {
  const vis = list.filter((w) => !w.min && w.phase !== 'closing');
  if (!vis.length) return null;
  return vis.reduce((a, b) => (b.z > a.z ? b : a)).id;
}

// ---------- Context ----------
const OSContext = createContext(null);

export function OSProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const ref = useRef(state);
  ref.current = state;
  const switching = useRef(false);

  // Persist settings (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const out = {};
        for (const k of PERSIST) out[k] = state[k];
        localStorage.setItem(SAVE_KEY, JSON.stringify(out));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, PERSIST.map((k) => state[k]));

  const actions = useMemo(() => {
    const set = (patch) => dispatch({ type: 'set', patch });
    const notify = (toast) => {
      if (ref.current.focus && !toast.force) return;
      const id = toastSeq++;
      dispatch({ type: 'toast', toast: { id, ...toast } });
      setTimeout(() => dispatch({ type: 'untoast', id }), toast.ttl || 4800);
    };
    const open = (app, opts = {}) => {
      const meta = APPS[app];
      if (!meta) return;
      if (meta.kind === 'launcher') return set({ overlay: ref.current.overlay === 'launcher' ? null : 'launcher' });
      if (meta.kind === 'panel') return set({ rocky: true, overlay: null });
      const origin = opts.origin || iconCenter(app);
      dispatch({ type: 'open', app, props: opts.props, title: opts.title, area: workArea(ref.current), origin });
      if (ref.current.overlay && ref.current.overlay !== 'lock') set({ overlay: null });
    };
    const focus = (id) => dispatch({ type: 'focus', id });
    const close = (id) => dispatch({ type: 'close', id });
    const minimize = (id) => {
      const w = ref.current.windows.find((x) => x.id === id);
      if (!w) return;
      const c = iconCenter(w.app);
      dispatch({ type: 'minimize', id, target: c });
    };
    const toggleMax = (id) => dispatch({ type: 'max', id });
    const snap = (id, side) => dispatch({ type: side === 'max' ? 'max' : 'snap', id, side, value: side === 'max' ? true : undefined });
    const setGeom = (id, geom, anim) => dispatch({ type: 'geom', id, geom, anim });
    const phase = (id, p) => dispatch({ type: 'phase', id, phase: p });
    const closeApp = (app) => dispatch({ type: 'closeApp', app });
    const minimizeAll = () => ref.current.windows.filter((w) => !w.min).forEach((w) => minimize(w.id));

    // Dock / taskbar click: launch, restore, raise, or minimize the app's front window.
    const activate = (app, origin) => {
      const meta = APPS[app];
      if (meta.kind) return open(app, { origin });
      const s = ref.current;
      const wins = s.windows.filter((w) => w.app === app && w.phase !== 'closing');
      if (!wins.length) return open(app, { origin });
      const top = wins.reduce((a, b) => (b.z > a.z ? b : a));
      if (s.focused === top.id && !top.min) return minimize(top.id);
      const minimized = wins.filter((w) => w.min);
      if (wins.every((w) => w.min)) minimized.forEach((w) => focus(w.id));
      focus(top.id);
    };

    const setTheme = (id) => {
      const th = THEMES[id];
      set({ theme: id, wallpaper: th.wallpaper, lastDark: th.dark ? id : ref.current.lastDark });
    };
    const toggleDark = () => {
      const s = ref.current;
      if (THEMES[s.theme].dark) setTheme('daylight');
      else setTheme(s.lastDark || 'aurora');
    };

    const switchMode = (to) => {
      const s = ref.current;
      const next = to || (s.mode === 'hybrid' ? 'windows' : 'hybrid');
      if (next === s.mode || switching.current) return;
      switching.current = true;
      const { anim } = motionVars(s.motion);
      const k = (s.transition === 'fast' ? 0.55 : 1) * Math.max(0.15, Math.min(anim, 1.2));
      set({ switching: 'out', overlay: null, ctx: null });
      setTimeout(() => set({ mode: next, switching: 'in', modeBanner: s.modeLabel ? { mode: next, at: Date.now() } : null }), 320 * k);
      setTimeout(() => {
        set({ switching: null });
        switching.current = false;
      }, 1000 * k);
      setTimeout(() => set({ modeBanner: null }), 1500 * k + 600);
    };

    const toggleOverlay = (name) => set({ overlay: ref.current.overlay === name ? null : name, ctx: null });
    const contextMenu = (e, items) => {
      e.preventDefault();
      e.stopPropagation();
      const p = toLocal(e.clientX, e.clientY);
      set({ ctx: { x: p.x, y: p.y, items } });
    };

    return {
      dispatch,
      set,
      notify,
      open,
      focus,
      close,
      minimize,
      toggleMax,
      snap,
      setGeom,
      phase,
      closeApp,
      minimizeAll,
      activate,
      setTheme,
      toggleDark,
      switchMode,
      toggleOverlay,
      contextMenu,
      setDock: (patch) => dispatch({ type: 'dock', patch }),
      setWidgets: (patch) => dispatch({ type: 'widgets', patch }),
      setWidgetPos: (id, pos) => dispatch({ type: 'widgetPos', id, pos }),
      get: () => ref.current,
    };
  }, []);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <OSContext.Provider value={value}>{children}</OSContext.Provider>;
}

export function useOS() {
  return useContext(OSContext);
}
