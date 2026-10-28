import { useEffect, useRef, useState } from 'react';
import { MousePointer2, Move, RotateCcw, Maximize2, Box, Camera, Lightbulb, Eye, ChevronDown, Play } from 'lucide-react';

// Low-poly rocket: a lathed body plus four fins, flat shaded on a 2D canvas.
function buildRocket() {
  const profile = [
    [0, 3.1],
    [0.18, 2.75],
    [0.38, 2.2],
    [0.5, 1.6],
    [0.52, 0.9],
    [0.52, -0.2],
    [0.62, -0.35],
    [0.62, -1.35],
    [0.5, -1.45],
    [0.36, -1.55],
    [0.5, -2.0],
    [0, -2.0],
  ];
  const seg = 14;
  const verts = [];
  const faces = [];
  profile.forEach(([r, y]) => {
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      verts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  });
  const band = (i) => (i < 4 ? 'nose' : i === 6 || i === 7 ? 'tank' : i >= 9 ? 'engine' : 'body');
  for (let i = 0; i < profile.length - 1; i++)
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s;
      const b = i * seg + ((s + 1) % seg);
      faces.push({ v: [a, b, b + seg, a + seg], m: band(i) });
    }
  for (let f = 0; f < 4; f++) {
    const a = (f / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const base = verts.length;
    [
      [0.5, -0.4],
      [1.15, -1.5],
      [1.15, -1.95],
      [0.5, -1.4],
    ].forEach(([r, y]) => verts.push([c * r, y, s * r]));
    faces.push({ v: [base, base + 1, base + 2, base + 3], m: 'fin', two: true });
  }
  return { verts, faces };
}

const MAT = { nose: [235, 238, 245], body: [205, 210, 222], tank: [70, 78, 98], engine: [60, 62, 72], fin: [255, 120, 50] };

