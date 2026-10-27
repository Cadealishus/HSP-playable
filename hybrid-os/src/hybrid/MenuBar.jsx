import { useRef, useState, useCallback } from 'react';
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
  Gauge,
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
import { useOS } from '../os/store';
import { APPS, LAUNCHABLE } from '../os/apps';
import { PROJECTS } from '../os/data';
import { THEMES, WALLPAPERS } from '../os/themes';
import { useNow, usePerf, useOutside, fmtTime, fmtDate } from '../os/sim';
import { HybridLogo, MenuList, Toggle, Slider, Segmented, Sparkline, Meter, SectionLabel, DemoBadge, AppIcon } from '../components/ui';

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
      '-',
      { label: 'Clipboard History', onClick: () => actions.notify({ title: 'Clipboard history', body: 'Native clipboard access belongs to the production shell. This concept only simulates it.', app: 'settings' }) },
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
      onClick={onClick}
      className={`h-[26px] ${wide ? 'px-2.5' : 'w-[30px]'} grid place-items-center rounded-[8px] text-t1 hov press`}
      style={active ? { background: 'var(--hover)' } : undefined}
    >
      {children}
    </button>
  );
}

function Popover({ children, width = 280, right = 0 }) {
  return (
    <div className="absolute top-[40px] z-50 glass-strong rounded-[14px] p-3 a-pop" style={{ width, right }}>
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

function StatusPanels({ which, state, actions, perf }) {
  if (which === 'wifi')
    return (
      <Popover width={272} right={0}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-[13px]">Wi-Fi</span>
          <Toggle on={state.wifi} onChange={(v) => actions.set({ wifi: v })} label="Wi-Fi" />
        </div>
        {state.wifi ? (
          <div className="flex flex-col gap-0.5">
            {NETWORKS.map((n) => (
              <button key={n.name} onClick={() => actions.set({ network: n.name })} className="flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 hov text-[12.5px]">
                <span className="grid place-items-center w-7 h-7 rounded-full" style={{ background: (state.network || 'Nebula-5G') === n.name ? 'rgb(var(--acc))' : 'var(--field)', color: (state.network || 'Nebula-5G') === n.name ? 'var(--on-acc)' : 'var(--t2)' }}>
                  <Wifi size={14} />
                </span>
                <span className="flex-1 text-left">{n.name}</span>
                {(state.network || 'Nebula-5G') === n.name && <Check size={14} className="text-acc" />}
                {n.secure && <Lock size={11} className="text-t3" />}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-t2">Wi-Fi is off. Simulated networks appear when you turn it on.</p>
        )}
      </Popover>
    );
  if (which === 'bt')
    return (
      <Popover width={272}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-[13px]">Bluetooth</span>
          <Toggle on={state.bluetooth} onChange={(v) => actions.set({ bluetooth: v })} label="Bluetooth" />
        </div>
        {state.bluetooth ? (
          DEVICES.map((d) => (
            <div key={d.name} className="flex items-center gap-2.5 px-2 py-1.5 text-[12.5px]">
              <span className="grid place-items-center w-7 h-7 rounded-full" style={{ background: d.connected ? 'rgb(var(--acc) / .2)' : 'var(--field)' }}>
                <Bluetooth size={13} />
              </span>
              <span className="flex-1">
                {d.name}
                <span className="block text-[11px] text-t3">{d.kind}</span>
              </span>
              <span className="text-[11px] text-t3">{d.connected ? 'Connected' : 'Not connected'}</span>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-t2">Bluetooth is off.</p>
        )}
      </Popover>
    );
  if (which === 'vol')
    return (
      <Popover width={260}>
        <SectionLabel>Sound</SectionLabel>
        <div className="flex items-center gap-2.5">
          <VolumeIcon v={state.volume} />
          <Slider id="mb-volume" label="Volume" value={state.volume} onChange={(v) => actions.set({ volume: v })} />
          <span className="w-8 text-right text-[12px] tabular-nums text-t2">{state.volume}</span>
        </div>
        <div className="mt-3 text-[11.5px] text-t3">Output: {state.bluetooth ? 'Aurora Buds Pro' : 'Studio Display Speakers'}</div>
      </Popover>
    );
  if (which === 'battery')
    return (
      <Popover width={264}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[13px]">Battery</span>
          <DemoBadge />
        </div>
        <div className="font-display text-[28px] font-light">87%</div>
        <div className="text-[12px] text-t2 mb-3">About 6 h 40 m remaining</div>
        <SectionLabel>Power mode</SectionLabel>
        <Segmented
          size="sm"
          value={state.perfProfile}
          onChange={(v) => actions.set({ perfProfile: v })}
          options={[
            { id: 'saver', label: 'Saver' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'performance', label: 'Turbo' },
          ]}
        />
      </Popover>
    );
  if (which === 'perf')
    return (
      <Popover width={300}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-[13px]">Performance</span>
          <DemoBadge />
        </div>
        {[
          ['CPU', perf.cpu, `${Math.round(perf.cpu)}%`, perf.hist.cpu],
          ['GPU', perf.gpu, `${Math.round(perf.gpu)}%`, perf.hist.gpu],
        ].map(([k, v, txt, h]) => (
          <div key={k} className="flex items-center gap-3 mb-2.5">
            <span className="w-9 text-[11px] font-bold text-t3">{k}</span>
            <Sparkline data={h} w={150} h={26} />
            <span className="flex-1 text-right text-[12.5px] font-semibold tabular-nums">{txt}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 mb-1">
          <span className="w-9 text-[11px] font-bold text-t3">RAM</span>
          <div className="flex-1">
            <Meter value={perf.ram} max={32} />
          </div>
          <span className="text-[12.5px] font-semibold tabular-nums">{perf.ram.toFixed(1)} / 32 GB</span>
        </div>
        <div className="h-px my-3" style={{ background: 'var(--line)' }} />
        <SectionLabel>Profile</SectionLabel>
        <Segmented
          size="sm"
          value={state.perfProfile}
          onChange={(v) => actions.set({ perfProfile: v })}
          options={[
            { id: 'saver', label: 'Saver' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'performance', label: 'Turbo' },
          ]}
        />
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
    <Popover width={272}>
      <div className="font-display text-[15px] font-semibold mb-0.5">{now.toLocaleDateString([], { month: 'long', year: 'numeric' })}</div>
      <div className="text-[12px] text-t2 mb-3">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11.5px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-t3 font-bold py-1">{d}</span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className="py-1 rounded-full tabular-nums" style={d === now.getDate() ? { background: 'rgb(var(--acc))', color: 'var(--on-acc)', fontWeight: 700 } : { color: d ? 'var(--t1)' : 'transparent' }}>
            {d || '.'}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-[10px] p-2.5 field text-[12px]">
        <div className="font-semibold">HYBRID Shell standup</div>
        <div className="text-t3">Tomorrow · 10:30 · demo event</div>
      </div>
    </Popover>
  );
}

export function VolumeIcon({ v, size = 15 }) {
  if (v === 0) return <VolumeX size={size} />;
  if (v < 50) return <Volume1 size={size} />;
  return <Volume2 size={size} />;
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

  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  const hoverSwitch = (k) => open && MENU_ORDER.concat('hybrid').includes(open) && setOpen(k);

  return (
    <div ref={root} className="absolute top-[8px] left-[10px] right-[10px] h-[34px] z-[4000] chrome chrome-top">
      <div className="h-full a-slidedown">
      <div className="glass h-full rounded-[13px] flex items-center pl-2 pr-1.5 text-[13px] relative">
        <div className="absolute inset-x-6 -bottom-px h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--acc) / .5), rgb(var(--acc2) / .5), transparent)' }} />
        {/* Left: brand + menus */}
        <div className="relative">
          <button onClick={() => toggle('hybrid')} onMouseEnter={() => hoverSwitch('hybrid')} className="flex items-center gap-2 h-[26px] px-2 rounded-[8px] hov" style={open === 'hybrid' ? { background: 'var(--hover)' } : undefined} aria-label="HYBRID menu">
            <HybridLogo size={17} glow />
            <span className="font-display font-bold tracking-[0.14em] text-[12px]">HYBRID</span>
          </button>
          {open === 'hybrid' && (
            <div className="absolute top-[34px] left-0 z-50">
              <MenuList items={menus.hybrid} onClose={close} className="min-w-[260px]" />
            </div>
          )}
        </div>
        <span className="font-bold px-2.5 text-[13px]">{appName}</span>
        {MENU_ORDER.map((k) => (
          <div key={k} className="relative">
            <button onClick={() => toggle(k)} onMouseEnter={() => hoverSwitch(k)} className="h-[26px] px-2.5 rounded-[8px] text-t1 font-medium hov" style={open === k ? { background: 'var(--hover)' } : undefined}>
              {k}
            </button>
            {open === k && (
              <div className="absolute top-[34px] left-0 z-50">
                <MenuList items={menus[k]} onClose={close} />
              </div>
            )}
          </div>
        ))}

        <div className="flex-1" />

        {/* Right: status */}
        <div className="relative flex items-center gap-0.5">
          {state.focus && (
            <span className="flex items-center gap-1 px-2 text-[11.5px] font-semibold text-acc">
              <Moon size={13} /> Focus
            </span>
          )}
          <StatusButton wide active={open === 'perf'} onClick={() => toggle('perf')} label="Performance">
            <span className="flex items-center gap-1.5">
              <Gauge size={14} />
              <span className="flex items-end gap-[2px] h-[12px]">
                {perf.hist.cpu.slice(-6).map((v, i) => (
                  <span key={i} className="w-[3px] rounded-sm" style={{ height: `${Math.max(15, v)}%`, background: 'rgb(var(--acc))', opacity: 0.45 + i * 0.1, transition: 'height 600ms' }} />
                ))}
              </span>
              <span className="text-[11.5px] font-semibold tabular-nums w-[26px] text-left">{Math.round(perf.cpu)}%</span>
            </span>
          </StatusButton>
          <StatusButton active={open === 'wifi'} onClick={() => toggle('wifi')} label="Wi-Fi">
            {state.wifi && !state.airplane ? <Wifi size={15} /> : <WifiOff size={15} className="text-t3" />}
          </StatusButton>
          <StatusButton active={open === 'bt'} onClick={() => toggle('bt')} label="Bluetooth">
            {state.bluetooth ? <Bluetooth size={15} /> : <BluetoothOff size={15} className="text-t3" />}
          </StatusButton>
          <StatusButton active={open === 'vol'} onClick={() => toggle('vol')} label="Volume">
            <VolumeIcon v={state.volume} />
          </StatusButton>
          <StatusButton wide active={open === 'battery'} onClick={() => toggle('battery')} label="Battery">
            <span className="flex items-center gap-1 text-[11.5px] font-semibold">
              {state.perfProfile === 'performance' ? <BatteryCharging size={16} /> : <BatteryMedium size={16} />}87%
            </span>
          </StatusButton>
          <StatusButton onClick={() => actions.toggleOverlay('spotlight')} label="Search">
            <Search size={15} />
          </StatusButton>
          <StatusButton wide active={open === 'clock'} onClick={() => toggle('clock')} label="Date and time">
            <span className="text-[12.5px] font-semibold tabular-nums whitespace-nowrap">
              {fmtDate(now)}&nbsp;&nbsp;{fmtTime(now)}
            </span>
          </StatusButton>
          <StatusButton active={state.overlay === 'control'} onClick={() => actions.toggleOverlay('control')} label="Control Center">
            <SlidersHorizontal size={15} />
          </StatusButton>
          {open && !MENU_ORDER.includes(open) && open !== 'hybrid' && <StatusPanels which={open} state={state} actions={actions} perf={perf} />}
        </div>
      </div>
      </div>
    </div>
  );
}
