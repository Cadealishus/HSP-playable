import { useEffect, useState } from 'react';
import { Image as ImageIcon, Palette, LayoutDashboard, TerminalSquare, Monitor, StickyNote, RefreshCw, Settings as SettingsIcon, FolderOpen } from 'lucide-react';
import { useOS } from '../os/store';
import { THEMES, WALLPAPERS, themeVars } from '../os/themes';
import Wallpaper from '../components/Wallpaper';
import MenuBar from '../hybrid/MenuBar';
import Dock from '../hybrid/Dock';
import Widgets from '../hybrid/Widgets';
import Launcher from '../hybrid/Launcher';
import WindowLayer from './WindowLayer';
import Spotlight from './Spotlight';
import ControlCenter from './ControlCenter';
import Rocky, { RockyCompanion } from './Rocky';
import { ContextMenuLayer, Toasts, ModeSwitchFX, Boot, LockScreen } from './Overlays';
import Taskbar from '../windows/Taskbar';
import { StartMenu, QuickSettings, WinCalendar } from '../windows/StartMenu';
import DesktopIcons from '../windows/DesktopIcons';

export default function Desktop({ W, H }) {
  const { state, actions } = useOS();
  const [booting, setBooting] = useState(true);
  const hybrid = state.mode === 'hybrid';
  const wallpaper = hybrid ? state.wallpaper : THEMES[state.theme].dark ? 'bloom-dark' : 'bloom-light';

  // Global shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey && e.altKey && k === 'm') {
        e.preventDefault();
        return actions.switchMode();
      }
      if (e.ctrlKey && (e.code === 'Space' || k === 'k')) {
        e.preventDefault();
        return actions.toggleOverlay('spotlight');
      }
      if (e.ctrlKey && k === 'escape') {
        e.preventDefault();
        return actions.toggleOverlay(actions.get().mode === 'windows' ? 'start' : 'launcher');
      }
      if (k === 'escape') {
        const s = actions.get();
        if (s.ctx) return actions.set({ ctx: null });
        if (s.overlay && s.overlay !== 'lock') return actions.set({ overlay: null });
      }
    };
    const reboot = () => setBooting(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hybrid:reboot', reboot);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hybrid:reboot', reboot);
    };
  }, []);

  // First-run hint
  useEffect(() => {
    const t = setTimeout(() => actions.notify({ title: 'Welcome to HYBRID OS', body: 'Ctrl+Space to search · Ctrl+Alt+M to switch desktops · right-click the desktop for more.', ttl: 7000 }), 1900);
    const d = setTimeout(() => actions.notify({ title: 'Nova in #hybrid-os', body: 'that dock magnification is unreal 👀 ship it', app: 'discord', ttl: 6000 }), 26000);
    return () => {
      clearTimeout(t);
      clearTimeout(d);
    };
  }, []);

  const desktopMenu = (e) => {
    if (e.target !== e.currentTarget) return;
    if (hybrid)
      actions.contextMenu(e, [
        { label: 'New Quick Note', icon: StickyNote, onClick: () => { actions.set({ showWidgets: true }); actions.setWidgets({ notes: true }); setTimeout(() => document.getElementById('quick-notes')?.focus(), 60); } },
        { label: 'Open Terminal Here', icon: TerminalSquare, onClick: () => actions.open('terminal') },
        { label: 'Open File Explorer', icon: FolderOpen, onClick: () => actions.open('explorer') },
        '-',
        { label: 'Change Wallpaper', icon: ImageIcon, items: WALLPAPERS.map((w) => ({ label: w.name, checked: state.wallpaper === w.id, onClick: () => actions.set({ wallpaper: w.id }) })) },
        { label: 'Theme', icon: Palette, items: Object.keys(THEMES).map((t) => ({ label: THEMES[t].name, checked: state.theme === t, onClick: () => actions.setTheme(t) })) },
        { label: state.showWidgets ? 'Hide Widgets' : 'Show Widgets', icon: LayoutDashboard, onClick: () => actions.set({ showWidgets: !state.showWidgets }) },
        { label: 'Reset Widget Layout', onClick: () => actions.set({ widgetPos: {} }) },
        '-',
        { label: 'Switch to Windows Desktop', icon: Monitor, shortcut: 'Ctrl+Alt+M', onClick: () => actions.switchMode('windows') },
        { label: 'HYBRID Settings…', icon: SettingsIcon, onClick: () => actions.open('settings') },
      ]);
    else
      actions.contextMenu(e, [
        { label: 'View', items: [{ label: 'Large icons' }, { label: 'Medium icons', checked: true }, { label: 'Small icons' }] },
        { label: 'Sort by', items: [{ label: 'Name', checked: true }, { label: 'Date modified' }, { label: 'Type' }] },
        { label: 'Refresh', icon: RefreshCw, onClick: () => actions.notify({ title: 'Desktop refreshed', app: 'explorer', ttl: 2000 }) },
        '-',
        { label: 'Open in Terminal', icon: TerminalSquare, onClick: () => actions.open('terminal') },
        { label: 'Personalize', icon: Palette, onClick: () => actions.open('settings') },
        '-',
        { label: 'Switch to HYBRID OS', icon: Monitor, shortcut: 'Ctrl+Alt+M', onClick: () => actions.switchMode('hybrid') },
      ]);
  };

  return (
    <div
      className={`os absolute inset-0 overflow-clip ${state.motion === 0 ? 'no-motion' : ''}`}
      data-mode={state.mode}
      data-switch={state.switching || undefined}
      style={themeVars(state)}
    >
      <Wallpaper id={wallpaper} W={W} H={H} motion={Math.min(1, state.motion / 50)} />
      <div className="absolute inset-0 z-0" onContextMenu={desktopMenu} onPointerDown={(e) => e.target === e.currentTarget && state.focused && actions.set({ focused: null })} />

      {hybrid ? <Widgets key="w-h" /> : <DesktopIcons key="w-w" onMenu={desktopMenu} />}
      <WindowLayer />
      {hybrid ? (
        <>
          <MenuBar key="mb" />
          <Dock key="dock" />
          <Launcher />
        </>
      ) : (
        <>
          <Taskbar key="tb" />
          <StartMenu />
          <QuickSettings />
          <WinCalendar />
        </>
      )}
      <RockyCompanion />
      <Rocky />
      <Spotlight />
      <ControlCenter />
      <Toasts />
      <ContextMenuLayer />
      <ModeSwitchFX />
      <LockScreen />

      {/* Display simulation: brightness + night light */}
      <div className="absolute inset-0 z-[9900] pointer-events-none" style={{ background: '#000', opacity: (1 - state.brightness / 100) * 0.72, transition: 'opacity 200ms' }} />
      <div className="absolute inset-0 z-[9901] pointer-events-none" style={{ background: 'rgb(255,150,60)', mixBlendMode: 'multiply', opacity: state.nightLight ? 0.22 : 0, transition: 'opacity 600ms' }} />
      {booting && <Boot onDone={() => setBooting(false)} />}
    </div>
  );
}
