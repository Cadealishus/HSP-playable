import { useRef, useState, useEffect } from 'react';
import { AppWindow, X, EyeOff, Plus } from 'lucide-react';
import { useOS, iconRegistry, iconCenter, fullscreenWindow } from '../os/store';
import { APPS, DOCK_APPS } from '../os/apps';
import { prefersReducedMotion } from '../os/themes';
import { AppIcon } from '../components/ui';

const GAP = 8;
const SEP = 17; // 1px rule with 8px either side
const RANGE = 2.6; // magnification reach, in icon widths
const SPREAD = 0.45; // share of the magnified size that pushes neighbours aside

export default function Dock() {
  const { state, actions } = useOS();
  const { size, mag, position } = state.dock;
  // A full-screen window always gets the whole screen; the dock waits at the edge.
  const autoHide = state.dock.autoHide || !!fullscreenWindow(state);
  const vertical = position !== 'bottom';
  const amt = state.motion === 0 || prefersReducedMotion() ? 0 : (mag / 100) * 0.9; // peak extra scale
  const shell = useRef(null);
  const items = useRef([]);
  const tipEl = useRef(null);
  const [tip, setTip] = useState(null);
  const warm = useRef(false);
  const tipTimer = useRef(0);
  const [launching, setLaunching] = useState({});
  const [reveal, setReveal] = useState(false);
  const hideTimer = useRef(0);
  const dwellTimer = useRef(0);

  // Base (unmagnified) centres along the dock axis, measured from the dock's centre.
  const offsets = [];
  {
    const widths = DOCK_APPS.map((id) => (id === '|' ? SEP : size));
    const total = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
    let p = -total / 2;
    widths.forEach((wd) => {
      offsets.push(p + wd / 2);
      p += wd + GAP;
    });
  }

  // Spring-driven magnification: targets follow the pointer, scales ease toward them every frame,
  // so reversing direction mid-motion never jumps.
  const sim = useRef({ pointer: null, cur: DOCK_APPS.map(() => 1), raf: 0 });
  const params = useRef();
  params.current = { size, amt, vertical, position, offsets };
  useEffect(() => {
    const S = sim.current;
    return () => cancelAnimationFrame(S.raf);
  }, []);
  const kick = () => {
    const S = sim.current;
    if (S.raf) return;
    const step = () => {
      const { size, amt, vertical, position, offsets } = params.current;
      let moving = false;
      DOCK_APPS.forEach((id, i) => {
        const el = items.current[i];
        if (!el || id === '|') return;
        let target = 1;
        if (S.pointer != null && amt > 0) {
          const d = Math.abs(S.pointer - offsets[i]);
          const r = size * RANGE;
          if (d < r) target = 1 + amt * ((Math.cos((Math.PI * d) / r) + 1) / 2);
        }
        const c = S.cur[i] + (target - S.cur[i]) * 0.28;
        S.cur[i] = Math.abs(target - c) < 0.0015 ? target : c;
        if (S.cur[i] !== target) moving = true;
        const s = S.cur[i];
        const px = size * (1 + (s - 1) * SPREAD);
        if (vertical) el.style.height = `${px}px`;
        else el.style.width = `${px}px`;
        const lift = (s - 1) * size * 0.12;
        el.firstChild.style.transform = vertical ? `translateX(${position === 'left' ? lift : -lift}px) scale(${s})` : `translateY(${-lift}px) scale(${s})`;
      });
      // keep the tooltip over its icon while sizes settle
      if (tipEl.current && S.tipIndex != null) {
        const el = items.current[S.tipIndex];
        if (el) {
          if (vertical) tipEl.current.style.top = `${el.offsetTop + el.offsetHeight / 2}px`;
          else tipEl.current.style.left = `${el.offsetLeft + el.offsetWidth / 2}px`;
        }
      }
      S.raf = moving ? requestAnimationFrame(step) : 0;
    };
    S.raf = requestAnimationFrame(step);
  };

  const onMove = (e) => {
    const r = shell.current.getBoundingClientRect();
    const scale = r.width / shell.current.offsetWidth || 1;
    sim.current.pointer = vertical ? (e.clientY - (r.top + r.height / 2)) / scale : (e.clientX - (r.left + r.width / 2)) / scale;
    kick();
  };
  const onLeave = () => {
    sim.current.pointer = null;
    kick();
    hideTip();
    if (autoHide) {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setReveal(false), 500);
    }
  };
  useEffect(() => {
    kick();
  }, [size, amt, vertical]);

  // Tooltips: the first one waits briefly; moving along the dock then switches instantly.
  const showTip = (id, i) => {
    clearTimeout(tipTimer.current);
    sim.current.tipIndex = i;
    if (warm.current) return setTip(id);
    tipTimer.current = setTimeout(() => {
      warm.current = true;
      setTip(id);
      kick();
    }, 380);
  };
  const hideTip = () => {
    clearTimeout(tipTimer.current);
    setTip(null);
    tipTimer.current = setTimeout(() => (warm.current = false), 250);
  };

  const running = (id) => state.windows.some((w) => w.app === id && w.phase !== 'closing') || (id === 'rocky' && state.rocky) || (id === 'launcher' && state.overlay === 'launcher');
  const focusedApp = state.windows.find((w) => w.id === state.focused && !w.min)?.app;

  const launch = (id) => {
    const meta = APPS[id];
    if (meta.kind === 'panel') return actions.set({ rocky: !state.rocky });
    if (meta.kind === 'launcher') return actions.toggleOverlay('launcher');
    if (!running(id)) {
      const k = Date.now();
      setLaunching((b) => ({ ...b, [id]: k }));
      setTimeout(() => setLaunching((b) => (b[id] === k ? { ...b, [id]: 0 } : b)), 450);
    }
    actions.activate(id, iconCenter(id));
  };

  const menuFor = (e, id) => {
    hideTip();
    const meta = APPS[id];
    const wins = state.windows.filter((w) => w.app === id && w.phase !== 'closing');
    actions.contextMenu(e, [
      { header: meta.name },
      ...wins.map((w) => ({ label: w.title, icon: AppWindow, checked: w.id === state.focused, onClick: () => actions.focus(w.id) })),
      wins.length ? '-' : null,
      !meta.kind && !meta.single ? { label: 'New Window', icon: Plus, onClick: () => actions.open(id) } : null,
      !meta.kind && !wins.length ? { label: 'Open', onClick: () => launch(id) } : null,
      meta.kind === 'panel' ? { label: state.rocky ? 'Hide Rocky' : 'Open Rocky', onClick: () => actions.set({ rocky: !state.rocky }) } : null,
      meta.kind === 'launcher' ? { label: 'Open Launcher', onClick: () => actions.set({ overlay: 'launcher' }) } : null,
      wins.length ? { label: 'Hide', icon: EyeOff, onClick: () => wins.forEach((w) => actions.minimize(w.id)) } : null,
      wins.length ? { label: 'Quit', icon: X, onClick: () => actions.closeApp(id) } : null,
    ]);
  };

  const hidden = autoHide && !reveal;
  const posClass = position === 'bottom' ? 'left-1/2 bottom-2 -translate-x-1/2 chrome-bottom' : position === 'left' ? 'left-2 top-1/2 -translate-y-1/2 chrome-left' : 'right-2 top-1/2 -translate-y-1/2 chrome-right';
  const enter = position === 'bottom' ? 'a-slideup' : position === 'left' ? 'a-slideright' : 'a-slideleft';
  const hideTransform = position === 'bottom' ? `translateY(${size + 32}px)` : position === 'left' ? `translateX(${-(size + 32)}px)` : `translateX(${size + 32}px)`;
  const peak = size * (1 + amt);

  return (
    <>
      {autoHide && (
        // Edge strip: the dock only appears after the pointer rests here briefly, so passing by doesn't trigger it
        <div
          className="absolute z-[3500]"
          style={position === 'bottom' ? { left: 0, right: 0, bottom: 0, height: 5 } : position === 'left' ? { left: 0, top: 0, bottom: 0, width: 5 } : { right: 0, top: 0, bottom: 0, width: 5 }}
          onMouseEnter={() => {
            clearTimeout(hideTimer.current);
            clearTimeout(dwellTimer.current);
            dwellTimer.current = setTimeout(() => setReveal(true), 260);
          }}
          onMouseLeave={() => clearTimeout(dwellTimer.current)}
        >
          {hidden && (
            <span
              className="absolute pointer-events-none rounded-full a-fade"
              style={{ ...(position === 'bottom' ? { left: '50%', bottom: 3, width: 96, height: 4, transform: 'translateX(-50%)' } : { top: '50%', [position]: 3, width: 4, height: 96, transform: 'translateY(-50%)' }), background: 'var(--t2)', opacity: 0.35 }}
            />
          )}
        </div>
      )}
      <div className={`absolute z-[3600] chrome ${posClass}`}>
        <div className={enter}>
          <div className="dock-shell relative" style={{ transform: hidden ? hideTransform : 'none', opacity: hidden ? 0 : 1, pointerEvents: hidden ? 'none' : undefined }} onMouseEnter={() => clearTimeout(hideTimer.current)}>
            <div
              ref={shell}
              role="toolbar"
              aria-label="Dock"
              aria-orientation={vertical ? 'vertical' : 'horizontal'}
              onMouseMove={onMove}
              onMouseLeave={onLeave}
              className={`glass relative flex ${vertical ? 'flex-col' : ''} rounded-[var(--r-xl)] p-2`}
              style={{ gap: GAP, alignItems: vertical ? (position === 'left' ? 'flex-start' : 'flex-end') : 'flex-end', boxShadow: 'inset 0 1px 0 0 var(--hl), var(--shadow-lg)' }}
            >
              {DOCK_APPS.map((id, i) => {
                if (id === '|')
                  return (
                    <div key={i} ref={(el) => (items.current[i] = el)} role="separator" className="grid place-items-center shrink-0" style={vertical ? { height: SEP, width: size } : { width: SEP, height: size }}>
                      <span className="block" style={vertical ? { height: 1, width: '60%', background: 'var(--line)' } : { width: 1, height: '60%', background: 'var(--line)' }} />
                    </div>
                  );
                const meta = APPS[id];
                const isRunning = running(id);
                const isFocused = focusedApp === id;
                return (
                  <div
                    key={id}
                    ref={(el) => (items.current[i] = el)}
                    className="relative flex shrink-0"
                    style={{ width: size, height: size, justifyContent: 'center', alignItems: vertical ? 'center' : 'flex-end' }}
                    onMouseEnter={() => showTip(id, i)}
                  >
                    <button
                      ref={(el) => (iconRegistry[id] = el)}
                      aria-label={meta.name}
                      aria-pressed={isRunning}
                      onClick={() => launch(id)}
                      onFocus={() => showTip(id, i)}
                      onBlur={hideTip}
                      onContextMenu={(e) => menuFor(e, id)}
                      className="relative shrink-0 rounded-[12px]"
                      style={{ width: size, height: size, transformOrigin: vertical ? (position === 'left' ? 'left center' : 'right center') : 'center bottom', willChange: 'transform' }}
                    >
                      <div key={launching[id] || 0} className={launching[id] ? 'a-launch' : ''}>
                        <AppIcon app={id} size={size} />
                      </div>
                    </button>
                    {isRunning && (
                      <span
                        aria-hidden="true"
                        className="absolute rounded-full"
                        style={{
                          ...(vertical ? { [position === 'left' ? 'left' : 'right']: -6, top: '50%', marginTop: -2 } : { bottom: -6, left: '50%', marginLeft: -2 }),
                          width: 4,
                          height: 4,
                          background: isFocused ? 'rgb(var(--acc))' : 'var(--t2)',
                          transition: 'background var(--d-base) var(--ease-out)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {tip && (
                <div
                  ref={tipEl}
                  role="tooltip"
                  className="absolute pointer-events-none whitespace-nowrap rounded-[var(--r-xs)] px-2 py-1 text-[12px] font-medium a-fade"
                  style={{
                    background: 'rgb(var(--surface) / .94)',
                    border: '1px solid var(--line)',
                    boxShadow: 'var(--shadow)',
                    ...(vertical
                      ? { [position === 'left' ? 'left' : 'right']: peak + 24, top: items.current[sim.current.tipIndex]?.offsetTop + size / 2, transform: 'translateY(-50%)' }
                      : { bottom: peak + 22, left: (items.current[sim.current.tipIndex]?.offsetLeft || 0) + size / 2, transform: 'translateX(-50%)' }),
                  }}
                >
                  {APPS[tip].name}
                  {state.windows.filter((w) => w.app === tip && w.phase !== 'closing').length > 1 && <span className="text-t3"> · {state.windows.filter((w) => w.app === tip && w.phase !== 'closing').length} windows</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
