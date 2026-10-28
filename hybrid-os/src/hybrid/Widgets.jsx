import { useRef, useState, useEffect, memo } from 'react';
import { Moon, CloudMoon, Cloud, CloudRain, Sun, Play, Pause, SkipBack, SkipForward, Heart, ChevronRight, Check, ArrowDown } from 'lucide-react';
import { useOS, toLocal, MENUBAR_H } from '../os/store';
import { useNow, usePerf, useMusic, fmtDur } from '../os/sim';
import { WEATHER, PROJECTS } from '../os/data';
import { Sparkline, Meter, DemoBadge, IconButton } from '../components/ui';

// Desktop grid: 24px outer margin, 12px gutter, 288px columns.
// Left column is anchored to the top; right column to the bottom, so the centre and the
// upper right of the wallpaper (the planet) stay clear.
const COL_W = 288;
const MARGIN = 24;
const GUTTER = 12;
const COLUMN = { clock: 'l', weather: 'l', system: 'l', notes: 'l', music: 'r', projects: 'r' };

function Frame({ id, index, children, title, meta, pad = 'p-4' }) {
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
      return { x: Math.round(box.x + p.x - start.x), y: Math.round(Math.max(MENUBAR_H + 8, box.y + p.y - start.y)) };
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
    <div ref={el} className={floating ? 'absolute pointer-events-auto' : 'relative pointer-events-auto'} style={{ ...(floating ? { left: floating.x, top: floating.y, zIndex: drag ? 40 : 3 } : null), width: COL_W }}>
      <section
        onPointerDown={onDown}
        data-dragging={!!drag}
        aria-label={title || id}
        className={`widget glass rounded-[var(--r-lg)] ${pad} a-widget`}
        style={{ animationDelay: `calc(var(--anim) * ${index * 40}ms)`, opacity: state.focus ? 0.4 : 1 }}
      >
        {title && (
          <header className="flex items-center justify-between h-5 mb-3">
            <h2 className="text-[12px] font-medium text-t2">{title}</h2>
            {meta}
          </header>
        )}
        {children}
      </section>
    </div>
  );
}

