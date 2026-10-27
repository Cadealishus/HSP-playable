import { useRef, useState, useEffect, useCallback } from 'react';
import { AppWindow, X, EyeOff, Pin, Plus } from 'lucide-react';
import { useOS, iconRegistry, iconCenter } from '../os/store';
import { APPS, DOCK_APPS } from '../os/apps';
import { AppIcon } from '../components/ui';

const GAP = 6;
const SEP = 13;

export default function Dock() {
  const { state, actions } = useOS();
  const { size, mag, autoHide, position } = state.dock;
  const vertical = position !== 'bottom';
  const shell = useRef(null);
  const items = useRef([]);
  const raf = useRef(0);
  const [tip, setTip] = useState(null);
  const [bouncing, setBouncing] = useState({});
  const [reveal, setReveal] = useState(false);
  const hideTimer = useRef(0);

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

  const apply = useCallback(
    (pointer) => {
      const range = size * 2.8;
      const amt = (mag / 100) * 0.95;
      DOCK_APPS.forEach((id, i) => {
        const el = items.current[i];
        if (!el || id === '|') return;
        let s = 1;
        if (pointer != null && amt > 0) {
          const d = Math.abs(pointer - offsets[i]);
          if (d < range) s = 1 + amt * ((Math.cos((Math.PI * d) / range) + 1) / 2);
        }
        const px = size * s;
        if (vertical) el.style.height = `${px}px`;
        else el.style.width = `${px}px`;
        const icon = el.firstChild;
        const lift = (s - 1) * size * 0.14;
        icon.style.transform = vertical
          ? `translateX(${position === 'left' ? lift : -lift}px) scale(${s})`
          : `translateY(${-lift}px) scale(${s})`;
      });
    },
    [size, mag, vertical, position, offsets.join(',')]
  );

  const onMove = (e) => {
    const r = shell.current.getBoundingClientRect();
    const scale = r.width / shell.current.offsetWidth || 1;
    const pointer = vertical ? (e.clientY - (r.top + r.height / 2)) / scale : (e.clientX - (r.left + r.width / 2)) / scale;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => apply(pointer));
  };
  const onLeave = () => {
    cancelAnimationFrame(raf.current);
    apply(null);
    setTip(null);
    if (autoHide) {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setReveal(false), 500);
    }
  };
  useEffect(() => apply(null), [apply]);

  const running = (id) => state.windows.some((w) => w.app === id && w.phase !== 'closing') || (id === 'rocky' && state.rocky) || (id === 'launcher' && state.overlay === 'launcher');
  const focusedApp = state.windows.find((w) => w.id === state.focused && !w.min)?.app;

  const launch = (id, i) => {
    const meta = APPS[id];
    if (meta.kind === 'panel') return actions.set({ rocky: !state.rocky });
    if (meta.kind === 'launcher') return actions.toggleOverlay('launcher');
    if (!running(id)) {
      setBouncing((b) => ({ ...b, [id]: Date.now() }));
      setTimeout(() => setBouncing((b) => ({ ...b, [id]: 0 })), 720);
    }
    actions.activate(id, iconCenter(id));
  };

  const menuFor = (e, id) => {
    const meta = APPS[id];
    const wins = state.windows.filter((w) => w.app === id && w.phase !== 'closing');
    const items = [
      { header: meta.name },
      ...wins.map((w) => ({ label: w.title, icon: AppWindow, checked: w.id === state.focused, onClick: () => actions.focus(w.id) })),
      wins.length ? '-' : null,
      !meta.kind && !meta.single ? { label: 'New Window', icon: Plus, onClick: () => actions.open(id) } : null,
      !meta.kind && !wins.length ? { label: 'Open', onClick: () => launch(id) } : null,
      meta.kind === 'panel' ? { label: state.rocky ? 'Hide Rocky' : 'Open Rocky', onClick: () => actions.set({ rocky: !state.rocky }) } : null,
      { label: 'Keep in Dock', icon: Pin, checked: true, onClick: () => actions.notify({ title: 'Dock layout is fixed in this concept', body: 'Pinning and reordering are planned for the production shell.', app: id }) },
      wins.length ? { label: 'Hide', icon: EyeOff, onClick: () => wins.forEach((w) => actions.minimize(w.id)) } : null,
      wins.length ? { label: 'Quit', icon: X, onClick: () => actions.closeApp(id) } : null,
    ];
    actions.contextMenu(e, items);
  };

  const hidden = autoHide && !reveal;
  const posClass = position === 'bottom' ? 'left-1/2 bottom-[10px] -translate-x-1/2 chrome-bottom' : position === 'left' ? 'left-[10px] top-1/2 -translate-y-1/2 chrome-left' : 'right-[10px] top-1/2 -translate-y-1/2 chrome-right';
  const enter = position === 'bottom' ? 'a-slideup' : position === 'left' ? 'a-slideright' : 'a-slideleft';
  const hideTransform = position === 'bottom' ? `translateY(${size + 40}px)` : position === 'left' ? `translateX(${-(size + 40)}px)` : `translateX(${size + 40}px)`;

  return (
    <>
      {autoHide && (
        <div
          className="absolute z-[3500]"
          style={position === 'bottom' ? { left: 0, right: 0, bottom: 0, height: 6 } : position === 'left' ? { left: 0, top: 0, bottom: 0, width: 6 } : { right: 0, top: 0, bottom: 0, width: 6 }}
          onMouseEnter={() => {
            clearTimeout(hideTimer.current);
            setReveal(true);
          }}
        />
      )}
      <div className={`absolute z-[3600] chrome ${posClass}`}>
        <div className={enter}>
        <div
          className="dock-shell relative"
          style={{ transform: hidden ? hideTransform : 'none', opacity: hidden ? 0 : 1 }}
          onMouseEnter={() => clearTimeout(hideTimer.current)}
        >
          {/* neon floor reflection */}
          <div
            className="absolute pointer-events-none"
            style={
              vertical
                ? { top: '10%', bottom: '10%', [position === 'left' ? 'left' : 'right']: -14, width: 24, background: 'radial-gradient(50% 50% at 50% 50%, rgb(var(--acc) / .35), transparent)', filter: 'blur(10px)' }
                : { left: '8%', right: '8%', bottom: -16, height: 26, background: 'radial-gradient(50% 50% at 50% 50%, rgb(var(--acc) / .38), rgb(var(--acc2) / .12) 60%, transparent)', filter: 'blur(10px)' }
            }
          />
          <div
            ref={shell}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            className={`glass relative flex ${vertical ? 'flex-col py-2 px-[7px]' : 'px-2 pt-[7px] pb-[7px]'} rounded-[22px]`}
            style={{ gap: GAP, alignItems: vertical ? (position === 'left' ? 'flex-start' : 'flex-end') : 'flex-end' }}
          >
            <div
              className="absolute pointer-events-none rounded-[22px]"
              style={{ inset: -1, padding: 1, background: 'linear-gradient(120deg, rgb(var(--acc) / .55), transparent 30%, transparent 70%, rgb(var(--acc2) / .55))', WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }}
            />
            {DOCK_APPS.map((id, i) => {
              if (id === '|')
                return (
                  <div key={i} ref={(el) => (items.current[i] = el)} className="grid place-items-center" style={vertical ? { height: SEP, width: size } : { width: SEP, height: size }}>
                    <span className="block" style={vertical ? { height: 1, width: '70%', background: 'var(--line)' } : { width: 1, height: '70%', background: 'var(--line)' }} />
                  </div>
                );
              const meta = APPS[id];
              const isRunning = running(id);
              const isFocused = focusedApp === id;
              const wins = state.windows.filter((w) => w.app === id && w.phase !== 'closing').length;
              return (
                <div
                  key={id}
                  ref={(el) => (items.current[i] = el)}
                  className="dock-item relative flex"
                  style={{ width: size, height: size, justifyContent: 'center', alignItems: vertical ? 'center' : 'flex-end' }}
                  onMouseEnter={() => setTip(id)}
                  onMouseLeave={() => setTip((t) => (t === id ? null : t))}
                >
                  <button
                    ref={(el) => (iconRegistry[id] = el)}
                    aria-label={meta.name}
                    onClick={() => launch(id, i)}
                    onContextMenu={(e) => menuFor(e, id)}
                    className="dock-icon relative shrink-0"
                    style={{ width: size, height: size, transformOrigin: vertical ? (position === 'left' ? 'left center' : 'right center') : 'center bottom' }}
                  >
                    <div key={bouncing[id] || 0} className={bouncing[id] ? 'a-bounce' : ''}>
                      <AppIcon app={id} size={size} />
                    </div>
                  </button>
                  {/* running indicator */}
                  {isRunning && (
                    <span
                      className="absolute rounded-full"
                      style={{
                        ...(vertical
                          ? { [position === 'left' ? 'left' : 'right']: -6, top: '50%', width: 4, height: isFocused ? 14 : 4, transform: 'translateY(-50%)' }
                          : { bottom: -6, left: '50%', height: 4, width: isFocused ? 14 : 4, transform: 'translateX(-50%)' }),
                        background: isFocused ? 'rgb(var(--acc))' : 'var(--t2)',
                        boxShadow: isFocused ? '0 0 8px rgb(var(--acc))' : 'none',
                        transition: 'all calc(var(--anim)*220ms)',
                      }}
                    />
                  )}
                  {tip === id && (
                    <div
                      className="absolute pointer-events-none whitespace-nowrap glass-strong rounded-[9px] px-2.5 py-1 text-[12px] font-semibold a-pop z-10"
                      style={vertical ? { [position === 'left' ? 'left' : 'right']: size * (1 + (mag / 100) * 0.95) + 14, top: '50%', transform: 'translateY(-50%)' } : { bottom: size * (1 + (mag / 100) * 0.95) + 10, left: '50%', transform: 'translateX(-50%)' }}
                    >
                      {meta.name}
                      {wins > 1 && <span className="text-t3 font-medium"> · {wins} windows</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
