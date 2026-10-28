// Themes, accents and wallpapers. Every component reads colour through the CSS variables
// produced by themeVars(); no component invents its own shade. Token meanings are documented
// at the top of src/styles.css.

const DARK_STATUS = { ok: '74 210 140', warn: '240 178 72', bad: '240 96 110' };
const LIGHT_STATUS = { ok: '20 150 90', warn: '196 122 10', bad: '205 50 70' };

export const THEMES = {
  aurora: {
    name: 'Aurora',
    blurb: 'Midnight navy with cyan and violet',
    dark: true,
    wallpaper: 'nebula-rift',
    acc: '92 205 240',
    acc2: '150 130 255',
    surface: '12 15 30',
    t1: '#e9edf7',
    t2: 'rgba(214,222,242,.74)',
    t3: 'rgba(190,200,228,.52)',
    line: 'rgba(255,255,255,.09)',
    hl: 'rgba(255,255,255,.06)',
    hover: 'rgba(255,255,255,.07)',
    press: 'rgba(255,255,255,.11)',
    field: 'rgba(255,255,255,.06)',
    shadow: '0 10px 30px -14px rgba(0,0,0,.6)',
    shadowLg: '0 24px 60px -20px rgba(0,0,0,.7)',
    icon: ['#272d45', '#151929', 'rgba(255,255,255,.10)'],
    status: DARK_STATUS,
    preview: ['#140a2e', '#3a1f6b', '#5ccdf0'],
  },
  stealth: {
    name: 'Stealth',
    blurb: 'Graphite and black with electric blue',
    dark: true,
    wallpaper: 'obsidian',
    acc: '72 142 255',
    acc2: '140 170 255',
    surface: '10 11 13',
    t1: '#f2f3f5',
    t2: 'rgba(232,234,238,.70)',
    t3: 'rgba(220,223,230,.46)',
    line: 'rgba(255,255,255,.08)',
    hl: 'rgba(255,255,255,.05)',
    hover: 'rgba(255,255,255,.06)',
    press: 'rgba(255,255,255,.10)',
    field: 'rgba(255,255,255,.05)',
    shadow: '0 10px 30px -14px rgba(0,0,0,.75)',
    shadowLg: '0 24px 60px -20px rgba(0,0,0,.85)',
    icon: ['#25272d', '#121316', 'rgba(255,255,255,.09)'],
    status: DARK_STATUS,
    preview: ['#060708', '#1b1e25', '#488eff'],
  },
  daylight: {
    name: 'Daylight',
    blurb: 'Frosted white with soft sky blue',
    dark: false,
    wallpaper: 'glacier',
    acc: '16 116 230',
    acc2: '112 88 230',
    surface: '248 250 253',
    t1: '#111a2b',
    t2: 'rgba(17,26,43,.70)',
    t3: 'rgba(17,26,43,.50)',
    line: 'rgba(15,30,60,.10)',
    hl: 'rgba(255,255,255,.8)',
    hover: 'rgba(15,30,60,.06)',
    press: 'rgba(15,30,60,.10)',
    field: 'rgba(15,30,60,.06)',
    shadow: '0 8px 24px -12px rgba(20,40,80,.28)',
    shadowLg: '0 20px 50px -18px rgba(20,40,80,.35)',
    icon: ['#ffffff', '#edf1f7', 'rgba(15,30,60,.12)'],
    status: LIGHT_STATUS,
    preview: ['#a9cdf3', '#eef2f8', '#1074e6'],
  },
};

