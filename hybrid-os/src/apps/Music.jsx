import { Home, Search, Library, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Heart, Clock, ListMusic } from 'lucide-react';
import { useOS } from '../os/store';
import { useMusic, fmtDur } from '../os/sim';
import { TRACKS } from '../os/data';
import { AlbumArt } from '../hybrid/Widgets';
import { Slider } from '../components/ui';
import { VolumeIcon } from '../hybrid/MenuBar';

export default function Music() {
  const m = useMusic();
  const { state, actions } = useOS();
  const t = m.track;
  return (
    <div className="h-full flex flex-col text-[13px] text-white" style={{ background: '#0b0d14' }}>
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[200px] shrink-0 p-3 flex flex-col gap-1" style={{ background: '#07080d' }}>
          {[
            [Home, 'Home'],
            [Search, 'Search'],
            [Library, 'Your Library'],
          ].map(([I, l], i) => (
            <div key={l} className={`flex items-center gap-3 px-2 py-2 rounded-[8px] font-semibold ${i === 2 ? 'text-white' : 'text-white/60'}`}>
              <I size={18} /> {l}
            </div>
          ))}
          <div className="mt-3 px-2 text-[11px] font-semibold text-white/40">Playlists</div>
          {['Night Drive — HYBRID Mix', 'Launch Window', 'Deep Focus', 'Liked Songs'].map((p, i) => (
            <div key={p} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] ${i === 0 ? 'bg-white/10' : 'text-white/60'}`}>
              <ListMusic size={14} /> <span className="truncate">{p}</span>
            </div>
          ))}
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto" style={{ background: `linear-gradient(180deg, ${t.art[1]}88, #0b0d14 320px)`, transition: 'background 800ms' }}>
          <div className="flex items-end gap-5 p-6 pb-5">
            <AlbumArt track={{ art: ['#4fe3ff', '#7a3cff', '#0b0f36'] }} size={150} />
            <div>
              <div className="text-[11px] font-semibold text-white/70">Playlist</div>
              <div className="text-[34px] font-semibold leading-tight">Night Drive — HYBRID Mix</div>
              <div className="text-white/70 text-[13px] mt-1">Cade · {TRACKS.length} songs · demo playlist, fictional artists</div>
            </div>
          </div>
          <div className="px-6 flex items-center gap-4 mb-3">
            <button aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.toggle} className="w-12 h-12 rounded-full grid place-items-center press" style={{ background: '#1ed760', color: '#000' }}>
              {m.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
            </button>
            <button aria-label="Shuffle" aria-pressed={m.shuffle} title="Shuffle" onClick={m.toggleShuffle} className={m.shuffle ? "text-[#1ed760]" : "text-white/60 hover:text-white"}><Shuffle size={20} /></button>
          </div>
          <table className="w-full mx-6 text-[13px]" style={{ width: 'calc(100% - 48px)' }}>
            <thead>
              <tr className="text-left text-white/50 text-[11px]" style={{ borderBottom: '1px solid rgba(255,255,255,.1)' }}>
                <th className="w-8 font-medium pb-2 pl-2">#</th>
                <th className="font-medium pb-2">Title</th>
                <th className="font-medium pb-2">Album</th>
                <th className="font-medium pb-2 text-right pr-3">
                  <Clock size={13} className="ml-auto" />
                </th>
              </tr>
            </thead>
            <tbody>
              {TRACKS.map((tr, i) => {
                const cur = i === m.i;
                return (
                  <tr key={tr.title} onDoubleClick={() => m.play(i)} onClick={() => m.play(i)} className="cursor-pointer hover:bg-white/5 group">
                    <td className="py-2 pl-2 rounded-l-[6px] tabular-nums" style={{ color: cur ? '#1ed760' : 'rgba(255,255,255,.5)' }}>
                      {cur && m.playing ? '♫' : i + 1}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-3">
                        <AlbumArt track={tr} size={36} />
                        <div>
                          <div className="font-semibold" style={{ color: cur ? '#1ed760' : '#fff' }}>
                            {tr.title}
                          </div>
                          <div className="text-white/55 text-[12px]">{tr.artist}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-white/55">{tr.album}</td>
                    <td className="text-right pr-3 text-white/55 tabular-nums rounded-r-[6px]">{fmtDur(tr.dur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </main>
      </div>
      <div className="h-[72px] shrink-0 flex items-center px-4 gap-4" style={{ background: '#07080d', borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <div className="w-[230px] flex items-center gap-3 min-w-0">
          <AlbumArt track={t} size={46} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{t.title}</div>
            <div className="text-[12px] text-white/55 truncate">{t.artist}</div>
          </div>
          <button aria-label="Like" onClick={() => m.like(m.i)}>
            <Heart size={15} className={m.liked[m.i] ? 'text-[#1ed760]' : 'text-white/50'} fill={m.liked[m.i] ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-center gap-5">
            <button aria-label="Shuffle" aria-pressed={m.shuffle} title="Shuffle" onClick={m.toggleShuffle} className={m.shuffle ? "text-[#1ed760]" : "text-white/50 hover:text-white"}><Shuffle size={15} /></button>
            <button aria-label="Previous" onClick={m.prev}>
              <SkipBack size={17} fill="currentColor" />
            </button>
            <button aria-label={m.playing ? 'Pause' : 'Play'} onClick={m.toggle} className="w-8 h-8 rounded-full bg-white text-black grid place-items-center press">
              {m.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
            </button>
            <button aria-label="Next" onClick={m.next}>
              <SkipForward size={17} fill="currentColor" />
            </button>
            <button aria-label="Repeat track" aria-pressed={m.repeat} title="Repeat track" onClick={m.toggleRepeat} className={m.repeat ? "text-[#1ed760]" : "text-white/50 hover:text-white"}><Repeat size={15} /></button>
          </div>
          <div className="w-full max-w-[420px] flex items-center gap-2 text-[11px] text-white/55 tabular-nums">
            {fmtDur(m.pos)}
            <div className="flex-1 h-1 rounded-full bg-white/15 cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); m.seek(Math.floor(((e.clientX - r.left) / r.width) * t.dur)); }}>
              <div className="h-full rounded-full bg-white" style={{ width: `${(m.pos / t.dur) * 100}%` }} />
            </div>
            {fmtDur(t.dur)}
          </div>
        </div>
        <div className="w-[170px] flex items-center gap-2" style={{ '--acc': '30 215 96', '--acc2': '30 215 96' }}>
          <VolumeIcon v={state.volume} />
          <Slider id="spotify-volume" label="Volume" value={state.volume} onChange={(v) => actions.set({ volume: v })} />
        </div>
      </div>
    </div>
  );
}