function ClockWidget({ i }) {
  const now = useNow(1000);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const [hm, ampm] = time.split(/\s(?=[AP]M$)/i);
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  return (
    <Frame id="clock" index={i} pad="px-5 pt-4 pb-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[56px] font-light leading-[1] tracking-[-0.03em] tnum">{hm}</span>
        {ampm && <span className="text-[15px] font-medium text-t2">{ampm}</span>}
      </div>
      <div className="mt-2 text-[13px] text-t2">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <div className="mt-3 grid grid-cols-7 text-center" role="list" aria-label="This week">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => {
          const date = new Date(monday);
          date.setDate(monday.getDate() + k);
          const today = k === dow;
          return (
            <div key={k} role="listitem" aria-current={today ? 'date' : undefined} className="flex flex-col items-center gap-1">
              <span className={`text-[11px] ${today ? 'text-t1 font-medium' : 'text-t3'}`}>{d}</span>
              <span className="grid place-items-center w-7 h-7 rounded-full text-[13px] tnum" style={today ? { background: 'rgb(var(--acc))', color: 'var(--on-acc)', fontWeight: 600 } : { color: k > 4 ? 'var(--t2)' : 'var(--t1)' }}>
                {date.getDate()}
              </span>
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
    <Frame id="weather" index={i} title={WEATHER.city} meta={<DemoBadge />}>
      <div className="flex items-center gap-3">
        <span className="text-[40px] font-light leading-none tracking-[-0.02em] tnum">{WEATHER.temp}°</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px]">{WEATHER.cond}</div>
          <div className="text-[12px] text-t2 tnum">
            H {WEATHER.hi}° · L {WEATHER.lo}°
          </div>
        </div>
        <Moon size={26} strokeWidth={1.5} className="text-t2" />
      </div>
      <div className="mt-3 pt-3 grid grid-cols-5" style={{ borderTop: '1px solid var(--line)' }}>
        {WEATHER.hours.map((h) => {
          const I = WICON[h.icon];
          return (
            <div key={h.t} className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-t3">{h.t}</span>
              <span className="flex items-center gap-1 text-[12px] tnum">
                <I size={14} strokeWidth={1.75} className="text-t2" />
                {h.v}°
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

const level = (v) => (v > 90 ? 'rgb(var(--bad))' : v > 75 ? 'rgb(var(--warn))' : 'rgb(var(--acc))');

function SystemWidget({ i }) {
  const p = usePerf();
  const row = (k, value, bar) => (
    <div key={k} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 h-4">
      <span className="text-[12px] text-t2">{k}</span>
      {bar || <span />}
      <span className="text-[12px] text-right tnum">{value}</span>
    </div>
  );
  return (
    <Frame id="system" index={i} title="System" meta={<DemoBadge>Simulated</DemoBadge>}>
      <div className="flex items-end justify-between h-9">
        <div className="flex items-baseline gap-2">
          <span className="text-[28px] font-light leading-none tnum">
            {Math.round(p.cpu)}
            <span className="text-[15px] text-t2">%</span>
          </span>
          <span className="text-[12px] text-t2">CPU</span>
        </div>
        <Sparkline data={p.hist.cpu} w={140} h={32} color={level(p.cpu)} />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {row('GPU', `${Math.round(p.gpu)}%`, <Meter value={p.gpu} color={level(p.gpu)} />)}
        {row('Memory', `${p.ram.toFixed(1)} / 32 GB`, <Meter value={p.ram} max={32} color={level((p.ram / 32) * 100)} />)}
        {row('Network', <span className="inline-flex items-center gap-0.5"><ArrowDown size={11} className="text-t3" />{p.netDown.toFixed(0)} Mb/s</span>)}
        {row('Temp', `CPU ${Math.round(p.cpuTemp)}° · GPU ${Math.round(p.gpuTemp)}°`)}
      </div>
    </Frame>
  );
}

export function AlbumArt({ track, size = 56 }) {
  const [a, b, c] = track.art;
  return (
    <div className="relative shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: Math.max(6, size * 0.14), background: `radial-gradient(120% 120% at 20% 10%, ${a}, ${b} 45%, ${c})`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08), 0 2px 8px -2px rgba(0,0,0,.4)' }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <circle cx="28" cy="27" r="9" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="0.8" />
        <circle cx="28" cy="27" r="5" fill="rgba(255,255,255,.16)" />
        <path d="M0 30 L10 20 L17 26 L26 14 L40 30 L40 40 L0 40Z" fill="rgba(0,0,20,.35)" />
      </svg>
    </div>
  );
}

function MusicWidget({ i }) {
  const m = useMusic();
  const t = m.track;
  const seek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    m.seek(Math.floor(((e.clientX - r.left) / r.width) * t.dur));
  };
  return (
    <Frame id="music" index={i} title="Now playing" meta={<span className="text-[11px] text-t3">Spotify</span>}>
      <div className="flex items-center gap-3">
        <AlbumArt track={t} size={48} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{t.title}</div>
          <div className="text-[12px] text-t2 truncate">{t.artist}</div>
        </div>
        <IconButton label={m.liked[m.i] ? 'Remove from Liked Songs' : 'Add to Liked Songs'} onClick={() => m.like(m.i)} side="top">
          <Heart size={15} strokeWidth={1.75} className={m.liked[m.i] ? 'text-acc' : ''} fill={m.liked[m.i] ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
      <div className="mt-3" data-nodrag>
        <div
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={t.dur}
          aria-valuenow={m.pos}
          aria-valuetext={fmtDur(m.pos)}
          tabIndex={0}
          onClick={seek}
          onKeyDown={(e) => (e.key === 'ArrowRight' ? m.seek(Math.min(t.dur - 1, m.pos + 5)) : e.key === 'ArrowLeft' ? m.seek(Math.max(0, m.pos - 5)) : null)}
          className="py-1.5 cursor-pointer outline-none rounded-full focus-visible:ring-2 focus-visible:ring-[rgb(var(--acc))]"
        >
          <div className="h-[3px] rounded-full" style={{ background: 'var(--field)' }}>
            <div className="h-full rounded-full" style={{ width: `${(m.pos / t.dur) * 100}%`, background: 'var(--t1)', transition: m.playing ? 'width 1s linear' : 'none' }} />
          </div>
        </div>
        <div className="flex justify-between text-[11px] text-t3 tnum">
          <span>{fmtDur(m.pos)}</span>
          <span>−{fmtDur(t.dur - m.pos)}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5">
        <IconButton label="Previous" onClick={m.prev} side="top" size={32}>
          <SkipBack size={16} fill="currentColor" strokeWidth={1.5} />
        </IconButton>
        <button aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.toggle} className="w-9 h-9 grid place-items-center rounded-full press" style={{ background: 'var(--t1)', color: 'rgb(var(--surface))' }}>
          {m.playing ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} className="ml-0.5" />}
        </button>
        <IconButton label="Next" onClick={m.next} side="top" size={32}>
          <SkipForward size={16} fill="currentColor" strokeWidth={1.5} />
        </IconButton>
      </div>
    </Frame>
  );
}

function NotesWidget({ i }) {
  const { state, actions } = useOS();
  const [saved, setSaved] = useState(true);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved(false);
    const t = setTimeout(() => setSaved(true), 450);
    return () => clearTimeout(t);
  }, [state.notes]);
  return (
    <Frame
      id="notes"
      index={i}
      title="Notes"
      meta={
        <span className="flex items-center gap-1 text-[11px] text-t3" aria-live="polite">
          {saved ? (
            <>
              <Check size={11} /> Saved
            </>
          ) : (
            'Saving…'
          )}
        </span>
      }
    >
      <textarea
        id="quick-notes"
        aria-label="Notes"
        value={state.notes}
        onChange={(e) => actions.set({ notes: e.target.value })}
        spellCheck={false}
        rows={4}
        className="block w-full resize-none bg-transparent text-[13px] leading-[1.6] text-t1 outline-none placeholder:text-t3 cursor-text"
        placeholder="Write something…"
      />
    </Frame>
  );
}

function ProjectsWidget({ i }) {
  const { state, actions } = useOS();
  const open = new Set(state.windows.filter((w) => w.app === 'vscode' && w.phase !== 'closing').map((w) => w.props.project));
  return (
    <Frame id="projects" index={i} title="Recent projects" pad="px-2 pt-4 pb-2">
      <ul className="flex flex-col -mt-1">
        {PROJECTS.map((p) => {
          const isOpen = open.has(p.id);
          return (
            <li key={p.id}>
              <button
                onClick={() => actions.open('vscode', { title: `${p.name} — Visual Studio Code`, props: { project: p.id } })}
                className="group w-full flex items-center gap-3 h-12 px-2 rounded-[var(--r-sm)] text-left hov"
                aria-label={`Open ${p.name} in VS Code`}
              >
                <span className="grid place-items-center w-8 h-8 rounded-[var(--r-sm)] text-[12px] font-semibold shrink-0" style={{ background: `color-mix(in srgb, ${p.color} 16%, transparent)`, color: `color-mix(in srgb, ${p.color} 55%, var(--t1))` }}>
                  {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate">{p.name}</span>
                  <span className="block text-[12px] text-t3 truncate">
                    {p.branch} · {p.when}
                  </span>
                </span>
                {isOpen ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-acc pr-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-acc" /> Open
                  </span>
                ) : (
                  <ChevronRight size={15} className="text-t3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 mr-1" style={{ transition: 'opacity var(--d-fast)' }} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Frame>
  );
}

const LIST = [
  ['clock', ClockWidget],
  ['weather', WeatherWidget],
  ['system', SystemWidget],
  ['notes', NotesWidget],
  ['music', MusicWidget],
  ['projects', ProjectsWidget],
];

export const WIDGET_NAMES = { clock: 'Clock and calendar', weather: 'Weather', system: 'System monitor', music: 'Now playing', notes: 'Notes', projects: 'Recent projects' };

function Widgets() {
  const { state } = useOS();
  if (!state.showWidgets) return null;
  const d = state.dock;
  // Keep the bottom edge clear of a pinned dock
  const bottom = d.autoHide || d.position !== 'bottom' ? MARGIN : d.size + 28 + 12;
  const left = MARGIN + (!d.autoHide && d.position === 'left' ? d.size + 28 : 0);
  const right = MARGIN + (!d.autoHide && d.position === 'right' ? d.size + 28 : 0);
  const on = LIST.filter(([id]) => state.widgets[id]);
  const col = (side) => on.filter(([id]) => COLUMN[id] === side && !state.widgetPos[id]);
  const free = on.filter(([id]) => state.widgetPos[id]);
  const idx = (id) => on.findIndex(([x]) => x === id);
  return (
    <div className="absolute inset-0 pointer-events-none chrome chrome-fade z-[1]">
      <div className="absolute flex flex-col flex-wrap content-start" style={{ left, top: MENUBAR_H + 16, bottom, gap: GUTTER }}>
        {col('l').map(([id, C]) => (
          <C key={id} i={idx(id)} />
        ))}
      </div>
      <div className="absolute flex flex-col" style={{ right, bottom, gap: GUTTER }}>
        {col('r').map(([id, C]) => (
          <C key={id} i={idx(id)} />
        ))}
      </div>
      {free.map(([id, C]) => (
        <C key={id} i={idx(id)} />
      ))}
    </div>
  );
}

export default memo(Widgets);
