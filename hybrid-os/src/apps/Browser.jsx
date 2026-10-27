import { useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Lock, Plus, X, Search, Star, ExternalLink, Home } from 'lucide-react';
import { useNow } from '../os/sim';

const TILES = [
  { name: 'GitHub', url: 'https://github.com', color: '#e6edf3' },
  { name: 'three.js docs', url: 'https://threejs.org/docs/', color: '#5ef0ff' },
  { name: 'MDN', url: 'https://developer.mozilla.org', color: '#7aa8ff' },
  { name: 'Blender Manual', url: 'https://docs.blender.org/manual/en/latest/', color: '#ffb44d' },
  { name: 'WinUI 3', url: 'https://learn.microsoft.com/windows/apps/winui/winui3/', color: '#56b4ff' },
  { name: 'Lucide icons', url: 'https://lucide.dev', color: '#ff7a9c' },
];

function NewTab({ go }) {
  const now = useNow(30000);
  const [q, setQ] = useState('');
  const h = now.getHours();
  return (
    <div className="h-full overflow-y-auto relative" style={{ background: 'radial-gradient(80% 70% at 50% 0%, rgba(80,120,255,.28), transparent 60%), linear-gradient(180deg, #0b1030, #070918)' }}>
      <div className="max-w-[620px] mx-auto pt-[9%] px-6 text-center">
        <div className="font-display text-[30px] font-light text-white">{h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, Cade</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            q.trim() && go({ kind: 'search', q });
          }}
          className="mt-6 flex items-center gap-3 h-[48px] rounded-full px-5 bg-white/10"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15), 0 10px 40px -10px rgba(80,140,255,.5)' }}
        >
          <Search size={18} className="text-white/60" />
          <input aria-label="Search the web" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the web" className="flex-1 bg-transparent outline-none text-white text-[14px] placeholder:text-white/40" />
        </form>
        <div className="mt-9 grid grid-cols-6 gap-3">
          {TILES.map((t) => (
            <button key={t.name} onClick={() => go({ kind: 'site', ...t })} className="flex flex-col items-center gap-2 p-2 rounded-[14px] hover:bg-white/10 press">
              <span className="w-12 h-12 rounded-[14px] grid place-items-center text-[18px] font-extrabold" style={{ background: `${t.color}22`, color: t.color, boxShadow: `inset 0 0 0 1px ${t.color}44` }}>
                {t.name[0]}
              </span>
              <span className="text-[11px] text-white/80 leading-tight">{t.name}</span>
            </button>
          ))}
        </div>
        <div className="mt-10 text-left rounded-[18px] p-4 bg-white/[.06]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/50 mb-2">Reading list</div>
          {['Orbital transfer windows, explained', 'Designing a dock that feels physical', 'WinUI 3: custom title bars and Mica'].map((r) => (
            <div key={r} className="flex items-center gap-2 py-1.5 text-[13px] text-white/85">
              <Star size={12} className="text-[#ffd36b]" /> {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Offline({ page, back }) {
  return (
    <div className="h-full grid place-items-center text-center px-8" style={{ background: 'linear-gradient(180deg, #0b1030, #070918)' }}>
      <div className="max-w-[420px]">
        {page.kind === 'search' ? (
          <>
            <div className="text-white text-[18px] font-semibold mb-2">Results for “{page.q}”</div>
            <p className="text-white/60 text-[13px]">Web search isn't wired up in the concept. The production shell would hand this to your real browser.</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-[16px] grid place-items-center text-[22px] font-extrabold" style={{ background: `${page.color}22`, color: page.color }}>
              {page.name[0]}
            </div>
            <div className="text-white text-[18px] font-semibold mb-2">{page.name}</div>
            <p className="text-white/60 text-[13px] mb-4">Live websites don't load inside this prototype. Open it in your real browser instead.</p>
            <a href={page.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-[#03121c]" style={{ background: 'linear-gradient(90deg, #5ef0ff, #8f7bff)' }}>
              Open {page.url.replace(/^https:\/\//, '').split('/')[0]} <ExternalLink size={13} />
            </a>
          </>
        )}
        <button onClick={back} className="block mx-auto mt-4 text-[12px] text-white/60 hover:text-white">
          Back to new tab
        </button>
      </div>
    </div>
  );
}

export default function Browser() {
  const [tabs, setTabs] = useState([{ id: 1, page: null }]);
  const [active, setActive] = useState(1);
  const tab = tabs.find((t) => t.id === active) || tabs[0];
  const setPage = (page) => setTabs((ts) => ts.map((t) => (t.id === tab.id ? { ...t, page } : t)));
  const title = (t) => (!t.page ? 'New tab' : t.page.kind === 'search' ? t.page.q : t.page.name);
  const url = !tab.page ? 'hybrid://newtab' : tab.page.kind === 'search' ? `search?q=${encodeURIComponent(tab.page.q)}` : tab.page.url;
  return (
    <div className="h-full flex flex-col text-[12.5px]" style={{ background: '#0a0d20', color: '#dfe6ff' }}>
      <div className="flex items-end gap-1 px-2 pt-1.5 h-[38px] shrink-0">
        {tabs.map((t) => (
          <div key={t.id} onClick={() => setActive(t.id)} className="flex items-center gap-2 h-[30px] w-[190px] px-3 rounded-t-[10px] cursor-pointer" style={{ background: t.id === tab.id ? '#141a38' : 'transparent', color: t.id === tab.id ? '#fff' : '#8a94bd' }}>
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: 'linear-gradient(135deg, #3be3c4, #1a6ae6)' }} />
            <span className="truncate flex-1">{title(t)}</span>
            {tabs.length > 1 && (
              <button
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  const rest = tabs.filter((x) => x.id !== t.id);
                  setTabs(rest);
                  if (t.id === active) setActive(rest[0].id);
                }}
                className="w-4 h-4 grid place-items-center rounded hover:bg-white/10"
              >
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        <button
          aria-label="New tab"
          onClick={() => {
            const id = Date.now();
            setTabs((ts) => [...ts, { id, page: null }]);
            setActive(id);
          }}
          className="w-7 h-7 mb-0.5 grid place-items-center rounded-[8px] hover:bg-white/10"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 px-2 h-[40px] shrink-0" style={{ background: '#141a38' }}>
        <button aria-label="Back" onClick={() => setPage(null)} className="w-7 h-7 grid place-items-center rounded-full hover:bg-white/10">
          <ArrowLeft size={15} />
        </button>
        <button aria-label="Forward" disabled className="w-7 h-7 grid place-items-center rounded-full opacity-40">
          <ArrowRight size={15} />
        </button>
        <button aria-label="Reload" className="w-7 h-7 grid place-items-center rounded-full hover:bg-white/10">
          <RotateCw size={14} />
        </button>
        <button aria-label="Home" onClick={() => setPage(null)} className="w-7 h-7 grid place-items-center rounded-full hover:bg-white/10">
          <Home size={14} />
        </button>
        <div className="flex-1 flex items-center gap-2 h-[28px] px-3 rounded-full bg-black/30 text-[12px] text-[#aeb8de]">
          <Lock size={11} /> {url}
        </div>
        <Star size={15} className="text-[#8a94bd] mx-1.5" />
      </div>
      <div className="flex-1 min-h-0">{tab.page ? <Offline page={tab.page} back={() => setPage(null)} /> : <NewTab go={setPage} />}</div>
    </div>
  );
}
