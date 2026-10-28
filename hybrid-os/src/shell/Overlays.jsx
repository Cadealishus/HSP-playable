import { useEffect, useState, useRef } from 'react';
import { X, Lock } from 'lucide-react';
import { useOS, metrics } from '../os/store';
import { useNow, fmtTime } from '../os/sim';
import { MenuList, AppIcon, HybridLogo, Kbd, IconButton } from '../components/ui';

// ---------- Context menu ----------
export function ContextMenuLayer() {
  const { state, actions } = useOS();
  const ctx = state.ctx;
  useEffect(() => {
    if (!ctx) return;
    const k = (e) => e.key === 'Escape' && actions.set({ ctx: null });
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ctx]);
  if (!ctx) return null;
  const close = () => actions.set({ ctx: null });
  const x = Math.min(ctx.x, metrics.W - 250);
  const rows = ctx.items.filter(Boolean).length;
  const y = Math.min(ctx.y, metrics.H - rows * 31 - 20);
  return (
    <div
      className="absolute inset-0 z-[9000]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="absolute" style={{ left: x, top: Math.max(8, y) }}>
        <MenuList items={ctx.items} onClose={close} flip={x > metrics.W - 500} />
      </div>
    </div>
  );
}

// ---------- Notifications ----------
// Top right under the bar in HYBRID, above the tray in Windows. They never cover the bar itself.
export function Toasts() {
  const { state, actions } = useOS();
  const win = state.mode === 'windows';
  return (
    <div className={`absolute z-[8500] flex flex-col gap-2 w-[340px] pointer-events-none ${win ? 'right-3 bottom-[60px]' : 'right-3 top-[44px]'}`} aria-live="polite">
      {state.toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto glass-strong rounded-[var(--r-lg)] p-3 flex gap-3 a-toast" role="status">
          {t.app ? (
            <AppIcon app={t.app} size={32} />
          ) : (
            <span className="grid place-items-center w-8 h-8 rounded-[var(--r-sm)] shrink-0" style={{ background: 'linear-gradient(180deg, var(--icon-top), var(--icon-bot))', boxShadow: 'inset 0 0 0 1px var(--icon-edge)' }}>
              <HybridLogo size={18} />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{t.title}</div>
            {t.body && <div className="text-[12px] text-t2 leading-[1.45] mt-0.5">{t.body}</div>}
          </div>
          <IconButton label="Dismiss" tip={false} size={24} onClick={() => actions.dispatch({ type: 'untoast', id: t.id })} className="-mr-1 -mt-1">
            <X size={14} strokeWidth={1.75} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

// ---------- Mode switch label ----------
export function ModeSwitchFX() {
  const { state } = useOS();
  const b = state.modeBanner;
  if (!b) return null;
  return (
    <div key={b.at} className="absolute left-1/2 top-1/2 z-[9600] pointer-events-none" style={{ animation: 'labelIn calc(max(var(--anim), .6) * 1500ms) var(--ease-out) both' }} role="status">
      <div className="glass-strong rounded-[var(--r-xl)] px-6 py-4 flex items-center gap-4">
        {b.mode === 'hybrid' ? <HybridLogo size={32} /> : <WinLogo size={26} />}
        <div>
          <div className="text-[15px] font-semibold">{b.mode === 'hybrid' ? 'HYBRID desktop' : 'Windows desktop'}</div>
          <div className="text-[12px] text-t2 mt-1 flex items-center gap-1">
            Switch back with <Kbd>Ctrl</Kbd>
            <Kbd>Alt</Kbd>
            <Kbd>M</Kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WinLogo({ size = 20, color }) {
  const s = size / 2 - 1;
  const fill = color || 'url(#wl)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <linearGradient id="wl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5fd3ff" />
          <stop offset="1" stopColor="#1572e8" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={s} height={s} rx="1" fill={fill} />
      <rect x={s + 2} y="0" width={s} height={s} rx="1" fill={fill} />
      <rect x="0" y={s + 2} width={s} height={s} rx="1" fill={fill} />
      <rect x={s + 2} y={s + 2} width={s} height={s} rx="1" fill={fill} />
    </svg>
  );
}

// ---------- Boot ----------
export function Boot({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="absolute inset-0 z-[10000] grid place-items-center" style={{ background: '#05060d', animation: 'bootOut 280ms 720ms ease-in both' }}>
      <div className="flex flex-col items-center gap-6">
        <HybridLogo size={48} />
        <div className="w-32 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.1)' }}>
          <div className="h-full origin-left" style={{ background: '#e9edf7', animation: 'bootBar 700ms cubic-bezier(.4,0,.2,1) both' }} />
        </div>
      </div>
    </div>
  );
}

// ---------- Lock screen ----------
export function LockScreen() {
  const { state, actions } = useOS();
  const now = useNow(1000);
  const [leaving, setLeaving] = useState(false);
  const lockRef = useRef(null);
  useEffect(() => {
    if (state.overlay === 'lock') lockRef.current?.focus();
  }, [state.overlay]);
  if (state.overlay !== 'lock') return null;
  const unlock = () => {
    setLeaving(true);
    setTimeout(() => {
      actions.set({ overlay: null });
      setLeaving(false);
    }, 380);
  };
  return (
    <div
      onClick={unlock}
      onKeyDown={unlock}
      tabIndex={0}
      className="absolute inset-0 z-[9800] flex flex-col items-center cursor-pointer outline-none"
      style={{ backdropFilter: 'blur(28px) saturate(110%)', WebkitBackdropFilter: 'blur(28px) saturate(110%)', background: 'rgba(5,6,13,.35)', transition: 'opacity var(--d-slow) var(--ease-in), transform var(--d-slow) var(--ease-in)', opacity: leaving ? 0 : 1, transform: leaving ? 'translateY(-16px)' : 'none' }}
      ref={lockRef}
    >
      <div className="mt-[12vh] font-light text-[112px] leading-none tracking-[-0.04em] text-white tnum a-fade">{fmtTime(now).replace(/\s?[AP]M/i, '')}</div>
      <div className="mt-4 text-[20px] font-medium text-white/80">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <div className="mt-auto mb-[12vh] flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full grid place-items-center text-[20px] font-medium text-white" style={{ background: 'linear-gradient(135deg, #4aa6d6, #6b5bd6)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' }}>
          C
        </div>
        <div className="text-white font-semibold">Cade</div>
        <div className="flex items-center gap-2 text-[13px] text-white/70">
          <Lock size={13} /> Click or press any key to unlock
        </div>
      </div>
    </div>
  );
}
