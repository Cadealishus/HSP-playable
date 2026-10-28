import { Wifi, WifiOff, Bluetooth, BluetoothOff, Moon, Sun, MoonStar, SunMedium, Plane, ArrowDown, ArrowLeftRight } from 'lucide-react';
import { useOS } from '../os/store';
import { THEMES } from '../os/themes';
import { usePerf } from '../os/sim';
import { Slider, Sparkline, Meter, SectionLabel, DemoBadge, HybridLogo } from '../components/ui';
import { ThemePicker, WallpaperPicker, AccentPicker, AppearanceSliders, DockControls } from '../components/SettingsParts';
import { VolumeIcon } from '../hybrid/MenuBar';
import { WinLogo } from './Overlays';

// Quick setting tile: icon + label + state. "On" is a quiet accent tint, never a glow.
function Tile({ on, onClick, icon: Icon, label, sub }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className="flex items-center gap-2.5 h-12 px-2.5 rounded-[var(--r-md)] text-left hov"
      style={{ background: on ? 'rgb(var(--acc) / .14)' : 'var(--field)', transition: 'background var(--d-fast) var(--ease-out)' }}
    >
      <span className="grid place-items-center w-7 h-7 rounded-full shrink-0" style={{ background: on ? 'rgb(var(--acc))' : 'var(--field)', color: on ? 'var(--on-acc)' : 'var(--t2)', transition: 'background var(--d-fast), color var(--d-fast)' }}>
        <Icon size={14} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium truncate">{label}</span>
        <span className="block text-[11px] text-t3 truncate">{sub}</span>
      </span>
    </button>
  );
}

function Section({ title, meta, children, last }) {
  return (
    <section className="py-3" style={last ? undefined : { borderBottom: '1px solid var(--line)' }}>
      {title && <SectionLabel right={meta}>{title}</SectionLabel>}
      {children}
    </section>
  );
}

export default function ControlCenter() {
  const { state, actions } = useOS();
  const p = usePerf();
  if (state.overlay !== 'control') return null;
  const dark = THEMES[state.theme].dark;
  const isWin = state.mode === 'windows';
  return (
    <div className="absolute inset-0 z-[8600]" onPointerDown={(e) => e.target === e.currentTarget && actions.set({ overlay: null })}>
      <div
        role="dialog"
        aria-label="Control Center"
        className={`absolute right-2 ${isWin ? 'bottom-[56px]' : 'top-[38px]'} w-[640px] max-h-[calc(100%-96px)] overflow-y-auto glass-strong rounded-[var(--r-xl)] px-4 pt-1 pb-1 a-cc`}
        style={{ transformOrigin: isWin ? 'bottom right' : 'top right' }}
      >
        <div className="grid grid-cols-2 gap-x-6">
          {/* Left column: connectivity, display and sound, performance */}
          <div className="min-w-0">
            <Section>
              <div className="grid grid-cols-2 gap-2">
                <Tile on={state.wifi} onClick={() => actions.set({ wifi: !state.wifi })} icon={state.wifi ? Wifi : WifiOff} label="Wi-Fi" sub={state.wifi ? state.network || 'Nebula-5G' : 'Off'} />
                <Tile on={state.bluetooth} onClick={() => actions.set({ bluetooth: !state.bluetooth })} icon={state.bluetooth ? Bluetooth : BluetoothOff} label="Bluetooth" sub={state.bluetooth ? '2 devices' : 'Off'} />
                <Tile on={state.focus} onClick={() => actions.set({ focus: !state.focus })} icon={MoonStar} label="Focus" sub={state.focus ? 'Notifications off' : 'Off'} />
                <Tile on={!dark} onClick={() => actions.toggleDark()} icon={dark ? Moon : Sun} label="Appearance" sub={dark ? 'Dark' : 'Light'} />
                <Tile on={state.nightLight} onClick={() => actions.set({ nightLight: !state.nightLight })} icon={SunMedium} label="Night light" sub={state.nightLight ? 'Warm' : 'Off'} />
                <Tile on={state.airplane} onClick={() => actions.set({ airplane: !state.airplane, wifi: state.airplane, bluetooth: state.airplane })} icon={Plane} label="Airplane" sub={state.airplane ? 'On' : 'Off'} />
              </div>
            </Section>

            <Section>
              <button onClick={() => actions.switchMode()} className="w-full flex items-center gap-3 h-12 px-2.5 rounded-[var(--r-md)] text-left hov" style={{ background: 'var(--field)' }}>
                <span className="grid place-items-center w-7 h-7">{isWin ? <HybridLogo size={20} /> : <WinLogo size={16} />}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium">{isWin ? 'Switch to HYBRID desktop' : 'Switch to Windows desktop'}</span>
                  <span className="block text-[11px] text-t3">Ctrl + Alt + M</span>
                </span>
                <ArrowLeftRight size={15} className="text-t3" />
              </button>
            </Section>

            <Section>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <SunMedium size={16} strokeWidth={1.75} className="text-t2 shrink-0" />
                  <Slider id="cc-bright" label="Brightness" value={state.brightness} min={20} max={100} onChange={(v) => actions.set({ brightness: v })} />
                  <span className="w-9 text-right text-[12px] tnum text-t2">{state.brightness}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-t2 shrink-0">
                    <VolumeIcon v={state.volume} size={16} />
                  </span>
                  <Slider id="cc-volume" label="Volume" value={state.volume} onChange={(v) => actions.set({ volume: v })} />
                  <span className="w-9 text-right text-[12px] tnum text-t2">{state.volume}%</span>
                </div>
              </div>
            </Section>

            <Section title="Performance" meta={<DemoBadge>Simulated</DemoBadge>} last>
              <div className="grid grid-cols-[60px_minmax(0,1fr)_64px] items-center gap-x-3 gap-y-2.5">
                {[
                  ['CPU', p.cpu, `${Math.round(p.cpu)}%`, 100],
                  ['GPU', p.gpu, `${Math.round(p.gpu)}%`, 100],
                  ['Memory', p.ram, `${p.ram.toFixed(1)} GB`, 32],
                ].map(([k, v, t, max]) => [
                  <span key={k} className="text-[12px] text-t2">{k}</span>,
                  <Meter key={k + 'm'} value={v} max={max} />,
                  <span key={k + 'v'} className="text-[12px] text-right tnum">{t}</span>,
                ])}
                <span className="text-[12px] text-t2">Network</span>
                <div className="min-w-0 overflow-hidden">
                  <Sparkline data={p.hist.net} w={120} h={16} max={40} fill={false} />
                </div>
                <span className="text-[12px] text-right tnum inline-flex items-center justify-end gap-0.5">
                  <ArrowDown size={10} className="text-t3" />
                  {p.netDown.toFixed(0)} Mb/s
                </span>
              </div>
            </Section>
          </div>

          {/* Right column: appearance and dock */}
          <div className="min-w-0">
            <Section title="Theme">
              <ThemePicker compact />
            </Section>
            <Section title="Accent">
              <AccentPicker />
            </Section>
            <Section title="Wallpaper">
              <WallpaperPicker cols={4} />
              <div className="mt-3">
                <AppearanceSliders idPrefix="cc" />
              </div>
            </Section>
            <Section title="Dock" last>
              <DockControls idPrefix="cc" />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
