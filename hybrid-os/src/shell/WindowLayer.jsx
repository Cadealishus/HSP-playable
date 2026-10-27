import { useState, useEffect, useRef, memo } from 'react';
import { Minus, Square, X, Copy, Maximize2, Minimize2, Columns2 } from 'lucide-react';
import { useOS, toLocal, workArea, metrics } from '../os/store';
import { APPS } from '../os/apps';
import { AppIcon } from '../components/ui';
import Explorer from '../apps/Explorer';
import Terminal from '../apps/Terminal';
import Settings from '../apps/Settings';
import Browser from '../apps/Browser';
import Code from '../apps/Code';
import Discord from '../apps/Discord';
import Music from '../apps/Music';
import Blender from '../apps/Blender';
import About from '../apps/About';

const CONTENT = { explorer: Explorer, terminal: Terminal, settings: Settings, edge: Browser, vscode: Code, discord: Discord, spotify: Music, blender: Blender, about: About };

const AppBody = memo(function AppBody({ app, win, props }) {
  const C = CONTENT[app];
  return C ? <C win={win} {...props} /> : null;
});

const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSOR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

function resolveGeom(w, area, mode) {
  const gap = mode === 'windows' ? 0 : 6;
  if (w.max && mode !== 'windows') return { x: 0, y: 0, w: metrics.W, h: metrics.H };
  if (w.max) return { x: area.x + gap, y: area.y + gap, w: area.w - gap * 2, h: area.h - gap * 2 };
  if (w.snap === 'left') return { x: area.x + gap, y: area.y + gap, w: area.w / 2 - gap * 1.5, h: area.h - gap * 2 };
  if (w.snap === 'right') return { x: area.x + area.w / 2 + gap / 2, y: area.y + gap, w: area.w / 2 - gap * 1.5, h: area.h - gap * 2 };
  return { x: w.x, y: w.y, w: w.w, h: w.h };
}

function snapRect(side, area, mode) {
  return resolveGeom({ max: side === 'max', snap: side === 'max' ? null : side }, area, mode);
}

