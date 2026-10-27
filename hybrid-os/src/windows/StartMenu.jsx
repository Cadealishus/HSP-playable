import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Power, ChevronRight, ChevronLeft, Moon, RotateCcw, Lock, Wifi, Bluetooth, Plane, MoonStar, SunMedium, Settings, BatteryMedium, Pencil } from 'lucide-react';
import { useOS } from '../os/store';
import { APPS, LAUNCHABLE } from '../os/apps';
import { RECENT_FILES, allFiles } from '../os/data';
import { buildIndex, search, fileIcon, openFile } from '../os/search';
import { useNow } from '../os/sim';
import { AppIcon, HybridLogo, Slider, MenuList } from '../components/ui';
import { VolumeIcon } from '../hybrid/MenuBar';

const PINNED = ['explorer', 'edge', 'vscode', 'discord', 'spotify', 'blender', 'terminal', 'settings', 'rocky', 'about'];

function Flyout({ children, className = '', style }) {
  return (
    <div className={`absolute bottom-[58px] glass-flat rounded-[10px] a-popup ${className}`} style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow)', ...style }}>
      {children}
    </div>
  );
}

export function StartMenu() {
  const { state, actions } = useOS();
  const open = state.overlay === 'start';
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [power, setPower] = useState(false);
  const input = useRef(null);
  const index = useMemo(() => (open ? buildIndex(state, actions) : []), [open]);
  useEffect(() => {
    if (open) {
      setQ('');
      setAll(false);
      setPower(false);
      setTimeout(() => input.current && input.current.focus(), 30);
    }
  }, [open, state.startSearch]);
  if (!open) return null;
  const results = q.trim() ? search(index, q, 8) : [];
  const files = allFiles();
  const close = () => actions.set({ overlay: null });

  return (
    <div className="absolute inset-0 z-[8600]" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <Flyout className="left-1/2 -translate-x-1/2 w-[620px] h-[640px] max-h-[calc(100%-70px)] flex flex-col overflow-hidden" style={{ animationName: 'popUp' }}>
        <div className="px-8 pt-7">
          <div className="flex items-center gap-2.5 h-[36px] rounded-full px-4 field" style={{ borderBottom: '2px solid rgb(var(--acc))' }}>
            <Search size={15} className="text-t2" />
            <input
              ref={input}
              id="start-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && results[0] && (close(), setTimeout(results[0].run, 20))}
              placeholder="Search for apps, settings, and documents"
              className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-t3"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 pt-5">
          {q.trim() ? (
            <div>
              <div className="text-[13px] font-semibold mb-2">Best matches</div>
              {results.length === 0 && <div className="text-[13px] text-t2">No results for “{q}”.</div>}
              {results.map((r) => {
                const I = r.icon;
                return (
                  <button key={r.id} onClick={() => (close(), setTimeout(r.run, 20))} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-[6px] text-left hover:bg-[var(--hover)]">
                    {r.app ? <AppIcon app={r.app} size={28} /> : I ? <I size={20} className="text-acc mx-1" /> : <span className="w-7" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] truncate">{r.title}</span>
                      <span className="block text-[11.5px] text-t3 truncate">{r.kind} · {r.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : all ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold">All apps</span>
                <button onClick={() => setAll(false)} className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-[5px] field hover:bg-[var(--hover)]">
                  <ChevronLeft size={13} /> Back
                </button>
              </div>
              {[...LAUNCHABLE, 'about']
                .sort((a, b) => APPS[a].name.localeCompare(APPS[b].name))
                .map((id) => (
                  <button key={id} onClick={() => actions.open(id)} className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded-[6px] text-left hover:bg-[var(--hover)]">
                    <AppIcon app={id} size={26} />
                    <span className="text-[13px]">{APPS[id].name}</span>
                  </button>
                ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-semibold">Pinned</span>
                <button onClick={() => setAll(true)} className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-[5px] field hover:bg-[var(--hover)]">
                  All apps <ChevronRight size={13} />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-y-2">
                {PINNED.map((id) => (
                  <button key={id} onClick={() => (id === 'rocky' ? actions.set({ rocky: true, overlay: null }) : actions.open(id))} className="flex flex-col items-center gap-1.5 py-2.5 rounded-[6px] hover:bg-[var(--hover)]">
                    <AppIcon app={id} size={34} />
                    <span className="text-[11.5px] text-center leading-tight px-1">{APPS[id].short}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-6 mb-2">
                <span className="text-[13px] font-semibold">Recommended</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {RECENT_FILES.map((r) => {
                  const f = files.find((x) => x.name === r.name) || { name: r.name, path: r.path };
                  const I = fileIcon(r.name);
                  return (
                    <button key={r.name} onClick={() => (close(), openFile(actions, f))} className="flex items-center gap-3 px-2.5 py-2 rounded-[6px] text-left hover:bg-[var(--hover)]">
                      <I size={22} className="text-acc shrink-0" strokeWidth={1.5} />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] truncate">{r.name}</span>
                        <span className="block text-[11px] text-t3">{r.when}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="relative h-[62px] shrink-0 flex items-center px-12 justify-between" style={{ background: 'rgb(var(--glass) / .5)', borderTop: '1px solid var(--line)' }}>
          <button onClick={() => actions.open('settings')} className="flex items-center gap-3 px-2 py-1.5 rounded-[6px] hover:bg-[var(--hover)]">
            <span className="w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #5ef0ff, #9b6bff)' }}>
              C
            </span>
            <span className="text-[12.5px]">Cade</span>
          </button>
          <button aria-label="Power" onClick={() => setPower((p) => !p)} className="w-9 h-9 grid place-items-center rounded-[6px] hover:bg-[var(--hover)]">
            <Power size={16} />
          </button>
          {power && (
            <div className="absolute right-8 bottom-[56px]">
              <MenuList
                onClose={() => setPower(false)}
                items={[
                  { label: 'Switch to HYBRID OS', icon: HybridMini, onClick: () => actions.switchMode('hybrid') },
                  '-',
                  { label: 'Lock', icon: Lock, onClick: () => actions.set({ overlay: 'lock' }) },
                  { label: 'Sleep', icon: Moon, onClick: () => actions.set({ overlay: 'lock' }) },
                  { label: 'Restart', icon: RotateCcw, onClick: () => window.dispatchEvent(new Event('hybrid:reboot')) },
                  { label: 'Shut down', icon: Power, onClick: () => actions.notify({ title: 'Shut down is simulated', body: 'This concept never touches your real PC.', force: true }) },
                ]}
              />
            </div>
          )}
        </div>
      </Flyout>
    </div>
  );
}

function HybridMini() {
  return <HybridLogo size={14} />;
}

export function QuickSettings() {
  const { state, actions } = useOS();
  if (state.overlay !== 'quick') return null;
  const tiles = [
    ['Wi-Fi', Wifi, state.wifi, () => actions.set({ wifi: !state.wifi })],
    ['Bluetooth', Bluetooth, state.bluetooth, () => actions.set({ bluetooth: !state.bluetooth })],
    ['Airplane mode', Plane, state.airplane, () => actions.set({ airplane: !state.airplane, wifi: state.airplane, bluetooth: state.airplane })],
    ['Focus', MoonStar, state.focus, () => actions.set({ focus: !state.focus })],
    ['Night light', SunMedium, state.nightLight, () => actions.set({ nightLight: !state.nightLight })],
  ];
  return (
    <div className="absolute inset-0 z-[8600]" onPointerDown={(e) => e.target === e.currentTarget && actions.set({ overlay: null })}>
      <Flyout className="right-3 w-[360px] overflow-hidden">
        <div className="p-5 grid grid-cols-3 gap-3">
          {tiles.map(([label, I, on, fn]) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <button aria-pressed={on} aria-label={label} onClick={fn} className="w-full h-[46px] grid place-items-center rounded-[6px] press" style={{ background: on ? 'rgb(var(--acc))' : 'var(--field)', color: on ? 'var(--on-acc)' : 'var(--t1)', border: on ? 'none' : '1px solid var(--line)' }}>
                <I size={17} />
              </button>
              <span className="text-[11.5px] text-center">{label}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={() => actions.switchMode('hybrid')} aria-label="HYBRID Mode" className="w-full h-[46px] grid place-items-center rounded-[6px] press" style={{ background: 'linear-gradient(120deg, rgba(94,240,255,.25), rgba(155,107,255,.3))', border: '1px solid rgba(140,200,255,.4)' }}>
              <HybridLogo size={18} />
            </button>
            <span className="text-[11.5px]">HYBRID Mode</span>
          </div>
        </div>
        <div className="px-5 pb-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <SunMedium size={16} className="shrink-0" />
            <Slider id="qs-bright" label="Brightness" value={state.brightness} min={20} max={100} onChange={(v) => actions.set({ brightness: v })} />
          </div>
          <div className="flex items-center gap-3">
            <span className="shrink-0">
              <VolumeIcon v={state.volume} size={16} />
            </span>
            <Slider id="qs-volume" label="Volume" value={state.volume} onChange={(v) => actions.set({ volume: v })} />
          </div>
        </div>
        <div className="h-[48px] flex items-center justify-between px-5 text-[12px]" style={{ background: 'rgb(var(--glass) / .5)', borderTop: '1px solid var(--line)' }}>
          <span className="flex items-center gap-2">
            <BatteryMedium size={16} /> 87%
          </span>
          <span className="flex gap-1">
            <button aria-label="Edit quick settings" className="w-8 h-8 grid place-items-center rounded-[5px] hover:bg-[var(--hover)]" onClick={() => actions.open('settings')}>
              <Pencil size={14} />
            </button>
            <button aria-label="All settings" className="w-8 h-8 grid place-items-center rounded-[5px] hover:bg-[var(--hover)]" onClick={() => actions.open('settings')}>
              <Settings size={15} />
            </button>
          </span>
        </div>
      </Flyout>
    </div>
  );
}

export function WinCalendar() {
  const { state, actions } = useOS();
  const now = useNow(30000);
  if (state.overlay !== 'calendar') return null;
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="absolute inset-0 z-[8600]" onPointerDown={(e) => e.target === e.currentTarget && actions.set({ overlay: null })}>
      <Flyout className="right-3 w-[330px] p-5">
        <div className="text-[13px] font-semibold mb-1">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="text-[12px] text-t2 mb-4">{now.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
        <div className="grid grid-cols-7 gap-1 text-center text-[12px]">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <span key={d} className="text-t2 py-1">{d}</span>
          ))}
          {cells.map((d, i) => (
            <span key={i} className="w-9 h-9 mx-auto grid place-items-center rounded-full tabular-nums" style={d === now.getDate() ? { background: 'rgb(var(--acc))', color: 'var(--on-acc)', fontWeight: 600 } : undefined}>
              {d || ''}
            </span>
          ))}
        </div>
      </Flyout>
    </div>
  );
}