// Windows-mode chrome follows the HYBRID theme's light/dark choice.
const WIN = {
  dark: {
    acc: '76 194 255',
    surface: '32 32 34',
    t1: '#f5f5f5',
    t2: 'rgba(255,255,255,.74)',
    t3: 'rgba(255,255,255,.50)',
    line: 'rgba(255,255,255,.08)',
    hl: 'rgba(255,255,255,.05)',
    hover: 'rgba(255,255,255,.07)',
    press: 'rgba(255,255,255,.10)',
    field: 'rgba(255,255,255,.06)',
    shadow: '0 8px 24px rgba(0,0,0,.4)',
    shadowLg: '0 18px 50px rgba(0,0,0,.5)',
    icon: ['#2c2c30', '#1b1b1e', 'rgba(255,255,255,.09)'],
    status: DARK_STATUS,
  },
  light: {
    acc: '0 95 184',
    surface: '243 243 245',
    t1: '#1b1b1b',
    t2: 'rgba(0,0,0,.68)',
    t3: 'rgba(0,0,0,.48)',
    line: 'rgba(0,0,0,.09)',
    hl: 'rgba(255,255,255,.7)',
    hover: 'rgba(0,0,0,.05)',
    press: 'rgba(0,0,0,.08)',
    field: 'rgba(0,0,0,.04)',
    shadow: '0 8px 24px rgba(0,0,0,.14)',
    shadowLg: '0 18px 50px rgba(0,0,0,.22)',
    icon: ['#ffffff', '#eef0f4', 'rgba(0,0,0,.10)'],
    status: LIGHT_STATUS,
  },
};

export const ACCENTS = [
  { id: 'auto', name: 'Theme default', rgb: null },
  { id: 'cyan', name: 'Cyan', rgb: '92 205 240' },
  { id: 'violet', name: 'Violet', rgb: '150 130 255' },
  { id: 'blue', name: 'Blue', rgb: '72 142 255' },
  { id: 'magenta', name: 'Magenta', rgb: '232 112 200' },
  { id: 'emerald', name: 'Emerald', rgb: '70 205 150' },
  { id: 'amber', name: 'Amber', rgb: '240 178 72' },
];

export const WALLPAPERS = [
  { id: 'nebula-rift', name: 'Nebula Rift', note: 'Ringed giant over a still lake' },
  { id: 'midnight-lake', name: 'Midnight Lake', note: 'Aurora over a frozen lake' },
  { id: 'obsidian', name: 'Obsidian', note: 'Milky Way above a forest lake' },
  { id: 'glacier', name: 'Glacier Morning', note: 'First light on the peaks' },
];

function lum(rgb) {
  const [r, g, b] = rgb.split(' ').map((v) => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function accentRgb(state) {
  const a = ACCENTS.find((x) => x.id === state.accent);
  return a && a.rgb ? a.rgb : null;
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// Map a 0..100 motion slider onto a duration multiplier (--anim) and a distance multiplier (--mo).
// With the OS reduced-motion preference, things still fade but nothing travels or scales.
export function motionVars(v) {
  const anim = v <= 0 ? 0.01 : v <= 50 ? Math.max(0.35, v / 50) : 1 + ((v - 50) / 50) * 0.3;
  const mo = v <= 0 || prefersReducedMotion() ? 0 : Math.min(1.3, v / 50);
  return { anim, mo };
}

export function themeVars(state) {
  const th = THEMES[state.theme];
  const isWin = state.mode === 'windows';
  const base = isWin ? (th.dark ? WIN.dark : WIN.light) : th;
  const acc = accentRgb(state) || base.acc;
  const T = state.glass / 100; // 0 = solid, 1 = clear
  const ga = isWin ? 0.9 - T * 0.3 : 0.8 - T * 0.44 + (th.dark ? 0 : 0.12);
  const { anim, mo } = motionVars(state.motion);
  return {
    '--t1': base.t1,
    '--t2': base.t2,
    '--t3': base.t3,
    '--line': base.line,
    '--hl': base.hl,
    '--hover': base.hover,
    '--press': base.press,
    '--field': base.field,
    '--shadow': base.shadow,
    '--shadow-lg': base.shadowLg,
    '--surface': base.surface,
    '--ga': ga.toFixed(3),
    '--blur': isWin ? '30px' : `${18 + Math.round(T * 12)}px`,
    '--acc': acc,
    '--acc2': isWin ? acc : th.acc2,
    '--on-acc': lum(acc) > 0.5 ? '#04131b' : '#ffffff',
    '--ok': base.status.ok,
    '--warn': base.status.warn,
    '--bad': base.status.bad,
    '--icon-top': base.icon[0],
    '--icon-bot': base.icon[1],
    '--icon-edge': base.icon[2],
    '--icon-mix': th.dark ? '0%' : '28%',
    '--anim': anim,
    '--mo': mo,
  };
}
