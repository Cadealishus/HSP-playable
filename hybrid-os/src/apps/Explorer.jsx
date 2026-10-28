import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Home, Monitor, FileText, Download, FolderGit2, Image as ImageIcon, Music, Video, HardDrive, Cloud, LayoutGrid, List, Search, Trash2, Clock } from 'lucide-react';
import { useOS } from '../os/store';
import { nodeAt, RECENT_FILES, allFiles, FS } from '../os/data';
import { fileIcon, openFile } from '../os/search';

const SIDEBAR = [
  { header: 'Favorites' },
  { label: 'Home', icon: Home, path: [] },
  { label: 'Recent', icon: Clock, path: ['__recent'] },
  { label: 'Desktop', icon: Monitor, path: ['Desktop'] },
  { label: 'Documents', icon: FileText, path: ['Documents'] },
  { label: 'Downloads', icon: Download, path: ['Downloads'] },
  { label: 'Projects', icon: FolderGit2, path: ['Projects'] },
  { label: 'Pictures', icon: ImageIcon, path: ['Pictures'] },
  { label: 'Music', icon: Music, path: ['Music'] },
  { label: 'Videos', icon: Video, path: ['Videos'] },
  { header: 'Locations' },
  { label: 'HYBRID SSD', icon: HardDrive, path: [], meta: '1.2 TB free' },
  { label: 'Cloud Drive', icon: Cloud, path: ['Documents'], meta: 'Synced' },
  { label: 'Recycle Bin', icon: Trash2, path: ['__bin'] },
];
const TAGS = [
  ['Rocket stuff', '#ff9d42'],
  ['HYBRID', '#5ef0ff'],
  ['Rocky', '#a47cff'],
];

const FOLDER_COLORS = { Projects: '#7aa8ff', Pictures: '#ff8fc7', Music: '#5ce59a', Videos: '#ffb35c', Downloads: '#6fe0ff' };

