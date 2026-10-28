import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Bluetooth,
  BluetoothOff,
  Volume2,
  Volume1,
  VolumeX,
  BatteryMedium,
  BatteryCharging,
  Search,
  SlidersHorizontal,
  Moon,
  Activity,
  Lock,
  Info,
  Settings,
  Monitor,
  RotateCcw,
  Lock as LockIcon,
  Headphones,
  Speaker,
  Check,
} from 'lucide-react';
import { useOS, fullscreenWindow } from '../os/store';
import { APPS, LAUNCHABLE } from '../os/apps';
import { PROJECTS } from '../os/data';
import { THEMES, WALLPAPERS } from '../os/themes';
import { useNow, usePerf, useOutside, fmtTime, fmtDate } from '../os/sim';
import { HybridLogo, MenuList, Toggle, Slider, Segmented, Sparkline, Meter, SectionLabel, DemoBadge, Tip } from '../components/ui';

export function buildMenus(state, actions) {
  const win = state.windows.find((w) => w.id === state.focused);
  const visible = state.windows.filter((w) => w.phase !== 'closing');
  return {
    hybrid: [
      { label: 'About HYBRID OS', icon: Info, onClick: () => actions.open('about') },
      { label: 'HYBRID Settings…', icon: Settings, onClick: () => actions.open('settings') },
      '-',
      { label: 'Switch to Windows Desktop', icon: Monitor, shortcut: 'Ctrl+Alt+M', onClick: () => actions.switchMode('windows') },
      { label: 'Command Palette', shortcut: 'Ctrl+K', onClick: () => actions.set({ overlay: 'spotlight' }) },
      '-',
      { label: 'Lock Screen', icon: LockIcon, onClick: () => actions.set({ overlay: 'lock' }) },
      { label: 'Restart Shell', icon: RotateCcw, onClick: () => window.dispatchEvent(new Event('hybrid:reboot')) },
    ],
    Apps: [
      ...LAUNCHABLE.map((id) => ({ label: APPS[id].name, onClick: () => actions.open(id) })),
      '-',
      { label: 'Open Launcher', onClick: () => actions.set({ overlay: 'launcher' }) },
    ],
    File: [
      { label: 'New Explorer Window', shortcut: 'Ctrl+N', onClick: () => actions.open('explorer') },
      { label: 'New Terminal', onClick: () => actions.open('terminal') },
      { label: 'New Quick Note', onClick: () => { actions.setWidgets({ notes: true }); actions.set({ showWidgets: true }); setTimeout(() => document.getElementById('quick-notes')?.focus(), 50); } },
      {
        label: 'Open Recent',
        items: PROJECTS.map((p) => ({ label: p.name, onClick: () => actions.open('vscode', { title: `${p.name} — Visual Studio Code`, props: { project: p.id } }) })),
      },
      '-',
      { label: 'Close Window', disabled: !win, onClick: () => win && actions.close(win.id) },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: true },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: true },
      '-',
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => document.execCommand && document.execCommand('cut') },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => document.execCommand && document.execCommand('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: true },
    ],
    View: [
      { label: 'Show Widgets', checked: state.showWidgets, onClick: () => actions.set({ showWidgets: !state.showWidgets }) },
      { label: 'Auto-hide Dock', checked: state.dock.autoHide, onClick: () => actions.setDock({ autoHide: !state.dock.autoHide }) },
      { label: 'Theme', items: Object.keys(THEMES).map((t) => ({ label: THEMES[t].name, checked: state.theme === t, onClick: () => actions.setTheme(t) })) },
      { label: 'Wallpaper', items: WALLPAPERS.map((w) => ({ label: w.name, checked: state.wallpaper === w.id, onClick: () => actions.set({ wallpaper: w.id }) })) },
      '-',
      { label: 'Show Desktop', onClick: () => actions.minimizeAll() },
      {
        label: 'Enter Full Screen',
        onClick: () => {
          try {
            document.documentElement.requestFullscreen().catch(() => {});
          } catch {}
        },
      },
    ],
    Window: [
      { label: 'Minimize', disabled: !win, onClick: () => win && actions.minimize(win.id) },
      { label: win && win.max ? 'Restore' : 'Zoom', disabled: !win, onClick: () => win && actions.toggleMax(win.id) },
      { label: 'Tile Left', disabled: !win, onClick: () => win && actions.snap(win.id, 'left') },
      { label: 'Tile Right', disabled: !win, onClick: () => win && actions.snap(win.id, 'right') },
      '-',
      { label: 'Bring All to Front', disabled: !visible.length, onClick: () => visible.sort((a, b) => a.z - b.z).forEach((w) => actions.focus(w.id)) },
      ...(visible.length ? [{ header: 'Open windows' }] : []),
      ...visible.map((w) => ({ label: w.title, checked: w.id === state.focused, onClick: () => actions.focus(w.id) })),
    ],
    Tools: [
      { label: 'Spotlight Search', shortcut: 'Ctrl+Space', onClick: () => actions.set({ overlay: 'spotlight' }) },
      { label: 'Control Center', onClick: () => actions.set({ overlay: 'control' }) },
      { label: 'Rocky AI', onClick: () => actions.set({ rocky: true }) },
      { label: 'Terminal', onClick: () => actions.open('terminal') },
      '-',
      { label: 'Focus Mode', checked: state.focus, onClick: () => actions.set({ focus: !state.focus }) },
      { label: 'Switch Desktop Mode', shortcut: 'Ctrl+Alt+M', onClick: () => actions.switchMode() },
    ],
  };
}

