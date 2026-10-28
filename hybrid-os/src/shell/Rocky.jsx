import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { useOS, fullscreenWindow } from '../os/store';
import { APPS } from '../os/apps';
import { THEMES } from '../os/themes';
import { usePerf } from '../os/sim';
import { RockyOrb, IconButton, Tip } from '../components/ui';

// Scripted replies only. This concept is not connected to any AI backend.
function reply(text, ctx) {
  const t = text.toLowerCase();
  const { actions, state, perf } = ctx;
  const appHit = Object.entries(APPS).find(([id, a]) => !a.hidden && id !== 'rocky' && (t.includes(a.short.toLowerCase()) || t.includes(a.name.toLowerCase())));
  if (/\b(open|launch|start|run)\b/.test(t) && appHit) {
    return { text: `Opening ${appHit[1].name}.`, run: () => actions.open(appHit[0]) };
  }
  const theme = Object.keys(THEMES).find((k) => t.includes(k));
  if (theme) return { text: `Switching to the ${THEMES[theme].name} theme. ${theme === 'stealth' ? 'Very covert. 🕶️' : theme === 'daylight' ? 'Bright and clean.' : 'Neon is back on.'}`, run: () => actions.setTheme(theme) };
  if (/windows (mode|desktop)|switch (mode|desktop)|ctrl.?alt.?m/.test(t)) return { text: `Switching to ${state.mode === 'hybrid' ? 'the Windows desktop' : 'HYBRID mode'}. Ctrl+Alt+M does this too.`, run: () => actions.switchMode() };
  if (/focus|do not disturb|dnd|quiet/.test(t)) return { text: state.focus ? 'Focus mode is off. Notifications are back.' : 'Focus mode is on. I muted notifications and dimmed the widgets.', run: () => actions.set({ focus: !state.focus }) };
  if (/cpu|gpu|ram|perf|performance|status|how.*(pc|computer|system)/.test(t))
    return { text: `Simulated readout: CPU ${Math.round(perf.cpu)}%, GPU ${Math.round(perf.gpu)}%, RAM ${perf.ram.toFixed(1)} of 32 GB, CPU at ${Math.round(perf.cpuTemp)}°C. Open Blender and watch the GPU climb.` };
  if (/time|date|day/.test(t)) return { text: `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} on ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.` };
  if (/wallpaper|background/.test(t)) {
    const list = ['midnight-lake', 'nebula-rift', 'obsidian', 'glacier'];
    const next = list[(list.indexOf(state.wallpaper) + 1) % list.length];
    return { text: 'New wallpaper coming up.', run: () => actions.set({ wallpaper: next }) };
  }
  if (/search|find/.test(t)) return { text: 'Opening Spotlight. Ctrl+Space also works.', run: () => actions.set({ overlay: 'spotlight' }) };
  if (/joke|funny/.test(t)) return { text: 'I tried to dock with the ISS, but my magnification was set to 300%. Now I can only see one solar panel.' };
  if (/who are you|what are you|about you/.test(t)) return { text: "I'm Rocky, your desktop AI companion. In the real build I live on your Windows desktop. Here I'm a scripted demo, so my answers are canned, but the actions I take are real inside this prototype." };
  if (/help|what can you do/.test(t)) return { text: 'Try: “open terminal”, “stealth theme”, “switch to windows mode”, “focus mode”, “how is my pc”, or “new wallpaper”.' };
  if (/^(hi|hey|hello|yo|sup)\b/.test(t)) return { text: 'Hey Cade 👋 Want me to open a project, switch the theme, or check the system?' };
  if (/hsp|rocket|orbit|space/.test(t)) return { text: 'Opening HSP Lab. Last commit touched orbit.js, so the Kepler solver should be right there.', run: () => actions.open('vscode', { title: 'HSP Lab — Visual Studio Code', props: { project: 'hsp' } }) };
  return { text: "That's beyond this demo's script. In the production build this would go to Rocky's real brain. Try “help” for things I can do here." };
}

const SUGGEST = ['Open Terminal', 'Stealth theme', 'How is my PC?', 'Focus mode'];

