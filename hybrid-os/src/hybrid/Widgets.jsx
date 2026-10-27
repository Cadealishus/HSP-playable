import { useRef, useState, memo } from 'react';
import { Moon, CloudMoon, Cloud, CloudRain, Sun, Play, Pause, SkipBack, SkipForward, Heart, ArrowUpRight, Cpu, MemoryStick, MonitorSpeaker, Thermometer, GitBranch } from 'lucide-react';
import { useOS, toLocal } from '../os/store';
import { useNow, usePerf, useMusic, fmtDur } from '../os/sim';
import { WEATHER, PROJECTS } from '../os/data';
import { Sparkline, Meter, DemoBadge } from '../components/ui';

const WW = 272;

// Widgets flow in a left and a right column; once dragged, a widget floats at its saved position.
const COLUMN = { clock: 'l', weather: 'l', system: 'l', music: 'r', notes: 'r', projects: 'r' };

function Frame({ id, index, children, title, right, pad = 'p-4' }) {
  const { state, actions } = useOS();
  const pos = state.widgetPos[id];
  const [drag, setDrag] = useState(null);
  const el = useRef(null);

  const onDown = (e) => {
    if (e.button !== 0 || e.target.closest('button, input, textarea, a, [data-nodrag]')) return;
    const start = toLocal(e.clientX, e.clientY);
    const r = el.current.getBoundingClientRect();
    const box = toLocal(r.left, r.top);
    let moved = false;
    const at = (ev) => {
      const p = toLocal(ev.clientX, ev.clientY);
      return { x: Math.round(box.x + p.x - start.x), y: Math.round(Math.max(50, box.y + p.y - start.y)) };
    };
    const move = (ev) => {
      const p = toLocal(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
      moved = true;
      setDrag(at(ev));
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) actions.setWidgetPos(id, at(ev));
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const floating = drag || pos;
  return (
    <div ref={el} className={floating ? 'absolute pointer-events-auto' : 'relative pointer-events-auto'} style={{ ...(floating ? { left: floating.x, top: floating.y, zIndex: drag ? 40 : 3 } : null), width: WW }}>
      <section
        onPointerDown={onDown}
        data-dragging={!!drag}
        aria-label={title || id}
        className={`widget glass rounded-[20px] ${pad} a-widget cursor-grab`}
        style={{ animationDelay: `calc(var(--anim) * ${120 + index * 60}ms)`, opacity: state.focus ? 0.35 : 1 }}
      >
        {(title || right) && (
          <header className="flex items-center justify-between mb-2.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-t3">{title}</span>
            {right}
          </header>
        )}
        {children}
      </section>
    </div>
  );
}

function ClockWidget({ i }) {
  const now = useNow(1000);
  const h = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const secP = now.getSeconds() / 60;
  return (
    <Frame id="clock" index={i} pad="px-5 pt-4 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display font-extralight text-[54px] leading-[1] tracking-[-0.03em] tabular-nums">{h}</span>
            <span className="font-display text-[13px] font-semibold text-t2">{ampm}</span>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-t2">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <svg width="34" height="34" viewBox="0 0 34 34" className="mt-1.5" aria-hidden="true">
          <circle cx="17" cy="17" r="14" fill="none" stroke="var(--field)" strokeWidth="3" />
          <circle cx="17" cy="17" r="14" fill="none" stroke="rgb(var(--acc))" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${secP * 88} 88`} transform="rotate(-90 17 17)" style={{ transition: 'stroke-dasharray 900ms linear' }} />
        </svg>
      </div>
      <div className="mt-3.5 grid grid-cols-7 gap-1 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => {
          const date = new Date(monday);
          date.setDate(monday.getDate() + k);
          const today = k === dow;
          return (
            <div key={k} className="rounded-[10px] py-1" style={today ? { background: 'linear-gradient(160deg, rgb(var(--acc) / .9), rgb(var(--acc2) / .85))', color: 'var(--on-acc)', boxShadow: '0 4px 14px -4px rgb(var(--acc) / .6)' } : undefined}>
              <div className={`text-[9.5px] font-bold ${today ? '' : 'text-t3'}`}>{d}</div>
              <div className="text-[12.5px] font-bold tabular-nums">{date.getDate()}</div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

const WICON = { moon: Moon, cloudmoon: CloudMoon, cloud: Cloud, rain: CloudRain, sun: Sun };

function WeatherWidget({ i }) {
  return (
    <Frame id="weather" index={i} title={WEATHER.city} right={<DemoBadge />}>
      <div className="flex items-center gap-3">
        <div className="relative grid place-items-center w-12 h-12 rounded-full" style={{ background: 'radial-gradient(circle at 35% 35%, rgb(var(--acc) / .35), transparent 70%)' }}>
          <Moon size={26} className="text-acc" fill="currentColor" fillOpacity={0.15} />
        </div>
        <div className="flex-1">
          <div className="font-display text-[34px] font-light leading-none tabular-nums">{WEATHER.temp}°</div>
          <div className="text-[12px] text-t2 mt-1">{WEATHER.cond} · H {WEATHER.hi}° L {WEATHER.lo}°</div>
        </div>
      </div>
      <div className="mt-3 flex justify-between">
        {WEATHER.hours.map((h) => {
          const I = WICON[h.icon];
          return (
            <div key={h.t} className="flex flex-col items-center gap-1 text-[11px]">
              <span className="text-t3 font-semibold">{h.t}</span>
              <I size={15} className="text-t2" />
              <span className="font-bold tabular-nums">{h.v}°</span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function SystemWidget({ i }) {
  const p = usePerf();
  const rows = [
    { k: 'CPU', icon: Cpu, v: p.cpu, txt: `${Math.round(p.cpu)}%`, max: 100 },
    { k: 'GPU', icon: MonitorSpeaker, v: p.gpu, txt: `${Math.round(p.gpu)}%`, max: 100 },
    { k: 'RAM', icon: MemoryStick, v: p.ram, txt: `${p.ram.toFixed(1)} GB`, max: 32 },
  ];
  return (
    <Frame id="system" index={i} title="System" right={<DemoBadge>Simulated</DemoBadge>}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[11px] text-t3 font-semibold">CPU load</div>
          <div className="font-display text-[26px] font-light leading-none tabular-nums">{Math.round(p.cpu)}<span className="text-[14px] text-t2">%</span></div>
        </div>
        <Sparkline data={p.hist.cpu} w={150} h={34} />
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center gap-2.5">
            <r.icon size={13} className="text-t3" />
            <span className="w-8 text-[11px] font-bold text-t2">{r.k}</span>
            <div className="flex-1">
              <Meter value={r.v} max={r.max} />
            </div>
            <span className="w-[52px] text-right text-[11.5px] font-semibold tabular-nums">{r.txt}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-3 text-[11px] text-t3">
        <Thermometer size={12} /> CPU {Math.round(p.cpuTemp)}°C · GPU {Math.round(p.gpuTemp)}°C
      </div>
    </Frame>
  );
}

export function AlbumArt({ track, size = 56, spin = false }) {
  const [a, b, c] = track.art;
  return (
    <div className="relative shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: size * 0.22, background: `radial-gradient(120% 120% at 20% 10%, ${a}, ${b} 45%, ${c})`, boxShadow: `0 8px 24px -8px ${b}` }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full">
        <circle cx="28" cy="27" r="9" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="0.8" />
        <circle cx="28" cy="27" r="5" fill="rgba(255,255,255,.18)" />
        <path d="M0 30 L10 20 L17 26 L26 14 L40 30 L40 40 L0 40Z" fill="rgba(0,0,20,.35)" />
      </svg>
    </div>
  );
}

function MusicWidget({ i }) {
  const m = useMusic();
  const t = m.track;
  return (
    <Frame id="music" index={i} title="Now Playing" right={<span className="text-[10.5px] font-bold text-t3">Spotify</span>}>
      <div className="flex items-center gap-3">
        <AlbumArt track={t} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[14px] truncate">{t.title}</div>
          <div className="text-[12px] text-t2 truncate">{t.artist}</div>
          <div className="mt-1.5 flex items-end gap-[3px] h-3" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <span key={k} className="eq-bar w-[3px] h-full rounded-sm" style={{ background: 'rgb(var(--acc))', animationDelay: `${k * 0.11}s`, animationPlayState: m.playing ? 'running' : 'paused', transform: m.playing ? undefined : 'scaleY(.25)' }} />
            ))}
          </div>
        </div>
        <button aria-label="Like" onClick={() => m.like(m.i)} className="w-8 h-8 grid place-items-center rounded-full hov">
          <Heart size={15} className={m.liked[m.i] ? 'text-acc' : 'text-t3'} fill={m.liked[m.i] ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="mt-3" data-nodrag>
        <div
          className="h-[4px] rounded-full cursor-pointer"
          style={{ background: 'var(--field)' }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            m.seek(Math.floor(((e.clientX - r.left) / r.width) * t.dur));
          }}
        >
          <div className="h-full rounded-full" style={{ width: `${(m.pos / t.dur) * 100}%`, background: 'linear-gradient(90deg, rgb(var(--acc)), rgb(var(--acc2)))', transition: 'width 1s linear' }} />
        </div>
        <div className="mt-1 flex justify-between text-[10.5px] text-t3 tabular-nums">
          <span>{fmtDur(m.pos)}</span>
          <span>-{fmtDur(t.dur - m.pos)}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-center gap-4">
        <button aria-label="Previous" onClick={m.prev} className="w-8 h-8 grid place-items-center rounded-full hov press">
          <SkipBack size={16} fill="currentColor" />
        </button>
        <button aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.toggle} className="w-10 h-10 grid place-items-center rounded-full press" style={{ background: 'var(--t1)', color: 'rgb(var(--glass))', boxShadow: '0 6px 18px -6px rgb(var(--acc) / .7)' }}>
          {m.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
        </button>
        <button aria-label="Next" onClick={m.next} className="w-8 h-8 grid place-items-center rounded-full hov press">
          <SkipForward size={16} fill="currentColor" />
        </button>
      </div>
    </Frame>
  );
}

function NotesWidget({ i }) {
  const { state, actions } = useOS();
  return (
    <Frame id="notes" index={i} title="Quick Notes" right={<span className="text-[10.5px] text-t3 tabular-nums">{state.notes.length} chars</span>}>
      <textarea
        id="quick-notes"
        aria-label="Quick notes"
        value={state.notes}
        onChange={(e) => actions.set({ notes: e.target.value })}
        spellCheck={false}
        rows={4}
        className="w-full resize-none bg-transparent text-[13px] leading-[1.55] text-t1 outline-none placeholder:text-t3 cursor-text"
        placeholder="Jot something down…"
      />
    </Frame>
  );
}

function ProjectsWidget({ i }) {
  const { actions } = useOS();
  return (
    <Frame id="projects" index={i} title="Recent Projects" pad="p-3 pt-4">
      <div className="flex flex-col">
        {PROJECTS.map((p) => (
          <button
            key={p.id}
            onClick={() => actions.open('vscode', { title: `${p.name} — Visual Studio Code`, props: { project: p.id } })}
            className="group flex items-center gap-3 rounded-[12px] px-2 py-2 text-left hov"
          >
            <span className="grid place-items-center w-8 h-8 rounded-[9px] text-[12px] font-extrabold" style={{ background: `${p.color}26`, color: `color-mix(in srgb, ${p.color} 65%, var(--t1))`, boxShadow: `inset 0 0 0 1px ${p.color}55` }}>
              {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-bold truncate">{p.name}</span>
              <span className="flex items-center gap-1 text-[11px] text-t3 truncate">
                <GitBranch size={10} /> {p.branch} · {p.when}
              </span>
            </span>
            <ArrowUpRight size={14} className="text-t3 opacity-0 group-hover:opacity-100" style={{ transition: 'opacity 150ms' }} />
          </button>
        ))}
      </div>
    </Frame>
  );
}

const LIST = [
  ['clock', ClockWidget],
  ['weather', WeatherWidget],
  ['system', SystemWidget],
  ['music', MusicWidget],
  ['notes', NotesWidget],
  ['projects', ProjectsWidget],
];

export const WIDGET_NAMES = { clock: 'Clock & date', weather: 'Weather', system: 'System monitor', music: 'Now Playing', notes: 'Quick Notes', projects: 'Recent projects' };

function Widgets() {
  const { state } = useOS();
  if (!state.showWidgets) return null;
  const on = LIST.filter(([id]) => state.widgets[id]);
  const col = (side) => on.filter(([id]) => COLUMN[id] === side && !state.widgetPos[id]);
  const free = on.filter(([id]) => state.widgetPos[id]);
  const idx = (id) => on.findIndex(([x]) => x === id);
  return (
    <div className="absolute inset-0 pointer-events-none chrome chrome-fade z-[1]">
      <div className="absolute left-[18px] top-[58px] flex flex-col gap-3">{col('l').map(([id, C]) => <C key={id} i={idx(id)} />)}</div>
      <div className="absolute right-[18px] top-[58px] flex flex-col gap-3">{col('r').map(([id, C]) => <C key={id} i={idx(id)} />)}</div>
      {free.map(([id, C]) => <C key={id} i={idx(id)} />)}
    </div>
  );
}

export default memo(Widgets);
