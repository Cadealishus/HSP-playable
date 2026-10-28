import { Check, PanelBottom, PanelLeft, PanelRight } from 'lucide-react';
import { useOS } from '../os/store';
import { THEMES, ACCENTS, WALLPAPERS } from '../os/themes';
import { wallpaperThumb } from './Wallpaper';
import { Slider, Toggle, Segmented } from './ui';

export function ThemePicker({ compact = false }) {
  const { state, actions } = useOS();
  return (
    <div className="grid grid-cols-3 gap-2">
      {Object.entries(THEMES).map(([id, t]) => {
        const on = state.theme === id;
        return (
          <button key={id} onClick={() => actions.setTheme(id)} aria-pressed={on} className="group text-left press">
            <div
              className="relative overflow-hidden rounded-[var(--r-md)]"
              style={{ height: compact ? 54 : 78, background: `linear-gradient(160deg, ${t.preview[0]}, ${t.preview[1]})`, boxShadow: on ? '0 0 0 2px rgb(var(--acc))' : 'inset 0 0 0 1px var(--line)', transition: 'box-shadow var(--d-base) var(--ease-out)' }}
            >
              {/* mini desktop: bar, window, dock */}
              <div className="absolute left-[8%] right-[8%] top-[9%] h-[11%] rounded-[3px]" style={{ background: t.dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.75)' }} />
              <div className="absolute left-[18%] top-[30%] w-[48%] h-[40%] rounded-[4px]" style={{ background: t.dark ? 'rgba(14,16,30,.8)' : 'rgba(255,255,255,.9)' }}>
                <div className="m-[6%] h-[14%] w-[40%] rounded-full" style={{ background: t.preview[2] }} />
              </div>
              <div className="absolute left-[30%] right-[30%] bottom-[8%] h-[12%] rounded-[3px]" style={{ background: t.dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.8)' }} />
            </div>
            <div className={`mt-1.5 text-[12px] ${on ? 'text-t1 font-medium' : 'text-t2'}`}>{t.name}</div>
            {!compact && <div className="text-[11px] text-t3 leading-snug">{t.blurb}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function WallpaperPicker({ cols = 4 }) {
  const { state, actions } = useOS();
  const isWin = state.mode === 'windows';
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {WALLPAPERS.map((w) => {
        const on = state.wallpaper === w.id;
        return (
          <button key={w.id} onClick={() => actions.set({ wallpaper: w.id })} aria-pressed={on} className="text-left press" title={w.note}>
            <img
              src={wallpaperThumb(w.id)}
              alt={w.name}
              className="w-full aspect-video object-cover rounded-[var(--r-sm)]"
              style={{ boxShadow: on ? '0 0 0 2px rgb(var(--acc))' : 'inset 0 0 0 1px var(--line)', transition: 'box-shadow var(--d-base) var(--ease-out)' }}
            />
            <div className={`mt-1.5 text-[11px] truncate ${on ? 'text-t1 font-medium' : 'text-t3'}`}>{w.name}</div>
          </button>
        );
      })}
      {isWin && <div className="col-span-full text-[11px] text-t3">Windows mode uses its own wallpaper. These apply to HYBRID mode.</div>}
    </div>
  );
}

export function AccentPicker() {
  const { state, actions } = useOS();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {ACCENTS.map((a) => {
        const on = state.accent === a.id;
        const bg = a.rgb ? `rgb(${a.rgb})` : `conic-gradient(from 210deg, rgb(${THEMES[state.theme].acc}), rgb(${THEMES[state.theme].acc2}), rgb(${THEMES[state.theme].acc}))`;
        return (
          <button
            key={a.id}
            title={a.name}
            aria-label={`Accent: ${a.name}`}
            aria-pressed={on}
            onClick={() => actions.set({ accent: a.id })}
            className="w-[26px] h-[26px] rounded-full grid place-items-center press"
            style={{ background: bg, boxShadow: on ? `0 0 0 2px rgb(var(--surface)), 0 0 0 4px ${a.rgb ? `rgb(${a.rgb})` : 'var(--t2)'}` : 'inset 0 0 0 1px rgba(255,255,255,.25)', transition: 'box-shadow 160ms' }}
          >
            {on && <Check size={13} strokeWidth={3} color="#fff" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.5))' }} />}
          </button>
        );
      })}
    </div>
  );
}

export function LabeledSlider({ id, label, value, onChange, min = 0, max = 100, display }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-0.5">
        <label htmlFor={id} className="text-t2">
          {label}
        </label>
        <span className="tnum text-t3 text-[12px]">{display ? display(value) : value}</span>
      </div>
      <Slider id={id} label={label} value={value} min={min} max={max} onChange={onChange} />
    </div>
  );
}

export const motionLabel = (v) => (v === 0 ? 'Off' : v < 30 ? 'Minimal' : v < 70 ? 'Balanced' : 'Cinematic');
export const glassLabel = (v) => (v < 25 ? 'Solid' : v < 60 ? 'Frosted' : 'Crystal');

export function AppearanceSliders({ idPrefix = 'cc' }) {
  const { state, actions } = useOS();
  return (
    <div className="flex flex-col gap-2">
      <LabeledSlider id={`${idPrefix}-glass`} label="Glass transparency" value={state.glass} onChange={(v) => actions.set({ glass: v })} display={glassLabel} />
      <LabeledSlider id={`${idPrefix}-motion`} label="Animation intensity" value={state.motion} onChange={(v) => actions.set({ motion: v })} display={motionLabel} />
    </div>
  );
}

export function DockControls({ idPrefix = 'cc' }) {
  const { state, actions } = useOS();
  const d = state.dock;
  return (
    <div className="flex flex-col gap-2.5">
      <LabeledSlider id={`${idPrefix}-dsize`} label="Icon size" min={36} max={72} value={d.size} onChange={(v) => actions.setDock({ size: v })} display={(v) => `${v}px`} />
      <LabeledSlider id={`${idPrefix}-dmag`} label="Magnification" value={d.mag} onChange={(v) => actions.setDock({ mag: v })} display={(v) => (v === 0 ? 'Off' : `${Math.round(100 + v * 0.95)}%`)} />
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-t2">Auto-hide dock</span>
        <Toggle id={`${idPrefix}-autohide`} label="Auto-hide dock" on={d.autoHide} onChange={(v) => actions.setDock({ autoHide: v })} />
      </div>
      <Segmented
        value={d.position}
        onChange={(v) => actions.setDock({ position: v })}
        options={[
          { id: 'left', label: 'Left', icon: PanelLeft },
          { id: 'bottom', label: 'Bottom', icon: PanelBottom },
          { id: 'right', label: 'Right', icon: PanelRight },
        ]}
      />
    </div>
  );
}
