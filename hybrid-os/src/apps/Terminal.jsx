import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/store';
import { APPS } from '../os/apps';
import { THEMES, WALLPAPERS, ACCENTS } from '../os/themes';
import { nodeAt } from '../os/data';
import { usePerf } from '../os/sim';

const LOGO = [
  '      ◆◆◆      ◇◇◇     ',
  '    ◆◆◆◆◆◆  ◇◇   ◇◇   ',
  '   ◆◆◆◆◆◆◆◇◇◇     ◇◇  ',
  '    ◆◆◆◆◆◆  ◇◇   ◇◇   ',
  '      ◆◆◆      ◇◇◇     ',
];

const C = { acc: 'text-[#5ef0ff]', vio: 'text-[#b296ff]', dim: 'text-[#7d8bb3]', ok: 'text-[#5af0a8]', warn: 'text-[#ffc66b]', err: 'text-[#ff6b8a]' };

export default function Terminal({ win }) {
  const { state, actions } = useOS();
  const perf = usePerf();
  const [lines, setLines] = useState(() => [
    { t: 'HYBRID Terminal 0.9 · simulated shell, no real commands run', c: C.dim },
    { t: "Type 'help' to see what it can do.", c: C.dim },
    { t: '' },
  ]);
  const [cmd, setCmd] = useState('');
  const [cwd, setCwd] = useState([]);
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const scroller = useRef(null);
  const input = useRef(null);
  useEffect(() => {
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lines]);
  useEffect(() => {
    if (state.focused === win) setTimeout(() => input.current && input.current.focus(), 30);
  }, [state.focused === win]);

  const prompt = `~${cwd.length ? '/' + cwd.join('/') : ''}`;
  const out = (...ls) => setLines((l) => [...l, ...ls.map((x) => (typeof x === 'string' ? { t: x } : x))]);

  const run = (raw) => {
    const line = raw.trim();
    out({ prompt, t: raw });
    if (!line) return;
    setHist((h) => [line, ...h].slice(0, 50));
    const [name, ...args] = line.split(/\s+/);
    const arg = args.join(' ');
    switch (name.toLowerCase()) {
      case 'help':
        return out(
          { t: 'Commands', c: C.vio },
          ...[
            ['help', 'show this list'],
            ['clear', 'clear the screen'],
            ['about', 'about HYBRID OS'],
            ['neofetch', 'system summary'],
            ['ls / cd <dir>', 'browse the simulated file system'],
            ['open <app>', 'launch an app (explorer, code, blender…)'],
            ['theme <aurora|stealth|daylight>', 'change theme'],
            ['accent <name>', 'cyan, violet, blue, magenta, emerald, amber'],
            ['wallpaper <name>', 'midnight-lake, nebula-rift, obsidian, glacier'],
            ['mode [hybrid|windows]', 'switch desktop mode'],
            ['rocky <message>', 'talk to Rocky'],
            ['top', 'live performance snapshot'],
            ['echo, date, whoami, history, exit', ''],
          ].map(([a, b]) => ({ t: `  ${a.padEnd(36)}${b}`, c: '' })),
          ''
        );
      case 'clear':
      case 'cls':
        return setLines([]);
      case 'about':
        return out({ t: 'HYBRID OS — Concept 0.9 “Aurora”', c: C.acc }, 'A desktop environment concept that blends macOS calm with Windows 11 practicality.', 'Everything here is a browser simulation. The production shell will be a native Windows app.', '');
      case 'neofetch':
        return out(
          ...LOGO.map((l, i) => ({
            t: l,
            c: C.acc,
            right: [
              ['cade', '@hybrid'],
              ['OS', 'HYBRID OS Concept 0.9'],
              ['Mode', state.mode === 'hybrid' ? 'HYBRID' : 'Windows'],
              ['Theme', `${THEMES[state.theme].name} · ${state.accent}`],
              ['CPU', `${Math.round(perf.cpu)}% (simulated)`],
            ][i],
          })),
          { t: '      ' + ['#5ef0ff', '#9b6bff', '#3d8bff', '#ff60cc', '#34e2a0', '#ffb648'].map(() => '███').join(''), c: '', swatches: true },
          ''
        );
      case 'ls':
      case 'dir': {
        const n = nodeAt([...cwd, ...(arg ? arg.split('/') : [])]);
        if (!n) return out({ t: `ls: ${arg}: no such directory`, c: C.err });
        return out({ t: n.children.map((c) => (c.type === 'folder' ? `${c.name}/` : c.name)).join('    '), c: '', ls: n.children });
      }
      case 'cd': {
        if (!arg || arg === '~') return setCwd([]);
        if (arg === '..') return setCwd((c) => c.slice(0, -1));
        const next = [...cwd, ...arg.replace(/\/$/, '').split('/')];
        if (!nodeAt(next)) return out({ t: `cd: ${arg}: no such directory`, c: C.err });
        return setCwd(next);
      }
      case 'pwd':
        return out(`/home/cade${cwd.length ? '/' + cwd.join('/') : ''}`);
      case 'open':
      case 'start': {
        const alias = { code: 'vscode', vscode: 'vscode', files: 'explorer', explorer: 'explorer', browser: 'edge', edge: 'edge', music: 'spotify', spotify: 'spotify', settings: 'settings', blender: 'blender', discord: 'discord', terminal: 'terminal', rocky: 'rocky' };
        const id = alias[arg.toLowerCase()] || Object.keys(APPS).find((k) => APPS[k].name.toLowerCase() === arg.toLowerCase());
        if (!id) return out({ t: `open: unknown app '${arg}'. Try: ${Object.keys(alias).slice(0, 8).join(', ')}`, c: C.err });
        out({ t: `→ launching ${APPS[id].name}`, c: C.ok });
        return setTimeout(() => actions.open(id), 150);
      }
      case 'theme':
        if (!THEMES[arg]) return out({ t: `theme: choose ${Object.keys(THEMES).join(', ')}`, c: C.warn });
        actions.setTheme(arg);
        return out({ t: `✓ theme set to ${THEMES[arg].name}`, c: C.ok });
      case 'accent': {
        const a = ACCENTS.find((x) => x.id === arg || x.name.toLowerCase() === arg);
        if (!a) return out({ t: `accent: choose ${ACCENTS.map((x) => x.id).join(', ')}`, c: C.warn });
        actions.set({ accent: a.id });
        return out({ t: `✓ accent set to ${a.name}`, c: C.ok });
      }
      case 'wallpaper':
        if (!WALLPAPERS.find((w) => w.id === arg)) return out({ t: `wallpaper: choose ${WALLPAPERS.map((w) => w.id).join(', ')}`, c: C.warn });
        actions.set({ wallpaper: arg });
        return out({ t: `✓ wallpaper set to ${arg}`, c: C.ok });
      case 'mode':
        out({ t: `→ switching to ${arg || (state.mode === 'hybrid' ? 'windows' : 'hybrid')} mode`, c: C.ok });
        return setTimeout(() => actions.switchMode(arg === 'hybrid' || arg === 'windows' ? arg : undefined), 200);
      case 'top':
        return out({ t: `CPU ${Math.round(perf.cpu)}%   GPU ${Math.round(perf.gpu)}%   RAM ${perf.ram.toFixed(1)}/32 GB   NET ↓${perf.netDown.toFixed(0)} ↑${perf.netUp.toFixed(1)} Mb/s   (simulated)`, c: C.acc });
      case 'rocky':
        actions.set({ rocky: true });
        return out({ t: arg ? `rocky: “${arg}” — I opened my panel so we can talk there.` : 'rocky: hi! Opening my panel.', c: C.vio });
      case 'echo':
        return out(arg);
      case 'date':
        return out(new Date().toString());
      case 'whoami':
        return out('cade');
      case 'history':
        return out(...hist.slice().reverse().map((h, i) => `  ${String(i + 1).padStart(3)}  ${h}`));
      case 'sudo':
        return out({ t: 'cade is not in the sudoers file. This incident will be reported to Rocky. 👀', c: C.warn });
      case 'exit':
        return actions.close(win);
      default:
        return out({ t: `${name}: command not found. Type 'help'.`, c: C.err });
    }
  };

  return (
    <div className="h-full flex flex-col font-mono text-[13px] leading-[1.6]" style={{ background: 'linear-gradient(180deg, rgba(4,6,18,.92), rgba(6,8,24,.95))', color: '#d7e2ff' }} onClick={() => input.current && input.current.focus()}>
      <div className="flex items-center px-4 h-8 shrink-0 text-[12px] text-[#7d8bb3]" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        hsh · {prompt} · simulated shell
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 selectable">
        {lines.map((l, i) =>
          l.prompt != null ? (
            <div key={i} className="whitespace-pre-wrap break-words">
              <span className="text-[#5af0a8]">cade@hybrid</span> <span className="text-[#b296ff]">{l.prompt}</span> <span className="text-[#5ef0ff]">❯</span> {l.t}
            </div>
          ) : l.swatches ? (
            <div key={i} className="whitespace-pre">
              {'      '}
              {['#5ef0ff', '#9b6bff', '#3d8bff', '#ff60cc', '#34e2a0', '#ffb648'].map((c) => (
                <span key={c} style={{ color: c }}>███</span>
              ))}
            </div>
          ) : l.ls ? (
            <div key={i} className="flex flex-wrap gap-x-6">
              {l.ls.map((c) => (
                <span key={c.name} className={c.type === 'folder' ? 'text-[#6fb6ff] font-semibold' : ''}>
                  {c.name}
                  {c.type === 'folder' ? '/' : ''}
                </span>
              ))}
            </div>
          ) : (
            <div key={i} className={`whitespace-pre-wrap break-words ${l.c || ''}`}>
              {l.t || ' '}
              {l.right && (
                <span>
                  {'  '}
                  <span className="text-[#b296ff] font-semibold">{l.right[0]}</span>
                  <span className="text-[#d7e2ff]">{l.right[0] === 'cade' ? l.right[1] : `: ${l.right[1]}`}</span>
                </span>
              )}
            </div>
          )
        )}
        <div className="flex items-center">
          <span className="text-[#5af0a8]">cade@hybrid</span>&nbsp;<span className="text-[#b296ff]">{prompt}</span>&nbsp;<span className="text-[#5ef0ff]">❯</span>&nbsp;
          <span className="relative flex-1">
            <input
              ref={input}
              aria-label="Terminal input"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  run(cmd);
                  setCmd('');
                  setHi(-1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const n = Math.min(hist.length - 1, hi + 1);
                  if (hist[n] != null) (setHi(n), setCmd(hist[n]));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const n = hi - 1;
                  setHi(Math.max(-1, n));
                  setCmd(n >= 0 ? hist[n] : '');
                } else if (e.key === 'l' && e.ctrlKey) {
                  e.preventDefault();
                  setLines([]);
                }
              }}
              className="w-full bg-transparent outline-none text-[#e8efff] caret-[#5ef0ff]"
              spellCheck={false}
              autoComplete="off"
            />
          </span>
        </div>
      </div>
    </div>
  );
}