export default function Rocky() {
  const { state, actions } = useOS();
  const perf = usePerf();
  const [msgs, setMsgs] = useState([{ from: 'rocky', text: "Hi Cade, I'm Rocky. Ask me to open apps, change the theme, switch desktops, or check your system." }]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const list = useRef(null);
  const ctx = useRef();
  ctx.current = { actions, state, perf };

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [msgs, thinking]);

  if (!state.rocky) return null;
  const isWin = state.mode === 'windows';
  const d = state.dock;
  const bottom = isWin ? 60 : d.position === 'bottom' && !d.autoHide ? d.size + 34 : 16;
  const right = !isWin && d.position === 'right' && !d.autoHide ? d.size + 34 : 14;

  const send = (raw) => {
    const v = (raw ?? text).trim();
    if (!v || thinking) return;
    setText('');
    setMsgs((m) => [...m, { from: 'me', text: v }]);
    setThinking(true);
    setTimeout(() => {
      const r = reply(v, ctx.current);
      setMsgs((m) => [...m, { from: 'rocky', text: r.text, action: !!r.run }]);
      setThinking(false);
      if (r.run) setTimeout(r.run, 250);
    }, 650 + Math.random() * 500);
  };

  return (
    <div
      className="absolute z-[8400] w-[360px] h-[480px] flex flex-col glass-strong rounded-[var(--r-xl)] overflow-hidden a-popup"
      style={{ bottom, right }}
      role="dialog"
      aria-label="Rocky AI"
      onKeyDown={(e) => e.key === 'Escape' && actions.set({ rocky: false })}
    >
      <div className="flex items-center gap-3 pl-4 pr-2 h-14 shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
        <RockyOrb size={32} thinking={thinking} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">Rocky</div>
          <div className="flex items-center gap-1.5 text-[11px] text-t3" aria-live="polite">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(var(--ok))' }} />
            {thinking ? 'Thinking…' : 'Scripted demo · not connected to an AI service'}
          </div>
        </div>
        <IconButton label="Close Rocky" onClick={() => actions.set({ rocky: false })}>
          <X size={15} strokeWidth={1.75} />
        </IconButton>
      </div>
      <div ref={list} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] a-popup ${m.from === 'me' ? 'self-end' : 'self-start'}`}>
            <div
              className="rounded-[var(--r-lg)] px-3 py-2 text-[13px] leading-[1.5] selectable"
              style={m.from === 'me' ? { background: 'rgb(var(--acc))', color: 'var(--on-acc)', borderBottomRightRadius: 4 } : { background: 'var(--field)', borderBottomLeftRadius: 4 }}
            >
              {m.text}
            </div>
            {m.action && <div className="mt-1 text-[11px] text-t3">Done in the prototype</div>}
          </div>
        ))}
        {thinking && (
          <div className="self-start rounded-[var(--r-lg)] px-3 py-3 flex gap-1" style={{ background: 'var(--field)' }} aria-label="Rocky is typing">
            {[0, 1, 2].map((k) => (
              <span key={k} className="typing-dot w-1.5 h-1.5 rounded-full" style={{ background: 'var(--t2)', animationDelay: `${k * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>
      <div className="px-3 pb-2 flex flex-wrap gap-1.5">
        {SUGGEST.map((s) => (
          <button key={s} onClick={() => send(s)} className="h-7 rounded-full px-3 text-[12px] text-t2 hov" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="mx-3 mb-3 flex items-center gap-2 h-10 rounded-[var(--r-md)] pl-3 pr-1 field"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input id="rocky-input" aria-label="Message Rocky" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Rocky" className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-t3" autoComplete="off" />
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="w-8 h-8 grid place-items-center rounded-[var(--r-sm)]" style={{ background: text.trim() ? 'rgb(var(--acc))' : 'transparent', color: text.trim() ? 'var(--on-acc)' : 'var(--t3)', transition: 'background var(--d-fast), color var(--d-fast)' }}>
          <Send size={15} strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}

// The resting orb on the desktop. Click it to open the chat.
export function RockyCompanion() {
  const { state, actions } = useOS();
  if (state.rocky || fullscreenWindow(state)) return null;
  const isWin = state.mode === 'windows';
  const d = state.dock;
  const bottom = isWin ? 62 : d.position === 'bottom' && !d.autoHide ? 24 : 20;
  const right = !isWin && d.position === 'right' && !d.autoHide ? d.size + 40 : 22;
  return (
    <button aria-label="Open Rocky AI" onClick={() => actions.set({ rocky: true })} className="tip-host absolute z-[3700] chrome chrome-fade rounded-full press" style={{ bottom, right }}>
      <RockyOrb size={40} />
      <Tip side="left">Ask Rocky</Tip>
    </button>
  );
}
