import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { useOS } from './store';
import { TRACKS } from './data';

// ---------- Clock ----------
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const fmtTime = (d, secs = false) =>
  d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(secs ? { second: '2-digit' } : {}) });
export const fmtDate = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => d.toLocaleDateString([], opts);
export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- Simulated performance telemetry (demo data) ----------
const PerfContext = createContext(null);
const HIST = 36;

function walk(v, target, jitter, lo = 2, hi = 99) {
  const next = v + (target - v) * 0.25 + (Math.random() - 0.5) * jitter;
  return Math.max(lo, Math.min(hi, next));
}

export function PerfProvider({ children }) {
  const { state } = useOS();
  const load = useRef({ cpu: 12, gpu: 8, ram: 9.6 });
  const profile = state.perfProfile;
  const apps = state.windows.filter((w) => !w.min).map((w) => w.app);
  const cost = { blender: [22, 38, 3.1], vscode: [6, 2, 1.4], edge: [5, 4, 1.8], discord: [3, 3, 0.7], spotify: [2, 1, 0.4], explorer: [1, 1, 0.2], terminal: [2, 0, 0.1], settings: [1, 1, 0.2] };
  let cpu = 11, gpu = 7, ram = 9.4;
  for (const a of apps) {
    const c = cost[a] || [1, 1, 0.2];
    cpu += c[0];
    gpu += c[1];
    ram += c[2];
  }
  const k = profile === 'performance' ? 1.15 : profile === 'saver' ? 0.7 : 1;
  load.current = { cpu: Math.min(92, cpu * k), gpu: Math.min(95, gpu * k), ram: Math.min(30, ram) };

  const [p, setP] = useState(() => ({
    cpu: 14,
    gpu: 9,
    ram: 9.6,
    netDown: 18,
    netUp: 3,
    cpuTemp: 46,
    gpuTemp: 41,
    // Seed with a plausible recent history rather than a flat line
    hist: {
      cpu: Array.from({ length: HIST }, (_, i) => 12 + 4 * Math.sin(i / 4) + 2 * Math.sin(i / 1.7)),
      gpu: Array.from({ length: HIST }, (_, i) => 8 + 2 * Math.sin(i / 5)),
      net: Array.from({ length: HIST }, (_, i) => 14 + 3 * Math.sin(i / 3)),
    },
  }));

  useEffect(() => {
    const t = setInterval(() => {
      setP((q) => {
        const L = load.current;
        // Values follow the simulated load of open apps with small drift, not random jitter.
        const cpu = walk(q.cpu, L.cpu, 2.5);
        const gpu = walk(q.gpu, L.gpu, 2);
        const ram = Math.max(4, Math.min(31, q.ram + (L.ram - q.ram) * 0.2));
        const netDown = Math.max(0.5, q.netDown * 0.8 + (10 + Math.random() * 8) * 0.2);
        const netUp = Math.max(0.2, q.netUp * 0.8 + (1.5 + Math.random() * 1.5) * 0.2);
        return {
          cpu,
          gpu,
          ram,
          netDown,
          netUp,
          cpuTemp: walk(q.cpuTemp, 38 + cpu * 0.45, 0.4, 30, 95),
          gpuTemp: walk(q.gpuTemp, 34 + gpu * 0.5, 0.4, 30, 95),
          hist: {
            cpu: [...q.hist.cpu.slice(1), cpu],
            gpu: [...q.hist.gpu.slice(1), gpu],
            net: [...q.hist.net.slice(1), netDown],
          },
        };
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  return <PerfContext.Provider value={p}>{children}</PerfContext.Provider>;
}

export const usePerf = () => useContext(PerfContext);

// ---------- Music (shared by the Now Playing widget and the Spotify mock) ----------
const MusicContext = createContext(null);

function nextIndex(q) {
  if (!q.shuffle) return (q.i + 1) % TRACKS.length;
  const r = Math.floor(Math.random() * (TRACKS.length - 1));
  return r >= q.i ? r + 1 : r;
}

export function MusicProvider({ children }) {
  const [m, setM] = useState({ i: 0, playing: false, pos: 64, liked: { 0: true }, shuffle: false, repeat: false });
  useEffect(() => {
    if (!m.playing) return;
    const t = setInterval(() => {
      setM((q) => {
        const dur = TRACKS[q.i].dur;
        if (q.pos + 1 >= dur) return { ...q, i: q.repeat ? q.i : nextIndex(q), pos: 0 };
        return { ...q, pos: q.pos + 1 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [m.playing]);

  const api = useMemo(
    () => ({
      toggle: () => setM((q) => ({ ...q, playing: !q.playing })),
      next: () => setM((q) => ({ ...q, i: nextIndex(q), pos: 0 })),
      toggleShuffle: () => setM((q) => ({ ...q, shuffle: !q.shuffle })),
      toggleRepeat: () => setM((q) => ({ ...q, repeat: !q.repeat })),
      prev: () => setM((q) => (q.pos > 4 ? { ...q, pos: 0 } : { ...q, i: (q.i - 1 + TRACKS.length) % TRACKS.length, pos: 0 })),
      play: (i) => setM((q) => ({ ...q, i, pos: 0, playing: true })),
      seek: (pos) => setM((q) => ({ ...q, pos })),
      like: (i) => setM((q) => ({ ...q, liked: { ...q.liked, [i]: !q.liked[i] } })),
    }),
    []
  );
  const value = useMemo(() => ({ ...m, track: TRACKS[m.i], ...api }), [m, api]);
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export const useMusic = () => useContext(MusicContext);

// ---------- Utilities ----------
export function useOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOutside(e);
    };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [active, onOutside]);
}
