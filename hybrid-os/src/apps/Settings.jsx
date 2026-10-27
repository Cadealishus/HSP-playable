import { useState } from 'react';
import { Palette, Image as ImageIcon, PanelBottom, Monitor, LayoutDashboard, Info, Search, Bell } from 'lucide-react';
import { useOS } from '../os/store';
import { THEMES } from '../os/themes';
import { ThemePicker, WallpaperPicker, AccentPicker, AppearanceSliders, DockControls } from '../components/SettingsParts';
import { Toggle, Segmented, HybridLogo, Kbd, SectionLabel } from '../components/ui';
import { WIDGET_NAMES } from '../hybrid/Widgets';
import { WinLogo } from '../shell/Overlays';

const PAGES = [
  ['appearance', 'Appearance', Palette],
  ['wallpaper', 'Wallpaper', ImageIcon],
  ['dock', 'Dock', PanelBottom],
  ['modes', 'Desktop Modes', Monitor],
  ['widgets', 'Widgets', LayoutDashboard],
  ['notifications', 'Notifications', Bell],
  ['about', 'About', Info],
];

function Row({ title, sub, children }) {
  return (
    <div className="flex items-center gap-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold">{title}</div>
        {sub && <div className="text-[11.5px] text-t3 mt-0.5">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Panel({ children }) {
  return (
    <div className="rounded-[16px] p-4 mb-4" style={{ background: 'var(--field)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
      {children}
    </div>
  );
}

export default function Settings({ page: initial }) {
  const { state, actions } = useOS();
  const [page, setPage] = useState(initial || 'appearance');
  const [q, setQ] = useState('');
  const pages = PAGES.filter(([, label]) => !q || label.toLowerCase().includes(q.toLowerCase()));
  const title = PAGES.find((p) => p[0] === page)[1];

  return (
    <div className="h-full flex text-[13px]">
      <aside className="w-[210px] shrink-0 p-3 flex flex-col gap-1" style={{ borderRight: '1px solid var(--line)', background: 'rgb(var(--glass) / .25)' }}>
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <span className="w-9 h-9 rounded-full grid place-items-center text-[14px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #5ef0ff, #9b6bff)' }}>
            C
          </span>
          <span>
            <span className="block font-bold">Cade</span>
            <span className="block text-[11px] text-t3">Local account</span>
          </span>
        </div>
        <div className="flex items-center gap-2 h-[30px] px-2.5 mb-2 rounded-[9px] field">
          <Search size={13} className="text-t3" />
          <input aria-label="Find a setting" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a setting" className="flex-1 min-w-0 bg-transparent outline-none text-[12px] placeholder:text-t3" />
        </div>
        {pages.map(([id, label, I]) => (
          <button key={id} onClick={() => setPage(id)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-left hov font-medium" style={page === id ? { background: 'rgb(var(--acc) / .16)', boxShadow: 'inset 0 0 0 1px rgb(var(--acc) / .3)' } : undefined}>
            <I size={15} className={page === id ? 'text-acc' : 'text-t2'} />
            {label}
          </button>
        ))}
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto px-7 py-6">
        <h1 key={page} className="font-display text-[24px] font-semibold mb-5 a-pop">{title}</h1>

        {page === 'appearance' && (
          <>
            <Panel>
              <SectionLabel>Theme</SectionLabel>
              <ThemePicker />
            </Panel>
            <Panel>
              <SectionLabel>Accent color</SectionLabel>
              <AccentPicker />
              <div className="mt-4">
                <AppearanceSliders idPrefix="st" />
              </div>
            </Panel>
            <Panel>
              <Row title="Dark mode" sub={`Toggles between Daylight and ${THEMES[state.lastDark || 'aurora'].name}`}>
                <Toggle id="st-dark" label="Dark mode" on={THEMES[state.theme].dark} onChange={() => actions.toggleDark()} />
              </Row>
              <Row title="Night light" sub="Warms the display (simulated tint)">
                <Toggle id="st-night" label="Night light" on={state.nightLight} onChange={(v) => actions.set({ nightLight: v })} />
              </Row>
            </Panel>
          </>
        )}

        {page === 'wallpaper' && (
          <Panel>
            <SectionLabel>HYBRID wallpapers · generated live, no image files</SectionLabel>
            <WallpaperPicker cols={2} />
          </Panel>
        )}

        {page === 'dock' && (
          <Panel>
            <DockControls idPrefix="st" />
            <p className="mt-3 text-[11.5px] text-t3">Hover the dock to feel the magnification change. Right-click any dock icon for app options.</p>
          </Panel>
        )}

        {page === 'modes' && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                ['hybrid', 'HYBRID', 'Menu bar, floating dock, widgets, Spotlight', <HybridLogo key="h" size={26} />],
                ['windows', 'Windows', 'Taskbar, Start menu, desktop shortcuts', <WinLogo key="w" size={22} />],
              ].map(([id, name, sub, logo]) => {
                const on = state.mode === id;
                return (
                  <button key={id} onClick={() => actions.switchMode(id)} className="text-left rounded-[16px] p-4 press" style={{ background: on ? 'rgb(var(--acc) / .14)' : 'var(--field)', boxShadow: on ? 'inset 0 0 0 1.5px rgb(var(--acc) / .6)' : 'inset 0 0 0 1px var(--line)' }}>
                    <div className="flex items-center justify-between mb-3">
                      {logo}
                      {on && <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-acc">Active</span>}
                    </div>
                    <div className="font-display text-[16px] font-semibold">{name}</div>
                    <div className="text-[11.5px] text-t3 mt-0.5">{sub}</div>
                  </button>
                );
              })}
            </div>
            <Panel>
              <Row title="Switch shortcut" sub="Works from anywhere in the prototype">
                <span className="flex gap-1">
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Alt</Kbd>
                  <Kbd>M</Kbd>
                </span>
              </Row>
              <Row title="Start up in" sub="Mode used when the prototype loads">
                <div className="w-[200px]">
                  <Segmented
                    size="sm"
                    value={state.startupMode}
                    onChange={(v) => actions.set({ startupMode: v })}
                    options={[
                      { id: 'hybrid', label: 'HYBRID' },
                      { id: 'windows', label: 'Windows' },
                    ]}
                  />
                </div>
              </Row>
              <Row title="Transition" sub="How the desktop changes over">
                <div className="w-[200px]">
                  <Segmented
                    size="sm"
                    value={state.transition}
                    onChange={(v) => actions.set({ transition: v })}
                    options={[
                      { id: 'cinematic', label: 'Cinematic' },
                      { id: 'fast', label: 'Fast' },
                    ]}
                  />
                </div>
              </Row>
              <Row title="Show mode label" sub="Brief banner naming the new desktop">
                <Toggle id="st-label" label="Show mode label" on={state.modeLabel} onChange={(v) => actions.set({ modeLabel: v })} />
              </Row>
            </Panel>
            <p className="text-[11.5px] text-t3">This concept never changes real Windows settings. In the production app, the switch will swap the shell UI while Windows keeps running underneath.</p>
          </>
        )}

        {page === 'widgets' && (
          <Panel>
            <Row title="Show widgets on the desktop" sub="Drag widgets anywhere to rearrange them">
              <Toggle id="st-widgets" label="Show widgets" on={state.showWidgets} onChange={(v) => actions.set({ showWidgets: v })} />
            </Row>
            {Object.entries(WIDGET_NAMES).map(([id, name]) => (
              <Row key={id} title={name}>
                <Toggle id={`st-w-${id}`} label={name} on={state.widgets[id]} onChange={(v) => actions.setWidgets({ [id]: v })} />
              </Row>
            ))}
            <div className="pt-3">
              <button onClick={() => actions.set({ widgetPos: {} })} className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold field hov press">
                Reset widget layout
              </button>
            </div>
          </Panel>
        )}

        {page === 'notifications' && (
          <Panel>
            <Row title="Focus mode" sub="Silences notifications and dims widgets">
              <Toggle id="st-focus" label="Focus mode" on={state.focus} onChange={(v) => actions.set({ focus: v })} />
            </Row>
            <Row title="Send a test notification">
              <button onClick={() => actions.notify({ title: 'Test notification', body: 'Notifications slide in from the corner and dismiss themselves.', app: 'settings', force: true })} className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold field hov press">
                Send
              </button>
            </Row>
          </Panel>
        )}

        {page === 'about' && (
          <Panel>
            <div className="flex items-center gap-4 mb-4">
              <HybridLogo size={48} glow />
              <div>
                <div className="font-display text-[18px] font-semibold tracking-[0.06em]">HYBRID OS</div>
                <div className="text-[12px] text-t2">Concept 0.9 “Aurora” · interactive prototype</div>
              </div>
            </div>
            <Row title="What is real here" sub="Window management, dock, search, themes, mode switching and all settings work inside the prototype." />
            <Row title="What is simulated" sub="Files, performance numbers, weather, music, Discord, the browser and Rocky's replies. Nothing touches your PC." />
            <Row title="Reset everything" sub="Restore default settings">
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('hybrid-os:v1');
                  } catch {}
                  location.reload();
                }}
                className="rounded-[10px] px-3 py-1.5 text-[12px] font-semibold field hov press"
              >
                Reset
              </button>
            </Row>
          </Panel>
        )}
      </main>
    </div>
  );
}
