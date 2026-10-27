import { Moon, Search, ChevronUp, Wifi, WifiOff, BatteryMedium, LayoutPanelTop, X, AppWindow } from 'lucide-react';
import { useOS, iconRegistry, iconCenter } from '../os/store';
import { APPS, TASKBAR_APPS } from '../os/apps';
import { useNow } from '../os/sim';
import { AppIcon, HybridLogo } from '../components/ui';
import { WinLogo } from '../shell/Overlays';
import { VolumeIcon } from '../hybrid/MenuBar';

function TBButton({ children, onClick, active, label, onContextMenu, refCb, w = 40 }) {
  return (
    <button
      ref={refCb}
      aria-label={label}
      title={label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="relative h-10 grid place-items-center rounded-[5px] press"
      style={{ width: w, background: active ? 'var(--hover)' : undefined, transition: 'background 120ms' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? 'var(--hover)' : '')}
    >
      {children}
    </button>
  );
}

export default function Taskbar() {
  const { state, actions } = useOS();
  const now = useNow(1000);
  const focusedApp = state.windows.find((w) => w.id === state.focused && !w.min)?.app;
  // Pinned apps first, then any other running apps
  const extra = [...new Set(state.windows.filter((w) => !TASKBAR_APPS.includes(w.app) && w.phase !== 'closing').map((w) => w.app))];
  const apps = [...TASKBAR_APPS, ...extra];

  const appMenu = (e, id) => {
    const wins = state.windows.filter((w) => w.app === id && w.phase !== 'closing');
    actions.contextMenu(e, [
      ...wins.map((w) => ({ label: w.title, icon: AppWindow, onClick: () => actions.focus(w.id) })),
      wins.length ? '-' : null,
      { label: APPS[id].name, onClick: () => actions.open(id) },
      { label: 'Unpin from taskbar', disabled: true },
      wins.length ? { label: wins.length > 1 ? 'Close all windows' : 'Close window', icon: X, onClick: () => actions.closeApp(id) } : null,
    ]);
  };

  return (
    <div className="absolute left-0 right-0 bottom-0 h-[48px] z-[3600] chrome chrome-bottom-full">
      <div className="h-full a-slideup">
        <div className="h-full flex items-center px-2 glass-flat" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex-1 flex items-center">
            <TBButton label="Widgets and Control Center" w={110} onClick={() => actions.toggleOverlay('control')}>
              <span className="flex items-center gap-2 text-[12px]">
                <Moon size={18} className="text-[#ffd36b]" fill="#ffd36b" />
                <span className="text-left leading-tight">
                  <span className="block font-semibold">54°F</span>
                  <span className="block text-t2 text-[11px]">Clear</span>
                </span>
              </span>
            </TBButton>
          </div>
          <div className="flex items-center gap-1">
            <TBButton label="Start" active={state.overlay === 'start'} onClick={() => actions.toggleOverlay('start')}>
              <WinLogo size={20} />
            </TBButton>
            <button onClick={() => actions.set({ overlay: 'start', startSearch: Date.now() })} className="h-[32px] w-[200px] mx-1 flex items-center gap-2 rounded-full px-3 text-[12.5px] text-t2 field press" aria-label="Search">
              <Search size={15} /> Search
            </button>
            <TBButton label="Task view" onClick={() => actions.minimizeAll()}>
              <LayoutPanelTop size={19} strokeWidth={1.6} />
            </TBButton>
            {apps.map((id) => {
              const wins = state.windows.filter((w) => w.app === id && w.phase !== 'closing');
              const running = wins.length > 0;
              const focused = focusedApp === id;
              return (
                <TBButton key={id} label={APPS[id].name} active={focused} refCb={(el) => (iconRegistry[id] = el)} onClick={() => actions.activate(id, iconCenter(id))} onContextMenu={(e) => appMenu(e, id)}>
                  <AppIcon app={id} size={24} />
                  {running && (
                    <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 h-[3px] rounded-full" style={{ width: focused ? 16 : 6, background: focused ? 'rgb(var(--acc))' : 'var(--t3)', transition: 'width 200ms' }} />
                  )}
                </TBButton>
              );
            })}
            <TBButton label="HYBRID OS" onClick={() => actions.switchMode('hybrid')}>
              <HybridLogo size={20} />
            </TBButton>
          </div>
          <div className="flex-1 flex items-center justify-end gap-0.5">
            <TBButton label="Show hidden icons" w={28}>
              <ChevronUp size={15} />
            </TBButton>
            <button onClick={() => actions.toggleOverlay('quick')} aria-label="Quick settings" className="h-10 px-2.5 flex items-center gap-2.5 rounded-[5px] hover:bg-[var(--hover)]" style={{ background: state.overlay === 'quick' ? 'var(--hover)' : undefined }}>
              {state.wifi && !state.airplane ? <Wifi size={15} /> : <WifiOff size={15} />}
              <VolumeIcon v={state.volume} size={15} />
              <BatteryMedium size={16} />
            </button>
            <button onClick={() => actions.toggleOverlay('calendar')} aria-label="Date and time" className="h-10 px-2.5 text-right text-[12px] leading-[1.25] rounded-[5px] hover:bg-[var(--hover)] tabular-nums" style={{ background: state.overlay === 'calendar' ? 'var(--hover)' : undefined }}>
              <div>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
              <div>{now.toLocaleDateString()}</div>
            </button>
            <button aria-label="Show desktop" title="Show desktop" onClick={() => actions.minimizeAll()} className="h-10 w-[8px] ml-1 border-l border-[var(--line)] hover:bg-[var(--hover)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
