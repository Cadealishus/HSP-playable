import { useState, useId, useRef, useEffect } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { APPS } from '../os/apps';

// ---------- Brand marks ----------
export function HybridLogo({ size = 18 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`hg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6fd8f5" />
          <stop offset="1" stopColor="#9a86ff" />
        </linearGradient>
      </defs>
      {/* Two diamonds, one solid and one outlined: the two desktops, overlapping */}
      <rect x="4.6" y="9.6" width="12.8" height="12.8" rx="2.6" transform="rotate(45 11 16)" fill={`url(#hg${id})`} />
      <rect x="14.8" y="10.0" width="12" height="12" rx="2.6" transform="rotate(45 20.8 16)" fill="none" stroke={`url(#hg${id})`} strokeWidth="2.4" />
    </svg>
  );
}

// Rocky: a calm sphere with a visor. It only moves when it has something to say (thinking).
export function RockyOrb({ size = 40, thinking = false }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="shrink-0" aria-hidden="true">
      <defs>
        <radialGradient id={`rc${id}`} cx="36%" cy="30%" r="75%">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset="0.3" stopColor="#7fd9f2" />
          <stop offset="0.75" stopColor="#4c63d6" />
          <stop offset="1" stopColor="#24175e" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="17.5" fill="none" stroke="rgba(140,215,240,.35)" strokeWidth="1" />
      {thinking && (
        <g style={{ transformOrigin: '20px 20px', animation: 'spin 1.2s linear infinite' }}>
          <path d="M20 2.5 A17.5 17.5 0 0 1 37.5 20" fill="none" stroke="rgb(var(--acc))" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}
      <circle cx="20" cy="20" r="13.5" fill={`url(#rc${id})`} />
      <g style={{ transformOrigin: '20px 19px', animation: 'blink 6s infinite' }}>
        <rect x="14.6" y="16.2" width="3" height="5.2" rx="1.5" fill="#0a1636" />
        <rect x="22.4" y="16.2" width="3" height="5.2" rx="1.5" fill="#0a1636" />
      </g>
    </svg>
  );
}

// ---------- App icons ----------
// One family: every app sits on the same tile material; the glyph colour carries its identity.
export function AppIcon({ app, size = 48, className = '', style }) {
  const meta = APPS[app];
  if (!meta) return null;
  const small = size < 28;
  const tile = {
    width: size,
    height: size,
    borderRadius: size * 0.25,
    background: meta.hue
      ? `radial-gradient(120% 70% at 50% 115%, color-mix(in srgb, ${meta.hue} 22%, transparent), transparent 70%), linear-gradient(180deg, var(--icon-top), var(--icon-bot))`
      : 'linear-gradient(180deg, var(--icon-top), var(--icon-bot))',
    boxShadow: small
      ? 'inset 0 0 0 1px var(--icon-edge)'
      : `inset 0 0 0 1px var(--icon-edge), inset 0 1px 0 rgba(255,255,255,.08), 0 1px 2px rgba(0,0,0,.25), 0 ${size * 0.08}px ${size * 0.2}px -${size * 0.08}px rgba(0,0,0,.45)`,
    ...style,
  };
  let glyph;
  if (app === 'rocky') glyph = <RockyOrb size={size * 0.74} />;
  else if (app === 'about') glyph = <HybridLogo size={size * 0.56} />;
  else if (app === 'launcher')
    glyph = (
      <span className="grid grid-cols-2" style={{ gap: size * 0.08 }}>
        {[1, 0.6, 0.6, 0.35].map((o, i) => (
          <span key={i} className="block" style={{ width: size * 0.17, height: size * 0.17, borderRadius: size * 0.05, background: 'rgb(var(--acc))', opacity: o }} />
        ))}
      </span>
    );
  else {
    const Glyph = meta.glyph;
    glyph = <Glyph size={size * 0.5} strokeWidth={small ? 2.2 : 1.85} color={`color-mix(in srgb, ${meta.hue}, #0b1530 var(--icon-mix, 0%))`} />;
  }
  return (
    <div className={`relative grid place-items-center shrink-0 ${className}`} style={tile}>
      {glyph}
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
      className="relative h-5 w-[34px] shrink-0 rounded-full"
      style={{ background: on ? 'rgb(var(--acc))' : 'var(--field)', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--line)', transition: 'background var(--d-base) var(--ease-out)' }}
    >
      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white" style={{ left: on ? 16 : 2, boxShadow: '0 1px 2px rgba(0,0,0,.3)', transition: 'left var(--d-base) var(--ease-out)' }} />
    </button>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, id }) {
  const p = ((value - min) / (max - min)) * 100;
  return <input id={id} aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="hs-range" style={{ '--p': `${p}%` }} />;
}

export function Segmented({ options, value, onChange, size = 'md', label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[var(--r-sm)] p-0.5 gap-0.5" style={{ background: 'var(--field)' }}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-[6px] ${size === 'sm' ? 'h-6 text-[12px]' : 'h-7 text-[12px]'} font-medium`}
            style={{
              background: active ? 'rgb(var(--surface) / .9)' : 'transparent',
              color: active ? 'var(--t1)' : 'var(--t2)',
              boxShadow: active ? 'inset 0 0 0 1px var(--line), 0 1px 2px rgba(0,0,0,.18)' : 'none',
              transition: 'background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out)',
            }}
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
  const pts = data.map((v, i) => [(i / (n - 1)) * w, h - (Math.min(v, max) / max) * (h - 3) - 1.5]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const id = useId().replace(/:/g, '');
  const last = pts[n - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible block" aria-hidden="true">
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${d} L${w},${h} L0,${h}Z`} fill={`url(#sp${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}

export function Meter({ value, max = 100, color = 'rgb(var(--acc))' }) {
  return (
    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--field)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, transition: 'width 600ms var(--ease-out)' }} />
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="inline-flex items-center h-[18px] rounded-[5px] px-1.5 text-[11px] font-medium font-sans text-t2 field">{children}</kbd>;
}

// Small square button for toolbars and title bars. `tip` shows a delayed tooltip.
export function IconButton({ label, onClick, children, tip = true, side = 'bottom', active, danger, size = 28, className = '', ...rest }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`tip-host grid place-items-center shrink-0 rounded-[var(--r-sm)] text-t2 hover:text-t1 ${danger ? 'hover:!bg-[rgb(var(--bad))] hover:!text-white' : 'hov'} ${className}`}
      style={{ width: size, height: size, background: active ? 'var(--press)' : undefined, color: active ? 'var(--t1)' : undefined, transition: 'background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out)' }}
      {...rest}
    >
      {children}
      {tip && <Tip side={side}>{label}</Tip>}
    </button>
  );
}

export function Tip({ children, side = 'bottom' }) {
  const pos = side === 'top' ? { bottom: 'calc(100% + 8px)', left: '50%', marginLeft: 0, translate: '-50% 0' } : side === 'right' ? { left: 'calc(100% + 8px)', top: '50%', translate: '0 -50%' } : side === 'left' ? { right: 'calc(100% + 8px)', top: '50%', translate: '0 -50%' } : { top: 'calc(100% + 8px)', left: '50%', translate: '-50% 0' };
  return (
    <span className="tip" role="tooltip" style={pos}>
      {children}
    </span>
  );
}

// ---------- Menus (menu bar dropdowns, context menus, dock menus) ----------
// Arrow keys move between items, Right opens a submenu, Left / Escape close it.
export function MenuList({ items, onClose, flip = false, className = '', style, autoFocus = false, onBack }) {
  const [sub, setSub] = useState(null);
  const ref = useRef(null);
  const list = items.filter(Boolean);
  useEffect(() => {
    if (autoFocus && ref.current) ref.current.querySelector('[role=menuitem]:not(:disabled)')?.focus();
  }, [autoFocus]);
  const onKey = (e) => {
    const els = [...ref.current.querySelectorAll(':scope > div > [role=menuitem]:not(:disabled)')];
    const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
      els[next]?.focus();
    } else if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    }
  };
  return (
    <div ref={ref} role="menu" onKeyDown={onKey} className={`glass-strong rounded-[var(--r-md)] p-1 min-w-[220px] a-pop ${className}`} style={style}>
      {list.map((it, i) => {
        if (it === '-') return <div key={i} role="separator" className="h-px my-1 mx-2" style={{ background: 'var(--line)' }} />;
        if (it.header)
          return (
            <div key={i} className="px-2 pt-1.5 pb-1 text-[12px] font-medium text-t3 truncate">
              {it.header}
            </div>
          );
        const Icon = it.icon;
        return (
          <div key={i} className="relative" onMouseEnter={() => setSub(it.items ? i : null)}>
            <button
              role="menuitem"
              aria-haspopup={it.items ? 'menu' : undefined}
              aria-checked={it.checked}
              disabled={it.disabled}
              data-active={sub === i && !!it.items}
              onKeyDown={(e) => {
                if (it.items && (e.key === 'ArrowRight' || e.key === 'Enter')) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSub(i);
                }
              }}
              onClick={() => {
                if (it.items) return setSub(i);
                it.onClick && it.onClick();
                onClose && onClose();
              }}
              className="menu-item"
            >
              <span className="w-4 grid place-items-center text-t2 shrink-0">{it.checked ? <Check size={14} className="text-acc" /> : Icon ? <Icon size={14} strokeWidth={1.75} /> : null}</span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.shortcut && <span className="text-t3 text-[12px] pl-6 tnum">{it.shortcut}</span>}
              {it.items && <ChevronRight size={14} className="text-t3" />}
            </button>
            {it.items && sub === i && (
              <div className={`absolute -top-1 ${flip ? 'right-full pr-1' : 'left-full pl-1'} z-10`}>
                <MenuList items={it.items} onClose={onClose} flip={flip} autoFocus={document.activeElement && document.activeElement.closest('[role=menu]') === ref.current} onBack={() => { setSub(null); ref.current.querySelectorAll('[role=menuitem]')[0]?.focus(); }} />
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
    <div className="flex items-center justify-between h-5 mb-2">
      <span className="text-[12px] font-medium text-t2">{children}</span>
      {right}
    </div>
  );
}

// Honest, quiet labelling of simulated content.
export function DemoBadge({ children = 'Sample data' }) {
  return (
    <span className="text-[11px] text-t3" title="Simulated in this prototype. Nothing is read from your PC.">
      {children}
    </span>
  );
}

// Text button. primary = the one main action in a view; secondary for everything else.
export function Button({ children, onClick, variant = 'secondary', className = '', ...rest }) {
  const primary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-[var(--r-sm)] text-[13px] font-medium press ${primary ? '' : 'hov'} ${className}`}
      style={primary ? { background: 'rgb(var(--acc))', color: 'var(--on-acc)' } : { background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--line)' }}
      {...rest}
    >
      {children}
    </button>
  );
}
