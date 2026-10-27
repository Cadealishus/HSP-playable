// Visual themes, accents and wallpapers. Every surface reads these through CSS variables on .os.

export const THEMES = {
  aurora: {
    name: 'Aurora',
    blurb: 'Midnight blue, violet and cyan neon',
    dark: true,
    wallpaper: 'midnight-lake',
    acc: '79 227 255',
    acc2: '155 110 255',
    t1: '#ecf1ff',
    t2: 'rgba(214,224,255,.74)',
    t3: 'rgba(190,204,255,.50)',
    glass: '15 19 46',
    line: 'rgba(170,190,255,.17)',
    hl: 'rgba(255,255,255,.10)',
    hover: 'rgba(150,175,255,.13)',
    field: 'rgba(255,255,255,.06)',
    shadow: '0 22px 60px -14px rgba(2,4,24,.7)',
    preview: ['#070b2a', '#3b2a8f', '#4fe3ff'],
  },
  stealth: {
    name: 'Stealth',
    blurb: 'Graphite and black with electric blue',
    dark: true,
    wallpaper: 'obsidian',
    acc: '61 139 255',
    acc2: '130 176 255',
    t1: '#f3f4f6',
    t2: 'rgba(235,237,242,.70)',
    t3: 'rgba(220,224,232,.44)',
    glass: '13 14 17',
    line: 'rgba(255,255,255,.09)',
    hl: 'rgba(255,255,255,.06)',
    hover: 'rgba(255,255,255,.07)',
    field: 'rgba(255,255,255,.05)',
    shadow: '0 22px 60px -14px rgba(0,0,0,.85)',
    preview: ['#050506', '#1a1d26', '#3d8bff'],
  },
  daylight: {
    name: 'Daylight',
    blurb: 'Frosted white glass and soft sky blue',
    dark: false,
    wallpaper: 'glacier',
    acc: '24 128 255',
    acc2: '122 92 255',
    t1: '#0f1a2e',
    t2: 'rgba(22,36,62,.72)',
    t3: 'rgba(28,44,74,.48)',
    glass: '248 251 255',
    line: 'rgba(255,255,255,.78)',
    hl: 'rgba(255,255,255,.95)',
    hover: 'rgba(20,60,140,.07)',
    field: 'rgba(15,40,90,.06)',
    shadow: '0 0 0 .5px rgba(30,60,120,.16), 0 18px 44px -16px rgba(30,60,120,.38)',
    preview: ['#b9dafa', '#f3e7f1', '#1880ff'],
  },
};

// Windows-mode chrome follows the HYBRID theme's light/dark choice.
const WIN = {
  dark: {
    acc: '76 194 255',
    acc2: '76 194 255',
    t1: '#f5f5f5',
    t2: 'rgba(255,255,255,.74)',
    t3: 'rgba(255,255,255,.50)',
    glass: '34 34 36',
    line: 'rgba(255,255,255,.08)',
    hl: 'rgba(255,255,255,.05)',
    hover: 'rgba(255,255,255,.07)',
    field: 'rgba(255,255,255,.06)',
    shadow: '0 18px 50px rgba(0,0,0,.5)',
  },
  light: {
    acc: '0 95 184',
    acc2: '0 95 184',
    t1: '#1b1b1b',
    t2: 'rgba(0,0,0,.68)',
    t3: 'rgba(0,0,0,.46)',
    glass: '243 243 245',
    line: 'rgba(0,0,0,.09)',
    hl: 'rgba(255,255,255,.7)',
    hover: 'rgba(0,0,0,.05)',
    field: 'rgba(0,0,0,.04)',
    shadow: '0 18px 50px rgba(0,0,0,.22)',
  },
};

export const ACCENTS = [
  { id: 'auto', name: 'Theme default', rgb: null },
  { id: 'cyan', name: 'Cyan', rgb: '79 227 255' },
  { id: 'violet', name: 'Violet', rgb: '164 124 255' },
  { id: 'blue', name: 'Electric blue', rgb: '61 139 255' },
  { id: 'magenta', name: 'Magenta', rgb: '255 96 204' },
  { id: 'emerald', name: 'Emerald', rgb: '52 226 160' },
  { id: 'amber', name: 'Amber', rgb: '255 182 72' },
];

export const WALLPAPERS = [
  { id: 'midnight-lake', name: 'Midnight Lake', note: 'Aurora over a glass lake' },
  { id: 'nebula-rift', name: 'Nebula Rift', note: 'Ringed giant rising' },
  { id: 'obsidian', name: 'Obsidian', note: 'Graphite peaks, blue rim light' },
  { id: 'glacier', name: 'Glacier Morning', note: 'First light on ice' },
];

function lum(rgb) {
  const [r, g, b] = rgb.split(' ').map((v) => Number(v) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function accentRgb(state) {
  const a = ACCENTS.find((x) => x.id === state.accent);
  return a && a.rgb ? a.rgb : null;
}

// Map a 0..100 motion slider onto a duration multiplier (--anim) and a distance multiplier (--mo).
export function motionVars(v) {
  const anim = v <= 0 ? 0.01 : v <= 50 ? Math.max(0.25, v / 50) : 1 + ((v - 50) / 50) * 0.4;
  const mo = v <= 0 ? 0 : Math.min(1.6, v / 50);
  return { anim, mo };
}

export function themeVars(state) {
  const th = THEMES[state.theme];
  const isWin = state.mode === 'windows';
  const base = isWin ? (th.dark ? WIN.dark : WIN.light) : th;
  const acc = accentRgb(state) || base.acc;
  const acc2 = isWin ? acc : accentRgb(state) && state.accent !== 'auto' ? th.acc2 : base.acc2;
  const T = state.glass / 100; // 0 = solid, 1 = very clear
  const ga = isWin ? 0.9 - T * 0.32 : 0.92 - T * 0.7;
  const { anim, mo } = motionVars(state.motion);
  return {
    '--t1': base.t1,
    '--t2': base.t2,
    '--t3': base.t3,
    '--line': base.line,
    '--hl': base.hl,
    '--hover': base.hover,
    '--field': base.field,
    '--shadow': base.shadow,
    '--glass': base.glass,
    '--ga': ga.toFixed(3),
    '--blur': isWin ? '30px' : `${18 + Math.round(T * 16)}px`,
    '--acc': acc,
    '--acc2': acc2,
    '--on-acc': lum(acc) > 0.55 ? '#03121c' : '#ffffff',
    '--anim': anim,
    '--mo': mo,
  };
}