function Viewport() {
  const ref = useRef(null);
  const rot = useRef({ y: 0.6, x: -0.25, drag: null, auto: true });
  const [frame, setFrame] = useState(1);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const mesh = buildRocket();
    let raf;
    let f = 1;
    const draw = () => {
      const w = (cv.width = cv.clientWidth * 1.5);
      const h = (cv.height = cv.clientHeight * 1.5);
      const R = rot.current;
      if (R.auto && !R.drag) R.y += 0.006;
      ctx.fillStyle = '#2b2b2f';
      ctx.fillRect(0, 0, w, h);
      const cy = Math.cos(R.y);
      const sy = Math.sin(R.y);
      const cx = Math.cos(R.x);
      const sx = Math.sin(R.x);
      const scale = Math.min(w, h) * 0.15;
      const project = ([x, y, z]) => {
        let X = x * cy - z * sy;
        let Z = x * sy + z * cy;
        const Y = y * cx - Z * sx;
        Z = y * sx + Z * cx;
        const p = 7 / (7 + Z);
        return [w / 2 + X * scale * p, h * 0.52 - Y * scale * p, Z];
      };
      // grid floor
      ctx.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        const a = project([i, -2, -8]);
        const b = project([i, -2, 8]);
        const c = project([-8, -2, i]);
        const d = project([8, -2, i]);
        ctx.strokeStyle = i === 0 ? 'rgba(220,70,70,.7)' : 'rgba(255,255,255,.07)';
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.strokeStyle = i === 0 ? 'rgba(130,190,60,.7)' : 'rgba(255,255,255,.07)';
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.lineTo(d[0], d[1]);
        ctx.stroke();
      }
      const P = mesh.verts.map(project);
      const light = [0.5, 0.7, -0.5];
      const ln = Math.hypot(...light);
      const polys = [];
      for (const face of mesh.faces) {
        const pts = face.v.map((i) => P[i]);
        // world-space normal for shading
        const [a, b, c] = face.v.map((i) => mesh.verts[i]);
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const nl = Math.hypot(...n) || 1;
        n = n.map((k) => k / nl);
        const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
        if (!face.two && area > 0) continue;
        let d = Math.abs((n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / ln);
        if (!face.two) d = Math.max(0, -(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / ln);
        const z = pts.reduce((s, p) => s + p[2], 0) / pts.length;
        polys.push({ pts, z, shade: 0.28 + d * 0.72, m: face.m });
      }
      polys.sort((a, b) => b.z - a.z);
      for (const p of polys) {
        const c = MAT[p.m];
        ctx.fillStyle = `rgb(${c.map((k) => Math.round(k * p.shade)).join(',')})`;
        ctx.beginPath();
        p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.18)';
        ctx.stroke();
      }
      // axis gizmo
      const g = [w - 60, 60];
      [
        [[1, 0, 0], '#e2504c', 'X'],
        [[0, 1, 0], '#8bc34a', 'Y'],
        [[0, 0, 1], '#4a90e2', 'Z'],
      ].forEach(([ax, col, label]) => {
        let X = ax[0] * cy - ax[2] * sy;
        let Z = ax[0] * sy + ax[2] * cy;
        const Y = ax[1] * cx - Z * sx;
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(g[0], g[1]);
        ctx.lineTo(g[0] + X * 34, g[1] - Y * 34);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(g[0] + X * 34, g[1] - Y * 34, 9, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(label, g[0] + X * 34 - 4, g[1] - Y * 34 + 4);
      });
      f = (f % 250) + 1;
      if (f % 4 === 0) setFrame(Math.floor(f / 4) + 1);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDown = (e) => {
    const R = rot.current;
    R.drag = { x: e.clientX, y: e.clientY, ry: R.y, rx: R.x };
    const move = (ev) => {
      R.y = R.drag.ry + (ev.clientX - R.drag.x) * 0.01;
      R.x = Math.max(-1.2, Math.min(1.2, R.drag.rx + (ev.clientY - R.drag.y) * 0.01));
    };
    const up = () => {
      R.drag = null;
      R.auto = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="relative flex-1 min-w-0">
      <canvas ref={ref} onPointerDown={onDown} className="absolute inset-0 w-full h-full cursor-grab" />
      <div className="absolute left-3 top-2 text-[11px] text-white/70 leading-relaxed pointer-events-none">
        User Perspective
        <br />
        (1) Collection | Rocket
      </div>
      <div className="absolute left-3 bottom-2 text-[11px] text-white/50 pointer-events-none">Drag to orbit · frame {frame}/63</div>
    </div>
  );
}

export default function Blender() {
  return (
    <div className="h-full flex flex-col text-[12px] text-[#d6d6d6]" style={{ background: '#303030' }}>
      <div className="h-[28px] shrink-0 flex items-center gap-4 px-3" style={{ background: '#232323' }} title="Demo scene: menus are not interactive">
        <span className="w-4 h-4 rounded-full" style={{ background: 'linear-gradient(135deg,#ffbd57,#ec5a10)' }} />
        {['File', 'Edit', 'Render', 'Window', 'Help'].map((m) => (
          <span key={m}>{m}</span>
        ))}
        <span className="ml-4 px-2.5 py-0.5 rounded bg-[#4772b3] text-white">Layout</span>
        {['Modeling', 'Sculpting', 'Shading', 'Animation'].map((m) => (
          <span key={m} className="text-white/60">{m}</span>
        ))}
        <span className="ml-auto text-white/50">rocket_v3.blend</span>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="w-[38px] shrink-0 flex flex-col items-center gap-1.5 pt-2" style={{ background: '#2a2a2a' }} title="Demo scene: drag the viewport to orbit" aria-hidden="true">
          {[MousePointer2, Move, RotateCcw, Maximize2, Box].map((I, i) => (
            <span key={i} className="w-7 h-7 grid place-items-center rounded" style={{ background: i === 0 ? '#4772b3' : 'transparent' }}>
              <I size={15} />
            </span>
          ))}
        </div>
        <Viewport />
        <div className="w-[220px] shrink-0 flex flex-col" style={{ background: '#2a2a2a' }}>
          <div className="p-2" style={{ borderBottom: '1px solid #1d1d1d' }}>
            <div className="text-white/60 mb-1">Scene Collection</div>
            {[
              [Camera, 'Camera', false],
              [Lightbulb, 'Sun', false],
              [Box, 'Rocket', true],
              [Box, 'Launch Pad', false],
            ].map(([I, n, on]) => (
              <div key={n} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: on ? '#334d80' : undefined }}>
                <I size={13} className={on ? 'text-[#ffaa40]' : 'text-white/70'} />
                <span className="flex-1">{n}</span>
                <Eye size={12} className="text-white/50" />
              </div>
            ))}
          </div>
          <div className="p-2 flex-1 overflow-y-auto">
            <div className="flex items-center gap-1 text-white/80 mb-2">
              <ChevronDown size={12} /> Transform
            </div>
            {[
              ['Location', ['0 m', '0 m', '2 m']],
              ['Rotation', ['0°', '0°', '0°']],
              ['Scale', ['1.000', '1.000', '1.000']],
            ].map(([label, vals]) => (
              <div key={label} className="mb-2">
                <div className="text-white/60 mb-1">{label}</div>
                {vals.map((v, i) => (
                  <div key={i} className="flex justify-between px-2 py-0.5 mb-[2px] rounded bg-[#3d3d3d] text-[11px]">
                    <span className="text-white/50">{'XYZ'[i]}</span>
                    {v}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex items-center gap-1 text-white/80 mb-1 mt-3">
              <ChevronDown size={12} /> Material
            </div>
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#3d3d3d]">
              <span className="w-3 h-3 rounded-full bg-[#ff7832]" /> Fin Orange
            </div>
          </div>
        </div>
      </div>
      <div className="h-[30px] shrink-0 flex items-center gap-3 px-3" style={{ background: '#232323' }}>
        <Play size={13} />
        <div className="flex-1 h-[6px] rounded bg-[#3d3d3d] relative">
          <div className="absolute top-[-4px] w-[2px] h-[14px] bg-[#4772b3]" style={{ left: '30%' }} />
        </div>
        <span className="text-white/50">Demo scene · not a real Blender session</span>
      </div>
    </div>
  );
}
