import { useEffect, useRef, useState } from 'react';
import { metrics } from '../os/store';
import midnightLake from '../assets/midnight-lake.jpg';
import nebulaRift from '../assets/nebula-rift.jpg';
import obsidian from '../assets/obsidian.jpg';
import glacier from '../assets/glacier.jpg';
import midnightLakeThumb from '../assets/midnight-lake-thumb.jpg';
import nebulaRiftThumb from '../assets/nebula-rift-thumb.jpg';
import obsidianThumb from '../assets/obsidian-thumb.jpg';
import glacierThumb from '../assets/glacier-thumb.jpg';

// HYBRID wallpapers are photographs embedded in the page. Windows mode draws its bloom on canvas.
const PHOTOS = { 'midnight-lake': midnightLake, 'nebula-rift': nebulaRift, obsidian, glacier };
const PHOTO_THUMBS = { 'midnight-lake': midnightLakeThumb, 'nebula-rift': nebulaRiftThumb, obsidian: obsidianThumb, glacier: glacierThumb };
// Where to anchor the crop when the screen isn't 16:9, so each photo keeps its focal point in frame.
const PHOTO_FOCUS = { 'nebula-rift': '72% 50%', glacier: '68% 50%' };

function softDot(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Windows-inspired bloom: folded translucent ribbons around a centre point
function drawBloom(ctx, w, h, light) {
  const u = Math.min(w, h * 1.78);
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
  if (light) {
    bg.addColorStop(0, '#e9f2fd');
    bg.addColorStop(0.55, '#c6dbf5');
    bg.addColorStop(1, '#9fbfe8');
  } else {
    bg.addColorStop(0, '#0d3478');
    bg.addColorStop(0.5, '#061a44');
    bg.addColorStop(1, '#020818');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.6;
  const petals = [
    [-2.55, 0.95, 0.9],
    [-2.05, 1.12, 1],
    [-1.57, 1.22, 1],
    [-1.09, 1.12, 1],
    [-0.59, 0.95, 0.9],
    [-2.95, 0.7, 0.7],
    [-0.19, 0.7, 0.7],
  ];
  ctx.globalCompositeOperation = light ? 'multiply' : 'screen';
  for (const [ang, len, wd] of petals) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.scale(1, 0.92);
    const L = u * 0.23 * len;
    const W = u * 0.06 * wd;
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(L * 0.3, -W * 1.6, L * 0.8, -W * 1.2, L, 0);
    p.bezierCurveTo(L * 0.75, W * 0.9, L * 0.35, W * 1.2, 0, 0);
    const g = ctx.createLinearGradient(0, 0, L, 0);
    if (light) {
      g.addColorStop(0, 'rgba(0,70,200,.95)');
      g.addColorStop(0.6, 'rgba(40,130,240,.75)');
      g.addColorStop(1, 'rgba(140,200,255,.5)');
    } else {
      g.addColorStop(0, 'rgba(20,90,255,.95)');
      g.addColorStop(0.6, 'rgba(40,150,255,.8)');
      g.addColorStop(1, 'rgba(130,220,255,.75)');
    }
    ctx.fillStyle = g;
    ctx.shadowColor = light ? 'rgba(0,60,180,.35)' : 'rgba(40,140,255,.6)';
    ctx.shadowBlur = u / 40;
    ctx.fill(p);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = Math.max(1, u / 900);
    ctx.stroke(p);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  softDot(ctx, cx, cy, u * 0.12, light ? '255,255,255' : '120,200,255', light ? 0.5 : 0.35);
}

function renderBloom(canvas, id, w, h) {
  canvas.width = w;
  canvas.height = h;
  drawBloom(canvas.getContext('2d'), w, h, id === 'bloom-light');
}

export function wallpaperThumb(id) {
  return PHOTO_THUMBS[id];
}

function Layer({ id, W, H, entering }) {
  const ref = useRef(null);
  const enter = entering ? { animation: 'wpIn calc(var(--anim) * 700ms) var(--ease-out) both' } : undefined;
  useEffect(() => {
    if (PHOTOS[id]) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const t = setTimeout(() => renderBloom(ref.current, id, Math.round(W * metrics.scale * dpr), Math.round(H * metrics.scale * dpr)), entering ? 0 : 120);
    return () => clearTimeout(t);
  }, [id, W, H]);
  if (PHOTOS[id]) return <img src={PHOTOS[id]} alt="" draggable={false} decoding="async" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: PHOTO_FOCUS[id] || '50% 50%', ...enter }} />;
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" style={enter} />;
}

// Crossfades between wallpapers; the outgoing layer is dropped once the new one has faded in.
export default function Wallpaper({ id, W, H }) {
  const [layers, setLayers] = useState([{ id, k: 0 }]);
  useEffect(() => {
    if (layers[layers.length - 1].id === id) return;
    setLayers((l) => [...l.slice(-1), { id, k: Date.now() }]);
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 900);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#05060d' }}>
      {layers.map((l, i) => (
        <Layer key={l.k} id={l.id} W={W} H={H} entering={i > 0} />
      ))}
    </div>
  );
}
