import { useEffect, useState, useRef, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { OSProvider, useOS, metrics } from './os/store';
import { PerfProvider, MusicProvider } from './os/sim';
import Desktop from './shell/Desktop';

// The desktop renders at a virtual resolution of at least 1180×660 and scales down to fit the frame,
// so it always reads as a full computer screen.
const MIN_W = 1180;
const MIN_H = 660;

function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(1, vw / MIN_W, vh / MIN_H);
  return { W: Math.round(vw / scale), H: Math.round(vh / scale), scale };
}

function Screen() {
  const [dim, setDim] = useState(measure);
  const root = useRef(null);
  useEffect(() => {
    let t;
    const on = () => {
      clearTimeout(t);
      t = setTimeout(() => setDim(measure()), 80);
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  metrics.W = dim.W;
  metrics.H = dim.H;
  metrics.scale = dim.scale;
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'clip', background: '#000' }}>
      <div
        ref={(el) => {
          root.current = el;
          metrics.root = el;
        }}
        style={{ width: dim.W, height: dim.H, transform: `scale(${dim.scale})`, transformOrigin: '0 0', position: 'relative' }}
      >
        <OSProvider>
          <PerfProvider>
            <MusicProvider>
              <Desktop W={dim.W} H={dim.H} />
            </MusicProvider>
          </PerfProvider>
        </OSProvider>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Screen />);