function Window({ win, area, focused, mode }) {
  const { actions } = useOS();
  const meta = APPS[win.app];
  const [live, setLive] = useState(null); // geometry while dragging / resizing
  const [preview, setPreview] = useState(null);
  const [geoAnim, setGeoAnim] = useState(false);
  const prevMax = useRef(win.max + ':' + win.snap);

  // Animate geometry only when max/snap state flips
  useEffect(() => {
    const k = win.max + ':' + win.snap;
    if (k !== prevMax.current) {
      prevMax.current = k;
      setGeoAnim(true);
      const t = setTimeout(() => setGeoAnim(false), 320);
      return () => clearTimeout(t);
    }
  }, [win.max, win.snap]);

  // Phase transitions are driven by CSS animation end, with a safety timer
  useEffect(() => {
    const next = { opening: 'idle', restoring: 'idle', closing: 'remove', minimizing: 'minimized' }[win.phase];
    if (!next) return;
    const t = setTimeout(() => actions.phase(win.id, next), 700);
    return () => clearTimeout(t);
  }, [win.phase]);
  const onAnimEnd = (e) => {
    if (e.target !== e.currentTarget) return;
    const next = { opening: 'idle', restoring: 'idle', closing: 'remove', minimizing: 'minimized' }[win.phase];
    if (next) actions.phase(win.id, next);
  };

  const g = live || resolveGeom(win, area, mode);
  const isMax = !live && win.max;
  const minW = (meta.min || [360, 240])[0];
  const minH = (meta.min || [360, 240])[1];

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    actions.focus(win.id);
    const start = toLocal(e.clientX, e.clientY);
    let base = { ...g };
    let moved = false;
    let snapSide = null;
    const move = (ev) => {
      const p = toLocal(ev.clientX, ev.clientY);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
      if (!moved && (win.max || win.snap)) {
        // Pull a maximized / snapped window back to its floating size under the cursor
        const ratio = (start.x - base.x) / base.w;
        base = { x: start.x - ratio * win.w, y: base.y, w: win.w, h: win.h };
      }
      moved = true;
      const nx = base.x + p.x - start.x;
      const ny = Math.max(area.y - (mode === 'windows' ? 0 : 4), base.y + p.y - start.y);
      setLive({ x: nx, y: ny, w: base.w, h: base.h });
      const edge = 8;
      snapSide = p.y <= area.y + edge ? 'max' : p.x <= edge ? 'left' : p.x >= metrics.W - edge ? 'right' : null;
      setPreview(snapSide ? snapRect(snapSide, area, mode) : null);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      const p = toLocal(ev.clientX, ev.clientY);
      const final = { x: Math.round(base.x + p.x - start.x), y: Math.round(Math.max(area.y, base.y + p.y - start.y)), w: base.w, h: base.h };
      final.y = Math.min(final.y, area.y + area.h - 40);
      actions.setGeom(win.id, final);
      if (snapSide) actions.snap(win.id, snapSide);
      setLive(null);
      setPreview(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (dir) => (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    actions.focus(win.id);
    const start = toLocal(e.clientX, e.clientY);
    const base = { ...g };
    const calc = (p) => {
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      let { x, y, w, h } = base;
      if (dir.includes('e')) w = Math.max(minW, base.w + dx);
      if (dir.includes('s')) h = Math.max(minH, base.h + dy);
      if (dir.includes('w')) {
        w = Math.max(minW, base.w - dx);
        x = base.x + base.w - w;
      }
      if (dir.includes('n')) {
        h = Math.max(minH, base.h - dy);
        y = Math.max(area.y, base.y + base.h - h);
        h = base.y + base.h - y;
      }
      return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    };
    const move = (ev) => setLive(calc(toLocal(ev.clientX, ev.clientY)));
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      actions.setGeom(win.id, calc(toLocal(ev.clientX, ev.clientY)));
      setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Minimize / restore fly toward the dock or taskbar button
  const target = win.target || { x: metrics.W / 2, y: metrics.H - 30 };
  const fly = { '--mx': `${target.x - (g.x + g.w / 2)}px`, '--my': `${target.y - (g.y + g.h / 2)}px` };
  const origin = win.origin && win.phase === 'opening' ? `${win.origin.x - g.x}px ${win.origin.y - g.y}px` : 'center';

  const isWin = mode === 'windows';
  const radius = isMax ? 0 : isWin ? 8 : 16;

  const titleMenu = (e) =>
    actions.contextMenu(e, [
      { label: win.max ? 'Restore' : 'Maximize', icon: win.max ? Minimize2 : Maximize2, onClick: () => actions.toggleMax(win.id) },
      { label: 'Minimize', icon: Minus, onClick: () => actions.minimize(win.id) },
      { label: 'Snap Left', icon: Columns2, onClick: () => actions.snap(win.id, 'left') },
      { label: 'Snap Right', icon: Columns2, onClick: () => actions.snap(win.id, 'right') },
      '-',
      { label: 'Close', icon: X, shortcut: isWin ? 'Alt+F4' : '', onClick: () => actions.close(win.id) },
    ]);

  if (win.min && win.phase !== 'restoring') return null;

  return (
    <>
      {preview && (
        <div
          className="absolute a-fade pointer-events-none"
          style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h, zIndex: win.z, borderRadius: isWin ? 8 : 16, background: 'rgb(var(--acc) / .12)', border: '1px solid rgb(var(--acc) / .5)', backdropFilter: 'blur(6px)', boxShadow: '0 0 40px -6px rgb(var(--acc) / .5)', transition: 'all 160ms' }}
        />
      )}
      <div
        role="dialog"
        aria-label={win.title}
        data-phase={win.phase}
        data-geo={geoAnim && !live ? 'anim' : undefined}
        onAnimationEnd={onAnimEnd}
        onPointerDownCapture={() => actions.focus(win.id)}
        className={`win absolute flex flex-col ${isWin ? 'glass-flat' : 'glass-strong'}`}
        style={{
          left: g.x,
          top: g.y,
          width: g.w,
          height: g.h,
          zIndex: win.z,
          borderRadius: radius,
          transformOrigin: win.phase === 'opening' ? origin : 'center',
          ...fly,
          border: isWin ? '1px solid var(--line)' : undefined,
          boxShadow: focused
            ? isWin
              ? '0 0 0 1px rgb(var(--acc) / .35), 0 26px 70px -12px rgba(0,0,0,.6)'
              : 'inset 0 1px 0 0 var(--hl), 0 0 0 1px rgb(var(--acc) / .22), 0 34px 90px -20px rgba(0,0,0,.7), 0 0 60px -18px rgb(var(--acc) / .35)'
            : isWin
              ? '0 12px 40px -10px rgba(0,0,0,.45)'
              : 'inset 0 1px 0 0 var(--hl), 0 20px 60px -20px rgba(0,0,0,.6)',
        }}
      >
        {/* Title bar */}
        {isWin ? (
          <div onPointerDown={startDrag} onDoubleClick={() => actions.toggleMax(win.id)} onContextMenu={titleMenu} className="flex items-center h-[34px] shrink-0 pl-3" style={{ opacity: focused ? 1 : 0.7 }}>
            <AppIcon app={win.app} size={16} />
            <span className="ml-2.5 text-[12px] truncate flex-1">{win.title}</span>
            {[
              ['min', Minus, () => actions.minimize(win.id)],
              ['max', win.max ? Copy : Square, () => actions.toggleMax(win.id)],
              ['close', X, () => actions.close(win.id)],
            ].map(([k, I, fn]) => (
              <button key={k} aria-label={k === 'min' ? 'Minimize' : k === 'max' ? 'Maximize' : 'Close'} onClick={fn} className={`h-full w-[46px] grid place-items-center ${k === 'close' ? 'hover:bg-[#c42b1c] hover:text-white' : 'hover:bg-[var(--hover)]'}`} style={{ borderTopRightRadius: k === 'close' ? radius : 0, transition: 'background 120ms' }}>
                <I size={k === 'max' ? 11 : 14} strokeWidth={1.5} className={k === 'max' && win.max ? 'scale-x-[-1]' : ''} />
              </button>
            ))}
          </div>
        ) : (
          <div onPointerDown={startDrag} onDoubleClick={() => actions.toggleMax(win.id)} onContextMenu={titleMenu} className="relative flex items-center h-[42px] shrink-0 px-3 gap-2.5">
            <AppIcon app={win.app} size={20} />
            <span className={`text-[12.5px] font-bold truncate flex-1 ${focused ? 'text-t1' : 'text-t3'}`}>{win.title}</span>
            <div className="flex items-center gap-1.5">
              <button aria-label="Minimize" onClick={() => actions.minimize(win.id)} className="w-[26px] h-[26px] grid place-items-center rounded-full text-t2 hov press field">
                <Minus size={13} />
              </button>
              <button aria-label={win.max ? 'Restore' : 'Maximize'} onClick={() => actions.toggleMax(win.id)} className="w-[26px] h-[26px] grid place-items-center rounded-full text-t2 hov press field">
                {win.max ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
              <button aria-label="Close" onClick={() => actions.close(win.id)} className="w-[26px] h-[26px] grid place-items-center rounded-full text-t2 press field hover:!bg-[#ff4d6a] hover:!text-white" style={{ transition: 'all 140ms' }}>
                <X size={13} />
              </button>
            </div>
            {focused && <div className="absolute inset-x-10 -bottom-px h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--acc) / .45), transparent)' }} />}
          </div>
        )}
        <div className="relative flex-1 min-h-0 overflow-hidden" style={{ borderBottomLeftRadius: radius, borderBottomRightRadius: radius }}>
          <AppBody app={win.app} win={win.id} props={win.props} />
        </div>
        {/* Resize handles */}
        {!win.max &&
          DIRS.map((d) => (
            <div
              key={d}
              onPointerDown={startResize(d)}
              className="absolute"
              style={{
                cursor: CURSOR[d],
                ...(d.includes('n') ? { top: -4, height: d.length === 2 ? 14 : 8 } : d.includes('s') ? { bottom: -4, height: d.length === 2 ? 14 : 8 } : { top: 10, bottom: 10 }),
                ...(d.includes('w') ? { left: -4, width: d.length === 2 ? 14 : 8 } : d.includes('e') ? { right: -4, width: d.length === 2 ? 14 : 8 } : { left: 10, right: 10 }),
              }}
            />
          ))}
      </div>
    </>
  );
}

export default function WindowLayer() {
  const { state } = useOS();
  const area = workArea(state);
  return (
    <div className="absolute inset-0 pointer-events-none win-layer z-[10]">
      <div className="pointer-events-auto">
        {state.windows.map((w) => (
          <Window key={w.id} win={w} area={area} focused={state.focused === w.id} mode={state.mode} />
        ))}
      </div>
    </div>
  );
}
