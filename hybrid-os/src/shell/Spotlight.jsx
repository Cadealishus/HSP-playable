import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { useOS } from '../os/store';
import { buildIndex, search } from '../os/search';
import { AppIcon, Kbd } from '../components/ui';

function ResultIcon({ item, size = 28 }) {
  if (item.app) return <AppIcon app={item.app} size={size} />;
  if (item.kind === 'Project')
    return (
      <span className="grid place-items-center shrink-0 font-semibold" style={{ width: size, height: size, borderRadius: size * 0.25, fontSize: size * 0.38, background: `color-mix(in srgb, ${item.color} 16%, transparent)`, color: `color-mix(in srgb, ${item.color} 55%, var(--t1))` }}>
        {item.title.split(' ').map((w) => w[0]).join('').slice(0, 2)}
      </span>
    );
  const I = item.icon;
  return (
    <span className="grid place-items-center shrink-0" style={{ width: size, height: size, borderRadius: size * 0.25, background: 'var(--field)' }}>
      <I size={size * 0.5} strokeWidth={1.75} className={item.kind === 'Action' ? 'text-acc' : 'text-t2'} />
    </span>
  );
}

export default function Spotlight() {
  const { state, actions } = useOS();
  const open = state.overlay === 'spotlight';
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const listRef = useRef(null);
  const index = useMemo(() => (open ? buildIndex(state, actions) : []), [open, state.mode, state.focus, state.wifi]);

  // Reset on close rather than on open, so keystrokes typed right after Ctrl+Space are never wiped.
  useEffect(() => {
    if (!open) {
      setQ('');
      setSel(0);
    }
  }, [open]);

  const results = useMemo(() => {
    if (q.trim()) return search(index, q);
    const pick = (ids) => ids.map((id) => index.find((x) => x.id === id)).filter(Boolean);
    return pick(['app:explorer', 'app:terminal', 'app:vscode', 'app:rocky', 'proj:hsp', 'act:mode', 'act:cc']);
  }, [q, index]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);
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
    const label = q.trim() ? (i === 0 ? 'Top hit' : it.kind === 'Folder' ? 'Files' : `${it.kind}s`) : 'Suggestions';
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push([it, i]);
    else groups.push({ label, rows: [[it, i]] });
  });

  return (
    <div className="absolute inset-0 z-[8800]" onPointerDown={(e) => e.target === e.currentTarget && actions.set({ overlay: null })} style={{ background: 'rgba(3,4,10,.2)' }}>
      <div className="absolute left-1/2 top-[18%] w-[min(680px,92%)] -translate-x-1/2">
        <div className="glass-strong rounded-[var(--r-xl)] overflow-hidden a-spot" role="dialog" aria-label="Search">
          <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: '1px solid var(--line)' }}>
            <Search size={20} strokeWidth={1.75} className="text-t2 shrink-0" />
            <input
              ref={input}
              autoFocus
              id="spotlight-input"
              role="combobox"
              aria-expanded="true"
              aria-controls="spotlight-results"
              aria-activedescendant={current ? `sr-${sel}` : undefined}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search apps, files, projects and commands"
              className="flex-1 bg-transparent outline-none text-[20px] font-light text-t1 placeholder:text-t3"
              autoComplete="off"
              spellCheck={false}
            />
            <Kbd>Esc</Kbd>
          </div>
          <div className="flex h-[352px]">
            <div ref={listRef} id="spotlight-results" role="listbox" className="flex-1 overflow-y-auto p-2">
              {results.length === 0 && (
                <div className="h-full grid place-items-center text-center px-8">
                  <div>
                    <div className="text-[13px] text-t1">No results for “{q}”</div>
                    <div className="text-[12px] text-t3 mt-1">Try an app name, a file such as orbit.js, or a command like “theme”.</div>
                  </div>
                </div>
              )}
              {groups.map((g) => (
                <div key={g.label + g.rows[0][1]} role="group" aria-label={g.label} className="mb-1">
                  <div className="px-2 pt-2 pb-1 text-[12px] font-medium text-t3">{g.label}</div>
                  {g.rows.map(([it, i]) => (
                    <div
                      key={it.id}
                      id={`sr-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={sel === i}
                      onMouseMove={() => sel !== i && setSel(i)}
                      onClick={() => run(it)}
                      className="flex items-center gap-3 h-11 px-2 rounded-[var(--r-sm)] cursor-default"
                      style={{ background: sel === i ? 'rgb(var(--acc) / .16)' : 'transparent' }}
                    >
                      <ResultIcon item={it} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] truncate">{it.title}</span>
                        <span className="block text-[12px] text-t3 truncate">{it.sub}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {current && (
              <div className="w-[220px] shrink-0 p-5 flex flex-col" style={{ borderLeft: '1px solid var(--line)' }}>
                <div key={current.id} className="a-fade flex flex-col items-center text-center pt-6">
                  <ResultIcon item={current} size={64} />
                  <div className="mt-4 text-[15px] font-medium leading-snug">{current.title}</div>
                  <div className="text-[12px] text-t2 mt-1 leading-[1.45]">{current.sub}</div>
                  <div className="mt-2 text-[11px] text-t3">{current.kind}</div>
                </div>
                <button onClick={() => run(current)} className="mt-auto w-full h-8 rounded-[var(--r-sm)] text-[13px] font-medium press" style={{ background: 'rgb(var(--acc))', color: 'var(--on-acc)' }}>
                  {current.kind === 'Action' ? 'Run' : 'Open'}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 px-4 h-9 text-[12px] text-t3" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="flex items-center gap-1.5">
              <ArrowUp size={12} />
              <ArrowDown size={12} /> Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <CornerDownLeft size={12} /> Open
            </span>
            <span className="ml-auto">Apps, files and commands in this prototype</span>
          </div>
        </div>
      </div>
    </div>
  );
}
