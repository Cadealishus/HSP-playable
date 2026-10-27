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
    if (open) {
      setQ('');
      setTimeout(() => input.current && input.current.focus(), 20);
    }
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
      style={{ background: 'rgb(var(--glass) / .45)', backdropFilter: 'blur(40px) saturate(160%)', WebkitBackdropFilter: 'blur(40px) saturate(160%)' }}
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="mt-[9vh] w-[360px] flex items-center gap-2.5 rounded-[14px] px-4 h-[42px] glass a-spot">
        <Search size={16} className="text-t2" />
        <input
          ref={input}
          id="launcher-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && apps[0]) actions.open(apps[0]);
            if (e.key === 'Escape') close();
          }}
          placeholder="Search apps"
          className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-t3"
          autoComplete="off"
        />
      </div>
      <div className="mt-10 grid grid-cols-5 gap-x-12 gap-y-8" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        {apps.map((id, i) => (
          <button
            key={id}
            onClick={() => actions.open(id)}
            className="group flex flex-col items-center gap-2.5 w-[96px] a-widget"
            style={{ animationDelay: `calc(var(--anim) * ${i * 28}ms)` }}
          >
            <div className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-105 group-active:scale-95" style={{ filter: 'drop-shadow(0 12px 22px rgba(0,0,0,.35))' }}>
              <AppIcon app={id} size={72} />
            </div>
            <span className="text-[12.5px] font-semibold text-center leading-tight">{APPS[id].name}</span>
          </button>
        ))}
        {!apps.length && <div className="col-span-5 text-t2 text-[13px]">No apps match “{q}”.</div>}
      </div>
      {!q && (
        <div className="mt-auto mb-[14vh] w-[min(760px,90%)] a-widget" style={{ animationDelay: 'calc(var(--anim) * 260ms)' }}>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-t3 mb-2.5 px-1">Jump back in</div>
          <div className="grid grid-cols-4 gap-3">
            {PROJECTS.map((p) => (
              <button key={p.id} onClick={() => actions.open('vscode', { title: `${p.name} — Visual Studio Code`, props: { project: p.id } })} className="glass rounded-[16px] p-3 text-left hov press">
                <div className="h-1 w-10 rounded-full mb-2.5" style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }} />
                <div className="text-[13px] font-bold">{p.name}</div>
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