const MENU_ORDER = ['Apps', 'File', 'Edit', 'View', 'Window', 'Tools'];

function StatusButton({ active, onClick, label, children, wide }) {
  return (
    <button
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      data-open={active}
      className={`tip-host h-6 ${wide ? 'px-2' : 'w-7'} flex items-center justify-center rounded-[var(--r-sm)] text-t1 hov`}
      style={active ? { background: 'var(--press)' } : undefined}
    >
      {children}
      <Tip>{label}</Tip>
    </button>
  );
}

function Popover({ children, width = 280, right = 0 }) {
  return (
    <div className="absolute top-[30px] z-50 glass-strong rounded-[var(--r-lg)] p-4 a-pop" style={{ width, right }} role="dialog">
      {children}
    </div>
  );
}

const NETWORKS = [
  { name: 'Nebula-5G', bars: 3, secure: true },
  { name: 'Orbital Station', bars: 2, secure: true },
  { name: 'Lake House Guest', bars: 1, secure: false },
];
const DEVICES = [
  { name: 'Aurora Buds Pro', kind: 'Headphones', icon: Headphones, connected: true },
  { name: 'MX Keys', kind: 'Keyboard', connected: true },
  { name: 'Studio Speaker', kind: 'Speaker', icon: Speaker, connected: false },
];

function PanelHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between h-6 mb-3">
      <span className="text-[13px] font-medium">{title}</span>
      {children}
    </div>
  );
}

const PROFILE_OPTIONS = [
  { id: 'saver', label: 'Saver' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'performance', label: 'Turbo' },
];