function FolderGlyph({ size = 52, name }) {
  const c = FOLDER_COLORS[name] || '#ffd36b';
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 52 42" aria-hidden="true">
      <path d="M3 6a3 3 0 0 1 3-3h13l4 4h23a3 3 0 0 1 3 3v3H3z" fill={c} opacity=".75" />
      <rect x="3" y="10" width="46" height="30" rx="4" fill={c} />
      <rect x="3" y="10" width="46" height="8" rx="4" fill="#fff" opacity=".22" />
    </svg>
  );
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function Explorer({ path: initial = [], select, nonce }) {
  const { actions } = useOS();
  const [hist, setHist] = useState({ list: [initial], i: 0 });
  const [view, setView] = useState('grid');
  const [sel, setSel] = useState(select || null);
  const [q, setQ] = useState('');
  const path = hist.list[hist.i];

  useEffect(() => {
    if (nonce) go(initial);
    if (select) setSel(select);
  }, [nonce]);

  const go = (p) => {
    if (same(p, path)) return;
    setHist((h) => ({ list: [...h.list.slice(0, h.i + 1), p], i: h.i + 1 }));
    setSel(null);
    setQ('');
  };
  const special = path[0] === '__recent' ? 'recent' : path[0] === '__bin' ? 'bin' : null;
  const node = special ? null : nodeAt(path);
  let items = special === 'recent' ? RECENT_FILES.map((r) => ({ ...(allFiles().find((f) => f.name === r.name) || {}), when: r.when })) : special === 'bin' ? [] : node ? node.children : [];
  if (q) items = (special ? items : allFiles().filter((f) => [...f.path].join('/').startsWith(path.join('/')))).filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  const open = (f) => {
    if (f.type === 'folder') go([...(f.path || path), f.name]);
    else openFile(actions, { ...f, path: f.path || path });
  };
  const crumbs = special ? [{ label: special === 'recent' ? 'Recent' : 'Recycle Bin', p: path }] : [{ label: 'Home', p: [] }, ...path.map((seg, i) => ({ label: seg, p: path.slice(0, i + 1) }))];

  return (
    <div className="h-full flex text-[13px]">
      {/* Sidebar */}
      <aside className="w-[188px] shrink-0 overflow-y-auto px-2 py-2" style={{ borderRight: '1px solid var(--line)', background: 'rgb(var(--surface) / .25)' }}>
        {SIDEBAR.map((s, i) =>
          s.header ? (
            <div key={i} className="px-2.5 pt-3 pb-1 text-[12px] font-medium text-t3">{s.header}</div>
          ) : (
            <button key={i} onClick={() => go(s.path)} className="w-full flex items-center gap-2.5 px-2.5 py-[6px] rounded-[var(--r-sm)] text-left hov" style={same(s.path, path) && s.label !== 'HYBRID SSD' && s.label !== 'Cloud Drive' ? { background: 'rgb(var(--acc) / .16)', color: 'var(--t1)' } : undefined}>
              <s.icon size={15} className={same(s.path, path) ? 'text-acc' : 'text-t2'} />
              <span className="flex-1 truncate font-medium">{s.label}</span>
              {s.meta && <span className="text-[11px] text-t3">{s.meta}</span>}
            </button>
          )
        )}
        <div className="px-2.5 pt-3 pb-1 text-[12px] font-medium text-t3">Tags</div>
        {TAGS.map(([t, c]) => (
          <div key={t} className="flex items-center gap-2.5 px-2.5 py-[5px] text-t2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c}} />
            {t}
          </div>
        ))}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 px-3 h-[46px] shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <button aria-label="Back" disabled={hist.i === 0} onClick={() => setHist((h) => ({ ...h, i: h.i - 1 }))} className="w-7 h-7 grid place-items-center rounded-[var(--r-sm)] hov disabled:opacity-30">
            <ArrowLeft size={15} />
          </button>
          <button aria-label="Forward" disabled={hist.i >= hist.list.length - 1} onClick={() => setHist((h) => ({ ...h, i: h.i + 1 }))} className="w-7 h-7 grid place-items-center rounded-[var(--r-sm)] hov disabled:opacity-30">
            <ArrowRight size={15} />
          </button>
          <button aria-label="Up" disabled={!path.length} onClick={() => go(special ? [] : path.slice(0, -1))} className="w-7 h-7 grid place-items-center rounded-[var(--r-sm)] hov disabled:opacity-30">
            <ArrowUp size={15} />
          </button>
          <nav aria-label="Breadcrumb" className="flex-1 min-w-0 flex items-center gap-0.5 h-[30px] px-2 rounded-[var(--r-md)] field overflow-hidden">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-0.5 min-w-0">
                {i > 0 && <ChevronRight size={13} className="text-t3 shrink-0" />}
                <button onClick={() => go(c.p)} className={`px-1.5 py-0.5 rounded-[var(--r-sm)] hov truncate ${i === crumbs.length - 1 ? 'font-semibold' : 'text-t2'}`}>
                  {c.label}
                </button>
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 h-[30px] w-[170px] px-2.5 rounded-[var(--r-md)] field">
            <Search size={13} className="text-t3" />
            <input aria-label="Search this folder" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${crumbs[crumbs.length - 1].label}`} className="flex-1 min-w-0 bg-transparent outline-none text-[12px] placeholder:text-t3" />
          </div>
          <div className="flex rounded-[var(--r-md)] p-[2px] field">
            {[
              ['grid', LayoutGrid],
              ['list', List],
            ].map(([v, I]) => (
              <button key={v} aria-label={`${v} view`} onClick={() => setView(v)} className="w-7 h-[24px] grid place-items-center rounded-[var(--r-sm)]" style={view === v ? { background: 'rgb(var(--acc) / .2)', color: 'rgb(var(--acc))' } : { color: 'var(--t2)' }}>
                <I size={14} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          {!special && !path.length && !q && (
            <section className="mb-5">
              <div className="text-[12px] font-medium text-t3 mb-2">Recent</div>
              <div className="grid grid-cols-3 gap-2.5">
                {RECENT_FILES.slice(0, 3).map((r) => {
                  const I = fileIcon(r.name);
                  return (
                    <button key={r.name} onDoubleClick={() => openFile(actions, { name: r.name, path: r.path })} onClick={() => setSel(r.name)} className="flex items-center gap-2.5 p-2.5 rounded-[var(--r-lg)] text-left field hov">
                      <span className="w-9 h-9 grid place-items-center rounded-[var(--r-md)]" style={{ background: 'rgb(var(--acc) / .14)' }}>
                        <I size={18} className="text-acc" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold truncate text-[13px]">{r.name}</span>
                        <span className="block text-[11px] text-t3 truncate">{r.path.join(' › ')} · {r.when}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] font-medium text-t3 mt-5">Folders</div>
            </section>
          )}
          {items.length === 0 && (
            <div className="h-[70%] grid place-items-center text-t3 text-center">
              <div>
                {special === 'bin' ? <Trash2 size={36} className="mx-auto mb-2 opacity-60" /> : null}
                {special === 'bin' ? 'Recycle Bin is empty' : q ? `Nothing matches “${q}”` : 'This folder is empty'}
              </div>
            </div>
          )}
          {view === 'grid' ? (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
              {items.map((f) => {
                const I = fileIcon(f.name, f.type === 'folder');
                const on = sel === f.name;
                return (
                  <button key={f.name + (f.path || []).join()} onClick={() => setSel(f.name)} onDoubleClick={() => open(f)} className="flex flex-col items-center gap-1.5 p-2.5 rounded-[var(--r-lg)]" style={{ background: on ? 'rgb(var(--acc) / .16)' : undefined, boxShadow: on ? 'inset 0 0 0 1px rgb(var(--acc) / .4)' : 'none' }} title={f.name}>
                    <div className="h-[46px] grid place-items-center">
                      {f.type === 'folder' ? (
                        <FolderGlyph name={f.name} />
                      ) : (
                        <span className="relative w-[38px] h-[46px] grid place-items-center rounded-[var(--r-sm)]" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,.95), rgba(220,230,250,.85))', boxShadow: '0 4px 10px -4px rgba(0,0,0,.4)' }}>
                          <I size={18} className="text-[#2a5bd7]" />
                          <span className="absolute bottom-1 text-[7.5px] font-semibold uppercase text-[#5a6a8a]">{f.name.split('.').pop()}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] text-center leading-tight line-clamp-2 break-all">{f.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            items.length > 0 && (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-t3 text-[11px]">
                    <th className="font-semibold pb-1.5 pl-2">Name</th>
                    <th className="font-semibold pb-1.5">Modified</th>
                    <th className="font-semibold pb-1.5 text-right pr-2">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => {
                    const I = fileIcon(f.name, f.type === 'folder');
                    const on = sel === f.name;
                    return (
                      <tr key={f.name + (f.path || []).join()} onClick={() => setSel(f.name)} onDoubleClick={() => open(f)} className="cursor-default" style={{ background: on ? 'rgb(var(--acc) / .16)' : undefined }}>
                        <td className="py-1.5 pl-2 rounded-l-[8px]">
                          <span className="flex items-center gap-2.5">
                            <I size={15} className={f.type === 'folder' ? 'text-[#ffd36b]' : 'text-acc'} />
                            {f.name}
                          </span>
                        </td>
                        <td className="text-t2">{f.when || f.modified || '—'}</td>
                        <td className="text-right pr-2 text-t2 tabular-nums rounded-r-[8px]">{f.type === 'folder' ? `${f.children.length} items` : f.size}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}
        </div>
        <div className="h-[28px] shrink-0 flex items-center px-4 text-[11px] text-t3" style={{ borderTop: '1px solid var(--line)' }}>
          {items.length} items{sel ? ' · 1 selected' : ''} · Simulated file system
        </div>
      </div>
    </div>
  );
}
