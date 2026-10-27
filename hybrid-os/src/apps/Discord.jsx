import { useState, useRef, useEffect } from 'react';
import { Hash, Volume2, Plus, Smile, Gift, AtSign, Users, Bell, Pin, Mic, Headphones, Settings } from 'lucide-react';

const SERVERS = [
  ['HY', 'linear-gradient(135deg,#5ef0ff,#9b6bff)'],
  ['HS', 'linear-gradient(135deg,#ffb44d,#ff5f6d)'],
  ['3D', 'linear-gradient(135deg,#ff8a3d,#ffd36b)'],
  ['GD', 'linear-gradient(135deg,#34e2a0,#1f8bff)'],
];
const PEOPLE = {
  Nova: '#ff7ad9',
  Juno: '#5ef0ff',
  Pixel: '#ffd36b',
  Cade: '#9b6bff',
};
const INITIAL = [
  { who: 'Juno', at: '8:42 PM', text: 'pushed the new orbit solver to HSP Lab, Mun transfers are finally stable' },
  { who: 'Pixel', at: '8:44 PM', text: 'the rocket render v3 is in #screenshots, the plume shader is 🔥' },
  { who: 'Nova', at: '8:51 PM', text: 'cade is the HYBRID dock real or is it a concept' },
  { who: 'Cade', at: '8:53 PM', text: "concept for now, building the real one in WinUI next. mode switching is ctrl+alt+m 😏" },
  { who: 'Nova', at: '8:53 PM', text: 'ok that is actually sick' },
];
const REPLIES = ['no way 👀', 'ship it', 'that looks so clean', 'can it run on my second monitor', 'rocky approves', 'lmao', 'drop a screenshot'];

export default function Discord() {
  const [chan, setChan] = useState('hybrid-os');
  const [msgs, setMsgs] = useState(INITIAL);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(null);
  const list = useRef(null);
  useEffect(() => {
    list.current.scrollTop = list.current.scrollHeight;
  }, [msgs, typing]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setMsgs((m) => [...m, { who: 'Cade', at, text }]);
    setText('');
    const who = ['Nova', 'Juno', 'Pixel'][Math.floor(Math.random() * 3)];
    setTimeout(() => setTyping(who), 600);
    setTimeout(() => {
      setTyping(null);
      setMsgs((m) => [...m, { who, at, text: REPLIES[Math.floor(Math.random() * REPLIES.length)] }]);
    }, 2000);
  };

  return (
    <div className="h-full flex text-[13px] text-[#dbdee6]" style={{ background: '#1e2030' }}>
      <div className="w-[64px] shrink-0 flex flex-col items-center gap-2 py-3" style={{ background: '#141522' }}>
        {SERVERS.map(([n, bg], i) => (
          <div key={n} className="relative">
            {i === 0 && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r bg-white" />}
            <div className="w-11 h-11 grid place-items-center text-[13px] font-extrabold text-white" style={{ background: bg, borderRadius: i === 0 ? 14 : 22 }}>
              {n}
            </div>
          </div>
        ))}
        <div className="w-11 h-11 grid place-items-center rounded-full text-[#3ba55d]" style={{ background: '#262838' }}>
          <Plus size={20} />
        </div>
      </div>
      <div className="w-[210px] shrink-0 flex flex-col" style={{ background: '#191a28' }}>
        <div className="h-[44px] flex items-center px-4 font-bold text-white shadow-[0_1px_0_rgba(0,0,0,.3)]">HYBRID Collective</div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <div className="px-2 pb-1 text-[11px] font-bold uppercase text-[#8a8fa8]">Text channels</div>
          {['general', 'hybrid-os', 'hsp-dev', 'rocky-ai', 'screenshots'].map((c) => (
            <button key={c} onClick={() => setChan(c)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-[6px] text-left" style={{ background: chan === c ? '#2c2e44' : undefined, color: chan === c ? '#fff' : '#8a8fa8' }}>
              <Hash size={16} /> {c}
            </button>
          ))}
          <div className="px-2 pt-4 pb-1 text-[11px] font-bold uppercase text-[#8a8fa8]">Voice</div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[#8a8fa8]">
            <Volume2 size={16} /> Launch Control
          </div>
          <div className="ml-7 flex items-center gap-2 py-1 text-[12px]">
            <span className="w-5 h-5 rounded-full" style={{ background: PEOPLE.Juno, boxShadow: '0 0 0 2px #3ba55d' }} /> Juno
          </div>
        </div>
        <div className="h-[52px] flex items-center gap-2 px-2" style={{ background: '#141522' }}>
          <span className="w-8 h-8 rounded-full grid place-items-center text-white font-bold" style={{ background: PEOPLE.Cade }}>
            C
          </span>
          <span className="flex-1 leading-tight">
            <span className="block text-white text-[12.5px] font-semibold">Cade</span>
            <span className="block text-[11px] text-[#8a8fa8]">building HYBRID</span>
          </span>
          <Mic size={15} className="text-[#b5bac7]" />
          <Headphones size={15} className="text-[#b5bac7]" />
          <Settings size={15} className="text-[#b5bac7]" />
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-[44px] shrink-0 flex items-center gap-2 px-4 shadow-[0_1px_0_rgba(0,0,0,.3)]">
          <Hash size={18} className="text-[#8a8fa8]" />
          <span className="font-bold text-white">{chan}</span>
          <span className="ml-auto flex gap-4 text-[#b5bac7]">
            <Bell size={17} />
            <Pin size={17} />
            <Users size={17} />
          </span>
        </div>
        <div ref={list} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3.5">
          {chan !== 'hybrid-os' && <div className="text-center text-[12px] text-[#8a8fa8] py-2">Showing #hybrid-os history (demo channel)</div>}
          {msgs.map((m, i) => (
            <div key={i} className="flex gap-3 selectable">
              <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center text-white font-bold" style={{ background: PEOPLE[m.who] }}>
                {m.who[0]}
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold" style={{ color: PEOPLE[m.who] }}>
                    {m.who}
                  </span>
                  <span className="text-[11px] text-[#7a7f98]">Today at {m.at}</span>
                </div>
                <div className="text-[#dbdee6] leading-snug">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="h-[20px] px-4 text-[11.5px] text-[#b5bac7]">{typing && <span><b>{typing}</b> is typing…</span>}</div>
        <form onSubmit={send} className="mx-4 mb-4 flex items-center gap-3 h-[44px] px-4 rounded-[10px]" style={{ background: '#2a2c3e' }}>
          <Plus size={18} className="text-[#b5bac7]" />
          <input aria-label={`Message #${chan}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message #${chan}`} className="flex-1 bg-transparent outline-none text-[#dbdee6] placeholder:text-[#7a7f98]" />
          <Gift size={18} className="text-[#b5bac7]" />
          <AtSign size={18} className="text-[#b5bac7]" />
          <Smile size={18} className="text-[#b5bac7]" />
        </form>
      </div>
    </div>
  );
}
