import { Monitor, Palette, Moon, Wifi, Lock, StickyNote, Image as ImageIcon, SlidersHorizontal, Bot, FileCode, FileText, Folder, FileImage, FileArchive, FileVideo, FileSpreadsheet, FileJson, Music, File } from 'lucide-react';
import { APPS, LAUNCHABLE } from './apps';
import { PROJECTS, allFiles, CODE } from './data';
import { THEMES, WALLPAPERS } from './themes';

export function fileIcon(name, isFolder) {
  if (isFolder) return Folder;
  const ext = name.split('.').pop().toLowerCase();
  if (['js', 'cs', 'glsl', 'xaml', 'csproj', 'sln', 'html'].includes(ext)) return FileCode;
  if (ext === 'json') return FileJson;
  if (['png', 'jpg'].includes(ext)) return FileImage;
  if (ext === 'zip') return FileArchive;
  if (ext === 'mp4') return FileVideo;
  if (ext === 'xlsx') return FileSpreadsheet;
  if (ext === 'm3u') return Music;
  if (['md', 'pdf'].includes(ext)) return FileText;
  return File;
}

// Decide what opening a file means in the prototype
export function openFile(actions, f) {
  const ext = f.name.split('.').pop().toLowerCase();
  if (f.isFolder || f.type === 'folder') return actions.open('explorer', { props: { path: [...f.path, f.name] } });
  if (['js', 'cs', 'glsl', 'json', 'md', 'xaml', 'csproj', 'html', 'sln'].includes(ext)) {
    const proj = PROJECTS.find((p) => f.path.join('/').startsWith(p.path.join('/')));
    return actions.open('vscode', { title: `${f.name} — Visual Studio Code`, props: { project: proj ? proj.id : 'hybrid', file: CODE[f.name] ? f.name : null, fileName: f.name } });
  }
  if (ext === 'm3u') return actions.open('spotify');
  return actions.open('explorer', { props: { path: f.path, select: f.name } });
}

export function buildIndex(state, actions) {
  const items = [];
  for (const id of [...LAUNCHABLE, 'about']) {
    const a = APPS[id];
    items.push({ kind: 'App', id: `app:${id}`, title: a.name, sub: a.blurb, app: id, keys: `${a.name} ${a.short} ${a.keywords}`, run: () => (id === 'rocky' ? actions.set({ rocky: true, overlay: null }) : actions.open(id)) });
  }
  for (const p of PROJECTS)
    items.push({ kind: 'Project', id: `proj:${p.id}`, title: p.name, sub: `${p.desc} · ${p.lang}`, color: p.color, keys: `${p.name} project ${p.lang} ${p.desc}`, run: () => actions.open('vscode', { title: `${p.name} — Visual Studio Code`, props: { project: p.id } }) });
  for (const f of allFiles())
    items.push({ kind: f.isFolder ? 'Folder' : 'File', id: `file:${[...f.path, f.name].join('/')}`, title: f.name, sub: ['Home', ...f.path].join(' › '), icon: fileIcon(f.name, f.isFolder), keys: `${f.name} ${f.path.join(' ')}`, run: () => openFile(actions, f) });
  const act = (id, title, sub, icon, run, keys = '') => items.push({ kind: 'Action', id: `act:${id}`, title, sub, icon, keys: `${title} ${keys}`, run });
  act('mode', state.mode === 'hybrid' ? 'Switch to Windows Desktop' : 'Switch to HYBRID Mode', 'Ctrl+Alt+M', Monitor, () => actions.switchMode(), 'mode desktop windows hybrid toggle');
  for (const t of Object.keys(THEMES)) act(`theme-${t}`, `Theme: ${THEMES[t].name}`, THEMES[t].blurb, Palette, () => actions.setTheme(t), 'theme appearance dark light');
  for (const w of WALLPAPERS) act(`wp-${w.id}`, `Wallpaper: ${w.name}`, w.note, ImageIcon, () => actions.set({ wallpaper: w.id }), 'wallpaper background');
  act('focus', state.focus ? 'Turn Focus Mode off' : 'Turn Focus Mode on', 'Silence notifications and dim widgets', Moon, () => actions.set({ focus: !state.focus }), 'focus do not disturb dnd');
  act('wifi', state.wifi ? 'Turn Wi-Fi off' : 'Turn Wi-Fi on', 'Simulated network', Wifi, () => actions.set({ wifi: !state.wifi }), 'wifi network');
  act('cc', 'Open Control Center', 'Quick settings, performance, appearance', SlidersHorizontal, () => actions.set({ overlay: 'control' }), 'control center settings');
  act('rocky', 'Ask Rocky', 'Open the AI companion panel', Bot, () => actions.set({ rocky: true, overlay: null }), 'ai assistant');
  act('note', 'New Quick Note', 'Focus the notes widget', StickyNote, () => {
    actions.set({ showWidgets: true, overlay: null });
    actions.setWidgets({ notes: true });
    setTimeout(() => document.getElementById('quick-notes')?.focus(), 80);
  }, 'note write');
  act('lock', 'Lock Screen', 'Show the lock screen', Lock, () => actions.set({ overlay: 'lock' }), 'lock');
  return items;
}

function score(q, item) {
  const t = item.title.toLowerCase();
  const k = item.keys.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 - t.length * 0.1;
  if (t.split(/[\s.\-—]+/).some((w) => w.startsWith(q))) return 60;
  if (t.includes(q)) return 45;
  if (k.includes(q)) return 30;
  // subsequence fuzzy match on the title
  let i = 0;
  for (const c of t) if (c === q[i]) i++;
  return i === q.length ? 12 : 0;
}

const KIND_BOOST = { App: 8, Action: 4, Project: 6, Folder: 1, File: 0 };

export function search(index, query, limit = 9) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index
    .map((it) => ({ it, s: score(q, it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s + KIND_BOOST[b.it.kind] - (a.s + KIND_BOOST[a.it.kind]))
    .slice(0, limit)
    .map((x) => x.it);
}
