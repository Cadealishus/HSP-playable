import { useEffect, useState } from 'react';
import { X, Monitor, Lock } from 'lucide-react';
import { useOS, metrics } from '../os/store';
import { useNow, fmtTime } from '../os/sim';
import { MenuList, AppIcon, HybridLogo, Kbd } from '../components/ui';

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

// ---------- Toast notifications ----------
export function Toasts() {
  const { state, actions } = useOS();
  const win = state.mode === 'windows';
  return (
    <div className={`absolute z-[8500] flex flex-col gap-2.5 w-[340px] pointer-events-none ${win ? 'right-3 bottom-[60px]' : 'right-3 top-[52px]'}`}>
      {state.toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto glass-strong rounded-[16px] p-3 pr-2 flex gap-3 a-toast" role="status">
          {t.app ? <AppIcon app={t.app} size={34} /> : <span className="grid place-items-center w-[34px] h-[34px] rounded-[10px] field"><HybridLogo size={20} /></span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold truncate">{t.title}</span>
              <span className="text-[10.5px] text-t3 pl-2">now</span>
            </div>
            {t.body && <div className="text-[12px] text-t2 leading-snug mt-0.5">{t.body}</div>}
          </div>
          <button aria-label="Dismiss" onClick={() => actions.dispatch({ type: 'untoast', id: t.id })} className="self-start w-6 h-6 grid place-items-center rounded-full text-t3 hov">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Mode switch banner + light sweep ----------
export function ModeSwitchFX() {
  const { state } = useOS();
  const b = state.modeBanner;
  return (
    <>
      {state.switching && (
        <div className="absolute inset-0 z-[9500] pointer-events-none overflow-hidden">
          <div className="absolute inset-y-[-20%] w-[35%]" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--acc) / .14), rgba(255,255,255,.18), rgb(var(--acc2) / .14), transparent)', animation: 'sweep calc(var(--anim) * 900ms) cubic-bezier(.5,0,.3,1) both', filter: 'blur(6px)' }} />
        </div>
      )}
      {b && (
        <div key={b.at} className="absolute left-1/2 top-1/2 z-[9600] pointer-events-none" style={{ animation: 'labelIn calc(max(var(--anim), .6) * 1700ms) cubic-bezier(.2,.8,.3,1) both' }}>
          <div className="glass-strong rounded-[22px] px-7 py-5 flex items-center gap-4" style={{ boxShadow: 'var(--shadow), 0 0 80px -10px rgb(var(--acc) / .55)' }}>
            {b.mode === 'hybrid' ? (
              <HybridLogo size={40} glow />
            ) : (
              <span className="grid place-items-center w-10 h-10">
                <WinLogo size={30} />
              </span>
            )}
            <div>
              <div className="font-display text-[20px] font-semibold tracking-[0.12em]">{b.mode === 'hybrid' ? 'HYBRID MODE' : 'WINDOWS DESKTOP'}</div>
              <div className="text-[12px] text-t2 mt-0.5 flex items-center gap-1.5">
                Switch back anytime with <Kbd>Ctrl</Kbd>
                <Kbd>Alt</Kbd>
                <Kbd>M</Kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="absolute inset-0 z-[10000] grid place-items-center" style={{ background: 'radial-gradient(60% 60% at 50% 45%, #0c1240, #02030a 70%)', animation: 'bootOut 380ms 1.1s ease-in both' }}>
      <div className="flex flex-col items-center gap-5">
        <div style={{ animation: 'breathe 2s ease-in-out infinite' }}>
          <HybridLogo size={64} glow />
        </div>
        <div className="font-display text-[15px] font-semibold tracking-[0.5em] text-[#dfe7ff] pl-[0.5em]">HYBRID OS</div>
        <div className="w-40 h-[2px] rounded-full overflow-hidden bg-white/10">
          <div className="h-full origin-left" style={{ background: 'linear-gradient(90deg, #5ef0ff, #9b6bff)', animation: 'bootBar 1s cubic-bezier(.4,0,.2,1) both' }} />
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
      style={{ backdropFilter: 'blur(26px) saturate(140%)', WebkitBackdropFilter: 'blur(26px) saturate(140%)', background: 'rgba(4,6,20,.35)', transition: 'opacity 380ms, transform 380ms', opacity: leaving ? 0 : 1, transform: leaving ? 'translateY(-30px)' : 'none' }}
      ref={(el) => el && el.focus()}
    >
      <div className="mt-[12vh] font-display font-extralight text-[110px] leading-none tracking-[-0.04em] text-white tabular-nums a-fade">{fmtTime(now).replace(/\s?[AP]M/i, '')}</div>
      <div className="mt-3 text-[18px] font-semibold text-white/80">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <div className="mt-auto mb-[12vh] flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full grid place-items-center text-[22px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #5ef0ff, #9b6bff)', boxShadow: '0 0 40px -6px rgba(94,240,255,.7)' }}>
          C
        </div>
        <div className="text-white font-bold">Cade</div>
        <div className="flex items-center gap-2 text-[12.5px] text-white/70">
          <Lock size={13} /> Click or press any key to unlock
        </div>
      </div>
    </div>
  );
}
