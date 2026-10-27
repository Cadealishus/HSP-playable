import { useState, useId } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { APPS } from '../os/apps';

// ---------- Brand marks ----------
export function HybridLogo({ size = 18, glow = false }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={glow ? { filter: 'drop-shadow(0 0 6px rgba(94,240,255,.6))' } : undefined}>
      <defs>
        <linearGradient id={`hg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ef0ff" />
          <stop offset="1" stopColor="#9b6bff" />
        </linearGradient>
      </defs>
      {/* Two diamonds, one solid and one outlined: the two desktops, overlapping */}
      <rect x="4.6" y="9.6" width="12.8" height="12.8" rx="2.6" transform="rotate(45 11 16)" fill={`url(#hg${id})`} opacity="0.95" />
      <rect x="14.8" y="10.0" width="12" height="12" rx="2.6" transform="rotate(45 20.8 16)" fill="none" stroke={`url(#hg${id})`} strokeWidth="2.4" />
    </svg>
  );
}

export function RockyOrb({ size = 40, thinking = false, idle = true }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-[-18%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(94,240,255,.35), rgba(155,107,255,.15) 45%, transparent 70%)', animation: idle ? 'breathe 3.6s ease-in-out infinite' : undefined }} />
      <svg viewBox="0 0 40 40" width={size} height={size} className="absolute inset-0">
        <defs>
          <radialGradient id={`rc${id}`} cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.25" stopColor="#8ff6ff" />
            <stop offset="0.65" stopColor="#4a7dff" />
            <stop offset="1" stopColor="#2a1470" />
          </radialGradient>
          <linearGradient id={`rr${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5ef0ff" />
            <stop offset="1" stopColor="#a47cff" />
          </linearGradient>
        </defs>
        <g style={{ transformOrigin: '20px 20px', animation: `spin ${thinking ? 1.6 : 9}s linear infinite` }}>
          <circle cx="20" cy="20" r="18.5" fill="none" stroke={`url(#rr${id})`} strokeWidth="1.2" strokeDasharray="5 3.2" opacity="0.85" />
        </g>
        <g style={{ transformOrigin: '20px 20px', animation: `spinRev ${thinking ? 2.2 : 14}s linear infinite` }}>
          <circle cx="20" cy="20" r="15.6" fill="none" stroke="rgba(160,230,255,.35)" strokeWidth="0.8" strokeDasharray="1 2.4" />
        </g>
        <circle cx="20" cy="20" r="12.6" fill={`url(#rc${id})`} />
        <path d="M9.5 21.5 Q20 25.5 30.5 21.5 L30.5 23 Q20 30 9.5 23Z" fill="rgba(10,10,40,.35)" />
        {/* visor eyes */}
        <g style={{ transformOrigin: '20px 19px', animation: 'blink 4.8s infinite' }}>
          <rect x="14.3" y="16.4" width="3" height="5" rx="1.5" fill="#06122e" />
          <rect x="22.7" y="16.4" width="3" height="5" rx="1.5" fill="#06122e" />
        </g>
      </svg>
    </div>
  );
}

// ---------- App icon (original glyph-on-squircle marks, not brand logos) ----------
export function AppIcon({ app, size = 48, className = '', style }) {
  const meta = APPS[app];
  if (app === 'rocky') {
    return (
      <div className={`relative grid place-items-center ${className}`} style={{ width: size, height: size, borderRadius: size * 0.26, background: 'radial-gradient(120% 120% at 30% 20%, #1d2a6b, #070a22 70%)', boxShadow: `inset 0 0 0 1px rgba(140,220,255,.28), inset 0 ${size * 0.04}px ${size * 0.08}px rgba(255,255,255,.12), 0 ${size * 0.08}px ${size * 0.2}px -${size * 0.06}px rgba(0,0,0,.55)`, ...style }}>
        <RockyOrb size={size * 0.7} idle={false} />
      </div>
    );
  }
  if (!meta) return null;
  const Glyph = meta.glyph;
  return (
    <div
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: `linear-gradient(150deg, ${meta.grad[0]}, ${meta.grad[1]})`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.22), inset 0 -${size * 0.06}px ${size * 0.14}px rgba(0,0,0,.18), 0 ${size * 0.08}px ${size * 0.2}px -${size * 0.06}px rgba(0,0,0,.55)`,
        ...style,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,0))' }} />
      {app === 'launcher' ? (
        <div className="relative grid grid-cols-2" style={{ gap: size * 0.07 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="block bg-white" style={{ width: size * 0.17, height: size * 0.17, borderRadius: i === 3 ? '50%' : size * 0.05, opacity: i === 3 ? 1 : 0.92 }} />
          ))}
        </div>
      ) : app === 'about' ? (
        <HybridLogo size={size * 0.6} />
      ) : (
        <Glyph size={size * 0.5} strokeWidth={2} color={meta.glyphColor || '#fff'} style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))', position: 'relative' }} />
      )}
    </div>
  );
}

// ---------- Controls ----------
export function Toggle({ on, onChange, label, id }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full press"
      style={{ background: on ? 'linear-gradient(90deg, rgb(var(--acc)), rgb(var(--acc2)))' : 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--line)', transition: 'background calc(var(--anim)*200ms)' }}
    >
      <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow" style={{ left: on ? 19 : 3, transition: 'left calc(var(--anim)*200ms) cubic-bezier(.3,.9,.3,1.2)' }} />
    </button>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, id }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <input
      id={id}
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="hs-range"
      style={{ '--p': `${p}%` }}
    />
  );
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className="field flex rounded-[10px] p-[3px] gap-[3px]">
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-[8px] ${size === 'sm' ? 'py-1 text-[11px]' : 'py-1.5 text-[12px]'} font-semibold press`}
            style={{ background: active ? 'rgb(var(--acc) / .2)' : 'transparent', color: active ? 'var(--t1)' : 'var(--t2)', boxShadow: active ? 'inset 0 0 0 1px rgb(var(--acc) / .45)' : 'none', transition: 'all calc(var(--anim)*160ms)' }}
          >
            {Icon && <Icon size={13} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Sparkline({ data, w = 120, h = 28, max = 100, color = 'rgb(var(--acc))', fill = true }) {
  const n = data.length;
  const pts = data.map((v, i) => [(i / (n - 1)) * w, h - (Math.min(v, max) / max) * (h - 2) - 1]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = useId().replace(/:/g, '');
  const last = pts[n - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible block">
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${d} L${w},${h} L0,${h}Z`} fill={`url(#sp${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

export function Meter({ value, max = 100, color }) {
  return (
    <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--field)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color || 'linear-gradient(90deg, rgb(var(--acc)), rgb(var(--acc2)))', transition: 'width 900ms cubic-bezier(.2,.8,.3,1)' }} />
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="inline-flex items-center rounded-[5px] px-1.5 py-[1px] text-[10.5px] font-semibold font-sans text-t2 field">{children}</kbd>;
}

// ---------- Menus (menu bar dropdowns, context menus, dock menus) ----------
export function MenuList({ items, onClose, flip = false, className = '', style }) {
  const [sub, setSub] = useState(null);
  return (
    <div role="menu" className={`glass-strong rounded-[12px] p-[5px] min-w-[220px] text-[13px] a-pop ${className}`} style={style}>
      {items.filter(Boolean).map((it, i) => {
        if (it === '-') return <div key={i} className="h-px my-[5px] mx-2" style={{ background: 'var(--line)' }} />;
        if (it.header) return <div key={i} className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-t3">{it.header}</div>;
        const Icon = it.icon;
        return (
          <div key={i} className="relative" onMouseEnter={() => setSub(it.items ? i : null)}>
            <button
              role="menuitem"
              disabled={it.disabled}
              data-active={sub === i && !!it.items}
              onClick={() => {
                if (it.items) return setSub(i);
                it.onClick && it.onClick();
                onClose && onClose();
              }}
              className="menu-item"
            >
              <span className="w-4 grid place-items-center text-t2">{it.checked ? <Check size={14} className="text-acc" /> : Icon ? <Icon size={14} /> : null}</span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.shortcut && <span className="text-t3 text-[11px] font-medium pl-4">{it.shortcut}</span>}
              {it.items && <ChevronRight size={13} className="text-t3" />}
            </button>
            {it.items && sub === i && (
              <div className={`absolute top-[-6px] ${flip ? 'right-full pr-1' : 'left-full pl-1'} z-10`}>
                <MenuList items={it.items} onClose={onClose} flip={flip} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SectionLabel({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-t3">{children}</span>
      {right}
    </div>
  );
}

export function DemoBadge({ children = 'Demo data' }) {
  return <span className="rounded-full px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.08em] text-t3 field">{children}</span>;
}
