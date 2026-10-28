import { useState, useEffect, useRef } from 'react';
import { Search, GitBranch } from 'lucide-react';
import { useOS } from '../os/store';
import { APPS, LAUNCHABLE } from '../os/apps';
import { PROJECTS } from '../os/data';
import { AppIcon } from '../components/ui';

export default function Launcher() {
  const { state, actions } = useOS();
  const open = state.overlay === 'launcher';
  const [q, setQ] = useState('');
  const input = useRef(null);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  if (!open) return null;
  const apps = [...LAUNCHABLE, 'about'].filter((id) => {
    const a = APPS[id];
    return !q || `${a.name} ${a.keywords}`.toLowerCase().includes(q.toLowerCase());
  });
  const close = () => actions.set({ overlay: null });
  return (
    <div
      className="absolute inset-0 z-[8700] flex flex-col items-center a-fade"
      style={{ background: 'rgb(var(--surface) / .55)', backdropFilter: 'blur(40px) saturate(110%)', WebkitBackdropFilter: 'blur(40px) saturate(110%)' }}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="mt-[10vh] w-[320px] flex items-center gap-2.5 rounded-[var(--r-md)] px-3 h-9 field a-spot">
        <Search size={15} strokeWidth={1.75} className="text-t2" />
        <input
          ref={input}
          autoFocus
          id="launcher-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && apps[0]) actions.open(apps[0]);
            if (e.key === 'Escape') close();
          }}
          placeholder="Search apps"
          className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-t3"
          autoComplete="off"
        />
      </div>
      <div className="mt-12 grid grid-cols-5 gap-x-10 gap-y-8" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        {apps.map((id, i) => (
          <button
            key={id}
            onClick={() => actions.open(id)}
            className="group flex flex-col items-center gap-2 w-[96px] rounded-[var(--r-lg)] py-2 a-widget"
            style={{ animationDelay: `calc(var(--anim) * ${i * 20}ms)` }}
          >
            <div className="group-active:scale-95" style={{ transition: 'transform var(--d-fast) var(--ease-out)' }}>
              <AppIcon app={id} size={64} />
            </div>
            <span className="text-[12px] text-center leading-tight text-t1 group-hover:text-t1">{APPS[id].name}</span>
          </button>
        ))}
        {!apps.length && <div className="col-span-5 text-t2 text-[13px]">No apps match “{q}”.</div>}
      </div>
      {!q && (
        <div className="mt-auto mb-[14vh] w-[min(760px,90%)] a-widget" style={{ animationDelay: 'calc(var(--anim) * 260ms)' }}>
          <div className="text-[12px] font-medium text-t2 mb-2 px-1">Recent projects</div>
          <div className="grid grid-cols-4 gap-3">
            {PROJECTS.map((p) => (
              <button key={p.id} onClick={() => actions.open('vscode', { title: `${p.name} — Visual Studio Code`, props: { project: p.id } })} className="glass rounded-[var(--r-lg)] p-3 text-left hov">
                <div className="h-1 w-6 rounded-full mb-2.5" style={{ background: p.color }} />
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[11px] text-t3 mt-0.5 flex items-center gap-1">
                  <GitBranch size={10} /> {p.branch} · {p.when}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
