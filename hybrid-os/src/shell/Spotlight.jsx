import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { useOS } from '../os/store';
import { buildIndex, search } from '../os/search';
import { AppIcon, Kbd } from '../components/ui';

function ResultIcon({ item, size = 30 }) {
  if (item.app) return <AppIcon app={item.app} size={size} />;
  if (item.kind === 'Project')
    return (
      <span className="grid place-items-center rounded-[9px] text-[11px] font-extrabold" style={{ width: size, height: size, background: `${item.color}26`, color: `color-mix(in srgb, ${item.color} 65%, var(--t1))`, boxShadow: `inset 0 0 0 1px ${item.color}55` }}>
        {item.title.split(' ').map((w) => w[0]).join('').slice(0, 2)}
      </span>
    );
  const I = item.icon;
  return (
    <span className="grid place-items-center rounded-[9px] field" style={{ width: size, height: size }}>
      <I size={size * 0.5} className={item.kind === 'Action' ? 'text-acc' : 'text-t2'} />
    </span>
  );
}

export default function Spotlight() {
  const { state, actions } = useOS();
  const open = state.overlay === 'spotlight';
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const index = useMemo(() => (open ? buildIndex(state, actions) : []), [open, state.mode, state.focus, state.wifi]);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => input.current && input.current.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    if (q.trim()) return search(index, q);
    const pick = (ids) => ids.map((id) => index.find((x) => x.id === id)).filter(Boolean);
    return pick(['app:explorer', 'app:terminal', 'app:vscode', 'app:rocky', 'proj:hsp', 'act:mode', 'act:cc']);
  }, [q, index]);

  useEffect(() => setSel(0), [q]);
  if (!open) return null;

  const run = (it) => {
    if (!it) return;
    actions.set({ overlay: null });
    setTimeout(() => it.run(), 30);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') run(results[sel]);
    else if (e.key === 'Escape') actions.set({ overlay: null });
  };
  const current = results[sel];

  // Group rows by kind, keeping the global index for keyboard selection
  const groups = [];
  results.forEach((it, i) => {
    const label = q.trim() ? (i === 0 ? 'Top hit' : it.kind === 'Folder' ? 'File' : it.kind) : 'Suggestions';
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push([it, i]);
    else groups.push({ label, rows: [[it, i]] });
  });

  return (
    <div className="absolute inset-0 z-[8800]" onPointerDown={(e) => e.target === e.currentTarget && actions.set({ overlay: null })} style={{ background: 'rgba(2,4,16,.18)' }}>
      <div className="absolute left-1/2 top-[16%] w-[min(720px,92%)] -translate-x-1/2">
        <div className="glass-strong rounded-[22px] overflow-hidden a-spot" style={{ boxShadow: 'var(--shadow), 0 0 0 1px rgb(var(--acc) / .18), 0 30px 90px -20px rgb(var(--acc) / .35)' }}>
          <div className="relative flex items-center gap-3 px-5 h-[62px]">
            <Search size={21} className="text-acc shrink-0" />
            <input
              ref={input}
              id="spotlight-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search apps, files, projects and commands"
              className="flex-1 bg-transparent outline-none text-[19px] font-medium text-t1 placeholder:text-t3"
              autoComplete="off"
              spellCheck={false}
            />
            <Kbd>Esc</Kbd>
            <div className="absolute left-5 right-5 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, rgb(var(--acc) / .7), rgb(var(--acc2) / .5), transparent)' }} />
          </div>
          <div className="flex h-[360px]">
            <div className="flex-1 overflow-y-auto p-2">
              {results.length === 0 && (
                <div className="h-full grid place-items-center text-center text-t3 text-[13px]">
                  <div>
                    No matches for “{q}”.
                    <br />
                    Try an app name, a file like orbit.js, or “theme”.
                  </div>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.label + g.rows[0][1]} className="mb-1">
                  <div className="px-3 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-t3">{g.label}</div>
                  {g.rows.map(([it, i]) => (
                    <button
                      key={it.id}
                      onMouseMove={() => sel !== i && setSel(i)}
                      onClick={() => run(it)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-[12px] text-left"
                      style={{ background: sel === i ? 'rgb(var(--acc) / .16)' : 'transparent', boxShadow: sel === i ? 'inset 0 0 0 1px rgb(var(--acc) / .3)' : 'none', transition: 'background 90ms' }}
                    >
                      <ResultIcon item={it} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-bold truncate">{it.title}</span>
                        <span className="block text-[11.5px] text-t3 truncate">{it.sub}</span>
                      </span>
                      <span className="text-[10.5px] font-semibold text-t3">{it.kind}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {current && (
              <div className="w-[230px] shrink-0 p-5 flex flex-col items-center text-center" style={{ borderLeft: '1px solid var(--line)' }}>
                <div key={current.id} className="a-pop flex flex-col items-center">
                  <div className="mt-6 mb-4" style={{ filter: 'drop-shadow(0 10px 24px rgb(var(--acc) / .35))' }}>
                    <ResultIcon item={current} size={72} />
                  </div>
                  <div className="font-display text-[16px] font-semibold leading-tight">{current.title}</div>
                  <div className="text-[12px] text-t2 mt-1.5 leading-snug">{current.sub}</div>
                  <div className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-acc">{current.kind}</div>
                </div>
                <button onClick={() => run(current)} className="mt-auto w-full rounded-[11px] py-2 text-[12.5px] font-bold press" style={{ background: 'linear-gradient(90deg, rgb(var(--acc)), rgb(var(--acc2)))', color: 'var(--on-acc)' }}>
                  {current.kind === 'Action' ? 'Run' : 'Open'}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 px-5 h-[38px] text-[11px] text-t3" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="flex items-center gap-1.5">
              <ArrowUp size={12} />
              <ArrowDown size={12} /> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <CornerDownLeft size={12} /> open
            </span>
            <span className="ml-auto">Searches demo apps, files and commands</span>
          </div>
        </div>
      </div>
    </div>
  );
}
