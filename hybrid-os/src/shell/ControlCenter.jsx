import { Wifi, WifiOff, Bluetooth, BluetoothOff, Moon, Sun, MoonStar, Monitor, Sparkles, SunMedium, ArrowDown, ArrowUp, Plane } from 'lucide-react';
import { useOS } from '../os/store';
import { THEMES } from '../os/themes';
import { usePerf } from '../os/sim';
import { Slider, Sparkline, Meter, SectionLabel, DemoBadge, HybridLogo } from '../components/ui';
import { ThemePicker, WallpaperPicker, AccentPicker, AppearanceSliders, DockControls } from '../components/SettingsParts';
import { VolumeIcon } from '../hybrid/MenuBar';
import { WinLogo } from './Overlays';

function Tile({ on, onClick, icon: Icon, label, sub, wide }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-2.5 rounded-[14px] p-2.5 text-left press ${wide ? 'col-span-2' : ''}`}
      style={{ background: on ? 'rgb(var(--acc) / .16)' : 'var(--field)', boxShadow: on ? 'inset 0 0 0 1px rgb(var(--acc) / .45)' : 'inset 0 0 0 1px var(--line)', transition: 'all calc(var(--anim)*180ms)' }}
    >
      <span className="grid place-items-center w-8 h-8 rounded-full shrink-0" style={{ background: on ? 'linear-gradient(140deg, rgb(var(--acc)), rgb(var(--acc2)))' : 'var(--field)', color: on ? 'var(--on-acc)' : 'var(--t2)', boxShadow: on ? '0 4px 14px -4px rgb(var(--acc) / .8)' : 'none' }}>
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold truncate">{label}</span>
        <span className="block text-[11px] text-t3 truncate">{sub}</span>
      </span>
    </button>
  );
}

function Card({ children, className = '' }) {
  return <div className={`rounded-[16px] p-3 ${className}`} style={{ background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>{children}</div>;
}

export default function ControlCenter() {
  const { state, actions } = useOS();
  const p = usePerf();
  if (state.overlay !== 'control') return null;
  const dark = THEMES[state.theme].dark;
  const isWin = state.mode === 'windows';
  return (
    <div className="absolute inset-0 z-[8600]" onPointerDown={(e) => e.target === e.currentTarget && actions.set({ overlay: null })}>
      <div className={`absolute right-[10px] ${isWin ? 'bottom-[58px]' : 'top-[50px]'} w-[668px] max-h-[calc(100%-112px)] overflow-y-auto glass-strong rounded-[22px] p-3.5 a-cc`} style={{ transformOrigin: isWin ? 'bottom right' : 'top right' }}>
        <div className="flex items-center gap-2 px-1 pb-3">
          <HybridLogo size={18} />
          <span className="font-display font-semibold tracking-[0.08em] text-[13px]">Control Center</span>
          <span className="ml-auto text-[11px] text-t3">Settings apply instantly</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* Left column */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="grid grid-cols-2 gap-2">
              <Tile on={state.wifi} onClick={() => actions.set({ wifi: !state.wifi })} icon={state.wifi ? Wifi : WifiOff} label="Wi-Fi" sub={state.wifi ? state.network || 'Nebula-5G' : 'Off'} />
              <Tile on={state.bluetooth} onClick={() => actions.set({ bluetooth: !state.bluetooth })} icon={state.bluetooth ? Bluetooth : BluetoothOff} label="Bluetooth" sub={state.bluetooth ? '2 devices' : 'Off'} />
              <Tile on={state.focus} onClick={() => actions.set({ focus: !state.focus })} icon={MoonStar} label="Focus" sub={state.focus ? 'Notifications muted' : 'Off'} />
              <Tile on={!dark} onClick={() => actions.toggleDark()} icon={dark ? Moon : Sun} label={dark ? 'Dark mode' : 'Light mode'} sub={THEMES[state.theme].name} />
              <Tile on={state.nightLight} onClick={() => actions.set({ nightLight: !state.nightLight })} icon={SunMedium} label="Night light" sub={state.nightLight ? 'Warm display' : 'Off'} />
              <Tile on={state.airplane} onClick={() => actions.set({ airplane: !state.airplane, wifi: state.airplane, bluetooth: state.airplane })} icon={Plane} label="Airplane" sub={state.airplane ? 'Radios off' : 'Off'} />
            </div>

            <button
              onClick={() => actions.switchMode()}
              className="relative overflow-hidden flex items-center gap-3 rounded-[16px] p-3 text-left press group"
              style={{ background: 'linear-gradient(120deg, rgb(var(--acc) / .22), rgb(var(--acc2) / .22))', boxShadow: 'inset 0 0 0 1px rgb(var(--acc) / .4)' }}
            >
              <span className="absolute inset-y-0 -left-1/3 w-1/3 opacity-0 group-hover:opacity-100" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent)', animation: 'sweep 1.4s ease-in-out infinite' }} />
              <span className="grid place-items-center w-10 h-10 rounded-[12px] glass">{isWin ? <HybridLogo size={22} /> : <WinLogo size={18} />}</span>
              <span className="flex-1">
                <span className="block text-[13.5px] font-bold">{isWin ? 'Switch to HYBRID Mode' : 'Switch to Windows Desktop'}</span>
                <span className="block text-[11px] text-t2">Ctrl + Alt + M · cinematic transition</span>
              </span>
              <Monitor size={16} className="text-t2" />
            </button>

            <Card>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <SunMedium size={15} className="text-t2 shrink-0" />
                  <Slider id="cc-bright" label="Brightness" value={state.brightness} min={20} max={100} onChange={(v) => actions.set({ brightness: v })} />
                  <span className="w-8 text-right text-[11.5px] tabular-nums text-t3">{state.brightness}%</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-t2 shrink-0">
                    <VolumeIcon v={state.volume} />
                  </span>
                  <Slider id="cc-volume" label="Volume" value={state.volume} onChange={(v) => actions.set({ volume: v })} />
                  <span className="w-8 text-right text-[11.5px] tabular-nums text-t3">{state.volume}%</span>
                </div>
              </div>
            </Card>

            <Card>
              <SectionLabel right={<DemoBadge>Simulated</DemoBadge>}>Performance</SectionLabel>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  ['CPU', p.cpu, `${Math.round(p.cpu)}%`, 100],
                  ['GPU', p.gpu, `${Math.round(p.gpu)}%`, 100],
                  ['RAM', p.ram, `${p.ram.toFixed(1)} GB`, 32],
                ].map(([k, v, t, max]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[11.5px] mb-1">
                      <span className="font-bold text-t2">{k}</span>
                      <span className="tabular-nums font-semibold">{t}</span>
                    </div>
                    <Meter value={v} max={max} />
                  </div>
                ))}
                <div>
                  <div className="flex justify-between text-[11.5px] mb-1">
                    <span className="font-bold text-t2">Network</span>
                    <span className="tabular-nums font-semibold flex items-center gap-1">
                      <ArrowDown size={10} />
                      {p.netDown.toFixed(0)} <ArrowUp size={10} />
                      {p.netUp.toFixed(1)} Mb/s
                    </span>
                  </div>
                  <Sparkline data={p.hist.net} w={130} h={16} max={200} fill={false} />
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-t3">
                <Sparkles size={12} className="text-acc" /> Profile: {state.perfProfile === 'performance' ? 'Turbo' : state.perfProfile === 'saver' ? 'Saver' : 'Balanced'} · CPU {Math.round(p.cpuTemp)}°C
              </div>
            </Card>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3 min-w-0">
            <Card>
              <SectionLabel>Theme</SectionLabel>
              <ThemePicker compact />
              <div className="mt-3">
                <SectionLabel>Accent</SectionLabel>
                <AccentPicker />
              </div>
            </Card>
            <Card>
              <SectionLabel>Wallpaper</SectionLabel>
              <WallpaperPicker cols={4} />
              <div className="mt-3">
                <AppearanceSliders idPrefix="cc" />
              </div>
            </Card>
            <Card>
              <SectionLabel>Dock</SectionLabel>
              <DockControls idPrefix="cc" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
