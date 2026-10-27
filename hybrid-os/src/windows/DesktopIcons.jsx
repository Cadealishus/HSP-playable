import { useState, useRef } from 'react';
import { Monitor, Trash2, FolderOpen, FileText } from 'lucide-react';
import { useOS, toLocal } from '../os/store';
import { APPS } from '../os/apps';
import { AppIcon, HybridLogo } from '../components/ui';

function GlyphTile({ icon: I, color }) {
  return (
    <div className="w-[46px] h-[46px] grid place-items-center">
      <I size={40} strokeWidth={1.3} color={color} style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))' }} fill={`${color}22`} />
    </div>
  );
}

const ICONS = [
  { id: 'pc', label: 'This PC', render: () => <GlyphTile icon={Monitor} color="#8fd3ff" />, open: (a) => a.open('explorer', { props: { path: [] } }) },
  { id: 'bin', label: 'Recycle Bin', render: () => <GlyphTile icon={Trash2} color="#dfe8f5" />, open: (a) => a.open('explorer', { props: { path: ['__bin'] } }) },
  { id: 'projects', label: 'Projects', render: () => <GlyphTile icon={FolderOpen} color="#ffd36b" />, open: (a) => a.open('explorer', { props: { path: ['Projects'] } }) },
  { id: 'edge', label: APPS.edge.name, render: () => <AppIcon app="edge" size={42} />, open: (a) => a.open('edge') },
  { id: 'vscode', label: APPS.vscode.short, render: () => <AppIcon app="vscode" size={42} />, open: (a) => a.open('vscode') },
  { id: 'discord', label: 'Discord', render: () => <AppIcon app="discord" size={42} />, open: (a) => a.open('discord') },
  { id: 'blender', label: 'Blender', render: () => <AppIcon app="blender" size={42} />, open: (a) => a.open('blender') },
  { id: 'brief', label: 'Design Brief.pdf', render: () => <GlyphTile icon={FileText} color="#ff8a8a" />, open: (a) => a.open('explorer', { props: { path: ['Documents'], select: 'HYBRID OS — Design Brief.pdf' } }) },
  {
    id: 'hybrid',
    label: 'HYBRID OS',
    render: () => (
      <div className="w-[46px] h-[46px] grid place-items-center rounded-[12px]" style={{ background: 'linear-gradient(140deg, #101640, #2a1866)', boxShadow: '0 0 0 1px rgba(140,200,255,.35), 0 4px 14px rgba(94,240,255,.35)' }}>
        <HybridLogo size={28} />
      </div>
    ),
    open: (a) => a.switchMode('hybrid'),
  },
];

const CELL_W = 84;
const CELL_H = 92;

export default function DesktopIcons({ onMenu }) {
  const { state, actions } = useOS();
  const [sel, setSel] = useState([]);
  const [box, setBox] = useState(null);
  const root = useRef(null);
  const pos = (i) => ({ x: 8 + Math.floor(i / 7) * CELL_W, y: 8 + (i % 7) * CELL_H });

  const onDown = (e) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    setSel([]);
    const s = toLocal(e.clientX, e.clientY);
    const move = (ev) => {
      const p = toLocal(ev.clientX, ev.clientY);
      const b = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
      setBox(b);
      setSel(
        ICONS.filter((_, i) => {
          const c = pos(i);
          return c.x < b.x + b.w && c.x + CELL_W - 8 > b.x && c.y < b.y + b.h && c.y + CELL_H - 8 > b.y;
        }).map((x) => x.id)
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBox(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div ref={root} className="absolute inset-0 bottom-[48px] z-[1] chrome chrome-fade a-fade" onPointerDown={onDown} onContextMenu={(e) => e.target === e.currentTarget && onMenu(e)}>
      {ICONS.map((ic, i) => {
        const p = pos(i);
        const on = sel.includes(ic.id);
        return (
          <button
            key={ic.id}
            className="absolute flex flex-col items-center gap-1 pt-1.5 rounded-[4px]"
            style={{ left: p.x, top: p.y, width: CELL_W - 8, height: CELL_H - 8, background: on ? 'rgba(120,180,255,.28)' : undefined, outline: on ? '1px solid rgba(160,210,255,.6)' : 'none', transition: 'background 100ms' }}
            onMouseEnter={(e) => !on && (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
            onMouseLeave={(e) => !on && (e.currentTarget.style.background = '')}
            onClick={(e) => setSel((s) => (e.ctrlKey ? (s.includes(ic.id) ? s.filter((x) => x !== ic.id) : [...s, ic.id]) : [ic.id]))}
            onDoubleClick={() => ic.open(actions)}
            onKeyDown={(e) => e.key === 'Enter' && ic.open(actions)}
          >
            {ic.render()}
            <span className="text-[11.5px] leading-tight text-center text-white px-0.5 line-clamp-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>
              {ic.label}
            </span>
          </button>
        );
      })}
      {box && <div className="absolute pointer-events-none" style={{ left: box.x, top: box.y, width: box.w, height: box.h, background: 'rgba(80,150,255,.18)', border: '1px solid rgba(120,180,255,.8)' }} />}
    </div>
  );
}