function StatusPanels({ which, state, actions, perf }) {
  const network = state.network || 'Nebula-5G';
  if (which === 'wifi')
    return (
      <Popover width={280}>
        <PanelHeader title="Wi-Fi">
          <Toggle on={state.wifi} onChange={(v) => actions.set({ wifi: v })} label="Wi-Fi" />
        </PanelHeader>
        {state.wifi ? (
          <div className="flex flex-col -mx-2">
            {NETWORKS.map((n) => (
              <button key={n.name} onClick={() => actions.set({ network: n.name })} className="flex items-center gap-3 h-9 px-2 rounded-[var(--r-sm)] hov text-[13px]" aria-pressed={network === n.name}>
                <Wifi size={16} strokeWidth={1.75} className={network === n.name ? 'text-acc' : 'text-t2'} />
                <span className="flex-1 text-left">{n.name}</span>
                {n.secure && <Lock size={12} className="text-t3" />}
                <span className="w-4">{network === n.name && <Check size={15} className="text-acc" />}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-t2">Wi-Fi is off.</p>
        )}
        <p className="mt-2 text-[11px] text-t3">Networks are simulated.</p>
      </Popover>
    );
  if (which === 'bt')
    return (
      <Popover width={280}>
        <PanelHeader title="Bluetooth">
          <Toggle on={state.bluetooth} onChange={(v) => actions.set({ bluetooth: v })} label="Bluetooth" />
        </PanelHeader>
        {state.bluetooth ? (
          <div className="flex flex-col">
            {DEVICES.map((d) => (
              <div key={d.name} className="flex items-center gap-3 h-11 text-[13px]">
                <Bluetooth size={16} strokeWidth={1.75} className={d.connected ? 'text-acc' : 'text-t3'} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{d.name}</span>
                  <span className="block text-[11px] text-t3">{d.kind}</span>
                </span>
                <span className="text-[11px] text-t3">{d.connected ? 'Connected' : 'Not connected'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-t2">Bluetooth is off.</p>
        )}
      </Popover>
    );
  if (which === 'vol')
    return (
      <Popover width={280}>
        <PanelHeader title="Sound" />
        <div className="flex items-center gap-3">
          <span className="text-t2">
            <VolumeIcon v={state.volume} size={16} />
          </span>
          <Slider id="mb-volume" label="Volume" value={state.volume} onChange={(v) => actions.set({ volume: v })} />
          <span className="w-8 text-right text-[12px] tnum text-t2">{state.volume}</span>
        </div>
        <div className="mt-3 pt-3 flex justify-between text-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="text-t2">Output</span>
          <span>{state.bluetooth ? 'Aurora Buds Pro' : 'Display speakers'}</span>
        </div>
      </Popover>
    );
  if (which === 'battery')
    return (
      <Popover width={280}>
        <PanelHeader title="Battery">
          <DemoBadge />
        </PanelHeader>
        <div className="flex items-baseline justify-between">
          <span className="text-[28px] font-light leading-none tnum">87%</span>
          <span className="text-[12px] text-t2">About 6 h 40 min left</span>
        </div>
        <div className="mt-4">
          <SectionLabel>Power mode</SectionLabel>
          <Segmented size="sm" label="Power mode" value={state.perfProfile} onChange={(v) => actions.set({ perfProfile: v })} options={PROFILE_OPTIONS} />
        </div>
      </Popover>
    );
  if (which === 'perf')
    return (
      <Popover width={300}>
        <PanelHeader title="Performance">
          <DemoBadge>Simulated</DemoBadge>
        </PanelHeader>
        <div className="grid grid-cols-[56px_116px_1fr] items-center gap-x-3 gap-y-3">
          {[
            ['CPU', perf.hist.cpu, `${Math.round(perf.cpu)}%`],
            ['GPU', perf.hist.gpu, `${Math.round(perf.gpu)}%`],
          ].map(([k, h, txt]) => [
            <span key={k} className="text-[12px] text-t2">{k}</span>,
            <Sparkline key={k + 's'} data={h} w={116} h={24} />,
            <span key={k + 'v'} className="text-[13px] text-right tnum">{txt}</span>,
          ])}
          <span className="text-[12px] text-t2">Memory</span>
          <Meter value={perf.ram} max={32} />
          <span className="text-[13px] text-right tnum">{perf.ram.toFixed(1)} GB</span>
        </div>
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <SectionLabel>Power mode</SectionLabel>
          <Segmented size="sm" label="Power mode" value={state.perfProfile} onChange={(v) => actions.set({ perfProfile: v })} options={PROFILE_OPTIONS} />
        </div>
      </Popover>
    );
  if (which === 'clock') return <CalendarPopover />;
  return null;
}

function CalendarPopover() {
  const now = useNow(30000);
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array((first + 6) % 7).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <Popover width={280}>
      <div className="text-[15px] font-medium">{now.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
      <div className="text-[12px] text-t2 mb-3">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[12px]" role="grid" aria-label="Calendar">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[11px] text-t3 h-6 leading-6">{d}</span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className="mx-auto w-7 h-7 grid place-items-center rounded-full tnum" aria-current={d === now.getDate() ? 'date' : undefined} style={d === now.getDate() ? { background: 'rgb(var(--acc))', color: 'var(--on-acc)', fontWeight: 600 } : { color: 'var(--t1)' }}>
            {d || ''}
          </span>
        ))}
      </div>
      <div className="mt-3 pt-3 text-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1 h-8 rounded-full" style={{ background: 'rgb(var(--acc2))' }} />
          <div>
            <div>HYBRID Shell standup</div>
            <div className="text-t3">Tomorrow, 10:30 · sample event</div>
          </div>
        </div>
      </div>
    </Popover>
  );
}

export function VolumeIcon({ v, size = 15 }) {
  if (v === 0) return <VolumeX size={size} strokeWidth={1.75} />;
  if (v < 50) return <Volume1 size={size} strokeWidth={1.75} />;
  return <Volume2 size={size} strokeWidth={1.75} />;
}

export default function MenuBar() {
  const { state, actions } = useOS();
  const perf = usePerf();
  const now = useNow(1000);
  const [open, setOpen] = useState(null);
  const root = useRef(null);
  const close = useCallback(() => setOpen(null), []);
  useOutside(root, close, !!open);
  const menus = buildMenus(state, actions);
  const focusedWin = state.windows.find((w) => w.id === state.focused && !w.min);
  const appName = focusedWin ? APPS[focusedWin.app].short : 'Desktop';

  // While a window is full screen the bar tucks away and peeks back when the pointer rests at the top edge
  const fs = !!fullscreenWindow(state);
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef(0);
  const hiddenBar = fs && !peek && !open;
  useEffect(() => setPeek(false), [fs]);
  const leaveBar = () => {
    clearTimeout(peekTimer.current);
    if (fs) peekTimer.current = setTimeout(() => setPeek(false), 450);
  };

  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  const hoverSwitch = (k) => open && MENU_ORDER.concat('hybrid').includes(open) && setOpen(k);
  const menuButton = (k, label, children, className = '') => (
    <div key={k} className="relative">
      <button
        onClick={() => toggle(k)}
        onMouseEnter={() => hoverSwitch(k)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(k);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open === k}
        aria-label={label}
        className={`h-6 px-2.5 rounded-[var(--r-sm)] text-t1 hov ${className}`}
        style={open === k ? { background: 'var(--press)' } : undefined}
      >
        {children}
      </button>
      {open === k && (
        <div className="absolute top-[30px] left-0 z-50">
          <MenuList items={menus[k]} onClose={close} autoFocus={document.activeElement === root.current?.querySelector(`[aria-label="${label}"]`)} />
        </div>
      )}
    </div>
  );

  return (
    <>
      {fs && (
        <div
          className="absolute top-0 left-0 right-0 h-[5px] z-[3990]"
          onMouseEnter={() => {
            clearTimeout(peekTimer.current);
            peekTimer.current = setTimeout(() => setPeek(true), 220);
          }}
          onMouseLeave={leaveBar}
        />
      )}
      <div ref={root} className="absolute top-0 left-0 right-0 h-8 z-[4000] chrome chrome-top" style={hiddenBar ? { pointerEvents: 'none' } : undefined} onMouseEnter={() => clearTimeout(peekTimer.current)} onMouseLeave={leaveBar}>
        <div className="h-full dock-shell" style={{ transform: hiddenBar ? 'translateY(-40px)' : 'none', opacity: hiddenBar ? 0 : 1, pointerEvents: hiddenBar ? 'none' : undefined }}>
          <div className="h-full a-slidedown">
            <nav
              aria-label="Menu bar"
              className="h-full flex items-center gap-0.5 px-2 text-[13px]"
              style={{ background: 'rgb(var(--surface) / calc(var(--ga) * .8))', backdropFilter: 'blur(24px) saturate(120%)', WebkitBackdropFilter: 'blur(24px) saturate(120%)', borderBottom: '1px solid var(--line)' }}
            >
              {menuButton(
                'hybrid',
                'HYBRID menu',
                <span className="flex items-center gap-2">
                  <HybridLogo size={16} />
                  <span className="font-semibold tracking-[0.08em] text-[12px]">HYBRID</span>
                </span>,
                'pl-1.5'
              )}
              <span className="px-2.5 font-semibold">{appName}</span>
              {MENU_ORDER.map((k) => menuButton(k, k, k))}

              <div className="flex-1" />

              <div className="relative flex items-center gap-0.5">
                {state.focus && (
                  <span className="flex items-center gap-1.5 h-6 px-2 text-[12px] font-medium text-acc">
                    <Moon size={14} strokeWidth={1.75} /> Focus
                  </span>
                )}
                <StatusButton wide active={open === 'perf'} onClick={() => toggle('perf')} label="Performance (simulated)">
                  <span className="flex items-center gap-1.5 text-[12px] text-t2">
                    <Activity size={15} strokeWidth={1.75} className="text-t1" />
                    <span className="tnum">CPU {String(Math.round(perf.cpu)).padStart(2, ' ')}%</span>
                  </span>
                </StatusButton>
                <StatusButton active={open === 'wifi'} onClick={() => toggle('wifi')} label="Wi-Fi">
                  {state.wifi && !state.airplane ? <Wifi size={16} strokeWidth={1.75} /> : <WifiOff size={16} strokeWidth={1.75} className="text-t3" />}
                </StatusButton>
                <StatusButton active={open === 'bt'} onClick={() => toggle('bt')} label="Bluetooth">
                  {state.bluetooth ? <Bluetooth size={16} strokeWidth={1.75} /> : <BluetoothOff size={16} strokeWidth={1.75} className="text-t3" />}
                </StatusButton>
                <StatusButton active={open === 'vol'} onClick={() => toggle('vol')} label="Sound">
                  <VolumeIcon v={state.volume} size={16} />
                </StatusButton>
                <StatusButton wide active={open === 'battery'} onClick={() => toggle('battery')} label="Battery">
                  <span className="flex items-center gap-1.5 text-[12px] tnum">
                    {state.perfProfile === 'performance' ? <BatteryCharging size={18} strokeWidth={1.5} /> : <BatteryMedium size={18} strokeWidth={1.5} />}87%
                  </span>
                </StatusButton>
                <StatusButton onClick={() => actions.toggleOverlay('spotlight')} label="Search  Ctrl+Space">
                  <Search size={15} strokeWidth={1.75} />
                </StatusButton>
                <StatusButton active={state.overlay === 'control'} onClick={() => actions.toggleOverlay('control')} label="Control Center">
                  <SlidersHorizontal size={15} strokeWidth={1.75} />
                </StatusButton>
                <StatusButton wide active={open === 'clock'} onClick={() => toggle('clock')} label="Calendar">
                  <span className="flex items-center gap-2 text-[13px] tnum whitespace-nowrap">
                    <span className="text-t2">{fmtDate(now)}</span>
                    <span className="font-medium">{fmtTime(now)}</span>
                  </span>
                </StatusButton>
                {open && !MENU_ORDER.includes(open) && open !== 'hybrid' && <StatusPanels which={open} state={state} actions={actions} perf={perf} />}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </>
  );
}
